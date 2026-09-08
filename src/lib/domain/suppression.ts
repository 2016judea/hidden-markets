import { prisma } from "../db";
import { normalizeDomain } from "./dedupe";

/**
 * The last gate before any send. Checked immediately before the API call, not
 * at draft time — a bounce or an unsubscribe can land in the hours between a
 * draft being approved and the worker picking it up, and that window is exactly
 * when contacting someone again is most damaging.
 */
export async function isSuppressed(email: string): Promise<{ suppressed: boolean; reason?: string }> {
  const address = email.toLowerCase().trim();
  const domain = normalizeDomain(address);
  const hit = await prisma.suppression.findFirst({
    where: {
      OR: [
        { kind: "EMAIL", value: address },
        ...(domain ? [{ kind: "DOMAIN", value: domain }] : []),
      ],
    },
  });
  return hit ? { suppressed: true, reason: `${hit.kind} ${hit.reason}` } : { suppressed: false };
}

export async function suppress(args: {
  kind: "EMAIL" | "DOMAIN";
  value: string;
  reason: "BOUNCE" | "UNSUBSCRIBE" | "MANUAL" | "COMPLAINT";
  note?: string;
}): Promise<void> {
  const value = args.value.toLowerCase().trim();
  await prisma.suppression.upsert({
    where: { kind_value: { kind: args.kind, value } },
    create: { kind: args.kind, value, reason: args.reason, note: args.note },
    update: { reason: args.reason, note: args.note },
  });
}
