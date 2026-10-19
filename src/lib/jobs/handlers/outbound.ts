import { prisma, j } from "../../db";
import { getEmailProvider } from "../../email";
import {
  assertOutboxTransition,
  canContact,
  hasAnswered,
  isLegalProspectTransition,
} from "../../domain/stateMachine";
import { isSuppressed } from "../../domain/suppression";
import { logActivity } from "../../domain/activity";
import { recordOutcomeForProspect } from "../../domain/targeting";
import { FOLLOWUP_SCHEDULE_DAYS, type TrustLevel } from "../../domain/constants";
import { enqueue } from "../queue";
import type { ProspectStatus } from "../../domain/constants";

/**
 * Trust policy. This is the ONLY code that may set approvedBy without a human,
 * and it is deliberately conservative: a referral intro is never auto-approved
 * because it puts a third party's name in front of a stranger, and no initial
 * email is auto-approved below Level 3 with a verified address.
 */
export function mayAutoApprove(
  trustLevel: TrustLevel,
  draft: { kind: string; riskLevel: string },
): boolean {
  if (draft.riskLevel === "HIGH") return false;
  if (draft.kind === "REFERRAL_INTRO") return false;
  if (trustLevel === "TRUSTED_FOLLOWUPS") return draft.kind === "FOLLOWUP";
  if (trustLevel === "HIGH_AUTOMATION") {
    return draft.kind === "FOLLOWUP" || (draft.kind === "INITIAL" && draft.riskLevel === "LOW");
  }
  return false;
}

async function applyTrustPolicy(): Promise<number> {
  const pending = await prisma.outboxDraft.findMany({
    where: { status: "PENDING_REVIEW" },
    include: { experiment: { select: { trustLevel: true } } },
    take: 100,
  });
  let approved = 0;
  for (const d of pending) {
    if (!mayAutoApprove(d.experiment.trustLevel as TrustLevel, d)) continue;
    assertOutboxTransition("PENDING_REVIEW", "APPROVED");
    await prisma.outboxDraft.update({
      where: { id: d.id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedBy: `AUTO:${d.experiment.trustLevel}` },
    });
    approved++;
  }
  return approved;
}

export async function sendApprovedOutbox(): Promise<unknown> {
  const autoApproved = await applyTrustPolicy();
  const provider = getEmailProvider();

  const due = await prisma.outboxDraft.findMany({
    where: {
      status: "APPROVED",
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }],
    },
    include: { prospect: true },
    orderBy: { approvedAt: "asc" },
    take: 25,
  });

  let sent = 0;
  let blocked = 0;

  for (const draft of due) {
    // Final gates, re-checked here rather than trusted from draft time. A
    // bounce or an unsubscribe can arrive in the gap between approval and send,
    // and that gap is exactly when contacting someone again does most harm.
    if (!canContact(draft.prospect.status)) {
      await cancelDraft(draft.id, `prospect is ${draft.prospect.status}`);
      blocked++;
      continue;
    }
    // A follow-up is a chase. If they have answered since this one was drafted
    // or approved — a FAILED follow-up re-approved after the reply landed is
    // the common way — sending it tells them we did not read their reply.
    if (draft.kind === "FOLLOWUP" && hasAnswered(draft.prospect)) {
      await cancelDraft(draft.id, "they already replied");
      blocked++;
      continue;
    }
    const supp = await isSuppressed(draft.prospect.email);
    if (supp.suppressed) {
      await cancelDraft(draft.id, `address suppressed (${supp.reason})`);
      blocked++;
      continue;
    }

    assertOutboxTransition("APPROVED", "SENDING");
    await prisma.outboxDraft.update({ where: { id: draft.id }, data: { status: "SENDING" } });

    let result: Awaited<ReturnType<typeof provider.sendEmail>>;
    try {
      result = await provider.sendEmail({
        to: draft.prospect.email,
        subject: draft.subject,
        bodyText: draft.body,
      });
    } catch (err) {
      assertOutboxTransition("SENDING", "FAILED");
      await prisma.outboxDraft.update({
        where: { id: draft.id },
        data: { status: "FAILED", sendError: String((err as Error).message).slice(0, 1000) },
      });
      await logActivity({
        experimentId: draft.experimentId,
        kind: "ERROR",
        message: `Send failed to ${draft.prospect.email}: ${String((err as Error).message).slice(0, 200)}`,
      });
      continue;
    }

    // From here the email has left the building. Whatever fails below, this row
    // must end up SENT: the send and its bookkeeping used to share one catch, so
    // a failure writing a stat row marked the draft FAILED over an email that
    // had already been delivered — and FAILED is re-approvable, which is how one
    // person gets the same cold email twice.
    try {
      const thread =
        (draft.threadId ? await prisma.emailThread.findUnique({ where: { id: draft.threadId } }) : null) ??
        (await prisma.emailThread.create({
          data: {
            experimentId: draft.experimentId,
            prospectId: draft.prospectId,
            providerThreadId: result.providerThreadId,
            subject: draft.subject,
            status: "AWAITING_REPLY",
            lastMessageAt: result.sentAt,
          },
        }));

      const message = await prisma.emailMessage.create({
        data: {
          threadId: thread.id,
          direction: "OUTBOUND",
          fromAddress: provider.fromAddress,
          toAddress: draft.prospect.email,
          subject: draft.subject,
          bodyText: draft.body,
          providerMessageId: result.providerMessageId,
          rfcMessageId: result.rfcMessageId,
          providerFolderId: result.providerFolderId,
          sentAt: result.sentAt,
        },
      });

      assertOutboxTransition("SENDING", "SENT");
      await prisma.outboxDraft.update({
        where: { id: draft.id },
        data: { status: "SENT", sentAt: result.sentAt, emailMessageId: message.id, threadId: thread.id },
      });
      await prisma.emailThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: result.sentAt, status: "AWAITING_REPLY" },
      });

      // The status only moves where the machine allows it. A reply intro to
      // someone already ENGAGED is a legitimate send that must not drag their
      // status backwards to CONTACTED.
      const nextStatus: ProspectStatus = draft.kind === "FOLLOWUP" ? "FOLLOWED_UP" : "CONTACTED";
      const moves = isLegalProspectTransition(draft.prospect.status, nextStatus);
      await prisma.prospect.update({
        where: { id: draft.prospectId },
        data: {
          ...(moves ? { status: nextStatus } : {}),
          lastContactedAt: result.sentAt,
          firstContactedAt: draft.prospect.firstContactedAt ?? result.sentAt,
        },
      });

      // The denominator for every rate in the system. Counted once, on the
      // first send, so follow-ups never inflate it.
      if (!draft.prospect.firstContactedAt) {
        await recordOutcomeForProspect(draft.prospect, "contacted");
        await scheduleFollowups(draft.prospectId, draft.experimentId, result.sentAt);
      }

      await logActivity({
        experimentId: draft.experimentId,
        kind: "SEND",
        actor: draft.approvedBy?.startsWith("AUTO:") ? "SYSTEM" : "HUMAN",
        message: `Sent ${draft.kind.toLowerCase().replace("_", " ")} to ${draft.prospect.contactName ?? draft.prospect.email} at ${draft.prospect.organizationName}.`,
      });
      sent++;
    } catch (err) {
      const message = String((err as Error).message ?? err);
      // Still SENT. The status is only written on a row that is still SENDING,
      // so one the happy path already finished keeps its message link; the
      // failure goes on the row either way.
      await prisma.outboxDraft.update({
        where: { id: draft.id },
        data: { sendError: `sent, but bookkeeping failed: ${message}`.slice(0, 1000) },
      });
      await prisma.outboxDraft.updateMany({
        where: { id: draft.id, status: "SENDING" },
        data: { status: "SENT", sentAt: result.sentAt },
      });
      await logActivity({
        experimentId: draft.experimentId,
        kind: "ERROR",
        message: `Sent to ${draft.prospect.email}, but recording it failed: ${message.slice(0, 200)}`,
      });
      sent++;
    }
  }

  return { autoApproved, sent, blocked };
}

async function cancelDraft(draftId: string, reason: string): Promise<void> {
  const draft = await prisma.outboxDraft.findUniqueOrThrow({ where: { id: draftId } });
  assertOutboxTransition(draft.status as "PENDING_REVIEW" | "APPROVED", "CANCELLED");
  await prisma.outboxDraft.update({
    where: { id: draftId },
    data: { status: "CANCELLED", sendError: reason },
  });
}

/** Day 4 and day 10, drafted at the time they are due so the follow-up can
 *  reflect anything learned in between. */
export async function scheduleFollowups(
  prospectId: string,
  experimentId: string,
  sentAt: Date,
): Promise<void> {
  for (const [i, days] of FOLLOWUP_SCHEDULE_DAYS.entries()) {
    await enqueue({
      kind: "DRAFT_OUTREACH",
      payload: { prospectId, kind: "FOLLOWUP", sequenceIndex: i + 1 },
      experimentId,
      runAfter: new Date(sentAt.getTime() + days * 86_400_000),
      idempotencyKey: `draft:${prospectId}:${i + 1}`,
    });
  }
}

/**
 * Called the moment a reply, bounce or unsubscribe lands. Kills both the
 * queued job that would write the follow-up and any follow-up already sitting
 * in the outbox — missing either one is how a person who already answered gets
 * chased anyway.
 */
export async function cancelFollowups(prospectId: string, reason: string): Promise<void> {
  await prisma.jobRun.deleteMany({
    where: {
      status: "PENDING",
      kind: "DRAFT_OUTREACH",
      idempotencyKey: { in: FOLLOWUP_SCHEDULE_DAYS.map((_, i) => `draft:${prospectId}:${i + 1}`) },
    },
  });
  // FAILED is included: a follow-up that failed on a network blip is one
  // re-approval away from going out, and that re-approval can come after the
  // reply it would be chasing.
  const pending = await prisma.outboxDraft.findMany({
    where: { prospectId, kind: "FOLLOWUP", status: { in: ["PENDING_REVIEW", "APPROVED", "FAILED"] } },
  });
  for (const d of pending) {
    await prisma.outboxDraft.update({
      where: { id: d.id },
      data: { status: "CANCELLED", sendError: reason },
    });
  }
}

export async function sendApprovedReplies(): Promise<unknown> {
  const provider = getEmailProvider();
  const due = await prisma.replyReview.findMany({
    where: { status: "APPROVED" },
    include: {
      inboundMessage: true,
      thread: { include: { prospect: true } },
    },
    take: 25,
  });

  let sent = 0;
  for (const review of due) {
    await prisma.replyReview.update({ where: { id: review.id }, data: { status: "SENDING" } });
    try {
      const to = review.inboundMessage.fromAddress;
      const supp = await isSuppressed(to);
      if (supp.suppressed) {
        await prisma.replyReview.update({
          where: { id: review.id },
          data: { status: "FAILED", sendError: `address suppressed (${supp.reason})` },
        });
        continue;
      }

      const result = await provider.sendReply(
        {
          providerMessageId: review.inboundMessage.providerMessageId ?? "",
          providerFolderId: review.inboundMessage.providerFolderId ?? undefined,
          rfcMessageId: review.inboundMessage.rfcMessageId ?? undefined,
          references: review.inboundMessage.references ?? undefined,
          to,
          subject: review.draftSubject ?? review.inboundMessage.subject,
        },
        review.draftBody ?? "",
      );

      const message = await prisma.emailMessage.create({
        data: {
          threadId: review.threadId,
          direction: "OUTBOUND",
          fromAddress: provider.fromAddress,
          toAddress: to,
          subject: review.draftSubject ?? `Re: ${review.inboundMessage.subject}`,
          bodyText: review.draftBody ?? "",
          providerMessageId: result.providerMessageId,
          rfcMessageId: result.rfcMessageId,
          inReplyTo: review.inboundMessage.rfcMessageId,
          references: [review.inboundMessage.references, review.inboundMessage.rfcMessageId]
            .filter(Boolean)
            .join(" "),
          sentAt: result.sentAt,
        },
      });

      await prisma.replyReview.update({
        where: { id: review.id },
        data: { status: "SENT", sentAt: result.sentAt, sentMessageId: message.id },
      });
      await prisma.emailThread.update({
        where: { id: review.threadId },
        data: { lastMessageAt: result.sentAt, status: "AWAITING_REPLY" },
      });
      await logActivity({
        experimentId: review.experimentId,
        kind: "SEND",
        actor: "HUMAN",
        message: `Replied to ${review.thread.prospect?.contactName ?? to}.`,
      });
      sent++;
    } catch (err) {
      await prisma.replyReview.update({
        where: { id: review.id },
        data: { status: "FAILED", sendError: String((err as Error).message).slice(0, 1000) },
      });
    }
  }
  return { sent };
}
