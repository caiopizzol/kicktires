# Kick Tires

Kick Tires is a self-hosted code-review application for people who want to use
an agent with their own models, review skills, tools and repository context.

The first version runs an explicit review of pinned Git revisions, provisions a
writable isolated environment, supplies trusted skills and tools, and returns
findings with recorded execution evidence. A command-line workflow is the initial
interface. It must work on real repositories, with configurable test commands,
browser checks and optional context connections. The GitHub Actions adapter triggers
this workflow for private, same-repository PRs and publishes findings against the pinned
head after checking report coordinates and recorded evidence references.

Eve owns agent execution, tool dispatch, skill discovery and session lifecycle.
This application owns review input preparation, trusted configuration, evidence,
findings and reporting. Authentication support is documented from verified behavior;
API models and subscription-backed agents must not be conflated.

Reusable skills are independently packaged Markdown and supporting files. Other
agent applications can install them without depending on this review application.
Slack insights, a generic agent platform, a settings dashboard, automated fixes and
automatic approvals are outside the initial product.
