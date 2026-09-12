import { join } from "node:path";
import { lstat, readFile, rm } from "node:fs/promises";
import { z } from "zod";
import { appSchema, validateApp } from "./app.ts";
import { appApi } from "./app-api.ts";
import { api, gh, optionalApi, secret } from "./github.ts";
import { registrationUrl, registrationCode } from "./app-handoff.ts";
import { ask, openBrowser } from "./terminal.ts";
import { readPrivate, savePrivate } from "./state.ts";
import { addWorkflow, workflowPullRequest } from "./workflow.ts";

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
  ready: z.boolean().default(false),
  workflow: z.url().nullable().optional(),
  appState: z.string().optional(),
});

export async function connect(directory: string, authenticate: () => Promise<void>) {
  const statePath = join(directory, "github.json");
  const saved = await readPrivate(statePath);
  const previous = saved ? stateSchema.parse(saved) : undefined;
  if (previous?.ready && previous.appSlug)
    return { ...previous, reviewer: `${previous.appSlug}[bot]` };
  await authenticate();
  const sourceInput = z
    .string()
    .regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/)
    .parse(previous?.source ?? (await ask("Repository to review (OWNER/REPO)")));
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
  if (source.owner.type === "User" && owner.toLowerCase() !== account.toLowerCase())
    throw new Error(
      "Sign into the repository owner’s GitHub account for personal-repository setup.",
    );
  const hubName = z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/)
    .parse(
      previous?.hub.split("/")[1] ??
        ((await ask("Private hub name [kicktires-worker]")) || "kicktires-worker"),
    );
  const hub = `${owner}/${hubName}`;
  if (hub.toLowerCase() === source.full_name.toLowerCase())
    throw new Error("The private hub must be separate from the source repository.");
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
  if (existingHub && !saved) throw new Error(`${hub} already exists. Choose a new hub name.`);
  if (existingHub) {
    const repo = repositorySchema.parse(existingHub);
    if (!repo.private || !repo.permissions.admin)
      throw new Error("The hub must be private and you must have admin access.");
  }
  console.log(`GitHub: ${account}\nSource: ${source.full_name}\nPrivate hub: ${hub}`);
  if ((await ask("Continue? [y/N]")).toLowerCase() !== "y")
    throw new Error("Installation cancelled.");
  await savePrivate(directory, "github.json", state);
  if (!existingHub) {
    await gh(["repo", "create", hub, "--private", "--add-readme"]);
    const created = repositorySchema.parse(await api(`/repos/${hub}`));
    if (created.default_branch !== "main")
      await api(`/repos/${hub}/branches/${encodeURIComponent(created.default_branch)}/rename`, {
        new_name: "main",
      });
  }

  const pendingPath = join(directory, "app.json");
  if (!state.credentials) {
    let pending = await readPrivate(pendingPath);
    const appId = pending ? "" : await ask("Existing review App ID [Enter to create one]");
    if (!pending && appId) {
      const keyPath = await ask("Private key file on this VM");
      const info = await lstat(keyPath);
      if (!info.isFile() || info.uid !== process.getuid?.() || info.mode & 0o077)
        throw new Error("The App key must be a private file owned by your account (chmod 600).");
      const credentials = {
        id: z.coerce.number().int().positive().parse(appId),
        pem: await readFile(keyPath, "utf8"),
      };
      pending = appSchema.parse({ ...(await appApi(credentials, "/app")), pem: credentials.pem });
      validateApp(appSchema.parse(pending), owner);
      await savePrivate(directory, "app.json", pending);
    }
    if (!pending) {
      state.appState ??=
        crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
      await savePrivate(directory, "github.json", state);
      await openBrowser(
        registrationUrl(owner, source.owner.type === "Organization", state.appState),
      );
      const code = registrationCode(
        await ask("Paste the App confirmation URL (hidden)", true),
        state.appState,
      );
      const response = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
        method: "POST",
        headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new Error(
          "GitHub App registration failed. Check the App in GitHub before retrying installation.",
        );
      pending = appSchema.parse(await response.json());
      validateApp(appSchema.parse(pending), owner);
      await savePrivate(directory, "app.json", pending);
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
          "The App is not installed on the source repository. Rerun the installer after installing the App.",
        );
    }
    await secret(hub, "KICKTIRES_APP_PRIVATE_KEY", app.pem);
    await gh(["variable", "set", "KICKTIRES_APP_ID", "--repo", hub, "--body", String(app.id)]);
    state.appId = app.id;
    state.appSlug = app.slug;
    state.credentials = true;
    await savePrivate(directory, "github.json", state);
    await rm(pendingPath);
  }
  if (!hasDispatch || !state.dispatch) {
    console.log(`Create a fine-grained token for ${hub} only, with Actions read/write.`);
    await openBrowser("https://github.com/settings/personal-access-tokens/new");
    const token = await ask("Paste the token (hidden)", true);
    if (!token.startsWith("github_pat_")) throw new Error("Use a fine-grained GitHub token.");
    const access = await fetch(`https://api.github.com/repos/${hub}/actions/workflows`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(30000),
    });
    if (!access.ok)
      throw new Error(
        "The token cannot access Actions on the private hub. Check its repository, permissions and approval status.",
      );
    await secret(source.full_name, "KICKTIRES_DISPATCH_TOKEN", token);
    state.dispatch = true;
    await savePrivate(directory, "github.json", state);
  }
  await gh(["variable", "set", "KICKTIRES_HUB", "--repo", source.full_name, "--body", hub]);
  const hubRepo = repositorySchema.parse(await api(`/repos/${hub}`));
  if (hubRepo.default_branch !== "main") throw new Error("The hub default branch must be main.");
  if (!state.ready) {
    await addWorkflow(
      hub,
      "main",
      ".github/workflows/review.yml",
      await readFile(new URL("../../examples/github-hub-workflow.yml", import.meta.url), "utf8"),
    );
    const pr = await workflowPullRequest(
      source.full_name,
      source.default_branch,
      await readFile(new URL("../../examples/github-submit-workflow.yml", import.meta.url), "utf8"),
    );
    state.ready = true;
    state.workflow = pr;
    await savePrivate(directory, "github.json", state);
  }
  if (!state.appSlug) throw new Error("Saved installation has no review App.");
  return { ...state, reviewer: `${state.appSlug}[bot]` };
}
