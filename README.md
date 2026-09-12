<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.svg">
    <img src=".github/assets/logo-light.svg" width="80" height="80" alt="kicktires">
  </picture>
</p>

<h1 align="center">kicktires</h1>

<p align="center">
  <strong>Code review that runs your code.</strong>
  <br>
  Self-hosted code review with your own model or subscription.
</p>

<p align="center">
  <a href="https://github.com/caiopizzol/kicktires/releases"><img src="https://img.shields.io/github/v/release/caiopizzol/kicktires?include_prereleases" alt="GitHub release"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-24%2B-339933" alt="Node.js 24+"></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-1.3.12%2B-FF5A1F" alt="Bun 1.3.12+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

A self-hosted alternative to code review services like CodeRabbit, Greptile, Macroscope, Qodo, and Cubic.
Currently supports Codex with a dedicated CLI login. Other backends are not yet supported.

## Quickstart

You need a fresh Ubuntu 24.04 or 26.04 VM with Docker support, a Codex login, and
permission to manage your GitHub repositories. This setup uses a private hub to
review public or private repositories under the same GitHub owner. Fork PRs are unsupported.

### 1. Install the worker

On the VM, install this release and create a dedicated runner account:

```sh
curl -fsSL https://kicktires.dev/install.sh -o /tmp/kicktires-install.sh
sudo sh /tmp/kicktires-install.sh --version 1d1119fbc638544b1cbdd20b378210796a81c320
sudo useradd --create-home --shell /bin/bash --groups docker,kicktires runner
sudo chmod 700 /home/runner
sudo -iu runner
```

Sign in to Codex as `runner`:

```sh
export PATH=/opt/kicktires/runtime/bin:$PATH
release=$(cat /etc/kicktires/release)
cd /opt/kicktires/releases/$release
mkdir -p "$HOME/.local/share/kicktires/codex"
chmod 700 "$HOME/.local/share/kicktires/codex"
CODEX_HOME="$HOME/.local/share/kicktires/codex" bunx --no-install codex login --device-auth
chmod 600 "$HOME/.local/share/kicktires/codex/auth.json"
exit
```

Create `/etc/kicktires/profile.json` with `sudoedit`. Use a model available to your account:

```json
{
  "model": {
    "id": "gpt-5.6-terra",
    "effort": "high",
    "home": "/home/runner/.local/share/kicktires/codex"
  },
  "instructions": "Check boundary cases and public API compatibility."
}
```

### 2. Connect GitHub

Create a **private** hub repository named `OWNER/kicktires-worker`, with a `main`
branch. Replace `OWNER` and `PROJECT` below with your account or organization and
source repository name.

Create a private GitHub App under that owner, disable webhooks, and grant repository
permissions **Contents: read**, **Pull requests: write**, and **Commit statuses: write**.
Install it on `OWNER/PROJECT`. Create a fine-grained personal access token with
resource owner `OWNER` and **Actions: read and write**, scoped to **only the hub repository**.

In each repository's **Settings → Secrets and variables → Actions**, add:

| Repository | Type     | Name                        | Value                    |
| ---------- | -------- | --------------------------- | ------------------------ |
| Hub        | Variable | `KICKTIRES_APP_ID`          | App ID                   |
| Hub        | Secret   | `KICKTIRES_APP_PRIVATE_KEY` | App private key contents |
| Source     | Variable | `KICKTIRES_HUB`             | `OWNER/kicktires-worker` |
| Source     | Secret   | `KICKTIRES_DISPATCH_TOKEN`  | Hub-only token           |

On the VM, create `/etc/kicktires/hub.json` with `sudoedit`. Replace
`your-app[bot]` with your App's exact bot login:

```json
{
  "repository": "OWNER/kicktires-worker",
  "reviewer": "your-app[bot]",
  "profiles": {
    "OWNER/PROJECT": "/etc/kicktires/profile.json"
  }
}
```

Protect the configuration and check the worker:

```sh
sudo chown root:root /etc/kicktires/profile.json /etc/kicktires/hub.json
sudo chmod 644 /etc/kicktires/profile.json /etc/kicktires/hub.json
sudo -iu runner
export PATH=/opt/kicktires/runtime/bin:$PATH
release=$(cat /etc/kicktires/release)
bun --no-env-file /opt/kicktires/releases/$release/scripts/doctor.ts \
  --worker --profile /etc/kicktires/profile.json --credentials
exit
```

In the **hub's Settings → Actions → Runners → New self-hosted runner**, select
Linux and your VM architecture. Run GitHub's download and registration commands on
the VM as `runner`, verify the supplied checksum, and add the `kicktires` label.
From an administrator shell in the runner directory, run `sudo ./svc.sh install runner`
and `sudo ./svc.sh start`. Register the runner only on the private hub.

On your development machine, run this in a checkout of the **hub repository**:

```sh
mkdir -p .github/workflows
curl -fsSL https://raw.githubusercontent.com/caiopizzol/kicktires/1d1119fbc638544b1cbdd20b378210796a81c320/examples/github-hub-workflow.yml \
  -o .github/workflows/review.yml
```

Then run this in a checkout of the **source repository**:

```sh
mkdir -p .github/workflows
curl -fsSL https://raw.githubusercontent.com/caiopizzol/kicktires/1d1119fbc638544b1cbdd20b378210796a81c320/examples/github-submit-workflow.yml \
  -o .github/workflows/kicktires.yml
```

Commit and push both files: the hub workflow to `main`, and the source workflow to
its default branch. Keep their filenames and security guards unchanged. The source
queues reviews; the hub assigns them to the worker, which investigates in a sandbox
and posts findings back to the source PR.

### 3. Make reviews block merging

Open a draft PR from a branch in the source repository. Wait for the App's review
and `kicktires` status, then rerun the source workflow to check that it restores the
result without posting duplicate findings.

In the source repository's branch protection or ruleset for its default branch:

- Require the **`kicktires` status from your GitHub App**. Do not substitute `queue review`.
- Keep your existing CI checks required.
- Require review conversations to be resolved before merging.

No changes to your test commands are needed. Findings or an incomplete review fail
the Kicktires status; a completed review with no findings passes. Fix the issue and
push a new revision to trigger another review. Resolving a thread alone does not
turn a failed status green.

For more workers or projects, see [shared workers](docs/shared-workers.md).
For optional setup commands, checks and skills, see [configuration](docs/configuration.md).

## Documentation

- [Configure a review](docs/configuration.md)
- [Every configuration option](docs/configuration-reference.md)
- [Example files and where to use them](examples/README.md)
- [Review locally](docs/local-review.md)
- [Review GitHub PRs with shared workers](docs/shared-workers.md)
- [Execution and privacy](docs/execution.md)
- [Contribute](CONTRIBUTING.md)

[MIT licensed](LICENSE). Built on [Eve](https://github.com/vercel/eve).
