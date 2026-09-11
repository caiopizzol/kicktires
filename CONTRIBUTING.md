# Contributing

Read [the product scope](PRODUCT.md) before proposing a change.

## Development

Use Git, Node 24+ and Bun 1.3.12+.

```sh
bun install --frozen-lockfile
bun run check
bun run build
```

`check` runs Vite+ formatting and lint checks, TypeScript (including scripts), and
Bun regression tests. Vite+ is pinned; Eve remains the application builder.
Use `bun run format` to format, `bun run lint` to lint and `bun run typecheck` to
check types. Installation enables the precommit hook: staged checks plus full-project
type checking. Hooks require development dependencies. CI also runs tests and the build.
Tests need neither Docker nor model keys.
Rebuild after source changes; profile changes need no build.

For agent, skill, model or sandbox changes, also run the paid integration test with
Docker and `OPENAI_API_KEY` (or a trusted Codex profile):

```sh
bun run sandbox
bun run build
bun run test:integration
# Or: bun run test:integration --profile /absolute/codex-profile.json
```

The integration test reviews a harmless change and a seeded browser regression. It checks terminal
and browser execution, MCP context, source restoration after setup, and separate
workflow state per run. The regression must produce a finding and incomplete status.
Private reports stay in `.runs/`; temporary input repositories are removed. Investigate
failures rather than assuming a model's conclusion is correct.

For shell changes, run `sh -n` on each changed script. Validate installer behavior on
Linux; shell syntax alone does not verify installation.

## Structure

| Path          | Purpose                                                  |
| ------------- | -------------------------------------------------------- |
| `agent/`      | Eve definitions, instructions, hooks and tools           |
| `src/cli.ts`  | Review orchestration and service lifecycle               |
| `src/`        | Profiles, models, skills, snapshots and sandbox helpers  |
| `src/review/` | Diff coordinates, report schemas and evidence validation |
| `src/github/` | GitHub events, execution and publication                 |
| `sandbox/`    | Browser helper installed in the Docker image             |
| `scripts/`    | Installation, preflight and live validation              |
| `tests/`      | Regression tests                                         |
| `examples/`   | Starting profile and workflow                            |

Use kebab-case filenames except Eve tool files, whose snake_case names become tool IDs.
Keep modules direct and fixtures near their tests. `tests/integration/` contains the
paid end-to-end review and its local MCP fixture.

## Scripts

| Entry point                           | Purpose                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `install.sh`                          | Bootstrap an Ubuntu VM, then install the worker                            |
| `scripts/install-worker.sh`           | Install a committed release when prerequisites exist                       |
| `scripts/review-pr.sh`                | Installed as `review-pr`; select the release, lock and run a GitHub review |
| `bun run doctor -- --profile PROFILE` | Check local prerequisites and trusted configuration without model calls    |
| `bun run test:integration`            | Run paid reviews against a temporary repository and MCP fixture            |

## Changes

Preserve required verification and [upgrade requirements](docs/upgrading.md).
Evidence validation checks references and execution, not whether a finding is true.
Add focused regression tests for behavior changes; avoid tests that mirror cosmetic edits.
Use conventional commits and describe the change and its verification.

Keep builds, credentials and private run data out of Git. Before making existing
history public, review it for earlier operator records too.

## Hosted installer

`kicktires.dev/install.sh` and the domain root serve the same pinned installer through
Cloudflare Workers. Publish a committed, tested revision with:

```sh
bun scripts/deploy-installer.ts FULL_COMMIT_SHA
```

Set `CF_TOKEN` in the environment or the ignored `.env`. The token needs Worker script,
custom-domain and zone access. The deployed script contains no credentials; private
source downloads use the installer's own `GH_TOKEN`. Verify the published script and
`X-Kicktires-Version` header after deployment.
