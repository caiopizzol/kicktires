import { z } from "zod";

export function verifyRunner(text: string, hub: string) {
  const registration = z
    .object({ gitHubUrl: z.string(), agentName: z.string().regex(/^[\w.-]+$/) })
    .parse(JSON.parse(text.trim()));
  if (
    registration.gitHubUrl.replace(/\/$/, "").toLowerCase() !==
    `https://github.com/${hub}`.toLowerCase()
  )
    throw new Error("The runner is registered to another repository.");
  return registration;
}

export function runnerService(text: string) {
  const name = text.trim();
  if (!/^actions\.runner\.[\w.-]+\.service$/.test(name))
    throw new Error("Invalid runner service name.");
  return name;
}
