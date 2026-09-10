# Execution boundaries

Eve is currently a preview; dependencies are pinned and updates need execution tests.

The CLI resolves two local Git refs to commits, validates their trees and prepares
snapshots. Each review starts the compiled Eve server with its private run directory
as the working directory, isolating its persisted workflows. It listens on loopback with a random
password, creates a session, collects its report and retires the service. Eve runs
the model, supplies skills/connections and owns the Docker sandbox lifecycle.

Repositories are limited to 5000 files and 25 MiB per snapshot. Relative links to files inside the same snapshot are preserved, including dangling
links whose targets are missing. Existing directory targets, link traversal, escaping
links, submodules and unsafe paths are rejected. Dirty work is excluded. Snapshots contain no `.git`
directory; use the supplied diff and file inventory instead of assuming Git commands
will work in the sandbox. The CLI does not fetch remote branches.

## Isolation and networking

Reviewed code runs in writable disposable base/head directories inside one container.
The image runs commands as the unprivileged `node` user; the installed browser helper
and runtimes are owned by root. No host workspace, Docker socket or host credential
environment is mounted into it.
The host service retains model and MCP credentials. Do not mount the Docker socket
into the review image or pass model keys to repository setup scripts.

Setup runs on both revisions. Its network policy defaults to `deny-all`; `allow-all`
explicitly permits dependency downloads and any other outbound setup traffic. Docker's
Eve backend has no domain allowlist. Setup executes repository tooling, so enabling
network access also allows that tooling to send data. Review commands run after
network access has been disabled; container localhost remains available for browsers.

The current Docker backend exposes no per-review CPU, memory or process limits.
Command time and captured output are bounded, but that is not a resource quota or a
strong multi-tenant security boundary. Deploy this version on a dedicated worker with
Docker/VM resource controls appropriate to your repositories. Arbitrary shell access
is intentional; Docker does not protect against every kernel/container escape.

Both copies share a sandbox and are writable for reproductions. Required checks and
browser checks restore tracked files from the host snapshot first, preserving installed
dependencies and other untracked files. General terminal commands do not restore source.
The report's commit labels identify the source snapshot, not a cryptographic attestation
that execution was immune to concurrent changes or extra files from repository code. Review evidence and
findings still require judgment. Skills and prompts are workflow guidance, not security
boundaries against hostile tool output.

## Limits and failure handling

Each command has a configurable timeout (default 60 seconds, maximum 300) and captures
up to 32 KiB per output stream. Truncation and timeout leave the report incomplete.
A review has a configurable deadline (default 600 seconds, maximum 1800). Eve additionally
limits a session to 2 million input and 24000 output tokens; these are checked between
model calls and may be exceeded by the final call. A token-limit pause does not get
automatically approved: the CLI reports incomplete work.

Normal completion/failure/cancellation hooks delete the sandbox. If setup fails or
the service is terminated before its hooks finish, the CLI removes the exact recorded
Eve-labelled container after stopping the server. The container key is recorded before
Eve starts creating it, so an interrupted creation can also be cleaned up. Ctrl-C requests cancellation and runs
cleanup. A hard kill or machine failure can prevent cleanup; retained `sandbox.json`
identifies the particular run's container for recovery. Never prune unrelated containers.

Run artifacts remain for diagnosis. Source, responses, context and screenshots may be
private; `.runs/` and `.eve/` are local data. Delete them according to your retention
needs after stopping active reviews. Builds and run state do not belong in Git.

## Self-hosting

Install this checkout, Node, Bun and Docker on your own worker. Run the same setup and
CLI commands from the README under a dedicated OS account with the selected credentials.
The API models still send supplied review context to their providers; self-hosting this
application does not mean self-hosting the model. No public HTTP listener is needed.

The CLI worker can also run through the [GitHub Actions adapter](github-actions.md).
It is not a webhook server or shared queue. Do not rebuild the application while reviews
are running. Shared skills remain independent of GitHub and the job scheduler.
