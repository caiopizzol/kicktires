import { spawnSync } from "node:child_process";
import { chmod, lstat, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import { decodePairing } from "../src/setup/pairing.ts";
import { ask } from "../src/setup/terminal.ts";
import { verifyRunner } from "../src/setup/runner.ts";
import { profileSchema } from "../src/profile.ts";
import { hubConfigSchema } from "../src/github/hub.ts";

const user = "kicktires-runner";
const home = `/home/${user}`;
const codexHome = `${home}/.local/share/kicktires/codex`;
const runner = `${home}/actions-runner`;
const profilePath = "/etc/kicktires/profile.json";
const hubPath = "/etc/kicktires/hub.json";
const workerState = "/etc/kicktires/setup.json";
const workerStateSchema = z.strictObject({
  hub: z.string(),
  source: z.string(),
  reviewer: z.string(),
});

function run(
  command: string,
  args: string[],
  options: { asRunner?: boolean; quiet?: boolean; cwd?: string } = {},
) {
  const binary = options.asRunner ? "runuser" : command;
  const parameters = options.asRunner
    ? [
        "-u",
        user,
        "--",
        "env",
        "-i",
        `HOME=${home}`,
        `USER=${user}`,
        `LOGNAME=${user}`,
        `PATH=${process.env.PATH}`,
        `CODEX_HOME=${codexHome}`,
        command,
        ...args,
      ]
    : args;
  const result = spawnSync(binary, parameters, {
    cwd: options.cwd ?? "/",
    stdio: options.quiet ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error || result.status !== 0) {
    let detail = `${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`;
    const tokenIndex = args.indexOf("--token");
    if (tokenIndex >= 0 && args[tokenIndex + 1])
      detail = detail.replaceAll(args[tokenIndex + 1]!, "[redacted]");
    throw new Error(
      `${command} failed. ${detail.slice(-2000).trim() || "Run setup again after fixing the reported problem."}`,
    );
  }
  return result.stdout?.toString().trim() ?? "";
}

async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readTrusted(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || info.uid !== 0 || info.mode & 0o022)
    throw new Error(`Expected a trusted root-owned file: ${path}`);
  return readFile(path, "utf8");
}

async function trustedWrite(path: string, value: unknown, replace = false) {
  if (await exists(path)) {
    const info = await lstat(path);
    if (!info.isFile() || info.uid !== 0 || info.mode & 0o022)
      throw new Error(`Expected a trusted root-owned file: ${path}`);
    if (JSON.stringify(JSON.parse(await readFile(path, "utf8"))) === JSON.stringify(value)) return;
    if (!replace)
      throw new Error(`${path} belongs to another configuration. Setup will not overwrite it.`);
    const temporary = `${path}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644, flag: "wx" });
    await rename(temporary, path);
    return;
  }
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644, flag: "wx" });
}

async function login(release: string) {
  const cli = `${release}/node_modules/@openai/codex/bin/codex.js`;
  const status = spawnSync(
    "runuser",
    [
      "-u",
      user,
      "--",
      "env",
      "-i",
      `HOME=${home}`,
      `PATH=${process.env.PATH}`,
      `CODEX_HOME=${codexHome}`,
      "node",
      cli,
      "login",
      "status",
    ],
    { stdio: "ignore" },
  );
  if (status.status !== 0) run("node", [cli, "login", "--device-auth"], { asRunner: true });
  const auth = `${codexHome}/auth.json`;
  const info = await lstat(auth);
  if (!info.isFile()) throw new Error("Codex login did not create a regular auth.json file.");
  await chmod(auth, 0o600);
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { model: { type: "string" }, help: { type: "boolean" } },
  });
  const action = positionals[0];
  if (values.help || !["setup", "login", "doctor"].includes(action ?? "")) {
    console.log(
      "Usage: sudo kicktires setup [--model ID]\n       sudo kicktires login\n       sudo kicktires doctor",
    );
    process.exitCode = values.help ? 0 : 1;
    return;
  }
  if (process.platform !== "linux" || process.getuid?.() !== 0)
    throw new Error("Run with sudo on the Linux worker.");
  const directory = await lstat("/etc/kicktires");
  if (!directory.isDirectory() || directory.uid !== 0 || directory.mode & 0o022)
    throw new Error("Expected a root-owned /etc/kicktires directory.");
  const sha = (await readTrusted("/etc/kicktires/release")).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Invalid worker release.");
  const release = `/opt/kicktires/releases/${sha}`;
  const doctor = () =>
    run(
      "bun",
      [
        "--no-env-file",
        `${release}/scripts/doctor.ts`,
        "--worker",
        "--profile",
        profilePath,
        "--credentials",
      ],
      { asRunner: true },
    );
  if (action === "doctor") {
    doctor();
    return;
  }
  if (action === "login") {
    await login(release);
    doctor();
    return;
  }
  let saved = (await exists(workerState))
    ? workerStateSchema.parse(JSON.parse(await readTrusted(workerState)))
    : undefined;
  let pairing: ReturnType<typeof decodePairing> | undefined;
  if (!saved || !(await exists(`${runner}/.runner`))) {
    pairing = decodePairing(await ask("Paste the pairing code from your laptop (hidden)", true));
    if (pairing.release !== sha)
      throw new Error(
        `Install release ${pairing.release} before pairing. The active release was not changed.`,
      );
    const visibility = await fetch(`https://api.github.com/repos/${pairing.hub}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (visibility.status !== 404)
      throw new Error("The worker hub must be private. Check the pairing code.");
    const next = { hub: pairing.hub, source: pairing.source, reviewer: pairing.reviewer };
    if (saved && JSON.stringify(saved) !== JSON.stringify(next))
      throw new Error("Pairing code belongs to another worker configuration.");
    saved = next;
  }
  if (!saved) throw new Error("Missing worker configuration.");
  for (const path of [profilePath, hubPath])
    if ((await exists(path)) && !(await exists(workerState)))
      throw new Error(`An existing worker uses ${path}. Setup will not replace it.`);
  const account = spawnSync("getent", ["passwd", user], { encoding: "utf8" });
  if (account.status === 0 && !(await exists(workerState)))
    throw new Error(`${user} already exists outside this setup. Use a dedicated worker.`);
  await trustedWrite(workerState, saved);
  if (account.status !== 0)
    run("useradd", ["--create-home", "--shell", "/bin/bash", "--groups", "docker,kicktires", user]);
  const info = await lstat(home);
  if (!info.isDirectory()) throw new Error("The runner home must be a directory.");
  const fields = run("getent", ["passwd", user], { quiet: true }).split(":");
  if (fields[5] !== home || Number(fields[2]) === 0 || info.uid !== Number(fields[2]))
    throw new Error("The runner account has an unexpected home or owner.");
  await chmod(home, 0o700);
  run("usermod", ["--append", "--groups", "docker,kicktires", user]);
  run("mkdir", ["-p", codexHome], { asRunner: true });
  await chmod(codexHome, 0o700);
  const profile = (await exists(profilePath))
    ? profileSchema.parse(JSON.parse(await readTrusted(profilePath)))
    : { model: { id: values.model ?? "gpt-5.6-terra", home: codexHome } };
  if (values.model !== undefined) profile.model.id = values.model;
  profileSchema.parse(profile);
  if (profile.model.home !== codexHome)
    throw new Error("The profile belongs to another Codex login.");
  if (!(await exists(profilePath)) || values.model !== undefined)
    await trustedWrite(profilePath, profile, values.model !== undefined);
  const hub = {
    repository: saved.hub,
    reviewer: saved.reviewer,
    profiles: { [saved.source]: profilePath },
  };
  hubConfigSchema.parse(hub);
  await trustedWrite(hubPath, hub);
  await login(release);
  doctor();
  if (!(await exists(`${runner}/.runner`))) {
    if (!pairing) throw new Error("Run setup again to renew the pairing code.");
    const platform =
      process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : undefined;
    if (!platform) throw new Error("Supported worker architectures: x64 and arm64.");
    // GitHub supplies the runner asset's digest; verify it before executing the archive.
    const response = await fetch("https://api.github.com/repos/actions/runner/releases/latest", {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error("Could not find the GitHub Actions runner release.");
    const releaseData = z
      .object({
        assets: z.array(
          z.object({
            name: z.string(),
            browser_download_url: z.url(),
            digest: z.string().nullable(),
          }),
        ),
      })
      .parse(await response.json());
    const asset = releaseData.assets.find(
      (item) =>
        item.name.startsWith(`actions-runner-linux-${platform}-`) && item.name.endsWith(".tar.gz"),
    );
    if (
      !asset?.digest?.startsWith("sha256:") ||
      !asset.browser_download_url.startsWith("https://github.com/actions/runner/releases/download/")
    )
      throw new Error("GitHub did not provide a verified runner download.");
    await mkdir(runner, { mode: 0o700, recursive: true });
    const archive = `${runner}/runner.tar.gz`;
    run("curl", ["-fsSL", "--retry", "3", asset.browser_download_url, "-o", archive]);
    const hash = new Bun.CryptoHasher("sha256")
      .update(await Bun.file(archive).arrayBuffer())
      .digest("hex");
    if (`sha256:${hash}` !== asset.digest)
      throw new Error("Runner download checksum does not match GitHub.");
    run("tar", ["-xzf", archive, "-C", runner]);
    run("chown", ["-R", `${user}:${user}`, runner]);
    run(`${runner}/bin/installdependencies.sh`, []);
    run(
      `${runner}/config.sh`,
      [
        "--unattended",
        "--url",
        `https://github.com/${saved.hub}`,
        "--token",
        pairing.token,
        "--name",
        `kicktires-${run("hostname", [], { quiet: true })}`,
        "--labels",
        "kicktires",
        "--work",
        "_work",
      ],
      { asRunner: true, quiet: true, cwd: runner },
    );
  }
  verifyRunner(await readFile(`${runner}/.runner`, "utf8"), saved.hub);
  if (!(await exists(`${runner}/.service`)))
    run(`${runner}/svc.sh`, ["install", user], { cwd: runner });
  run(`${runner}/svc.sh`, ["start"], { cwd: runner });
  run(`${runner}/svc.sh`, ["status"], { cwd: runner });
  console.log(
    `Worker connected to ${saved.hub}. Merge the source workflow, then open a pull request to verify the review.`,
  );
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof z.ZodError
      ? "Invalid worker setup data. Run connect again on your laptop."
      : error instanceof Error
        ? error.message
        : "Worker setup failed.",
  );
  process.exitCode = 1;
}
