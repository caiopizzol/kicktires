import { ask } from "./terminal.ts";
import { spawnSync } from "node:child_process";
import { chmod, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { z } from "zod";
import { runnerService, verifyRunner } from "./runner.ts";
import { profileSchema } from "../profile.ts";
import { hubConfigSchema } from "../github/hub.ts";

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
      `${command} failed. ${detail.slice(-2000).trim() || "Rerun the installer after fixing the reported problem."}`,
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

async function trustedWrite(path: string, value: unknown) {
  if (await exists(path)) {
    const info = await lstat(path);
    if (!info.isFile() || info.uid !== 0 || info.mode & 0o022)
      throw new Error(`Expected a trusted root-owned file: ${path}`);
    if (JSON.stringify(JSON.parse(await readFile(path, "utf8"))) === JSON.stringify(value)) return;
    throw new Error(
      `${path} belongs to another configuration. Installation will not overwrite it.`,
    );
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

export async function configureWorker(
  connection: { hub: string; source: string; reviewer: string },
  registrationToken: () => Promise<string>,
) {
  if (process.platform !== "linux" || process.getuid?.() !== 0)
    throw new Error("Run the installer as root on the Linux worker.");
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
  const saved = workerStateSchema.parse({
    hub: connection.hub,
    source: connection.source,
    reviewer: connection.reviewer,
  });
  if (await exists(workerState)) {
    const previous = workerStateSchema.parse(JSON.parse(await readTrusted(workerState)));
    if (JSON.stringify(previous) !== JSON.stringify(saved))
      throw new Error("This worker belongs to another installation.");
  }
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
    : {
        model: {
          id: (await ask("Codex model [gpt-5.6-terra]")) || "gpt-5.6-terra",
          home: codexHome,
        },
      };
  profileSchema.parse(profile);
  if (profile.model.home !== codexHome)
    throw new Error("The profile belongs to another Codex login.");
  if (!(await exists(profilePath))) await trustedWrite(profilePath, profile);
  const hub = {
    repository: saved.hub,
    reviewer: saved.reviewer,
    profiles: { [saved.source]: profilePath },
  };
  hubConfigSchema.parse(hub);
  if (await exists(hubPath)) {
    const existing = hubConfigSchema.parse(JSON.parse(await readTrusted(hubPath)));
    if (
      existing.repository !== saved.hub ||
      existing.reviewer !== saved.reviewer ||
      existing.profiles[saved.source] !== profilePath
    )
      throw new Error(
        `${hubPath} no longer matches this worker setup. Restore its hub, reviewer and source profile before continuing.`,
      );
  } else await trustedWrite(hubPath, hub);
  await login(release);
  try {
    doctor();
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : "Worker preflight failed."} Check ${profilePath}, then rerun the installer.`,
    );
  }
  if (!(await exists(`${runner}/.runner`))) {
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
    const staging = await mkdtemp("/opt/kicktires/runner-");
    try {
      const archive = `${staging}/runner.tar.gz`;
      run("curl", ["-fsSL", "--retry", "3", asset.browser_download_url, "-o", archive]);
      const hash = new Bun.CryptoHasher("sha256")
        .update(await Bun.file(archive).arrayBuffer())
        .digest("hex");
      if (`sha256:${hash}` !== asset.digest)
        throw new Error("Runner download checksum does not match GitHub.");
      run("tar", ["--no-same-owner", "-xzf", archive, "-C", staging]);
      run(`${staging}/bin/installdependencies.sh`, [], { quiet: true });
      await chmod(staging, 0o755);
      await chmod(archive, 0o644);
      run("mkdir", ["-p", runner], { asRunner: true });
      run("tar", ["-xzf", archive, "-C", runner], { asRunner: true });
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
    run(
      `${runner}/config.sh`,
      [
        "--unattended",
        "--url",
        `https://github.com/${saved.hub}`,
        "--token",
        await registrationToken(),
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
  const registration = verifyRunner(await readFile(`${runner}/.runner`, "utf8"), saved.hub);
  const service = (await exists(`${runner}/.service`))
    ? runnerService(await readFile(`${runner}/.service`, "utf8"))
    : runnerService(
        `actions.runner.${saved.hub.replace("/", "-")}.${registration.agentName}.service`,
      );
  const unitPath = `/etc/systemd/system/${service}`;
  if (!(await exists(`${runner}/runsvc.sh`)))
    run("cp", [`${runner}/bin/runsvc.sh`, `${runner}/runsvc.sh`], { asRunner: true });
  run("chmod", ["755", `${runner}/runsvc.sh`], { asRunner: true });
  if (!(await exists(unitPath))) {
    await writeFile(
      unitPath,
      `[Unit]\nDescription=Kicktires GitHub Actions runner\nAfter=network-online.target\n\n[Service]\nExecStart=${runner}/runsvc.sh\nUser=${user}\nWorkingDirectory=${runner}\nKillMode=process\nKillSignal=SIGTERM\nTimeoutStopSec=5min\n\n[Install]\nWantedBy=multi-user.target\n`,
      { mode: 0o644, flag: "wx" },
    );
  }
  const unit = await lstat(unitPath);
  if (!unit.isFile() || unit.uid !== 0 || unit.gid !== 0 || unit.mode & 0o002)
    throw new Error(`Expected a root-owned service unit: ${unitPath}`);
  run("systemctl", ["daemon-reload"]);
  if (run("systemctl", ["show", service, "--property=User", "--value"], { quiet: true }) !== user)
    throw new Error(
      "The runner service uses another account. Check its systemd unit before continuing.",
    );
  if (!(await exists(`${runner}/.service`)))
    run("bash", ["-c", 'printf "%s\\n" "$1" > .service', "kicktires", service], {
      asRunner: true,
      cwd: runner,
    });
  run("systemctl", ["enable", service]);
  run("systemctl", ["start", service]);
  run("systemctl", ["is-active", "--quiet", service]);
  console.log(`Worker connected to ${saved.hub}.`);
}
