# Agent instructions

Read [PRODUCT.md](PRODUCT.md) for scope and [CONTRIBUTING.md](CONTRIBUTING.md) for
structure and verification.

- Keep reviewed source, tests and browser execution inside the sandbox.
- Keep portable skills independent of Eve and GitHub.
- Load trusted operator profiles, never profiles from a PR head.
- Use small modules and kebab-case filenames. Eve tool filenames use snake_case tool IDs.
- Run `bun run check` and `bun run build` before committing. Use conventional commits.
- Keep credentials, private reports and operator handoffs out of tracked files.
- Eve owns tool execution and evidence; Codex is an inference adapter. Do not add unrelated agent frameworks or Slack functionality.

Local operator history, when present, is in `.runs/archive/goals/`.

Active operator goal: `.runs/worker-queue/goal.md` (local, untracked).

Active onboarding goal: `.runs/onboarding/goal.md` (local, untracked).
