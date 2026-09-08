import { prisma, j } from "../db";

export async function logActivity(args: {
  experimentId?: string | null;
  kind: "DISCOVERY" | "REJECTION" | "QUALIFICATION" | "SEND" | "REPLY" | "SIGNAL" | "TARGETING" | "CLUSTER" | "ERROR" | "SYSTEM";
  message: string;
  detail?: unknown;
  actor?: "SYSTEM" | "AI" | "HUMAN";
}): Promise<void> {
  await prisma.activityEvent.create({
    data: {
      experimentId: args.experimentId ?? null,
      kind: args.kind,
      message: args.message,
      detail: args.detail === undefined ? null : j(args.detail),
      actor: args.actor ?? "SYSTEM",
    },
  });
}
