import { z } from "zod";

const name = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const profileSchema = z
  .object({
    model: z
      .object({
        provider: z.enum(["xai", "openai", "anthropic", "chatgpt", "codex"]),
        id: z.string().min(1),
        codexHome: z.string().min(1).optional(),
        apiKeyEnv: z
          .string()
          .regex(/^[A-Z][A-Z0-9_]*$/)
          .optional(),
        contextWindow: z.number().int().min(8192).default(100000),
      })
      .strict()
      .refine(
        (model) =>
          model.provider === "codex"
            ? !!model.codexHome && !model.apiKeyEnv
            : model.codexHome === undefined,
        "codex requires codexHome and no apiKeyEnv; other providers cannot set codexHome",
      ),
    skills: z.array(z.string().min(1)).default([]),
    setup: z
      .object({
        commands: z.array(z.string().min(1)).default([]),
        network: z.enum(["deny-all", "allow-all"]).default("deny-all"),
      })
      .strict()
      .default({ commands: [], network: "deny-all" }),
    checks: z.array(z.string().min(1)).min(1),
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

export function modelCredentialEnv(model: Profile["model"]): string | undefined {
  if (model.provider === "chatgpt" || model.provider === "codex") return undefined;
  return (
    model.apiKeyEnv ??
    {
      xai: "XAI_API_KEY",
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
    }[model.provider]
  );
}
