import { expect, test } from "bun:test";
import { decodePairing, encodePairing } from "../src/setup/pairing.ts";

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
