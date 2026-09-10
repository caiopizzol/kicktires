# GitHub PR reviews

The Actions adapter runs the installed reviewer on a self-hosted runner and publishes
one submitted `COMMENT` review with resolvable inline findings. It never approves,
requests changes, merges or modifies reviewed code. An incomplete review publishes
its useful findings and verification gaps, then fails the check. Cancellation and
GitHub API rejection fail without claiming publication; private artifacts remain.

This first integration supports private repositories on github.com and PR branches
in the same repository. Keep its workflow on the trusted base branch with
`pull_request_target`; never check out PR code or load its profile on the host.

## Install on a worker

Build the application as described in [self-hosting](self-hosting.md). Install an
exact commit under `/opt/agent-review/releases/COMMIT`, including dependencies and the
Linux-built Eve output. Store its full commit SHA in the root-owned
`/etc/agent-review/release` file. The release must be readable but not writable by
runner accounts. Select a new tested release by atomically replacing that file; future
worker fixes do not require repository workflow edits. Put pinned Node and Bun executables in
`/opt/agent-review/runtime/bin`, also controlled by the host administrator.

Install `scripts/run-github-review.sh` as `/opt/agent-review/bin/review-pr`. This wrapper
starts Bun from the trusted release directory with dotenv loading disabled and
uses a shared `flock` to serialize reviews across repositories, waits at most ten
minutes for the lock and allows twenty minutes for execution plus shutdown. Provision
`/var/lock/agent-review/review.lock` as a root-owned file writable by a dedicated group
containing the runner accounts; its parent directory must not be group-writable.
Runner accounts need Docker access. Keep existing repositories' runner registrations.

Store each trusted profile under `/etc/agent-review/`, root-owned and not writable by
runners. Each runner writes artifacts under its own `~/agent-review-runs/`. Keep those
private and apply a retention policy appropriate to the reviewed source. The CLI also
supports `AGENT_REVIEW_RUNS_DIR` for other installations with read-only application code.

## Enable a workflow

Copy [the example](../examples/github-workflow.yml) and select the existing runner
label and trusted profile. The launcher logs the actual worker release for each run.
Set `FIREWORKS_API_KEY` as a repository Actions secret, or configure the selected
provider's credential environment variable. GitHub supplies a repository-scoped job
token with `contents: read` and `pull-requests: write`.

When replacing an existing reviewer, preserve its required job/check name until branch
protection is deliberately updated. The workflow display name can change independently.
Keep cancellation disabled so the bounded worker can retire its session normally.
A queued event whose head is already outdated skips the model call.

## Supply worker context

A workflow can depend on a launcher that exists only on the worker. Supply its source
through a trusted profile skill when the reviewer needs to inspect that contract.
Keep `SKILL.md` focused on when to inspect the launcher, with the exact source and a
short deployment record in `references/`. Record the release, source digest, capture
date and checks actually performed. Update the snapshot when the launcher changes.

Add the skill directory to the root-owned profile's `skills` list. Eve makes its files
available inside the review sandbox. Distinguish operator-recorded evidence from
checks the agent executes itself; supplying context does not grant host access or
instruct the reviewer to accept a change. Missing material evidence still fails review.

## Revision and publication guarantees

The adapter fetches the exact current base and event-matching head into a temporary
bare Git repository. It reviews their merge base against the head so findings match
the PR diff. No repository checkout, hook, setup or test runs on the host. Git auth
is passed through a process-only HTTP header and is removed with the temporary input.

The model process receives an explicit environment containing runtime paths and only
selected model/MCP credentials. GitHub and Actions credentials are excluded. Before
publication, the adapter revalidates the retained report against recorded events,
pinned revisions and changed lines. It refetches the PR and refuses to publish if the
head, base, repository or open state changed, leaving verification incomplete. The submitted review names the exact
`commit_id`. The freshness check and publication are separate requests; a change
between them can leave an explicitly old-revision review.

Existing Actions-bot reviews are paginated and checked for a base/head marker both
before model work and before publication. A rerun of an already published revision
skips publication and preserves its prior incomplete status. A fresh code revision
(or a changed base) gets a new review. Findings alone do not fail the check; failed or
missing required verification does. The status is not a guarantee of code correctness.

Only the rendered summary, findings and gaps are published. Raw commands, outputs,
source snapshots and session logs remain on the runner. Model text in comments is
bounded and cannot create mentions or forge the adapter's HTML status markers.
