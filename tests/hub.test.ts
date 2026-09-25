import { renderReview, type PullRequest } from "../src/github/review.ts";
import { rejects } from "node:assert/strict";
import { expect, test } from "bun:test";
import { hubConfigSchema, resolveHubRequest, reviewHubRequest } from "../src/github/hub.ts";

const repository = "example/project";
const repo = { full_name: repository, private: true };
const pr: PullRequest = {
  number: 1,
  state: "open",
  title: "Review",
  body: null,
  base: { sha: "a".repeat(40), repo },
  head: { sha: "b".repeat(40), repo },
};
const config = hubConfigSchema.parse({
  repository: "example/hub",
  reviewer: "example-reviewer[bot]",
  profiles: { [repository]: "/etc/kicktires/project.json" },
});
const inputs = { repository, pr: "1", head: pr.head.sha };

test("hub resolves a trusted profile and refetches the original PR", async () => {
  const calls: string[] = [];
  const result = await resolveHubRequest({
    config,
    hub: config.repository,
    inputs,
    api: async (path) => {
      calls.push(path);
      return pr;
    },
  });
  expect(calls).toEqual(["/repos/example/project/pulls/1"]);
  expect(result.profile).toBe("/etc/kicktires/project.json");
  expect(result.stale).toBe(false);
});

test("hub rejects untrusted routing before calling GitHub", async () => {
  for (const value of [
    { ...inputs, repository: "example/unconfigured" },
    { ...inputs, repository: "../../etc" },
    { ...inputs, profile: "/tmp/attacker.json" },
    { ...inputs, pr: "1/../../issues" },
    { ...inputs, head: "main" },
  ]) {
    let called = false;
    await rejects(
      resolveHubRequest({
        config,
        hub: config.repository,
        inputs: value,
        api: async () => {
          called = true;
          return pr;
        },
      }),
    );
    expect(called).toBe(false);
  }
});

test("hub preserves same-repository eligibility and stale-head detection", async () => {
  for (const value of [
    { ...pr, head: { ...pr.head, repo: { ...repo, full_name: "fork/project" } } },
    { ...pr, number: 2 },
  ]) {
    await rejects(
      resolveHubRequest({ config, hub: config.repository, inputs, api: async () => value }),
    );
  }
  const stale = await resolveHubRequest({
    config,
    hub: config.repository,
    inputs,
    api: async () => ({ ...pr, head: { ...pr.head, sha: "c".repeat(40) } }),
  });
  expect(stale.stale).toBe(true);
  await rejects(
    resolveHubRequest({ config, hub: "attacker/hub", inputs, api: async () => pr }),
    /trusted hub/,
  );
});

function hubScenario(
  options: {
    duplicate?: boolean;
    duplicateAfterReview?: boolean;
    publishedBody?: string;
    incomplete?: boolean;
    gaps?: string[];
    findings?: boolean;
    stale?: boolean;
    failReview?: boolean;
    failStatus?: boolean | "success" | "error";
    changeAtRead?: number;
    changeBase?: boolean;
    public?: boolean;
    reviewId?: number;
    comments?: unknown[];
    permissions?: Record<string, string>;
  } = {},
) {
  const source = { ...repo, private: !options.public };
  const revision = {
    ...pr,
    base: { ...pr.base, repo: source },
    head: { ...pr.head, repo: source },
  };
  const statuses: { path: string; body: { state: string; description: string } }[] = [];
  let reviews = 0;
  let publications = 0;
  let reads = 0;
  const run = () =>
    reviewHubRequest({
      config,
      hub: config.repository,
      inputs,
      runUrl: "https://github.com/example/hub/actions/runs/1/attempts/1",
      api: async (path, body) => {
        if (path.includes("/statuses/")) {
          statuses.push({ path, body: body as { state: string; description: string } });
          if (
            options.failStatus === true ||
            options.failStatus === (body as { state: string; description: string }).state
          )
            throw new Error("status unavailable");
          return {};
        }
        if (body) {
          publications++;
          return {};
        }
        if (path.includes("/comments?"))
          return path.includes("page=1") ? (options.comments ?? []) : [];
        if (path.endsWith("/permission")) {
          const login = path.split("/").at(-2)!;
          if (login === "ghost") throw new Error(`GitHub API returned 404 for ${path}`);
          return { permission: options.permissions?.[login] ?? "read" };
        }
        if (path.includes("/reviews?"))
          return options.duplicate || (options.duplicateAfterReview && reviews > 0)
            ? [
                {
                  id: options.reviewId,
                  user: { login: config.reviewer },
                  commit_id: pr.head.sha,
                  body:
                    options.publishedBody ??
                    `Verification: **${options.incomplete ? "incomplete" : "reviewed"}** · ${options.findings ? 1 : 0} finding(s).\n<!-- kicktires:${pr.base.sha}:${pr.head.sha} -->\n<!-- kicktires-status:${options.incomplete ? "incomplete" : "reviewed"} -->`,
                },
              ]
            : [];
        reads++;
        if (options.changeAtRead && reads >= options.changeAtRead) {
          const side = options.changeBase ? "base" : "head";
          return { ...pr, [side]: { ...pr[side], sha: "c".repeat(40) } };
        }
        return options.stale
          ? { ...revision, head: { ...revision.head, sha: "c".repeat(40) } }
          : revision;
      },
      review: async () => {
        reviews++;
        if (options.failReview) throw new Error("sandbox failed");
        return {
          summary: "Investigated",
          status: options.incomplete ? "incomplete" : "reviewed",
          gaps: options.gaps ?? [],
          findings: options.findings
            ? [
                {
                  severity: "P1",
                  file: "file.ts",
                  line: 1,
                  side: "RIGHT",
                  title: "Boundary bug",
                  explanation: "The boundary fails",
                  evidence: "Reproduced",
                  suggestion: "Include the boundary",
                  evidenceRefs: ["check-1"],
                },
              ]
            : [],
        };
      },
    });
  return { run, statuses, reviews: () => reviews, publications: () => publications };
}

test("hub publishes reviews and completion statuses for configured public repositories", async () => {
  const s = hubScenario({ public: true });
  expect(await s.run()).toEqual({ result: "published", incomplete: false, findings: 0 });
  expect(s.reviews()).toBe(1);
  expect(s.publications()).toBe(1);
  expect(s.statuses.map((s) => s.body.state)).toEqual(["pending", "success"]);
  expect(s.statuses[0]!.body.description).toBe(`Reviewing ${pr.head.sha.slice(0, 7)}.`);
});

test("hub duplicate restores completed status without pending or inference", async () => {
  const s = hubScenario({ duplicate: true });
  expect(await s.run()).toEqual({ result: "duplicate", incomplete: false, findings: 0 });
  expect(s.reviews()).toBe(0);
  expect(s.publications()).toBe(0);
  expect(s.statuses.map((s) => s.body.state)).toEqual(["success"]);
});

test("hub publishes before completing status and preserves incomplete duplicates", async () => {
  const complete = hubScenario();
  expect((await complete.run()).result).toBe("published");
  expect(complete.publications()).toBe(1);
  expect(complete.statuses.map((s) => s.body.state)).toEqual(["pending", "success"]);
  for (const duplicate of [false, true]) {
    const s = hubScenario({ duplicate, incomplete: true });
    expect((await s.run()).incomplete).toBe(true);
    expect(s.statuses.map((s) => s.body.state)).toEqual(
      duplicate ? ["failure"] : ["pending", "failure"],
    );
  }
});

test("hub never marks stale requests or execution failures successful", async () => {
  const stale = hubScenario({ stale: true });
  expect((await stale.run()).result).toBe("stale");
  expect(stale.reviews()).toBe(0);
  expect(stale.statuses.map((s) => s.body.state)).toEqual(["error"]);
  expect(stale.statuses[0]!.path).toBe(`/repos/${repository}/statuses/${inputs.head}`);
  const failure = hubScenario({ failReview: true });
  await rejects(failure.run(), /sandbox failed/);
  expect(failure.statuses.map((s) => s.body.state)).toEqual(["pending", "error"]);
  expect(failure.publications()).toBe(0);
});

test("a failed terminal status write cannot claim hub completion", async () => {
  const s = hubScenario({ duplicate: true, failStatus: true });
  await rejects(s.run(), /status unavailable/);
  expect(s.reviews()).toBe(0);
});

test("hub handles revision changes between resolution, inference and publication", async () => {
  for (const options of [
    { changeAtRead: 2 },
    { changeAtRead: 3 },
    { changeAtRead: 3, changeBase: true },
  ]) {
    const s = hubScenario(options);
    expect((await s.run()).result).toBe("stale");
    expect(s.publications()).toBe(0);
    expect(s.reviews()).toBe(options.changeAtRead === 2 ? 0 : 1);
    expect(s.statuses.map((s) => s.body.state)).toEqual(
      options.changeAtRead === 2 ? ["error"] : ["pending", "error"],
    );
    expect(s.statuses.every((s) => s.path.endsWith(inputs.head))).toBe(true);
  }
});

test("status errors after publication fail the run and do not mask execution errors", async () => {
  const published = hubScenario({ failStatus: "success" });
  await rejects(published.run(), /status unavailable/);
  expect(published.publications()).toBe(1);
  const failed = hubScenario({ failReview: true, failStatus: "error" });
  await rejects(failed.run(), /sandbox failed/);
});

test("hub config rejects relative paths, non-bot identities and unknown fields", () => {
  for (const value of [
    { ...config, profiles: { [repository]: "./profile.json" } },
    { ...config, reviewer: "someone" },
    { ...config, token: "must-not-be-a-config-field" },
  ])
    expect(hubConfigSchema.safeParse(value).success).toBe(false);
});

test("hub fails the source status for published and duplicate findings", async () => {
  for (const duplicate of [false, true]) {
    const run = hubScenario({ duplicate, findings: true, public: true });
    const result = await run.run();
    expect(run.statuses.map((s) => s.body.state)).toEqual(
      duplicate ? ["failure"] : ["pending", "failure"],
    );
    expect(result).toEqual({
      result: duplicate ? "duplicate" : "published",
      incomplete: false,
      findings: 1,
    });
    expect(run.statuses.at(-1)?.body.description).toBe(
      "Review complete. 1 finding. Inspect the review.",
    );
    expect(run.reviews()).toBe(duplicate ? 0 : 1);
    expect(run.publications()).toBe(duplicate ? 0 : 1);
  }
});

test("incomplete status describes the published gap within GitHub's character limit", async () => {
  const short = hubScenario({
    incomplete: true,
    gaps: [" ", "Browser check\n timed out on head."],
  });
  await short.run();
  expect(short.statuses.at(-1)?.body).toMatchObject({
    state: "failure",
    description: "Incomplete: Browser check timed out on head.",
  });
  const long = hubScenario({ incomplete: true, gaps: ["Could not inspect " + "🧪".repeat(160)] });
  await long.run();
  const description = long.statuses.at(-1)!.body.description;
  expect(Array.from(description)).toHaveLength(140);
  expect(description.endsWith("...")).toBe(true);
  expect(description).toStartWith("Incomplete: Could not inspect ");
  expect(description).toMatch(/^Incomplete: Could not inspect (?:🧪)+\.\.\.$/);
});

test("incomplete duplicates do not describe a discarded investigation's gap", async () => {
  for (const duplicateAfterReview of [false, true]) {
    const s = hubScenario({
      incomplete: true,
      duplicate: !duplicateAfterReview,
      duplicateAfterReview,
      gaps: ["This gap belongs only to the unpublished candidate report"],
    });
    expect((await s.run()).result).toBe("duplicate");
    expect(s.reviews()).toBe(duplicateAfterReview ? 1 : 0);
    expect(s.publications()).toBe(0);
    expect(s.statuses.at(-1)?.body.description).toBe("Review incomplete. See verification gaps.");
    expect(s.statuses.at(-1)?.body.state).toBe("failure");
  }
});

test("incomplete duplicates do not infer gaps from ambiguous published Markdown", async () => {
  const summaryBullet = renderReview(pr, {
    summary: "Investigation summary\n\n- Browser unavailable",
    status: "incomplete",
    findings: [],
    gaps: [],
  }).body;
  const publishedGap = renderReview(pr, {
    summary: "Investigation summary",
    status: "incomplete",
    findings: [],
    gaps: ["Browser unavailable"],
  }).body;
  expect(summaryBullet).toBe(publishedGap);
  for (const duplicateAfterReview of [false, true]) {
    const s = hubScenario({
      incomplete: true,
      duplicate: !duplicateAfterReview,
      duplicateAfterReview,
      publishedBody: publishedGap,
      gaps: ["Discarded candidate gap"],
    });
    expect((await s.run()).result).toBe("duplicate");
    expect(s.publications()).toBe(0);
    expect(s.statuses.at(-1)?.body).toMatchObject({
      state: "failure",
      description: "Review incomplete. See verification gaps.",
    });
  }
});

const finding = (id: number, review = 10) => ({
  id,
  pull_request_review_id: review,
  user: { login: config.reviewer, type: "Bot" },
  body: "**[P2] Finding**",
});
const reply = (to: number, body: string, login = "owner", type = "User") => ({
  id: to + 100,
  in_reply_to_id: to,
  pull_request_review_id: 99,
  user: { login, type },
  body,
});
const declined = (options: Parameters<typeof hubScenario>[0]) =>
  hubScenario({
    duplicate: true,
    findings: true,
    reviewId: 10,
    permissions: { owner: "admin", reader: "read", "github-actions[bot]": "write" },
    ...options,
  });

test("a rerun turns findings green only when each is declined in its thread by a writer", async () => {
  const run = declined({
    comments: [finding(1), reply(1, "/kicktires decline Inter already rejects this with a 422.")],
  });
  expect(await run.run()).toMatchObject({ result: "duplicate", findings: 1, declined: true });
  expect(run.statuses.map((s) => [s.body.state, s.body.description])).toEqual([
    ["success", "Review complete. 1 finding declined by @owner."],
  ]);
  expect(run.reviews()).toBe(0);
  expect(run.publications()).toBe(0);
  const later = declined({
    comments: [
      finding(1),
      reply(1, "/kicktires decline Inter already rejects this with a 422."),
      { ...reply(1, "/kicktires decline Me too.", "ghost"), id: 300 },
    ],
  });
  expect(await later.run()).toMatchObject({ declined: true });
});

test("findings stay blocking without an explicit, attributable decline", async () => {
  for (const comments of [
    [finding(1)],
    [finding(1), reply(1, "Will fix in a follow-up.")],
    [finding(1), reply(1, "/kicktires decline")],
    [finding(1), reply(1, "/kicktires decline Looks fine.", "github-actions[bot]", "Bot")],
    [finding(1), reply(1, "/kicktires decline Looks fine.", "reader")],
    [finding(1, 9), reply(1, "/kicktires decline From an older review.")],
    [finding(2), reply(1, "/kicktires decline Wrong thread.")],
  ]) {
    const run = declined({ comments });
    expect(await run.run()).not.toHaveProperty("declined");
    expect(run.statuses.at(-1)?.body).toMatchObject({
      state: "failure",
      description: "Review complete. 1 finding. Inspect the review.",
    });
  }
});

test("every finding must be declined, and incomplete reviews cannot be declined", async () => {
  const two = `Verification: **reviewed** · 2 finding(s).\n<!-- kicktires:${pr.base.sha}:${pr.head.sha} -->`;
  const partial = declined({
    publishedBody: two,
    comments: [finding(1), finding(2), reply(1, "/kicktires decline Not applicable.")],
  });
  await partial.run();
  expect(partial.statuses.at(-1)?.body.state).toBe("failure");
  const both = declined({
    publishedBody: two,
    comments: [
      finding(1),
      finding(2),
      reply(1, "/kicktires decline Not applicable."),
      reply(2, "/kicktires decline Upstream owns this rule."),
    ],
  });
  await both.run();
  expect(both.statuses.at(-1)?.body).toMatchObject({
    state: "success",
    description: "Review complete. 2 findings declined by @owner.",
  });
  const incomplete = declined({
    incomplete: true,
    comments: [finding(1), reply(1, "/kicktires decline Not applicable.")],
  });
  await incomplete.run();
  expect(incomplete.statuses.at(-1)?.body.state).toBe("failure");
});
