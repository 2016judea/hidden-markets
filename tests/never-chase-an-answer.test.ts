import { beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/db";
import { MockLLMProvider, setLLM } from "@/lib/llm";
import { MockEmailProvider, setEmailProvider } from "@/lib/email";
import { drain, enqueue, registerHandlers } from "@/lib/jobs";
import { sendApprovedOutbox, scheduleFollowups } from "@/lib/jobs/handlers/outbound";
import { processInbound } from "@/lib/jobs/handlers/inbound";
import { markNotInterested, pauseExperiment } from "@/lib/actions";

const MAILBOX = path.join(process.cwd(), ".mailbox");
const INBOX = path.join(MAILBOX, "inbox");
const SENT = path.join(MAILBOX, "sent");

const sentCount = () => (fs.existsSync(SENT) ? fs.readdirSync(SENT).length : 0);

/**
 * The reply is the product. Every test here is a way the pipeline was still
 * able to chase, re-send to, or lose track of someone who had already answered
 * — each one found by reading the code, then reproduced before it was fixed.
 */
const llm = new MockLLMProvider()
  .on("emit_classification", () => ({
    classifications: ["POSITIVE"],
    interpretation: "A short, polite reply that says they are interested in talking.",
    referral: null,
    isHumanWritten: true,
    wantsNoFurtherContact: false,
    suggestedProspectStatus: "ENGAGED",
    confidence: 0.9,
  }))
  .on("emit_signals", () => ({ signals: [], transactionOpportunities: [], nothingToExtract: true }))
  .on("emit_reply", () => ({
    subject: "Re: pumps",
    body: "Thanks for writing back. What does the failure look like on your end?\n\nAidan",
    rationale: "Asks one question and promises nothing.",
    informationSought: ["failure mode"],
    containsCommitment: false,
    shouldEscalate: false,
    escalationReason: null,
    confidence: 0.8,
  }));

async function wipe(): Promise<void> {
  for (const del of [
    prisma.painClusterMember.deleteMany(),
    prisma.painCluster.deleteMany(),
    prisma.transactionOpportunity.deleteMany(),
    prisma.painSignal.deleteMany(),
    prisma.replyReview.deleteMany(),
    prisma.outboxDraft.deleteMany(),
    prisma.emailMessage.deleteMany(),
    prisma.emailThread.deleteMany(),
    prisma.prospectReferral.deleteMany(),
    prisma.prospect.deleteMany(),
    prisma.evidenceItem.deleteMany(),
    prisma.prospectCandidate.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.aITaskRun.deleteMany(),
    prisma.jobRun.deleteMany(),
    prisma.activityEvent.deleteMany(),
    prisma.targetingStat.deleteMany(),
    prisma.marketMemo.deleteMany(),
    prisma.suppression.deleteMany(),
    prisma.humanCorrection.deleteMany(),
    prisma.graphEdge.deleteMany(),
    prisma.graphNode.deleteMany(),
    prisma.marketExperiment.deleteMany(),
  ]) await del;
}

let experimentId: string;

/** A prospect we already wrote to, with the outbound message on its thread. */
async function contactedProspect(args: { email: string; status: string; repliedAt?: Date | null }) {
  const prospect = await prisma.prospect.create({
    data: {
      experimentId,
      organizationName: `Org for ${args.email}`,
      contactName: "Someone",
      email: args.email,
      status: args.status,
      firstContactedAt: new Date("2026-10-01T12:00:00Z"),
      lastContactedAt: new Date("2026-10-01T12:00:00Z"),
      repliedAt: args.repliedAt ?? null,
      featureSnapshot: JSON.stringify({ TITLE: "UNKNOWN" }),
    },
  });
  const thread = await prisma.emailThread.create({
    data: { experimentId, prospectId: prospect.id, subject: "pumps", status: "AWAITING_REPLY" },
  });
  const outbound = await prisma.emailMessage.create({
    data: {
      threadId: thread.id,
      direction: "OUTBOUND",
      fromAddress: "aidan@brickandmortar.dev",
      toAddress: args.email,
      subject: "pumps",
      bodyText: "…",
      rfcMessageId: `<to-${prospect.id}@brickandmortar.dev>`,
      sentAt: new Date("2026-10-01T12:00:00Z"),
    },
  });
  return { prospect, thread, outbound };
}

async function inboundFrom(args: {
  from: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  file: string;
}) {
  fs.writeFileSync(
    path.join(INBOX, args.file),
    JSON.stringify({
      providerMessageId: args.file,
      rfcMessageId: `<${args.file}@theirs.example>`,
      inReplyTo: args.inReplyTo,
      from: args.from,
      to: "aidan@brickandmortar.dev",
      subject: args.subject,
      bodyText: args.body,
      receivedAt: new Date().toISOString(),
    }),
  );
  await enqueue({ kind: "SYNC_INBOX", idempotencyKey: `sync-${args.file}` });
  await drain(1, "test", 1);
}

describe("nobody who answered is chased, re-sent to, or lost", () => {
  beforeAll(async () => {
    setLLM(llm);
    registerHandlers();
    await wipe();
    fs.rmSync(MAILBOX, { recursive: true, force: true });
    fs.mkdirSync(INBOX, { recursive: true });
    setEmailProvider(new MockEmailProvider());

    const exp = await prisma.marketExperiment.create({
      data: {
        slug: "test-never-chase",
        name: "Never chase an answer",
        hypothesis: "h",
        buyerPersona: "b",
        likelyProblem: "p",
        offer: "o",
        status: "ACTIVE",
      },
    });
    experimentId = exp.id;
  });

  it("cancels an approved follow-up to someone who has already replied, instead of sending it and calling it FAILED", async () => {
    // A follow-up that failed on a network blip is re-approvable from FAILED.
    // By the time the operator re-approves it the person has written back. The
    // send gate only checked terminal statuses, so the email went out — and the
    // prospect transition ENGAGED -> FOLLOWED_UP then threw, which marked the
    // draft FAILED over an email that had already left. FAILED -> APPROVED is
    // legal, so the same person could get it a third time.
    const { prospect } = await contactedProspect({ email: "engaged@example.gov", status: "ENGAGED", repliedAt: new Date() });
    const draft = await prisma.outboxDraft.create({
      data: {
        experimentId,
        prospectId: prospect.id,
        kind: "FOLLOWUP",
        sequenceIndex: 1,
        subject: "pumps",
        body: "Following up.",
        status: "APPROVED",
        approvedAt: new Date(),
        approvedBy: "Aidan Jude",
      },
    });
    const before = sentCount();

    await sendApprovedOutbox();

    const after = await prisma.outboxDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(after.status).toBe("CANCELLED");
    expect(sentCount()).toBe(before);
    expect(await prisma.emailMessage.count({ where: { toAddress: prospect.email, direction: "OUTBOUND" } })).toBe(1);
    const unchanged = await prisma.prospect.findUniqueOrThrow({ where: { id: prospect.id } });
    expect(unchanged.status).toBe("ENGAGED");
  });

  it("does not re-arm the follow-up sequence when an engaged prospect's out-of-office fires", async () => {
    // Their vacation responder answers OUR reply. The auto-reply branch cancelled
    // follow-ups and then scheduled two fresh ones — a cold chase, days later,
    // to someone mid-conversation.
    const { prospect, thread, outbound } = await contactedProspect({
      email: "ooo@example.gov",
      status: "ENGAGED",
      repliedAt: new Date(),
    });
    const ooo = await prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        direction: "INBOUND",
        fromAddress: prospect.email,
        toAddress: "aidan@brickandmortar.dev",
        subject: "Out of Office: pumps",
        bodyText: "I am away until further notice.",
        inReplyTo: outbound.rfcMessageId,
        receivedAt: new Date(),
        isAutoReply: true,
      },
    });

    await processInbound({ emailMessageId: ooo.id, bouncedAddress: null });

    expect(
      await prisma.jobRun.count({
        where: { kind: "DRAFT_OUTREACH", status: "PENDING", idempotencyKey: { contains: prospect.id } },
      }),
    ).toBe(0);
  });

  it("leaves a do-not-contact prospect terminal when they write again", async () => {
    // The classifier suggested ENGAGED; that transition is illegal from a
    // terminal state, and the fallback wrote REPLIED unconditionally — which
    // is also illegal, and which made canContact() true again.
    const { prospect, thread, outbound } = await contactedProspect({
      email: "dnc@example.gov",
      status: "DO_NOT_CONTACT",
    });
    const reply = await prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        direction: "INBOUND",
        fromAddress: prospect.email,
        toAddress: "aidan@brickandmortar.dev",
        subject: "Re: pumps",
        bodyText: "Actually, tell me more.",
        inReplyTo: outbound.rfcMessageId,
        receivedAt: new Date(),
      },
    });

    await processInbound({ emailMessageId: reply.id, bouncedAddress: null });

    const after = await prisma.prospect.findUniqueOrThrow({ where: { id: prospect.id } });
    expect(after.status).toBe("DO_NOT_CONTACT");
    // The reply itself is still captured for the operator to read…
    const review = await prisma.replyReview.findFirstOrThrow({ where: { inboundMessageId: reply.id } });
    // …and "not interested" on it must not throw on the illegal
    // DO_NOT_CONTACT -> NOT_INTERESTED transition, which left the review stuck.
    await markNotInterested(review.id);
    expect((await prisma.replyReview.findUniqueOrThrow({ where: { id: review.id } })).status).toBe("DISMISSED");
    expect((await prisma.prospect.findUniqueOrThrow({ where: { id: prospect.id } })).status).toBe("DO_NOT_CONTACT");
  });

  it("threads a reply from an address we stored with capitals", async () => {
    // Six of 64 prospects in the live database carry a mixed-case address
    // (Brian.Antonian@Dunedin.gov). Zoho lowercases the sender; the last-resort
    // matcher compared the two with a case-sensitive equals, so a reply whose
    // client dropped In-Reply-To was logged as "matched no experiment thread"
    // and ignored.
    const { prospect, thread } = await contactedProspect({
      email: "Brian.Antonian@Dunedin.example",
      status: "CONTACTED",
    });

    await inboundFrom({
      file: "mixed-case-reply.json",
      from: "brian.antonian@dunedin.example",
      subject: "RE: pumps",
      body: "Happy to talk.",
    });

    const stored = await prisma.emailMessage.findFirst({
      where: { direction: "INBOUND", fromAddress: "brian.antonian@dunedin.example" },
    });
    expect(stored?.threadId).toBe(thread.id);
    expect(await prisma.emailThread.findUniqueOrThrow({ where: { id: thread.id } })).toMatchObject({
      prospectId: prospect.id,
      status: "OPEN",
    });
  });

  it("routes a bounce naming a mixed-case address in lower case", async () => {
    const { prospect } = await contactedProspect({ email: "KLee@Beaumont.example", status: "CONTACTED" });

    await inboundFrom({
      file: "mixed-case-bounce.json",
      from: "mailer-daemon@mail.zoho.com",
      subject: "Undelivered Mail Returned to Sender",
      body: `A message that you sent could not be delivered.\nFinal-Recipient: rfc822; klee@beaumont.example\nAction: failed`,
    });
    await drain(10, "test", 1);

    const after = await prisma.prospect.findUniqueOrThrow({ where: { id: prospect.id } });
    expect(after.status).toBe("BOUNCED");
  });

  it("keeps scheduled follow-ups through a pause, and holds them while paused", async () => {
    // Pause deleted every PENDING job for the experiment, follow-ups included.
    // Nothing re-creates them on resume — they are only ever scheduled at the
    // first send — so an hour's pause silently dropped every day-4 and day-10
    // email for everyone contacted so far.
    const { prospect } = await contactedProspect({ email: "paused@example.gov", status: "CONTACTED" });
    await scheduleFollowups(prospect.id, experimentId, new Date());
    const keys = { idempotencyKey: { contains: prospect.id } };
    expect(await prisma.jobRun.count({ where: { kind: "DRAFT_OUTREACH", status: "PENDING", ...keys } })).toBe(2);

    await pauseExperiment(experimentId);
    expect(await prisma.jobRun.count({ where: { kind: "DRAFT_OUTREACH", status: "PENDING", ...keys } })).toBe(2);

    // Due now, but the experiment is paused: the job waits rather than drafting
    // or dying, and nothing lands in the outbox.
    await prisma.jobRun.updateMany({ where: { kind: "DRAFT_OUTREACH", ...keys }, data: { runAfter: new Date(0) } });
    await drain(10, "test", 1);
    const held = await prisma.jobRun.findMany({ where: { kind: "DRAFT_OUTREACH", ...keys } });
    expect(held.map((j) => j.status)).toEqual(["PENDING", "PENDING"]);
    expect(held.every((j) => j.runAfter > new Date())).toBe(true);
    expect(await prisma.outboxDraft.count({ where: { prospectId: prospect.id } })).toBe(0);

    await prisma.marketExperiment.update({ where: { id: experimentId }, data: { status: "ACTIVE" } });
  });
});
