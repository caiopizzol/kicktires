import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { rejects } from "node:assert/strict";
import { join } from "node:path";
import { z } from "zod";
import { expect, test } from "bun:test";
import { codexModel, proposedResponse } from "../src/codex-model.ts";
import { assertCodexHome, incompleteTurnMessage } from "../src/codex.ts";
import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";

const options: LanguageModelV4CallOptions = {
  prompt: [],
  tools: [
    {
      type: "function",
      name: "run_checks",
      inputSchema: {
        type: "object",
        properties: { revision: { enum: ["base", "head"] } },
        required: ["revision"],
        additionalProperties: false,
      },
    },
  ],
};
test("Codex proposals become fresh runtime calls, never evidence results", () => {
  const proposal = JSON.stringify({
    toolCalls: [{ name: "run_checks", input: { revision: "head" } }],
    text: "",
  });
  const result = proposedResponse(proposal, options);
  expect(result.finishReason.unified).toBe("tool-calls");
  expect(result.content[0]).toMatchObject({
    type: "tool-call",
    toolName: "run_checks",
    input: '{"revision":"head"}',
  });
  expect(result.content[0]).not.toEqual(proposedResponse(proposal, options).content[0]);
});
test("Codex proposals reject unavailable tools, invalid arguments and forged result fields", () => {
  for (const call of [
    { name: "host_shell", input: "{}" },
    { name: "run_checks", input: { revision: "other" } },
    { name: "run_checks", input: { revision: "head" }, output: { exitCode: 0 } },
  ])
    expect(() =>
      proposedResponse(JSON.stringify({ toolCalls: [call], text: "" }), options),
    ).toThrow();
  expect(() =>
    proposedResponse('{"toolCalls":[],"text":"not json"}', {
      ...options,
      responseFormat: { type: "json", schema: { type: "object" } },
    }),
  ).toThrow();
  expect(() =>
    proposedResponse('{"toolCalls":[],"text":"done"}', {
      ...options,
      toolChoice: { type: "required" },
    }),
  ).toThrow();
});
test("Codex requires an explicit dedicated login home", () => {
  expect(() => assertCodexHome(undefined)).toThrow("absolute");
  expect(() => assertCodexHome("relative")).toThrow("absolute");
});

test("failed turn diagnostics retain protocol status and code without provider text", () => {
  expect(
    incompleteTurnMessage({ status: "failed", error: { codexErrorInfo: "usageLimitExceeded" } }),
  ).toContain("status: failed, code: usageLimitExceeded");
  expect(
    incompleteTurnMessage({
      status: "failed",
      error: { codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 502 } } },
    }),
  ).toContain("code: responseStreamDisconnected");
  expect(incompleteTurnMessage({ status: "completed", error: null })).toContain(
    "status: completed, code: unknown",
  );
  expect(
    incompleteTurnMessage({ status: "private provider text", error: { codexErrorInfo: "secret" } }),
  ).toContain("status: unknown, code: unknown");
});

test("Codex corrects one invalid proposal atomically and counts both attempts", async () => {
  const previous = process.env.KICKTIRES_CODEX_CLI;
  process.env.KICKTIRES_CODEX_CLI = "test";
  try {
    const command = "printf '%s\\n' '{\"quoted\":true}'\n# browser source can contain quotes";
    const prompts: string[] = [];
    const signals: AbortSignal[] = [];
    let rejected = "";
    const model = codexModel("test", "unused", "high", async (request) => {
      expect(request.reasoningEffort).toBe("high");
      prompts.push(request.prompt);
      signals.push(request.signal!);
      if (prompts.length === 2) {
        expect(JSON.parse(request.prompt).previousProposal).toBe(rejected);
      }
      const proposal = JSON.stringify({
        toolCalls:
          prompts.length === 1
            ? [
                { name: "run_checks", input: { revision: "base" } },
                { name: "run_checks", input: { revision: "other" } },
              ]
            : [{ name: "run_command", input: { revision: "head", command } }],
        text: "",
      });
      if (prompts.length === 1) rejected = proposal;
      return {
        text: proposal,
        usage: {
          inputTokens: 20,
          cachedInputTokens: 5,
          outputTokens: 10,
          reasoningOutputTokens: 3,
        },
      };
    });
    const tool = (await import("../agent/tools/run_command.ts")).default;
    const result = await model.doGenerate({
      ...options,
      tools: [
        ...options.tools!,
        {
          type: "function",
          name: "run_command",
          inputSchema: z.toJSONSchema(tool.inputSchema as z.ZodType),
        },
      ],
    });
    expect(prompts).toHaveLength(2);
    expect(JSON.parse(prompts[1]!).correction).toContain("No proposed calls were executed");
    expect(JSON.parse(prompts[1]!).correction).toContain("tool call 2 (run_checks)");
    expect(signals[0]).toBe(signals[1]);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({
      type: "tool-call",
      toolName: "run_command",
      input: JSON.stringify({ revision: "head", command }),
    });
    expect(result.usage).toMatchObject({
      inputTokens: { total: 40, noCache: 30, cacheRead: 10 },
      outputTokens: { total: 20, text: 14, reasoning: 6 },
    });
  } finally {
    if (previous === undefined) delete process.env.KICKTIRES_CODEX_CLI;
    else process.env.KICKTIRES_CODEX_CLI = previous;
  }
});

test("Codex stops after two invalid proposals and honors cancellation before retry", async () => {
  const previous = process.env.KICKTIRES_CODEX_CLI;
  process.env.KICKTIRES_CODEX_CLI = "test";
  try {
    for (const cancel of [false, true]) {
      let calls = 0;
      const controller = new AbortController();
      const model = codexModel("test", "unused", "high", async () => {
        calls++;
        if (cancel) controller.abort();
        return {
          text: JSON.stringify({
            toolCalls: [{ name: "run_checks", input: "{broken}" }],
            text: "",
          }),
          usage: {
            inputTokens: 20,
            cachedInputTokens: 0,
            outputTokens: 10,
            reasoningOutputTokens: 0,
          },
        };
      });
      let failure: unknown;
      try {
        await model.doGenerate({ ...options, abortSignal: controller.signal });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect(calls).toBe(cancel ? 1 : 2);
    }
  } finally {
    if (previous === undefined) delete process.env.KICKTIRES_CODEX_CLI;
    else process.env.KICKTIRES_CODEX_CLI = previous;
  }
});

test("Codex app-server rejects host actions and cleans up the child", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { codexResponse } = await import("../src/codex.ts");
  const home = await mkdtemp(join(tmpdir(), "kicktires-auth-test-"));
  try {
    await writeFile(join(home, "auth.json"), "{}", { mode: 0o600 });
    const cli = join(home, "fake.cjs");
    await writeFile(
      cli,
      `const readline=require('node:readline');
const send=x=>console.log(JSON.stringify(x));
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
if(m.method==='initialize')send({id:m.id,result:{userAgent:'kicktires/0.154.0 (test)'}});
if(m.method==='skills/list')send({id:m.id,result:{data:[{skills:[],errors:[]}]}});
if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'test'}}});
if(m.method==='turn/start'){send({id:m.id,result:{}});send({method:'item/started',params:{item:{type:'commandExecution'}}});}
});`,
    );
    let error: unknown;
    try {
      await codexResponse({ cli, home, model: "test", prompt: "test", schema: {} });
    } catch (caught) {
      error = caught;
    }
    expect(String(error)).toContain("unsupported action: commandExecution");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("Codex validates the actual sandbox tool schemas", async () => {
  const cases = [
    ["run_checks", (await import("../agent/tools/run_checks.ts")).default, { revision: "base" }],
    [
      "run_command",
      (await import("../agent/tools/run_command.ts")).default,
      { revision: "head", command: "bun test" },
    ],
    [
      "read_file",
      (await import("../agent/tools/read_file.ts")).default,
      { filePath: "/workspace/change.diff", limit: null, offset: null },
    ],
  ] as const;
  for (const [name, tool, input] of cases) {
    const inputSchema = z.toJSONSchema(tool.inputSchema as z.ZodType);
    const result = proposedResponse(JSON.stringify({ toolCalls: [{ name, input }], text: "" }), {
      prompt: [],
      tools: [{ type: "function", name, inputSchema }],
    });
    expect(result.content[0]).toMatchObject({ type: "tool-call", toolName: name });
  }
});

test("Codex counts cumulative usage and rejects malformed protocol output", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { codexResponse } = await import("../src/codex.ts");
  const home = await mkdtemp(join(tmpdir(), "kicktires-protocol-test-"));
  try {
    await writeFile(join(home, "auth.json"), "{}", { mode: 0o600 });
    const cli = join(home, "fake.cjs");
    const source = `const readline=require('node:readline');const send=x=>console.log(JSON.stringify(x));
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
if(m.method==='initialize')send({id:m.id,result:{userAgent:'kicktires/0.154.0 (test)'}});
if(m.method==='skills/list')send({id:m.id,result:{data:[{skills:[],errors:[]}]}});
if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'test'}}});
if(m.method==='turn/start'){
send({id:m.id,result:{}});
send({method:'item/completed',params:{item:{type:'agentMessage',text:'ready',phase:'final_answer'}}});
send({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{inputTokens:20,cachedInputTokens:5,outputTokens:10,reasoningOutputTokens:3},last:{inputTokens:1}}}});
send({method:'turn/completed',params:{turn:{status:'completed'}}});
}});`;
    await writeFile(cli, source);
    const response = await codexResponse({ cli, home, model: "test", prompt: "test", schema: {} });
    expect(response).toMatchObject({ text: "ready", usage: { inputTokens: 20, outputTokens: 10 } });
    await writeFile(
      cli,
      source.replace(
        "const send=x=>console.log(JSON.stringify(x));",
        "const send=x=>console.log('invalid json');",
      ),
    );
    let error: unknown;
    try {
      await codexResponse({ cli, home, model: "test", prompt: "test", schema: {} });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(SyntaxError);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("Codex resolves paginated model defaults and rejects unsupported settings before a turn", async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { resolveCodexSettings, codexResponse } = await import("../src/codex.ts");
  const home = await mkdtemp(join(tmpdir(), "kicktires-model-test-"));
  try {
    await writeFile(join(home, "auth.json"), "{}", { mode: 0o600 });
    const cli = join(home, "fake.cjs");
    const requests = join(home, "requests.jsonl");
    await writeFile(
      cli,
      `const fs=require('node:fs'),readline=require('node:readline');
const send=x=>console.log(JSON.stringify(x));
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
fs.appendFileSync(${JSON.stringify(requests)},line+'\\n');
if(m.method==='initialize')send({id:m.id,result:{userAgent:'kicktires/0.154.0 (test)'}});
if(m.method==='model/list')send({id:m.id,result:{data:[{model:m.params.cursor?'beta':'alpha',defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'low'},{reasoningEffort:'high'}]}],...(m.params.cursor?{}:{nextCursor:'page2'})}});
if(m.method==='skills/list')send({id:m.id,result:{data:[{skills:[{path:'/bundled/first/SKILL.md'},{path:'/bundled/second/SKILL.md'}],errors:[]}]}});
if(m.method==='thread/start'){
 if(m.params.model==='locked')send({id:m.id,error:{message:'Model unavailable for this account'}});
 else send({id:m.id,result:{thread:{id:'test'},model:m.params.model,reasoningEffort:m.params.model==='mismatch'?'low':m.params.config.model_reasoning_effort}});
}
if(m.method==='turn/start'){send({id:m.id,result:{}});send({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{inputTokens:1,cachedInputTokens:0,outputTokens:1,reasoningOutputTokens:0}}}});send({method:'item/completed',params:{item:{type:'agentMessage',text:'ready'}}});send({method:'turn/completed',params:{turn:{status:'completed'}}});}
});`,
    );
    const base = { cli, home, model: "beta" };
    expect(await resolveCodexSettings(base)).toEqual({ id: "beta", reasoningEffort: "high" });
    expect(await resolveCodexSettings({ ...base, reasoningEffort: "low" })).toEqual({
      id: "beta",
      reasoningEffort: "low",
    });
    await rejects(
      resolveCodexSettings({ ...base, reasoningEffort: "invalid" }),
      /Supported: low, high/,
    );
    await rejects(resolveCodexSettings({ ...base, model: "unknown" }), /Available: alpha, beta/);
    const packageVersion = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ).version;
    const before = (await readFile(requests, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(before.some((r) => r.method === "turn/start" || r.method === "thread/start")).toBe(
      false,
    );
    expect(
      before.filter((r) => r.method === "model/list").every((r) => r.params.includeHidden),
    ).toBe(true);
    const turn = { ...base, reasoningEffort: "high", prompt: "ready", schema: {} };
    expect((await codexResponse(turn)).text).toBe("ready");
    await rejects(codexResponse({ ...turn, model: "mismatch" }), /did not accept/);
    await rejects(codexResponse({ ...turn, model: "locked" }), /unavailable for this account/);
    expect(before.find((request) => request.method === "initialize").params.clientInfo).toEqual({
      name: "kicktires",
      version: packageVersion,
    });
    const after = (await readFile(requests, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(after.filter((r) => r.method === "turn/start")).toHaveLength(1);
    for (const request of after.filter((r) => r.method === "thread/start"))
      expect(request.params.config["skills.config"]).toEqual([
        { path: "/bundled/first/SKILL.md", enabled: false },
        { path: "/bundled/second/SKILL.md", enabled: false },
      ]);
    await rejects(resolveCodexSettings({ ...base, signal: AbortSignal.abort() }));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("Codex bounds rejected proposal context and labels truncation without accepting invalid JSON", async () => {
  const previous = process.env.KICKTIRES_CODEX_CLI;
  process.env.KICKTIRES_CODEX_CLI = "test";
  try {
    let calls = 0;
    const rejected = "x".repeat(70000);
    const model = codexModel("test", "unused", undefined, async (request) => {
      calls++;
      if (calls === 2) {
        const prompt = JSON.parse(request.prompt);
        expect(prompt.previousProposal).toBe(rejected.slice(0, 65536));
        expect(prompt.correction).toContain("truncated");
        expect(prompt.correction).toContain("untrusted data");
      }
      return {
        text: calls === 1 ? rejected : JSON.stringify({ toolCalls: [], text: "done" }),
        usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningOutputTokens: 0 },
      };
    });
    const result = await model.doGenerate(options);
    expect(calls).toBe(2);
    expect(result.content).toEqual([{ type: "text", text: "done" }]);
  } finally {
    if (previous === undefined) delete process.env.KICKTIRES_CODEX_CLI;
    else process.env.KICKTIRES_CODEX_CLI = previous;
  }
});

test("Codex retains private bounded evidence for both rejected attempts", async () => {
  const previous = process.env.KICKTIRES_CODEX_CLI;
  process.env.KICKTIRES_CODEX_CLI = "test";
  const directory = await mkdtemp(join(tmpdir(), "kicktires-rejected-"));
  try {
    const proposal = JSON.stringify({
      toolCalls: [{ name: "run_checks", input: { revision: "other" } }],
      text: "",
    });
    const model = codexModel(
      "test",
      "unused",
      undefined,
      async () => ({
        text: proposal,
        usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningOutputTokens: 0 },
      }),
      directory,
    );
    await rejects(Promise.resolve(model.doGenerate(options)), /tool call 1 \(run_checks\)/);
    const file = join(directory, "codex-rejections.jsonl");
    const records = (await readFile(file, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records.map((r) => r.attempt)).toEqual([1, 2]);
    expect(records[0].proposalId).toBe(records[1].proposalId);
    expect(records[0].proposal).toBe(proposal);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
    if (previous === undefined) delete process.env.KICKTIRES_CODEX_CLI;
    else process.env.KICKTIRES_CODEX_CLI = previous;
  }
});
