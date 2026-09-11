import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command } from "../src/process.ts";

for (const dirty of [false, true]) {
  test(`rejects ${dirty ? "dirty" : "invalid"} source before changing the host`, async () => {
    const root = await mkdtemp(join(tmpdir(), "kicktires-installer-"));
    try {
      const source = join(root, "source");
      await mkdir(join(source, "scripts"), { recursive: true });
      if (dirty) {
        const installer = join(source, "scripts/install-worker.sh");
        await writeFile(installer, "#!/bin/sh\n");
        command("git", ["init", "-q"], source);
        command("git", ["add", "."], source);
        command(
          "git",
          [
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "-qm",
            "base",
          ],
          source,
        );
        await writeFile(installer, "#!/bin/sh\n# dirty\n");
      }
      const script = await readFile(new URL("../install.sh", import.meta.url), "utf8");
      // Simulate supported Linux probes and stop at the first package operation.
      const harness = `id() { echo 0; }\ndpkg() { echo amd64; }\napt_get() { echo HOST_MUTATION >&2; exit 97; }\n${script.replace(". /etc/os-release", "ID=ubuntu; VERSION_ID=26.04").replaceAll("apt-get ", "apt_get ")}`;
      const result = Bun.spawnSync(["sh", "-c", harness, "install.sh", "--source", source]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain(
        dirty ? "Commit tracked source changes" : "Expected a kicktires source checkout",
      );
      expect(result.stderr.toString()).not.toContain("HOST_MUTATION");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
