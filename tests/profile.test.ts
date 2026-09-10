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
      model: { provider: "openai", id: "gpt" },
      checks: ["npm test"],
      skipSafety: true,
    }),
  ).toThrow();
});
test("defaults to offline setup and bounded execution", () => {
  const profile = profileSchema.parse({
    model: { provider: "openai", id: "gpt" },
    checks: ["npm test"],
  });
  expect(profile.setup.network).toBe("deny-all");
  expect(profile.limits.commandSeconds).toBe(60);
});
test("loads the independently packaged skills with explicit dependencies present", async () => {
  const skills = await loadSkills([]);
  expect(Object.keys(skills).sort()).toEqual(["get-context", "review-code", "verify-change"]);
  expect(skills["review-code"]?.markdown).toContain("verify-change");
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
    await expect(loadSkills([directory])).rejects.toThrow("Duplicate skill");
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
      model: { provider: "openai", id: "test" },
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

test("reasoning effort is an explicit Codex-only setting", () => {
  expect(
    profileSchema.parse({
      model: { provider: "codex", id: "test", codexHome: "/login", reasoningEffort: "high" },
      checks: ["true"],
    }).model.reasoningEffort,
  ).toBe("high");
  expect(() =>
    profileSchema.parse({
      model: { provider: "openai", id: "test", reasoningEffort: "high" },
      checks: ["true"],
    }),
  ).toThrow();
});
