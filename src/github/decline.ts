import { z } from "zod";
import type { Api } from "./review.ts";

const commentSchema = z.object({
  id: z.number(),
  in_reply_to_id: z.number().optional(),
  pull_request_review_id: z.number().nullable(),
  user: z.object({ login: z.string(), type: z.string() }).nullable(),
  body: z.string(),
});
const command = /^\/kicktires decline\s+\S/;

// A finding is declined only by a human with write access replying in its own thread.
export async function declinedBy(
  api: Api,
  repository: string,
  pr: number,
  review: number,
  findings: number,
) {
  const comments = [];
  for (let page = 1; ; page++) {
    const batch = z
      .array(commentSchema)
      .parse(await api(`/repos/${repository}/pulls/${pr}/comments?per_page=100&page=${page}`));
    comments.push(...batch);
    if (batch.length < 100) break;
  }
  const threads = comments.filter((c) => c.pull_request_review_id === review && !c.in_reply_to_id);
  if (findings === 0 || threads.length !== findings) return null;
  const writers = new Map<string, boolean>();
  const canWrite = async (login: string) => {
    if (!writers.has(login)) {
      const { permission } = z
        .object({ permission: z.string() })
        .parse(await api(`/repos/${repository}/collaborators/${login}/permission`));
      writers.set(login, permission === "admin" || permission === "write");
    }
    return writers.get(login)!;
  };
  const people = new Set<string>();
  for (const thread of threads) {
    let decliner: string | undefined;
    for (const reply of comments.filter((c) => c.in_reply_to_id === thread.id)) {
      if (reply.user?.type !== "User" || !command.test(reply.body.trim())) continue;
      if (await canWrite(reply.user.login)) decliner = reply.user.login;
    }
    if (!decliner) return null;
    people.add(decliner);
  }
  return [...people];
}
