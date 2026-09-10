import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SandboxSession } from "eve/sandbox";
import type { ReviewJob } from "./job.ts";
import { runSandboxCommand } from "./sandbox-command.ts";

export async function restoreSource(
  sandbox: SandboxSession,
  job: ReviewJob,
  revision: "base" | "head",
) {
  const path = `/workspace/source-${randomUUID()}.tar`;
  await sandbox.writeBinaryFile({
    path,
    content: await readFile(join(job.directory, `${revision}.tar`)),
  });
  try {
    const result = await runSandboxCommand(
      sandbox,
      `tar --no-same-owner -xf ${path} -C /workspace/${revision}`,
      "/workspace",
      job.profile.limits.commandSeconds,
    );
    if (result.exitCode !== 0)
      throw new Error(`Could not restore ${revision} source: ${result.stderr}`);
  } finally {
    await sandbox.removePath({ path, force: true });
  }
}
