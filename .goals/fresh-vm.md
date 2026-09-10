# Bare VM installer trial

Use the newly authorized VM to validate an install.sh entry point from a bare Linux
system. Install prerequisites and pinned application source, verify repeatability,
preflight and actual review execution; test reboot recovery if the machine is idle.
Preserve existing production reviewer VM and repositories. No automatic publication
of application source or migration of live runners is implied.

- [ ] Inspect new VM and establish supported OS/architecture.
- [ ] Consult on minimal bootstrap design and implement missing installation steps.
- [ ] Run installation from bare machine and repeat it without reconfiguration.
- [ ] Verify a real sandbox/model review and lifecycle cleanup.
- [ ] Verify reboot recovery and document copyable commands plus measured limitations.

Private connection details, logs and consultation receipts: `.runs/fresh-vm/`.
Read the goal when resuming and keep remaining work accurate.

Connection status: replacement VM supplied. Server accepts the explicitly selected
Hetzner public key, whose fingerprint matches the user-provided value, but the private
key is passphrase-protected and unavailable in ssh-agent/Keychain. User must unlock
it locally with ssh-add; never request the passphrase in chat. OS not yet inspected.
Meta bootstrap consultation completed: thin supported-OS prerequisite wrapper around
install-worker; verify official runtime checksums; fix retry window after image build
before first pin and write installation marker after permissions are finalized.
Consultation `/tmp/agent-review/consult/fresh-vm/design.jsonl`; verify against execution.
