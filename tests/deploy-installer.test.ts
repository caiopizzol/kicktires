import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command } from "../src/process.ts";

test("rejects a pre-hosted installer before upload", async () => {
  const root = await mkdtemp(join(tmpdir(), "kicktires-deploy-"));
  try {
    await writeFile(
      join(root, "install.sh"),
      `#!/bin/sh
set -eu
[ "$#" -eq 2 ] && [ "$1" = --source ] || {
  echo 'Usage: sudo sh install.sh --source /path/to/kicktires' >&2; exit 1;
}
`,
    );
    command("git", ["init", "-q"], root);
    command("git", ["add", "."], root);
    command(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "-qm",
        "pre-hosted installer",
      ],
      root,
    );
    const version = command("git", ["rev-parse", "HEAD"], root).toString().trim();
    const preload = join(root, "no-network.ts");
    await writeFile(preload, 'globalThis.fetch = () => { throw new Error("UPLOAD_ATTEMPTED"); };');
    const result = Bun.spawnSync(
      [
        process.execPath,
        "--no-env-file",
        "--preload",
        preload,
        new URL("../scripts/deploy-installer.ts", import.meta.url).pathname,
        version,
      ],
      {
        cwd: root,
        env: { ...process.env, CF_TOKEN: "test-only" },
      },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain(
      "Selected installer does not support hosted deployment",
    );
    expect(result.stderr.toString()).not.toContain("UPLOAD_ATTEMPTED");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
