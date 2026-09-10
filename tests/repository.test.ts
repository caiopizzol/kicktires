import { test, expect } from "bun:test";
import {
  mkdtemp,
  writeFile,
  rm,
  readFile,
  readlink,
  symlink,
} from "node:fs/promises";
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
    await symlink("source.txt", join(repo, "AGENTS.md"));
    await symlink("removed.md", join(repo, "DANGLING.md"));
    git("add", ".");
    git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    await writeFile(join(repo, "source.txt"), "head\n");
    git("commit", "-qam", "head");
    const head = git("rev-parse", "HEAD");
    await writeFile(join(repo, "source.txt"), "dirty secret\n");
    const snapshot = await snapshotRepository(repo, base, head, out);
    expect(snapshot.base).toBe(base);
    expect(await readlink(join(out, "head", "DANGLING.md"))).toBe("removed.md");
    await expect(readFile(join(out, "head", "DANGLING.md"))).rejects.toThrow(
      "ENOENT",
    );
    const extracted = join(root, "extracted");
    await (await import("node:fs/promises")).mkdir(extracted);
    command("tar", ["-xf", join(out, "head.tar"), "-C", extracted], root);
    expect(await readlink(join(extracted, "DANGLING.md"))).toBe("removed.md");
    expect(
      (await readFile(join(out, "head.tar"))).includes(
        Buffer.from("._source.txt"),
      ),
    ).toBe(false);
    expect(await readlink(join(out, "head", "AGENTS.md"))).toBe("source.txt");
    expect(await readFile(join(out, "head", "AGENTS.md"), "utf8")).toBe(
      "head\n",
    );
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
    ).rejects.toThrow("Unsupported repository symlink");
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

test("rejects escaping, directory and chained repository links", async () => {
  const { mkdir } = await import("node:fs/promises");
  const root = await mkdtemp(join(tmpdir(), "agent-review-links-")),
    repo = join(root, "repo");
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
    await writeFile(join(repo, "source.txt"), "tracked\n");
    await mkdir(join(repo, "nested"));
    await writeFile(join(repo, "nested", "file.txt"), "tracked\n");
    await symlink("source.txt", join(repo, "another"));
    git("add", ".");
    git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    for (const [index, target] of [
      "../outside.txt",
      "/etc/passwd",
      ".",
      "nested",
      "another",
      "another/../source.txt",
      "link",
    ].entries()) {
      await rm(join(repo, "link"), { force: true });
      await symlink(target, join(repo, "link"));
      git("add", "link");
      git("commit", "-qm", "link target");
      await expect(
        snapshotRepository(repo, base, "HEAD", join(root, `out-${index}`)),
      ).rejects.toThrow("Unsupported repository symlink");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
