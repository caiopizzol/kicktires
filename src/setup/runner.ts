import { z } from "zod";

export function verifyRunner(text: string, hub: string) {
  const registration = z.object({ gitHubUrl: z.string() }).parse(JSON.parse(text.trim()));
  if (
    registration.gitHubUrl.replace(/\/$/, "").toLowerCase() !==
    `https://github.com/${hub}`.toLowerCase()
  )
    throw new Error("The runner is registered to another repository.");
}
