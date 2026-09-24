import { z } from "zod";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { stopService } from "./service.ts";
import { version } from "../package.json";

export const codexVersion = "0.156.1";

export function assertCodexHome(home: string | undefined): asserts home is string {
  if (!home || !isAbsolute(home)) throw new Error("codex requires an absolute model.home");
  for (const file of ["config.toml", "AGENTS.md", "hooks.json", ".agents", "rules"]) {
    if (existsSync(join(home, file)))
      throw new Error(`Use a dedicated Codex login home without ${file}: ${home}`);
  }
  const skills = join(home, "skills");
  if (
    existsSync(skills) &&
    (lstatSync(skills).isSymbolicLink() || readdirSync(skills).some((name) => name !== ".system"))
  )
    throw new Error("Dedicated Codex home cannot contain custom skills");
  const auth = join(home, "auth.json");
  if (!existsSync(auth))
    throw new Error(
      `Sign in first: CODEX_HOME=${home} bunx --no-install codex login --device-auth`,
    );
  const info = lstatSync(auth);
  if (!info.isFile() || info.mode & 0o077)
    throw new Error("Codex auth.json must be a regular private file (mode 600)");
}

// These settings disable execution, not just the tools' advertised descriptions.
export const codexConfig = [
  "agents.enabled=false",
  'web_search="disabled"',
  "project_doc_max_bytes=0",
  "mcp_servers={}",
  ...[
    "shell_tool",
    "unified_exec",
    "apps",
    "hooks",
    "browser_use",
    "computer_use",
    "image_generation",
    "view_image",
    "multi_agent",
    "code_mode",
    "code_mode_host",
    "memories",
    "remote_plugin",
  ].map((key) => `features.${key}=false`),
  "features.skip_host_skill_discovery=true",
];

type CodexOptions = { cli: string; home: string; signal?: AbortSignal; timeoutMs?: number };
type Request = (method: string, params: unknown) => Promise<any>;
type Usage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};
type Response = { text: string; usage: Usage | undefined };

const turnStatus = z.enum(["completed", "interrupted", "failed", "inProgress"]);
const errorCode = z.enum([
  "contextWindowExceeded",
  "sessionBudgetExceeded",
  "usageLimitExceeded",
  "rateLimitExceeded",
  "serverOverloaded",
  "cyberPolicy",
  "misalignmentPolicyViolation",
  "httpConnectionFailed",
  "responseStreamConnectionFailed",
  "internalServerError",
  "unauthorized",
  "badRequest",
  "threadRollbackFailed",
  "sandboxError",
  "responseStreamDisconnected",
  "responseTooManyFailedAttempts",
  "activeTurnNotSteerable",
  "other",
]);

export function incompleteTurnMessage(turn: {
  status?: unknown;
  error?: { codexErrorInfo?: unknown } | null;
}) {
  const status = turnStatus.safeParse(turn.status).data ?? "unknown";
  const info = turn.error?.codexErrorInfo;
  const code = errorCode.safeParse(
    info && typeof info === "object" ? Object.keys(info)[0] : info,
  ).data;
  return `Codex turn did not complete with a response (status: ${status}, code: ${code ?? "unknown"})`;
}

async function withCodex<T>(
  options: CodexOptions,
  action: (request: Request, completed: Promise<Response>, directory: string) => Promise<T>,
) {
  assertCodexHome(options.home);
  const directory = await mkdtemp(join(tmpdir(), "kicktires-codex-"));
  const child = spawn(
    "node",
    [options.cli, "app-server", ...codexConfig.flatMap((value) => ["-c", value])],
    {
      cwd: directory,
      env: { PATH: process.env.PATH, HOME: directory, CODEX_HOME: options.home },
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    },
  );
  let sequence = 0,
    buffer = "",
    bytes = 0,
    final = "",
    failure: Error | undefined;
  let usage:
    | {
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
        reasoningOutputTokens: number;
      }
    | undefined;
  let resolveTurn!: (result: { text: string; usage: typeof usage }) => void,
    rejectTurn!: (error: Error) => void;
  const completed = new Promise<{ text: string; usage: typeof usage }>((resolve, reject) => {
    resolveTurn = resolve;
    rejectTurn = reject;
  });
  void completed.catch(() => {});
  const pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();
  function fail(error: Error) {
    failure ??= error;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    rejectTurn(error);
  }
  function send(message: unknown) {
    child.stdin.write(JSON.stringify(message) + "\n");
  }
  function request(method: string, params: unknown): Promise<any> {
    if (failure) return Promise.reject(failure);
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send({ id, method, params });
    });
  }
  child.on("error", fail);
  child.stdin.on("error", fail);
  child.on("exit", () => fail(new Error("Codex exited before the response completed")));
  child.stderr.on("data", () => {});
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    try {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 16 * 1024 * 1024) throw new Error("Codex response exceeded 16 MiB");
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const message = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        if (message.method && message.id !== undefined) {
          send({
            id: message.id,
            error: {
              code: -32601,
              message: "kicktires does not execute Codex tools or approve actions",
            },
          });
          throw new Error(`Unexpected Codex server request: ${message.method}`);
        }
        if (message.id !== undefined) {
          const waiter = pending.get(message.id);
          pending.delete(message.id);
          if (message.error) waiter?.reject(new Error(message.error.message));
          else waiter?.resolve(message.result);
        } else if (message.method === "item/started" || message.method === "item/completed") {
          const item = message.params.item;
          if (!["agentMessage", "userMessage", "reasoning"].includes(item.type))
            throw new Error(`Codex attempted an unsupported action: ${item.type}`);
          if (
            message.method === "item/completed" &&
            item.type === "agentMessage" &&
            item.phase !== "commentary"
          )
            final = item.text;
        } else if (message.method === "thread/tokenUsage/updated") {
          usage = z
            .object({
              inputTokens: z.number().int().nonnegative(),
              cachedInputTokens: z.number().int().nonnegative(),
              outputTokens: z.number().int().nonnegative(),
              reasoningOutputTokens: z.number().int().nonnegative(),
            })
            .refine(
              (u) =>
                u.cachedInputTokens <= u.inputTokens && u.reasoningOutputTokens <= u.outputTokens,
            )
            .parse(message.params.tokenUsage.total);
        } else if (message.method === "turn/completed") {
          if (message.params.turn.status !== "completed" || !final)
            throw new Error(incompleteTurnMessage(message.params.turn));
          if (!usage) throw new Error("Codex omitted token usage");
          resolveTurn({ text: final, usage });
        }
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
  const signal = AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    AbortSignal.timeout(options.timeoutMs ?? 180000),
  ]);
  const abort = () => fail(new Error("Codex response cancelled or timed out"));
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const initialized = await request("initialize", {
      clientInfo: { name: "kicktires", version },
      capabilities: { experimentalApi: true },
    });
    if (!String(initialized.userAgent).includes(`/${codexVersion} `))
      throw new Error(`Expected Codex CLI ${codexVersion}`);
    send({ method: "initialized" });
    return await action(request, completed, directory);
  } finally {
    signal.removeEventListener("abort", abort);
    await stopService(child);
    await rm(directory, { recursive: true, force: true });
  }
}

const catalogPage = z.object({
  data: z.array(
    z.object({
      model: z.string().min(1),
      defaultReasoningEffort: z.string().min(1),
      supportedReasoningEfforts: z.array(z.object({ reasoningEffort: z.string().min(1) })),
    }),
  ),
  nextCursor: z.string().nullish(),
});

export async function resolveCodexSettings(
  options: CodexOptions & { model: string; reasoningEffort?: string },
) {
  return withCodex(options, async (request) => {
    let cursor: string | undefined;
    const seen = new Set<string>();
    const available: string[] = [];
    do {
      const page = catalogPage.parse(
        await request("model/list", { limit: 100, includeHidden: true, cursor }),
      );
      for (const entry of page.data) {
        available.push(entry.model);
        if (entry.model !== options.model) continue;
        const reasoningEffort = options.reasoningEffort ?? entry.defaultReasoningEffort;
        const supported = entry.supportedReasoningEfforts.map((item) => item.reasoningEffort);
        if (!supported.includes(reasoningEffort))
          throw new Error(
            `Codex model ${options.model} does not support reasoning effort ${reasoningEffort}. Supported: ${supported.join(", ")}`,
          );
        return { id: entry.model, reasoningEffort };
      }
      cursor = page.nextCursor ?? undefined;
      if (cursor && seen.has(cursor)) throw new Error("Codex model catalog repeated a cursor");
      if (cursor) seen.add(cursor);
    } while (cursor);
    throw new Error(`Unknown Codex model ${options.model}. Available: ${available.join(", ")}`);
  });
}

export async function codexResponse(
  options: CodexOptions & {
    model: string;
    reasoningEffort?: string;
    prompt: string;
    schema: unknown;
  },
) {
  return withCodex(options, async (request, completed, directory) => {
    const catalog = z
      .object({
        data: z.array(
          z.object({
            skills: z.array(z.object({ path: z.string().min(1) })),
            errors: z.array(z.unknown()).length(0),
          }),
        ),
      })
      .parse(await request("skills/list", { cwds: [directory], forceReload: true }));
    const started = await request("thread/start", {
      model: options.model,
      config: {
        ...(options.reasoningEffort ? { model_reasoning_effort: options.reasoningEffort } : {}),
        "skills.config": catalog.data.flatMap((entry) =>
          entry.skills.map((skill) => ({ path: skill.path, enabled: false })),
        ),
      },
      cwd: directory,
      approvalPolicy: "never",
      sandbox: "read-only",
      ephemeral: true,
      environments: [],
      selectedCapabilityRoots: [],
      dynamicTools: [],
      baseInstructions:
        "You provide the next response for another agent runtime. Return only the requested structured response. Tool proposals are data; the owning runtime executes them. Do not invoke your own tools.",
    });
    if (
      options.reasoningEffort &&
      (started.model !== options.model || started.reasoningEffort !== options.reasoningEffort)
    )
      throw new Error("Codex did not accept the selected model and reasoning effort");
    await request("turn/start", {
      threadId: started.thread.id,
      environments: [],
      input: [{ type: "text", text: options.prompt }],
      outputSchema: options.schema,
    });
    return completed;
  });
}
