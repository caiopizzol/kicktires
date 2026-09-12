import { z } from "zod";
import { findingSchema } from "./schema.ts";
import { parseChangedLines, diffAnchors } from "./diff.ts";
import { normalizeReview } from "./normalize.ts";
import type { ReviewJob } from "../job.ts";

export const reportSchema = z.object({
  summary: z.string(),
  status: z.enum(["reviewed", "incomplete"]),
  gaps: z
    .array(z.string())
    .describe(
      "Blockers to finishing the requested review, not a list of optional work that was not requested. Put contextual scope limitations in the summary.",
    ),
  findings: z.array(
    findingSchema.omit({ file: true, side: true, line: true }).extend({
      anchor: z.string().min(1),
      evidenceRefs: z.array(z.string()).min(1),
    }),
  ),
});
export const reportJSONSchema = z.toJSONSchema(reportSchema);
export const modelSettingsSchema = z.object({
  provider: z.string(),
  id: z.string(),
  reasoningEffort: z.string().optional(),
});
export const publishedReportSchema = reportSchema.extend({
  findings: z.array(
    findingSchema.extend({
      anchor: z.string().optional(),
      evidenceRefs: z.array(z.string()).min(1),
    }),
  ),
  model: modelSettingsSchema.optional(),
});

const eventSchema = z.object({
  type: z.string(),
  data: z.record(z.string(), z.unknown()),
});
const actionSchema = z.object({
  callId: z.string(),
  toolName: z.string().optional(),
  isError: z.boolean().optional(),
  output: z.unknown(),
});
const executionSchema = z.object({
  revision: z.enum(["base", "head"]),
  commit: z.string(),
  command: z.string(),
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  truncated: z.boolean(),
});

export function validateReport(data: unknown, rawEvents: unknown[], job: ReviewJob, diff: string) {
  const report = reportSchema.parse(data);
  const gaps = [...report.gaps];
  function readEvidence<T extends z.ZodType>(
    schema: T,
    input: unknown,
    label: string,
  ): z.output<T>[] {
    const parsed = schema.safeParse(input);
    if (parsed.success) return [parsed.data];
    gaps.push(`Malformed ${label} omitted; inspect raw evidence`);
    return [];
  }
  const events = rawEvents.flatMap((e) => readEvidence(eventSchema, e, "event"));
  const actions = events
    .filter((e) => e.type === "action.result")
    .flatMap((e) => readEvidence(actionSchema, e.data.result, "action result"));
  const evidence = new Set(actions.filter((a) => !a.isError).map((a) => a.callId));
  const anchors = new Map(diffAnchors(diff).map((entry) => [entry.anchor, entry]));
  const locatedFindings = report.findings.flatMap((finding) => {
    const location = anchors.get(finding.anchor);
    if (!location) return [];
    return [{ ...finding, file: location.file, side: location.side, line: location.line }];
  });
  if (locatedFindings.length !== report.findings.length)
    gaps.push("Finding(s) dropped because their change references were unknown");
  const supportedFindings = locatedFindings.filter((f) =>
    f.evidenceRefs.every((id) => evidence.has(id)),
  );
  if (supportedFindings.length !== locatedFindings.length)
    gaps.push(
      `${locatedFindings.length - supportedFindings.length} finding(s) dropped because their evidence references were missing or failed`,
    );
  const changedLines = parseChangedLines(diff);
  const normalized = normalizeReview(
    { ...report, findings: supportedFindings },
    {
      changedFiles: job.repository.changedFiles,
      changedLines,
      maxFindings: 50,
    },
  );
  if (normalized.findings.length !== supportedFindings.length)
    gaps.push(
      `${supportedFindings.length - normalized.findings.length} finding(s) dropped because they were outside the changed diff or report limit`,
    );
  if (
    !events.some((e) => e.type === "turn.completed") ||
    events.some((e) => ["turn.failed", "turn.cancelled", "session.failed"].includes(e.type))
  )
    gaps.push("Agent turn did not complete successfully");
  const executions = actions
    .filter((a) => a.toolName === "run_command" && !a.isError)
    .flatMap((a) =>
      readEvidence(executionSchema, a.output, "command result").map((output) => ({
        callId: a.callId,
        tool: "run_command",
        ...output,
      })),
    );
  for (const action of actions.filter((a) => a.toolName === "run_checks" && !a.isError)) {
    for (const output of readEvidence(
      z.object({ executions: z.array(executionSchema) }),
      action.output,
      "check result",
    ))
      for (const execution of output.executions)
        executions.push({
          callId: action.callId,
          tool: "run_checks",
          ...execution,
        });
  }

  const citedEvidence = new Set(normalized.findings.flatMap((f) => f.evidenceRefs));
  for (const e of executions.filter((e) => e.truncated || [124, 137, 143].includes(e.exitCode))) {
    if (citedEvidence.has(e.callId))
      gaps.push(`Cited command output was truncated or execution timed out: ${e.callId}`);
  }
  const browserExecutions = actions
    .filter((a) => a.toolName === "browser_check" && !a.isError)
    .flatMap((a) =>
      readEvidence(
        z.object({
          revision: z.enum(["base", "head"]),
          commit: z.string(),
          exitCode: z.number(),
          truncated: z.boolean(),
          screenshot: z.string().nullable(),
        }),
        a.output,
        "browser result",
      ).map((output) => ({ callId: a.callId, ...output })),
    );

  for (const e of [...executions, ...browserExecutions]) {
    if (e.commit !== job.repository[e.revision])
      gaps.push(`Execution does not match the pinned ${e.revision} revision: ${e.callId}`);
  }
  for (const e of browserExecutions) {
    if (citedEvidence.has(e.callId) && (e.truncated || [124, 137, 143].includes(e.exitCode)))
      gaps.push(`Cited browser output was truncated or execution timed out: ${e.callId}`);
  }
  for (const action of actions.filter((a) => a.isError && a.toolName !== "read_file"))
    gaps.push(
      `Tool ${action.toolName ?? "unknown"} failed; inspect the worker's private run evidence`,
    );
  return {
    ...report,
    model: modelSettingsSchema.parse({
      provider: "codex",
      id: job.profile.model.id,
      reasoningEffort: job.profile.model.effort,
    }),
    findings: normalized.findings,
    status:
      gaps.length || report.status === "incomplete"
        ? ("incomplete" as const)
        : ("reviewed" as const),
    gaps: [...new Set(gaps)],
    executions,
    browserExecutions,
  };
}
