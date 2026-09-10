import { readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { defineSandbox } from "eve/sandbox";
import { docker } from "eve/sandbox/docker";
import { readJob } from "../src/job.ts";
import { runSandboxCommand } from "../src/sandbox-command.ts";

const backend = docker({
  image: "kicktires-sandbox:0.1.0",
  pullPolicy: "never",
  networkPolicy: "deny-all",
});
export default defineSandbox({
  backend: {
    ...backend,
    async create(input) {
      await writeFile(
        join(readJob().directory, "sandbox.json"),
        JSON.stringify({ id: input.sessionKey, ready: false }),
        { mode: 0o600, flag: "wx" },
      ).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
      return backend.create(input);
    },
  },
  async onSession({ use }) {
    const job = readJob(),
      sandbox = await use();
    await sandbox.writeTextFile({
      path: "/workspace/review.json",
      content: JSON.stringify(
        {
          ...job.repository,
          checks: job.profile.checks,
          browser: job.profile.browser,
          connections: Object.keys(job.profile.connections),
        },
        null,
        2,
      ),
    });
    await sandbox.writeTextFile({
      path: "/workspace/change.diff",
      content: await readFile(join(job.directory, "change.diff"), "utf8"),
    });
    for (const revision of ["base", "head"] as const) {
      await sandbox.writeBinaryFile({
        path: `/workspace/${revision}.tar`,
        content: await readFile(join(job.directory, `${revision}.tar`)),
      });
      const extracted = await runSandboxCommand(
        sandbox,
        `mkdir -p /workspace/${revision} && tar --no-same-owner -xf /workspace/${revision}.tar -C /workspace/${revision}`,
        "/workspace",
        job.profile.limits.commandSeconds,
      );
      if (extracted.exitCode !== 0)
        throw new Error(`Snapshot preparation failed: ${extracted.stderr}`);
    }
    await sandbox.setNetworkPolicy(job.profile.setup.network);
    try {
      for (const revision of ["base", "head"])
        for (const command of job.profile.setup.commands) {
          const result = await runSandboxCommand(
            sandbox,
            command,
            `/workspace/${revision}`,
            job.profile.limits.commandSeconds,
          );
          await appendFile(
            join(job.directory, "setup.jsonl"),
            JSON.stringify({ revision, command, ...result }) + "\n",
            { mode: 0o600 },
          );
          if (result.exitCode !== 0)
            throw new Error(
              `Setup failed in ${revision}: ${result.stderr.slice(0, 4000) || result.stdout.slice(0, 4000)}`,
            );
        }
    } finally {
      await sandbox.setNetworkPolicy("deny-all");
    }
    await writeFile(
      join(job.directory, "sandbox.json"),
      JSON.stringify({ id: sandbox.id, ready: true }),
      { mode: 0o600 },
    );
  },
});
