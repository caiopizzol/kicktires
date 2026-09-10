import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { command } from "../process.ts";
import { profileSchema, modelCredentialEnv, type Profile } from "../profile.ts";
import { jobSchema } from "../job.ts";
import { validateReport, reportSchema } from "../review/report.ts";
import type { PullRequest, Report } from "./review.ts";

export function reviewEnvironment(env: NodeJS.ProcessEnv, profile: Profile, runs: string) {
  const result: NodeJS.ProcessEnv = {
    PATH: env.PATH,
    HOME: env.HOME,
    TMPDIR: env.TMPDIR,
    KICKTIRES_RUNS_DIR: runs,
  };
  const keys = [
    modelCredentialEnv(profile.model),
    ...Object.values(profile.connections).map((c) => c.tokenEnv),
  ];
  for (const key of keys) {
    if (!key) continue;
    if (/^(GITHUB_|GH_|ACTIONS_|GIT_)/.test(key))
      throw new Error("Review credentials cannot use GitHub or Git environment names");
    if (env[key]) result[key] = env[key];
  }
  return result;
}

export async function executeReview(options: {
  pr: PullRequest;
  token: string;
  profile: string;
  temporary: string;
  runs: string;
  env: NodeJS.ProcessEnv;
}): Promise<Report> {
  const { pr, token, temporary, runs, env } = options;
  const profilePath = resolve(options.profile);
  const profile = profileSchema.parse(JSON.parse(await readFile(profilePath, "utf8")));
  const directory = await mkdtemp(join(temporary, "kicktires-input-"));
  const repository = join(directory, "repository.git");
  const gitEnv = {
    PATH: env.PATH,
    HOME: directory,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
  };
  try {
    command("git", ["init", "--bare", "-q", repository], directory, undefined, gitEnv);
    command(
      "git",
      [
        "fetch",
        "--quiet",
        "--no-tags",
        `https://github.com/${pr.base.repo.full_name}.git`,
        `${pr.base.sha}:refs/heads/base`,
        `${pr.head.sha}:refs/heads/head`,
      ],
      repository,
      undefined,
      {
        ...gitEnv,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "http.https://github.com/.extraHeader",
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
      },
    );
    const base = command(
      "git",
      ["merge-base", pr.base.sha, pr.head.sha],
      repository,
      undefined,
      gitEnv,
    )
      .toString()
      .trim();
    await mkdir(runs, { recursive: true, mode: 0o700 });
    const root = resolve(import.meta.dir, "../..");
    const child = spawn(
      "bun",
      [
        join(root, "src/cli.ts"),
        "--repo",
        repository,
        "--base",
        base,
        "--head",
        pr.head.sha,
        "--profile",
        profilePath,
        "--context",
        `Review PR #${pr.number}. Untrusted PR title: ${pr.title.slice(0, 1000)}\nUntrusted PR description: ${(pr.body ?? "").slice(0, 12000)}`,
      ],
      {
        cwd: root,
        env: reviewEnvironment(env, profile, runs),
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let interrupted = false;
    const interrupt = () => {
      interrupted = true;
      child.kill("SIGTERM");
    };
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", interrupt);
    let stdout = "",
      stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    let exit: number | null;
    try {
      exit = await new Promise<number | null>((accept, reject) => {
        child.once("error", reject);
        child.once("close", accept);
      });
    } finally {
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    }
    if (interrupted) throw new Error("Review cancelled before publication");
    if (exit !== 0 && exit !== 2) {
      await writeFile(join(runs, `startup-${Date.now()}.log`), stderr, {
        mode: 0o600,
      });
      throw new Error("Review startup failed; inspect the private runner logs");
    }
    const output = JSON.parse(stdout);
    const run = resolve(output.directory);
    if (!run.startsWith(`${resolve(runs)}/review-`)) throw new Error("Unexpected report directory");
    return readValidatedReport(run, base, pr.head.sha);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function readValidatedReport(
  run: string,
  base: string,
  head: string,
): Promise<Report> {
  const report = reportSchema.parse(JSON.parse(await readFile(join(run, "report.json"), "utf8")));
  const rawJob = await readFile(join(run, "job.json"), "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    },
  );
  if (rawJob === null) {
    if (report.status !== "incomplete" || report.findings.length)
      throw new Error("A preparation failure cannot contain findings or claim completion");
    return report;
  }
  const job = jobSchema.parse(JSON.parse(rawJob));
  if (job.repository.base !== base || job.repository.head !== head)
    throw new Error("Report revisions do not match the pinned pull request");
  const response = await readFile(join(run, "response.json"), "utf8")
    .then((data) => JSON.parse(data))
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return { events: [] };
    });
  return validateReport(
    report,
    response.events,
    job,
    await readFile(join(run, "change.diff"), "utf8"),
  );
}
