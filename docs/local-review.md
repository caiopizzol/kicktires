# Review locally

Use Git, Node 24+, Bun 1.3.12+, Docker and a Codex login. For a GitHub review worker,
use the [hosted installer](self-hosting.md) instead.

```sh
git clone https://github.com/caiopizzol/kicktires.git
cd kicktires
bun install --frozen-lockfile
bun run sandbox
bun run build
```

Copy [the example profile](../examples/profile.json) to a trusted location outside the
reviewed repository. [Sign in to Codex](configuration.md#codex-subscription), then set the profile's
`model.home` to that login directory. Add check shortcuts or skills as needed.

```sh
bun run review --repo /path/to/repository \
  --base main --head feature \
  --profile /path/to/profile.json
```

The CLI reviews committed changes and saves `report.json` and supporting evidence
in a private `.runs/review-*/` directory. A completed review is not an approval.

## Command options

| Argument         | Required | Meaning                                         |
| ---------------- | -------- | ----------------------------------------------- |
| `--repo PATH`    | Yes      | Local Git repository.                           |
| `--base REF`     | Yes      | Base commit, tag or branch.                     |
| `--head REF`     | Yes      | Head commit, tag or branch.                     |
| `--profile PATH` | Yes      | Trusted review profile.                         |
| `--context TEXT` | No       | Additional review context, such as an issue ID. |
| `--help`         | No       | Print usage.                                    |

Set `KICKTIRES_RUNS_DIR` to choose where private run artifacts are stored.
Profile fields are listed in the [configuration reference](configuration-reference.md).
