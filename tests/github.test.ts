import { test, expect } from "bun:test";
import {
  marker,
  parseEvent,
  reviewPullRequest,
  renderReview,
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
const event = { action: "opened", repository: repo, pull_request: pr };

test("only trusted private same-repository PR events are accepted", () => {
  expect(parseEvent(event, repository)).toEqual(pr);
  for (const value of [
    { ...event, repository: { ...repo, private: false } },
    { ...event, action: "edited" },
    { ...event, pull_request: { ...pr, head: { ...pr.head, repo: null } } },
    {
      ...event,
      pull_request: {
        ...pr,
        head: { ...pr.head, repo: { ...repo, full_name: "fork/project" } },
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
        review: async () => {
          runs++;
          return options.result ?? report;
        },
      }),
  };
}

test("pins a COMMENT review and rejects head/base changes or closure after execution", async () => {
  const clean = scenario();
  expect(await clean.run()).toEqual({ result: "published", incomplete: false });
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
    expect(await stale.run()).toEqual({ result: "stale", incomplete: true });
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

test("model process receives selected credentials but no GitHub or runner environment", () => {
  const profile = profileSchema.parse({
    checks: ["bun test"],
    model: { provider: "openai", id: "model" },
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
  expect(env.OPENAI_API_KEY).toBe("model");
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
      { ...profile, model: { ...profile.model, apiKeyEnv: "GITHUB_TOKEN" } },
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

test("provider credentials remain selected after configuration cleanup", () => {
  for (const [provider, key] of [
    ["xai", "XAI_API_KEY"],
    ["openai", "OPENAI_API_KEY"],
    ["anthropic", "ANTHROPIC_API_KEY"],
  ] as const) {
    const profile = profileSchema.parse({
      model: { provider, id: "model" },
      checks: ["bun test"],
    });
    expect(
      reviewEnvironment({ [key]: "selected", UNUSED_KEY: "excluded" }, profile, "/runs")[key],
    ).toBe("selected");
    const custom = {
      ...profile,
      model: { ...profile.model, apiKeyEnv: "CUSTOM_KEY" },
    };
    const env = reviewEnvironment({ [key]: "default", CUSTOM_KEY: "custom" }, custom, "/runs");
    expect(env.CUSTOM_KEY).toBe("custom");
    expect(env[key]).toBeUndefined();
  }
});

test("historical reviews are deduplicated without changing their incomplete status", async () => {
  for (const incomplete of [false, true]) {
    const old = scenario({
      pages: [
        [
          {
            user: { login: "github-actions[bot]" },
            body: `<!-- agent-review:${pr.base.sha}:${pr.head.sha} -->\n<!-- agent-review-status:${incomplete ? "incomplete" : "reviewed"} -->`,
          },
        ],
      ],
    });
    expect(await old.run()).toEqual({ result: "duplicate", incomplete });
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
