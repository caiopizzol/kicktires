# GitHub reviews

kicktires supports private github.com repositories and same-repository PR branches.
It runs on a self-hosted runner and posts one `COMMENT` review with inline findings.
It never approves, requests changes, merges or modifies the branch.

## Add a new repository

First [install the worker](self-hosting.md). Each repository needs its own runner.

### 1. Register the runner

As the worker administrator:

```sh
useradd --create-home --shell /bin/bash kicktires-example
chmod 700 /home/kicktires-example
usermod -aG docker,kicktires kicktires-example
```

In GitHub, open **Settings → Actions → Runners → New self-hosted runner**. Follow
its download and checksum instructions for Linux. Run `config.sh` as the new account,
select the repository URL and add the `kicktires` label. Keep registration tokens
out of scripts and Git.

[Install the runner service](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application)
for that account and confirm it is **Idle**. Use it only for the trusted review workflow;
running repository code directly on this account bypasses the sandbox.

### 2. Install a profile

Copy [the example](../examples/profile.json) to `/etc/kicktires/your-project.json`,
owned by root with mode `644`. Set the model, setup commands and checks your project
actually provides. Test those commands in the sandbox without review-time networking.
Add needed runtimes to the image; do not assume production services are available.

See [configuration](configuration.md) for skills, browser checks and MCP. Run the
[worker preflight](self-hosting.md#add-a-repository) as the runner account.

### 3. Add the workflow

Set the repository Actions secret `OPENAI_API_KEY`. Copy
[the workflow](../examples/github-workflow.yml) to `.github/workflows/kicktires.yml`
and replace its profile path. For another provider, change both the secret and its
environment mapping. GitHub supplies the publication token; keep it out of the profile.

Keep `pull_request_target`, the private/same-repository guards, and cancellation disabled.
Never check out PR code or load its profile on the host. Match the installed runner
label and profile path. Existing required check names must remain until branch
protection is deliberately updated; see [upgrading](upgrading.md).

### 4. Validate

Merge the workflow through the normal process, then open a small draft PR. The
installation PR may not run the workflow because it comes from the trusted base branch.
Verify the runner and release, recorded investigation evidence, and one review on the exact
head. Rerun to confirm duplicate prevention. Close disposable fixtures without merging.

A queued job usually lacks an online matching runner. Preflight failures identify
installation problems; incomplete reports explain what blocked investigation. Keep the
review advisory until this path works.

## Choose advisory or merge-blocking reviews

The check reports whether the investigation finished, not whether tests passed.
Findings and failing assertions can accompany a completed review; blocked investigation
fails the check. Require independent CI checks for project-wide pass/fail gates.
To block merging after successful CI and reviewer trials, configure branch protection:

- Require PRs and the exact observed CI and reviewer job names (`kicktires` in the example).
  Bind checks to the observed GitHub Actions app where available.
- Require resolved review conversations. Solo maintainers can use zero required approvals.
- Apply rules to administrators if they must also be blocked. Preserve stronger rules,
  disable force pushes/deletion, and check for additional rulesets.

To disagree with a finding, reply with your reasoning and resolve its inline thread.
This does not turn a failed check green or prove correctness. Resolve the reported blocker or
correct trusted configuration. A published incomplete review remains incomplete on
same-base/head reruns; use a new revision after correction. Summary prose is not a
resolvable thread. Do not bypass failed checks with automatic approvals.

kicktires does not configure these rules. See [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule).

## Move a repository to another worker

Install and preflight the destination. Copy its trusted profile and skills, refresh
launcher snapshots, and register a uniquely named runner with the existing labels.
Install its service but leave it stopped.

With no queued/running reviews and the old runner idle, stop the old service. Wait
for GitHub to show it offline, then start the new one. Confirm only the new matching
runner is online. Validate a draft PR and duplicate rerun before uninstalling the old
service and registration. Retain private reports as needed.

For rollback, stop the new service before restarting the old one. Other repositories'
runner registrations need not change.

## Worker context

When a review depends on the host launcher, supply its source as a trusted skill:
`SKILL.md` plus `references/` containing the exact launcher, release, digest, capture
date and checks actually performed. Refresh it when the launcher changes. Recorded
operator evidence is not live host access or a reason to accept unsupported claims.

## Publication

The adapter fetches pinned commits into a temporary bare repository and reviews the
merge base against the head. No checkout, hooks or tests run on the host. Fetch
credentials are process-only; model execution receives selected model/MCP credentials,
not GitHub or Actions tokens.

Before publication, it revalidates reports and refetches the PR. Changed head, base,
repository or open state prevents publication. The final freshness check and API write
are separate, so a concurrent change can leave an explicitly old-commit review.

Actions-bot reviews are paginated and checked for the base/head marker before model
work and publication. Reruns preserve existing results; a changed revision gets a new
review. Only summaries, findings and gaps are published. Raw evidence stays private
on the runner. Model text is bounded and cannot forge markers or create mentions.
Cancellation and API errors fail without claiming publication; artifacts remain.
