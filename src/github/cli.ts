import { readFile, appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { executeReview } from "./execute.ts";
import { parseEvent, reviewPullRequest, reviewExitCode } from "./review.ts";
import { githubApi } from "./api.ts";
import { hubConfigSchema, reviewHubRequest } from "./hub.ts";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    profile: { type: "string" },
    hub: { type: "string" },
  },
});
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
try {
  if (Boolean(values.profile) === Boolean(values.hub))
    throw new Error("Provide exactly one of --profile or --hub");
  const expectedEvent = values.hub ? "workflow_dispatch" : "pull_request_target";
  if (required("GITHUB_EVENT_NAME") !== expectedEvent)
    throw new Error(`Use a trusted ${expectedEvent} workflow`);
  if (required("GITHUB_API_URL") !== "https://api.github.com")
    throw new Error("This adapter currently supports github.com only");
  const repository = required("GITHUB_REPOSITORY");
  const event = JSON.parse(await readFile(required("GITHUB_EVENT_PATH"), "utf8"));
  const token = required("GITHUB_TOKEN");
  const temporary = required("RUNNER_TEMP");
  const runs = resolve(required("KICKTIRES_RUNS_DIR"));
  await mkdir(runs, { recursive: true, mode: 0o700 });
  const api = githubApi(token);
  const review = (pr: Parameters<typeof executeReview>[0]["pr"], profile: string) =>
    executeReview({ pr, token, profile, temporary, runs, env: process.env });
  const result = values.hub
    ? await reviewHubRequest({
        config: hubConfigSchema.parse(JSON.parse(await readFile(values.hub, "utf8"))),
        hub: repository,
        inputs: event.inputs,
        api,
        review,
        runUrl: `https://github.com/${repository}/actions/runs/${required("GITHUB_RUN_ID")}/attempts/${required("GITHUB_RUN_ATTEMPT")}`,
      })
    : await reviewPullRequest({
        repository,
        event: parseEvent(event, repository),
        api,
        review: (pr) => review(pr, values.profile!),
      });
  const summary = `kicktires: ${result.result}; ${result.findings} finding(s)${result.incomplete ? "; verification incomplete" : ""}.\n`;
  console.log(summary.trim());
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `result=${result.result}\nincomplete=${result.incomplete}\nfindings=${result.findings}\n`,
    );
  process.exitCode = values.hub && result.result === "stale" ? 2 : reviewExitCode(result);
} catch (error) {
  console.error(error instanceof Error ? error.message : "GitHub review failed");
  process.exitCode = 1;
}
