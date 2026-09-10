# Adopting Agent Review

The CLI supports manual reviews on real repositories. The [GitHub adapter](github-actions.md)
adds automatic reviews and inline comments for private, same-repository PRs on your own
runner. Use the API authentication path already validated for your installation.

| Capability                                                            | Current Agent Review                            |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| Review exact base/head commits and produce diff-scoped findings       | Available                                       |
| Run on your own machine                                               | Available with Node, Bun and Docker             |
| Add review skills, terminal/browser tools and MCP context             | Available through Eve                           |
| Start automatically on a GitHub PR and publish inline review comments | Available on a self-hosted runner               |
| Use an existing Codex or Claude Code subscription login               | Not interchangeable with Eve; see configuration |
| Dashboard and arbitrary plugin marketplace                            | Outside the current scope                       |

The first adoption trials used existing test suites against selected commits in two
personal projects. They exposed three reviewer bugs: rejecting safe instruction-file
symlinks, sharing persisted workflows between runs, and including macOS metadata as
extra source files. Those paths now have corrections and regression evidence.

The initial GitHub integration invokes an immutable installed release and root-owned
trusted profile, pins PR revisions, and publishes retained findings only after checking
the current head and base. It preserves private-repository and same-repository branch
restrictions. Each runner has private artifacts, and a shared host lock serializes work.

Choose authentication separately. API access works today; subscription support must be
verified with the intended provider before replacing a subscription-based workflow.

Live GitHub trials also verified both publication paths: a clean change passed its
required checks on both revisions, while an intentional month-formatting regression
produced an inline finding on the changed line and failed verification after the head
tests failed. The base tests passed. Temporary regression PRs are validation fixtures,
not application changes to merge.

Required review skills are explicitly requested before inspection and checked against
recorded tool calls. If the agent skips a required skill, the check fails even when
repository tests pass. These trials establish the execution and publication path;
they do not measure review accuracy across arbitrary changes.
