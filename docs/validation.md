# Validation

Use these checks to distinguish local correctness, live execution and deployment
verification. Passing them does not establish general review accuracy.

## Local checks

```sh
bun run check
bun run build
```

The focused tests cover pinned snapshots and symlinks, ignored dirty changes, report
coordinates and evidence references, required skills/checks, service shutdown, GitHub
revision freshness, environment filtering and duplicate publication. Scripts are
included in TypeScript checking. These tests do not require model credentials.

## Live smoke

```sh
bun run sandbox
bun run build
bun run smoke
```

Supply `FIREWORKS_API_KEY` through the environment. The smoke test creates a temporary
Git repository and local MCP requirement server, then reviews two changes:

| Change                         | Expected result                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Harmless HTTP header casing    | Terminal and browser checks pass on both revisions; review completes                                  |
| Increment changed to decrement | Unit test still passes, browser assertion fails on head, finding retained and verification incomplete |

The fixture also changes tracked source during setup to verify restoration before
checks. It verifies MCP requirement retrieval and a separate workflow store for each
run. Paid model calls are involved; exact findings and execution choices can vary.
Reports remain in `.runs/` for inspection; temporary input repositories are removed.

## Deployment evidence

Before this cleanup, live trials on three private repositories verified clean reviews,
seeded regressions, changed-line GitHub findings and duplicate prevention. One repository
ran 573 tests per revision, type checks, generated-type checks and a web build.

The VM bootstrap was exercised on bare Ubuntu 26.04 amd64 with 2 CPUs and 4 GB RAM.
Installation, repeated installation, interrupted first-selection recovery, non-root
preflight, live terminal/browser/MCP smoke and post-reboot lock/Docker checks passed.
A real GitHub review and duplicate rerun also passed after moving a repository to that
worker. These are historical deployment results, not validation of every later commit.
Ubuntu 24.04 and arm64 are implemented but have not received equivalent bare-VM trials.

## Limits of the evidence

Fireworks is the live-tested provider. OpenAI and Anthropic adapters are wired; their
live calls have not been validated here. ChatGPT's Eve login path is wired but unverified;
Claude subscription execution is unsupported. See [configuration](configuration.md).

The validator checks that findings reference recorded tool results and changed lines.
It does not prove the referenced output supports the finding. A completed review can
contain mistakes, and a failing required check need not be a newly introduced bug.
See [execution boundaries](execution.md) for source restoration and isolation limits.
