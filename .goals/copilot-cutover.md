# Copilot worker cutover

User authorized moving only copilot-contabil to 204.168.172.253 on 2026-09-10.
Keep FIPE/CNPJ on 178.104.11.100. Preserve the old copilot runner until a real
PR review succeeds on the new worker; restore its service if validation fails.

- [x] Verify new VM selected release and Docker; old runner online, idle; no open PRs.
- [x] Install dedicated runner account, trusted profile and refreshed worker skill.
- [x] Register new runner, then hand off services without two matching active runners.
- [x] Validate exact runner/release, configured checks and exact-head review on draft PR.
- [x] Close fixture and retire old copilot registration after success.
- [x] Record result and any onboarding improvements.

New release: 254e25c4ad4c8ff2deac79f05b1681cf213ecd2a.
Old runner: id21, agent-review-hetzner-copilot.
Consultation: Meta622505d4-3db1-4ecd-82ba-7cbc0078b48d;
artifacts /tmp/agent-review/consult/cutover/.
Validation PR57 is running: run34510182611, job102982082182, runner22
agent-review-hetzner-copilot-v2. Exact head4b3dccfba003d8f522703c0b986d8086b9e28b2b.
Old service stopped and GitHub confirmed offline before new service started.
New worker preflight passed with runtime bin directory explicitly in PATH.
Completed: initial review and attempt2 passed; rerun logged duplicate with exactly
one review5170486034 on the pinned head. All eight recorded checks exited0;
573tests passed on each revision. CI34510183032 also passed. PR57 closed unmerged,
remote test branch deleted. Old service uninstalled and registration/credentials
removed through config.sh. GitHub now lists only runner22 online idle.
FIPE/CNPJ services remain active and old shared release unchanged.
Docs now describe the worker handoff and rollback. Application check passed
(26tests105assertions, formatting and types). No further cutover work remains. No persistent model credential needed: existing
repository Actions secret supplies it. Publication remains outside this cutover.
