# Install on a VM

Use a dedicated Linux machine with Docker. No public port or domain is needed.
Serverless platforms without Docker are unsupported.

## Install

Run on Ubuntu 24.04 or 26.04, amd64 or arm64:

```sh
curl -fsSL https://kicktires.dev/install | sudo sh
```

The hosted script downloads a pinned source commit. For private source, set
`GH_TOKEN` with read access and pass `--preserve-env=GH_TOKEN` to `sudo`.
Use `--version FULL_COMMIT_SHA` to select another commit, or
`--source /path/to/kicktires` to install an existing checkout.

Inspect the script before running it. It installs prerequisites, Docker from its
official APT repository, and checksum-verified Node 24.14.0 and Bun 1.3.14 binaries.
It enables Docker at boot, tests/builds committed source and creates the sandbox image.
The guided steps then connect GitHub and Codex and register the runner service.
It does not upgrade the whole OS.

For source development, see [contributing](../CONTRIBUTING.md). Source installs
require committed changes; untracked files are excluded. Do not copy `node_modules`,
`.output` or `.eve` from another machine.

The first install activates the release. Repeats preserve completed installs. Later
installs add releases without replacing the active release, runtimes, launcher or
existing image. If an incomplete release exists, inspect its exact path before
removing it and retrying. Changed sandbox source requires a planned image upgrade.

| Path                             | Contents                    |
| -------------------------------- | --------------------------- |
| `/opt/kicktires/releases/COMMIT` | Root-owned source and build |
| `/opt/kicktires/runtime/bin`     | Node and Bun                |
| `/opt/kicktires/bin/review-pr`   | GitHub launcher             |
| `/etc/kicktires/release`         | Active commit               |

A shared lock serializes reviews; a tmpfiles rule recreates it after reboot.
Docker access controls the host daemon. There are no per-review CPU/memory quotas;
read [execution boundaries](execution.md).

Bare installation and reboot were tested on Ubuntu 26.04 amd64 with 2 CPUs and 4 GB RAM.
Guided setup and real reviews were also tested in an Ubuntu 24.04 arm64 systemd
container. That does not verify bare-VM installation or reboot on that platform.
Tested capacity is not a universal minimum.

On a 4 GB Linux VM, provide 4 GB of swap. Vite+ lint can fail before analysis without
it because it reserves large virtual-memory regions. Full checks passed with this
configuration on the tested VM.

## Guided setup

Follow the [quickstart](../README.md#quickstart). Run the installer in an interactive
terminal on the worker. It guides browser authorization and prints the workflow
PR to merge and the review status to require. Organization App creation requires
an organization owner.

Configuration stays in `/etc/kicktires/`. The dedicated runner and Codex login use
`/home/kicktires-runner/`. Private installation state is in
`/var/lib/kicktires/install/`. The temporary GitHub CLI login is kept under `/run/` and deleted on normal exit
or the next installer run; reboot also clears it. Its GitHub authorization remains
in your account settings. The review App key is retained only until stored as a hub secret.

App creation returns through `kicktires.dev`; its temporary confirmation URL lets
the VM retrieve the App credentials. Paste it only into your installer.
To reuse an App, provide its ID and a private key file on the VM when prompted.

Rerun the installer to resume or check the worker. It preserves configured models
and profiles, refuses unrelated installations, and does not change branch protection.

## Manual setup

For public repositories or several projects sharing a VM, use a private
[shared-worker hub](shared-workers.md). Fork PRs are unsupported.

To connect one private repository directly:

1. Create a dedicated Unix account with a private home and membership in the
   `docker` and `kicktires` groups. Register a repository runner through GitHub's
   **Settings → Actions → Runners**, verify the download checksum, add the
   `kicktires` label, and install its service under that account.
2. Install a root-owned, mode `644` [profile](../examples/profile.json) at
   `/etc/kicktires/your-project.json`. Configure its model, skills and available
   checks; test setup and check commands in the sandbox.
3. [Sign in to Codex](configuration.md#codex-subscription) as the runner account
   and set `model.home` to its dedicated login directory.
   Copy [the workflow](../examples/github-direct-workflow.yml)
   to `.github/workflows/kicktires.yml` and set its profile path and runner label.

Keep `pull_request_target`, the private/same-repository guards and cancellation
settings. Use the runner only for the trusted review workflow. Never check out PR
code or load its profile on the host. Keep tokens out of profiles and scripts.

Run preflight as the runner account, using the installed release:

```sh
export PATH=/opt/kicktires/runtime/bin:$PATH
release=$(cat /etc/kicktires/release)
bun --no-env-file /opt/kicktires/releases/$release/scripts/doctor.ts \
  --worker --profile /etc/kicktires/your-project.json
```

Preflight checks runtimes, Docker/image access, profile/skills, build, ownership,
launcher, lock and private home. `--credentials` also checks the Codex model catalog
and required MCP credential variables without printing secrets.
Preflight does not call models, run repository code or prove credentials work.
After the workflow reaches the trusted base branch, validate a draft PR and rerun
it to confirm duplicate prevention. Check the exact reviewed head and recorded
evidence before requiring the check. Findings and incomplete reviews fail it;
keep independent CI checks and require resolved conversations. Bind the required
check to its observed app. See [retry behavior](shared-workers.md#retries-and-interruptions).

## Upgrade and operate

Test a candidate release through its CLI before activation. With reviews stopped,
install its launcher and atomically replace `/etc/kicktires/release`. That file
selects the release for every repository on the worker. Retain the old release for
rollback and refresh skills containing launcher snapshots.

Runtimes and the shared sandbox image require separate tested upgrades. Update and
verify download versions/checksums when changing bootstrap runtimes.

To move a runner, install and preflight the destination with the same labels and
trusted configuration, leaving its service stopped. Drain the old runner, stop it,
and wait for GitHub to show it offline before starting the new service. Validate
a draft PR and duplicate rerun before removing the old registration. For rollback,
stop the new service before restarting the old one.

Private reports remain in `~/kicktires-runs/`; apply an appropriate retention policy.
After interrupted cleanup, use a run's `sandbox.json` to identify its exact container.
Never prune other applications' containers. Codex receives review context;
self-contained repository tests do not need production credentials.

For developer-machine reviews, use the [local review guide](local-review.md).
