# Personal-project trials

Status: complete. Trial two selected committed changes in real personal repositories
with existing checks inside Docker. Preserve dirty working trees and keep all project
identifiers, profiles and reports private under `.runs/project-trials/`. No production
credentials, deployment, GitHub writes or target-project fixes are part of this goal.

- [x] Review both selected changes with their relevant existing tests in Docker.
- [x] Independently check the material reported finding against committed source and tests.
- [x] Fix and test reviewer issues exposed by the trials.
- [x] Record outcomes and minimum remaining adoption gaps versus codex-reviewer.

## Evidence

The private record `.runs/project-trials/summary.md` links exact revisions, trusted
profiles and reports. One review completed with 118 base / 121 head tests passing and
no confirmed defects. The second had 386 base passing / 431 head passing and one failure;
the reviewer reproduced a known digest migration defect. Target working-tree statuses
match the initial inventory; no reviewed-project files were written by this work.

Corrections: allow safe relative links to tracked regular files, isolate each standalone
Eve server's workflow store, omit macOS AppleDouble archive entries, and scope completion
to requested verification. Exact citation instructions were added after a browser fixture
correctly diagnosed a bug but supplied an invalid line; validation remains strict.

`bun run check` passed formatting, TypeScript and 17 tests / 55 assertions. Build passed.
The final `bun run smoke` passed both real model/MCP/browser fixtures, including the
retained regression finding and per-run workflow stores; evidence is recorded in
`.runs/project-trials/smoke-citations.log`. No review containers remained afterward.
A successful rerun does not establish general model citation accuracy.

Meta consultation follow-ups reviewed the symlink policy, session isolation and final
adoption limits. Their recommendations were checked against implementation and trial
artifacts. Consultation records are outside tracked source; no private project source
was supplied to consultants.

## Next increment

See [adoption](../docs/adoption.md): add one self-hosted GitHub PR trigger and publishing
path, pin revisions and check the current PR head before publishing validated findings.
Keep the old action until that path and the preferred authentication mode are tested.
API access works; subscription interoperability remains separate. No dashboard, plugin
marketplace or Slack service is needed for this adoption step.
