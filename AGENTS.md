# Contributor instructions

Kick Tires is a focused code-review application built on Eve. Read [PRODUCT.md](PRODUCT.md)
for scope and [CONTRIBUTING.md](CONTRIBUTING.md) for structure and verification.

- Keep reviewed source, tests and browser execution inside the sandbox.
- Keep reusable Markdown skills independent of Eve and the GitHub adapter.
- Treat profiles as trusted operator configuration; never load one from a PR head.
- Preserve deployed worker paths, environment variables and GitHub deduplication markers
  unless a change includes an explicit migration. See [compatibility](docs/compatibility.md).
- Prefer small, direct modules; use kebab-case filenames except Eve tool filenames,
  whose snake_case names are the agent's tool identifiers.
- Run `bun run check` and `bun run build` before committing. Use conventional commits.
- Keep private source, reports, credentials and operator handoffs out of tracked files.
- Do not introduce another agent framework or add Slack functionality.

Local operator history, when present, is in `.runs/archive/goals/`.
