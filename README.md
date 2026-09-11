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

## Install

Use an Ubuntu 24.04 or 26.04 VM (amd64 or arm64) and a model. While this repository
is private, set `GH_TOKEN` with repository read access before installing.

```sh
curl -fsSL https://kicktires.dev/install.sh -o /tmp/kicktires-install.sh
sudo --preserve-env=GH_TOKEN sh /tmp/kicktires-install.sh
```

The installer sets up prerequisites, Docker and a pinned worker release. Then
[connect your repository](docs/self-hosting.md#add-a-repository) and
[configure your model](docs/configuration.md#models-and-authentication).
See [VM setup](docs/self-hosting.md) for installation details.

## Documentation

- [Configure models, skills and tools](docs/configuration.md)
- [Review locally](docs/local-review.md)
- [Review GitHub PRs with shared workers](docs/shared-workers.md)
- [Execution and privacy](docs/execution.md)
- [Contribute](CONTRIBUTING.md)

[MIT licensed](LICENSE). Built on [Eve](https://github.com/vercel/eve).
