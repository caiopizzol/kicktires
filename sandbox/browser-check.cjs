const { readFileSync, writeFileSync, createWriteStream } = require("node:fs");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { createServer } = require("node:net");
const assert = require("node:assert/strict");
const { chromium } = require("/opt/browser/node_modules/playwright");

async function main() {
  const config = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const log = createWriteStream(config.log);
  const server = spawn("bash", ["-lc", config.start], {
    cwd: config.directory,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let logBytes = 0;
  for (const stream of [server.stdout, server.stderr])
    stream.on("data", (chunk) => {
      if (logBytes < 32768) log.write(chunk.subarray(0, 32768 - logBytes));
      logBytes += chunk.length;
    });
  let browser;
  try {
    const deadline = Date.now() + 30000;
    while (true) {
      if (server.exitCode !== null || Date.now() > deadline)
        throw new Error("Application did not start; inspect server log");
      try {
        await fetch(origin, { signal: AbortSignal.timeout(500) });
        break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(origin);
    const execute = Object.getPrototypeOf(async function () {}).constructor;
    await new execute("page", "assert", "origin", config.script)(page, assert, origin);
    await page.screenshot({ path: config.screenshot, fullPage: true });
    writeFileSync(
      config.result,
      JSON.stringify({
        url: page.url(),
        title: await page.title(),
        text: (await page.locator("body").innerText()).slice(0, 16000),
      }),
    );
    console.log("Browser script completed");
  } finally {
    if (browser) await browser.close();
    if (server.pid) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        process.kill(-server.pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    log.end();
  }
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});
