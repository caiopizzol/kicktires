# Product scope

kicktires is a self-hosted code reviewer with configurable models, skills and tools.
It reviews pinned Git revisions in a disposable sandbox, investigates changes, and
reports findings with recorded evidence and verification gaps.

The CLI and GitHub adapter share one review workflow. GitHub support currently covers
private repositories and same-repository PR branches.

kicktires owns inputs, trusted configuration, evidence validation and reporting.
Eve owns agent execution, tool dispatch, skill discovery and session lifecycle.
Portable skills remain independent of Eve and can be reused by other applications.

Report authentication support from tested behavior. API keys and subscription logins
are not interchangeable. Evidence references do not prove a finding is correct.

A general agent platform, Slack integration, dashboard, automatic fixes and automatic
approvals are outside the current scope.
