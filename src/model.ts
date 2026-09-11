import { assertCodexHome } from "./codex.ts";
import { codexModel } from "./codex-model.ts";
import type { Profile } from "./profile.ts";

export function assertModelAccess(model: Profile["model"]) {
  assertCodexHome(model.home);
}
export function resolveModel(model: Profile["model"], directory?: string) {
  assertModelAccess(model);
  return codexModel(model.id, model.home, model.effort, undefined, directory);
}
