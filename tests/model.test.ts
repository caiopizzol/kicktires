import { expect, test } from "bun:test";
import { profileSchema } from "../src/profile.ts";

test("removed and unimplemented providers fail configuration", () => {
  for (const provider of [
    "openai",
    "anthropic",
    "xai",
    "chatgpt",
    "claude",
    "grok",
    "fireworks",
    "meta",
    "muse",
  ]) {
    expect(() =>
      profileSchema.parse({
        model: { provider, id: "model", home: "/login", effort: "high" },
        checks: ["node --test"],
      }),
    ).toThrow();
  }
});
