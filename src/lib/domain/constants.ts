/**
 * SQLite has no enums, so these unions are the enum. Anything writing one of
 * these fields validates against the matching Zod schema first; nothing in the
 * app compares against a bare string literal that isn't declared here.
 */

export const EXPERIMENT_STAGES = ["SCOUT", "VALIDATE", "COMMERCIALIZE", "COMMIT"] as const;
export type ExperimentStage = (typeof EXPERIMENT_STAGES)[number];

/** Stage targets are contact counts, cumulative. Stage 4 stops being an experiment. */
export const STAGE_TARGETS: Record<ExperimentStage, number> = {
  SCOUT: 25,
  VALIDATE: 100,
  COMMERCIALIZE: 250,
  COMMIT: 250,
};

export const STAGE_GOALS: Record<ExperimentStage, string> = {
  SCOUT: "Detect evidence of pain.",
  VALIDATE: "Measure frequency and characterize economics.",
  COMMERCIALIZE: "Attempt real transactions.",
  COMMIT: "Stop treating it as an experiment.",
};

export const EXPERIMENT_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "TERMINATED"] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const TRUST_LEVELS = ["REVIEW_ALL", "TRUSTED_FOLLOWUPS", "HIGH_AUTOMATION"] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

export const TRUST_LEVEL_LABELS: Record<TrustLevel, string> = {
  REVIEW_ALL: "Level 1 — Review everything",
  TRUSTED_FOLLOWUPS: "Level 2 — Trusted follow-ups",
  HIGH_AUTOMATION: "Level 3 — High automation",
};

export const CANDIDATE_STATUSES = [
  "DISCOVERED",
  "RESEARCHING",
  "RESEARCHED",
  "QUALIFYING",
  "QUALIFIED",
  "REJECTED",
  "READY_FOR_OUTREACH",
  "PROMOTED",
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const PROSPECT_STATUSES = [
  "READY",
  "CONTACTED",
  "FOLLOWED_UP",
  "REPLIED",
  "ENGAGED",
  "NOT_INTERESTED",
  "BOUNCED",
  "UNSUBSCRIBED",
  "DO_NOT_CONTACT",
  "TRANSACTION",
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const OUTBOX_STATUSES = [
  "PENDING_REVIEW",
  "APPROVED",
  "SENDING",
  "SENT",
  "SKIPPED",
  "REJECTED",
  "FAILED",
  "CANCELLED",
] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export const REPLY_REVIEW_STATUSES = [
  "PENDING_REVIEW",
  "APPROVED",
  "SENDING",
  "SENT",
  "NO_RESPONSE",
  "ESCALATED",
  "DISMISSED",
  "FAILED",
] as const;
export type ReplyReviewStatus = (typeof REPLY_REVIEW_STATUSES)[number];

export const REPLY_CLASSIFICATIONS = [
  "POSITIVE",
  "NEGATIVE",
  "NEUTRAL",
  "REFERRAL",
  "HAS_ACTIVE_PROBLEM",
  "WANTS_PRICE",
  "WANTS_CALL",
  "UNSUBSCRIBE",
  "OUT_OF_OFFICE",
  "BOUNCE",
] as const;
export type ReplyClassification = (typeof REPLY_CLASSIFICATIONS)[number];

/** Which labels mean a human is actually engaging, for the qualified-pain rate. */
export const PAIN_CLASSIFICATIONS: ReplyClassification[] = [
  "HAS_ACTIVE_PROBLEM",
  "WANTS_PRICE",
  "WANTS_CALL",
];

/** Labels the system may fully handle on its own — no Reply Review row. */
export const ADMINISTRATIVE_CLASSIFICATIONS: ReplyClassification[] = [
  "BOUNCE",
  "OUT_OF_OFFICE",
  "UNSUBSCRIBE",
];

export const PAIN_SIGNAL_STATUSES = [
  "AUTO_CONFIRMED",
  "NEEDS_REVIEW",
  "CONFIRMED",
  "REJECTED",
] as const;
export type PainSignalStatus = (typeof PAIN_SIGNAL_STATUSES)[number];

export const EMAIL_CONFIDENCE = ["VERIFIED", "INFERRED", "GUESSED", "UNKNOWN"] as const;
export type EmailConfidence = (typeof EMAIL_CONFIDENCE)[number];

export const URGENCY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const FREQUENCY = ["ONE_OFF", "OCCASIONAL", "RECURRING", "CONSTANT"] as const;

export const AI_TASK_TYPES = [
  "DISCOVER_ORGANIZATIONS",
  "PRESCREEN_CANDIDATE",
  "RESEARCH_ORGANIZATION",
  "IDENTIFY_DECISION_MAKERS",
  "FIND_CONTACT",
  "QUALIFY_PROSPECT",
  "DRAFT_OUTREACH",
  "CLASSIFY_REPLY",
  "EXTRACT_PAIN_SIGNAL",
  "DRAFT_REPLY",
  "ANALYZE_EXPERIMENT",
  "CLUSTER_PAIN",
  "GENERATE_EXPERIMENT",
] as const;
export type AITaskType = (typeof AI_TASK_TYPES)[number];

export const TRANSACTION_KINDS = [
  "PRICE_REQUEST",
  "SOURCING_REQUEST",
  "DEADLINE",
  "PURCHASE_INTENT",
  "SURPLUS_OFFER",
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

/** Follow-up cadence, in days from the initial send. */
export const FOLLOWUP_SCHEDULE_DAYS = [4, 10];

/**
 * Thresholds. These are the only numbers that decide whether a machine acts
 * alone, so they live in one place where they can be argued with.
 */
export const THRESHOLDS = {
  /** Below this a candidate is never promoted, whatever the model says. */
  qualificationFloor: 60,
  /** A pain extraction this confident, with no commercial ask in it, self-confirms. */
  painAutoConfirm: 0.85,
  /** A draft below this confidence is flagged HIGH risk in the Outbox. */
  draftReviewConfidence: 0.5,
  /** An inferred (not verified) address never sends without a human looking. */
  requireVerifiedEmailForAutoSend: true,
  /** Minimum contacts on a feature before it is allowed to move targeting. */
  targetingMinSample: 8,
} as const;
