import { z } from "zod";

export const appSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  pem: z.string().startsWith("-----BEGIN RSA PRIVATE KEY-----"),
  owner: z.object({ login: z.string() }),
  permissions: z.record(z.string(), z.string()),
});
export type App = z.infer<typeof appSchema>;

export const reviewPermissions = {
  contents: "read",
  pull_requests: "write",
  statuses: "write",
};

export function validateApp(app: App, owner: string) {
  if (app.owner.login.toLowerCase() !== owner.toLowerCase())
    throw new Error("The App belongs to a different GitHub owner.");
  for (const [name, access] of Object.entries(reviewPermissions))
    if (app.permissions[name] !== access) throw new Error(`The App needs ${name}: ${access}.`);
  for (const name of Object.keys(app.permissions))
    if (!(name in reviewPermissions) && name !== "metadata")
      throw new Error("The App has additional permissions. Use a dedicated review App.");
}
