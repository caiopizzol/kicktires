import { rm } from "node:fs/promises";
import { z } from "zod";
import { privateDirectory } from "../src/setup/state.ts";
import { connect } from "../src/setup/connect.ts";
import { configureWorker } from "../src/setup/worker.ts";
import { api, signIn } from "../src/setup/github.ts";

async function install() {
  if (process.platform !== "linux" || process.getuid?.() !== 0 || !process.stdin.isTTY)
    throw new Error("Run the installer as root in an interactive terminal on the worker VM.");
  const directory = "/var/lib/kicktires/install";
  await privateDirectory(directory);
  const auth = "/run/kicktires-install-gh";
  await rm(auth, { recursive: true, force: true });
  await privateDirectory(auth);
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
      "Sign into GitHub to configure your repositories. This temporary login is removed after installation.",
    );
    await signIn();
    authenticated = true;
  };
  try {
    console.log(
      "Keep your browser ready for GitHub sign-in, App creation/installation, a hub dispatch token and Codex sign-in.",
    );
    const connection = await connect(directory, authenticate);
    await configureWorker(connection, async () => {
      await authenticate();
      const hub = z.object({ private: z.boolean() }).parse(await api(`/repos/${connection.hub}`));
      if (!hub.private)
        throw new Error(
          "The worker hub must be private. Restore its visibility before rerunning the installer.",
        );
      return z
        .object({ token: z.string() })
        .parse(await api(`/repos/${connection.hub}/actions/runners/registration-token`, {})).token;
    });
    if (connection.workflow) console.log(`\nMerge the workflow PR: ${connection.workflow}`);
    console.log(
      `Open a same-repository PR and wait for the review. Require the kicktires status from ${connection.appSlug}, alongside your existing CI checks.`,
    );
    console.log(
      "GitHub sign-in removed from this VM on exit. Its GitHub CLI authorization remains in your GitHub settings.",
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
