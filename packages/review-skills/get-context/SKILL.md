---
name: get-context
description: Gather exact review inputs, product intent and relevant context without inventing missing information.
---

Read the supplied review manifest and full diff. Use their file inventory and pinned
revisions; do not guess repository paths or refresh the revisions mid-review.
Read product guidance when present, and relevant source, tests and caller contracts.
If product intent is absent, record that uncertainty without inventing it.
Use only explicitly supplied resource identifiers and connections for external
context. Distinguish acceptance criteria, observed behavior and proposed solutions.
Preserve source identifiers and tool evidence references in the report.
