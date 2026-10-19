import type { CandidateStatus, OutboxStatus, ProspectStatus, ReplyReviewStatus } from "./constants";

/**
 * Every legal state change in the system, written down.
 *
 * This file is the answer to "could the AI have sent that email?" — no, because
 * PENDING_REVIEW reaches SENT only through APPROVED, and only assertApproval()
 * writes APPROVED, and it demands a human's name.
 */

export class IllegalTransition extends Error {
  constructor(entity: string, from: string, to: string) {
    super(`${entity}: ${from} -> ${to} is not a legal transition`);
    this.name = "IllegalTransition";
  }
}

const CANDIDATE: Record<CandidateStatus, CandidateStatus[]> = {
  DISCOVERED: ["RESEARCHING", "REJECTED"],
  RESEARCHING: ["RESEARCHED", "REJECTED"],
  RESEARCHED: ["QUALIFYING", "REJECTED"],
  QUALIFYING: ["QUALIFIED", "REJECTED"],
  QUALIFIED: ["READY_FOR_OUTREACH", "REJECTED"],
  READY_FOR_OUTREACH: ["PROMOTED", "REJECTED"],
  PROMOTED: [],
  REJECTED: ["DISCOVERED"], // an operator may put a rejected candidate back
};

const PROSPECT: Record<ProspectStatus, ProspectStatus[]> = {
  READY: ["CONTACTED", "DO_NOT_CONTACT", "NOT_INTERESTED"],
  // ENGAGED and TRANSACTION are reachable directly: a first reply that names a
  // live problem or asks a price IS engagement, and forcing it through REPLIED
  // would discard the distinction the classifier just made.
  CONTACTED: ["FOLLOWED_UP", "REPLIED", "ENGAGED", "TRANSACTION", "BOUNCED", "UNSUBSCRIBED", "NOT_INTERESTED", "DO_NOT_CONTACT"],
  FOLLOWED_UP: ["FOLLOWED_UP", "REPLIED", "ENGAGED", "TRANSACTION", "BOUNCED", "UNSUBSCRIBED", "NOT_INTERESTED", "DO_NOT_CONTACT"],
  // BOUNCED is reachable from every live state: an address that worked in
  // March can hard-bounce in September because the person left. Blocking it
  // would leave a dead address in the funnel with a healthy-looking status.
  REPLIED: ["ENGAGED", "NOT_INTERESTED", "TRANSACTION", "UNSUBSCRIBED", "BOUNCED", "DO_NOT_CONTACT"],
  ENGAGED: ["TRANSACTION", "NOT_INTERESTED", "REPLIED", "BOUNCED", "DO_NOT_CONTACT"],
  TRANSACTION: ["ENGAGED", "NOT_INTERESTED", "BOUNCED", "DO_NOT_CONTACT"],
  // Terminal by design. Reaching any of these means we stop, and the only way
  // back is an operator explicitly clearing the suppression.
  NOT_INTERESTED: ["DO_NOT_CONTACT"],
  BOUNCED: ["DO_NOT_CONTACT"],
  UNSUBSCRIBED: [],
  DO_NOT_CONTACT: [],
};

const OUTBOX: Record<OutboxStatus, OutboxStatus[]> = {
  PENDING_REVIEW: ["APPROVED", "SKIPPED", "REJECTED", "CANCELLED"],
  APPROVED: ["SENDING", "CANCELLED"],
  SENDING: ["SENT", "FAILED"],
  FAILED: ["APPROVED", "CANCELLED"],
  SENT: [],
  SKIPPED: ["PENDING_REVIEW"],
  REJECTED: [],
  CANCELLED: [],
};

const REPLY_REVIEW: Record<ReplyReviewStatus, ReplyReviewStatus[]> = {
  PENDING_REVIEW: ["APPROVED", "NO_RESPONSE", "ESCALATED", "DISMISSED"],
  APPROVED: ["SENDING", "DISMISSED"],
  SENDING: ["SENT", "FAILED"],
  FAILED: ["APPROVED", "DISMISSED"],
  ESCALATED: ["APPROVED", "NO_RESPONSE", "DISMISSED"],
  SENT: [],
  NO_RESPONSE: [],
  DISMISSED: [],
};

function check<T extends string>(map: Record<T, T[]>, entity: string, from: T, to: T): void {
  if (from === to) return;
  if (!map[from]?.includes(to)) throw new IllegalTransition(entity, from, to);
}

export const assertCandidateTransition = (from: CandidateStatus, to: CandidateStatus) =>
  check(CANDIDATE, "ProspectCandidate", from, to);
export const assertProspectTransition = (from: ProspectStatus, to: ProspectStatus) =>
  check(PROSPECT, "Prospect", from, to);
export const assertOutboxTransition = (from: OutboxStatus, to: OutboxStatus) =>
  check(OUTBOX, "OutboxDraft", from, to);
export const assertReplyReviewTransition = (from: ReplyReviewStatus, to: ReplyReviewStatus) =>
  check(REPLY_REVIEW, "ReplyReview", from, to);

/** Statuses from which no further outbound mail may ever be produced. */
export const PROSPECT_TERMINAL: ProspectStatus[] = [
  "NOT_INTERESTED",
  "BOUNCED",
  "UNSUBSCRIBED",
  "DO_NOT_CONTACT",
];

export function canContact(status: string): boolean {
  return !PROSPECT_TERMINAL.includes(status as ProspectStatus);
}

/** Statuses that mean a person has written back. */
export const PROSPECT_ANSWERED: ProspectStatus[] = ["REPLIED", "ENGAGED", "TRANSACTION"];

/**
 * Whether this prospect has answered us. A follow-up is a chase, and chasing
 * someone mid-conversation reads as a mailing list — so every place that
 * drafts, schedules or sends one asks this first, by status OR by the reply
 * timestamp, because the two can disagree for a moment while a reply is being
 * processed.
 */
export function hasAnswered(p: { status: string; repliedAt?: Date | null }): boolean {
  return p.repliedAt != null || PROSPECT_ANSWERED.includes(p.status as ProspectStatus);
}

/** True when the state machine allows `from -> to`, without throwing. */
export function isLegalProspectTransition(from: string, to: string): boolean {
  try {
    assertProspectTransition(from as ProspectStatus, to as ProspectStatus);
    return true;
  } catch {
    return false;
  }
}
