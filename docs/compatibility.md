# Naming and compatibility

The product is **Kick Tires**. Its source package is `kicktires`; portable skills are
`@kicktires/skills`. Neither package is published to a registry.

Existing workers were installed as Agent Review. The following identifiers remain
stable so source upgrades do not silently create a second installation or duplicate
previously published reviews:

| Contract                         | Identifier                                                           |
| -------------------------------- | -------------------------------------------------------------------- |
| Worker installation and profiles | `/opt/agent-review`, `/etc/agent-review`                             |
| Sandbox image                    | `agent-review-sandbox:0.1.0`                                         |
| Runtime environment              | `AGENT_REVIEW_JOB`, `AGENT_REVIEW_PASSWORD`, `AGENT_REVIEW_RUNS_DIR` |
| Runner group, label and lock     | `agent-review`                                                       |
| Private report directory         | `~/agent-review-runs/`                                               |
| Installed release marker         | `.agent-review-installed`                                            |
| GitHub review markers            | `agent-review:BASE:HEAD`, `agent-review-status:STATUS`               |

These paths apply to new and existing workers regardless of checkout name.
Changing them requires a tested migration.

New workflow examples display **Kick Tires**. Existing required check names such as
**Agent review** or **Codex review** must remain until the operator deliberately updates
branch protection. A product rename alone does not migrate GitHub settings or runners.
