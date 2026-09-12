import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("GitHub device login uses the temporary auth directory set after startup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kicktires-auth-"));
  try {
    const gh = join(directory, "gh");
    await writeFile(
      gh,
      '#!/bin/sh\n[ ! -t 0 ] || exit 91\n[ -n "$GH_CONFIG_DIR" ] || exit 92\nmkdir -p "$GH_CONFIG_DIR"\nprintf "%s" "$*" > "$GH_CONFIG_DIR/arguments"\n',
    );
    await chmod(gh, 0o755);
    const auth = join(directory, "auth");
    const script = `import { signIn } from ${JSON.stringify(new URL("../src/setup/github.ts", import.meta.url).pathname)};
      process.env.GH_CONFIG_DIR=${JSON.stringify(auth)}; await signIn();`;
    const child = Bun.spawn([process.execPath, "--no-env-file", "-e", script], {
      env: { ...process.env, GH_CONFIG_DIR: "", PATH: `${directory}:${process.env.PATH}` },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await child.exited).toBe(0);
    expect(await new Response(child.stderr).text()).toBe("");
    expect(await readFile(join(auth, "arguments"), "utf8")).toContain(
      "--scopes repo,workflow --insecure-storage",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const privateHub of [true, false]) {
  test(`runner registration requires a private hub (private=${privateHub})`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "kicktires-registration-"));
    try {
      const gh = join(directory, "gh");
      await writeFile(
        gh,
        `#!/bin/sh
case "$2" in
  /repos/owner/hub) echo '{"private":${privateHub}}' ;;
  /repos/owner/hub/actions/runners/registration-token) echo called > '${directory}/minted'; echo '{"token":"test-token"}' ;;
  *) exit 92 ;;
esac
`,
      );
      await chmod(gh, 0o755);
      const child = Bun.spawn(
        [
          process.execPath,
          "--no-env-file",
          "-e",
          `import { runnerToken } from ${JSON.stringify(new URL("../src/setup/github.ts", import.meta.url).pathname)}; await runnerToken("owner/hub");`,
        ],
        {
          env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      expect(await child.exited).toBe(privateHub ? 0 : 1);
      const minted = await readFile(join(directory, "minted"), "utf8").catch(() => "");
      expect(minted.trim()).toBe(privateHub ? "called" : "");
      if (!privateHub) expect(await new Response(child.stderr).text()).toContain("must be private");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
