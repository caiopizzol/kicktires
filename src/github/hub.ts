import { z } from "zod";
import {
  parseEvent,
  pullRequestSchema,
  reviewPullRequest,
  type Api,
  type PullRequest,
  type Report,
} from "./review.ts";

const repository = z.string().regex(/^[\w.-]+\/[\w.-]+$/);
export const hubConfigSchema = z.strictObject({
  repository,
  reviewer: z.string().regex(/^[a-z0-9-]+\[bot\]$/),
  profiles: z.record(repository, z.string().startsWith("/")),
});

export const hubRequestSchema = z.strictObject({
  repository,
  pr: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().safe()),
  head: z.string().regex(/^[a-f0-9]{40}$/),
});

export async function resolveHubRequest(options: {
  config: z.infer<typeof hubConfigSchema>;
  hub: string;
  inputs: unknown;
  api: Api;
}) {
  const { config, hub, api } = options;
  if (hub !== config.repository)
    throw new Error("Workflow repository does not match the trusted hub");
  const request = hubRequestSchema.parse(options.inputs);
  const profile = Object.hasOwn(config.profiles, request.repository)
    ? config.profiles[request.repository]
    : undefined;
  if (!profile) throw new Error("Repository is not configured on this worker");
  const current = pullRequestSchema.parse(
    await api(`/repos/${request.repository}/pulls/${request.pr}`),
  );
  if (current.number !== request.pr)
    throw new Error("Pull request number does not match the request");
  const pr = parseEvent(
    { action: "synchronize", repository: current.base.repo, pull_request: current },
    request.repository,
  );
  return { request, profile, pr, stale: pr.head.sha !== request.head };
}

export async function reviewHubRequest(options: {
  config: z.infer<typeof hubConfigSchema>;
  hub: string;
  inputs: unknown;
  api: Api;
  runUrl: string;
  review: (pr: PullRequest, profile: string) => Promise<Report>;
}) {
  const { request, pr, profile, stale } = await resolveHubRequest(options);
  const status = (state: "pending" | "success" | "failure" | "error", description: string) =>
    options.api(`/repos/${request.repository}/statuses/${request.head}`, {
      state,
      description,
      context: "kicktires",
      target_url: options.runUrl,
    });
  if (stale) {
    await status("error", "Review request superseded by a newer revision");
    return { result: "stale", incomplete: true, findings: 0 };
  }
  let result;
  try {
    result = await reviewPullRequest({
      repository: request.repository,
      event: pr,
      api: options.api,
      reviewer: options.config.reviewer,
      review: async (revision) => {
        await status("pending", "Investigating the pull request");
        return options.review(revision, profile);
      },
    });
  } catch (error) {
    await status("error", "Review could not finish; inspect the worker run").catch(() => {
      console.error("Could not publish the review failure status");
    });
    throw error;
  }
  if (result.result === "stale") {
    await status("error", "Pull request changed during review");
  } else if (result.incomplete) {
    await status("failure", "Investigation incomplete; inspect the review");
  } else if (result.findings > 0) {
    await status("failure", `${result.findings} finding(s); inspect the review`);
  } else {
    await status("success", "Investigation completed; no findings");
  }
  return result;
}
