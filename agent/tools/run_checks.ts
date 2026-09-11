import { defineTool } from "eve/tools";
import { z } from "zod";
import { restoreSource } from "../../src/workspace.ts";
import { readJob } from "../../src/job.ts";
import { runSandboxCommand } from "../../src/sandbox-command.ts";

export default defineTool({
  description:
    "Run all configured check commands on one revision when the suite is relevant. Use run_command for focused checks. Nonzero exits are evidence, not automatically review blockers; output is bounded.",
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
