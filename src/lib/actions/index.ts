"use server";

import { revalidatePath } from "next/cache";
import { prisma, j, parseJson } from "../db";
import { enqueue, registerHandlers } from "../jobs";
import { mayAutoApprove } from "../jobs/handlers/outbound";
import {
  assertOutboxTransition,
  assertReplyReviewTransition,
  isLegalProspectTransition,
} from "../domain/stateMachine";
import { logActivity } from "../domain/activity";
import { suppress } from "../domain/suppression";
import { recordPainSignalInGraph } from "../domain/graph";
import { env } from "../env";
import * as ai from "../ai/functions";
import { STAGE_TARGETS, type ExperimentStage, type TrustLevel } from "../domain/constants";

registerHandlers();

const OPERATOR = env.OPERATOR_NAME;

/**
 * Every human decision the system learns from is written here, beside what the
 * AI proposed. Nothing is overwritten in place — the model's version stays on
 * the row it belongs to (aiBody, aiDraftBody, and so on), and the delta is what
 * a future prompt revision gets to read.
 */
async function recordCorrection(args: {
  entityType: string;
  entityId: string;
  field: string;
  aiValue: string | null;
  humanValue: string | null;
  reason?: string;
  aiTaskRunId?: string | null;
  experimentId?: string | null;
}): Promise<void> {
  if ((args.aiValue ?? "") === (args.humanValue ?? "")) return;
  await prisma.humanCorrection.create({
    data: {
      entityType: args.entityType,
      entityId: args.entityId,
      field: args.field,
      aiValue: args.aiValue,
      humanValue: args.humanValue,
      reason: args.reason,
      aiTaskRunId: args.aiTaskRunId ?? null,
      experimentId: args.experimentId ?? null,
    },
  });
}

// ─────────────────────────────────────────────────────────────── OUTBOX ────

export async function approveOutboxDraft(
  id: string,
  edited?: { subject: string; body: string },
): Promise<void> {
  const draft = await prisma.outboxDraft.findUniqueOrThrow({ where: { id } });
  assertOutboxTransition(draft.status as "PENDING_REVIEW", "APPROVED");

  const subject = edited?.subject ?? draft.subject;
  const body = edited?.body ?? draft.body;
  const wasEdited = subject !== draft.aiSubject || body !== draft.aiBody;

  await recordCorrection({
    entityType: "OUTBOX_DRAFT",
    entityId: id,
    field: "body",
    aiValue: draft.aiBody,
    humanValue: body,
    aiTaskRunId: draft.generatedByRunId,
    experimentId: draft.experimentId,
  });
  await recordCorrection({
    entityType: "OUTBOX_DRAFT",
    entityId: id,
    field: "subject",
    aiValue: draft.aiSubject,
    humanValue: subject,
    aiTaskRunId: draft.generatedByRunId,
    experimentId: draft.experimentId,
  });

  await prisma.outboxDraft.update({
    where: { id },
    data: {
      subject,
      body,
      status: "APPROVED",
      approvedAt: new Date(),
      approvedBy: OPERATOR,
      editedByHuman: wasEdited,
    },
  });
  await enqueue({ kind: "SEND_APPROVED_OUTBOX", idempotencyKey: "send-outbox" });
  revalidatePath("/outbox");
}

/**
 * Bulk approve. Reuses the SAME predicate the automatic trust policy uses, so
 * "low risk" means one thing in this system rather than two — a button that
 * approved a different set than Level 3 would auto-send is a trap.
 */
export async function approveAllLowRisk(experimentId?: string): Promise<number> {
  const drafts = await prisma.outboxDraft.findMany({
    where: { status: "PENDING_REVIEW", ...(experimentId ? { experimentId } : {}) },
    include: { experiment: { select: { trustLevel: true } } },
  });
  let n = 0;
  for (const d of drafts) {
    if (!mayAutoApprove("HIGH_AUTOMATION" as TrustLevel, d)) continue;
    await approveOutboxDraft(d.id);
    n++;
  }
  revalidatePath("/outbox");
  return n;
}

export async function skipOutboxDraft(id: string): Promise<void> {
  const draft = await prisma.outboxDraft.findUniqueOrThrow({ where: { id } });
  assertOutboxTransition(draft.status as "PENDING_REVIEW", "SKIPPED");
  await prisma.outboxDraft.update({ where: { id }, data: { status: "SKIPPED" } });
  revalidatePath("/outbox");
}

export async function rejectProspectFromOutbox(id: string, reason: string): Promise<void> {
  const draft = await prisma.outboxDraft.findUniqueOrThrow({ where: { id }, include: { prospect: true } });
  assertOutboxTransition(draft.status as "PENDING_REVIEW", "REJECTED");
  await prisma.outboxDraft.update({ where: { id }, data: { status: "REJECTED", sendError: reason } });
  await prisma.prospect.update({ where: { id: draft.prospectId }, data: { status: "DO_NOT_CONTACT" } });
  await recordCorrection({
    entityType: "CANDIDATE",
    entityId: draft.prospect.candidateId ?? draft.prospectId,
    field: "qualification",
    aiValue: `QUALIFIED (${draft.prospect.qualificationScore})`,
    humanValue: "REJECTED",
    reason,
    experimentId: draft.experimentId,
  });
  await logActivity({
    experimentId: draft.experimentId,
    kind: "REJECTION",
    actor: "HUMAN",
    message: `Rejected ${draft.prospect.organizationName}: ${reason}`,
  });
  revalidatePath("/outbox");
}

// ────────────────────────────────────────────────────────── REPLY REVIEW ────

export async function approveReply(
  id: string,
  edited?: { subject: string; body: string },
): Promise<void> {
  const review = await prisma.replyReview.findUniqueOrThrow({ where: { id } });
  assertReplyReviewTransition(review.status as "PENDING_REVIEW", "APPROVED");

  const body = edited?.body ?? review.draftBody ?? "";
  await recordCorrection({
    entityType: "REPLY_REVIEW",
    entityId: id,
    field: "draftBody",
    aiValue: review.aiDraftBody,
    humanValue: body,
    aiTaskRunId: review.generatedByRunId,
    experimentId: review.experimentId,
  });

  await prisma.replyReview.update({
    where: { id },
    data: {
      draftSubject: edited?.subject ?? review.draftSubject,
      draftBody: body,
      status: "APPROVED",
      approvedAt: new Date(),
      approvedBy: OPERATOR,
      editedByHuman: body !== review.aiDraftBody,
    },
  });
  await enqueue({ kind: "SEND_APPROVED_REPLIES", idempotencyKey: "send-replies" });
  revalidatePath("/replies");
}

export async function setReplyStatus(
  id: string,
  status: "NO_RESPONSE" | "ESCALATED" | "DISMISSED",
): Promise<void> {
  const review = await prisma.replyReview.findUniqueOrThrow({ where: { id } });
  assertReplyReviewTransition(review.status as "PENDING_REVIEW", status);
  await prisma.replyReview.update({ where: { id }, data: { status } });
  revalidatePath("/replies");
}

export async function markNotInterested(reviewId: string, doNotContact = false): Promise<void> {
  const review = await prisma.replyReview.findUniqueOrThrow({
    where: { id: reviewId },
    include: { thread: { include: { prospect: true } }, inboundMessage: true },
  });
  const prospect = review.thread.prospect;
  if (prospect) {
    const target = doNotContact ? "DO_NOT_CONTACT" : "NOT_INTERESTED";
    // A prospect already past this point (DO_NOT_CONTACT, UNSUBSCRIBED) stays
    // where they are; the button used to throw on the illegal transition and
    // the review could never be dismissed.
    if (isLegalProspectTransition(prospect.status, target)) {
      await prisma.prospect.update({ where: { id: prospect.id }, data: { status: target } });
    }
    if (doNotContact) {
      await suppress({ kind: "EMAIL", value: prospect.email, reason: "MANUAL", note: "Operator marked do-not-contact" });
    }
  }
  await recordCorrection({
    entityType: "CLASSIFICATION",
    entityId: reviewId,
    field: "classifications",
    aiValue: review.classifications,
    humanValue: j(["NEGATIVE"]),
    reason: "Operator marked not interested",
    aiTaskRunId: review.generatedByRunId,
    experimentId: review.experimentId,
  });
  await prisma.replyReview.update({ where: { id: reviewId }, data: { status: "DISMISSED" } });
  revalidatePath("/replies");
}

export async function correctClassification(reviewId: string, classifications: string[]): Promise<void> {
  const review = await prisma.replyReview.findUniqueOrThrow({ where: { id: reviewId } });
  await recordCorrection({
    entityType: "CLASSIFICATION",
    entityId: reviewId,
    field: "classifications",
    aiValue: review.classifications,
    humanValue: j(classifications),
    aiTaskRunId: review.generatedByRunId,
    experimentId: review.experimentId,
  });
  await prisma.replyReview.update({ where: { id: reviewId }, data: { classifications: j(classifications) } });
  revalidatePath("/replies");
}

// ───────────────────────────────────────────────────────────── SIGNALS ────

export async function confirmPainSignal(id: string, edits?: Record<string, string | null>): Promise<void> {
  const signal = await prisma.painSignal.findUniqueOrThrow({
    where: { id },
    include: { experiment: { select: { name: true } }, prospect: true },
  });
  if (edits) {
    for (const [field, value] of Object.entries(edits)) {
      await recordCorrection({
        entityType: "PAIN_SIGNAL",
        entityId: id,
        field,
        aiValue: (signal as unknown as Record<string, string | null>)[field] ?? null,
        humanValue: value,
        aiTaskRunId: signal.generatedByRunId,
        experimentId: signal.experimentId,
      });
    }
  }
  const updated = await prisma.painSignal.update({
    where: { id },
    data: { ...(edits ?? {}), status: "CONFIRMED", confirmedAt: new Date(), confirmedBy: OPERATOR },
  });
  await recordPainSignalInGraph({
    id: updated.id,
    category: updated.category,
    manufacturer: updated.manufacturer,
    requestedItem: updated.requestedItem,
    experimentName: signal.experiment.name,
    buyerType: signal.prospect?.orgType ?? null,
    state: signal.prospect?.state ?? null,
  });
  revalidatePath("/replies");
  revalidatePath("/insights");
}

export async function rejectPainSignal(id: string, reason: string): Promise<void> {
  const signal = await prisma.painSignal.findUniqueOrThrow({ where: { id } });
  await recordCorrection({
    entityType: "PAIN_SIGNAL",
    entityId: id,
    field: "status",
    aiValue: signal.status,
    humanValue: "REJECTED",
    reason,
    aiTaskRunId: signal.generatedByRunId,
    experimentId: signal.experimentId,
  });
  await prisma.painSignal.update({ where: { id }, data: { status: "REJECTED" } });
  revalidatePath("/replies");
}

export async function setTransactionStatus(
  id: string,
  status: "OPEN" | "IN_PROGRESS" | "WON" | "LOST" | "DECLINED",
  notes?: string,
): Promise<void> {
  await prisma.transactionOpportunity.update({ where: { id }, data: { status, notes } });
  revalidatePath("/");
}

// ─────────────────────────────────────────────────────────── EXPERIMENTS ────

export async function startExperiment(id: string): Promise<void> {
  await prisma.marketExperiment.update({
    where: { id },
    data: { status: "ACTIVE", approvedAt: new Date() },
  });
  await enqueue({
    kind: "MAINTAIN_PIPELINE",
    payload: { experimentId: id },
    experimentId: id,
    idempotencyKey: `maintain:${id}`,
  });
  await logActivity({ experimentId: id, kind: "SYSTEM", actor: "HUMAN", message: "Experiment started." });
  revalidatePath("/");
  revalidatePath(`/experiments/${id}`);
}

export async function pauseExperiment(id: string): Promise<void> {
  await prisma.marketExperiment.update({ where: { id }, data: { status: "PAUSED" } });
  // Everything queued for this experiment stops now, not after it drains —
  // except the scheduled follow-ups, which are held by draftOutreach while the
  // experiment is paused. They are created once, at the first send, so deleting
  // them here lost them for good.
  await prisma.jobRun.deleteMany({
    where: { experimentId: id, status: "PENDING", kind: { not: "DRAFT_OUTREACH" } },
  });
  await logActivity({ experimentId: id, kind: "SYSTEM", actor: "HUMAN", message: "Experiment paused." });
  revalidatePath(`/experiments/${id}`);
}

export async function terminateExperiment(id: string, reason: string): Promise<void> {
  await prisma.marketExperiment.update({ where: { id }, data: { status: "TERMINATED" } });
  await prisma.jobRun.deleteMany({ where: { experimentId: id, status: "PENDING" } });
  await prisma.outboxDraft.updateMany({
    where: { experimentId: id, status: { in: ["PENDING_REVIEW", "APPROVED"] } },
    data: { status: "CANCELLED", sendError: `experiment terminated: ${reason}` },
  });
  await logActivity({ experimentId: id, kind: "SYSTEM", actor: "HUMAN", message: `Experiment terminated: ${reason}` });
  revalidatePath("/");
}

export async function setTrustLevel(id: string, trustLevel: TrustLevel): Promise<void> {
  await prisma.marketExperiment.update({ where: { id }, data: { trustLevel } });
  await logActivity({
    experimentId: id,
    kind: "SYSTEM",
    actor: "HUMAN",
    message: `Trust level set to ${trustLevel}.`,
  });
  revalidatePath(`/experiments/${id}`);
}

/** Stage transitions are material changes to an experiment, so they are here
 *  and not in a handler — a memo may recommend one, only a person makes one. */
export async function promoteStage(id: string, stage: ExperimentStage): Promise<void> {
  await prisma.marketExperiment.update({
    where: { id },
    data: { stage, contactedTarget: STAGE_TARGETS[stage] },
  });
  await enqueue({ kind: "MAINTAIN_PIPELINE", payload: { experimentId: id }, experimentId: id });
  await logActivity({
    experimentId: id,
    kind: "SYSTEM",
    actor: "HUMAN",
    message: `Promoted to stage ${stage}.`,
  });
  revalidatePath(`/experiments/${id}`);
}

export async function setProspectTarget(id: string, target: number): Promise<void> {
  await prisma.marketExperiment.update({ where: { id }, data: { prospectTarget: Math.max(1, target) } });
  revalidatePath(`/experiments/${id}`);
}

export async function overrideQualification(candidateId: string, score: number, reason: string): Promise<void> {
  const candidate = await prisma.prospectCandidate.findUniqueOrThrow({ where: { id: candidateId } });
  await recordCorrection({
    entityType: "CANDIDATE",
    entityId: candidateId,
    field: "qualificationScore",
    aiValue: String(candidate.qualificationScore ?? ""),
    humanValue: String(score),
    reason,
    experimentId: candidate.experimentId,
  });
  await prisma.prospectCandidate.update({
    where: { id: candidateId },
    data: { qualificationScore: score },
  });
  revalidatePath(`/experiments/${candidate.experimentId}`);
}

export async function suppressOrganization(organizationId: string, reason: string): Promise<void> {
  const org = await prisma.organization.update({
    where: { id: organizationId },
    data: { suppressed: true, suppressedReason: reason },
  });
  if (org.domain) await suppress({ kind: "DOMAIN", value: org.domain, reason: "MANUAL", note: reason });
  revalidatePath("/");
}

/** Draft an experiment from one sentence. The operator approves it before it
 *  can contact anybody — it lands as DRAFT, not ACTIVE. */
export async function proposeExperiment(idea: string): Promise<string> {
  const existing = await prisma.marketExperiment.findMany({ select: { name: true } });
  const { output, runId } = await ai.generateExperiment({
    idea,
    existingExperiments: existing.map((e) => e.name),
  });

  let slug = output.slug;
  if (await prisma.marketExperiment.findUnique({ where: { slug } })) {
    slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  const created = await prisma.marketExperiment.create({
    data: {
      slug,
      name: output.name,
      hypothesis: output.hypothesis,
      buyerPersona: output.buyerPersona,
      likelyProblem: output.likelyProblem,
      offer: output.offer,
      targetTitles: j(output.targetTitles),
      targetOrgTypes: j(output.targetOrgTypes),
      targetGeography: output.targetGeography,
      exclusionCriteria: j(output.exclusionCriteria),
      qualificationCriteria: j(output.qualificationCriteria),
      researchStrategy: output.researchStrategy,
      successCriteria: j(output.successCriteria),
      safetyNotes: [output.safetyNotes, `\nCheapest disqualifier: ${output.cheapestDisqualifier}`].join("\n"),
      monetizationPaths: j(output.monetizationPaths),
      status: "DRAFT",
      generatedByRunId: runId,
    },
  });
  revalidatePath("/experiments");
  return created.id;
}

export async function runNow(kind: "SYNC_INBOX" | "CLUSTER_PAIN" | "MAINTAIN_PIPELINE" | "ANALYZE_EXPERIMENT", experimentId?: string): Promise<void> {
  await enqueue({
    kind,
    payload: experimentId ? { experimentId } : {},
    experimentId: experimentId ?? null,
    idempotencyKey: `${kind}:${experimentId ?? "global"}:${Date.now()}`,
  });
  revalidatePath("/");
}
