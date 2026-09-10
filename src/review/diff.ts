import type { DiffSide } from "./schema.ts";

/** Changed line numbers on each side of a file's diff. */
export type ChangedFileLines = Readonly<Record<DiffSide, ReadonlySet<number>>>;
export type ChangedLines = ReadonlyMap<string, ChangedFileLines>;

const OLD_FILE_HEADER = /^--- (?:a\/)?(.+)$/;
const FILE_HEADER = /^\+\+\+ (?:b\/)?(.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

interface MutableChangedFileLines {
  readonly LEFT: Set<number>;
  readonly RIGHT: Set<number>;
}

/** Reads added and removed line numbers from a unified diff. */
export function parseChangedLines(diff: string): ChangedLines {
  const files = new Map<string, MutableChangedFileLines>();
  let previousPath: string | undefined;
  let current: MutableChangedFileLines | undefined;
  let oldLine = 0;
  let newLine = 0;
  let oldRemaining = 0;
  let newRemaining = 0;

  for (const line of diff.split("\n")) {
    // Header-like source text is distinguishable from a real header only after
    // both sides of the current hunk have consumed their declared line counts.
    if (oldRemaining <= 0 && newRemaining <= 0) {
      const oldHeader = OLD_FILE_HEADER.exec(line);
      if (oldHeader) {
        previousPath = oldHeader[1];
        continue;
      }

      const fileHeader = FILE_HEADER.exec(line);
      if (fileHeader) {
        const newPath = fileHeader[1] as string;
        const path = newPath === "/dev/null" ? previousPath : newPath;
        if (path === undefined || path === "/dev/null") {
          current = undefined;
          continue;
        }
        current = files.get(path) ?? {
          LEFT: new Set<number>(),
          RIGHT: new Set<number>(),
        };
        files.set(path, current);
        continue;
      }
    }

    const hunkHeader = HUNK_HEADER.exec(line);
    if (hunkHeader) {
      oldLine = Number(hunkHeader[1]);
      oldRemaining = hunkHeader[2] === undefined ? 1 : Number(hunkHeader[2]);
      newLine = Number(hunkHeader[3]);
      newRemaining = hunkHeader[4] === undefined ? 1 : Number(hunkHeader[4]);
      continue;
    }

    if (current === undefined) {
      continue;
    }

    if (line.startsWith("+")) {
      current.RIGHT.add(newLine);
      newLine += 1;
      newRemaining -= 1;
    } else if (line.startsWith("-")) {
      current.LEFT.add(oldLine);
      oldLine += 1;
      oldRemaining -= 1;
    } else if (line.startsWith(" ") || line === "") {
      oldLine += 1;
      newLine += 1;
      oldRemaining -= 1;
      newRemaining -= 1;
    }
  }

  return files;
}
