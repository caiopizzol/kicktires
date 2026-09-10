import { assertCodexHome } from "./codex.ts";
import { codexModel } from "./codex-model.ts";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createXai } from "@ai-sdk/xai";
import { createOpenAI } from "@ai-sdk/openai";
import { chatgpt } from "eve/models/openai";
import { modelCredentialEnv, type Profile } from "./profile.ts";

export function assertModelAccess(model: Profile["model"]) {
  if (model.provider === "codex") {
    assertCodexHome(model.codexHome);
  } else if (model.provider === "chatgpt") {
    if (!existsSync(`${homedir()}/.eve/auth/chatgpt.json`))
      throw new Error(
        "ChatGPT requires an Eve login. Sign in through Eve's /model > Provider > ChatGPT subscription flow; Codex credentials are separate.",
      );
  } else {
    const key = modelCredentialEnv(model)!;
    if (!process.env[key]) throw new Error(`Missing model credential environment variable: ${key}`);
  }
}
export function resolveModel(model: Profile["model"]) {
  assertModelAccess(model);
  if (model.provider === "codex")
    return codexModel(model.id, model.codexHome!, model.reasoningEffort);
  if (model.provider === "chatgpt") return chatgpt(model.id);
  const apiKey = process.env[modelCredentialEnv(model)!];
  if (model.provider === "anthropic") return createAnthropic({ apiKey })(model.id);
  return model.provider === "openai"
    ? createOpenAI({ apiKey })(model.id)
    : createXai({ apiKey })(model.id);
}
