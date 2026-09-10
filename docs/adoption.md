# Adopting Agent Review

The CLI supports manual reviews on real repositories. Keep the existing Codex Reviewer
GitHub action until the PR integration and your preferred authentication path are ready.

| Capability                                                            | Current Agent Review                            |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| Review exact base/head commits and produce diff-scoped findings       | Available                                       |
| Run on your own machine                                               | Available with Node, Bun and Docker             |
| Add review skills, terminal/browser tools and MCP context             | Available through Eve                           |
| Start automatically on a GitHub PR and publish inline review comments | Not implemented                                 |
| Use an existing Codex or Claude Code subscription login               | Not interchangeable with Eve; see configuration |
| Dashboard and arbitrary plugin marketplace                            | Outside the current scope                       |

The first adoption trials used existing test suites against selected commits in two
personal projects. They exposed three reviewer bugs: rejecting safe instruction-file
symlinks, sharing persisted workflows between runs, and including macOS metadata as
extra source files. Those paths now have corrections and regression evidence.

The next product increment should connect the verified CLI review path to GitHub:
receive a PR event, pin its revisions, run the configured review, and publish retained
findings only if the PR head still matches. Preserve private-repository and same-repository
branch restrictions from the existing action for the initial integration. Add one
self-hosted runner path before introducing a shared queue or settings UI.

Choose authentication separately. API access works today; subscription support must be
verified with the intended provider before replacing a subscription-based workflow.
