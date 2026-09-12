import { appHandoff } from "../src/setup/app-handoff.ts";
declare const INSTALL_SCRIPT: string;
declare const INSTALL_VERSION: string;

export default {
  fetch(request: Request) {
    const handoff = appHandoff(request);
    if (handoff) return handoff;
    const path = new URL(request.url).pathname;
    if (path !== "/" && path !== "/install" && path !== "/install.sh")
      return new Response("Not found\n", { status: 404 });
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response("Method not allowed\n", { status: 405, headers: { Allow: "GET, HEAD" } });
    return new Response(request.method === "HEAD" ? null : INSTALL_SCRIPT, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "X-Kicktires-Version": INSTALL_VERSION,
      },
    });
  },
};
