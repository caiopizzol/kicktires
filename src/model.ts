import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createFireworks } from "@ai-sdk/fireworks";
import { createOpenAI } from "@ai-sdk/openai";
import { chatgpt } from "eve/models/openai";
import type { Profile } from "./profile.ts";

const keyNames = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
} as const;
export function assertModelAccess(model: Profile["model"]) {
  if (model.provider === "chatgpt") {
    if (!existsSync(`${homedir()}/.eve/auth/chatgpt.json`))
      throw new Error(
        "ChatGPT requires an Eve login. Sign in through Eve's /model > Provider > ChatGPT subscription flow; Codex credentials are separate.",
      );
  } else {
    const key = model.apiKeyEnv ?? keyNames[model.provider];
    if (!process.env[key])
      throw new Error(`Missing model credential environment variable: ${key}`);
  }
}
export function resolveModel(model: Profile["model"]) {
  assertModelAccess(model);
  if (model.provider === "chatgpt") return chatgpt(model.id);
  const apiKey = process.env[model.apiKeyEnv ?? keyNames[model.provider]];
  if (model.provider === "anthropic")
    return createAnthropic({ apiKey })(model.id);
  return model.provider === "openai"
    ? createOpenAI({ apiKey })(model.id)
    : createFireworks({
        apiKey,
        baseURL: "https://us.api.fireworks.ai/inference/v1",
      })(model.id);
}
