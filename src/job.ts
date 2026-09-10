import { readFileSync } from "node:fs";
import { z } from "zod";
import { profileSchema } from "./profile.ts";

export const jobSchema = z.object({
  id: z.string(),
  directory: z.string(),
  profile: profileSchema,
  repository: z.object({
    base: z.string().regex(/^[a-f0-9]{40}$/),
    head: z.string().regex(/^[a-f0-9]{40}$/),
    files: z.record(z.string(), z.array(z.string())),
    changedFiles: z.array(z.string()),
  }),
  skills: z.record(
    z.string(),
    z.object({
      description: z.string(),
      markdown: z.string(),
      files: z.record(z.string(), z.string()),
    }),
  ),
});
export type ReviewJob = z.infer<typeof jobSchema>;
export function readJob(): ReviewJob {
  const path = process.env.KICKTIRES_JOB;
  if (!path) throw new Error("Start reviews with the kicktires CLI; KICKTIRES_JOB is missing");
  return jobSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
