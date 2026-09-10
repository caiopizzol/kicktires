import { readdir, readFile, lstat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import type { ReviewJob } from "./job.ts";

export async function loadSkills(extraDirectories: string[]) {
  const bundled = dirname(fileURLToPath(import.meta.resolve("@kicktires/skills/package.json")));
  const skills: ReviewJob["skills"] = {};
  let fileCount = 0,
    totalBytes = 0;
  async function readText(path: string) {
    const stat = await lstat(path);
    if (!stat.isFile()) throw new Error(`Skill inputs must be regular files: ${path}`);
    if (stat.size > 1024 * 1024) throw new Error(`Skill file exceeds 1 MiB: ${path}`);
    totalBytes += stat.size;
    fileCount++;
    if (fileCount > 256 || totalBytes > 8 * 1024 * 1024)
      throw new Error("Supplied skills exceed 256 files or 8 MiB");
    return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
  }
  for (const directory of ["review-code", "get-context", "verify-change"]
    .map((name) => join(bundled, name))
    .concat(extraDirectories)) {
    const markdown = await readText(join(directory, "SKILL.md"));
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(markdown);
    if (!match) throw new Error(`Skill needs YAML frontmatter: ${directory}`);
    const meta = z
      .object({
        name: z.string().regex(/^[a-z][a-z0-9-]*$/),
        description: z.string().min(1),
      })
      .parse(parse(match[1]!));
    if (skills[meta.name]) throw new Error(`Duplicate skill: ${meta.name}`);
    const files: Record<string, string> = {};
    async function walk(relative: string) {
      for (const entry of await readdir(join(directory, relative), {
        withFileTypes: true,
      })) {
        const path = join(relative, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Skill symlinks are not supported: ${path}`);
        if (entry.isDirectory()) await walk(path);
        else if (path !== "SKILL.md") {
          files[path] = await readText(join(directory, path));
        }
      }
    }
    await walk("");
    skills[meta.name] = { description: meta.description, markdown, files };
  }
  return skills;
}
