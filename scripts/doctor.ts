import { parseArgs } from "node:util";
import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { profileSchema, modelCredentialEnv } from "../src/profile.ts";
import { loadSkills } from "../src/skills.ts";

const { values } = parseArgs({
  options: {
    profile: { type: "string" },
    worker: { type: "boolean" },
    credentials: { type: "boolean" },
    help: { type: "boolean" },
  },
});
if (values.help || !values.profile) {
  console.log(
    "Usage: bun --no-env-file scripts/doctor.ts --profile TRUSTED.json [--worker] [--credentials]\nChecks installation without model calls or repository execution. Run --worker as the runner account; --credentials also checks required environment variables.",
  );
  process.exit(values.help ? 0 : 1);
}
let failures = 0;
async function check(label: string, action: () => unknown | Promise<unknown>) {
  try {
    await action();
    console.log(`PASS ${label}`);
  } catch (error) {
    failures++;
    console.error(
      `FAIL ${label}: ${error instanceof Error ? error.message : error}`,
    );
  }
}
function run(file: string, args: string[], hint: string) {
  const result = spawnSync(file, args, {
    encoding: "utf8",
    timeout: 10000,
    cwd: "/",
  });
  if (result.error || result.status !== 0) throw new Error(hint);
  return result.stdout.trim();
}
await check("Node 24+", () => {
  run(
    "node",
    ["-e", 'if (+process.versions.node.split(".")[0] < 24) process.exit(1)'],
    "Install Node 24+ and select it in PATH.",
  );
});
await check("Bun 1.3.12+", () => {
  const [major = 0, minor = 0, patch = 0] = Bun.version.split(".").map(Number);
  if (major < 1 || (major === 1 && (minor < 3 || (minor === 3 && patch < 12))))
    throw new Error("Install Bun 1.3.12+.");
});
await check("Docker access", () =>
  run(
    "docker",
    ["info"],
    "Start Docker and grant this account access to its daemon.",
  ),
);
await check("Review sandbox image", () =>
  run(
    "docker",
    ["image", "inspect", "agent-review-sandbox:0.1.0"],
    "Run bun run sandbox on the worker.",
  ),
);
const profilePath = resolve(values.profile);
await check("Trusted profile and skills", async () => {
  const profile = profileSchema.parse(
    JSON.parse(await readFile(profilePath, "utf8")),
  );
  const credentialNames = [
    profile.model.apiKeyEnv,
    ...Object.values(profile.connections).map((c) => c.tokenEnv),
  ];
  if (
    credentialNames.some(
      (name) => name && /^(GITHUB_|GH_|ACTIONS_|GIT_)/.test(name),
    )
  )
    throw new Error(
      "Model/MCP credentials cannot use GitHub, Actions or Git variable names.",
    );
  await loadSkills(
    profile.skills.map((path) => resolve(dirname(profilePath), path)),
  );
  if (profile.model.provider === "chatgpt")
    throw new Error(
      "Subscription login is not verified for unattended installation; configure an API provider.",
    );
  if (values.credentials) {
    const key = modelCredentialEnv(profile.model);
    for (const name of [
      key,
      ...Object.values(profile.connections).map((c) => c.tokenEnv),
    ])
      if (name && !process.env[name])
        throw new Error(
          `Supply ${name} in the process environment; never put its value in the profile.`,
        );
  }
});
let installation = resolve(import.meta.dir, "..");
if (values.worker) {
  await check("Worker release and launcher", async () => {
    const commit = (await readFile("/etc/agent-review/release", "utf8")).trim();
    if (!/^[a-f0-9]{40}$/.test(commit))
      throw new Error("Expected a full commit in /etc/agent-review/release.");
    installation = `/opt/agent-review/releases/${commit}`;
    for (const path of [
      "/etc/agent-review/release",
      "/opt/agent-review/bin/review-pr",
      profilePath,
      installation,
      "/opt/agent-review",
      "/opt/agent-review/releases",
      "/opt/agent-review/bin",
      "/opt/agent-review/runtime/bin",
      "/etc/agent-review",
    ]) {
      const info = await stat(path);
      if (info.uid !== 0 || info.mode & 0o022)
        throw new Error(
          `Make ${path} root-owned and not group/world-writable.`,
        );
    }
    await access("/opt/agent-review/bin/review-pr", constants.X_OK);
    if (
      !(await readFile("/opt/agent-review/bin/review-pr")).equals(
        await readFile(join(installation, "scripts/run-github-review.sh")),
      )
    )
      throw new Error(
        "Installed launcher differs from the active release. Update it during release activation.",
      );
    run(
      "/opt/agent-review/runtime/bin/node",
      ["-e", 'if (+process.versions.node.split(".")[0] < 24) process.exit(1)'],
      "Upgrade worker Node to 24+.",
    );
    run(
      "/opt/agent-review/runtime/bin/bun",
      [
        "--no-env-file",
        "-e",
        'const [a,b,c]=Bun.version.split(".").map(Number); if(a<1 || (a===1 && (b<3 || (b===3 && c<12)))) process.exit(1)',
      ],
      "Upgrade worker Bun to 1.3.12+.",
    );
  });
  await check("Shared review lock", async () => {
    await access("/var/lock/agent-review/review.lock", constants.W_OK);
    const parent = await stat("/var/lock/agent-review");
    if (parent.uid !== 0 || parent.mode & 0o022)
      throw new Error(
        "Make the lock directory root-owned and not group/world-writable.",
      );
    const tmpfiles = await readFile(
      "/etc/tmpfiles.d/agent-review.conf",
      "utf8",
    );
    if (
      !tmpfiles.includes(
        "f /run/lock/agent-review/review.lock 0660 root agent-review -",
      )
    )
      throw new Error(
        "Run install-worker.sh to configure the review lock after reboot.",
      );
    run("flock", ["--version"], "Install util-linux (flock).");
    run("timeout", ["--version"], "Install coreutils (timeout).");
  });
  await check("Private runner home", async () => {
    if (!process.env.HOME)
      throw new Error("Set HOME to the runner account's home.");
    await access(process.env.HOME, constants.W_OK);
    const info = await stat(process.env.HOME);
    if (info.mode & 0o077)
      throw new Error("Set the runner home permissions to 700.");
  });
}
await check("Compiled Eve application", async () => {
  await access(join(installation, ".output/server/index.mjs"), constants.R_OK);
});
console.log(
  failures
    ? `${failures} check(s) failed. Fix these before starting a review.`
    : "Preflight passed. Next, validate the repository checks in a real review.",
);
process.exitCode = failures ? 1 : 0;
