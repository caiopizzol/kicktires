# Replace existing reviewer workflows

Completed on 2026-09-10 for fipe-chat and cnpj-chat using the Eve-based application
on the authorized Hetzner VM. Existing dirty working trees and unrelated services
were preserved. The old application's own self-review was outside this migration.

- [x] Implement and verify trusted GitHub adapter, exact snapshots, stale-head rejection,
      bot-only deduplication, credential isolation and honest incomplete results.
- [x] Install immutable release, root-owned profiles/release selection, model credentials,
      repo-scoped runners and shared serialization.
- [x] Merge both workflow replacements and final profile-only launcher changes.
- [x] Verify live clean review, required skills, supplied worker-context skill, duplicate
      prevention, and an inline finding for an intentional test-backed regression.
- [x] Remove temporary compatibility bridge, close validation PRs without merging,
      delete their task-created remote branches and verify sandbox cleanup.

Evidence: `.runs/migration/summary.md`, `merged-prs.json`, `validation-final.json`,
review/comment receipts and `cnpj-launcher-owner.md`. These private records contain
exact PRs, revisions, runs and VM details. Selected release1c003e79c3329c4a81c2e5a5d6d939585f06187f
passed local/Linux checks (26tests,105assertions) and the Linux Eve build. FIPE passed
133tests per revision; CNPJ passed390base tests and failed2head tests for the seeded
month-offset regression, publishing the precise changed-line finding.

Meta and Grok consultations informed credential/revision boundaries and the fixes
exposed by live trials. Final evidence closure used an operator-supplied skill with
exact launcher source, preserving host isolation and incomplete-review failures.

API authentication is deployed. Subscription interoperability, public/fork PRs and
migration of the old application's self-review remain outside scope. These trials
establish execution/publication, not accuracy on arbitrary changes. Browser/MCP
capabilities were not exercised in these GitHub fixtures.

No implementation or delivery work remains. All migration monitor events were consumed;
the final event confirmed successful checks at the delivered CNPJ head.
