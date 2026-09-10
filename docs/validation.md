# Validation record

Verified locally on 2026-09-10 with Eve 0.52.5, Node 24, Bun 1.3.12 and Docker 29.4.
Model runs used the example Fireworks DeepSeek V4 Flash router. Results establish
that these execution paths work; they do not establish general review accuracy.

| Scenario                                                    | Observed result                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real `codex-reviewer` change, `c19cf31` → `5283cf9`         | Exact `bun test ./src` passed on base and head: 179 tests each. Overall review remained incomplete because nested experiment dependencies/live Docker/model flows were unavailable offline, and one finding cited unsupported evidence. |
| Controlled counter, harmless header-case change             | Both terminal checks and Chromium click assertions passed; native MCP `get_requirement` fetched `COUNTER-1`; report `reviewed`, screenshots retained.                                                                                   |
| Controlled counter, increment changed to decrement          | Terminal test still passed; head browser assertion failed; reviewer identified the introduced bug at `app.cjs:2`; report `incomplete` with failure evidence.                                                                            |
| Setup command deliberately exits 7                          | Report `incomplete`; setup stderr/exit preserved; run container removed.                                                                                                                                                                |
| Review deadline during 90-second setup                      | A 30-second deadline returned incomplete; session retirement also timed out, but service/container fallback cleanup completed.                                                                                                          |
| Initial live review exceeds 500000-token budget             | Eve paused without structured output. This exposed a CLI bug; the CLI now reports missing output as incomplete and uses an explicit 2M session budget.                                                                                  |
| Skill package packed and installed into a separate consumer | All three Markdown skills and MIT license present; no Eve or other runtime dependency.                                                                                                                                                  |
| `bun run check`                                             | Formatting, TypeScript and 16 tests passed, including dirty-tree isolation, unsafe entries, Git export attributes, invalid evidence, required checks, failed browser verification and forced service shutdown.                          |
| `bun run smoke`                                             | Completed both clean and regression model reviews through the CLI and real MCP/browser paths.                                                                                                                                           |

The counter scenarios are explicit integration fixtures. The application does not
contain a counter-specific review gate; assertions come through the general browser
tool and results through the general report validator.

## Consultations and resulting changes

Meta architecture review informed the small `agent/`, `src/`, independent skill package
split, compile-once approach, trusted profiles and honest evidence boundaries.

Meta implementation review identified that rejecting one bad finding discarded useful
evidence. The validator now drops unsupported findings, records the gap and keeps
other findings and execution records. Lifecycle investigation added an explicit cleanup
fallback for interrupted setup/service shutdown and bounded setup output.

Independent Grok 4.6 review confirmed host credentials stay outside the sandbox and
identified the source-mutation, helper-writeability, failed-check and connection-name
issues. Required checks now count only the dedicated tool, restore tracked source and
leave nonzero exits incomplete. Browser checks restore source too. The image runs as
`node`, and a direct Docker check verified that user cannot overwrite the helper.
Container identity is recorded before native backend creation; cleanup remains scoped
to that exact run. Finding coordinates are no longer moved to nearby diff lines.

Some advice was rejected after verification: dynamic MCP maps are native Eve APIs;
required check commands are not an arbitrary-shell allowlist; and extra optional skills
do not replace the three bundled workflow dependencies. The suggestion to prune every Eve container was rejected because it could delete other
reviews. Normal cleanup hooks already
existed, so the actual missing initialization/shutdown path received the correction.

## Remaining limits

OpenAI and Anthropic API adapters are typechecked but were not exercised with live keys.
ChatGPT subscription integration is documented and wired to Eve's native model factory,
but no separate Eve login was available. Claude Code subscription reuse is unsupported.

No hosted production workload, arbitrary third-party plugin loader, shared multi-tenant
queue, GitHub publishing or Slack deployment was tested or implemented. Docker resource
quotas and the distinction between recorded evidence and attested execution are described
in [execution boundaries](execution.md).

## Personal-project adoption trials

Two real repositories exposed and verified these corrections:

- Relative `AGENTS.md` links to tracked `CLAUDE.md` files now survive snapshots;
  absolute, escaping, dangling, directory and chained links are rejected.
- Each compiled server runs from its own private directory. Concurrent reviews own
  separate `.eve/.workflow-data` stores; an old timed-out session cannot be recovered
  by the next review's worker. The smoke command asserts the per-run store exists.
- macOS archive creation disables AppleDouble metadata. A Linux reader saw 508 real
  entries instead of 1016 entries containing `._` companions, and tests stopped
  discovering those companion files as source.
- Completion instructions distinguish required verification gaps from optional work
  outside the requested scope. Host checks still reject failed required commands.

Meta follow-ups reviewed the symlink policy and standalone-server isolation against
supplied implementation and installed Eve behavior. No private project source was
included in those consultation prompts. Project-specific profiles, reports and
execution logs remain in the ignored `.runs/project-trials/` area.

Final trial validation passed formatting, TypeScript and 17 tests / 55 assertions.
The clean real-project review completed with all required tests passing; the other
reproduced a known defect with a failing required test. Neither used production access.

One additional browser smoke run diagnosed the planted regression but cited a context
line; strict diff validation dropped the finding and kept the report incomplete. After
adding exact-coordinate instructions, both smoke fixtures passed, with the regression
retained at the changed line. This verifies the path, not consistent model accuracy.
Meta's final consultation supported limited manual adoption and preserving strict
validation; automatic PR publishing remains a separate increment.
