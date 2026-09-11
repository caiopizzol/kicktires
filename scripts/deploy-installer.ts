import { execFileSync } from "node:child_process";

const version = process.argv[2];
if (!version || !/^[a-f0-9]{40}$/.test(version))
  throw new Error("Usage: bun scripts/deploy-installer.ts FULL_COMMIT_SHA");
const token = process.env.CF_TOKEN;
if (!token) throw new Error("CF_TOKEN is required");
const account = "b16758fcd7c22125ce096808f3b01523";
const zone = "7678da37839cc554bbcd23a5057099e6";
const service = "kicktires-installer";
const source = execFileSync("git", ["show", `${version}:install.sh`], { encoding: "utf8" });
const versionDefault = "\nversion=${KICKTIRES_VERSION:-}\n";
if (!source.startsWith("#!/bin/sh\n") || !source.includes(versionDefault))
  throw new Error("Selected installer does not support hosted deployment");
const script = source.replace(versionDefault, `\nversion=\${KICKTIRES_VERSION:-${version}}\n`);
const build = await Bun.build({
  entrypoints: [new URL("installer-worker.ts", import.meta.url).pathname],
  target: "browser",
  define: { INSTALL_SCRIPT: JSON.stringify(script), INSTALL_VERSION: JSON.stringify(version) },
});
if (!build.success) throw new Error(`Worker build failed: ${build.logs.join("\n")}`);
async function api(path: string, method: string, body: BodyInit, json = false) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
    },
    body,
  });
  const result = (await response.json()) as { success: boolean; errors?: unknown };
  if (!response.ok || !result.success)
    throw new Error(`Cloudflare ${path}: ${response.status} ${JSON.stringify(result.errors)}`);
}
const upload = new FormData();
upload.set(
  "metadata",
  JSON.stringify({ main_module: "worker.mjs", compatibility_date: "2026-09-11" }),
);
upload.set(
  "worker.mjs",
  new Blob([await build.outputs[0]!.text()], { type: "application/javascript+module" }),
  "worker.mjs",
);
await api(`workers/scripts/${service}`, "PUT", upload);
await api(
  "workers/domains",
  "PUT",
  JSON.stringify({ hostname: "kicktires.dev", service, environment: "production", zone_id: zone }),
  true,
);
console.log(`Published https://kicktires.dev/install.sh at ${version}`);
