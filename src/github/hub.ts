import { z } from "zod";
import {
  parseEvent,
  pullRequestSchema,
  reviewPullRequest,
  type Api,
  type PullRequest,
  type Report,
} from "./review.ts";
import { declinedBy } from "./decline.ts";

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
  const status = (state: "pending" | "success" | "failure" | "error", description: string) => {
    const characters = Array.from(description.replace(/\s+/g, " ").trim());
    return options.api(`/repos/${request.repository}/statuses/${request.head}`, {
      state,
      description:
        characters.length > 140 ? `${characters.slice(0, 137).join("")}...` : characters.join(""),
      context: "kicktires",
      target_url: options.runUrl,
    });
  };
  if (stale) {
    await status("error", "Superseded by a newer revision.");
    return { result: "stale", incomplete: true, findings: 0 };
  }
  let result;
  let report: Report | undefined;
  try {
    result = await reviewPullRequest({
      repository: request.repository,
      event: pr,
      api: options.api,
      reviewer: options.config.reviewer,
      review: async (revision) => {
        await status("pending", `Reviewing ${revision.head.sha.slice(0, 7)}.`);
        report = await options.review(revision, profile);
        return report;
      },
    });
  } catch (error) {
    await status("error", "Review could not finish. Inspect the worker run.").catch(() => {
      console.error("Could not publish the review failure status");
    });
    throw error;
  }
  if (result.result === "stale") {
    await status("error", "PR changed. Review no longer applies to the current revision.");
  } else if (result.incomplete) {
    const gap = result.result === "published" ? report?.gaps.find((gap) => gap.trim()) : undefined;
    await status(
      "failure",
      gap ? `Incomplete: ${gap}` : "Review incomplete. See verification gaps.",
    );
  } else if (result.findings > 0) {
    const review = result.result === "duplicate" && "review" in result ? result.review : undefined;
    let decliners: string[] | null = null;
    if (review) {
      // A rerun may be revoking an earlier decline; never leave a stale success while checking.
      await status("pending", "Checking declined findings.");
      try {
        decliners = await declinedBy(
          options.api,
          request.repository,
          pr.number,
          review,
          result.findings,
        );
        // The lookup is slow; never mark a revision the reused review did not cover.
        if (decliners) {
          const latest = pullRequestSchema.parse(
            await options.api(`/repos/${request.repository}/pulls/${pr.number}`),
          );
          if (latest.head.sha !== pr.head.sha || latest.base.sha !== pr.base.sha) {
            await status("error", "PR changed. Review no longer applies to the current revision.");
            return { result: "stale", incomplete: true, findings: 0 };
          }
        }
      } catch (error) {
        await status("error", "Declined findings could not be checked. Rerun the hub job.").catch(
          () => console.error("Could not publish the decline check status"),
        );
        throw error;
      }
    }
    const count = `${result.findings} finding${result.findings === 1 ? "" : "s"}`;
    if (decliners)
      await status(
        "success",
        `Review complete. ${count} declined by ${decliners.map((login) => `@${login}`).join(", ")}.`,
      );
    else await status("failure", `Review complete. ${count}. Inspect the review.`);
    return decliners ? { ...result, declined: true } : result;
  } else {
    await status("success", "Review complete. No findings. Not an approval.");
  }
  return result;
}
