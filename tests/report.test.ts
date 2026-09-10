import { expect, test } from "bun:test";
import { profileSchema } from "../src/profile.ts";
import type { ReviewJob } from "../src/job.ts";
import { validateReport } from "../src/review/report.ts";

const job: ReviewJob = {
  id: "test",
  directory: "/unused",
  skills: {},
  profile: profileSchema.parse({
    model: { provider: "openai", id: "test" },
    checks: ["npm test"],
  }),
  repository: {
    base: "a".repeat(40),
    head: "b".repeat(40),
    files: { base: ["a.ts"], head: ["a.ts"] },
    changedFiles: ["a.ts"],
  },
};
const diff =
  "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n";
const report = {
  summary: "Test report",
  status: "reviewed",
  gaps: [],
  findings: [],
};
function events() {
  const result: unknown[] = [{ type: "turn.completed", data: {} }];
  for (const skill of ["review-code", "get-context", "verify-change"]) {
    result.push({
      type: "actions.requested",
      data: {
        actions: [{ callId: skill, toolName: "load_skill", input: { skill } }],
      },
    });
    result.push({
      type: "action.result",
      data: { result: { callId: skill, toolName: "load_skill", output: {} } },
    });
  }
  for (const revision of ["base", "head"] as const)
    result.push({
      type: "action.result",
      data: {
        result: {
          callId: revision,
          toolName: "run_checks",
          output: {
            executions: [
              {
                revision,
                commit: job.repository[revision],
                command: "npm test",
                exitCode: 0,
                stdout: "assertions passed",
                stderr: "",
                truncated: false,
              },
            ],
          },
        },
      },
    });
  return result;
}
test("requires actual skill and pinned check evidence", () => {
  expect(validateReport(report, events(), job, diff).status).toBe("reviewed");
  const incomplete = validateReport(
    report,
    [{ type: "turn.completed", data: {} }],
    job,
    diff,
  );
  expect(incomplete.status).toBe("incomplete");
  expect(incomplete.gaps).toContain(
    "Required check not recorded for head: npm test",
  );
});
test("retains finding evidence and rejects fabricated references", () => {
  const finding = {
    severity: "P1",
    file: "a.ts",
    line: 1,
    side: "RIGHT",
    title: "Bug",
    explanation: "Behavior fails",
    evidence: "Test input",
    suggestion: "Fix condition",
    evidenceRefs: ["head"],
  };
  const valid = validateReport(
    { ...report, findings: [finding] },
    events(),
    job,
    diff,
  );
  expect(valid.findings[0]).toHaveProperty("evidenceRefs", ["head"]);
  expect(
    validateReport(
      { ...report, findings: [{ ...finding, line: 2 }] },
      events(),
      job,
      diff,
    ).findings,
  ).toEqual([]);
  const unsupported = validateReport(
    { ...report, findings: [{ ...finding, evidenceRefs: ["invented"] }] },
    events(),
    job,
    diff,
  );
  expect(unsupported.status).toBe("incomplete");
  expect(unsupported.findings).toEqual([]);
  expect(unsupported.executions).toHaveLength(2);
  expect(
    validateReport(
      { ...report, findings: [{ ...finding, file: "other.ts" }] },
      events(),
      job,
      diff,
    ).status,
  ).toBe("incomplete");
});
test("failed turns and token-limit pauses cannot become completed reviews", () => {
  expect(
    validateReport(
      report,
      [...events(), { type: "turn.failed", data: {} }],
      job,
      diff,
    ).status,
  ).toBe("incomplete");
  expect(
    validateReport(
      { ...report, status: "incomplete", gaps: ["Token limit"] },
      events(),
      job,
      diff,
    ).status,
  ).toBe("incomplete");
});
test("configured browser requires successful captured checks on both revisions", () => {
  const browserJob = {
    ...job,
    profile: { ...job.profile, browser: { start: "node app.js" } },
  };
  expect(validateReport(report, events(), browserJob, diff).status).toBe(
    "incomplete",
  );
  const browserEvents = (exitCode = 0) =>
    ["base", "head"].map((revision) => ({
      type: "action.result",
      data: {
        result: {
          callId: `browser-${revision}`,
          toolName: "browser_check",
          output: {
            revision,
            commit: job.repository[revision as "base" | "head"],
            exitCode,
            truncated: false,
            screenshot: exitCode ? null : "page.png",
          },
        },
      },
    }));
  expect(
    validateReport(report, [...events(), ...browserEvents()], browserJob, diff)
      .status,
  ).toBe("reviewed");
  expect(
    validateReport(report, [...events(), ...browserEvents(1)], browserJob, diff)
      .status,
  ).toBe("incomplete");
});

test("dedicated required checks retain exact commands and flag truncated evidence", () => {
  const baseline = events().filter(
    (e) =>
      !(
        typeof e === "object" &&
        e !== null &&
        "data" in e &&
        (e.data as { result?: { toolName?: string } }).result?.toolName ===
          "run_command"
      ),
  );
  const checks = (truncated = false) => ({
    type: "action.result",
    data: {
      result: {
        callId: "checks",
        toolName: "run_checks",
        output: {
          executions: (["base", "head"] as const).map((revision) => ({
            revision,
            commit: job.repository[revision],
            command: "npm test",
            exitCode: 0,
            stdout: "passed",
            stderr: "",
            truncated,
          })),
        },
      },
    },
  });
  expect(
    validateReport(report, [...baseline, checks()], job, diff).status,
  ).toBe("reviewed");
  expect(
    validateReport(report, [...baseline, checks(true)], job, diff).status,
  ).toBe("incomplete");
});

test("malformed tool output leaves other execution evidence intact", () => {
  const result = validateReport(
    report,
    [
      ...events(),
      {
        type: "action.result",
        data: {
          result: {
            callId: "bad",
            toolName: "run_command",
            output: "broken payload",
          },
        },
      },
    ],
    job,
    diff,
  );
  expect(result.status).toBe("incomplete");
  expect(result.executions).toHaveLength(2);
  expect(result.gaps).toContain(
    "Malformed command result omitted; inspect raw evidence",
  );
});

test("a failing required check remains incomplete even when the model claims success", () => {
  const failed = events();
  failed.push({
    type: "action.result",
    data: {
      result: {
        callId: "failure",
        toolName: "run_checks",
        output: {
          executions: [
            {
              revision: "head",
              commit: job.repository.head,
              command: "npm test",
              exitCode: 1,
              stdout: "assertion failed",
              stderr: "",
              truncated: false,
            },
          ],
        },
      },
    },
  });
  const result = validateReport(report, failed, job, diff);
  expect(result.status).toBe("incomplete");
  expect(result.gaps).toContain("Required check exited 1 for head: npm test");
});
