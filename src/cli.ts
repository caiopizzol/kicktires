import { parseArgs } from "node:util";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  open,
  chmod,
  realpath,
} from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { Client } from "eve/client";
import { profileSchema } from "./profile.ts";
import { snapshotRepository } from "./repository.ts";
import { loadSkills } from "./skills.ts";
import { assertModelAccess } from "./model.ts";
import type { FileHandle } from "node:fs/promises";
import { stopService } from "./service.ts";
import { cleanupSandbox } from "./cleanup.ts";
import { jobSchema } from "./job.ts";
import { reportJSONSchema, validateReport } from "./review/report.ts";

const root = resolve(import.meta.dir, "..");
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    repo: { type: "string" },
    base: { type: "string" },
    head: { type: "string" },
    profile: { type: "string" },
    context: { type: "string" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(
    "Usage: bun run review --repo PATH --base REF --head REF --profile TRUSTED.json [--context TEXT]\nBuild once with bun run build. Every review gets a private .runs directory and an isolated Docker workspace.",
  );
  process.exit(0);
}
for (const name of ["repo", "base", "head", "profile"] as const)
  if (!values[name]) throw new Error(`Missing --${name}; run --help`);
const profilePath = resolve(values.profile!);
const profile = profileSchema.parse(
  JSON.parse(await readFile(profilePath, "utf8")),
);
assertModelAccess(profile.model);
for (const connection of Object.values(profile.connections))
  if (connection.tokenEnv && !process.env[connection.tokenEnv])
    throw new Error(`Missing connection credential: ${connection.tokenEnv}`);
const runs = resolve(process.env.AGENT_REVIEW_RUNS_DIR ?? join(root, ".runs"));
await mkdir(runs, { recursive: true, mode: 0o700 });
await chmod(runs, 0o700);
const directory = await mkdtemp(join(runs, "review-"));
let outcome: ReturnType<typeof validateReport> | undefined;
let server: ChildProcess | undefined;
let log: FileHandle | undefined;
let session:
  | Awaited<ReturnType<Client["sessions"]["create"]>>["session"]
  | undefined;
const interruption = new AbortController();
const interrupt = () => interruption.abort(new Error("Review interrupted"));
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
try {
  const repository = await snapshotRepository(
    resolve(values.repo!),
    values.base!,
    values.head!,
    directory,
  );
  const skills = await loadSkills(
    profile.skills.map((path) => resolve(dirname(profilePath), path)),
  );
  const job = jobSchema.parse({
    id: directory.split("/").at(-1),
    directory,
    repository,
    skills,
    profile,
  });
  await writeFile(join(directory, "job.json"), JSON.stringify(job, null, 2), {
    mode: 0o600,
  });
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  if (!address || typeof address === "string")
    throw new Error("No local port available");
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const password = randomBytes(32).toString("hex"),
    host = `http://127.0.0.1:${address.port}`;
  log = await open(join(directory, "server.log"), "w", 0o600);
  const serverEntry = await realpath(join(root, ".output/server/index.mjs"));
  server = spawn("node", [serverEntry], {
    cwd: directory,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(address.port),
      NITRO_HOST: "127.0.0.1",
      NITRO_PORT: String(address.port),
      WORKFLOW_LOCAL_BASE_URL: host,
      WORKFLOW_LOCAL_DATA_DIR: join(directory, ".eve/.workflow-data"),
      NODE_ENV: "production",
      AGENT_REVIEW_JOB: join(directory, "job.json"),
      AGENT_REVIEW_PASSWORD: password,
    },
    stdio: ["ignore", log.fd, log.fd],
    detached: true,
  });
  const deadline = Date.now() + 120000;
  while (true) {
    interruption.signal.throwIfAborted();
    if (
      server.exitCode !== null ||
      server.signalCode !== null ||
      Date.now() > deadline
    )
      throw new Error(
        `Service startup failed; inspect ${directory}/server.log`,
      );
    try {
      if (
        (
          await fetch(`${host}/eve/v1/health`, {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      )
        break;
    } catch {}
    await Bun.sleep(250);
  }
  if (
    (
      await fetch(`${host}/eve/v1/info`, {
        signal: AbortSignal.any([
          interruption.signal,
          AbortSignal.timeout(5000),
        ]),
      })
    ).status !== 401
  )
    throw new Error("Review service did not enforce authentication");
  const client = new Client({
    host,
    auth: { basic: { username: "reviewer", password } },
  });
  const turn = await client.sessions.create({
    message: `First call load_skill for review-code, get-context, and verify-change. Then review /workspace/review.json and /workspace/change.diff using those skills. Use run_checks on both base and head to execute the required checks. Cite tool call IDs as evidenceRefs. Additional user context: ${values.context ?? "None supplied."}`,
    outputSchema: reportJSONSchema,
    signal: AbortSignal.any([
      interruption.signal,
      AbortSignal.timeout(profile.limits.reviewSeconds * 1000),
    ]),
  });
  session = turn.session;
  const result = await turn.response.result();
  await writeFile(
    join(directory, "response.json"),
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  outcome = validateReport(
    result.data ?? {
      summary: "Review ended before producing a report",
      status: "incomplete",
      findings: [],
      gaps:
        result.status === "failed"
          ? ["Agent execution failed; inspect events.jsonl and server.log"]
          : result.inputRequests.map((request) => request.prompt),
    },
    result.events,
    job,
    await readFile(join(directory, "change.diff"), "utf8"),
  );
} catch (error) {
  outcome = {
    executions: [],
    browserExecutions: [],
    status: "incomplete",
    summary: "Review could not finish",
    findings: [],
    gaps: [error instanceof Error ? error.message : String(error)],
  };
} finally {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
  if (session)
    await session
      .reset({ reason: "Review finished", signal: AbortSignal.timeout(5000) })
      .catch((error) =>
        console.error("Session retirement failed:", error.message),
      );
  try {
    if (server) await stopService(server);
  } catch (error) {
    console.error("Service shutdown failed:", error);
    if (outcome) {
      outcome.status = "incomplete";
      outcome.gaps.push(error instanceof Error ? error.message : String(error));
    }
  }
  await log?.close();
  try {
    await cleanupSandbox(directory);
  } catch (error) {
    console.error("Sandbox cleanup failed:", error);
    if (outcome) {
      outcome.status = "incomplete";
      outcome.gaps.push(error instanceof Error ? error.message : String(error));
    }
  }
}

if (outcome) {
  await writeFile(
    join(directory, "report.json"),
    JSON.stringify(outcome, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ directory, ...outcome }, null, 2));
  if (outcome.status === "incomplete") process.exitCode = 2;
}
