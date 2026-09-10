import { mkdir, writeFile, readFile, symlink } from "node:fs/promises";
import { join, dirname, posix } from "node:path";
import { command } from "./process.ts";

export function safePath(path: string): boolean {
  return (
    !!path &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").some((p) => p === ".." || p === ".git" || !p)
  );
}
export async function snapshotRepository(
  repo: string,
  baseRef: string,
  headRef: string,
  destination: string,
) {
  const gitEnv = {
    PATH: process.env.PATH,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
  const git = (...args: string[]) =>
    command(
      "git",
      ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", ...args],
      repo,
      undefined,
      gitEnv,
    );
  const resolve = (ref: string) =>
    git("rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`)
      .toString()
      .trim();
  const base = resolve(baseRef),
    head = resolve(headRef);
  const files: Record<string, string[]> = {};
  for (const [revision, sha] of [
    ["base", base],
    ["head", head],
  ] as const) {
    const entries = git("ls-tree", "-rz", "--full-tree", sha)
      .toString()
      .split("\0")
      .filter(Boolean);
    if (entries.length > 5000)
      throw new Error("Repository snapshot exceeds 5000 files");
    const paths = entries.map((entry) => {
      const tab = entry.indexOf("\t"),
        meta = entry.slice(0, tab),
        path = entry.slice(tab + 1);
      if (
        !/^(100644|100755|120000) blob [a-f0-9]+$/.test(meta) ||
        !safePath(path)
      )
        throw new Error(`Unsupported repository entry: ${path}`);
      return {
        path,
        isLink: meta.startsWith("120000"),
        oid: meta.split(" ")[2]!,
        mode: meta.startsWith("100755") ? 0o755 : 0o644,
      };
    });
    const linkPaths = new Set(paths.filter((p) => p.isLink).map((p) => p.path));
    const directories = new Set<string>(["."]);
    for (const entry of paths)
      for (
        let dir = posix.dirname(entry.path);
        dir !== ".";
        dir = posix.dirname(dir)
      )
        directories.add(dir);
    const links: { path: string; target: string }[] = [];
    const bodies = command(
      "git",
      ["cat-file", "--batch"],
      repo,
      paths.map((p) => p.oid).join("\n") + "\n",
      gitEnv,
    );
    let offset = 0,
      total = 0;
    await mkdir(join(destination, revision), { recursive: true });
    for (const entry of paths) {
      const end = bodies.indexOf(10, offset);
      const header = bodies.subarray(offset, end).toString("ascii");
      const match = /^([a-f0-9]+) blob (\d+)$/.exec(header);
      if (end < offset || !match || match[1] !== entry.oid)
        throw new Error("Invalid Git blob response");
      const size = Number(match[2]);
      total += size;
      if (total > 25 * 1024 * 1024)
        throw new Error("Repository snapshot exceeds 25 MiB");
      offset = end + 1;
      if (offset + size >= bodies.length || bodies[offset + size] !== 10)
        throw new Error("Truncated Git blob response");
      const content = bodies.subarray(offset, offset + size);
      if (entry.isLink) {
        const target = new TextDecoder("utf-8", { fatal: true }).decode(
          content,
        );
        const resolved = posix.normalize(
          posix.join(posix.dirname(entry.path), target),
        );
        let cursor = posix.dirname(entry.path);
        const traversesLink = target.split("/").some((part) => {
          cursor = posix.normalize(posix.join(cursor, part));
          return linkPaths.has(cursor);
        });
        if (
          !target ||
          target.includes("\0") ||
          target.includes("\\") ||
          posix.isAbsolute(target) ||
          !safePath(resolved) ||
          directories.has(resolved) ||
          traversesLink
        )
          throw new Error(
            `Unsupported repository symlink: ${entry.path} must stay inside the snapshot without directory or link traversal`,
          );
        links.push({ path: entry.path, target });
      } else {
        const path = join(destination, revision, entry.path);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content, { mode: entry.mode });
      }
      offset += size + 1;
    }
    for (const link of links) {
      const path = join(destination, revision, link.path);
      await mkdir(dirname(path), { recursive: true });
      await symlink(link.target, path);
    }
    command(
      "tar",
      [
        "-cf",
        join(destination, `${revision}.tar`),
        "-C",
        join(destination, revision),
        ".",
      ],
      repo,
      undefined,
      // AppleDouble metadata creates extra ._ source files when extracted on Linux.
      { PATH: process.env.PATH, COPYFILE_DISABLE: "1" },
    );
    const archive = await readFile(join(destination, `${revision}.tar`));
    if (archive.length > 25 * 1024 * 1024)
      throw new Error("Repository snapshot exceeds 25 MiB");
    files[revision] = paths.map((p) => p.path);
  }
  const diff = git(
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--unified=3",
    base,
    head,
    "--",
  ).toString();
  const changedFiles = git("diff", "--name-only", "-z", base, head, "--")
    .toString()
    .split("\0")
    .filter(Boolean);
  await writeFile(join(destination, "change.diff"), diff);
  return { base, head, files, changedFiles };
}
