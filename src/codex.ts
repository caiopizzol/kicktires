import { z } from "zod";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { stopService } from "./service.ts";

export const codexVersion = "0.154.0";

export function assertCodexHome(home: string | undefined): asserts home is string {
  if (!home || !isAbsolute(home)) throw new Error("codex requires an absolute model.codexHome");
  for (const file of ["config.toml", "AGENTS.md", "hooks.json", "plugins", ".agents", "rules"]) {
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
  ].map((key) => `features.${key}=false`),
  "features.skip_host_skill_discovery=true",
];

export async function codexResponse(options: {
  cli: string;
  home: string;
  model: string;
  prompt: string;
  schema: unknown;
  signal?: AbortSignal;
}) {
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
            throw new Error("Codex turn did not complete with a response");
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
    AbortSignal.timeout(180000),
  ]);
  const abort = () => fail(new Error("Codex response cancelled or timed out"));
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const initialized = await request("initialize", {
      clientInfo: { name: "kicktires", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    if (!String(initialized.userAgent).includes(`/${codexVersion} `))
      throw new Error(`Expected Codex CLI ${codexVersion}`);
    send({ method: "initialized" });
    const started = await request("thread/start", {
      model: options.model,
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
    await request("turn/start", {
      threadId: started.thread.id,
      environments: [],
      input: [{ type: "text", text: options.prompt }],
      outputSchema: options.schema,
    });
    return await completed;
  } finally {
    signal.removeEventListener("abort", abort);
    await stopService(child);
    await rm(directory, { recursive: true, force: true });
  }
}
