# Review configuration

Pass an explicit trusted JSON file with `--profile`. Never accept this configuration
from an untrusted PR: it selects setup commands, model credentials and MCP endpoints.
Unknown fields fail validation. Additional skill paths resolve relative to the profile.

```json
{
  "model": {
    "provider": "fireworks",
    "id": "accounts/fireworks/routers/deepseek-v4-flash-0731-us",
    "apiKeyEnv": "FIREWORKS_API_KEY",
    "contextWindow": 100000
  },
  "skills": ["./skills/review-accessibility"],
  "setup": {
    "commands": ["bun install --frozen-lockfile --ignore-scripts"],
    "network": "allow-all"
  },
  "checks": ["bun test"],
  "browser": { "start": "bun run dev --host 127.0.0.1 --port $PORT" },
  "connections": {
    "project-context": {
      "url": "https://your-context-service.example/mcp",
      "description": "Read project requirements by exact issue ID",
      "tools": ["get_issue"],
      "tokenEnv": "PROJECT_CONTEXT_TOKEN"
    }
  },
  "limits": { "commandSeconds": 60, "reviewSeconds": 600 }
}
```

The skill directory and MCP URL above are placeholders. Omit `skills` and `connections`
until you have real ones. Set `browser` to `false` for non-browser repositories.

## Models and authentication

| Provider    | Default credential     | Status                                                                           |
| ----------- | ---------------------- | -------------------------------------------------------------------------------- |
| `fireworks` | `FIREWORKS_API_KEY`    | Live reviews verified with the example DeepSeek router and US inference endpoint |
| `openai`    | `OPENAI_API_KEY`       | Official AI SDK adapter wired and typechecked; live call not verified here       |
| `anthropic` | `ANTHROPIC_API_KEY`    | Official AI SDK adapter wired and typechecked; live call not verified here       |
| `chatgpt`   | Eve's local login file | Eve-supported path wired; live call unavailable because no Eve login was present |

Use a model ID supported by the selected provider and capable of tools and structured
outputs. `apiKeyEnv` changes the environment variable name; it never contains a key.
`contextWindow` defaults to 100000 and must reflect the actual model's capacity.

Eve documents ChatGPT subscription login through `eve dev`, then `/model` → Provider →
ChatGPT subscription. This stores a private `~/.eve/auth/chatgpt.json`, separate from
Codex login. Perform login on the self-hosted machine under the account running Eve;
review any model-configuration changes made by `/model` and rebuild when necessary.
Agent Review never copies or translates Codex credentials. Local subscription login
is not a deployable API credential; Eve's managed deployment rejects it.

Claude Code subscription reuse is **not implemented or verified**. An Anthropic API
key works through the API adapter; a Claude subscription is not an API key. This first
version therefore does not yet provide interchangeable Codex/Claude CLI subscription
execution. That is an explicit remaining product limitation.

## Skills, tools and context

The three bundled skills form the required review workflow. Extra skill directories
must contain YAML frontmatter with `name` and `description`. Supporting text files are
loaded alongside the Markdown. Duplicate names and symlinks fail explicitly. UTF-8
text files are limited to 1 MiB each, with at most 256 files and 8 MiB across all skills.

Required checks run on both revisions. Their exit codes and bounded output are recorded.
A nonzero required check leaves verification incomplete; it does not by itself establish
a new regression. Additional terminal commands
are permitted for investigation. The container includes Node, Bun, Git and Chromium;
add other language runtimes to `Dockerfile.sandbox` and rebuild the image as needed.

Browser mode supplies `PORT` to the configured start command and opens the app on
isolated localhost. The model writes a Playwright script with `page`, Node's `assert`
and `origin`. It must test both revisions; a failed assertion leaves verification
incomplete and may support a finding. Successful checks save screenshots.

MCP connections use Eve's native dynamic factory and discovery tool. `tools` is the
explicit allowlist; use read-only context tools for reviews. Authentication tokens are
resolved in the host service, not put into the sandbox. External tools run outside the
review container's network policy. Their permissions are those of the configured
credential, so the operator controls the actual data/action boundary.

Portable skills and native MCP are supported. Arbitrary Codex/Claude plugin manifests,
plugin marketplaces and standalone MCP resource browsing are not implemented. Expose
needed resources through allowed MCP tools. Pass exact issue IDs or context references
in `--context`; the reviewer is instructed not to invent them.

## Add a trusted tool

Use Eve's native `agent/tools/<name>.ts` files, as the built-in `run_command` and
`browser_check` tools do, then rebuild. Keep reviewed code execution behind
`ctx.getSandbox()`; a host `child_process` call would change the isolation boundary.
Use MCP for separately hosted context integrations. There is no second tool/plugin
registration framework to configure in this application.
