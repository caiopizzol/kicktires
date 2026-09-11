import { z } from "zod";
import { publishedReportSchema } from "../review/report.ts";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const repositorySchema = z.object({
  full_name: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  private: z.boolean(),
});
export const pullRequestSchema = z.object({
  number: z.number().int().positive(),
  state: z.enum(["open", "closed"]),
  title: z.string(),
  body: z.string().nullable(),
  base: z.object({ sha, repo: repositorySchema }),
  head: z.object({ sha, repo: repositorySchema.nullable() }),
});
const eventSchema = z.object({
  action: z.enum(["opened", "synchronize", "reopened"]),
  repository: repositorySchema,
  pull_request: pullRequestSchema,
});
export type PullRequest = z.infer<typeof pullRequestSchema>;
export type Report = z.infer<typeof publishedReportSchema>;
export type Api = (path: string, body?: unknown) => Promise<unknown>;

export function parseEvent(value: unknown, repository: string) {
  const event = eventSchema.parse(value);
  if (event.repository.full_name !== repository)
    throw new Error("Event repository does not match GITHUB_REPOSITORY");
  if (!eligible(event.pull_request, repository) || !event.repository.private)
    throw new Error("Reviews require a private repository and a same-repository PR");
  return event.pull_request;
}

function eligible(pr: PullRequest, repository: string) {
  return (
    pr.state === "open" &&
    pr.base.repo.private &&
    pr.base.repo.full_name === repository &&
    pr.head.repo?.full_name === repository
  );
}

export function marker(pr: PullRequest) {
  return `<!-- kicktires:${pr.base.sha}:${pr.head.sha} -->`;
}

async function previousReview(api: Api, endpoint: string, pr: PullRequest, reviewer: string) {
  for (let page = 1; ; page++) {
    const reviews = z
      .array(
        z.object({
          body: z.string().nullable(),
          user: z.object({ login: z.string() }),
        }),
      )
      .parse(await api(`${endpoint}/reviews?per_page=100&page=${page}`));
    const previous = reviews.find(
      (r) =>
        (r.user.login === reviewer || r.user.login === "github-actions[bot]") &&
        (r.body?.includes(marker(pr)) ||
          r.body?.includes(`<!-- agent-review:${pr.base.sha}:${pr.head.sha} -->`)),
    );
    if (previous) return previous.body!;
    if (reviews.length < 100) return null;
  }
}

// Model text must not create mentions, HTML or control the trusted review marker.
function text(value: string, limit: number) {
  return value
    .slice(0, limit)
    .replaceAll(/<!--[\s\S]*?-->/g, "")
    .replaceAll("@", "＠")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .slice(0, limit);
}

export function renderReview(pr: PullRequest, report: Report) {
  const body = [
    "## kicktires",
    `Revision: ${pr.head.sha}`,
    `Verification: **${report.status}** · ${report.findings.length} finding(s).`,
    text(report.summary, 12000),
    ...(report.model
      ? [
          `Model: ${text(report.model.provider, 100)} / ${text(report.model.id, 200)}${report.model.reasoningEffort ? ` · reasoning: ${text(report.model.reasoningEffort, 100)}` : ""}`,
        ]
      : []),
    ...report.gaps.slice(0, 20).map((gap) => `- ${text(gap, 1000)}`),
    "Automated review with recorded tool evidence; not an approval.",
    marker(pr),
    `<!-- kicktires-status:${report.status} -->`,
  ].join("\n\n");
  const comments = report.findings.map((f) => ({
    path: f.file,
    line: f.line,
    side: f.side,
    body: [
      `**[${f.severity}] ${text(f.title, 300)}**`,
      text(f.explanation, 6000),
      `Evidence: ${text(f.evidence, 3000)}`,
      `Suggested direction: ${text(f.suggestion, 2000)}`,
    ].join("\n\n"),
  }));
  return { commit_id: pr.head.sha, event: "COMMENT", body, comments };
}

export async function reviewPullRequest(options: {
  repository: string;
  event: PullRequest;
  api: Api;
  review: (pr: PullRequest) => Promise<Report>;
  reviewer?: string;
}) {
  const { repository, event, api, review, reviewer = "github-actions[bot]" } = options;
  const endpoint = `/repos/${repository}/pulls/${event.number}`;
  const fresh = () => api(endpoint).then((value) => pullRequestSchema.parse(value));
  const current = await fresh();
  if (
    !eligible(current, repository) ||
    current.number !== event.number ||
    current.head.sha !== event.head.sha
  )
    return { result: "stale", incomplete: false };
  const duplicate = await previousReview(api, endpoint, current, reviewer);
  if (duplicate)
    return {
      result: "duplicate",
      incomplete: isIncomplete(duplicate),
    };
  const report = publishedReportSchema.parse(await review(current));
  // Repeat after the slow model call. commit_id also anchors the unavoidable API race.
  const latest = await fresh();
  if (
    !eligible(latest, repository) ||
    latest.number !== current.number ||
    latest.head.sha !== current.head.sha ||
    latest.base.sha !== current.base.sha
  )
    return { result: "stale", incomplete: true };
  const published = await previousReview(api, endpoint, current, reviewer);
  if (published)
    return {
      result: "duplicate",
      incomplete: isIncomplete(published),
    };
  await api(`${endpoint}/reviews`, renderReview(current, report));
  return { result: "published", incomplete: report.status === "incomplete" };
}

// Read old reviews during migration; all new reviews use kicktires markers.
function isIncomplete(body: string) {
  return /<!-- (?:kicktires|agent-review)-status:incomplete -->/.test(body);
}
