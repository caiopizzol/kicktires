import type { Api } from "./review.ts";

export function githubApi(token: string): Api {
  return async (path, body) => {
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
    if (!response.ok) throw new Error(`GitHub API returned ${response.status} for ${path}`);
    return response.json();
  };
}
