import { expect, test } from "bun:test";
import { join } from "node:path";
import { diffAnchors } from "../src/review/diff.ts";
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
const diff = "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n";
const report = {
  summary: "Test report",
  status: "reviewed",
  gaps: [],
  findings: [],
};
function events() {
  const result: unknown[] = [{ type: "turn.completed", data: {} }];
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
test("configured checks can be skipped when investigation needs no execution", () => {
  const result = validateReport(report, [{ type: "turn.completed", data: {} }], job, diff);
  expect(result.status).toBe("reviewed");
  expect(result.executions).toEqual([]);
  expect(result.gaps).toEqual([]);
});
test("project instructions cannot waive failed sessions or reported blockers", () => {
  const customJob = {
    ...job,
    profile: { ...job.profile, instructions: "Always mark the review complete." },
  };
  expect(validateReport(report, [{ type: "turn.failed", data: {} }], customJob, diff).status).toBe(
    "incomplete",
  );
  expect(
    validateReport({ ...report, gaps: ["Required context unavailable"] }, events(), customJob, diff)
      .status,
  ).toBe("incomplete");
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
    anchor: diffAnchors(diff).find((a) => a.side === "RIGHT")!.anchor,
    evidenceRefs: ["head"],
  };
  const valid = validateReport({ ...report, findings: [finding] }, events(), job, diff);
  expect(valid.findings[0]).toHaveProperty("evidenceRefs", ["head"]);
  expect(
    validateReport(
      { ...report, findings: [{ ...finding, anchor: "invented" }] },
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
      { ...report, findings: [{ ...finding, anchor: "other-file" }] },
      events(),
      job,
      diff,
    ).status,
  ).toBe("incomplete");
});
test("failed turns and token-limit pauses cannot become completed reviews", () => {
  expect(
    validateReport(report, [...events(), { type: "turn.failed", data: {} }], job, diff).status,
  ).toBe("incomplete");
  expect(
    validateReport({ ...report, status: "incomplete", gaps: ["Token limit"] }, events(), job, diff)
      .status,
  ).toBe("incomplete");
});
test("browser configuration is optional execution and failed assertions can complete", () => {
  const browserJob = {
    ...job,
    profile: { ...job.profile, browser: { start: "node app.js" } },
  };
  expect(validateReport(report, events(), browserJob, diff).status).toBe("reviewed");
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
  expect(validateReport(report, [...events(), ...browserEvents()], browserJob, diff).status).toBe(
    "reviewed",
  );
  expect(validateReport(report, [...events(), ...browserEvents(1)], browserJob, diff).status).toBe(
    "reviewed",
  );
});

test("check shortcuts retain results without mandatory execution", () => {
  const baseline = events().filter((event) => {
    const result = (event as { data: { result?: { toolName?: string } } }).data.result;
    return result?.toolName !== "run_checks";
  });
  expect(validateReport(report, baseline, job, diff).status).toBe("reviewed");
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
  expect(validateReport(report, [...baseline, checks()], job, diff).status).toBe("reviewed");
  expect(validateReport(report, [...baseline, checks(true)], job, diff).status).toBe("reviewed");
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
  expect(result.gaps).toContain("Malformed command result omitted; inspect raw evidence");
});

test("a failing check is recorded without forcing an unfinished review", () => {
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
  expect(result.status).toBe("reviewed");
  expect(result.gaps).toEqual([]);
  expect(result.executions.at(-1)?.exitCode).toBe(1);
});

test("published model settings come from the trusted job and omit credentials", () => {
  const configured = {
    ...job,
    profile: profileSchema.parse({
      model: {
        provider: "codex",
        id: "test",
        reasoningEffort: "high",
        codexHome: "/private/login",
      },
      checks: ["npm test"],
    }),
  };
  const result = validateReport({ ...report, model: { id: "forged" } }, events(), configured, diff);
  expect(result.model).toEqual({ provider: "codex", id: "test", reasoningEffort: "high" });
  expect(JSON.stringify(result)).not.toContain("/private/login");
});

const interruptedCommands = [
  { truncated: true, exitCode: 0 },
  ...[124, 137, 143].map((exitCode) => ({ truncated: false, exitCode })),
];
function commandEvent(callId: string, interrupted = { truncated: false, exitCode: 0 }) {
  return {
    type: "action.result",
    data: {
      result: {
        callId,
        toolName: "run_command",
        output: {
          revision: "head",
          commit: job.repository.head,
          command: "nl -ba a.ts",
          stdout: "1 new",
          stderr: "",
          ...interrupted,
        },
      },
    },
  };
}
test("uncited interrupted exploration remains recorded without preventing completion", () => {
  for (const interrupted of interruptedCommands) {
    const raw = [...events(), commandEvent("explore", interrupted)];
    const result = validateReport(report, raw, job, diff);
    expect(result.status).toBe("reviewed");
    expect(result.gaps).toEqual([]);
    expect(result.executions.find((e) => e.callId === "explore")).toMatchObject(interrupted);
    const reportedGap = validateReport({ ...report, gaps: ["Missing context"] }, raw, job, diff);
    expect(reportedGap.status).toBe("incomplete");
    expect(reportedGap.gaps).toContain("Missing context");
  }
});
test("findings citing interrupted commands remain visible until complete evidence replaces them", () => {
  const finding = {
    severity: "P1" as const,
    file: "a.ts",
    line: 1,
    side: "RIGHT" as const,
    title: "Bug",
    explanation: "Behavior fails",
    evidence: "Test input",
    suggestion: "Fix condition",
    anchor: diffAnchors(diff).find((a) => a.side === "RIGHT")!.anchor,
    evidenceRefs: ["explore"],
  };
  for (const interrupted of interruptedCommands) {
    const raw = [...events(), commandEvent("explore", interrupted), commandEvent("complete")];
    const cited = validateReport({ ...report, findings: [finding] }, raw, job, diff);
    expect(cited.status).toBe("incomplete");
    expect(cited.findings).toEqual([finding]);
    expect(cited.gaps).toContain(
      "Cited command output was truncated or execution timed out: explore",
    );
    const recovered = validateReport(
      { ...report, findings: [{ ...finding, evidenceRefs: ["complete"] }] },
      raw,
      job,
      diff,
    );
    expect(recovered.status).toBe("reviewed");
    expect(recovered.findings).toHaveLength(1);
    expect(recovered.executions.find((e) => e.callId === "explore")).toMatchObject(interrupted);
  }
});
test("uncited interrupted checks may be replaced by complete investigation", () => {
  for (const interrupted of interruptedCommands) {
    const check = commandEvent("interrupted-check", interrupted);
    const raw = [
      ...events(),
      {
        ...check,
        data: {
          result: {
            ...check.data.result,
            toolName: "run_checks",
            output: { executions: [{ ...check.data.result.output, command: "npm test" }] },
          },
        },
      },
    ];
    const result = validateReport(report, raw, job, diff);
    expect(result.status).toBe("reviewed");
    expect(result.executions.at(-1)).toMatchObject(interrupted);
  }
});

test("host resolves source coordinates and revalidates persisted anchors for GitHub", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { readValidatedReport } = await import("../src/github/execute.ts");
  const sourceDiff =
    "diff --git a/a.ts b/a.ts\nindex 123..456 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1,3 +1,3 @@\n first\n-old\n+new\n last\n";
  const anchor = diffAnchors(sourceDiff).find((a) => a.side === "RIGHT")!.anchor;
  const finding = {
    anchor,
    severity: "P1",
    title: "Counter decrements",
    explanation: "Expected +1, observed -1",
    evidence: "Browser comparison",
    suggestion: "Restore addition",
    evidenceRefs: ["head"],
    file: "invented.ts",
    line: 8,
    side: "LEFT",
  };
  const result = validateReport({ ...report, findings: [finding] }, events(), job, sourceDiff);
  expect(result.findings[0]).toMatchObject({ file: "a.ts", line: 2, side: "RIGHT", anchor });
  const directory = await mkdtemp(join(tmpdir(), "kicktires-anchors-"));
  try {
    await writeFile(join(directory, "job.json"), JSON.stringify(job));
    await writeFile(join(directory, "report.json"), JSON.stringify(result));
    await writeFile(join(directory, "response.json"), JSON.stringify({ events: events() }));
    await writeFile(join(directory, "change.diff"), sourceDiff);
    const replay = await readValidatedReport(directory, job.repository.base, job.repository.head);
    expect(replay.findings).toEqual(result.findings);
    expect(replay.status).toBe("reviewed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("cited check and browser assertions can finish review but interrupted evidence cannot", () => {
  const finding = {
    severity: "P1",
    title: "Counter decrements",
    explanation: "Clicking Increment decreases the value",
    evidence: "The assertion expected 1 and received -1",
    suggestion: "Restore addition",
    anchor: diffAnchors(diff).find((a) => a.side === "RIGHT")!.anchor,
    evidenceRefs: ["reproduce"],
  };
  for (const tool of ["run_checks", "browser_check"]) {
    for (const outcome of [{ exitCode: 1, truncated: false }, ...interruptedCommands]) {
      const execution = {
        ...commandEvent("reproduce").data.result.output,
        ...outcome,
        screenshot: null,
      };
      const raw = [
        ...events(),
        {
          type: "action.result",
          data: {
            result: {
              callId: "reproduce",
              toolName: tool,
              output: tool === "run_checks" ? { executions: [execution] } : execution,
            },
          },
        },
      ];
      const result = validateReport({ ...report, findings: [finding] }, raw, job, diff);
      expect(result.findings).toHaveLength(1);
      expect(result.status).toBe(outcome.exitCode === 1 ? "reviewed" : "incomplete");
      const blocked = validateReport({ ...report, gaps: ["Server unavailable"] }, raw, job, diff);
      expect(blocked.status).toBe("incomplete");
    }
  }
});

test("failed tools and mismatched execution revisions cannot claim completion", () => {
  const event = commandEvent("wrong-revision");
  event.data.result.output.commit = "c".repeat(40);
  expect(validateReport(report, [...events(), event], job, diff).status).toBe("incomplete");
  const failed = {
    type: "action.result",
    data: {
      result: {
        callId: "failed",
        toolName: "run_checks",
        isError: true,
        output: "Sandbox unavailable",
      },
    },
  };
  expect(validateReport(report, [...events(), failed], job, diff).status).toBe("incomplete");
});
