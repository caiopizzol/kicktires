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
      const harness = `id() { echo 0; }\ndpkg() { echo amd64; }\napt_get() { echo HOST_MUTATION >&2; exit 97; }\n${script.replace(". /etc/os-release", "ID=ubuntu; VERSION_ID=26.04").replaceAll("apt-get ", "apt_get ").replace('main "$@" </dev/tty', 'main "$@"')}`;
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

test.skipIf(!Bun.which("python3"))("piped installer reads prompts from the terminal", async () => {
  const source = await readFile(new URL("../install.sh", import.meta.url), "utf8");
  const harness = source.replace(
    "umask 022",
    'test -t 0 || exit 91; printf "Reply: "; read answer; [ "$answer" = yes ] || exit 92; echo ACCEPTED; exit 0; umask 022',
  );
  const script = `import os,pty,sys,select,time
pid,fd=pty.fork()
if pid==0:
 import subprocess
 p=subprocess.run(["sh"],input=sys.argv[1].encode());os._exit(p.returncode)
output=b"";sent=False;deadline=time.monotonic()+10
while time.monotonic()<deadline:
 if not select.select([fd],[],[],0.1)[0]: continue
 try: chunk=os.read(fd,65536)
 except OSError: break
 if not chunk: break
 output+=chunk
 if not sent and b"Reply: " in output: os.write(fd,b"yes\\n");sent=True
else:
 os.kill(pid,9);raise Exception("installer prompt timed out")
_,status=os.waitpid(pid,0)
assert b"ACCEPTED" in output,output
assert os.waitstatus_to_exitcode(status)==0
`;
  const result = Bun.spawnSync(["python3", "-c", script, harness]);
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
});
