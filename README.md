# Kick Tires

**Code review that runs your code.**

A self-hosted reviewer that investigates changes in Docker, runs checks on both
revisions, and reports findings and verification gaps. Add your own skills, browser
checks and MCP tools.

## Get started

Requires Git, Node 24+, Bun 1.3.12+, Docker and a model API key.

```sh
git clone https://github.com/caiopizzol/kicktires.git
cd kicktires
bun install --frozen-lockfile
bun run sandbox
bun run build
```

Copy [the example profile](examples/profile.json) to a trusted location outside the
reviewed repository. Set its model and check commands, then export the provider's API key.

```sh
bun run review --repo /path/to/repository \
  --base main --head feature \
  --profile /path/to/profile.json
```

The CLI reviews committed changes and saves `report.json` and supporting evidence
in a private `.runs/review-*/` directory. A completed review is not an approval.

Use OpenAI, Anthropic or xAI API access. See [authentication and verification status](docs/configuration.md#models-and-authentication) before choosing a model.

## Guides

- [Configure models, skills and tools](docs/configuration.md)
- [Install on a VM](docs/self-hosting.md)
- [Review GitHub PRs](docs/github-actions.md) — private, same-repository branches only
- [Execution and privacy](docs/execution.md)
- [Contribute](CONTRIBUTING.md)

[MIT licensed](LICENSE). Built on [Eve](https://github.com/vercel/eve).
