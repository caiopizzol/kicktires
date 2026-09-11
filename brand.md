---
name: "kicktires"
tagline: "Code review that runs your code."
version: 1
language: en
---

# kicktires

## Strategy

### Overview

kicktires is a self-hosted, open-source code reviewer that executes the change it reviews.
It snapshots base and head, investigates with relevant commands inside a disposable
sandbox, and posts findings with recorded evidence and an explicit list of
what it could not verify.

It grew out of a private runner for Codex and Claude reviews. The lesson from that tool:
a reviewer that only reads the diff produces confident comments nobody can check.

The problem is not that automated review misses bugs. It is that every tool reads the diff
and none of them show their work, so developers cannot tell a reproduced regression from a
guess and learn to skim past all of it.

Before: an AI leaves comments and you re-derive every one. After: the reviewer shows what it investigated,
what the evidence says, and what remains unknown. You decide.

Ambition: the default reviewer for teams who want it on their machines with their models.

### Positioning

Category: executable code review. Self-hosted pull request review that runs the code.

Not an approver. Not an autofixer. Not an agent platform. Not a dashboard or marketplace.
Not a hosted service. Not a proof of correctness.

Landscape: hosted readers (Cubic, CodeRabbit, Greptile, Bugbot, Copilot, Codex review)
sell speed and fewer false positives on a diff. Open-source readers (Kodus, PR-Agent,
Shippie) sell model choice on the same diff. kicktires runs the code and reports exit codes.

Differentials:

- Investigates with sandboxed tools, network off; compares revisions to attribute regressions.
- Every finding cites a recorded tool call and a changed line, or it is dropped.
- Reports "incomplete" with the cause when required verification did not finish.
- Your model key, your skills, your MCP context, your runner.
- Comments only. Never approves, never requests changes, never pushes.

Territory: the receipt. A review you can audit line by line.

### Personality

Archetype: The Mechanic. Hands on the thing, honest about what was checked.

Attributes: hands-on, literal, plain, unhurried, accountable.

Is: specific, evidence-first, candid about limits, quiet.

Is not: clever, hyped, reassuring, fast for its own sake, a judge.

### Promise

- We investigate the change and show what we checked.
- Every finding comes with the evidence.
- We tell you what we could not verify.
- The decision stays with you.

Base message: a code review is only worth reading when you can see what the reviewer did.

Synthesis: kicktires exists so that "looks good" comes with a receipt.

### Guardrails

Tone: plain, specific, literal, dry, unhurried.

Cannot be: an approver, an oracle, a speed brand, a mascot, a racing brand, a security scanner.

Litmus: if it claims something it did not run, it is wrong.

## Voice

### Identity

We are a code reviewer that can run the code. We investigate the revisions you are about to
merge, run relevant checks and compare results when needed, and write down what happened.
When something fails, we show you the run. When we could not check something, we say so in
the same breath.

We are not an approver. We do not fix your code. We do not know your codebase better than
you do. We are the colleague who pulled the branch, ran the tests, clicked the button, and
came back with notes and the terminal output.

Essence: the review that shows its work.

### Tagline & Slogans

Primary: **Code review that runs your code.** README, site header, app description.

Alternatives:

- Reviews with receipts.
- Your reviewer, on your machines.
- Reproduce. Compare. Report.

Slogans:

- Base passed. Head failed. Here is the run.
- Could not verify is an honest answer.
- Findings, evidence, gaps. Then you decide.
- Read it, then run it.
- Not an approval.

### Message Pillars

- **Runs.** The reviewer chooses relevant investigation. It runs checks and compares
  base and head when needed; it does not run every check on every review.
- **Evidence.** Every finding cites a recorded tool call and a changed line. Unsupported
  findings are dropped, not softened.
- **Gaps.** What could not be verified is listed with its cause. Incomplete means
  verification is unfinished. It is not a verdict on your code.
- **Yours.** Your model, your skills, your context, your infrastructure. Nothing leaves the
  host except what you send to your provider.
- **You decide.** Comments only. Never approves, never requests changes, never pushes a fix.
  The GitHub check blocks merging for findings or incomplete verification. A passing
  check means the investigation completed without findings; it is not an approval.

### Phrases

- Code review that runs your code.
- Base passed. Head failed. Here is the run.
- Not an approval.
- Could not verify: [cause].
- Keep this receipt.
- Reproduce. Compare. Report.
- Findings you can re-run.

### Tonal Rules

1. Lead with what happened, then why. Status last.
2. Name the command, the revision and the exit code. Never just "tests failed".
3. Say "could not verify" and give the cause in the same sentence.
4. One finding, one changed line, one piece of evidence.
5. Short declarative sentences. No exclamation marks.
6. Write kicktires as one lowercase word. Never KickTires or Kick-Tires.
7. No speed claims. Never "in seconds", never "instant".
8. No reassurance. Never "looks good", "LGTM" or "safe to merge".
9. Optional checks that were not configured are scope, not gaps. Say which.
10. The name carries the metaphor. No laps, miles, garages, stop signs or racing language.

Boundaries:

- We are not an approver. We comment.
- We are not a proof. We are a record.
- We are not a platform. We are a reviewer.
- We are not fast. We are checked.
- We are not a security scanner.

| We Say                                            | We Never Say                     |
| ------------------------------------------------- | -------------------------------- |
| "Base passed, head failed: exit 1."               | "Tests are failing."             |
| "Could not verify: browser check failed on head." | "Verification unavailable."      |
| "Not an approval."                                | "Safe to merge."                 |
| "Investigates with your tools."                   | "AI-powered code review."        |
| "Findings with recorded evidence."                | "Catches bugs before they ship." |
| "Bring your own model."                           | "Powered by [model]."            |
| "Incomplete: [cause]."                            | "Failed." (about the review)     |

## Visual

### Colors

- **Toner #151515** — primary. Ink on paper, the mark on light backgrounds.
- **Thermal #F7F4EC** — the receipt paper; text and mark on dark.
- **Counter #1C1C1C** — dark page and card surfaces.
- **Highlighter #FF5A1F** — one element per surface: the dotted i, the failing cell, the
  finding location, the contact patch on the mark.
- **Muted #6F6F68** on paper, **#9A9A92** on dark — metadata, evidence IDs, footers.

Avoid gradients, any second accent, green or red for pass and fail outside GitHub's own
rendering, pure black and pure white.

### Typography

- **Wordmark:** VT323 Regular. The name and nothing else.
- **Display and headings:** Work Sans 700 and 600, tight tracking.
- **Body:** Work Sans 400. Any sentence longer than a label.
- **Mono:** Space Mono 400 for the receipt, commands and evidence. Space Mono 700,
  uppercase and tracked, for labels.

### Style

Keywords: receipt, thermal, monospace, one highlighter, flat, literal.

References: receipt printers, IBM Plex documentation, Teenage Engineering manuals, the
GitHub pull request comment itself.

Direction: the identity is a printed record, not a dashboard. If a surface would not
survive on thermal paper, it is decorated too much.

Mark: a tire under load. A thick ring flattened where it meets the ground, with the
contact patch in highlighter. Geometry and usage rules live in [DESIGN.md](DESIGN.md).
