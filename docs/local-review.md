# Review locally

Use Git, Node 24+, Bun 1.3.12+, Docker and a model. For a GitHub review worker,
use the [hosted installer](self-hosting.md) instead.

```sh
git clone https://github.com/caiopizzol/kicktires.git
cd kicktires
bun install --frozen-lockfile
bun run sandbox
bun run build
```

Copy [the example profile](../examples/profile.json) to a trusted location outside the
reviewed repository. Set its model and check commands, then configure
[authentication](configuration.md#models-and-authentication).

```sh
bun run review --repo /path/to/repository \
  --base main --head feature \
  --profile /path/to/profile.json
```

The CLI reviews committed changes and saves `report.json` and supporting evidence
in a private `.runs/review-*/` directory. A completed review is not an approval.
