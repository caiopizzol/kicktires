# Fresh repository onboarding

Completed application onboarding and installation DX improvements on 2026-09-10.
Copilot-contabil now runs Agent Review on a dedicated runner on the existing Hetzner
worker. Existing reviews retain their active application release and sandbox image.

- [x] Identify concrete first-install friction through Meta/Grok consultations and trial.
- [x] Implement repeated worker installation and actionable preflight checks.
- [x] Validate target checks inside Docker, preserving original dirty working files.
- [x] Register repository runner, trusted profile/model credential and workflow.
- [x] Merge workflow, validate clean and regression GitHub reviews, close fixture.
- [x] Document Linux VM/cloud-VM setup, verification evidence and distribution limits.

Installer validation: additive install and repeat preserve active release; fresh Linux
filesystem install/repeat pass using a separate image tag and real host Docker daemon.
No fresh cloud VM provisioning or reboot was tested. Doctor passed under runner account
and rejected missing model credentials without values or paid calls. Trials fixed PATH
handling for administrator/local commands and inaccessible current directories.

Target verification:573base/head tests and all configured type/generated-type/build
checks passed for clean revision. Intentional classification regression produced10head
test failures and a changed-line finding; fixture closed-unmerged and remote branch
removed. Initial workflow PR55 merged, CI passed. No branch protection was changed.
GitHub merged immediately when auto-merge was requested on this unprotected repository;
CI completed successfully afterward. Do not claim CI was a configured merge gate.

Private evidence and exact revisions: `.runs/onboarding/delivery.json`,
`validation-reviews.json`, `validation-comments.json`, and `summary.md`.
Consultation artifacts: `/tmp/agent-review/consult/onboarding/`.

User was asked whether to publish caiopizzol/agent-review publicly or privately; no
answer yet. No remote created. Source distribution remains a documented gap; do not
publish without the requested visibility decision. All onboarding monitor events were consumed. The final event confirmed the
expected failing check for the already-verified regression fixture; no further
fixture or runner actions remain.
