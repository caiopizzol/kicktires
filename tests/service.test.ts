import { test, expect } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { stopService } from "../src/service.ts";

test("shutdown tolerates an already-exited service", async () => {
  const child = spawn("node", ["-e", "process.exit(0)"], {
    detached: true,
    stdio: "ignore",
  });
  await once(child, "exit");
  await stopService(child);
  expect(child.exitCode).toBe(0);
});
test("shutdown forcibly stops a service that ignores SIGTERM", async () => {
  const child = spawn(
    "node",
    [
      "-e",
      "process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)",
    ],
    { detached: true, stdio: ["ignore", "pipe", "ignore"] },
  );
  try {
    await once(child.stdout!, "data");
    await stopService(child);
    expect(child.signalCode).toBe("SIGKILL");
  } finally {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
}, 12000);
