# Configuration

Pass a trusted JSON file with `--profile`. It selects commands, credentials and MCP
endpoints; never load it from a PR head. Unknown fields fail validation. Skill paths
resolve relative to the profile.

Start with [examples/profile.json](../examples/profile.json), then add capabilities:

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

## Models and authentication

| Provider    | Credential          | Integration                   |
| ----------- | ------------------- | ----------------------------- |
| `openai`    | `OPENAI_API_KEY`    | Direct OpenAI API             |
| `anthropic` | `ANTHROPIC_API_KEY` | Direct Anthropic API          |
| `xai`       | `XAI_API_KEY`       | Direct xAI API for Grok       |
| `chatgpt`   | Eve login file      | Subscription path; unverified |

API adapters are typechecked; see the current validation limits before deployment.
Live end-to-end validation of these direct providers is pending. Earlier Fireworks
trials do not validate them. Fireworks is no longer supported; migrate profiles and
secrets before upgrading an existing worker.

Choose a provider model with tool calling and structured output support. `apiKeyEnv`
overrides the credential variable name, never its value. `contextWindow` defaults to
100,000 tokens; set it to the model's capacity. Custom endpoints are not supported.

ChatGPT uses Eve's `eve dev` → `/model` → Provider → ChatGPT subscription login.
Sign in as the account running the reviewer. Credentials live in
`~/.eve/auth/chatgpt.json`, separately from Codex; review configuration changes and
rebuild if needed. Eve managed deployment rejects this local login path.
Claude Code subscriptions and Meta Muse execution are not implemented.

## Checks and browser

Required checks run verbatim on both revisions and retain exit codes and bounded
output. Nonzero exits leave verification incomplete; they do not establish a new bug.
The agent can run additional commands and temporary reproductions in the sandbox.

The image includes Node, Bun, Git and Chromium. Add other runtimes to
`Dockerfile.sandbox` and rebuild. Browser mode starts the app with `PORT` and provides
Playwright's `page`, Node's `assert` and `origin`. Assertions run on both revisions;
successful browser checks save screenshots. See [execution limits](execution.md).

## Skills and context

The bundled `review-code`, `get-context` and `verify-change` skills are required.
Additional directories need `SKILL.md` with YAML `name` and `description` fields.
Supporting files must be UTF-8 text. Limits: 1 MiB per file, 256 files and 8 MiB total.
Duplicate names and symlinks are rejected. Skills guide behavior; they do not install
runtimes, grant tools or create connections. See [portable skills](../packages/skills/README.md).

MCP `tools` is an explicit allowlist. Use read-only context tools and pass exact issue
IDs or references through `--context`. Tokens are resolved on the host. MCP tools run
outside sandbox networking rules and inherit their credential's permissions.

Arbitrary plugin manifests, marketplaces and standalone MCP resource browsing are
unsupported. Expose resources through allowed tools. To add a built-in tool, use
`agent/tools/<name>.ts` and rebuild. Execute reviewed code through `ctx.getSandbox()`;
use MCP for separately hosted integrations.
