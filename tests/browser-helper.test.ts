import { expect, test } from "bun:test";
import { mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("browser helper preserves script errors through pending-operation rejection and cleanup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kicktires-browser-"));
  try {
    const preload = join(directory, "preload.cjs");
    await writeFile(
      preload,
      `
const Module = require('node:module');
const fs = require('node:fs');
const original = Module._load;
let rejectPending;
const page = {
  goto: async () => {},
  locator: () => ({
    textContent: () => new Promise((_, reject) => { rejectPending = reject; }),
    innerText: async () => '0'
  }),
  screenshot: async ({path}) => fs.writeFileSync(path, 'screenshot'),
  title: async () => 'Counter', url: () => 'http://localhost/'
};
Module._load = function(id, ...args) {
  if (id === '/opt/browser/node_modules/playwright') return {
    chromium: { launch: async () => ({ newPage: async () => page, close: async () => {
      if (rejectPending) rejectPending(new Error('Target page has been closed'));
      fs.writeFileSync(process.env.CLEANUP_MARKER, 'closed');
      await new Promise(resolve => setTimeout(resolve, 20));
    } }) }
  };
  return original.call(this, id, ...args);
};
`,
    );
    await writeFile(
      join(directory, "app.cjs"),
      "require('node:http').createServer((_,res)=>res.end('ok')).listen(process.env.PORT, '127.0.0.1');",
    );
    const run = async (script: string) => {
      await rm(join(directory, "closed"), { force: true });
      const config = join(directory, "config.json");
      await writeFile(
        config,
        JSON.stringify({
          directory,
          start: "node app.cjs",
          script,
          log: join(directory, "server.log"),
          screenshot: join(directory, "shot.png"),
          result: join(directory, "result.json"),
        }),
      );
      const child = Bun.spawn(
        ["node", "--require", preload, resolve("sandbox/browser-check.cjs"), config],
        {
          env: { ...process.env, CLEANUP_MARKER: join(directory, "closed") },
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [exit, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      await access(join(directory, "closed"));
      return { exit, stderr };
    };
    const invalid = await run("await assert(page.locator('output').textContent()).equals('0');");
    expect(invalid.exit).toBe(1);
    expect(invalid.stderr).toContain("TypeError");
    expect(invalid.stderr).toContain("equals");
    expect(invalid.stderr).toContain("Target page has been closed");
    expect(invalid.stderr.indexOf("TypeError")).toBeLessThan(
      invalid.stderr.indexOf("Target page has been closed"),
    );
    const dangling = await run("page.locator('output').textContent(); assert.equal(1, 1);");
    expect(dangling.exit).toBe(1);
    expect(dangling.stderr).toContain("Target page has been closed");
    expect((await run("assert.equal(0, 1);")).exit).toBe(1);
    expect((await run("assert.equal(await Promise.resolve('0'), '0');")).exit).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
