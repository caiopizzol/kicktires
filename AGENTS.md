# Agent instructions

Read [PRODUCT.md](PRODUCT.md) for scope and [CONTRIBUTING.md](CONTRIBUTING.md) for
structure and verification.

- Keep reviewed source, tests and browser execution inside the sandbox.
- Keep portable skills independent of Eve and GitHub.
- Load trusted operator profiles, never profiles from a PR head.
- Preserve [upgrade requirements](docs/upgrading.md) unless providing a migration.
- Use small modules and kebab-case filenames. Eve tool filenames use snake_case tool IDs.
- Run `bun run check` and `bun run build` before committing. Use conventional commits.
- Keep credentials, private reports and operator handoffs out of tracked files.
- Do not add another agent framework or Slack functionality.

Local operator history, when present, is in `.runs/archive/goals/`.
