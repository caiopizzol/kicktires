# Replace existing reviewer workflows

Replace the old reviewer in the two private personal projects with the verified
Eve-based application on the existing VM. Preserve PR triggers and resolvable inline
review comments. Keep dirty working trees and unrelated services unchanged.

- [ ] Add and verify a small GitHub Actions adapter: trusted event/profile, pinned
      revisions, retained findings, stale-head rejection, duplicate prevention and honest
      incomplete results. Reviewed code stays in Docker; no GitHub token reaches the model.
- [ ] Install the adapter and trusted profiles for the existing repo-scoped runners;
      serialize work on the shared VM and configure model authentication.
- [ ] Replace the workflows through verified PRs and confirm their merge.
- [ ] Exercise the actual GitHub event-to-review path and inspect published results.

Private repository/VM details and delivery records stay in ignored `.runs/migration/`.
Use the existing API model. Subscription interoperability is not part of this migration.
Scope of the old action's own self-review is awaiting optional user clarification.

Implementation check: 25 tests / 98 assertions passed, including stale-after-review
failure, paginated bot-only dedupe and child credential isolation. Meta reviewed the
migration architecture. Independent Grok review led to one canonical snapshot diff,
isolated Git configuration/environment and non-success for revisions changed during
review. Cancellation remains no-publish; API rejection remains a visible failure
instead of an automatic fallback or silently successful check.

Existing runner registrations were preserved. Their idle services were restarted after
adding Docker/shared-lock group membership; runtime files are root-owned under /opt.
Workflows are being prepared in isolated private worktrees. The existing required check
name is retained to preserve branch protection without modifying repository settings.
