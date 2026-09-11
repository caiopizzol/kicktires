import { defineTool } from "eve/tools";
import { z } from "zod";
import { restoreSource } from "../../src/workspace.ts";
import { readJob } from "../../src/job.ts";
import { runSandboxCommand } from "../../src/sandbox-command.ts";

export default defineTool({
  description:
    "Run every configured required check exactly as supplied on one revision. Use this on base and head before additional investigation; output is already bounded, so no shell pipes are needed.",
  inputSchema: z.strictObject({ revision: z.enum(["base", "head"]) }),
  async execute({ revision }, ctx) {
    const job = readJob(),
      sandbox = await ctx.getSandbox();
    await restoreSource(sandbox, job, revision);
    const executions = [];
    for (const command of job.profile.checks)
      executions.push({
        revision,
        commit: job.repository[revision],
        command,
        ...(await runSandboxCommand(
          sandbox,
          command,
          `/workspace/${revision}`,
          job.profile.limits.commandSeconds,
        )),
      });
    return { evidenceId: ctx.callId, sandboxId: sandbox.id, executions };
  },
});
