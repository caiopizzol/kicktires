import type { ChildProcess } from "node:child_process";
import { once } from "node:events";

export async function stopService(server: ChildProcess) {
  if (!server.pid || server.exitCode !== null || server.signalCode !== null) return;
  const pid = server.pid;
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-pid, name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  };
  const exited = once(server, "exit", { signal: AbortSignal.timeout(10000) });
  const force = setTimeout(() => signal("SIGKILL"), 5000);
  try {
    signal("SIGTERM");
    await exited;
  } finally {
    clearTimeout(force);
  }
}
