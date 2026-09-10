import { z } from "zod";
import { expect, test } from "bun:test";
import { proposedResponse } from "../src/codex-model.ts";
import { assertCodexHome } from "../src/codex.ts";
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
    toolCalls: [{ name: "run_checks", input: '{"revision":"head"}' }],
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
    { name: "run_checks", input: '{"revision":"other"}' },
    { name: "run_checks", input: '{"revision":"head"}', output: { exitCode: 0 } },
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
      { filePath: "/workspace/change.diff" },
    ],
  ] as const;
  for (const [name, tool, input] of cases) {
    const inputSchema = z.toJSONSchema(tool.inputSchema as z.ZodType);
    const result = proposedResponse(
      JSON.stringify({ toolCalls: [{ name, input: JSON.stringify(input) }], text: "" }),
      {
        prompt: [],
        tools: [{ type: "function", name, inputSchema }],
      },
    );
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
