# Install a review worker

Use a Linux VM with Docker: a cloud VM and an on-premises machine follow the same
steps. Kick Tires starts a loopback-only Eve service for each review and removes
its disposable review container afterward. No public port or domain is needed.
Managed serverless platforms without a Docker daemon are not supported by this setup.

Worker paths retain their original `agent-review` names for upgrade compatibility.
See [naming and compatibility](compatibility.md) before changing them.

## Prepare the machine

For a bare Ubuntu 24.04 or 26.04 VM (amd64 or arm64), obtain a pinned Kick Tires
source checkout, inspect `install.sh`, and run:

```sh
sudo sh install.sh --source /path/to/kicktires
```

The bootstrap installs Ubuntu prerequisites and Docker Engine from Docker's official
APT repository. It downloads Node 24.14.0 and Bun 1.3.14 with pinned SHA-256 checksums,
then calls the worker installer below. Existing worker runtimes are preserved; the
worker installer validates their supported versions. Docker is enabled at boot.
The bootstrap does not upgrade the whole OS, configure a public listener, register
GitHub runners or collect model credentials. Unsupported OS/architecture exits before
package installation. Runtime updates require updating and verifying their pinned
versions and hashes in the script.

If you provision prerequisites separately, install Git, Node 24+, Bun 1.3.12+, Docker
Engine and standard Linux tools (`tar`, `flock`, `timeout`, `groupadd`), then use
`scripts/install-worker.sh` directly. Both paths require root for worker installation.

Start with a dedicated worker for your trusted repositories. Docker access gives
control over the host daemon. Reviews are serialized, but the current sandbox has
no CPU/memory quotas. See [execution boundaries](execution.md) for the isolation and
networking limits. Both 4-CPU/8-GB and 2-CPU/4-GB x86 Linux VMs have been used for installation trials;
that is tested capacity, not a minimum for every repository.

Obtain a Kick Tires source checkout and pin the intended commit. Distribution is
currently source-based; there is no published installer package or container release.
Do not copy another machine's `node_modules`, `.output`, or `.eve` directories.

```sh
cd /path/to/kicktires
git checkout FULL_COMMIT_SHA
sudo env PATH="$PATH" sh scripts/install-worker.sh "$PWD"
```

The worker installer archives committed source, installs locked
dependencies and builds/tests on Linux. Uncommitted tracked changes are rejected;
untracked files are not installed. It creates:

- `/opt/agent-review/releases/COMMIT`: root-owned application and built Eve output.
- `/opt/agent-review/runtime/bin`: worker Node and Bun, copied on first install.
- `/opt/agent-review/bin/review-pr`: launcher for GitHub jobs.
- `/etc/agent-review/release`: the active release's full commit SHA.
- A shared review lock and a `tmpfiles` rule that recreates it after reboot.

The first installation activates the release. Repeating installation of the same
completed release is safe. Later installations add releases without replacing the
active release, installed runtimes, launcher, or existing sandbox image. An incomplete
existing release is an error with its path; inspect it before removing that exact
failed installation and retrying. A changed sandbox source requires a planned image
upgrade rather than silently replacing the image used by existing repositories.

## Add a repository

Follow [GitHub PR reviews](github-actions.md#add-a-new-repository) to create its
runner account, register a runner, install a trusted profile and configure a workflow.
Adding another repository does not require rebuilding or activating the application.

Before a paid review, run the preflight under the same account as the runner:

```sh
export PATH=/opt/agent-review/runtime/bin:$PATH
bun --no-env-file /path/to/kicktires/scripts/doctor.ts \
  --worker --profile /etc/agent-review/your-project.json
```

Use the installed release's `scripts/doctor.ts` once that release includes it. The
command checks runtime versions, Docker/image access, profile/skills, compiled output,
root ownership, the installed launcher, shared lock and private runner home. Add
`--credentials` only in the environment where model/MCP variables are supplied. It
checks presence without printing values. GitHub Actions secrets are only available
inside jobs, so an interactive runner shell normally does not have those variables.

Preflight does not execute repository code, contact a model, validate credential
validity or prove a review will succeed. Test your chosen commands on pinned source,
then exercise a real PR. See [validation](validation.md) for the application's own
live smoke command, including terminal/browser/MCP fixtures.

## Upgrade and operate

Keep the active release and sandbox image unchanged while testing an additive
installation. Invoke the candidate's CLI directly with a trusted profile and pinned
local Git inputs to validate it. During a maintenance window with no active reviews,
install its launcher and atomically replace `/etc/agent-review/release`. Refresh any
operator skills containing launcher snapshots. Runtimes and a changed sandbox image
need their own tested upgrade; installing a source release does not update them.
Retain the previous release for rollback. The release file is shared by all repositories.

Each runner retains private reports/source under `~/agent-review-runs/`; apply a
retention policy appropriate to that source. Model context goes to your selected API
provider. Normal completion and failure remove that run's sandbox and service.
After interruption, inspect the run's `sandbox.json` and remove only its exact container
if needed. Never prune other applications' containers. No production application or
database credentials are required for a repository with self-contained tests.

For CLI-only use on a developer machine, follow the [README](../README.md). The
root-owned worker installation is for unattended GitHub reviews.
