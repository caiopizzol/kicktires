# Shared workers

Use one private GitHub repository as a review hub for several personal repositories.
GitHub queues the jobs. Each VM runs one hub runner, so a second VM adds a second review
slot. No queue server or public endpoint is needed.

The hub supports public and private same-owner source repositories with same-repository
PRs. Fork PRs are unsupported. Keep the hub repository private; never register a
self-hosted runner on a public source repository. Keep project CI separate: the required `kicktires` status reports investigation completion, including
reviews that find bugs.

## Set up the hub

1. Create a private repository, such as `your-account/kicktires-worker`. Copy
   [the hub workflow](../examples/github-hub-workflow.yml) to `.github/workflows/review.yml`
   on its `main` branch.
2. Create a private GitHub App with **Contents: read**, **Pull requests: write**, and
   **Commit statuses: write**. Disable webhooks. Install it on the selected source
   repositories. No OAuth callback or server is needed.
3. Set the hub Actions variable `KICKTIRES_APP_ID` and secret `KICKTIRES_APP_PRIVATE_KEY`.
   The workflow creates a short-lived token for the source repository after a worker
   picks up the job. Keep model secrets in the hub; add their environment mappings to
   the Review step if needed. Codex login belongs to the worker account.
4. Create a fine-grained personal access token with access to **only the hub repository**
   and **Actions: read and write**. Record its expiry for rotation. Source repositories
   use this token to submit requests; they do not receive the App private key.

## Connect a VM

[Install kicktires](self-hosting.md), then register one repository runner against the
**hub repository** with the `kicktires` label. Use a dedicated Unix account and runner
service. Do not register a separate listener for each source repository on this VM.

Install each project's trusted profile and skills. Copy [hub.json](../examples/hub.json)
to `/etc/kicktires/hub.json`, owned by root and readable by the runner. Set the hub's full
repository name, the App's exact `[bot]` login, and the source-to-profile mapping.
Requests cannot choose a profile path.

Run `doctor` as the hub runner account for every profile. All workers in the pool need
the same release, profiles, skills, runtimes and model authentication. Each worker's
Codex login must be usable by its runner account.

## Connect a project

Set these Actions settings in each source repository:

| Setting                           | Value                           |
| --------------------------------- | ------------------------------- |
| Variable `KICKTIRES_HUB`          | `your-account/kicktires-worker` |
| Secret `KICKTIRES_DISPATCH_TOKEN` | The hub-only token              |

Copy [the submission workflow](../examples/github-submit-workflow.yml) to
`.github/workflows/kicktires.yml`. It submits the source PR and head SHA without checking
out code. **queue review** means the request was accepted, not that review finished.
Its job summary links to the hub run.

Only the hub App writes the `kicktires` status. Before the first review starts, the
required status is missing and blocks merging. During investigation it is pending;
completed investigations succeed, and blocked investigations fail. Findings appear on
the original PR. Duplicate completed reviews restore success without new inference.

## Migrate existing projects

Validate the hub on a draft PR before cutover. With the old runner idle and its queue
empty, replace the source workflow and stop its old service. Require the **`kicktires`
status from your App**, preserving independent CI gates and conversation resolution.
Do not require **queue review** as a substitute. The previous Actions-app binding does
not automatically migrate to the new App.

Remove old project registrations after live review and duplicate-rerun validation.
Keep rollback profiles and service definitions until the migration is verified. Starting
the old listeners alongside the hub reintroduces hidden capacity contention.

## Retries and interruptions

The hub serializes requests for each repository and PR. GitHub can queue jobs for up to
24 hours. A lost worker or queue expiry can leave the required status missing or pending;
it never becomes successful merely because dispatch worked. Inspect the hub run and
rerun it after repairing the worker. Incomplete published reviews remain incomplete for
the same base/head pair; follow [the recovery guidance](github-actions.md#choose-advisory-or-merge-blocking-reviews).

The shared VM lock remains a safety check. It is not the queue. Adding workers increases
execution capacity, not the model account's usage allowance.
