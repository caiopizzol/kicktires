import { expect, test } from "bun:test";
import { registrationUrl, registrationCode, appHandoff } from "../src/setup/app-handoff.ts";
import { reviewPermissions, validateApp } from "../src/setup/app.ts";

const state = "a".repeat(64);
const callback = `https://kicktires.dev/install/connected?state=${state}&code=test-code`;

test("remote App registration posts least-privilege manifest to the right GitHub owner", async () => {
  const response = appHandoff(new Request(registrationUrl("test-owner", true, state)))!;
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain("https://github.com/organizations/test-owner/settings/apps/new");
  expect(html).toContain("https://kicktires.dev/install/connected");
  expect(html).toContain("&quot;statuses&quot;:&quot;write&quot;");
  expect(() => registrationUrl("<script>", false, state)).toThrow();
});

test("App confirmation is not cached and requires the installer's exact state and origin", async () => {
  const response = appHandoff(new Request(callback))!;
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(await response.text()).toContain("Return to your installer");
  expect(registrationCode(callback, state)).toBe("test-code");
  expect(() => registrationCode(callback, "b".repeat(64))).toThrow("another installation");
  expect(() =>
    registrationCode(callback.replace("kicktires.dev", "attacker.example"), state),
  ).toThrow();
  expect(() => registrationCode(callback.replace("test-code", "%3Cscript%3E"), state)).toThrow();
  expect(appHandoff(new Request(callback.replace(state, "bad")))!.status).toBe(400);
});

test("review App must belong to the owner and have only review permissions", () => {
  const app = {
    id: 1,
    slug: "test",
    pem: "-----BEGIN RSA PRIVATE KEY-----\ntest",
    owner: { login: "owner" },
    permissions: reviewPermissions,
  };
  expect(() => validateApp(app, "owner")).not.toThrow();
  expect(() => validateApp(app, "other")).toThrow("different GitHub owner");
  expect(() =>
    validateApp({ ...app, permissions: { ...reviewPermissions, actions: "write" } }, "owner"),
  ).toThrow("additional permissions");
});
