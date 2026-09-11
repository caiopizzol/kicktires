import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import browserTool from "../agent/tools/browser_check.ts";
import { expect, test } from "bun:test";
import { z } from "zod";
import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { codexInputShape, codexProposalSchema } from "../src/codex-schema.ts";
import { proposedResponse } from "../src/codex-model.ts";
import { reportJSONSchema } from "../src/review/report.ts";

function options(inputSchema: Record<string, unknown>, name = "test"): LanguageModelV4CallOptions {
  return { prompt: [], tools: [{ type: "function", name, inputSchema }] };
}
function proposal(input: unknown, name = "test") {
  return JSON.stringify({ toolCalls: [{ name, input }], text: "" });
}
const commandSchema = z.toJSONSchema(
  z.object({ revision: z.enum(["base", "head"]), command: z.string().min(1).max(16000) }),
);

test("native argument grammar prevents string wrapping and preserves command bytes", () => {
  const callOptions = options(commandSchema);
  const transport = z.fromJSONSchema(codexProposalSchema(callOptions));
  for (const command of [
    "grep -RInE 'events\\.jsonl|response\\.json' src agent",
    "bun -e 'console.log(JSON.stringify({calls:1}))'",
    "cat <<'EOF'\n{\"quoted\":true}\nEOF",
  ]) {
    const input = { revision: "head", command };
    const text = proposal(input);
    expect(transport.safeParse(JSON.parse(text)).success).toBe(true);
    const result = proposedResponse(text, callOptions).content[0];
    expect(result).toMatchObject({ type: "tool-call", input: JSON.stringify(input) });
    for (const malformed of [JSON.stringify(input), JSON.stringify(input) + "}],"]) {
      expect(transport.safeParse(JSON.parse(proposal(malformed))).success).toBe(false);
      expect(() => proposedResponse(proposal(malformed), callOptions)).toThrow(
        "tool call 1 (test)",
      );
    }
  }
  expect(() =>
    proposedResponse(proposal({ revision: "head", command: "" }), callOptions),
  ).toThrow();
});

test("actual core and report schemas use native inputs; unsupported MCP schema stays encoded", async () => {
  const schemas: Record<string, Record<string, unknown>> = { final_output: reportJSONSchema };
  for (const name of ["run_checks", "run_command", "read_file", "write_file", "load_skill"]) {
    const tool = (await import(`../agent/tools/${name}.ts`)).default;
    schemas[name] = tool.inputSchema["~standard"].jsonSchema.input({ target: "draft-07" });
    expect(codexInputShape(schemas[name])).toBeDefined();
  }
  expect(codexInputShape(reportJSONSchema)).toBeDefined();
  schemas.mcp = {
    type: "object",
    properties: { item: { $ref: "#/$defs/item" } },
    required: ["item"],
    additionalProperties: false,
    $defs: { item: { type: "string" } },
  };
  const tools = Object.entries(schemas).map(([name, inputSchema]) => ({
    type: "function" as const,
    name,
    inputSchema,
  }));
  const schema = codexProposalSchema({ prompt: [], tools });
  const variants = schema.properties.toolCalls.items as {
    anyOf: { properties: { name: { enum: string[] }; input: Record<string, unknown> } }[];
  };
  expect(variants.anyOf).toHaveLength(tools.length);
  expect(
    variants.anyOf.find((v) => v.properties.name.enum[0] === "mcp")!.properties.input.type,
  ).toBe("string");
  const read = codexInputShape(schemas.read_file)!;
  expect(read.schema.required).toEqual(["filePath", "limit", "offset"]);
  expect(read.decode({ filePath: "/workspace/change.diff", limit: null, offset: null })).toEqual({
    filePath: "/workspace/change.diff",
  });
  for (const keyword of ['"$schema"', '"minimum"', '"maximum"', '"minLength"', '"maxLength"'])
    expect(JSON.stringify(schema)).not.toContain(keyword);
});

test("native optional absence is restored recursively and transport fields are enforced", () => {
  const original = z.toJSONSchema(
    z.object({
      required: z.string().nullable(),
      nested: z.object({ count: z.number().optional() }),
      items: z.array(z.object({ label: z.string().optional() })),
    }),
  );
  const callOptions = options(original);
  const valid = { required: null, nested: { count: null }, items: [{ label: null }] };
  expect(proposedResponse(proposal(valid), callOptions).content[0]).toMatchObject({
    input: JSON.stringify({ required: null, nested: {}, items: [{}] }),
  });
  for (const invalid of [
    { ...valid, nested: {} },
    { ...valid, extra: true },
    { ...valid, items: [{}] },
  ]) {
    expect(() => proposedResponse(proposal(invalid), callOptions)).toThrow();
  }
  const required = options(z.toJSONSchema(z.object({ value: z.string() })));
  expect(() => proposedResponse(proposal({ value: null }), required)).toThrow();
});

test("optional nullable fields fall back to preserve null separately from omission", () => {
  const original = z.toJSONSchema(z.object({ value: z.string().nullable().optional() }));
  expect(codexInputShape(original)).toBeUndefined();
  for (const input of [{}, { value: null }, { value: "present" }]) {
    expect(
      proposedResponse(proposal(JSON.stringify(input)), options(original)).content[0],
    ).toMatchObject({ input: JSON.stringify(input) });
  }
});

test("mixed native and fallback calls preserve tool choice, validation and atomic failure", () => {
  const fallback = z.toJSONSchema(z.array(z.string()));
  const callOptions: LanguageModelV4CallOptions = {
    prompt: [],
    tools: [
      { type: "function", name: "native", inputSchema: commandSchema },
      { type: "function", name: "mcp", inputSchema: fallback },
    ],
  };
  const native = { name: "native", input: { revision: "head", command: "echo ok" } };
  const mcp = { name: "mcp", input: '["ok"]' };
  const text = JSON.stringify({ toolCalls: [native, mcp], text: "" });
  expect(proposedResponse(text, callOptions).content).toHaveLength(2);
  expect(() => proposedResponse(text, { ...callOptions, toolChoice: { type: "none" } })).toThrow();
  expect(() =>
    proposedResponse(text, { ...callOptions, toolChoice: { type: "tool", toolName: "native" } }),
  ).toThrow("required tool");
  expect(() =>
    proposedResponse(JSON.stringify({ toolCalls: [], text: "done" }), {
      ...callOptions,
      toolChoice: { type: "required" },
    }),
  ).toThrow();
  expect(() => proposedResponse(proposal(native.input, "unavailable"), callOptions)).toThrow(
    "unavailable",
  );
  expect(() =>
    proposedResponse(
      JSON.stringify({ toolCalls: [native, { ...mcp, input: '["ok"] trailing' }], text: "" }),
      callOptions,
    ),
  ).toThrow("tool call 2 (mcp)");
  expect(() => proposedResponse(proposal(["ok"], "mcp"), callOptions)).toThrow("JSON-encoded");
});

test("no tools produces a valid final-response-only grammar", () => {
  const schema = z.fromJSONSchema(codexProposalSchema({ prompt: [] }));
  expect(schema.safeParse({ toolCalls: [], text: "done" }).success).toBe(true);
  expect(schema.safeParse({ toolCalls: ["call"], text: "" }).success).toBe(false);
});

test("dynamic browser uses Eve input serialization and native arguments", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kicktires-browser-schema-"));
  const previous = process.env.KICKTIRES_JOB;
  try {
    const path = join(directory, "job.json");
    await writeFile(
      path,
      JSON.stringify({
        id: "schema-test",
        directory,
        profile: {
          model: { provider: "codex", id: "test", home: "/login" },
          checks: ["true"],
          browser: { start: "unused" },
        },
        repository: { base: "a".repeat(40), head: "b".repeat(40), files: {}, changedFiles: [] },
        skills: {},
      }),
    );
    process.env.KICKTIRES_JOB = path;
    type Resolver = NonNullable<(typeof browserTool.events)["session.started"]>;
    const tool = await browserTool.events["session.started"]!(
      {} as Parameters<Resolver>[0],
      {} as Parameters<Resolver>[1],
    );
    if (!tool) throw new Error("Browser tool was not enabled");
    const schema = (tool.inputSchema as z.ZodType)["~standard"].jsonSchema.input({
      target: "draft-07",
    });
    expect(codexInputShape(schema)).toBeDefined();
    const input = {
      revision: "head",
      script:
        "await page.goto(origin); assert.equal(await page.locator('output').textContent(), '1');",
    };
    expect(
      proposedResponse(proposal(input, "browser_check"), options(schema, "browser_check"))
        .content[0],
    ).toMatchObject({ input: JSON.stringify(input) });
  } finally {
    if (previous === undefined) delete process.env.KICKTIRES_JOB;
    else process.env.KICKTIRES_JOB = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
