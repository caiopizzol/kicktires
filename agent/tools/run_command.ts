import { defineTool } from "eve/tools";
import { z } from "zod";
import { readJob } from "../../src/job.ts";
import { runSandboxCommand } from "../../src/sandbox-command.ts";
export default defineTool({
  description:
    "Run a real bounded shell command or test in the selected pinned revision's writable sandbox copy. Nonzero exit is evidence, not automatically a regression.",
  inputSchema: z.strictObject({
    revision: z.enum(["base", "head"]),
    command: z.string().min(1).max(16000),
  }),
  async execute({ revision, command }, ctx) {
    const job = readJob(),
      sandbox = await ctx.getSandbox();
    const result = await runSandboxCommand(
      sandbox,
      command,
      `/workspace/${revision}`,
      job.profile.limits.commandSeconds,
    );
    return {
      evidenceId: ctx.callId,
      revision,
      commit: job.repository[revision],
      command,
      sandboxId: sandbox.id,
      ...result,
    };
  },
});
