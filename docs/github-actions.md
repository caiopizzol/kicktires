# GitHub PR reviews

The Actions adapter runs the installed reviewer on a self-hosted runner and publishes
one submitted `COMMENT` review with resolvable inline findings. It never approves,
requests changes, merges or modifies reviewed code. An incomplete review publishes
its useful findings and verification gaps, then fails the check. Cancellation and
GitHub API rejection fail without claiming publication; private artifacts remain.

This first integration supports private repositories on github.com and PR branches
in the same repository. Keep its workflow on the trusted base branch with
`pull_request_target`; never check out PR code or load its profile on the host.

## Add a new repository

Install the application once using [the worker guide](self-hosting.md). For each
private GitHub repository, complete these steps. No previous review agent is needed.

### 1. Register a dedicated runner

Create a Linux account for this repository, with a private home and membership in
`docker` and `agent-review`. For example, as the host administrator:

```sh
useradd --create-home --shell /bin/bash agent-review-example
chmod 700 /home/agent-review-example
usermod -aG docker,agent-review agent-review-example
```

In the repository's **Settings → Actions → Runners → New self-hosted runner**, choose
Linux and the worker architecture. Follow GitHub's current download and checksum
instructions, running `config.sh` as the new account, not root. Select the repository
URL and add the custom label **agent-review**. Each repository needs its own runner
registration and directory; another repository's runner does not automatically serve it.

Follow GitHub's [service setup](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application)
to install/start the runner service for that account. Confirm it is **Idle** in GitHub.
Treat registration tokens as secrets; do not commit them or put them in saved scripts.
Use these accounts only for the trusted review workflow. Other workflows that check
out and run repository code on these host accounts bypass the review sandbox.

### 2. Install a trusted profile

Copy [the profile example](../examples/profile.json) to
`/etc/agent-review/your-project.json`, owned by root with mode `644`. Select an API
model and write the exact setup/check commands appropriate for the repository.
For a Bun project with self-contained tests:

```json
{
  "model": {
    "provider": "fireworks",
    "id": "accounts/fireworks/routers/deepseek-v4-flash-0731-us"
  },
  "setup": {
    "commands": ["bun install --frozen-lockfile --ignore-scripts"],
    "network": "allow-all"
  },
  "checks": ["bun test --dots", "bun run typecheck"],
  "browser": false
}
```

These commands are an example, not automatic detection. Use only scripts your
repository actually provides. Test them inside the sandbox with no review-time
network access. Add needed runtimes to the sandbox image before relying on them.
Start with self-contained tests; production services and credentials are not implied.
See [configuration](configuration.md) to add skills, browser checks and MCP context.
Run the worker [preflight](self-hosting.md#add-a-repository) as the runner account.

### 3. Configure the credential and workflow

Set the model key as a repository **Actions secret** named `FIREWORKS_API_KEY`, or use
your provider's corresponding variable. Copy [the workflow](../examples/github-workflow.yml)
to `.github/workflows/agent-review.yml`, replacing `/etc/agent-review/profile.json`
with the profile installed above. The workflow passes the model secret; GitHub supplies
a job token with `contents: read` and `pull-requests: write`. Neither token is stored
in the profile. The GitHub token is excluded from the model and sandbox environments.

Keep `pull_request_target`, the private/same-repository guards and the absence of a
checkout step. Keep cancellation disabled so bounded jobs can clean up normally.
Fresh installations use **Agent review** for both the workflow and check names.
When replacing an existing required check, preserve its name until branch protection
is deliberately migrated. Runner labels and profile paths must match the host setup.

### 4. Verify the first real review

Merge the workflow through the repository's normal process. Because the trusted
workflow comes from the base branch, its installation PR may not run it yet. Open
a temporary draft PR afterward with a small, understandable change. Verify the job
logs the installed release, runs the configured checks on both revisions, and posts
one review on the exact head. A failing required check should publish useful findings
and fail verification. Rerun once to confirm duplicate prevention. Close the fixture
without merging if it was created only for validation.

Do not require the new check in branch protection until this path works. A job stuck
queued usually means no online runner matches its labels. A failed preflight means a
host/profile problem; a retained incomplete report identifies review/setup/check gaps.
No submitted review is an approval or a guarantee that the code is correct.

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
