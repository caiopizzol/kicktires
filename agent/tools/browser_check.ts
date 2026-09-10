import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { restoreSource } from "../../src/workspace.ts";
import { readJob } from "../../src/job.ts";
import { runSandboxCommand } from "../../src/sandbox-command.ts";
import { quote } from "../../src/process.ts";

export default defineDynamic({
  events: {
    "session.started": () =>
      readJob().profile.browser
        ? defineTool({
            description:
              "Start the configured app on an isolated localhost port, then run a Playwright script with page, Node assert, and origin. Runs entirely inside Docker, saves a screenshot on success and returns visible page text. Use real assertions to test interactions.",
            inputSchema: z.object({
              revision: z.enum(["base", "head"]),
              script: z.string().min(1).max(16000),
            }),
            async execute({ revision, script }, ctx) {
              const job = readJob();
              if (!job.profile.browser) throw new Error("Browser is not configured");
              const sandbox = await ctx.getSandbox(),
                id = randomUUID(),
                prefix = `/workspace/browser-${id}`;
              await restoreSource(sandbox, job, revision);
              await sandbox.writeTextFile({
                path: `${prefix}.json`,
                content: JSON.stringify({
                  start: job.profile.browser.start,
                  directory: `/workspace/${revision}`,
                  script,
                  log: `${prefix}.log`,
                  result: `${prefix}-result.json`,
                  screenshot: `${prefix}.png`,
                }),
              });
              const result = await runSandboxCommand(
                sandbox,
                `node /opt/browser/check.cjs ${quote(`${prefix}.json`)}`,
                `/workspace/${revision}`,
                job.profile.limits.commandSeconds,
              );
              let page: unknown = null,
                screenshot: string | null = null;
              if (result.exitCode === 0) {
                const pageText = await sandbox.readTextFile({
                  path: `${prefix}-result.json`,
                });
                if (!pageText) throw new Error("Browser result is missing");
                page = JSON.parse(pageText);
                screenshot = `browser-${id}.png`;
                const bytes = await sandbox.readBinaryFile({
                  path: `${prefix}.png`,
                });
                if (!bytes) throw new Error("Browser screenshot is missing");
                await writeFile(join(job.directory, screenshot), bytes, {
                  mode: 0o600,
                });
              }
              return {
                evidenceId: ctx.callId,
                revision,
                commit: job.repository[revision],
                script,
                ...result,
                page,
                screenshot,
                sandboxId: sandbox.id,
              };
            },
          })
        : null,
  },
});
