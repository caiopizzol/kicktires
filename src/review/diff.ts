import { createHash } from "node:crypto";
import type { DiffSide } from "./schema.ts";

/** Changed line numbers on each side of a file's diff. */
export type ChangedFileLines = Readonly<Record<DiffSide, ReadonlySet<number>>>;
export type ChangedLines = ReadonlyMap<string, ChangedFileLines>;

const OLD_FILE_HEADER = /^--- (?:a\/)?(.+)$/;
const FILE_HEADER = /^\+\+\+ (?:b\/)?(.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

type ChangedLine = { file: string; side: DiffSide; line: number; text: string };

/** Reads added and removed line numbers from a unified diff. */
function changedLines(diff: string): ChangedLine[] {
  const lines: ChangedLine[] = [];
  let previousPath: string | undefined;
  let current: string | undefined;
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
        current = path;
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
      lines.push({ file: current, side: "RIGHT", line: newLine, text: line.slice(1) });
      newLine += 1;
      newRemaining -= 1;
    } else if (line.startsWith("-")) {
      lines.push({ file: current, side: "LEFT", line: oldLine, text: line.slice(1) });
      oldLine += 1;
      oldRemaining -= 1;
    } else if (line.startsWith(" ") || line === "") {
      oldLine += 1;
      newLine += 1;
      oldRemaining -= 1;
      newRemaining -= 1;
    }
  }

  return lines;
}

export function parseChangedLines(diff: string): ChangedLines {
  const files = new Map<string, { LEFT: Set<number>; RIGHT: Set<number> }>();
  for (const entry of changedLines(diff)) {
    const lines = files.get(entry.file) ?? { LEFT: new Set<number>(), RIGHT: new Set<number>() };
    lines[entry.side].add(entry.line);
    files.set(entry.file, lines);
  }
  return files;
}

/** References bind findings to source coordinates, never diff display line numbers. */
export function diffAnchors(diff: string) {
  const seen = new Set<string>();
  return changedLines(diff).map((entry) => {
    const anchor = createHash("sha256").update(JSON.stringify(entry)).digest("hex").slice(0, 16);
    if (seen.has(anchor)) throw new Error("Duplicate diff anchor");
    seen.add(anchor);
    return { anchor, ...entry, text: entry.text.slice(0, 240) };
  });
}
