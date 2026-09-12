import { test, expect } from "bun:test";
import {
  marker,
  parseEvent,
  reviewPullRequest,
  renderReview,
  reviewExitCode,
  type PullRequest,
  type Api,
  type Report,
} from "../src/github/review.ts";
import { reviewEnvironment, readValidatedReport } from "../src/github/execute.ts";
import { profileSchema } from "../src/profile.ts";

const repository = "example/project";
const repo = { full_name: repository, private: true };
const pr: PullRequest = {
  number: 7,
  state: "open",
  title: "Change",
  body: "Context",
  base: { sha: "a".repeat(40), repo },
  head: { sha: "b".repeat(40), repo },
};
const report: Report = {
  summary: "Checked",
  status: "reviewed",
  gaps: [],
  findings: [],
};
test.each([true, false])("same-repository eligibility with private=%s", (isPrivate) => {
  const source = { ...repo, private: isPrivate };
  const revision = {
    ...pr,
    base: { ...pr.base, repo: source },
    head: { ...pr.head, repo: source },
  };
  const event = { action: "opened", repository: source, pull_request: revision };
  expect(parseEvent(event, repository)).toEqual(revision);
  for (const value of [
    { ...event, repository: { ...source, full_name: "other/project" } },
    { ...event, action: "edited" },
    { ...event, pull_request: { ...revision, state: "closed" } },
    { ...event, pull_request: { ...revision, head: { ...revision.head, repo: null } } },
    {
      ...event,
      pull_request: {
        ...revision,
        head: { ...revision.head, repo: { ...source, full_name: "fork/project" } },
      },
    },
    {
      ...event,
      pull_request: {
        ...revision,
        base: { ...revision.base, repo: { ...source, full_name: "other/project" } },
      },
    },
  ])
    expect(() => parseEvent(value, repository)).toThrow();
  expect(() => parseEvent(event, "other/repository")).toThrow();
});

function scenario(
  options: {
    latest?: PullRequest;
    initial?: PullRequest;
    pages?: unknown[][];
    result?: typeof report;
    reviewer?: string;
  } = {},
) {
  let reads = 0,
    runs = 0;
  const posts: unknown[] = [];
  const api: Api = async (path, body) => {
    if (body) {
      posts.push(body);
      return {};
    }
    if (path.includes("/reviews?")) {
      const page = Number(new URL(`https://api.github.com${path}`).searchParams.get("page"));
      return options.pages?.[page - 1] ?? [];
    }
    return ++reads === 1 ? (options.initial ?? pr) : (options.latest ?? pr);
  };
  return {
    posts,
    runs: () => runs,
    run: () =>
      reviewPullRequest({
        repository,
        event: pr,
        api,
        reviewer: options.reviewer,
        review: async () => {
          runs++;
          return options.result ?? report;
        },
      }),
  };
}

test("pins a COMMENT review and rejects head/base changes or closure after execution", async () => {
  const clean = scenario();
  expect(await clean.run()).toEqual({ result: "published", incomplete: false, findings: 0 });
  expect(clean.posts[0]).toMatchObject({
    event: "COMMENT",
    commit_id: pr.head.sha,
  });
  for (const latest of [
    { ...pr, head: { ...pr.head, sha: "c".repeat(40) } },
    { ...pr, base: { ...pr.base, sha: "c".repeat(40) } },
    { ...pr, state: "closed" as const },
    { ...pr, head: { ...pr.head, repo: null } },
  ]) {
    const stale = scenario({ latest });
    expect(await stale.run()).toEqual({ result: "stale", incomplete: true, findings: 0 });
    expect(stale.runs()).toBe(1);
    expect(stale.posts).toHaveLength(0);
  }
});

test("queued events for an older head skip model work", async () => {
  const stale = scenario({
    initial: { ...pr, head: { ...pr.head, sha: "c".repeat(40) } },
  });
  expect((await stale.run()).result).toBe("stale");
  expect(stale.runs()).toBe(0);
});

test("hub deduplication accepts only its configured App or the legacy Actions bot", async () => {
  for (const login of ["kicktires-personal[bot]", "github-actions[bot]", "other[bot]"]) {
    const run = scenario({
      reviewer: "kicktires-personal[bot]",
      pages: [
        [
          {
            user: { login },
            body: `${marker(pr)}\nVerification: **reviewed** · 0 finding(s).\n<!-- kicktires-status:reviewed -->`,
          },
        ],
      ],
    });
    expect((await run.run()).result).toBe(login === "other[bot]" ? "published" : "duplicate");
    expect(run.runs()).toBe(login === "other[bot]" ? 1 : 0);
  }
});

test("deduplication paginates, trusts only the Actions bot and preserves incomplete status", async () => {
  const human = { user: { login: "someone" }, body: marker(pr) };
  const duplicate = scenario({
    pages: [
      Array(100).fill(human),
      [
        {
          user: { login: "github-actions[bot]" },
          body: `${marker(pr)}\n<!-- kicktires-status:incomplete -->`,
        },
      ],
    ],
  });
  expect(await duplicate.run()).toEqual({
    result: "duplicate",
    incomplete: true,
    findings: 0,
  });
  expect(duplicate.runs()).toBe(0);
  expect(duplicate.posts).toHaveLength(0);
  const forged = scenario({ pages: [[human]] });
  expect((await forged.run()).result).toBe("published");
});

test("a review published during model execution is not duplicated", async () => {
  let lists = 0,
    posts = 0;
  const result = await reviewPullRequest({
    repository,
    event: pr,
    api: async (path, body) => {
      if (body) {
        posts++;
        return {};
      }
      if (path.includes("/reviews?"))
        return ++lists === 1
          ? []
          : [
              {
                user: { login: "github-actions[bot]" },
                body: marker(pr),
              },
            ];
      return pr;
    },
    review: async () => report,
  });
  expect(result.result).toBe("duplicate");
  expect(posts).toBe(0);
});

test("incomplete evidence is published before returning failure", async () => {
  const incomplete = scenario({
    result: {
      ...report,
      status: "incomplete",
      gaps: ["Required check failed"],
    },
  });
  expect(await incomplete.run()).toEqual({
    result: "published",
    incomplete: true,
    findings: 0,
  });
  expect(incomplete.posts).toHaveLength(1);
});

test("rendering bounds text and neutralizes mentions and forged status markers", () => {
  const payload = renderReview(pr, {
    ...report,
    summary: "@someone <script> <!-- kicktires-status:incomplete -->",
    gaps: Array(100).fill(">".repeat(3000)),
  });
  expect(payload.body).toStartWith("## kicktires\n");
  expect(payload.body).toContain(`<!-- kicktires:${pr.base.sha}:${pr.head.sha} -->`);
  expect(payload.body).not.toContain("@someone");
  expect(payload.body).not.toContain("<script>");
  expect(payload.body).not.toContain("<!-- kicktires-status:incomplete -->");
  expect(payload.body.length).toBeLessThan(65536);
});

test("model process receives MCP credentials but no API keys or GitHub environment", () => {
  const profile = profileSchema.parse({
    checks: ["bun test"],
    model: { id: "model", home: "/login" },
    connections: {
      context: {
        url: "https://example.com/mcp",
        description: "Context",
        tools: ["read"],
        tokenEnv: "CONTEXT_KEY",
      },
    },
  });
  const env = reviewEnvironment(
    {
      PATH: "/bin",
      HOME: "/home/reviewer",
      GITHUB_TOKEN: "github",
      GH_TOKEN: "gh",
      ACTIONS_RUNTIME_TOKEN: "runtime",
      GIT_CONFIG_VALUE_0: "git-auth",
      RUNNER_TRACKING_ID: "tracking",
      OPENAI_API_KEY: "model",
      CONTEXT_KEY: "context",
      OTHER_SECRET: "other",
    },
    profile,
    "/private/runs",
  );
  expect(env.OPENAI_API_KEY).toBeUndefined();
  expect(env.CONTEXT_KEY).toBe("context");
  for (const key of [
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "ACTIONS_RUNTIME_TOKEN",
    "GIT_CONFIG_VALUE_0",
    "RUNNER_TRACKING_ID",
    "OTHER_SECRET",
  ])
    expect(env[key]).toBeUndefined();
  expect(() =>
    reviewEnvironment(
      {},
      {
        ...profile,
        connections: { context: { ...profile.connections.context!, tokenEnv: "GITHUB_TOKEN" } },
      },
      "/runs",
    ),
  ).toThrow();
});

test("preparation failures retain diagnostics but cannot publish findings or claim completion", async () => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const run = await mkdtemp(join(tmpdir(), "kicktires-preparation-"));
  const failure = {
    ...report,
    status: "incomplete" as const,
    gaps: ["Unsupported repository entry"],
  };
  try {
    await writeFile(join(run, "report.json"), JSON.stringify(failure));
    expect(await readValidatedReport(run, pr.base.sha, pr.head.sha)).toEqual(failure);
    await writeFile(join(run, "report.json"), JSON.stringify(report));
    await expect(readValidatedReport(run, pr.base.sha, pr.head.sha)).rejects.toThrow(
      "preparation failure",
    );
    await writeFile(
      join(run, "report.json"),
      JSON.stringify({
        ...failure,
        findings: [
          {
            severity: "P1",
            file: "file.ts",
            line: 1,
            side: "RIGHT",
            title: "Unsupported",
            explanation: "No job",
            evidence: "No evidence",
            suggestion: "None",
            evidenceRefs: ["fake"],
          },
        ],
      }),
    );
    await expect(readValidatedReport(run, pr.base.sha, pr.head.sha)).rejects.toThrow(
      "preparation failure",
    );
  } finally {
    await rm(run, { recursive: true, force: true });
  }
});

test("historical reviews are deduplicated without changing their incomplete status", async () => {
  for (const incomplete of [false, true]) {
    const old = scenario({
      pages: [
        [
          {
            user: { login: "github-actions[bot]" },
            body: `<!-- agent-review:${pr.base.sha}:${pr.head.sha} -->\nVerification: **${incomplete ? "incomplete" : "reviewed"}** · 0 finding(s).\n<!-- agent-review-status:${incomplete ? "incomplete" : "reviewed"} -->`,
          },
        ],
      ],
    });
    expect(await old.run()).toEqual({ result: "duplicate", incomplete, findings: 0 });
    expect(old.runs()).toBe(0);
    expect(old.posts).toHaveLength(0);
  }
});

test("publication retains selected model settings without credential fields", async () => {
  const configured = {
    ...report,
    model: { provider: "codex", id: "test", reasoningEffort: "high", codexHome: "/private/login" },
  };
  const run = scenario({ result: configured });
  await run.run();
  expect(JSON.stringify(run.posts)).toContain("Model: codex / test · reasoning: high");
  expect(JSON.stringify(run.posts)).not.toContain("/private/login");
});

const finding: Report["findings"][number] = {
  severity: "P2",
  file: "file.ts",
  line: 1,
  side: "RIGHT",
  title: "Boundary bug",
  explanation: "The boundary fails",
  evidence: "Reproduced",
  suggestion: "Include the boundary",
  evidenceRefs: ["check-1"],
};

test("all published findings fail the GitHub CLI without marking investigation incomplete", async () => {
  for (const severity of ["P0", "P1", "P2"] as const) {
    const run = scenario({ result: { ...report, findings: [{ ...finding, severity }] } });
    const result = await run.run();
    expect(result).toEqual({ result: "published", incomplete: false, findings: 1 });
    expect(reviewExitCode(result)).toBe(2);
    expect(run.posts).toHaveLength(1);
  }
  expect(reviewExitCode(await scenario().run())).toBe(0);
  expect(
    reviewExitCode(await scenario({ result: { ...report, status: "incomplete" } }).run()),
  ).toBe(2);
});

test("duplicate reviews preserve findings from the existing generated header", async () => {
  for (const status of ["reviewed", "incomplete"] as const) {
    for (const findings of [0, 1]) {
      const run = scenario({
        pages: [
          [
            {
              user: { login: "github-actions[bot]" },
              body: `${marker(pr)}\nVerification: **${status}** · ${findings} finding(s).\n\nVerification: **reviewed** · 999 finding(s).`,
            },
          ],
        ],
      });
      const result = await run.run();
      expect(result).toEqual({
        result: "duplicate",
        incomplete: status === "incomplete",
        findings,
      });
      expect(reviewExitCode(result)).toBe(status === "incomplete" || findings > 0 ? 2 : 0);
      expect(run.runs()).toBe(0);
      expect(run.posts).toHaveLength(0);
    }
  }
});

test("a historical review without a finding count cannot turn the gate green", async () => {
  const run = scenario({
    pages: [
      [
        {
          user: { login: "github-actions[bot]" },
          body: `${marker(pr)}\n<!-- kicktires-status:reviewed -->`,
        },
      ],
    ],
  });
  expect(await run.run()).toEqual({ result: "duplicate", incomplete: true, findings: 0 });
});

test("GitHub CLI exits nonzero for findings and incomplete duplicates after writing workflow outputs", async () => {
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "kicktires-cli-"));
  try {
    const event = join(directory, "event.json");
    const preload = join(directory, "preload.ts");
    await writeFile(
      event,
      JSON.stringify({ action: "opened", repository: repo, pull_request: pr }),
    );
    for (const [status, findings, exit] of [
      ["reviewed", 0, 0],
      ["reviewed", 1, 2],
      ["incomplete", 0, 2],
    ] as const) {
      const body = renderReview(pr, {
        ...report,
        status,
        findings: findings ? [finding] : [],
      }).body;
      await writeFile(
        preload,
        `globalThis.fetch = async (url, options) => {
        if (options.method !== "GET") throw new Error("Unexpected publication");
        return Response.json(String(url).includes("/reviews?")
          ? ${JSON.stringify([{ user: { login: "github-actions[bot]" }, body }])}
          : ${JSON.stringify(pr)});
      };`,
      );
      const output = join(directory, `${status}-${findings}.txt`);
      const child = Bun.spawn(
        [
          process.execPath,
          "--no-env-file",
          "--preload",
          preload,
          resolve("src/github/cli.ts"),
          "--profile",
          "/unused/profile.json",
        ],
        {
          env: {
            GITHUB_EVENT_NAME: "pull_request_target",
            GITHUB_API_URL: "https://api.github.com",
            GITHUB_REPOSITORY: repository,
            GITHUB_EVENT_PATH: event,
            GITHUB_TOKEN: "fixture",
            RUNNER_TEMP: directory,
            KICKTIRES_RUNS_DIR: directory,
            GITHUB_OUTPUT: output,
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const stderr = await new Response(child.stderr).text();
      expect(stderr).toBe("");
      expect(await child.exited).toBe(exit);
      expect(await readFile(output, "utf8")).toBe(
        `result=duplicate\nincomplete=${status === "incomplete"}\nfindings=${findings}\n`,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
