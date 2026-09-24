# Configuration reference

Start with [profile.json](../examples/profile.json). Pass your trusted file with
`--profile`; never load it from a PR-controlled checkout. Unknown fields are rejected.
See [configuration](configuration.md) for login and setup.

Examples below are JSON fragments: add each field inside its named parent.
[profile-full.json](../examples/profile-full.json) shows them together. Replace its
paths, commands and MCP endpoint before use.

## Basic settings

Only `model`, `model.id` and `model.home` are required.

| Option         | Required? | Definition                                                                                      | Minimal example                                                                     |
| -------------- | --------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `model`        | Yes       | Codex model and login settings.                                                                 | `"model": {"id": "gpt-6-sol", "home": "/home/runner/.local/share/kicktires/codex"}` |
| `model.id`     | Yes       | Nonempty ID from the account's Codex model catalog.                                             | `"id": "gpt-6-sol"`                                                                 |
| `model.home`   | Yes       | Absolute path to a dedicated Codex login directory.                                             | `"home": "/home/runner/.local/share/kicktires/codex"`                               |
| `model.effort` | No        | Reasoning effort supported by that model. Defaults to its catalog setting.                      | `"effort": "high"`                                                                  |
| `instructions` | No        | Project guidance, trimmed to 1–16,000 characters. Omitted by default.                           | `"instructions": "Check boundary cases."`                                           |
| `checks`       | No        | Command shortcuts the reviewer can choose to run. Defaults to `[]`; not a mandatory test suite. | `"checks": ["bun test"]`                                                            |

`home` needs a working [Codex login](configuration.md#codex-subscription).
Model and effort availability are checked against the catalog; account access is
checked when the model runs. Keep required project tests in CI.

## Advanced settings

Omit these unless your project needs them.

### Context and skills

| Option          | Required? | Definition                                                                    | Minimal example                     |
| --------------- | --------- | ----------------------------------------------------------------------------- | ----------------------------------- |
| `model.context` | No        | Context capacity in tokens. Defaults to `100000`; integer of at least `8192`. | `"context": 200000`                 |
| `skills`        | No        | Skill directory paths, absolute or relative to the profile. Defaults to `[]`. | `"skills": ["./skills/review-api"]` |

Set context to the model's capacity. Skill directories need a `SKILL.md`; see
[skill requirements](configuration.md#skills-and-context).

### Setup

Optional preparation for both base and head, such as installing dependencies.
A project that needs no preparation can omit `setup` entirely.

| Option           | Required? | Definition                                                                                             | Minimal example                                                                                     |
| ---------------- | --------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `setup`          | No        | Preparation commands and network access. Defaults to no commands and no network.                       | `"setup": {"commands": ["bun install --frozen-lockfile --ignore-scripts"], "network": "allow-all"}` |
| `setup.commands` | No        | Nonempty shell commands, run in order in each revision. Defaults to `[]`; a failure stops preparation. | `"commands": ["bun run generate"]`                                                                  |
| `setup.network`  | No        | `"deny-all"` (default) or `"allow-all"` during setup. Enable only when downloads are needed.           | `"network": "allow-all"`                                                                            |

Sandbox networking is disabled after setup. Localhost remains available for browser checks.

### Browser

| Option          | Required?    | Definition                                                                       | Minimal example                                                     |
| --------------- | ------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `browser`       | No           | Enable browser checks with a startup command, or disable with `false` (default). | `"browser": {"start": "bun run dev --host 127.0.0.1 --port $PORT"}` |
| `browser.start` | When enabled | Nonempty app startup command. Use `$PORT` and bind to localhost.                 | `"start": "bun run dev --host 127.0.0.1 --port $PORT"`              |

### MCP connections

Connections provide external context through explicitly allowed tools.

| Option                           | Required?      | Definition                                                                 | Minimal example                                                                                                   |
| -------------------------------- | -------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `connections`                    | No             | Named MCP services. Defaults to `{}`.                                      | `"connections": {"docs": {"url": "https://example.com/mcp", "description": "Project docs", "tools": ["search"]}}` |
| `connections.<name>.url`         | Per connection | Valid MCP endpoint URL.                                                    | `"url": "https://example.com/mcp"`                                                                                |
| `connections.<name>.description` | Per connection | Nonempty description of the service's context.                             | `"description": "Project docs"`                                                                                   |
| `connections.<name>.tools`       | Per connection | Allowlist containing at least one nonempty tool name.                      | `"tools": ["search"]`                                                                                             |
| `connections.<name>.tokenEnv`    | No             | Host environment variable containing the bearer token. Omitted by default. | `"tokenEnv": "DOCS_TOKEN"`                                                                                        |

Connection names start with a lowercase letter and contain lowercase letters,
digits or hyphens, up to 64 characters. Credential variable names start with `A`–`Z`
and contain uppercase letters, digits or underscores. If set, the variable must
have a value. GitHub reviews reject names starting with `GITHUB_`, `GH_`, `ACTIONS_`
or `GIT_`.

Use read-only tools. MCP requests run on the host, outside sandbox networking rules,
with the token's permissions. Keep tokens out of JSON files.

### Timeouts

| Option                  | Required? | Definition                                                                                                                                               | Minimal example                                          |
| ----------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `limits`                | No        | Execution timeouts in seconds. Defaults are listed below.                                                                                                | `"limits": {"commandSeconds": 60, "reviewSeconds": 600}` |
| `limits.commandSeconds` | No        | Timeout for sandbox commands, including setup and browser checks. Integer `1`–`300`; default `60`.                                                       | `"commandSeconds": 120`                                  |
| `limits.modelSeconds`   | No        | Deadline for one Codex response, including its optional schema correction. Integer `1`–`1800`; default `180`. The overall review deadline still applies. | `"modelSeconds": 600`                                    |
| `limits.reviewSeconds`  | No        | Review request deadline, excluding preflight, service startup and cleanup. Integer `30`–`1800`; default `600`.                                           | `"reviewSeconds": 900`                                   |

## Hub settings

Use a separate [hub.json](../examples/hub.json) for repository routing.
All three fields are required; unknown fields are rejected. See [shared workers](shared-workers.md).

| Option       | Required? | Definition                                                                                   | Minimal example                                       |
| ------------ | --------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `repository` | Yes       | Private hub in `owner/repo` form. Must match the workflow repository.                        | `"repository": "acme/kicktires-worker"`               |
| `reviewer`   | Yes       | App bot login ending in `[bot]`; prefix uses lowercase letters, digits or hyphens.           | `"reviewer": "my-reviewer[bot]"`                      |
| `profiles`   | Yes       | Source repositories mapped to absolute trusted profile paths. Unlisted sources are rejected. | `"profiles": {"acme/api": "/etc/kicktires/api.json"}` |

### Workflow request inputs

The source workflow supplies these values automatically. They are not profile options.

| Argument     | Required? | Definition                              | Minimal example                                      |
| ------------ | --------- | --------------------------------------- | ---------------------------------------------------- |
| `repository` | Yes       | Source repository in `owner/repo` form. | `"repository": "acme/api"`                           |
| `pr`         | Yes       | Positive PR number as a decimal string. | `"pr": "42"`                                         |
| `head`       | Yes       | Full 40-character lowercase commit SHA. | `"head": "0123456789abcdef0123456789abcdef01234567"` |

The worker verifies the PR against GitHub and selects its trusted profile.
Requests cannot choose a profile path.
