# Install on a VM

Use a dedicated Linux machine with Docker. No public port or domain is needed.
Serverless platforms without Docker are unsupported. For existing installations, read [upgrading](upgrading.md) first.

## Install

On Ubuntu 24.04 or 26.04, amd64 or arm64:

```sh
curl -fsSL https://kicktires.dev/install.sh -o /tmp/kicktires-install.sh
sudo sh /tmp/kicktires-install.sh
```

The hosted script downloads a pinned source commit. While the repository is private,
set `GH_TOKEN` with repository read access and preserve it when running the installer:

```sh
sudo --preserve-env=GH_TOKEN sh /tmp/kicktires-install.sh
```

Use `--version FULL_COMMIT_SHA` to select another commit, or
`--source /path/to/kicktires` to install an existing checkout.

Inspect the script before running it. It installs prerequisites, Docker from its
official APT repository, and checksum-verified Node 24.14.0 and Bun 1.3.14 binaries.
It enables Docker at boot, tests/builds committed source and creates the sandbox image.
It does not register runners, collect secrets or upgrade the whole OS.

If prerequisites are already installed (Git, Node 24+, Bun 1.3.12+, Docker and standard
Linux tools including `tar`, `flock`, `timeout`, `groupadd`), use:

```sh
sudo env PATH="$PATH" sh scripts/install-worker.sh "$PWD"
```

Both installers require root. Tracked edits must be committed; untracked files are
excluded. Do not copy `node_modules`, `.output` or `.eve` from another machine.
Distribution is source-based; the hosted installer fetches source from GitHub.

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
Ubuntu 24.04 and arm64 lack equivalent trials. Tested capacity is not a universal minimum.

On a 4 GB Linux VM, provide 4 GB of swap. Vite+ lint can fail before analysis without
it because it reserves large virtual-memory regions. Full checks passed with this
configuration on the tested VM.

## Add a repository

Follow [GitHub setup](github-actions.md#add-a-new-repository) for the runner, trusted
profile, secret and workflow. Each repository needs its own registration, not a rebuild.

Run preflight as the runner account, using the installed release:

```sh
export PATH=/opt/kicktires/runtime/bin:$PATH
release=$(cat /etc/kicktires/release)
bun --no-env-file /opt/kicktires/releases/$release/scripts/doctor.ts \
  --worker --profile /etc/kicktires/your-project.json
```

Preflight checks runtimes, Docker/image access, profile/skills, build, ownership,
launcher, lock and private home. `--credentials` also checks that required variables
exist without printing them. Actions secrets are normally available only inside jobs.
Preflight does not call models, run repository code or prove credentials work.
Validate a real PR afterward.

## Upgrade and operate

Test a candidate release through its CLI before activation. With reviews stopped,
install its launcher and atomically replace `/etc/kicktires/release`. That file
selects the release for every repository on the worker. Retain the old release for
rollback and refresh skills containing launcher snapshots.

Runtimes and the shared sandbox image require separate tested upgrades. Update and
verify download versions/checksums when changing bootstrap runtimes. Existing Fireworks
profiles must switch provider and secrets before upgrading to this version.

Private reports remain in `~/kicktires-runs/`; apply an appropriate retention policy.
After interrupted cleanup, use a run's `sandbox.json` to identify its exact container.
Never prune other applications' containers. External providers receive model context;
self-contained repository tests do not need production credentials.

For developer-machine reviews, use the [CLI quickstart](../README.md).
