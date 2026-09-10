# Agent Review

Self-hosted code reviews with real terminal checks, optional browser verification,
and your own model, skills, and MCP context tools. Built on [Eve](https://github.com/vercel/eve).

This first version is a CLI: give it a local Git repository, two revisions and a
trusted profile. It returns a JSON report with findings, verification gaps and tool
evidence. Reviewed code runs in disposable Docker workspaces.

## Start

Requires Node 24+, Bun 1.3.12+ and a running Docker daemon.

```sh
bun install --frozen-lockfile
bun run sandbox
bun run build
bun run check
```

Copy `examples/profile.json` to your own trusted configuration directory. Set its
model ID and check commands for the repository you want to review. Export the model's
API key through your shell or secret manager, then run:

```sh
bun run review --repo /path/to/repository \
  --base main --head feature \
  --profile /path/to/trusted-profile.json \
  --context 'Review the changed behavior and relevant callers.'
```

Build once after changing the application. Profiles and review inputs are loaded at
runtime; changing them does not require a new agent build. Dirty working-tree changes
are excluded. Revisions are resolved to commit IDs before the review starts.

Each run prints its private `.runs/review-*/` directory. `report.json` is the main
result; `response.json`, `events.jsonl`, `setup.jsonl`, screenshots and `server.log`
provide supporting evidence. These artifacts can contain private source and context.
Eve also keeps local session state under `.eve/`. Both directories are ignored by Git.

Exit codes: `0` means the requested review completed (it may contain bugs); `2` means
verification was incomplete or execution failed; `1` means input or startup preflight
failed. A successful review is not a guarantee that a change is correct.

## Configure capabilities

See [configuration](docs/configuration.md) for the full profile and
[execution boundaries](docs/execution.md) for networking, isolation and limitations.

- **Models:** Fireworks, OpenAI and Anthropic API providers; Eve's separate ChatGPT
  subscription login path. See the verification status below before choosing one.
- **Skills:** the bundled review workflow plus additional `SKILL.md` directories.
- **Terminal:** required checks run verbatim through `run_checks`; `run_command`
  permits further investigation and temporary reproductions inside the container.
- **Browser:** Playwright starts the configured app and runs assertions against it.
- **Context:** native Eve MCP connections with operator-selected tool allowlists and
  host-side credential references.

Skills describe how to work; the application supplies actual capabilities. Adding a
skill does not grant terminal access, install a dependency or create a connection.

## Develop and verify

```sh
bun run check       # formatting, types and focused regression tests
bun run build       # compile Eve application
bun run smoke       # two live model reviews: clean counter and browser regression
```

The smoke command requires the sandbox image and `FIREWORKS_API_KEY`. It starts a
local MCP fixture, creates temporary Git commits, runs terminal and Chromium checks,
and asserts that the clean case completes and the regression is identified. Setup
deliberately modifies tracked source to verify restoration before checks. It uses
paid model calls. Its context server is a validation fixture, not a production connector.

Structure:

```text
agent/                   Eve definitions, capabilities and instructions
src/                     trusted configuration, snapshots, CLI and reports
sandbox/                 browser execution helper baked into the Docker image
packages/review-skills/   portable Markdown skills; no Eve dependency
examples/                trusted profile examples
scripts/                 live integration validation
tests/                  focused regression tests
```

See [PRODUCT.md](PRODUCT.md) for scope and [validation](docs/validation.md) for measured
results and known gaps. Keep generated builds (`.output/`, `.eve/`) and run artifacts
out of source control; this application does not require a committed `dist/` bundle.

## Share skills with another agent

`packages/review-skills` is an independent package containing `review-code`,
`get-context` and `verify-change`. Install or copy a pinned package into another
service's native skill loader. That service supplies its own tools and credentials;
it does not need this application or Eve. See the [package README](packages/review-skills/README.md).

Slack functionality, a settings UI, GitHub comment publishing, automatic fixes and
automatic approvals are outside this first version.
