import { test, expect } from "bun:test";
import { profileSchema } from "../src/profile.ts";
import { loadSkills } from "../src/skills.ts";

test("rejects unsupported providers and unknown configuration", () => {
  expect(() =>
    profileSchema.parse({
      model: { provider: "claude-subscription", id: "claude" },
      checks: ["npm test"],
    }),
  ).toThrow();
  expect(() =>
    profileSchema.parse({
      model: { provider: "codex", id: "gpt", home: "/login" },
      checks: ["npm test"],
      skipSafety: true,
    }),
  ).toThrow();
});
test("defaults to offline setup and bounded execution", () => {
  const profile = profileSchema.parse({
    model: { provider: "codex", id: "gpt", home: "/login" },
    checks: ["npm test"],
  });
  expect(profile.setup.network).toBe("deny-all");
  expect(profile.limits.commandSeconds).toBe(60);
});
test("loads no skills by default", async () => {
  expect(await loadSkills([])).toEqual({});
});

test("rejects duplicate, symlinked and oversized supplied skills", async () => {
  const { mkdtemp, writeFile, symlink, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "review-skill-"));
  try {
    await writeFile(
      join(directory, "SKILL.md"),
      "---\nname: review-code\ndescription: duplicate\n---\nText",
    );
    expect(Object.keys(await loadSkills([directory]))).toEqual(["review-code"]);
    await expect(loadSkills([directory, directory])).rejects.toThrow("Duplicate skill");
    await writeFile(
      join(directory, "SKILL.md"),
      "---\nname: extra\ndescription: additional skill\n---\nText",
    );
    await symlink("SKILL.md", join(directory, "link"));
    await expect(loadSkills([directory])).rejects.toThrow("symlinks");
    await rm(join(directory, "link"));
    await writeFile(join(directory, "large.txt"), Buffer.alloc(1024 * 1024 + 1));
    await expect(loadSkills([directory])).rejects.toThrow("exceeds 1 MiB");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("connection names follow Eve's kebab-case contract", () => {
  expect(() =>
    profileSchema.parse({
      model: { provider: "codex", id: "test", home: "/login" },
      checks: ["npm test"],
      connections: {
        repo_docs: {
          url: "https://example.invalid/mcp",
          description: "context",
          tools: ["read"],
        },
      },
    }),
  ).toThrow();
});

test("concise Codex settings preserve the existing adapter configuration", async () => {
  const model = { id: "test", home: "/login", effort: "high" };
  const current = profileSchema.parse({ model }).model;
  const legacy = profileSchema.parse({
    model: { provider: "codex", id: "test", codexHome: "/login", reasoningEffort: "high" },
  }).model;
  expect(current).toEqual(legacy);
  expect(profileSchema.parse({ model: current }).model).toEqual(current);
  expect(current).toEqual({
    provider: "codex",
    id: "test",
    codexHome: "/login",
    reasoningEffort: "high",
    contextWindow: 100000,
  });
  expect(
    profileSchema.parse({ model: { id: "test", home: "/login" } }).model.reasoningEffort,
  ).toBeUndefined();
  expect(
    profileSchema.parse({ model: { id: "test", codexHome: "/login" } }).model.reasoningEffort,
  ).toBeUndefined();
  const example = await Bun.file(new URL("../examples/profile.json", import.meta.url)).json();
  expect(profileSchema.parse(example).model).toMatchObject({
    provider: "codex",
    reasoningEffort: "high",
  });
});

test("rejects ambiguous and invalid Codex settings", () => {
  const model = { id: "test", home: "/login", effort: "high" };
  for (const overrides of [
    { codexHome: "/login" },
    { reasoningEffort: "high" },
    { home: "" },
    { effort: "" },
    { apiKeyEnv: "OPENAI_API_KEY" },
    { path: "/login" },
  ])
    expect(profileSchema.safeParse({ model: { ...model, ...overrides } }).success).toBe(false);
  expect(() => profileSchema.parse({ model: { id: "test" } })).toThrow("model.home");
});

test("custom instructions are optional, bounded project guidance", () => {
  const base = { model: { provider: "codex", id: "test", home: "/login" }, checks: ["true"] };
  expect(profileSchema.parse(base).instructions).toBeUndefined();
  expect(
    profileSchema.parse({ ...base, instructions: "  Check tenant isolation.\n  " }).instructions,
  ).toBe("Check tenant isolation.");
  expect(
    profileSchema.parse({ ...base, instructions: "x".repeat(16000) }).instructions,
  ).toHaveLength(16000);
  for (const instructions of ["", "  ", "x".repeat(16001), null, ["guidance"]])
    expect(() => profileSchema.parse({ ...base, instructions })).toThrow();
});

test("check shortcuts are optional and still accept existing profiles", () => {
  const model = { provider: "codex", id: "test", home: "/login" };
  expect(profileSchema.parse({ model }).checks).toEqual([]);
  expect(profileSchema.parse({ model, checks: [] }).checks).toEqual([]);
  expect(profileSchema.parse({ model, checks: ["bun test"] }).checks).toEqual(["bun test"]);
  expect(profileSchema.safeParse({ model, checks: [""] }).success).toBe(false);
});
