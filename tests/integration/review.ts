import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { mkdtemp, writeFile, readFile, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import assert from "node:assert/strict";
import { command, quote } from "../../src/process.ts";
import { startContextServer } from "./fixtures/requirements-mcp.ts";

const { values } = parseArgs({ options: { profile: { type: "string" } } });
const directory = await mkdtemp(join(tmpdir(), "kicktires-smoke-"));
const requirementId = `COUNTER-${randomUUID()}`;
const server = startContextServer(requirementId);
await once(server, "listening");
const address = server.address();
assert(address && typeof address !== "string");
const git = (...args: string[]) =>
  command(
    "git",
    ["-c", "user.name=Validation", "-c", "user.email=validation@example.invalid", ...args],
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
  await writeFile(join(directory, "README.md"), "Counter example.\n");
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
      values.profile
        ? resolve(values.profile)
        : new URL("../../examples/profile.json", import.meta.url),
      "utf8",
    ),
  );
  Object.assign(profile, {
    instructions: `Use requirements MCP get_requirement with exact ID ${requirementId}. Run run_checks on both revisions, then browser_check to assert output starts at 0 and becomes 1 after clicking Increment on both revisions. Do not change source to make assertions pass; report bugs and verification gaps.`,
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
        description: "Look up counter product requirements by exact ID",
        tools: ["get_requirement"],
      },
    },
  });
  const profilePath = join(directory, "profile.json");
  const failures: string[] = [];
  for (const scenario of [
    "clean",
    "regression",
    "adaptive",
    "docs",
    "blocked",
    "browser-blocked",
  ]) {
    try {
      git("checkout", "--detach", base);
      const adaptive = scenario === "adaptive";
      const browserBlocked = scenario === "browser-blocked";
      const regression = scenario === "regression" || adaptive;
      const documentation = scenario === "docs" || scenario === "blocked";
      let activeProfile = documentation
        ? {
            ...profile,
            instructions:
              "Review this documentation change. Use execution only if needed to investigate it.",
            setup: { network: "deny-all", commands: scenario === "blocked" ? ["exit 42"] : [] },
          }
        : profile;
      if (adaptive)
        activeProfile = {
          ...profile,
          setup: { network: "deny-all", commands: [] },
          instructions: `Review this change using requirement ${requirementId} from requirements MCP get_requirement.`,
        };
      if (browserBlocked)
        activeProfile = {
          ...profile,
          setup: { network: "deny-all", commands: [] },
          browser: { start: 'case "$PWD" in */head) exit 42;; *) node app.cjs;; esac' },
        };
      await writeFile(profilePath, JSON.stringify(activeProfile));
      await writeFile(
        join(directory, "app.cjs"),
        regression
          ? app.replace("textContent)+1", "textContent)-1")
          : documentation
            ? app
            : app.replace("Content-Type", "content-type"),
      );
      await writeFile(
        join(directory, "README.md"),
        documentation
          ? `Counter example. Use Increment to add one. ${scenario}.\n`
          : "Counter example.\n",
      );
      git("add", "app.cjs", "README.md");
      git("commit", "-qm", `test: ${scenario} review`);
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
        ],
        {
          cwd: new URL("../..", import.meta.url).pathname,
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [stdout, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      assert.equal(exit, scenario === "blocked" || browserBlocked ? 2 : 0, stderr || stdout);
      const report = JSON.parse(stdout);
      if (scenario === "blocked" || browserBlocked) {
        assert.equal(report.status, "incomplete");
        assert(report.gaps.length > 0);
        assert.equal(
          report.findings.length,
          0,
          "Infrastructure failure was reported as a code defect",
        );
        if (browserBlocked) {
          assert(
            report.browserExecutions.some(
              (e: { revision: string; exitCode: number }) =>
                e.revision === "base" && e.exitCode === 0,
            ),
          );
          assert(
            report.browserExecutions.some(
              (e: { revision: string; exitCode: number }) =>
                e.revision === "head" && e.exitCode !== 0,
            ),
          );
        }
        console.log(
          JSON.stringify({ scenario, status: report.status, directory: report.directory }),
        );
        continue;
      }
      assert(
        (await stat(join(report.directory, ".eve/.workflow-data"))).isDirectory(),
        "Review must own its workflow store",
      );
      assert.equal(report.status, "reviewed");
      if (regression)
        assert(
          report.findings.some(
            (f: { file: string; line: number; side: string }) =>
              f.file === "app.cjs" && f.line === 2 && f.side === "RIGHT",
          ),
          "Regression was not identified",
        );
      else assert.equal(report.findings.length, 0, "Harmless change produced a finding");
      if (scenario === "docs") {
        assert.equal(report.findings.length, 0);
        assert(
          !report.executions.some((e: { tool: string }) => e.tool === "run_checks"),
          "Documentation review ran the configured suite unnecessarily",
        );
        assert.equal(
          report.browserExecutions.length,
          0,
          "Documentation review ran unnecessary browser checks",
        );
        console.log(
          JSON.stringify({ scenario, status: report.status, directory: report.directory }),
        );
        continue;
      }
      if (adaptive)
        assert(
          report.browserExecutions.length > 0 || report.executions.length > 0,
          "The reviewer did not investigate the behavioral regression with execution",
        );
      for (const revision of adaptive ? [] : ["base", "head"]) {
        assert(
          report.executions.some(
            (e: { revision: string; tool: string }) =>
              e.revision === revision && e.tool === "run_checks",
          ),
          "Requested checks were not recorded",
        );
        assert(
          report.browserExecutions.some((e: { revision: string }) => e.revision === revision),
          "Requested browser investigation was not recorded",
        );
      }
      const response = JSON.parse(await readFile(join(report.directory, "response.json"), "utf8"));
      assert(
        response.events.some(
          (e: { type: string; data: { result?: { toolName?: string; output?: unknown } } }) =>
            e.type === "action.result" &&
            e.data.result?.toolName?.includes("get_requirement") &&
            JSON.stringify(e.data.result.output ?? null).includes(requirementId),
        ),
        "MCP requirement was not fetched",
      );
      console.log(
        JSON.stringify({
          scenario,
          status: report.status,
          directory: report.directory,
        }),
      );
    } catch (error) {
      failures.push(scenario);
      console.error(`Scenario ${scenario} failed:`, error);
    }
  }
  assert.equal(failures.length, 0, `Failed scenarios: ${failures.join(", ")}`);
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await rm(directory, { recursive: true, force: true });
}
