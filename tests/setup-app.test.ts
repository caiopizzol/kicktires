import { expect, test } from "bun:test";
import { startAppRegistration, reviewPermissions } from "../src/setup/app.ts";

const app = {
  id: 1,
  slug: "kicktires-test",
  owner: { login: "test-owner" },
  pem: "-----BEGIN RSA PRIVATE KEY-----\ntest",
  permissions: reviewPermissions,
};

test("manifest handoff validates state and consumes the callback only once", async () => {
  const codes: string[] = [];
  const setup = startAppRegistration({
    owner: "test-owner",
    organization: true,
    name: 'review " <app>',
    exchange: async (code) => {
      codes.push(code);
      return app;
    },
  });
  try {
    const start = await fetch(setup.url);
    const html = await start.text();
    expect(html).toContain("https://github.com/organizations/test-owner/settings/apps/new");
    expect(html).not.toContain("<app>");
    const callback = new URL(setup.url);
    callback.pathname = "/callback";
    callback.searchParams.set("code", "test-code");
    const invalid = new URL(callback);
    invalid.searchParams.set("state", "wrong");
    expect((await fetch(invalid)).status).toBe(403);
    expect(codes).toEqual([]);
    expect((await fetch(callback)).status).toBe(200);
    expect(await setup.result).toEqual(app);
    expect((await fetch(callback)).status).toBe(409);
    expect(codes).toEqual(["test-code"]);
  } finally {
    setup.close();
  }
});

test("wrong App owner fails without exposing the returned private key", async () => {
  const setup = startAppRegistration({
    owner: "someone-else",
    organization: false,
    name: "test",
    exchange: async () => app,
  });
  const failed = setup.result.catch((error: Error) => error.message);
  try {
    const callback = new URL(setup.url);
    callback.pathname = "/callback";
    callback.searchParams.set("code", "test");
    const response = await fetch(callback);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(app.pem);
    expect(await failed).toContain("Could not finish App registration");
  } finally {
    setup.close();
  }
});

test("abandoned browser setup expires", async () => {
  const setup = startAppRegistration({
    owner: "test-owner",
    organization: false,
    name: "test",
    exchange: async () => app,
    timeoutMs: 10,
  });
  try {
    await expect(setup.result).rejects.toThrow("timed out");
  } finally {
    setup.close();
  }
});
