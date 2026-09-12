import { z } from "zod";
import { api, optionalApi } from "./github.ts";

const contentSchema = z.object({
  sha: z.string(),
  content: z.string(),
  encoding: z.literal("base64"),
});
export async function existingWorkflow(
  repository: string,
  branch: string,
  path: string,
  text: string,
) {
  const raw = await optionalApi(
    `/repos/${repository}/contents/${path}?ref=${encodeURIComponent(branch)}`,
  );
  if (!raw) return false;
  const content = contentSchema.parse(raw);
  if (Buffer.from(content.content, "base64").toString("utf8") !== text)
    throw new Error(
      `${repository}/${path} already exists with different content. Review it before continuing.`,
    );
  return true;
}

export async function addWorkflow(repository: string, branch: string, path: string, text: string) {
  if (await existingWorkflow(repository, branch, path, text)) return;
  await api(
    `/repos/${repository}/contents/${path}`,
    {
      message: "ci: enable Kicktires reviews",
      branch,
      content: Buffer.from(text).toString("base64"),
    },
    "PUT",
  );
}

export async function workflowPullRequest(repository: string, base: string, workflow: string) {
  const path = ".github/workflows/kicktires.yml";
  if (await existingWorkflow(repository, base, path, workflow)) return null;
  const branch = "kicktires/setup";
  if (!(await optionalApi(`/repos/${repository}/git/ref/heads/${branch}`))) {
    const ref = z
      .object({ object: z.object({ sha: z.string() }) })
      .parse(await api(`/repos/${repository}/git/ref/heads/${encodeURIComponent(base)}`));
    await api(`/repos/${repository}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha: ref.object.sha,
    });
  }
  await addWorkflow(repository, branch, path, workflow);
  const pulls = z
    .array(z.object({ html_url: z.url() }))
    .parse(
      await api(
        `/repos/${repository}/pulls?head=${repository.split("/")[0]}:${encodeURIComponent(branch)}&base=${encodeURIComponent(base)}&state=open`,
      ),
    );
  if (pulls[0]) return pulls[0].html_url;
  const pr = z.object({ html_url: z.url() }).parse(
    await api(`/repos/${repository}/pulls`, {
      title: "ci(review): enable Kicktires",
      head: branch,
      base,
      body: "Queue same-repository pull requests on the private Kicktires worker. Merge after the worker is connected, then open a pull request to verify the review check.",
    }),
  );
  return pr.html_url;
}
