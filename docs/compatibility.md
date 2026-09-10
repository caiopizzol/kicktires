# Naming and compatibility

The product is **Kick Tires**. Its source package is `kicktires`; portable skills are
`@kicktires/skills`. These are source workspace names, not a claim of registry publication.

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

A checkout directory can be named `kicktires`; it does not select the worker paths.
The installer continues using the stable paths above on both new and existing workers.
Renaming these contracts requires an explicit migration and validation.

New workflow examples display **Kick Tires**. Existing required check names such as
**Agent review** or **Codex review** must remain until the operator deliberately updates
branch protection. A product rename alone does not migrate GitHub settings or runners.
