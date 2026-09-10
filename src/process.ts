import { spawnSync } from "node:child_process";

export function command(
  file: string,
  args: string[],
  cwd: string,
  input?: string,
  env?: NodeJS.ProcessEnv,
): Buffer {
  const result = spawnSync(file, args, {
    cwd,
    input,
    env,
    timeout: 60000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${file} failed: ${result.stderr.toString().trim()}`);
  return result.stdout;
}
export function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
