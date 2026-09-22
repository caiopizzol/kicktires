import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { codexResponse } from "../src/codex.ts";

test("real Codex request includes supplied guidance without its bundled skill catalog", async () => {
  const home = await mkdtemp(join(tmpdir(), "kicktires-skill-isolation-"));
  const requests: unknown[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (request.method === "GET") return Response.json({ models: [] });
      requests.push(await request.json());
      const item = {
        id: "msg_test",
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: '{"done":true}', annotations: [] }],
      };
      const events = [
        { type: "response.output_item.done", output_index: 0, item },
        {
          type: "response.completed",
          response: {
            id: "resp_test",
            object: "response",
            status: "completed",
            output: [item],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          },
        },
      ];
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });
  try {
    await writeFile(join(home, "auth.json"), "{}", { mode: 0o600 });
    const cli = join(home, "local-provider.cjs");
    const args = [
      "-c",
      'model_provider="fixture"',
      "-c",
      `model_providers.fixture={name="fixture",base_url="http://127.0.0.1:${server.port}/v1",wire_api="responses",requires_openai_auth=false,request_max_retries=0,stream_max_retries=0}`,
    ];
    const nativeCli = fileURLToPath(import.meta.resolve("@openai/codex/bin/codex.js"));
    await writeFile(
      cli,
      `const {spawn}=require('node:child_process');
const child=spawn(process.execPath,[${JSON.stringify(nativeCli)},...process.argv.slice(2),...${JSON.stringify(args)}],{stdio:'inherit'});
child.on('exit',code=>process.exit(code??1));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
`,
    );
    const supplied = "Supplied review guidance: inspect synthetic invoices.";
    const result = await codexResponse({
      cli,
      home,
      model: "gpt-6-astra",
      reasoningEffort: "high",
      prompt: supplied,
      schema: {
        type: "object",
        properties: { done: { type: "boolean" } },
        required: ["done"],
        additionalProperties: false,
      },
      timeoutMs: 15000,
    });
    expect(JSON.parse(result.text)).toEqual({ done: true });
    expect(requests).toHaveLength(1);
    const body = JSON.stringify(requests[0]);
    expect(body).toContain(supplied);
    expect(body.includes("openai-docs")).toBe(false);
    expect(body.includes("review-agent/SKILL.md")).toBe(false);
    expect(await readFile(join(home, "auth.json"), "utf8")).toBe("{}");
    expect(await Bun.file(join(home, "config.toml")).exists()).toBe(false);
  } finally {
    server.stop(true);
    await rm(home, { recursive: true, force: true });
  }
}, 20000);
