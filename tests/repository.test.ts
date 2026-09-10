import { test, expect } from "bun:test";
import { mkdtemp, writeFile, rm, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command } from "../src/process.ts";
import { safePath, snapshotRepository } from "../src/repository.ts";

test("pins committed revisions and excludes dirty working-tree files", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-review-git-"));
  const repo = join(root, "repo"),
    out = join(root, "snapshots");
  try {
    command("git", ["init", "-q", repo], root);
    const git = (...args: string[]) =>
      command(
        "git",
        [
          "-c",
          "user.name=Test",
          "-c",
          "user.email=test@example.invalid",
          ...args,
        ],
        repo,
      )
        .toString()
        .trim();
    await writeFile(join(repo, "source.txt"), "base\n");
    await writeFile(
      join(repo, ".gitattributes"),
      "source.txt export-ignore\nversion.txt export-subst\n",
    );
    await writeFile(join(repo, "version.txt"), "$Format:%H$\n");
    git("add", ".");
    git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    await writeFile(join(repo, "source.txt"), "head\n");
    git("commit", "-qam", "head");
    const head = git("rev-parse", "HEAD");
    await writeFile(join(repo, "source.txt"), "dirty secret\n");
    const snapshot = await snapshotRepository(repo, base, head, out);
    expect(snapshot.base).toBe(base);
    expect(await readFile(join(out, "head", "version.txt"), "utf8")).toBe(
      "$Format:%H$\n",
    );
    expect(snapshot.head).toBe(head);
    expect(await readFile(join(out, "head", "source.txt"), "utf8")).toBe(
      "head\n",
    );
    expect(await readFile(join(repo, "source.txt"), "utf8")).toBe(
      "dirty secret\n",
    );
    await symlink("/etc/passwd", join(repo, "link"));
    git("add", "link");
    git("commit", "-qm", "link");
    await expect(
      snapshotRepository(repo, base, "HEAD", join(root, "unsafe")),
    ).rejects.toThrow("Unsupported repository entry");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("rejects paths that escape the snapshot or Git metadata", () => {
  for (const path of [
    "/absolute",
    "../parent",
    "x/../parent",
    ".git/config",
    "x\\file",
    "",
  ])
    expect(safePath(path)).toBe(false);
  expect(safePath("src/file name.ts")).toBe(true);
});
