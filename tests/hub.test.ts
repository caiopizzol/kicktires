import { rejects } from "node:assert/strict";
import { expect, test } from "bun:test";
import { hubConfigSchema, resolveHubRequest, reviewHubRequest } from "../src/github/hub.ts";

const repository = "example/project";
const repo = { full_name: repository, private: true };
const pr = {
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

test("hub preserves private same-repository eligibility and stale-head detection", async () => {
  for (const value of [
    { ...pr, base: { ...pr.base, repo: { ...repo, private: false } } },
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
    incomplete?: boolean;
    stale?: boolean;
    failReview?: boolean;
    failStatus?: boolean | "success" | "error";
    changeAtRead?: number;
    changeBase?: boolean;
  } = {},
) {
  const statuses: { path: string; body: { state: string } }[] = [];
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
          statuses.push({ path, body: body as { state: string } });
          if (
            options.failStatus === true ||
            options.failStatus === (body as { state: string }).state
          )
            throw new Error("status unavailable");
          return {};
        }
        if (body) {
          publications++;
          return {};
        }
        if (path.includes("/reviews?"))
          return options.duplicate
            ? [
                {
                  user: { login: config.reviewer },
                  body: `<!-- kicktires:${pr.base.sha}:${pr.head.sha} -->\n<!-- kicktires-status:${options.incomplete ? "incomplete" : "reviewed"} -->`,
                },
              ]
            : [];
        reads++;
        if (options.changeAtRead && reads >= options.changeAtRead) {
          const side = options.changeBase ? "base" : "head";
          return { ...pr, [side]: { ...pr[side], sha: "c".repeat(40) } };
        }
        return options.stale ? { ...pr, head: { ...pr.head, sha: "c".repeat(40) } } : pr;
      },
      review: async () => {
        reviews++;
        if (options.failReview) throw new Error("sandbox failed");
        return {
          summary: "Investigated",
          status: options.incomplete ? "incomplete" : "reviewed",
          gaps: [],
          findings: [],
        };
      },
    });
  return { run, statuses, reviews: () => reviews, publications: () => publications };
}

test("hub duplicate restores completed status without pending or inference", async () => {
  const s = hubScenario({ duplicate: true });
  expect(await s.run()).toEqual({ result: "duplicate", incomplete: false });
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
