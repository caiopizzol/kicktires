import { z } from "zod";

/**
 * Severity is deliberately coarse. Three levels are enough to sort by and
 * hard to argue about; finer grades invite debate that the review does not need.
 */
export const SEVERITIES = ["P0", "P1", "P2"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const DIFF_SIDES = ["LEFT", "RIGHT"] as const;
export type DiffSide = (typeof DIFF_SIDES)[number];

export const SEVERITY_LABELS: Record<Severity, string> = {
  P0: "breaks production or loses data",
  P1: "wrong behaviour under a realistic case",
  P2: "worth fixing before this ships",
};

export const findingSchema = z.object({
  severity: z.enum(SEVERITIES),
  file: z.string().min(1),
  line: z.number().int().min(1),
  side: z.enum(DIFF_SIDES),
  title: z.string().min(1),
  /** What is wrong, in terms of behaviour rather than style. */
  explanation: z.string().min(1),
  /** The concrete path that produces the failure. */
  evidence: z.string().min(1),
  /** Direction for a fix, not a patch. */
  suggestion: z.string().min(1),
});

export type Finding = z.infer<typeof findingSchema>;

export const reviewSchema = z.object({
  summary: z.string(),
  findings: z.array(findingSchema),
});

export type Review = z.infer<typeof reviewSchema>;
