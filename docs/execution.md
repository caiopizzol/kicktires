# Execution and privacy

The CLI resolves local Git refs to commits and reviews snapshots, excluding dirty
changes. It does not fetch remote branches. Each run starts a password-protected,
loopback-only Eve service with separate workflow state, then shuts it down.
Eve is a preview dependency; upgrades require execution tests.

## Snapshots

Each snapshot is limited to 5,000 files and 25 MiB. Relative file links within the
snapshot are allowed, including dangling links. Directory links, link traversal,
escaping paths and submodules are rejected. Snapshots contain no `.git` directory;
the agent uses the supplied diff and file inventory.

Base and head share one disposable container. Both copies are writable for temporary
reproductions. Required checks and browser checks restore tracked source first,
preserving dependencies and other untracked files. General commands do not restore
source. Commit labels identify the input snapshot; they do not attest that execution
was unaffected by untracked files or concurrent changes.

## Isolation

Commands run as the container's unprivileged `node` user. Runtimes and the browser
helper are root-owned. Host workspaces, the Docker socket and host credentials are
not mounted into the sandbox. Never pass model keys to repository setup scripts.

Setup defaults to `deny-all` networking. `allow-all` permits dependency downloads
and any other outbound traffic, including data sent by repository tooling. There is
no domain allowlist. Networking is disabled after setup; localhost remains available
for browser checks. MCP tools run outside this network policy with their configured
credential permissions.

Use a dedicated worker: Docker access controls the host daemon, and the sandbox has
no per-review CPU, memory or process quotas. Timeouts do not provide resource quotas
or strong multi-tenant isolation. Skills and prompts are guidance, not security boundaries.
Docker does not protect against every container escape.

Model and MCP credentials stay in the host service. External model providers receive
the supplied review context; self-hosting the worker does not self-host the model.

## Results and limits

| CLI exit | Meaning                                            |
| -------- | -------------------------------------------------- |
| `0`      | Review completed; findings may still be present    |
| `2`      | Verification incomplete or review execution failed |
| `1`      | Input or startup preflight failed                  |

A completed review is not an approval. The validator requires recorded tool references,
host-resolved change references and configured checks on both revisions.
The agent copies a changed line’s anchor from the review manifest; kicktires resolves
it to the file, side and source line. Unknown anchors are rejected. It does not prove
that the evidence supports a finding. Failed checks need not be new regressions.

Commands default to 60 seconds (maximum 300) and retain 32 KiB per output stream.
Required checks that time out or produce truncated output leave verification incomplete.
A finding citing a truncated or timed-out command remains visible and makes the review
incomplete. Uncited exploratory commands retain their exit codes and truncation flags
in the report but do not prevent completion. The agent can narrow a command or use
read_file ranges to obtain complete replacement evidence. Reviews default to
600 seconds (maximum 1,800). Eve's session limits are 2 million input tokens and
24,000 output tokens, checked between calls; a final call may exceed them. A paused
review remains incomplete.

## Cleanup and retained data

Each run prints its private `.runs/review-*/` directory. `report.json` contains the
result; `response.json`, `events.jsonl`, `setup.jsonl`, screenshots and `server.log`
retain supporting data. Codex validation failures also save bounded rejected proposals
in private `codex-rejections.jsonl`; they are never published to GitHub. Run workflow state lives in that directory's `.eve/`;
the checkout's `.eve/` holds build data. Keep these files out of Git.

Normal completion, failure and cancellation remove the sandbox. If hooks cannot
finish, the CLI stops the service and removes the exact recorded Eve container.
Ctrl-C requests cleanup; a hard kill or machine failure may prevent it. Use the run's
`sandbox.json` to identify its container. Never prune unrelated containers.

Reports may contain private source and context. Apply a retention policy after runs
stop. Do not rebuild while reviews are active. The [GitHub adapter](github-actions.md)
uses the same CLI; it is not a webhook server or shared queue.
