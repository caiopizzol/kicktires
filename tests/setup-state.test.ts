import { expect, test } from "bun:test";
import { chmod, lstat, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateDirectory, readPrivate, savePrivate, savePrivateText } from "../src/setup/state.ts";

test("setup secrets stay private and reads reject symlinks or exposed files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kicktires-setup-"));
  try {
    await privateDirectory(directory);
    await savePrivate(directory, "app.json", { pem: "test-key" });
    const path = join(directory, "app.json");
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
    expect(await readPrivate(path)).toEqual({ pem: "test-key" });
    await chmod(path, 0o644);
    await expect(readPrivate(path)).rejects.toThrow("private file");
    await symlink(path, join(directory, "link.json"));
    await expect(readPrivate(join(directory, "link.json"))).rejects.toThrow("private file");
    await savePrivateText(directory, "link.json", "pairing");
    expect(await readFile(path, "utf8")).toContain("test-key");
    expect((await lstat(join(directory, "link.json"))).isSymbolicLink()).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test.skipIf(!Bun.which("python3"))(
  "hidden input is not echoed even when pasted immediately",
  () => {
    const terminal = new URL("../src/setup/terminal.ts", import.meta.url).pathname;
    const script = `import os,pty,sys,select,time
pid,fd=pty.fork()
if pid==0: os.execv(sys.argv[1],[sys.argv[1],"--eval",sys.argv[2]])
output=b"";sent=False;deadline=time.monotonic()+10
while time.monotonic()<deadline:
 if not select.select([fd],[],[],0.1)[0]: continue
 try: chunk=os.read(fd,65536)
 except OSError: break
 if not chunk: break
 output+=chunk
 if not sent and b"Secret: " in output: os.write(fd,b"private-test-value\\n");sent=True
else:
 os.kill(pid,9);raise Exception("prompt timed out")
_,status=os.waitpid(pid,0)
assert b"private-test-value" not in output,"secret echoed"
assert b"accepted" in output, "input was not accepted"
assert os.waitstatus_to_exitcode(status)==0
`;
    const result = Bun.spawnSync([
      "python3",
      "-c",
      script,
      process.execPath,
      `import {ask} from ${JSON.stringify(terminal)}; const value=await ask("Secret",true); console.log(value.length===18 ? "accepted" : "wrong");`,
    ]);
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
  },
);
