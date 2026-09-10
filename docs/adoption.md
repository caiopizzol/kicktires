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

## Fresh repository onboarding

A third private repository with no previous review agent was onboarded using a new
repository-scoped runner and the existing worker release. Its sandbox ran 573 tests,
package type checks, generated-type verification and a web build with networking
disabled after dependency setup. The clean GitHub review passed every configured
check on both revisions. A temporary case-normalization regression then produced an
inline finding and 10 failing head tests; the base remained green. The fixture was
closed without merging.

That installation drove the worker installer, preflight command and unified
[setup guide](self-hosting.md). The installer was exercised twice on the existing
Linux worker without changing the active release, and twice in a clean Linux
filesystem with a separately tagged real Docker image. The latter used the host
Docker daemon; it was not a new cloud VM or a VM reboot test. Runner service startup
was verified separately on the actual worker.

The trials found and corrected missing administrator/local executable paths and a
misleading preflight failure from an inaccessible working directory. Preflight was
verified both passing under the runner account and failing for a missing model key.
A tmpfiles rule now provisions the review lock after reboot; reboot recovery itself
has not been exercised in these trials.

Installation still requires obtaining source, installing platform prerequisites and
registering the runner through GitHub. There is no published installation package,
cloud deployment template or hosted control plane. The documented cloud path is a
Linux VM with Docker; serverless platforms without Docker are outside this setup.
