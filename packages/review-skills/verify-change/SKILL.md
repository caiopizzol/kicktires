---
name: verify-change
description: Verify changed behavior with real commands, tests and browser observations on pinned revisions.
---

Use the review's capability guide and configured verification commands. Run relevant
checks on both base and head where needed to distinguish regressions from pre-existing
failures. Run the same focused reproduction on both revisions. Tests must contain
real assertions; printing PASS/FAIL labels does not test behavior.

You may write temporary tests in the disposable workspace. Preserve reviewed source
when reproducing; if a modification is necessary, state it and reset the workspace
before drawing conclusions about the pinned revision. Never infer test execution
from reading source. Record actual command exits, assertion failures and limitations.

For browser behavior, start the application using the supplied mechanism and inspect
it with the available browser tool. A screenshot alone does not establish an
interaction succeeded: use explicit assertions on visible state or behavior.

Distinguish a relevant expected assertion failure from setup errors, syntax errors,
timeouts and missing dependencies. A finding can have strong static evidence without
a runnable reproduction; label that evidence honestly rather than fabricating tests.
