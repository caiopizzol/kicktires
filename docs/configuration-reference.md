# Configuration reference

Use [profile.json](../examples/profile.json) to start. [profile-full.json](../examples/profile-full.json)
shows every review field in one file. Its commands, paths and MCP endpoint are
placeholders; remove optional sections you do not need.

## Review profile

Pass the JSON file with `--profile`. Only `model.id` and `model.home` are required.
Unknown fields are rejected at every level. Keep profiles on the trusted worker,
never in a PR-controlled checkout. See [configuration](configuration.md) for login
and usage instructions.

| Field                   | Default             | Meaning and constraints                                                                                                    |
| ----------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `model`                 | Required            | Codex settings; no provider selector.                                                                                      |
| `model.id`              | Required            | Nonempty model ID from the Codex catalog. Account access is checked when it runs.                                          |
| `model.home`            | Required            | Absolute path to a dedicated Codex login directory. See [login requirements](configuration.md#codex-subscription).         |
| `model.effort`          | Catalog default     | Nonempty effort supported by the selected model. Valid values come from the Codex catalog.                                 |
| `model.contextWindow`   | `100000`            | Context capacity in tokens supplied to the agent runtime. Integer, at least `8192`; use the model's capacity.              |
| `instructions`          | Omitted             | Project guidance, trimmed to 1–16,000 characters. Supplements the built-in review rules.                                   |
| `skills`                | `[]`                | Skill directory paths, relative to the profile or absolute. See [skill requirements](configuration.md#skills-and-context). |
| `setup`                 | Defaults below      | Preparation for both base and head snapshots.                                                                              |
| `setup.commands`        | `[]`                | Nonempty shell command strings, run in order in each snapshot. A failed command stops preparation.                         |
| `setup.network`         | `"deny-all"`        | `"deny-all"` or `"allow-all"` during setup. Networking is disabled afterward.                                              |
| `checks`                | `[]`                | Nonempty shell command shortcuts the agent can choose to run. They are not a mandatory suite.                              |
| `browser`               | `false`             | Disable browser access, or supply an object with `start`.                                                                  |
| `browser.start`         | Required if enabled | Nonempty app startup command. Use the supplied `$PORT` and bind to localhost.                                              |
| `connections`           | `{}`                | Named MCP connections; fields below.                                                                                       |
| `limits`                | Defaults below      | Execution timeouts, in seconds.                                                                                            |
| `limits.commandSeconds` | `60`                | Integer from `1` to `300`. Applies to sandbox commands, including setup and browser checks.                                |
| `limits.reviewSeconds`  | `600`               | Integer from `30` to `1800`. Deadline for the agent review request; excludes preflight, service startup and cleanup.       |

### MCP connections

Each key in `connections` names one service. Names must start with a lowercase
letter and contain only lowercase letters, digits or hyphens, up to 64 characters.

| Field under `connections.<name>` | Default  | Meaning and constraints                                                                                                                                                           |
| -------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`                            | Required | Valid MCP endpoint URL.                                                                                                                                                           |
| `description`                    | Required | Nonempty description of the context this service provides.                                                                                                                        |
| `tools`                          | Required | Explicit allowlist with at least one nonempty tool name.                                                                                                                          |
| `tokenEnv`                       | Omitted  | Host environment variable containing the bearer token. Must start with `A`–`Z` and contain only uppercase letters, digits or underscores. If set, the variable must have a value. |

Use read-only context tools. MCP requests run on the host, outside the sandbox's
network policy, with the token's permissions. Keep tokens out of profile files.
GitHub reviews reject credential variable names starting with `GITHUB_`, `GH_`,
`ACTIONS_` or `GIT_`.

## Hub configuration

[hub.json](../examples/hub.json) maps source repositories to trusted profiles.
All three fields are required; unknown fields are rejected. See
[shared workers](shared-workers.md) for setup.

| Field        | Meaning and constraints                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `repository` | Private hub repository in `owner/repo` form. Must match the repository running the hub workflow.                        |
| `reviewer`   | GitHub App bot login, such as `your-kicktires-app[bot]`. The prefix contains only lowercase letters, digits or hyphens. |
| `profiles`   | Map of source repositories (`owner/repo`) to absolute profile paths on the worker. Unlisted repositories are rejected.  |

Hub workflow requests supply `repository`, `pr` and `head`: the source `owner/repo`,
a positive PR number as a decimal string, and its full 40-character lowercase commit
SHA. The worker selects the profile from its trusted map and verifies the PR against
GitHub; requests cannot choose a profile path.
