import type { ChangedLines } from "./diff.ts";
import { type Finding, type Review, SEVERITIES } from "./schema.ts";

const SEVERITY_ORDER = new Map(SEVERITIES.map((severity, index) => [severity, index]));

export interface NormalizeOptions {
  readonly maxFindings: number;
  /** Paths the PR actually touches. Findings elsewhere are dropped. */
  readonly changedFiles: readonly string[];
  /** Exact changed line numbers per file and diff side. */
  readonly changedLines: ChangedLines;
}

export interface NormalizedReview<F extends Finding = Finding> extends Omit<Review, "findings"> {
  findings: F[];
  /** Findings removed because the report was already at its cap. */
  readonly droppedOverCap: number;
}

/** Keep findings citable on the diff, sort worst first, and apply the report cap. */
export function normalizeReview<F extends Finding>(
  review: Omit<Review, "findings"> & { findings: F[] },
  options: NormalizeOptions,
): NormalizedReview<F> {
  const changed = new Set(options.changedFiles);

  const kept: F[] = [];

  for (const finding of review.findings) {
    // Relax only model-authored paths; the changed-file list is authoritative.
    const matched = candidatePaths(finding.file).find((path) => changed.has(path));

    if (matched === undefined) {
      continue;
    }

    if (options.changedLines.get(matched)?.[finding.side].has(finding.line))
      kept.push({ ...finding, file: matched });
  }

  kept.sort(bySeverityThenLocation);

  const capped = kept.slice(0, options.maxFindings);

  return {
    summary: review.summary.trim(),
    findings: capped,
    droppedOverCap: kept.length - capped.length,
  };
}

function bySeverityThenLocation(a: Finding, b: Finding): number {
  const severity =
    (SEVERITY_ORDER.get(a.severity) ?? SEVERITIES.length) -
    (SEVERITY_ORDER.get(b.severity) ?? SEVERITIES.length);
  if (severity !== 0) {
    return severity;
  }
  const file = a.file.localeCompare(b.file);
  return file !== 0 ? file : a.line - b.line;
}

/** Try literal paths first: diff prefixes can also be real directory names. */
function candidatePaths(path: string): string[] {
  const withoutDot = path.replace(/^\.\//, "");
  const candidates = [path, withoutDot, withoutDot.replace(/^[ab]\//, "")];

  // Deduplicated so an unprefixed path is not checked three times.
  return [...new Set(candidates)];
}
