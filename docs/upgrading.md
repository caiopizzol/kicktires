# Upgrading

## Public source repositories

Upgrade the installed worker before enabling public repositories in the source workflow.
Older workers reject public PRs even when a workflow submits them. Remove only the
`github.event.repository.private == true` condition from existing source workflows;
retain `pull_request_target`, the same-repository head guard and trusted profiles.
The shared hub stays private and continues to allow only configured source repositories.
Reviews on public PRs publish summaries, findings and gaps publicly, so use only context
appropriate for that audience.

## Review completion and CI

Check commands are now optional investigation shortcuts. Neither configured checks
nor browser access require execution on every PR. A completed review can report
findings and failing assertions; missing necessary evidence still makes it incomplete.

Before activating this release, require your existing CI jobs independently of the
reviewer. Verify that they report on every PR, including documentation-only changes.
Existing profiles remain valid; remove instructions that demand full-suite execution
unless that is intentional. Older workers still require at least one check command.

Already published reviews retain their status on reruns. Revalidate old private reports
with their originating release; use a new revision for a fresh investigation.

## Upgrade from Agent Review

The product, packages, workflow name and new worker installations use `kicktires`.
Runtime variables use `KICKTIRES_`.

Existing workers are not renamed automatically. Install a fresh release under
`/opt/kicktires`; do not move compiled releases, copy the old release-selection file,
or run old and new workers concurrently. Their locks and image names differ.

1. Stop the repository's old runner with no queued or active reviews. Keep its
   installation and private reports for rollback.
2. Run the [hosted installer](self-hosting.md) at `https://kicktires.dev/install.sh`.
   Use `--version FULL_COMMIT_SHA` to select a release. It creates
   `/opt/kicktires`, `/etc/kicktires`, the `kicktires` group and lock, and
   `kicktires-sandbox:0.1.0`. Completed releases use `.kicktires-installed`.
3. Copy trusted profiles to `/etc/kicktires`. Update absolute skill paths and launcher
   snapshots. Replace removed Fireworks configurations and secrets with a supported provider.
4. Add the runner account to the `kicktires` group and restart its service to pick up
   membership. Add the `kicktires` runner label. Update the workflow to invoke
   `/opt/kicktires/bin/review-pr` with its new profile path.
5. Update custom integrations to `KICKTIRES_JOB`, `KICKTIRES_PASSWORD` and
   `KICKTIRES_RUNS_DIR`. New private reports go to `~/kicktires-runs/`; retain old
   `~/agent-review-runs/` data under your retention policy.
6. Run preflight and validate a fresh PR, then rerun it to check duplicate prevention.
   New comments use `kicktires:` and `kicktires-status:` markers; the adapter also reads
   old `agent-review:` markers so historical reviews are not repeated.
7. After the new `kicktires` check passes, replace the old required check name in
   branch protection. Remove old labels and retire the old installation only after
   validation. For rollback, stop the new runner before restoring the old workflow,
   profile and service; restore required check names too.

This source change does not migrate deployed VMs or GitHub settings. End-to-end worker
migration must be validated before retiring an existing installation.

Use the originating release to revalidate private reports created before change anchors;
existing GitHub reviews and duplicate detection are unaffected.
