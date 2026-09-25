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

Run on your VM:

```sh
curl -fsSL https://kicktires.dev/install | sudo sh
```

The installer guides GitHub sign-in, App creation or reuse, a private hub,
and Codex login. It installs dependencies, configures the worker and starts its
service. Keep a browser available for authorization; no laptop commands or
public VM ports are needed.

GitHub also asks you to create a fine-grained token: select **only the hub
repository**, with **Actions: read and write**. Paste it into the installer.

Merge the workflow PR printed at the end, then open a PR from a branch in your
repository. After its first review, require **`kicktires` from your GitHub App**
in branch protection. Keep your existing CI checks required and require review
conversations to be resolved.

Findings or an incomplete review fail the status. Push a fix to trigger another
review; resolving a thread alone does not turn it green. To keep the code as it is,
reply `/kicktires decline <reason>` in each finding's thread, then rerun the hub job.

Rerun the same installer to resume interrupted setup or check the worker.
It preserves existing configuration and does not activate upgrades automatically.
The default model is `gpt-6-sol` with `xhigh` effort; edit `/etc/kicktires/profile.json` for
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
