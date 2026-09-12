# Configuration

Pass a trusted JSON file with `--profile`. Never load it from a PR head: it selects
commands, credentials and MCP endpoints. Unknown fields fail validation.

Start with [profile.json](../examples/profile.json). See the
[complete reference](configuration-reference.md) for every field, default and constraint.

```json
{
  "model": {
    "id": "gpt-5.6-terra",
    "effort": "high",
    "home": "/home/runner/.local/share/kicktires/codex"
  },
  "instructions": "Check boundary cases and public API compatibility."
}
```

## Codex subscription

Reviews use Codex with a dedicated CLI login. Choose a model
available to that account. `contextWindow` defaults to 100,000 tokens; set it to
the model's capacity.

From the installed release directory, sign in as the account running reviews:

```sh
mkdir -p "$HOME/.local/share/kicktires/codex"
chmod 700 "$HOME/.local/share/kicktires/codex"
CODEX_HOME="$HOME/.local/share/kicktires/codex" bunx --no-install codex login --device-auth
```

`home` is the absolute path to the dedicated Codex login and configuration directory.
`effort` is optional; omit it to use the model's catalog default. Unknown models
and unsupported efforts are rejected before preparing the review. Run `bun run doctor -- --profile PROFILE --credentials`
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

## Project instructions

Use `instructions` for project-specific guidance, up to 16,000 characters. Omit it
when unnecessary; empty values are rejected. Instructions supplement the built-in
review rules without granting tools or relaxing evidence validation. Use skills
for reusable guidance with supporting files.

Profile changes apply to new reviews; they do not rerun existing reviews.

## Optional tools

Add setup commands, check shortcuts, browser access, skills or MCP context only when
needed. [profile-full.json](../examples/profile-full.json) shows every field; replace
its commands, paths and MCP endpoint before use. It is a reference, not a ready-to-run
profile. The [option tables](configuration-reference.md#review-profile) explain the defaults.

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
