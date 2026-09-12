import { randomBytes } from "node:crypto";
import { z } from "zod";

export const appSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  pem: z.string().startsWith("-----BEGIN RSA PRIVATE KEY-----"),
  owner: z.object({ login: z.string() }),
  permissions: z.record(z.string(), z.string()),
});
export type App = z.infer<typeof appSchema>;

export const reviewPermissions = {
  contents: "read",
  pull_requests: "write",
  statuses: "write",
};

export function validateApp(app: App, owner: string) {
  if (app.owner.login.toLowerCase() !== owner.toLowerCase())
    throw new Error("The App belongs to a different GitHub owner.");
  for (const [name, access] of Object.entries(reviewPermissions))
    if (app.permissions[name] !== access) throw new Error(`The App needs ${name}: ${access}.`);
  for (const name of Object.keys(app.permissions))
    if (!(name in reviewPermissions) && name !== "metadata")
      throw new Error("The App has additional permissions. Use a dedicated review App.");
}

export function startAppRegistration(options: {
  owner: string;
  organization: boolean;
  name: string;
  exchange: (code: string) => Promise<unknown>;
  timeoutMs?: number;
}) {
  if (!/^[a-zA-Z0-9-]+$/.test(options.owner)) throw new Error("Invalid GitHub owner.");
  const state = randomBytes(32).toString("hex");
  const result = Promise.withResolvers<App>();
  let exchanging = false;
  let complete = false;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request): Promise<Response> {
      const url = new URL(request.url);
      const headers = {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; form-action https://github.com; frame-ancestors 'none'",
      };
      const reply = (text: string, status = 200) => new Response(text, { status, headers });
      if (request.headers.get("host") !== new URL(server.url).host)
        return reply("Invalid host.", 400);
      if (request.method !== "GET") return reply("Method not allowed.", 405);
      if (url.searchParams.get("state") !== state) return reply("Invalid setup link.", 403);
      if (url.pathname === "/start") {
        const manifest = JSON.stringify({
          name: options.name,
          url: "https://kicktires.dev",
          redirect_url: `${server.url}callback`,
          hook_attributes: { url: "https://kicktires.dev", active: false },
          public: false,
          default_permissions: reviewPermissions,
          default_events: [],
        });
        const action = options.organization
          ? `https://github.com/organizations/${options.owner}/settings/apps/new`
          : "https://github.com/settings/apps/new";
        const escaped = manifest
          .replaceAll("&", "&amp;")
          .replaceAll('"', "&quot;")
          .replaceAll("<", "&lt;");
        return new Response(
          `<!doctype html><meta charset="utf-8"><title>Connect Kicktires</title><h1>Connect GitHub</h1><p>Create a review App owned by ${options.owner}.</p><form method="post" action="${action}?state=${state}"><input type="hidden" name="manifest" value="${escaped}"><button>Create GitHub App</button></form>`,
          { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } },
        );
      }
      if (url.pathname !== "/callback") return reply("Not found.", 404);
      if (complete || exchanging) return reply("This setup link has already been used.", 409);
      const code = url.searchParams.get("code");
      if (!code || !/^[a-zA-Z0-9_-]{1,200}$/.test(code))
        return reply("Missing or invalid GitHub code.", 400);
      exchanging = true;
      try {
        const app = appSchema.parse(await options.exchange(code));
        validateApp(app, options.owner);
        complete = true;
        result.resolve(app);
        return reply("GitHub App created. Return to your terminal.");
      } catch {
        complete = true;
        result.reject(
          new Error(
            "Could not finish App registration. Check the App in GitHub settings before retrying.",
          ),
        );
        return reply("Could not finish registration. Return to your terminal.", 502);
      }
    },
  });
  const timer = setTimeout(
    () => {
      result.reject(new Error("GitHub setup timed out. Run connect again."));
      void server.stop(true);
    },
    options.timeoutMs ?? 10 * 60 * 1000,
  );
  return {
    url: `${server.url}start?state=${state}`,
    result: result.promise,
    close() {
      clearTimeout(timer);
      void server.stop(false);
    },
  };
}
