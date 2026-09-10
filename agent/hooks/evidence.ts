import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { defineHook, type HookContext } from "eve/hooks";
import { readJob } from "../../src/job.ts";
async function cleanup(_event: unknown, ctx: HookContext) {
  const state = JSON.parse(
    await readFile(join(readJob().directory, "sandbox.json"), "utf8").catch(
      () => "null",
    ),
  );
  if (!state?.ready) return;
  const sandbox = await ctx.getSandbox();
  await sandbox.delete();
}
export default defineHook({
  events: {
    "*": async (event) => {
      if (
        ![
          "actions.requested",
          "action.result",
          "turn.completed",
          "turn.failed",
          "turn.cancelled",
          "session.failed",
          "input.requested",
        ].includes(event.type)
      )
        return;
      await appendFile(
        join(readJob().directory, "events.jsonl"),
        JSON.stringify(event) + "\n",
        { mode: 0o600 },
      );
    },
    "turn.completed": cleanup,
    "turn.failed": cleanup,
    "turn.cancelled": cleanup,
  },
});
