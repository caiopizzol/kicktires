import { reviewPermissions } from "./app.ts";

const origin = "https://kicktires.dev";
const statePattern = /^[a-f0-9]{64}$/;
const ownerPattern = /^[a-zA-Z0-9-]+$/;

export function registrationUrl(owner: string, organization: boolean, state: string) {
  if (!ownerPattern.test(owner) || !statePattern.test(state))
    throw new Error("Invalid App registration request.");
  const url = new URL("/install/app", origin);
  url.search = new URLSearchParams({ owner, organization: String(organization), state }).toString();
  return url.href;
}

export function registrationCode(value: string, state: string) {
  const url = new URL(value);
  if (
    url.origin !== origin ||
    url.pathname !== "/install/connected" ||
    !statePattern.test(state) ||
    url.searchParams.get("state") !== state
  )
    throw new Error(
      "This App confirmation belongs to another installation. Use the link printed here.",
    );
  const code = url.searchParams.get("code");
  if (!code || !/^[a-zA-Z0-9_-]{1,200}$/.test(code))
    throw new Error("Invalid App confirmation code.");
  return code;
}

const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

export function appHandoff(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (!["/install/app", "/install/connected"].includes(url.pathname)) return;
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; form-action https://github.com; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
  };
  const reply = (body: string, status = 200) =>
    new Response(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Install Kicktires</title><style>body{font:18px system-ui;max-width:640px;margin:80px auto;padding:24px;line-height:1.5}button,input{font:inherit;padding:12px}input{box-sizing:border-box;width:100%}</style>${body}`,
      { status, headers },
    );
  if (request.method !== "GET") return reply("Method not allowed.", 405);
  const state = url.searchParams.get("state") ?? "";
  if (!statePattern.test(state)) return reply("Invalid installation link.", 400);
  if (url.pathname === "/install/connected") {
    try {
      registrationCode(url.href, state);
    } catch {
      return reply("Invalid App confirmation.", 400);
    }
    return reply(
      `<h1>Return to your installer</h1><p>Copy this confirmation URL and paste it into the terminal on your VM. It expires after one hour.</p><input aria-label="Confirmation URL" readonly value="${escape(url.href)}"><p>You can close this tab afterward.</p>`,
    );
  }
  const owner = url.searchParams.get("owner") ?? "";
  if (!ownerPattern.test(owner)) return reply("Invalid GitHub owner.", 400);
  const action =
    url.searchParams.get("organization") === "true"
      ? `https://github.com/organizations/${owner}/settings/apps/new`
      : "https://github.com/settings/apps/new";
  const manifest = {
    name: `kicktires-${state.slice(0, 8)}`,
    url: origin,
    redirect_url: `${origin}/install/connected`,
    hook_attributes: { url: origin, active: false },
    public: false,
    default_permissions: reviewPermissions,
    default_events: [],
  };
  return reply(
    `<h1>Connect GitHub</h1><p>Create a review App owned by ${escape(owner)}.</p><form method="post" action="${action}?state=${state}"><input type="hidden" name="manifest" value="${escape(JSON.stringify(manifest))}"><button>Create GitHub App</button></form>`,
  );
}
