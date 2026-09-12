# Examples

Start with `profile.json`. Replace its model and login directory with values from
your worker. Use `profile-full.json` to explore all options; its commands, skill
paths and MCP endpoint are placeholders.

| File                                                     | Purpose                                 | Where it goes                                                 |
| -------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| [profile.json](profile.json)                             | Small review profile.                   | Trusted file on the worker, outside reviewed code.            |
| [profile-full.json](profile-full.json)                   | Every profile option.                   | Reference; customize before use.                              |
| [hub.json](hub.json)                                     | Route repositories to trusted profiles. | `/etc/kicktires/hub.json` on each hub worker.                 |
| [github-hub-workflow.yml](github-hub-workflow.yml)       | Run reviews on shared workers.          | `.github/workflows/review.yml` in the private hub.            |
| [github-submit-workflow.yml](github-submit-workflow.yml) | Send PRs to the hub.                    | `.github/workflows/kicktires.yml` in each source repository.  |
| [github-direct-workflow.yml](github-direct-workflow.yml) | Review one private repository directly. | `.github/workflows/kicktires.yml` in that private repository. |

For public repositories or a shared worker pool, use the
[hub setup](../docs/shared-workers.md). For a single private repository, use the
[direct setup](../docs/self-hosting.md#add-a-repository). Keep required workflow
filenames when copying; dispatch addresses `review.yml` by name.

See the [configuration guide](../docs/configuration.md) and
[complete option reference](../docs/configuration-reference.md).
