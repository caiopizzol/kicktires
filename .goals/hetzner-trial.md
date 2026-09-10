# Hetzner end-to-end trial

Status: complete. Install the committed reviewer on the user-selected VM and verify
the complete CLI, Docker, model, skills, terminal, browser and MCP paths. Follow with
the two previously selected real-project reviews. Preserve existing applications and
old reviewers. No public service or GitHub publishing is part of this goal.

- [x] Install a pinned application and user-local runtimes under a dedicated account.
- [x] Pass checks, build and clean/regression browser-MCP smoke tests on Linux.
- [x] Run both private-project committed-change trials and inspect their reports.
- [x] Verify cleanup and document how to run the installed reviewer.

## Evidence

Ubuntu x86_64, Node 24.14.0, Bun 1.3.14 and Docker 29.1.3. System Node was unchanged.
Dependencies, Eve output and sandbox image were built on the VM from committed source.
Linux formatting/types and 17 tests / 55 assertions passed. The clean and regression
MCP/browser smoke cases passed in 70.9 seconds, with a retained exact-line regression
finding, base/head terminal checks and independent workflow stores.

The first real project completed in 116.3 seconds: 118 base tests and 121 head tests
passed, with no findings. The second completed in 65.3 seconds: 386 base tests passed;
431 head tests passed and one failed. Its retained finding reproduces the same known
pin-format defect independently checked in the preceding local trials. Exit 2 correctly
represents incomplete verification rather than a runner crash.

Git integrity checks passed on the transferred shallow snapshots, containing only the
two selected commits and their trees/blobs. Dirty files and unrelated history were not
transferred. All reviews ran sequentially. The API key arrived through SSH stdin and
was supplied to the host process; no permanent key file was installed. A post-run scan
found zero matches in retained JSON, JSONL and log files.

No review processes or containers remained afterward. Listener inventory returned to
the initial state and existing containers retained their uptime. Host details, exact
revisions, reports and installation manifest remain private under `.runs/hetzner/`.
The public operating instructions are in [self-hosting](../docs/self-hosting.md).

Meta's deployment consultation supported the bounded setup, emphasizing sequential
runs, native Linux builds, explicit runtime PATH and transient credentials. These were
checked against execution evidence. Docker group access still controls the shared
host daemon; this trial does not establish hostile multi-tenant isolation or quotas.

## Next increment

The installed manual CLI is ready for further personal-project trials. GitHub PR
triggers/publishing and subscription authentication remain separate adoption work;
see [adoption](../docs/adoption.md).
