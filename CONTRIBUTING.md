# Contributing to Kick Tires

Start with [the product scope](PRODUCT.md). Kick Tires owns the review workflow,
trusted configuration, evidence validation and reporting. Eve supplies agent execution,
skill loading, tools and sandbox integration.

## Develop

Use Node 24+, Bun 1.3.12+ and Docker for live reviews.

```sh
bun install --frozen-lockfile
bun run check
bun run build
```

`check` formats nothing: it checks formatting, types (including scripts), and focused
tests. `bun run format` applies formatting. Tests need Git but do not call a model or
require Docker. Build compiles the Eve application; rebuild after source changes.

For changes to agent tools, skills, model wiring or sandbox execution, also build the
sandbox with `bun run sandbox` and run `bun run smoke` with `FIREWORKS_API_KEY` set.
This uses paid model calls. It checks clean and seeded-regression reviews with real
terminal, browser and MCP tools. Retain failures and investigate them; a model finding
is not automatically correct. See [validation](docs/validation.md).

For shell changes, run `sh -n` separately on `install.sh`,
`scripts/install-worker.sh` and `scripts/run-github-review.sh`. Installer behavior
requires Linux validation; a Mac syntax check does not establish a working VM install.

## Find the right module

| Path                                              | Responsibility                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| `agent/`                                          | Eve definitions, instructions, hooks and model-facing tools       |
| `src/cli.ts`                                      | Local review orchestration and service lifecycle                  |
| `src/profile.ts`, `src/model.ts`, `src/skills.ts` | Trusted configuration and capability inputs                       |
| `src/repository.ts`, `src/workspace.ts`           | Pinned snapshots and source restoration                           |
| `src/review/`                                     | Diff coordinates, report schemas and recorded-evidence validation |
| `src/github/`                                     | Trusted GitHub event handling, review execution and publication   |
| `sandbox/`                                        | Browser helper installed inside the review image                  |
| `packages/review-skills/`                         | Portable Markdown skills with no Eve dependency                   |
| `scripts/`                                        | Worker installation, preflight and live validation                |
| `tests/`                                          | Focused regression tests                                          |
| `examples/`                                       | Starting profiles and GitHub workflow                             |
| `docs/`                                           | User configuration, operation and supported boundaries            |

Eve tool filenames use snake_case because filenames become tool names. Other source
files use kebab-case. Avoid adding wrapper layers or reorganizing small modules solely
for symmetry. Keep test fixtures with their tests; the MCP context server in `scripts/`
is a smoke fixture, not a shipped connector.

## Change safely

Keep findings tied to the diff and recorded tool calls. These checks establish evidence
references and required execution, not semantic proof that a finding is correct.
Preserve incomplete results when required verification fails.

Review the [compatibility contracts](docs/compatibility.md) before renaming runtime
identifiers. Package branding and installed worker paths have different lifecycles.
Do not commit generated builds, run artifacts, secrets or private deployment records.
Source history may contain earlier operator records; review history separately before
publishing an existing repository.

Describe the concrete change and relevant verification in a conventional commit.
For a behavior change, add a focused regression test when it can meaningfully catch
the problem; documentation and cosmetic changes do not need mirrored tests.
