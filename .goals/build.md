# Build Agent Review

## Outcome

Build a clean, self-hosted Eve-based code-review application and an independent
reusable skill package. Users configure models, skills, tools, resources and execution
requirements. Demonstrate a real review with actual terminal/browser verification.
Preserve the existing codex-reviewer action; this is a new project.

## Completion criteria

- [x] Concise product structure, pinned dependencies, one documented setup and check
      command, and a runnable CLI for pinned Git revision reviews.
- [x] Reusable versioned skill package with explicit supporting dependencies and
      tool requirements, consumed by the application without personal-machine paths.
- [x] Trusted review configuration selects supplied skills, model/authentication,
      terminal commands and optional browser/context tools; unsupported capabilities
      fail explicitly.
- [x] General repository snapshots and real isolated execution with bounded commands,
      controlled credentials, preserved tool evidence, validated findings and cleanup.
- [x] Real model review of a representative repository change, including terminal
      tests, browser verification and a real MCP connection path; clean and failed
      execution paths are distinguished from a verified review.
- [x] Subscription integration investigated against actual Eve/provider behavior;
      supported paths exercised when credentials are available, unavailable paths
      documented with precise causes rather than invented compatibility.
- [x] Independent consultations on architecture and implementation, meaningful
      regression tests, complete developer documentation and measured results.

## Scope and decisions

Working name and folder: Agent Review, ~/dev/personal/agent-review.
Build on Eve; no new generic runtime abstraction. Generic missing infrastructure
belongs in Eve extensions/upstream; review-specific behavior belongs here.
Shared skills must remain useful outside this application; no Slack service now.
Start locally. No production deployment, registry publication or GitHub repository
creation implied by choosing a new local folder. Reassess delivery after local proof.

## Evidence and resume point

Existing prototype: ../codex-reviewer/experiments/eve-review, merged PR90. It proved
Eve0.52.5 skills/tools/Docker with a Fireworks model, but its typed shipping-case
fixture is not the general application. Reuse lessons, not the fixture architecture.
Existing Codex/Claude action remains in its original repository. Prior goal is complete.

Implementation complete. `bun run check`: 16 tests pass; final Eve build passes.
`bun run smoke` completed clean and deliberate-regression model reviews with terminal,
Playwright and native MCP. Hardened smoke also modified tracked files during setup;
source restoration preserved the clean behavior and retained the real regression.
Portable skill tarball installed separately with no runtime dependencies.

Final clean review: .runs/review-8KglJU (reviewed, both checks/browser/MCP).
Final setup failure: .runs/review-e1JPPk (incomplete, container removed).
Hardened smoke: .runs/review-DqIIlb (clean), .runs/review-hJKovi (regression).
Deadline cleanup: .runs/review-xlCGgS (30-second deadline during slow setup; container
removed despite session retirement timeout). No review session containers remained.
Real repository: .runs/review-6nswZf/response.json and report.revalidated.json; root tests
passed179 each; overall incomplete due offline nested experiment and unsupported finding.

Fireworks was exercised live. OpenAI/Anthropic API adapters are wired and typechecked.
Eve ChatGPT login was absent; Claude Code subscription reuse is unsupported. Exact
limitations and self-hosting instructions are documented in docs/configuration.md and
docs/execution.md. Generic plugin manifests and GitHub publishing remain outside v0.1.

Consultations completed and verified: Meta three turns, session
622505d4-3db1-4ecd-82ba-7cbc0078b48d, and independent Grok4.6 xhigh, session
d8ecf98e-9c2a-483f-8e92-ecd2273a8b11. Records in /tmp/agent-review/consult.
Confirmed findings drove evidence preservation, exact source snapshots/restoration,
non-root browser execution, failed-check reporting, connection names and scoped cleanup.
Rejected broad container pruning and unsupported credential-leak claims; see validation.

Local Git initialized on main with github.account=caiopizzol. Initial commit records
the finished application. No new remote created or production deployment performed.
Existing codex-reviewer action remains unchanged (only its previous local goal note is
modified). Resume only for new user scope; this goal's completion criteria are met.
