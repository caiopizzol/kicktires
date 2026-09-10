import { readFile, appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { executeReview } from "./execute.ts";
import { parseEvent, reviewPullRequest, type Api } from "./review.ts";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    profile: { type: "string" },
  },
});
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
try {
  if (required("GITHUB_EVENT_NAME") !== "pull_request_target")
    throw new Error("Use a trusted pull_request_target workflow");
  if (required("GITHUB_API_URL") !== "https://api.github.com")
    throw new Error("This adapter currently supports github.com only");
  const repository = required("GITHUB_REPOSITORY");
  const event = parseEvent(
    JSON.parse(await readFile(required("GITHUB_EVENT_PATH"), "utf8")),
    repository,
  );
  const token = required("GITHUB_TOKEN");
  const temporary = required("RUNNER_TEMP");
  const runs = resolve(required("AGENT_REVIEW_RUNS_DIR"));
  if (!values.profile) throw new Error("Missing --profile");
  const profile = values.profile;
  await mkdir(runs, { recursive: true, mode: 0o700 });
  const api: Api = async (path, body) => {
    const response = await fetch(`https://api.github.com${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(`GitHub API returned ${response.status} for ${path}`);
    return response.json();
  };
  const result = await reviewPullRequest({
    repository,
    event,
    api,
    review: (pr) =>
      executeReview({ pr, token, profile, temporary, runs, env: process.env }),
  });
  const summary = `Agent Review: ${result.result}${result.incomplete ? "; verification incomplete" : ""}.\n`;
  console.log(summary.trim());
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `result=${result.result}\nincomplete=${result.incomplete}\n`,
    );
  if (result.incomplete) process.exitCode = 2;
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "GitHub review failed",
  );
  process.exitCode = 1;
}
