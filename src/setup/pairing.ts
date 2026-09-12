import { z } from "zod";

const repository = z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/);
export const pairingSchema = z
  .strictObject({
    version: z.literal(1),
    hub: repository,
    source: repository,
    reviewer: z.string().regex(/^[a-z0-9-]+\[bot\]$/),
    release: z.string().regex(/^[a-f0-9]{40}$/),
    token: z
      .string()
      .regex(/^[a-zA-Z0-9_]+$/)
      .max(200),
    expires: z.iso.datetime({ offset: true }),
  })
  .refine(
    (value) => value.hub.split("/")[0].toLowerCase() === value.source.split("/")[0].toLowerCase(),
    "The hub and source must have the same owner.",
  );

export function decodePairing(text: string) {
  if (text.length > 8192 || !/^[a-zA-Z0-9_-]+$/.test(text))
    throw new Error("Invalid pairing code.");
  const pairing = pairingSchema.parse(JSON.parse(Buffer.from(text, "base64url").toString("utf8")));
  if (Date.parse(pairing.expires) <= Date.now())
    throw new Error("Pairing code expired. Run connect again on your laptop.");
  return pairing;
}

export function encodePairing(value: z.infer<typeof pairingSchema>) {
  return Buffer.from(JSON.stringify(pairingSchema.parse(value))).toString("base64url");
}
