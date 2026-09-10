# Run on a Linux VM

Agent Review runs as a CLI worker. It starts a loopback-only Eve service for each
review and stops it afterward. No public port, domain or persistent web service is
needed. Model API access still sends review context to the selected provider.

## Install

Use a dedicated account with a private home directory and access to Docker. Docker
group membership grants control of the host daemon; this is for your own trusted
projects, not isolation between mutually untrusted tenants. See [execution boundaries](execution.md).

Install Node 24+ and Bun 1.3.12+ for that account. User-local runtimes let an existing
server retain its system Node version. Ensure the account's `PATH` selects them.
Transfer or check out a pinned application commit, then run from that directory:

```sh
node --version
bun --version
docker info
bun install --frozen-lockfile
bun run check
bun run build
bun run sandbox
```

Install dependencies and build on the VM. Do not copy Mac dependencies, generated
Eve output or previous workflow state. The Docker build context includes only the
sandbox Dockerfile and browser helper.

## Verify and review

Supply `FIREWORKS_API_KEY` through your secret manager or the process environment,
then run `bun run smoke`. This makes two paid model reviews using temporary commits,
terminal checks, Chromium assertions and a local MCP fixture. It must accept the
clean change and retain the planted regression with an incomplete verification status.

For a real review, prepare a local Git repository containing both requested revisions
and place a trusted profile outside that repository. As the worker account, run:

```sh
bun run review --repo /path/to/repository \
  --base BASE_COMMIT --head HEAD_COMMIT \
  --profile /path/to/trusted-profile.json \
  --context 'Review the changed behavior and relevant callers.'
```

Run reviews sequentially on a small shared VM. Build before starting reviews and
avoid rebuilding while a review is active. The current backend has no per-container
CPU or memory quotas. Watch host capacity when reviewing larger repositories.

## Operate

Each invocation prints its `.runs/review-*/` directory. Inspect `report.json`, retained
tool evidence and the exit code; incomplete verification is not a clean review.
The clean smoke exits 0; its intentionally failing browser regression exits 2, which
the smoke script expects. The overall smoke command exits 0 when both assertions pass.

Keep artifacts private. Normal shutdown removes only that run's container and service;
reports and source snapshots remain. After an interrupted run, use its `sandbox.json`
to identify the exact container before cleanup. Never prune other applications' containers.

Credentials need not be stored with the installation. SSH can pass a key through stdin
to a host-side launcher that puts it in the child process environment. Do not put key
values in command-line arguments, profiles, shell history or repository files. Supply
credentials again for later runs if using this temporary approach.

For PR triggers and inline publishing, install the [GitHub adapter](github-actions.md).
Subscription authentication remains separate; see [adoption](adoption.md).
