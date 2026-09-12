import { createSign } from "node:crypto";
import type { App } from "./app.ts";

export async function appApi(app: Pick<App, "id" | "pem">, path: string) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: now - 60, exp: now + 300, iss: app.id })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(app.pem, "base64url");
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${unsigned}.${signature}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not verify the GitHub App (${response.status}).`);
  return response.json();
}
