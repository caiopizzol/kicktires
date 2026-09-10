# Contributing

Read [the product scope](PRODUCT.md) before proposing a change.

## Development

Use Git, Node 24+ and Bun 1.3.12+.

```sh
bun install --frozen-lockfile
bun run check
bun run build
```

`check` runs formatting checks, TypeScript (including scripts), and regression tests.
Use `bun run format` to apply formatting. Tests need neither Docker nor model keys.
Rebuild after source changes; profile changes need no build.

For agent, skill, model or sandbox changes, also run the paid integration test with
Docker and `OPENAI_API_KEY`:

```sh
bun run sandbox
bun run build
bun run smoke
```

Smoke reviews a harmless change and a seeded browser regression. It checks terminal
and browser execution, MCP context, source restoration after setup, and separate
workflow state per run. The regression must produce a finding and incomplete status.
Private reports stay in `.runs/`; temporary input repositories are removed. Investigate
failures rather than assuming a model's conclusion is correct.

For shell changes, run `sh -n` on each changed script. Validate installer behavior on
Linux; shell syntax alone does not verify installation.

## Structure

| Path                      | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `agent/`                  | Eve definitions, instructions, hooks and tools           |
| `src/cli.ts`              | Review orchestration and service lifecycle               |
| `src/`                    | Profiles, models, skills, snapshots and sandbox helpers  |
| `src/review/`             | Diff coordinates, report schemas and evidence validation |
| `src/github/`             | GitHub events, execution and publication                 |
| `sandbox/`                | Browser helper installed in the Docker image             |
| `packages/review-skills/` | Portable Markdown skills                                 |
| `scripts/`                | Installation, preflight and live validation              |
| `tests/`                  | Regression tests                                         |
| `examples/`               | Starting profile and workflow                            |

Use kebab-case filenames except Eve tool files, whose snake_case names become tool IDs.
Keep modules direct and fixtures near their tests. `scripts/context-server.ts` is a
smoke fixture, not a production connector.

## Changes

Preserve required verification and [compatibility contracts](docs/compatibility.md).
Evidence validation checks references and execution, not whether a finding is true.
Add focused regression tests for behavior changes; avoid tests that mirror cosmetic edits.
Use conventional commits and describe the change and its verification.

Keep builds, credentials and private run data out of Git. Before making existing
history public, review it for earlier operator records too.
