import { mkdtemp, rm } from "node:fs/promises";
import { z } from "zod";
import { privateDirectory } from "../src/setup/state.ts";
import { connect } from "../src/setup/connect.ts";
import { configureWorker } from "../src/setup/worker.ts";
import { api } from "../src/setup/github.ts";

async function install() {
  if (process.platform !== "linux" || process.getuid?.() !== 0 || !process.stdin.isTTY)
    throw new Error("Run the installer as root in an interactive terminal on the worker VM.");
  const directory = "/var/lib/kicktires/install";
  await privateDirectory(directory);
  const auth = await mkdtemp(`${directory}/gh-`);
  const previous = process.env.GH_CONFIG_DIR;
  process.env.GH_CONFIG_DIR = auth;
  delete process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_HOST;
  delete process.env.GH_ENTERPRISE_TOKEN;
  delete process.env.GITHUB_ENTERPRISE_TOKEN;
  let authenticated = false;
  const authenticate = async () => {
    if (authenticated) return;
    console.log(
      "Sign into GitHub to configure your repositories. This login is removed from the VM when the installer exits.",
    );
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
      { stdin: "inherit", stdout: "inherit", stderr: "inherit" },
    );
    if ((await child.exited) !== 0)
      throw new Error("GitHub login failed. Rerun the installer to continue.");
    authenticated = true;
  };
  try {
    console.log(
      "Keep your browser ready for GitHub sign-in, App creation/installation, a hub dispatch token and Codex sign-in.",
    );
    const connection = await connect(directory, authenticate);
    await configureWorker(connection, async () => {
      await authenticate();
      return z
        .object({ token: z.string() })
        .parse(await api(`/repos/${connection.hub}/actions/runners/registration-token`, {})).token;
    });
    if (connection.workflow) console.log(`\nMerge the workflow PR: ${connection.workflow}`);
    console.log(
      "Open a same-repository PR and wait for the review. Require the kicktires status from your GitHub App, alongside your existing CI checks.",
    );
  } finally {
    if (previous === undefined) delete process.env.GH_CONFIG_DIR;
    else process.env.GH_CONFIG_DIR = previous;
    await rm(auth, { recursive: true, force: true });
  }
}
try {
  await install();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Installation failed.");
  process.exitCode = 1;
}
