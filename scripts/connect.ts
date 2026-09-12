import { homedir } from "node:os";
import { join } from "node:path";
import { lstat, readFile, rm } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { appSchema, startAppRegistration, validateApp } from "../src/setup/app.ts";
import { appApi } from "../src/setup/app-api.ts";
import { api, gh, optionalApi, secret } from "../src/setup/github.ts";
import { encodePairing } from "../src/setup/pairing.ts";
import { ask, openBrowser } from "../src/setup/terminal.ts";
import { privateDirectory, readPrivate, savePrivate, savePrivateText } from "../src/setup/state.ts";
import { addWorkflow, workflowPullRequest } from "../src/setup/workflow.ts";

const repositorySchema = z.object({
  full_name: z.string(),
  private: z.boolean(),
  default_branch: z.string(),
  owner: z.object({ login: z.string(), type: z.enum(["User", "Organization"]) }),
  permissions: z.object({ admin: z.boolean() }),
});
const stateSchema = z.object({
  source: z.string(),
  hub: z.string(),
  appId: z.number().optional(),
  appSlug: z.string().optional(),
  credentials: z.boolean().default(false),
  dispatch: z.boolean().default(false),
});

async function connect() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      hub: { type: "string" },
      app: { type: "string" },
      key: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help || positionals.length !== 1) {
    console.log(
      "Usage: bun scripts/connect.ts OWNER/REPO [--hub NAME] [--app ID --key FILE]\nConnect a repository to a private Kicktires worker. Requires gh auth login.\nUse --app and --key to reuse a review App. Run again to resume setup.",
    );
    process.exitCode = values.help ? 0 : 1;
    return;
  }
  if (Boolean(values.app) !== Boolean(values.key))
    throw new Error("Supply --app ID and --key FILE together.");
  const checkout = join(import.meta.dir, "..");
  const git = (args: string[]) =>
    Bun.spawnSync(["git", ...args], { cwd: checkout, stdout: "pipe", stderr: "ignore" });
  const release = git(["rev-parse", "HEAD"]).stdout.toString().trim();
  if (
    !/^[a-f0-9]{40}$/.test(release) ||
    git(["diff", "--quiet", "HEAD", "--"]).exitCode !== 0 ||
    git(["ls-files", "--error-unmatch", "scripts/connect.ts"]).exitCode !== 0
  )
    throw new Error("Run connect from a clean, committed Kicktires checkout.");
  const sourceInput = z
    .string()
    .regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/)
    .parse(positionals[0]);
  const account = z.object({ login: z.string() }).parse(await api("/user")).login;
  const configured = Bun.spawnSync(["git", "config", "github.account"], {
    stdout: "pipe",
    stderr: "ignore",
  })
    .stdout.toString()
    .trim();
  if (configured && configured !== account)
    throw new Error(`GitHub CLI is signed in as ${account}; this checkout expects ${configured}.`);
  const source = repositorySchema.parse(await api(`/repos/${sourceInput}`));
  if (!source.permissions.admin) throw new Error("Repository admin access is required for setup.");
  const owner = source.owner.login;
  const hubName = z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/)
    .parse(values.hub ?? "kicktires-worker");
  const hub = `${owner}/${hubName}`;
  if (hub.toLowerCase() === source.full_name.toLowerCase())
    throw new Error("The private hub must be separate from the source repository.");
  const directory = join(homedir(), ".local", "state", "kicktires", owner, hubName);
  await privateDirectory(directory);
  const statePath = join(directory, "setup.json");
  const saved = await readPrivate(statePath);
  const state = stateSchema.parse(saved ?? { source: source.full_name, hub });
  if (state.source !== source.full_name || state.hub !== hub)
    throw new Error("This setup belongs to a different repository. Choose another hub name.");
  const sourceHub = await optionalApi(`/repos/${source.full_name}/actions/variables/KICKTIRES_HUB`);
  if (sourceHub && z.object({ value: z.string() }).parse(sourceHub).value !== hub)
    throw new Error(
      "The source repository is already connected to another hub. Setup will not replace it.",
    );
  const secrets = z
    .array(z.object({ name: z.string() }))
    .parse(JSON.parse(await gh(["secret", "list", "--repo", source.full_name, "--json", "name"])));
  const hasDispatch = secrets.some((item) => item.name === "KICKTIRES_DISPATCH_TOKEN");
  if (hasDispatch && !saved)
    throw new Error("The source already has a dispatch credential. Use its existing setup.");
  const existingHub = await optionalApi(`/repos/${hub}`);
  if (existingHub && !saved) throw new Error(`${hub} already exists. Use --hub with a new name.`);
  if (existingHub) {
    const repo = repositorySchema.parse(existingHub);
    if (!repo.private || !repo.permissions.admin)
      throw new Error("The hub must be private and you must have admin access.");
  }
  console.log(`GitHub: ${account}\nSource: ${source.full_name}\nPrivate hub: ${hub}`);
  if ((await ask("Continue? [y/N]")).toLowerCase() !== "y") return;
  await savePrivate(directory, "setup.json", state);
  if (!existingHub) await gh(["repo", "create", hub, "--private", "--add-readme"]);

  const pendingPath = join(directory, "app.json");
  if (!state.credentials) {
    let pending = await readPrivate(pendingPath);
    if (!pending && values.app && values.key) {
      const info = await lstat(values.key);
      if (!info.isFile() || info.uid !== process.getuid?.() || info.mode & 0o077)
        throw new Error("The App key must be a private file owned by your account (chmod 600).");
      const credentials = {
        id: z.coerce.number().int().positive().parse(values.app),
        pem: await readFile(values.key, "utf8"),
      };
      pending = appSchema.parse({ ...(await appApi(credentials, "/app")), pem: credentials.pem });
      validateApp(appSchema.parse(pending), owner);
      await savePrivate(directory, "app.json", pending);
    }
    if (!pending) {
      const registration = startAppRegistration({
        owner,
        organization: source.owner.type === "Organization",
        name: `kicktires-${owner}-${crypto.randomUUID().slice(0, 8)}`,
        exchange: async (code) => {
          const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
            method: "POST",
            headers: {
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2026-03-10",
            },
            signal: AbortSignal.timeout(30000),
          });
          if (!response.ok) throw new Error("GitHub App registration failed.");
          return response.json();
        },
      });
      try {
        await openBrowser(registration.url);
        pending = await registration.result;
        await savePrivate(directory, "app.json", pending);
      } finally {
        registration.close();
      }
    }
    const app = appSchema.parse(pending);
    validateApp(app, owner);
    let installation = await appApi(app, `/repos/${source.full_name}/installation`);
    if (!installation) {
      await openBrowser(`https://github.com/apps/${app.slug}/installations/new`);
      await ask(`Install the App on ${source.full_name}, then press Enter`);
      installation = await appApi(app, `/repos/${source.full_name}/installation`);
      if (!installation)
        throw new Error(
          "The App is not installed on the source repository. Run connect again after installation.",
        );
    }
    await secret(hub, "KICKTIRES_APP_PRIVATE_KEY", app.pem);
    await gh(["variable", "set", "KICKTIRES_APP_ID", "--repo", hub, "--body", String(app.id)]);
    state.appId = app.id;
    state.appSlug = app.slug;
    state.credentials = true;
    await savePrivate(directory, "setup.json", state);
    await rm(pendingPath);
  }
  if (!hasDispatch || !state.dispatch) {
    console.log(`Create a fine-grained token for ${hub} only, with Actions read/write.`);
    await openBrowser("https://github.com/settings/personal-access-tokens/new");
    const token = await ask("Paste the token (hidden)", true);
    if (!token.startsWith("github_pat_")) throw new Error("Use a fine-grained GitHub token.");
    await secret(source.full_name, "KICKTIRES_DISPATCH_TOKEN", token);
    state.dispatch = true;
    await savePrivate(directory, "setup.json", state);
  }
  await gh(["variable", "set", "KICKTIRES_HUB", "--repo", source.full_name, "--body", hub]);
  const hubRepo = repositorySchema.parse(await api(`/repos/${hub}`));
  if (hubRepo.default_branch !== "main") throw new Error("The hub default branch must be main.");
  await addWorkflow(
    hub,
    "main",
    ".github/workflows/review.yml",
    await readFile(new URL("../examples/github-hub-workflow.yml", import.meta.url), "utf8"),
  );
  const pr = await workflowPullRequest(
    source.full_name,
    source.default_branch,
    await readFile(new URL("../examples/github-submit-workflow.yml", import.meta.url), "utf8"),
  );
  const registration = z
    .object({ token: z.string(), expires_at: z.iso.datetime() })
    .parse(await api(`/repos/${hub}/actions/runners/registration-token`, {}));
  const pairing = encodePairing({
    version: 1,
    hub,
    source: source.full_name,
    reviewer: `${state.appSlug}[bot]`,
    release,
    token: registration.token,
    expires: registration.expires_at,
  });
  const pairingPath = join(directory, "pairing.txt");
  await savePrivateText(directory, "pairing.txt", `${pairing}\n`);
  if (process.platform === "darwin") {
    const copy = Bun.spawn(["pbcopy"], { stdin: "pipe", stdout: "ignore", stderr: "ignore" });
    copy.stdin.write(pairing);
    await copy.stdin.end();
    if ((await copy.exited) === 0) console.log("Pairing code copied to your clipboard.");
  }
  console.log(
    `\nPairing code saved to ${pairingPath}\nOn your worker, run sudo kicktires setup and paste this code. It expires in one hour.`,
  );
  console.log(
    `Worker install:\ncurl -fsSL https://kicktires.dev/install.sh -o /tmp/kicktires-install.sh\nsudo sh /tmp/kicktires-install.sh --version ${release}`,
  );
  if (pr) console.log(`After the worker is ready, merge ${pr}`);
  console.log(
    "Open a same-repository pull request to verify the Kicktires check before making it required.",
  );
}

try {
  await connect();
} catch (error) {
  console.error(
    error instanceof z.ZodError
      ? "Invalid setup data. Check the supplied repository and saved setup."
      : error instanceof Error
        ? error.message
        : "Setup failed.",
  );
  process.exitCode = 1;
}
