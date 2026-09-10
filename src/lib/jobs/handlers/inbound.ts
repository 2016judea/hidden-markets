import { prisma, j, parseJson } from "../../db";
import { getEmailProvider } from "../../email";
import * as ai from "../../ai/functions";
import { toBrief } from "../../ai/prompts/shared";
import { logActivity } from "../../domain/activity";
import { suppress } from "../../domain/suppression";
import { recordOutcomeForProspect } from "../../domain/targeting";
import { assertProspectTransition } from "../../domain/stateMachine";
import { candidateDedupeKey } from "../../domain/dedupe";
import { recordPainSignalInGraph } from "../../domain/graph";
import { CAPABILITIES } from "../../domain/capabilities";
import {
  PAIN_CLASSIFICATIONS,
  THRESHOLDS,
  type ProspectStatus,
} from "../../domain/constants";
import { enqueue } from "../queue";
import { cancelFollowups, scheduleFollowups } from "./outbound";
import { env } from "../../env";

export async function syncInbox(): Promise<unknown> {
  const provider = getEmailProvider();

  const newest = await prisma.emailMessage.findFirst({
    where: { direction: "INBOUND" },
    orderBy: { receivedAt: "desc" },
    select: { receivedAt: true },
  });
  // Overlap the window by a day. Fetching a message twice is free (the
  // providerMessageId check drops it); missing one is silent and permanent.
  const since = newest?.receivedAt
    ? new Date(newest.receivedAt.getTime() - 86_400_000)
    : new Date(Date.now() - 30 * 86_400_000);

  const messages = await provider.fetchRecentMessages({ since, limit: 100 });
  let created = 0;
  const unmatched: string[] = [];

  for (const m of messages) {
    if (m.fromAddress === provider.fromAddress.toLowerCase()) continue;

    const seen = await prisma.emailMessage.findFirst({
      where: {
        OR: [
          { providerMessageId: m.providerMessageId },
          ...(m.rfcMessageId ? [{ rfcMessageId: m.rfcMessageId }] : []),
        ],
      },
      select: { id: true },
    });
    if (seen) continue;

    const thread = await matchThread(m);
    if (!thread) {
      unmatched.push(`${m.fromAddress} — ${m.subject.slice(0, 60)}`);
      continue; // not ours — the mailbox is a real mailbox
    }

    const stored = await prisma.emailMessage.create({
      data: {
        threadId: thread.id,
        direction: "INBOUND",
        fromAddress: m.fromAddress,
        toAddress: m.toAddress,
        ccAddress: m.ccAddress,
        subject: m.subject,
        bodyText: m.bodyText,
        bodyHtml: m.bodyHtml,
        providerMessageId: m.providerMessageId,
        providerFolderId: m.providerFolderId,
        rfcMessageId: m.rfcMessageId,
        inReplyTo: m.inReplyTo,
        references: m.references,
        receivedAt: m.receivedAt,
        isBounce: m.isBounce,
        isAutoReply: m.isAutoReply,
        autoReplyUntil: m.autoReplyUntil,
      },
    });

    await prisma.emailThread.update({
      where: { id: thread.id },
      data: { lastMessageAt: m.receivedAt, status: "OPEN" },
    });

    await enqueue({
      kind: "PROCESS_INBOUND",
      payload: { emailMessageId: stored.id, bouncedAddress: m.bouncedAddress ?? null },
      experimentId: thread.experimentId,
      // A reply is the product. Losing one to a bad afternoon is not acceptable,
      // so this job keeps its head down and keeps trying.
      maxAttempts: 12,
      idempotencyKey: `inbound:${stored.id}`,
    });
    created++;
  }

  // Silence was how two bounces went missing: fetched 7, created 0, and nothing
  // anywhere said which 7 or why none stuck. This mailbox carries plenty of mail
  // that is genuinely not ours, so unmatched is normal — but it must be legible.
  if (unmatched.length > 0) {
    await logActivity({
      kind: "SYSTEM",
      message: `Inbox sync ignored ${unmatched.length} message(s) that matched no experiment thread.`,
      detail: { unmatched: unmatched.slice(0, 20) },
    });
  }

  return { fetched: messages.length, created, ignored: unmatched.length };
}

/**
 * Thread matching, in descending order of reliability. RFC headers first
 * because they are what the standard is for; the sender address is the last
 * resort and is scoped to a prospect we actually wrote to, so a stranger
 * emailing the mailbox never lands in an experiment.
 */
async function matchThread(m: {
  inReplyTo?: string;
  references?: string;
  providerThreadId?: string;
  fromAddress: string;
  isBounce?: boolean;
  bouncedAddress?: string;
}) {
  // A bounce is from mailer-daemon, carries no In-Reply-To, and is not in any
  // thread — so every branch below misses it and the whole bounce-handling path
  // was unreachable in production. Two real bounces (550 blocked, 550 user
  // unknown) were fetched and silently dropped. The recipient the DSN names is
  // the only usable key, and it is the one the body actually gives us.
  if (m.isBounce && m.bouncedAddress) {
    const bounced = await prisma.prospect.findFirst({
      where: { email: { equals: m.bouncedAddress } },
      include: { threads: { orderBy: { lastMessageAt: "desc" }, take: 1 } },
    });
    if (bounced?.threads[0]) return bounced.threads[0];
  }

  const refIds = [m.inReplyTo, ...(m.references ?? "").split(/\s+/)].filter(Boolean) as string[];
  if (refIds.length) {
    const parent = await prisma.emailMessage.findFirst({
      where: { direction: "OUTBOUND", rfcMessageId: { in: refIds } },
      include: { thread: true },
    });
    if (parent) return parent.thread;
  }
  if (m.providerThreadId) {
    const t = await prisma.emailThread.findFirst({ where: { providerThreadId: m.providerThreadId } });
    if (t) return t;
  }
  const prospect = await prisma.prospect.findFirst({
    where: { email: m.fromAddress, firstContactedAt: { not: null } },
    include: { threads: { orderBy: { lastMessageAt: "desc" }, take: 1 } },
  });
  return prospect?.threads[0] ?? null;
}

export async function processInbound(payload: Record<string, unknown>): Promise<unknown> {
  const emailMessageId = String(payload.emailMessageId);
  const message = await prisma.emailMessage.findUniqueOrThrow({
    where: { id: emailMessageId },
    include: {
      thread: {
        include: {
          experiment: true,
          prospect: true,
          messages: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  const { thread } = message;
  const prospect = thread.prospect;
  const experimentId = thread.experimentId;

  // ── Administrative mail: handled without a model and without the operator ──

  if (message.isBounce) {
    const address = String(payload.bouncedAddress ?? "") || prospect?.email;
    // Suppression comes first and unconditionally. Whatever else fails below,
    // this address must never be written to again — that is the one guarantee a
    // bounce has to deliver.
    if (address) await suppress({ kind: "EMAIL", value: address, reason: "BOUNCE", note: message.subject });
    if (prospect) {
      try {
        assertProspectTransition(prospect.status as ProspectStatus, "BOUNCED");
        await prisma.prospect.update({ where: { id: prospect.id }, data: { status: "BOUNCED" } });
      } catch {
        // An already-terminal prospect is fine to leave as it is; the address is
        // suppressed either way, which is what actually protects them.
      }
      await cancelFollowups(prospect.id, "address bounced");
      await recordOutcomeForProspect(prospect, "bounced");
      // The organization may still be worth reaching; the person is not.
      await enqueue({ kind: "MAINTAIN_PIPELINE", payload: { experimentId }, experimentId });
    }
    await logActivity({
      experimentId,
      kind: "REPLY",
      message: `Bounce from ${address ?? "unknown"} — address suppressed and follow-ups cancelled.`,
    });
    return { handled: "bounce" };
  }

  if (message.isAutoReply) {
    const back = message.autoReplyUntil ?? new Date(Date.now() + 7 * 86_400_000);
    if (prospect) {
      await cancelFollowups(prospect.id, "out of office");
      await scheduleFollowups(prospect.id, experimentId, back);
    }
    await logActivity({
      experimentId,
      kind: "REPLY",
      message: `Out-of-office from ${message.fromAddress}. Follow-ups rescheduled${
        message.autoReplyUntil ? ` to after ${back.toISOString().slice(0, 10)} (they stated a return date)` : " by a week (no return date given)"
      }.`,
    });
    return { handled: "auto-reply", rescheduledTo: back };
  }

  // ── A real human wrote back ──────────────────────────────────────────────

  const brief = toBrief(thread.experiment);
  const history = thread.messages
    .filter((m) => m.id !== message.id)
    .map((m) => ({
      direction: m.direction as "OUTBOUND" | "INBOUND",
      subject: m.subject,
      body: m.bodyText,
      at: (m.sentAt ?? m.receivedAt ?? m.createdAt).toISOString().slice(0, 16),
    }));
  const reply = { fromAddress: message.fromAddress, subject: message.subject, body: message.bodyText };
  const ctx = { experimentId, prospectId: prospect?.id, emailMessageId };

  const { output: classification, runId: classifyRunId } = await ai.classifyInboundReply(
    { brief, thread: history, reply },
    ctx,
  );

  if (prospect) {
    if (prospect.status !== "REPLIED" && prospect.status !== "ENGAGED") {
      await recordOutcomeForProspect(prospect, "replied");
    }
    await cancelFollowups(prospect.id, "they replied");
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { repliedAt: prospect.repliedAt ?? message.receivedAt ?? new Date() },
    });
  }

  const { output: extraction, runId: extractRunId } = await ai.extractPainSignals(
    { brief, reply, organizationName: prospect?.organizationName ?? message.fromAddress },
    ctx,
  );

  // Pain signals. High-confidence extractions with no commercial ask confirm
  // themselves; anything with money in it goes to the operator, because a
  // wrong number in a commercial record is the expensive kind of wrong.
  let confirmed = 0;
  for (const s of extraction.signals) {
    const hasCommercial = Boolean(s.commercialSignal);
    const status =
      s.confidence >= THRESHOLDS.painAutoConfirm && !hasCommercial ? "AUTO_CONFIRMED" : "NEEDS_REVIEW";

    const signal = await prisma.painSignal.create({
      data: {
        experimentId,
        prospectId: prospect?.id,
        emailMessageId,
        category: s.category,
        summary: s.summary,
        verbatim: s.verbatim,
        requestedItem: s.requestedItem.value,
        manufacturer: s.manufacturer.value,
        model: s.model.value,
        partNumber: s.partNumber.value,
        quantity: s.quantity.value,
        currentSupplier: s.currentSupplier.value,
        currentPrice: s.currentPrice.value,
        estimatedSpend: s.estimatedSpend.value,
        deadline: s.deadline.value,
        urgency: s.urgency === "UNKNOWN" ? null : s.urgency,
        frequency: s.frequency === "UNKNOWN" ? null : s.frequency,
        durationSoFar: s.durationSoFar.value,
        currentWorkaround: s.currentWorkaround.value,
        dissatisfaction: s.dissatisfaction.value,
        commercialSignal: s.commercialSignal,
        fieldConfidence: j({
          requestedItem: s.requestedItem.confidence,
          manufacturer: s.manufacturer.confidence,
          model: s.model.confidence,
          partNumber: s.partNumber.confidence,
          quantity: s.quantity.confidence,
          currentSupplier: s.currentSupplier.confidence,
          currentPrice: s.currentPrice.confidence,
          estimatedSpend: s.estimatedSpend.confidence,
          deadline: s.deadline.confidence,
          durationSoFar: s.durationSoFar.confidence,
          currentWorkaround: s.currentWorkaround.confidence,
          dissatisfaction: s.dissatisfaction.confidence,
        }),
        confidence: s.confidence,
        status,
        confirmedAt: status === "AUTO_CONFIRMED" ? new Date() : null,
        confirmedBy: status === "AUTO_CONFIRMED" ? "AI" : null,
        generatedByRunId: extractRunId,
      },
    });

    if (status === "AUTO_CONFIRMED") {
      confirmed++;
      await recordPainSignalInGraph({
        id: signal.id,
        category: s.category,
        manufacturer: s.manufacturer.value,
        requestedItem: s.requestedItem.value,
        experimentName: thread.experiment.name,
        buyerType: prospect?.orgType ?? null,
        state: prospect?.state ?? null,
      });
    }

    await logActivity({
      experimentId,
      kind: "SIGNAL",
      actor: "AI",
      message: `Extracted ${s.category.toLowerCase()} from ${prospect?.organizationName ?? message.fromAddress}: ${s.summary.slice(0, 120)}`,
      detail: { status, confidence: s.confidence },
    });
  }

  if (extraction.signals.length && prospect) {
    await recordOutcomeForProspect(prospect, "qualifiedPain");
  }

  for (const t of extraction.transactionOpportunities) {
    await prisma.transactionOpportunity.create({
      data: {
        experimentId,
        prospectId: prospect?.id,
        trigger: t.trigger,
        kind: t.kind,
        summary: t.summary,
        estimatedValue: t.estimatedValue,
        urgency: t.urgency === "UNKNOWN" ? null : t.urgency,
      },
    });
    await logActivity({
      experimentId,
      kind: "SIGNAL",
      actor: "AI",
      message: `TRANSACTION OPPORTUNITY — ${t.kind.replace("_", " ").toLowerCase()} from ${prospect?.organizationName ?? message.fromAddress}: "${t.trigger}"`,
    });
  }
  if (extraction.transactionOpportunities.length && prospect) {
    await recordOutcomeForProspect(prospect, "commercial");
  }

  // Referrals. Their words are the only honest basis for a warm opening, so
  // the quote is stored and the intro email is required to contain the name.
  if (classification.referral && prospect) {
    await createReferralCandidate(experimentId, prospect, classification.referral, emailMessageId);
  }

  // Prospect status, validated against the state machine rather than trusted.
  if (prospect) {
    const proposed = classification.suggestedProspectStatus as ProspectStatus;
    try {
      assertProspectTransition(prospect.status as ProspectStatus, proposed);
      await prisma.prospect.update({ where: { id: prospect.id }, data: { status: proposed } });
    } catch {
      await prisma.prospect.update({ where: { id: prospect.id }, data: { status: "REPLIED" } });
    }
    if (classification.classifications.includes("NEGATIVE")) {
      await recordOutcomeForProspect(prospect, "negative");
    }
  }

  if (classification.wantsNoFurtherContact) {
    await suppress({
      kind: "EMAIL",
      value: message.fromAddress,
      reason: classification.classifications.includes("UNSUBSCRIBE") ? "UNSUBSCRIBE" : "MANUAL",
      note: `Said no in "${message.subject}"`,
    });
    if (prospect) await cancelFollowups(prospect.id, "they asked us to stop");
    await prisma.replyReview.create({
      data: {
        experimentId,
        threadId: thread.id,
        inboundMessageId: emailMessageId,
        classifications: j(classification.classifications),
        interpretation: classification.interpretation,
        extraction: j(extraction),
        confidence: classification.confidence,
        status: "DISMISSED",
        generatedByRunId: classifyRunId,
      },
    });
    await logActivity({
      experimentId,
      kind: "REPLY",
      message: `${message.fromAddress} asked not to be contacted. Suppressed, follow-ups cancelled, no reply drafted.`,
    });
    return { handled: "opt-out", classifications: classification.classifications };
  }

  const extractedSummary = extraction.nothingToExtract
    ? "Nothing concrete extracted."
    : extraction.signals.map((s) => `${s.category}: ${s.summary}`).join(" | ") || "No pain signal.";

  const { output: draft, runId: draftRunId } = await ai.draftReply(
    {
      brief,
      thread: history,
      reply,
      classifications: classification.classifications,
      interpretation: classification.interpretation,
      extractedSummary,
      contactName: prospect?.contactName ?? null,
      organizationName: prospect?.organizationName ?? message.fromAddress,
      operatorName: env.OPERATOR_NAME,
      capabilities: CAPABILITIES,
    },
    ctx,
  );

  await prisma.replyReview.create({
    data: {
      experimentId,
      threadId: thread.id,
      inboundMessageId: emailMessageId,
      classifications: j(classification.classifications),
      interpretation: classification.interpretation,
      extraction: j(extraction),
      confidence: classification.confidence,
      draftSubject: draft.subject,
      draftBody: draft.body,
      aiDraftBody: draft.body,
      draftRationale: draft.rationale,
      status: draft.shouldEscalate ? "ESCALATED" : "PENDING_REVIEW",
      generatedByRunId: draftRunId,
    },
  });

  const isPain = classification.classifications.some((c) =>
    PAIN_CLASSIFICATIONS.includes(c as (typeof PAIN_CLASSIFICATIONS)[number]),
  );
  await logActivity({
    experimentId,
    kind: "REPLY",
    actor: "AI",
    message: `Reply from ${prospect?.organizationName ?? message.fromAddress} — ${classification.classifications.join(", ")}${isPain ? " (qualified pain)" : ""}. Draft ready for review.`,
  });

  await enqueue({
    kind: "ANALYZE_EXPERIMENT",
    payload: { experimentId },
    experimentId,
    runAfter: new Date(Date.now() + 60_000),
    idempotencyKey: `analyze:${experimentId}`,
  });

  return {
    classifications: classification.classifications,
    painSignals: extraction.signals.length,
    autoConfirmed: confirmed,
    transactions: extraction.transactionOpportunities.length,
    escalated: draft.shouldEscalate,
  };
}

async function createReferralCandidate(
  experimentId: string,
  source: { id: string; organizationName: string; organizationId: string | null; city: string | null; state: string | null; orgType: string | null },
  referral: { name: string | null; title: string | null; email: string | null; quote: string },
  emailMessageId: string,
): Promise<void> {
  const dedupeKey = candidateDedupeKey({
    email: referral.email,
    organizationName: source.organizationName,
    contactName: referral.name,
    title: referral.title,
  });
  const existing = await prisma.prospectCandidate.findUnique({
    where: { experimentId_dedupeKey: { experimentId, dedupeKey } },
  });

  const candidate =
    existing ??
    (await prisma.prospectCandidate.create({
      data: {
        experimentId,
        organizationId: source.organizationId,
        organizationName: source.organizationName,
        contactName: referral.name,
        title: referral.title,
        email: referral.email,
        emailConfidence: referral.email ? "VERIFIED" : "UNKNOWN",
        emailInferenceNote: referral.email ? "Given to us directly by a colleague at the same organization." : null,
        city: source.city,
        state: source.state,
        orgType: source.orgType,
        relevanceReason: `Referred by a colleague at ${source.organizationName}.`,
        referredByProspectId: source.id,
        referralContext: referral.quote,
        dedupeKey,
        status: "DISCOVERED",
      },
    }));

  await prisma.prospectReferral.create({
    data: {
      sourceProspectId: source.id,
      targetCandidateId: candidate.id,
      referredName: referral.name,
      referredTitle: referral.title,
      referredEmail: referral.email,
      quotedText: referral.quote,
      emailMessageId,
    },
  });

  await logActivity({
    experimentId,
    kind: "DISCOVERY",
    actor: "AI",
    message: `Referral: ${referral.name ?? "someone"}${referral.title ? `, ${referral.title}` : ""} at ${source.organizationName}. Added as a candidate.`,
  });

  await enqueue({ kind: "MAINTAIN_PIPELINE", payload: { experimentId }, experimentId });
}
