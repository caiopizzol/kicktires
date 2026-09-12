import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("setup refuses to include unrelated branch changes in its workflow PR", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kicktires-workflow-"));
  try {
    const gh = join(directory, "gh");
    await writeFile(
      gh,
      `#!/bin/sh
case "$2" in
  */contents/*) echo 'HTTP 404' >&2; exit 1 ;;
  */git/ref/heads/kicktires/setup) echo '{"object":{"sha":"existing"}}' ;;
  */compare/*) echo '{"files":[{"filename":"unrelated.js"}]}' ;;
  *) echo mutation >> '${directory}/mutations'; exit 1 ;;
esac
`,
    );
    await chmod(gh, 0o755);
    const child = Bun.spawn(
      [
        process.execPath,
        "--no-env-file",
        "-e",
        `import { workflowPullRequest } from ${JSON.stringify(new URL("../src/setup/workflow.ts", import.meta.url).pathname)};
      await workflowPullRequest("owner/project", "main", "workflow");`,
      ],
      {
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(await child.exited).toBe(1);
    expect(await new Response(child.stderr).text()).toContain("contains unrelated changes");
    expect(await readFile(join(directory, "mutations"), "utf8").catch(() => "")).toBe("");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
