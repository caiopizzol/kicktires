# Upgrade from Agent Review

The product, packages, workflow name and new worker installations use `kicktires`.
Runtime variables use `KICKTIRES_`. The skill package is `@kicktires/skills`.

Existing workers are not renamed automatically. Install a fresh release under
`/opt/kicktires`; do not move compiled releases, copy the old release-selection file,
or run old and new workers concurrently. Their locks and image names differ.

1. Stop the repository's old runner with no queued or active reviews. Keep its
   installation and private reports for rollback.
2. Run the [installer](self-hosting.md) from the new committed source. It creates
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
