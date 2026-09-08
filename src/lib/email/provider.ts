export type OutgoingEmail = {
  to: string;
  subject: string;
  bodyText: string;
  cc?: string;
};

export type SentEmail = {
  providerMessageId: string;
  providerThreadId?: string;
  providerFolderId?: string;
  rfcMessageId?: string;
  sentAt: Date;
};

export type NormalizedMessage = {
  providerMessageId: string;
  providerThreadId?: string;
  providerFolderId?: string;
  rfcMessageId?: string;
  inReplyTo?: string;
  references?: string;
  fromAddress: string;
  toAddress: string;
  ccAddress?: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  receivedAt: Date;
  isBounce: boolean;
  isAutoReply: boolean;
  autoReplyUntil?: Date;
  /** The address that actually failed, pulled out of a bounce body. */
  bouncedAddress?: string;
};

export type ReplyTarget = {
  providerMessageId: string;
  providerFolderId?: string;
  rfcMessageId?: string;
  references?: string;
  to: string;
  subject: string;
};

export interface EmailProvider {
  readonly name: string;
  readonly fromAddress: string;

  sendEmail(email: OutgoingEmail): Promise<SentEmail>;
  sendReply(target: ReplyTarget, bodyText: string): Promise<SentEmail>;
  fetchRecentMessages(opts: { since?: Date; limit?: number }): Promise<NormalizedMessage[]>;
  fetchThread(providerThreadId: string): Promise<NormalizedMessage[]>;
  searchMessages(query: string, limit?: number): Promise<NormalizedMessage[]>;
  getMessage(providerMessageId: string, providerFolderId?: string): Promise<NormalizedMessage | null>;
  normalizeInboundMessage(raw: unknown): NormalizedMessage;
}

/**
 * Bounce and vacation detection is deterministic on purpose. These are the two
 * classes of mail where a model's judgement buys nothing and its cost and
 * latency are pure loss — the headers already say what they are.
 */
const BOUNCE_SENDERS = /(mailer-daemon|postmaster|no-?reply.*(delivery|bounce))/i;
const BOUNCE_SUBJECTS =
  /(undeliverable|delivery status notification|delivery failure|returned mail|mail delivery failed|address not found)/i;
const AUTO_REPLY_SUBJECTS =
  /(out of (the )?office|auto(matic)? repl|autoreply|vacation|away from (the |my )?(office|desk)|maternity|paternity leave)/i;

export function detectBounce(m: { fromAddress: string; subject: string; bodyText: string }): boolean {
  return BOUNCE_SENDERS.test(m.fromAddress) || BOUNCE_SUBJECTS.test(m.subject);
}

export function detectAutoReply(m: {
  subject: string;
  headers?: Record<string, string>;
}): boolean {
  const h = m.headers ?? {};
  const autoSubmitted = h["auto-submitted"] ?? h["Auto-Submitted"];
  if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") return true;
  if (h["x-autoreply"] || h["X-Autoreply"] || h["x-autorespond"]) return true;
  return AUTO_REPLY_SUBJECTS.test(m.subject);
}

/** Pulls the failed recipient out of a DSN body. Null when it isn't stated. */
export function extractBouncedAddress(bodyText: string): string | undefined {
  const m =
    bodyText.match(/<([^<>@\s]+@[^<>@\s]+)>[^\n]*(?:not|unknown|failed|rejected)/i) ??
    bodyText.match(/(?:Final-Recipient|Original-Recipient):\s*rfc822;\s*([^\s]+@[^\s]+)/i) ??
    bodyText.match(/[Tt]o:\s*<?([^<>@\s]+@[^<>@\s]+)>?/);
  return m?.[1]?.replace(/[>.,;]+$/, "");
}
