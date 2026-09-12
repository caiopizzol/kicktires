import { z } from "zod";
import { spawn } from "node:child_process";

export class GitHubError extends Error {
  constructor(
    public status: number | undefined,
    command: string,
  ) {
    super(
      `GitHub ${command} failed${status ? ` (${status})` : ""}. Check your account and repository access.`,
    );
  }
}

export async function gh(args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let error = "";
    child.stdout.setEncoding("utf8").on("data", (text) => {
      output += text;
    });
    child.stderr.setEncoding("utf8").on("data", (text) => {
      error += text;
    });
    child.on("error", () => reject(new Error("Install GitHub CLI and run gh auth login.")));
    child.on("close", (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(
            new GitHubError(
              Number(error.match(/HTTP (\d{3})/)?.[1]) || undefined,
              args[0] ?? "request",
            ),
          ),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

export async function api(path: string, body?: unknown, method = "POST"): Promise<unknown> {
  const text = await gh(
    ["api", path, ...(body === undefined ? [] : ["--method", method, "--input", "-"])],
    body === undefined ? undefined : JSON.stringify(body),
  );
  return text ? JSON.parse(text) : null;
}

export async function optionalApi(path: string) {
  try {
    return await api(path);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
}

export async function secret(repository: string, name: string, value: string) {
  await gh(["secret", "set", name, "--repo", repository], value);
}

export async function signIn() {
  const child = Bun.spawn(
    [
      "gh",
      "auth",
      "login",
      "--hostname",
      "github.com",
      "--git-protocol",
      "https",
      "--web",
      "--scopes",
      "repo,workflow",
      "--insecure-storage",
    ],
    { env: process.env, stdin: "ignore", stdout: "inherit", stderr: "inherit" },
  );
  if ((await child.exited) !== 0)
    throw new Error("GitHub login failed. Rerun the installer to continue.");
}

export async function runnerToken(repository: string) {
  const hub = z.object({ private: z.boolean() }).parse(await api(`/repos/${repository}`));
  if (!hub.private)
    throw new Error(
      "The worker hub must be private. Restore its visibility before rerunning the installer.",
    );
  return z
    .object({ token: z.string() })
    .parse(await api(`/repos/${repository}/actions/runners/registration-token`, {})).token;
}
