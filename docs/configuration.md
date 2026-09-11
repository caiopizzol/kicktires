# Configuration

Pass a trusted JSON file with `--profile`. It selects commands, credentials and MCP
endpoints; never load it from a PR head. Unknown fields fail validation. Skill paths
resolve relative to the profile.

Start with [examples/profile.json](../examples/profile.json). For browser checks,
extra skills and MCP context:

```json
{
  "model": { "provider": "openai", "id": "gpt-5.6-terra" },
  "setup": {
    "commands": ["bun install --frozen-lockfile --ignore-scripts"],
    "network": "allow-all"
  },
  "checks": ["bun test"],
  "skills": ["./skills/review-accessibility"],
  "browser": { "start": "bun run dev --host 127.0.0.1 --port $PORT" },
  "connections": {
    "project-context": {
      "url": "https://your-context-service.example/mcp",
      "description": "Read requirements by exact issue ID",
      "tools": ["get_issue"],
      "tokenEnv": "PROJECT_CONTEXT_TOKEN"
    }
  },
  "limits": { "commandSeconds": 60, "reviewSeconds": 600 }
}
```

Replace the example commands, skill path and MCP endpoint with real ones. Omit
`skills` and `connections` until needed; set `browser` to `false` to disable it.

## Project instructions

Add optional `instructions` to the trusted profile for project-specific review guidance:

```json
{
  "model": { "provider": "openai", "id": "gpt-5.6-terra" },
  "checks": ["bun test"],
  "instructions": "Check tenant isolation and preserve public API compatibility."
}
```

Upgrade the worker before adding this field; older releases reject it.
The text is sent to your selected model. Use up to 16,000 characters.
Omit the field when unnecessary; empty
values are rejected. Instructions supplement the built-in review rules. They do
not grant tools or relax evidence validation. Use optional
skills for reusable guidance with supporting files. Existing reviews are not rerun
when a profile changes; new revisions use the updated instructions.

## Models and authentication

| Provider    | Credential            | Integration          |
| ----------- | --------------------- | -------------------- |
| `openai`    | `OPENAI_API_KEY`      | OpenAI API           |
| `anthropic` | `ANTHROPIC_API_KEY`   | Anthropic API        |
| `xai`       | `XAI_API_KEY`         | xAI API              |
| `chatgpt`   | Eve login file        | ChatGPT subscription |
| `codex`     | Dedicated Codex login | Codex CLI adapter    |

The API adapters are typechecked; live end-to-end validation is pending. The Eve
subscription path is unverified. Codex validation is described below. Fireworks is
unsupported.

Choose a provider model with tool calling and structured output support. `apiKeyEnv`
sets the credential variable name, not the key itself. `contextWindow` defaults to
100,000 tokens; set it to the model's capacity. Custom endpoints are not supported.

ChatGPT uses Eve's `eve dev` → `/model` → Provider → ChatGPT subscription login.
Sign in as the account running the reviewer. Credentials live in
`~/.eve/auth/chatgpt.json`, separately from Codex. Eve managed deployment rejects
this local login path.
Claude Code subscriptions and Meta Muse execution are not implemented.

## Codex subscription

From the installed release directory, sign in as the account running reviews:

```sh
mkdir -p "$HOME/.local/share/kicktires/codex"
chmod 700 "$HOME/.local/share/kicktires/codex"
CODEX_HOME="$HOME/.local/share/kicktires/codex" bunx --no-install codex login --device-auth
```

Set the trusted profile's `model` field, using an absolute `codexHome` path:

```json
{
  "provider": "codex",
  "id": "gpt-5.6-terra",
  "reasoningEffort": "high",
  "codexHome": "/home/runner/.local/share/kicktires/codex"
}
```

`reasoningEffort` is optional and currently supported only for Codex. Omit it to use
the selected model's catalog default. kicktires rejects unknown models and unsupported
efforts before preparing the review. Run `bun run doctor -- --profile PROFILE --credentials`
to check the catalog without generating a response; account access is still checked
when the model runs.

The report records the selected provider, model and resolved effort. Codex must
acknowledge those settings before generation. Higher effort does not guarantee a correct finding.

The CLI manages login and token refresh; the model needs no API key or GitHub
secret. Keep `auth.json` private (mode `600`) and out of PRs, profiles and sandboxes.
Use a dedicated home without personal configuration or skills, and a separate
login file for each concurrent worker account. The CLI may create account-synced
plugin caches, but its app access and code execution are disabled.

Codex proposes responses; Eve executes tools and validates evidence. Each step
starts a fresh Codex thread with Eve's conversation, increasing context use compared
with a persistent thread. The adapter uses the experimental app-server API in pinned
CLI version 0.154.0. Subscription limits and reauthentication apply.

Clean and seeded browser-regression tests verified terminal checks, browser checks
and MCP context using a ChatGPT subscription.

## Checks and browser

`checks` is an optional list of command shortcuts, defaulting to `[]`. The agent can
run the suite when relevant or choose focused commands and temporary reproductions.
Results retain exit codes and bounded output. A failing test may support a finding;
it makes the review incomplete only when it blocks necessary investigation.
Keep project-wide pass/fail gates in CI.

The image includes Node, Bun, Git and Chromium. Add other runtimes to
`Dockerfile.sandbox` and rebuild. Browser mode starts the app with `PORT` and provides
Playwright's `page`, Node's `assert` and `origin`. The agent chooses when to use it
and compares revisions when attributing a regression. Successful checks save screenshots. See [execution limits](execution.md).

## Skills and context

Reviews use built-in instructions; no skills are required. Add optional skill
directories with `skills` in the trusted profile. Each directory needs `SKILL.md` with YAML `name` and `description` fields.
Supporting files must be UTF-8 text. Limits: 1 MiB per file, 256 files and 8 MiB total.
Duplicate names and symlinks are rejected. Skills guide behavior; they do not install
runtimes, grant tools or create connections. The agent loads supplied skills when relevant.

MCP `tools` is an explicit allowlist. Use read-only context tools and pass exact issue
IDs or references through `--context`. Tokens are resolved on the host. MCP tools run
outside sandbox networking rules and inherit their credential's permissions.

Arbitrary plugin manifests, marketplaces and standalone MCP resource browsing are
unsupported. Expose resources through allowed tools. To add a built-in tool, use
`agent/tools/<name>.ts` and rebuild. Execute reviewed code through `ctx.getSandbox()`;
use MCP for separately hosted integrations.
