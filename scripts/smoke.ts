import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import assert from "node:assert/strict";
import { command, quote } from "../src/process.ts";
import { startContextServer } from "./context-server.ts";

const directory = await mkdtemp(join(tmpdir(), "agent-review-smoke-"));
const server = startContextServer();
await once(server, "listening");
const address = server.address();
assert(address && typeof address !== "string");
const git = (...args: string[]) =>
  command(
    "git",
    [
      "-c",
      "user.name=Validation",
      "-c",
      "user.email=validation@example.invalid",
      ...args,
    ],
    directory,
  )
    .toString()
    .trim();
try {
  git("init", "-q");
  const app = `const http=require("node:http");
const html=\`<title>Counter</title><button aria-label="Increment" onclick="document.querySelector('output').textContent=Number(document.querySelector('output').textContent)+1">Increment</button><output>0</output>\`;
http.createServer((_req,res)=>{res.setHeader("Content-Type","text/html");res.end(html);}).listen(Number(process.env.PORT),"127.0.0.1");
`;
  await writeFile(join(directory, "app.cjs"), app);
  await writeFile(
    join(directory, "app.test.cjs"),
    `const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
test("initial count and accessible control",()=>{const source=fs.readFileSync("app.cjs","utf8");assert.match(source,/<output>0<\\/output>/);assert.match(source,/aria-label="Increment"/);});`,
  );
  git("add", ".");
  git("commit", "-qm", "test: add counter");
  const base = git("rev-parse", "HEAD");
  const profile = JSON.parse(
    await readFile(
      new URL("../examples/profile.json", import.meta.url),
      "utf8",
    ),
  );
  Object.assign(profile, {
    setup: {
      network: "deny-all",
      commands: [
        `node -e ${quote('const fs=require("node:fs");fs.writeFileSync("app.cjs",fs.readFileSync("app.cjs","utf8").replace("textContent)+1","textContent)-1"));')}`,
      ],
    },
    checks: ["node --test app.test.cjs"],
    browser: { start: "node app.cjs" },
    connections: {
      requirements: {
        url: `http://127.0.0.1:${address.port}/mcp`,
        description: "Counter requirement COUNTER-1",
        tools: ["get_requirement"],
      },
    },
  });
  const profilePath = join(directory, "profile.json");
  await writeFile(profilePath, JSON.stringify(profile));
  for (const regression of [false, true]) {
    await writeFile(
      join(directory, "app.cjs"),
      regression
        ? app.replace("textContent)+1", "textContent)-1")
        : app.replace("Content-Type", "content-type"),
    );
    git("add", "app.cjs");
    git(
      "commit",
      "-qm",
      regression
        ? "test: introduce regression"
        : "refactor: normalize header casing",
    );
    const child = Bun.spawn(
      [
        "bun",
        "src/cli.ts",
        "--repo",
        directory,
        "--base",
        base,
        "--head",
        "HEAD",
        "--profile",
        profilePath,
        "--context",
        "Use requirements MCP get_requirement with exact ID COUNTER-1. Run run_checks on both revisions, then browser_check to assert output starts at 0 and becomes 1 after clicking Increment on both revisions. Do not change source to make assertions pass; report bugs and verification gaps.",
      ],
      {
        cwd: new URL("..", import.meta.url).pathname,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    assert.equal(exit, regression ? 2 : 0, stderr || stdout);
    const report = JSON.parse(stdout);
    assert.equal(report.status, regression ? "incomplete" : "reviewed");
    if (regression)
      assert(
        report.findings.some((f: { file: string }) => f.file === "app.cjs"),
        "Regression was not identified",
      );
    const response = JSON.parse(
      await readFile(join(report.directory, "response.json"), "utf8"),
    );
    assert(
      response.events.some(
        (e: { type: string; data: { result?: { toolName?: string } } }) =>
          e.type === "action.result" &&
          e.data.result?.toolName?.includes("get_requirement"),
      ),
      "MCP requirement was not fetched",
    );
    console.log(
      JSON.stringify({
        regression,
        status: report.status,
        directory: report.directory,
      }),
    );
  }
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await rm(directory, { recursive: true, force: true });
}
