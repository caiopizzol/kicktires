import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
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
  const git = (...args: string[]) =>
    command(
      "git",
      ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", ...args],
      repo,
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
      if (!/^100(644|755) blob [a-f0-9]+$/.test(meta) || !safePath(path))
        throw new Error(`Unsupported repository entry: ${path}`);
      return {
        path,
        oid: meta.split(" ")[2]!,
        mode: meta.startsWith("100755") ? 0o755 : 0o644,
      };
    });
    const bodies = command(
      "git",
      ["cat-file", "--batch"],
      repo,
      paths.map((p) => p.oid).join("\n") + "\n",
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
      const path = join(destination, revision, entry.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bodies.subarray(offset, offset + size), {
        mode: entry.mode,
      });
      offset += size + 1;
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
