import { z } from "zod";

const name = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const profileSchema = z
  .object({
    model: z
      .object({
        id: z.string().min(1),
        home: z.string().min(1),
        effort: z.string().min(1).optional(),
        contextWindow: z.number().int().min(8192).default(100000),
      })
      .strict(),
    instructions: z.string().trim().min(1).max(16000).optional(),
    skills: z.array(z.string().min(1)).default([]),
    setup: z
      .object({
        commands: z.array(z.string().min(1)).default([]),
        network: z.enum(["deny-all", "allow-all"]).default("deny-all"),
      })
      .strict()
      .default({ commands: [], network: "deny-all" }),
    checks: z.array(z.string().min(1)).default([]),
    browser: z
      .union([z.literal(false), z.object({ start: z.string().min(1) }).strict()])
      .default(false),
    connections: z
      .record(
        name,
        z
          .object({
            url: z.url(),
            description: z.string().min(1),
            tools: z.array(z.string().min(1)).min(1),
            tokenEnv: z
              .string()
              .regex(/^[A-Z][A-Z0-9_]*$/)
              .optional(),
          })
          .strict(),
      )
      .default({}),
    limits: z
      .object({
        commandSeconds: z.number().int().min(1).max(300).default(60),
        reviewSeconds: z.number().int().min(30).max(1800).default(600),
      })
      .strict()
      .default({ commandSeconds: 60, reviewSeconds: 600 }),
  })
  .strict();
export type Profile = z.infer<typeof profileSchema>;
