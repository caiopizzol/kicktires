import { expect, test } from "bun:test";
import { runnerService, verifyRunner } from "../src/setup/runner.ts";

test("runner registration accepts GitHub's UTF-8 BOM and rejects a different hub", () => {
  const registration =
    '\uFEFF{"gitHubUrl":"https://github.com/owner/worker/","agentName":"worker"}';
  expect(() => verifyRunner(registration, "owner/worker")).not.toThrow();
  expect(() => verifyRunner(registration, "owner/other")).toThrow("another repository");
});

test("service control accepts only an Actions runner unit", () => {
  expect(runnerService("actions.runner.owner-hub.worker.service\n")).toBe(
    "actions.runner.owner-hub.worker.service",
  );
  for (const name of [
    "ssh.service",
    "../../ssh.service",
    "--all",
    "actions.runner.bad.service\nssh.service",
  ])
    expect(() => runnerService(name)).toThrow("Invalid runner service");
});
