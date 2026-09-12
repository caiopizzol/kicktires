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

You need an Ubuntu 24.04 or 26.04 VM with Docker support, a Codex account, and
GitHub admin access to your repository. Reviews run through a private hub owned
by you. Public and private source repositories are supported; fork PRs are not.

### 1. Connect GitHub from your laptop

With [Bun](https://bun.sh) and [GitHub CLI](https://cli.github.com) installed:

```sh
gh auth login
git clone https://github.com/caiopizzol/kicktires.git
cd kicktires
bun install --frozen-lockfile
bun --no-env-file scripts/connect.ts OWNER/PROJECT
```

Setup creates the private hub, guides GitHub App creation, stores the credentials,
and opens a workflow PR. GitHub asks you to create one fine-grained token:
select **only the hub repository**, with **Actions: read and write**.

Already have a review App? Add `--app APP_ID --key /path/to/private-key.pem`.
Use `--hub NAME` to choose another hub name. Setup refuses to overwrite an
unrelated installation.

### 2. Connect the worker

Run the install commands printed by setup on your VM. They select the same release
as your laptop. Then run:

```sh
sudo kicktires setup
```

Paste the pairing code and complete Codex login in your browser. Setup handles the
runner account, permissions, configuration, checks, and background service.
Pairing codes expire after one hour; rerun the laptop command to renew one.

The default model is `gpt-5.6-terra`. Use `sudo kicktires setup --model ID`
to choose another model available to your account.

### 3. Verify a review and block merging

Merge the workflow PR, then open a PR from a branch in your repository. Wait for
the App's review and **`kicktires` status**. Findings or an incomplete review fail
that status; a completed review without findings passes.

In your default branch's protection or ruleset:

- Require **`kicktires` from your GitHub App**, not `queue review`.
- Keep your existing CI checks required.
- Require review conversations to be resolved.

Fix findings and push a new revision to trigger another review. Resolving a thread
alone does not turn the status green.

Run `sudo kicktires doctor` to check the worker or `sudo kicktires login` to sign
in again. Edit `/etc/kicktires/profile.json` for optional
[configuration](docs/configuration.md). See [shared workers](docs/shared-workers.md)
for multiple projects or VMs.

## Documentation

- [Configure a review](docs/configuration.md)
- [Every configuration option](docs/configuration-reference.md)
- [Example files and where to use them](examples/README.md)
- [Review locally](docs/local-review.md)
- [Review GitHub PRs with shared workers](docs/shared-workers.md)
- [Execution and privacy](docs/execution.md)
- [Contribute](CONTRIBUTING.md)

[MIT licensed](LICENSE). Built on [Eve](https://github.com/vercel/eve).
