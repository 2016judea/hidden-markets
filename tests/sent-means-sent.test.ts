import { beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/**
 * The bookkeeping after a send can fail for reasons that have nothing to do
 * with the email — a locked SQLite file, a stat row in a bad state. This flag
 * makes one of those steps throw on demand.
 */
const bookkeeping = { fail: false };
vi.mock("@/lib/domain/targeting", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/domain/targeting")>();
  return {
    ...real,
    recordOutcomeForProspect: async (...args: Parameters<typeof real.recordOutcomeForProspect>) => {
      if (bookkeeping.fail) throw new Error("SQLITE_BUSY: database is locked");
      return real.recordOutcomeForProspect(...args);
    },
  };
});

import { prisma } from "@/lib/db";
import { MockEmailProvider, setEmailProvider } from "@/lib/email";
import { registerHandlers } from "@/lib/jobs";
import { sendApprovedOutbox } from "@/lib/jobs/handlers/outbound";

const SENT = path.join(process.cwd(), ".mailbox", "sent");
const sentCount = () => (fs.existsSync(SENT) ? fs.readdirSync(SENT).length : 0);

describe("an email that left is recorded as sent", () => {
  let experimentId: string;

  beforeAll(async () => {
    registerHandlers();
    setEmailProvider(new MockEmailProvider());
    await prisma.outboxDraft.deleteMany();
    await prisma.emailMessage.deleteMany();
    await prisma.emailThread.deleteMany();
    await prisma.prospect.deleteMany();
    await prisma.targetingStat.deleteMany();
    await prisma.activityEvent.deleteMany();
    await prisma.marketExperiment.deleteMany();
    const exp = await prisma.marketExperiment.create({
      data: { slug: "test-sent", name: "Sent means sent", hypothesis: "h", buyerPersona: "b", likelyProblem: "p", offer: "o", status: "ACTIVE" },
    });
    experimentId = exp.id;
  });

  it("marks the draft SENT even when the bookkeeping after the send throws", async () => {
    // Before: the whole post-send block shared one catch with the send itself,
    // so a failure writing the targeting stat marked the draft FAILED. FAILED
    // is re-approvable, and re-approving it sends the same email again.
    const prospect = await prisma.prospect.create({
      data: {
        experimentId,
        organizationName: "Locked DB Utility",
        email: "first@locked.example",
        status: "READY",
        featureSnapshot: JSON.stringify({ TITLE: "UNKNOWN" }),
      },
    });
    const draft = await prisma.outboxDraft.create({
      data: {
        experimentId,
        prospectId: prospect.id,
        kind: "INITIAL",
        subject: "pumps",
        body: "A first email.",
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: "Aidan Jude",
      },
    });
    const before = sentCount();

    bookkeeping.fail = true;
    try {
      await sendApprovedOutbox();
    } finally {
      bookkeeping.fail = false;
    }

    expect(sentCount()).toBe(before + 1);
    const after = await prisma.outboxDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(after.status).toBe("SENT");
    expect(after.sentAt).not.toBeNull();
    expect(after.emailMessageId).not.toBeNull();
    // The failure is not hidden — it is on the row and in the feed.
    expect(after.sendError).toContain("database is locked");
    expect(await prisma.activityEvent.count({ where: { kind: "ERROR", message: { contains: "database is locked" } } })).toBe(1);

    // And a second pass does not send it again.
    await sendApprovedOutbox();
    expect(sentCount()).toBe(before + 1);
  });
});
