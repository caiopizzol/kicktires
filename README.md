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
  Self-hosted reviews with your models, skills and tools.
</p>

<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-24%2B-339933" alt="Node.js 24+"></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Bun-1.3.12%2B-FF5A1F" alt="Bun 1.3.12+"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

## Requirements

Git, Node 24+, Bun 1.3.12+, Docker and a model.

## Quick start

```sh
git clone https://github.com/caiopizzol/kicktires.git
cd kicktires
bun install --frozen-lockfile
bun run sandbox
bun run build
```

Copy [the example profile](examples/profile.json) to a trusted location outside the
reviewed repository. Set its model and check commands, then configure
[authentication](docs/configuration.md#models-and-authentication).

```sh
bun run review --repo /path/to/repository \
  --base main --head feature \
  --profile /path/to/profile.json
```

The CLI reviews committed changes and saves `report.json` and supporting evidence
in a private `.runs/review-*/` directory. A completed review is not an approval.

## Documentation

- [Configure models, skills and tools](docs/configuration.md)
- [Install on a VM](docs/self-hosting.md)
- [Review GitHub PRs](docs/github-actions.md) — private, same-repository branches only
- [Execution and privacy](docs/execution.md)
- [Contribute](CONTRIBUTING.md)

[MIT licensed](LICENSE). Built on [Eve](https://github.com/vercel/eve).
