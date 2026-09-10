import { expect, test } from "bun:test";
import { profileSchema } from "../src/profile.ts";
import { resolveModel } from "../src/model.ts";

test("direct providers select their native adapters and custom credentials", () => {
  const key = "KICKTIRES_TEST_MODEL_KEY";
  const previous = process.env[key];
  try {
    process.env[key] = "fixture-not-a-real-key";
    for (const [provider, adapter] of [
      ["openai", "openai.responses"],
      ["anthropic", "anthropic.messages"],
      ["xai", "xai.responses"],
    ] as const) {
      const { model } = profileSchema.parse({
        model: { provider, id: "test-model", apiKeyEnv: key },
        checks: ["node --test"],
      });
      const resolved = resolveModel(model);
      expect(resolved).toMatchObject({
        provider: adapter,
        modelId: "test-model",
      });
      delete process.env[key];
      expect(() => resolveModel(model)).toThrow(key);
      process.env[key] = "fixture-not-a-real-key";
    }
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test("removed and unimplemented providers fail configuration", () => {
  for (const provider of ["fireworks", "meta", "muse"]) {
    expect(() =>
      profileSchema.parse({
        model: { provider, id: "model" },
        checks: ["node --test"],
      }),
    ).toThrow();
  }
});
