import { expect, spyOn, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { profileSchema } from "../src/profile.ts";
import { resolveModel } from "../src/model.ts";
import { codexModel } from "../src/codex-model.ts";
import { codexResponse } from "../src/codex.ts";

test("configured response budget reaches the app-server and cancellation cleans it up", async () => {
  const home = await mkdtemp(join(tmpdir(), "kicktires-deadline-"));
  const previous = process.env.KICKTIRES_CODEX_CLI;
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  const timeout = spyOn(AbortSignal, "timeout").mockImplementation((ms) =>
    nativeTimeout(Math.ceil(ms / 400)),
  );
  try {
    await writeFile(join(home, "auth.json"), "{}", { mode: 0o600 });
    const cli = join(home, "fake.cjs");
    const processFile = join(home, "process.json");
    await writeFile(
      cli,
      `const fs=require('node:fs'),readline=require('node:readline');
fs.writeFileSync(${JSON.stringify(processFile)},JSON.stringify({pid:process.pid,cwd:process.cwd()}));
const send=x=>console.log(JSON.stringify(x));
readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
if(m.method==='initialize')send({id:m.id,result:{userAgent:'kicktires/0.156.1 (test)'}});
if(m.method==='skills/list')send({id:m.id,result:{data:[{skills:[],errors:[]}]}});
if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'test'},model:m.params.model,reasoningEffort:'high'}});
if(m.method==='turn/start'){
send({id:m.id,result:{}});
setTimeout(()=>{
send({method:'thread/tokenUsage/updated',params:{tokenUsage:{total:{inputTokens:1,cachedInputTokens:0,outputTokens:1,reasoningOutputTokens:0}}}});
send({method:'item/completed',params:{item:{type:'agentMessage',text:JSON.stringify({toolCalls:[],text:'done'})}}});
send({method:'turn/completed',params:{turn:{status:'completed'}}});
},700);
}});`,
    );
    process.env.KICKTIRES_CODEX_CLI = cli;
    const profile = profileSchema.parse({
      model: { id: "test", home, effort: "high" },
      limits: { modelSeconds: 600, reviewSeconds: 1800 },
    });
    const model = resolveModel(profile.model, undefined, profile.limits.modelSeconds);
    const result = await model.doGenerate({ prompt: [] });
    expect(result.content).toEqual([{ type: "text", text: "done" }]);

    async function expectCleanedUp() {
      const { pid, cwd } = JSON.parse(await readFile(processFile, "utf8"));
      expect(() => process.kill(pid, 0)).toThrow();
      const { stat } = await import("node:fs/promises");
      await rejects(stat(cwd));
    }
    await expectCleanedUp();

    await rejects(
      Promise.resolve(resolveModel(profile.model).doGenerate({ prompt: [] })),
      /cancelled or timed out/,
    );
    await expectCleanedUp();

    await rejects(
      codexResponse({
        cli,
        home,
        model: "test",
        reasoningEffort: "high",
        prompt: "test",
        schema: {},
        signal: new AbortController().signal,
      }),
      /cancelled or timed out/,
    );
    await expectCleanedUp();

    await rejects(
      Promise.resolve(model.doGenerate({ prompt: [], abortSignal: nativeTimeout(150) })),
      /cancelled or timed out/,
    );
    await expectCleanedUp();
  } finally {
    timeout.mockRestore();
    if (previous === undefined) delete process.env.KICKTIRES_CODEX_CLI;
    else process.env.KICKTIRES_CODEX_CLI = previous;
    await rm(home, { recursive: true, force: true });
  }
});

test("schema correction consumes the same response budget", async () => {
  const previous = process.env.KICKTIRES_CODEX_CLI;
  process.env.KICKTIRES_CODEX_CLI = "fake";
  const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
  const timeout = spyOn(AbortSignal, "timeout").mockImplementation(() => nativeTimeout(100));
  let calls = 0;
  try {
    const model = codexModel("test", "unused", "high", async (request) => {
      calls++;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 65);
        request.signal!.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(request.signal!.reason);
          },
          { once: true },
        );
      });
      return {
        text: calls === 1 ? "invalid" : JSON.stringify({ toolCalls: [], text: "done" }),
        usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningOutputTokens: 0 },
      };
    });
    await rejects(Promise.resolve(model.doGenerate({ prompt: [] })));
    expect(calls).toBe(2);
  } finally {
    timeout.mockRestore();
    if (previous === undefined) delete process.env.KICKTIRES_CODEX_CLI;
    else process.env.KICKTIRES_CODEX_CLI = previous;
  }
});
