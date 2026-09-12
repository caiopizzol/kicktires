import { expect, test } from "bun:test";
import { decodePairing, encodePairing } from "../src/setup/pairing.ts";
import { runnerService, verifyRunner } from "../src/setup/runner.ts";

const pairing = {
  version: 1 as const,
  hub: "owner/worker",
  source: "owner/project",
  reviewer: "review[bot]",
  release: "a".repeat(40),
  token: "test",
  expires: new Date(Date.now() + 60000).toISOString(),
};
test("pairing accepts a current same-owner worker and rejects expired or cross-owner codes", () => {
  expect(decodePairing(encodePairing(pairing))).toEqual(pairing);
  expect(() => encodePairing({ ...pairing, source: "another/project" })).toThrow();
  expect(() =>
    decodePairing(encodePairing({ ...pairing, expires: "2020-01-01T00:00:00Z" })),
  ).toThrow("expired");
  expect(() => decodePairing("a".repeat(9000))).toThrow("Invalid pairing code");
});

test("pairing accepts GitHub timestamps with timezone offsets", () => {
  const offset = new Date(Date.now() + 3600000).toISOString().replace("Z", "+00:00");
  expect(decodePairing(encodePairing({ ...pairing, expires: offset })).expires).toBe(offset);
});

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
