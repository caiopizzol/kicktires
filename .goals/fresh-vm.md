# Bare VM installer trial

Completed2026-09-10. The newly authorized Ubuntu26.04 amd64 VM had2CPUs,4GBRAM and
no Node/Bun/Docker. Root install.sh now supports explicit Ubuntu24.04/26.04 and
amd64/arm64, provisions prerequisites and verifies pinned Node/Bun downloads before
delegating to the existing committed-source worker installer.

- [x] Inspect bare VM and verify OS/architecture and missing prerequisites.
- [x] Consult on minimal bootstrap and implement missing steps.
- [x] Install from bare machine and repeat with existing state preserved.
- [x] Verify recovery with built image but absent first release-selection file.
- [x] Run non-root preflight and live clean/regression terminal/browser/MCP smoke.
- [x] Reboot idle VM; verify changed boot ID, stable pin, Docker service, lock and sandbox.
- [x] Document copyable command and tested limits.

Source trial release254e25c4ad4c8ff2deac79f05b1681cf213ecd2a.26tests105assertions and
Linux Eve build passed. Live smoke clean reviewed, regression incomplete with finding,
outer smoke exit0. No containers remained before reboot or after verification.

Meta consultation led to first-install image retry recovery, marker after permissions,
explicit diffutils, early source check and atomic runtime writes. Trap movement was
not adopted as a cure for SIGKILL; incomplete source-release cleanup still requires
explicit inspection. Ubuntu24.04/arm64 not tested in this bare-VM trial.

Private evidence: `.runs/fresh-vm/summary.md`; logs and consultations in
`/tmp/agent-review/fresh-vm-*.log` and `/tmp/agent-review/consult/fresh-vm/`.
Existing production reviewer VM and workflows untouched. Source transferred by Git
bundle; no public repository URL invented. GitHub runner and model-secret onboarding
remain documented separate steps. No further work required for this VM bootstrap trial.
