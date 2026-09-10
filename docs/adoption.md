# Is Kick Tires a fit?

Kick Tires currently serves developers operating reviews for their own repositories.
Start with the [local CLI](../README.md), or install a [Linux worker](self-hosting.md)
and connect a [GitHub repository](github-actions.md).

| Capability                                               | Current support                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Local review of exact Git revisions                      | Available with Node, Bun and Docker                                              |
| Automatic GitHub reviews and inline findings             | Private repositories, same-repository PR branches, self-hosted runner            |
| Required tests, extra terminal investigation             | Available inside the sandbox                                                     |
| Browser assertions                                       | Optional Playwright checks on both revisions                                     |
| Portable skills and MCP tools                            | Trusted skill directories and allowlisted remote MCP tools                       |
| Model access                                             | Fireworks live-tested; other paths detailed in [configuration](configuration.md) |
| Existing Codex/Claude subscription reuse                 | Not interchangeable with the current execution path                              |
| Public/fork PRs and GitHub-hosted runner setup           | Not supported by the current adapter/setup                                       |
| Dashboard, arbitrary plugin marketplace, automatic fixes | Outside current scope                                                            |

Installation currently requires obtaining source, a Docker-capable machine, a trusted
profile and (for GitHub) a dedicated runner registration per repository. There is no
published package, hosted control plane or one-click cloud deployment.

If replacing Codex Reviewer, preserve the existing required GitHub check name until
branch protection is deliberately updated. Validate authentication and the complete
review path before retiring the prior worker. See [worker migration](github-actions.md#move-a-repository-to-another-worker)
and [naming compatibility](compatibility.md).

[Validation](validation.md) describes the tests and live trials behind these claims.
Self-hosting the worker does not keep model context local when using an external API.
