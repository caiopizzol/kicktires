import type { SandboxSession } from "eve/sandbox";
import { quote } from "./process.ts";

async function capture(stream: ReadableStream<Uint8Array>, limit: number) {
  const chunks: Uint8Array[] = [];
  let kept = 0,
    total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (kept < limit) {
      const part = chunk.subarray(0, limit - kept);
      chunks.push(part);
      kept += part.length;
    }
  }
  return {
    text: Buffer.concat(chunks).toString("utf8"),
    truncated: total > limit,
  };
}
export async function runSandboxCommand(
  sandbox: SandboxSession,
  command: string,
  workingDirectory: string,
  seconds: number,
) {
  const child = await sandbox.spawn({
    command: `timeout -k 5s ${seconds}s bash -lc ${quote(command)}`,
    workingDirectory,
    abortSignal: AbortSignal.timeout((seconds + 10) * 1000),
  });
  try {
    const [out, err, result] = await Promise.all([
      capture(child.stdout, 32768),
      capture(child.stderr, 32768),
      child.wait(),
    ]);
    return {
      ...result,
      stdout: out.text,
      stderr: err.text,
      truncated: out.truncated || err.truncated,
    };
  } catch (error) {
    await Promise.resolve(child.kill()).catch(() => {});
    throw error;
  }
}
