import { env } from "../env";
import {
  detectAutoReply,
  detectBounce,
  extractBouncedAddress,
  type EmailProvider,
  type NormalizedMessage,
  type OutgoingEmail,
  type ReplyTarget,
  type SentEmail,
} from "./provider";

type ZohoRaw = Record<string, unknown>;

/**
 * Zoho Mail REST v1, against aidan@brickandmortar.dev (account
 * 5671348000000008002, confirmed live 2026-09-07).
 *
 * Deliberately NOT the Zoho MCP connector. That endpoint is OAuth-gated per
 * Claude Code session; a background worker that must run at 3am cannot hold a
 * session's token. A self-client refresh token is permanent and belongs to the
 * app. See README "Connecting the mailbox".
 */
export class ZohoEmailProvider implements EmailProvider {
  readonly name = "zoho";
  readonly fromAddress = env.ZOHO_FROM_ADDRESS;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private clientId = env.ZOHO_CLIENT_ID!,
    private clientSecret = env.ZOHO_CLIENT_SECRET!,
    private refreshToken = env.ZOHO_REFRESH_TOKEN!,
    private accountId = env.ZOHO_ACCOUNT_ID!,
  ) {
    if (!this.clientId || !this.clientSecret || !this.refreshToken || !this.accountId) {
      throw new Error(
        "ZohoEmailProvider needs ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN and ZOHO_ACCOUNT_ID. " +
          "Set EMAIL_PROVIDER=mock until they exist.",
      );
    }
  }

  private async token(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) return this.accessToken;
    const url = new URL(`${env.ZOHO_ACCOUNTS_BASE}/oauth/v2/token`);
    url.searchParams.set("refresh_token", this.refreshToken);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("client_secret", this.clientSecret);
    url.searchParams.set("grant_type", "refresh_token");

    const res = await fetch(url, { method: "POST" });
    const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !body.access_token) {
      throw new Error(`Zoho token refresh failed: ${body.error ?? res.status}`);
    }
    this.accessToken = body.access_token;
    this.tokenExpiresAt = Date.now() + (body.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${env.ZOHO_API_BASE}/accounts/${this.accountId}${path}`, {
      ...init,
      headers: {
        Authorization: `Zoho-oauthtoken ${await this.token()}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Zoho ${path} -> ${res.status}: ${text.slice(0, 400)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }

  async sendEmail(email: OutgoingEmail): Promise<SentEmail> {
    const body = await this.call<{ data?: ZohoRaw }>("/messages", {
      method: "POST",
      body: JSON.stringify({
        fromAddress: this.fromAddress,
        toAddress: email.to,
        ...(email.cc ? { ccAddress: email.cc } : {}),
        subject: email.subject,
        content: email.bodyText,
        mailFormat: "plaintext",
        askReceipt: "no",
      }),
    });
    const d = body.data ?? {};
    return {
      providerMessageId: String(d.messageId ?? ""),
      providerThreadId: d.threadId ? String(d.threadId) : undefined,
      providerFolderId: d.folderId ? String(d.folderId) : undefined,
      sentAt: new Date(),
    };
  }

  async sendReply(target: ReplyTarget, bodyText: string): Promise<SentEmail> {
    // action:"reply" makes Zoho set In-Reply-To and References from the parent,
    // which is what keeps our answer inside their thread in Outlook and Gmail
    // rather than starting a fresh conversation they have to reconnect by hand.
    const body = await this.call<{ data?: ZohoRaw }>(`/messages/${target.providerMessageId}`, {
      method: "POST",
      body: JSON.stringify({
        fromAddress: this.fromAddress,
        toAddress: target.to,
        subject: target.subject.startsWith("Re:") ? target.subject : `Re: ${target.subject}`,
        content: bodyText,
        mailFormat: "plaintext",
        action: "reply",
      }),
    });
    const d = body.data ?? {};
    return {
      providerMessageId: String(d.messageId ?? ""),
      providerThreadId: d.threadId ? String(d.threadId) : undefined,
      providerFolderId: d.folderId ? String(d.folderId) : undefined,
      sentAt: new Date(),
    };
  }

  async fetchRecentMessages(opts: { since?: Date; limit?: number }): Promise<NormalizedMessage[]> {
    const limit = Math.min(opts.limit ?? 50, 200);
    const list = await this.call<{ data?: ZohoRaw[] }>(
      `/messages/view?limit=${limit}&start=1&sortBy=date&sortorder=false`,
    );
    const rows = list.data ?? [];
    const out: NormalizedMessage[] = [];
    for (const row of rows) {
      const received = new Date(Number(row.receivedTime ?? Date.now()));
      if (opts.since && received < opts.since) continue;
      const full = await this.hydrate(row);
      if (full) out.push(full);
    }
    return out;
  }

  async fetchThread(providerThreadId: string): Promise<NormalizedMessage[]> {
    const list = await this.call<{ data?: ZohoRaw[] }>(
      `/messages/view?threadId=${encodeURIComponent(providerThreadId)}&limit=50&includesent=true`,
    );
    const out: NormalizedMessage[] = [];
    for (const row of list.data ?? []) {
      const full = await this.hydrate(row);
      if (full) out.push(full);
    }
    return out;
  }

  async searchMessages(query: string, limit = 25): Promise<NormalizedMessage[]> {
    const list = await this.call<{ data?: ZohoRaw[] }>(
      `/messages/search?searchKey=${encodeURIComponent(query)}&limit=${limit}&start=1`,
    );
    const out: NormalizedMessage[] = [];
    for (const row of list.data ?? []) {
      const full = await this.hydrate(row);
      if (full) out.push(full);
    }
    return out;
  }

  async getMessage(providerMessageId: string, providerFolderId?: string): Promise<NormalizedMessage | null> {
    if (!providerFolderId) return null;
    return this.hydrate({ messageId: providerMessageId, folderId: providerFolderId });
  }

  /** List rows carry no body and no RFC headers. Both need their own call. */
  private async hydrate(row: ZohoRaw): Promise<NormalizedMessage | null> {
    const messageId = String(row.messageId ?? "");
    const folderId = String(row.folderId ?? "");
    if (!messageId || !folderId) return null;

    const [content, header] = await Promise.all([
      this.call<{ data?: { content?: string } }>(`/folders/${folderId}/messages/${messageId}/content`),
      this.call<{ data?: Record<string, string> }>(
        `/folders/${folderId}/messages/${messageId}/header`,
      ).catch(() => ({ data: {} as Record<string, string> })),
    ]);

    return this.normalizeInboundMessage({ ...row, content: content.data?.content, headers: header.data });
  }

  normalizeInboundMessage(raw: unknown): NormalizedMessage {
    const r = raw as ZohoRaw & { content?: string; headers?: Record<string, string> };
    const headers = normalizeHeaderKeys(r.headers ?? {});
    const bodyHtml = String(r.content ?? r.summary ?? "");
    const bodyText = htmlToText(bodyHtml);
    const subject = String(r.subject ?? "");
    const fromAddress = extractAddress(String(r.fromAddress ?? r.sender ?? ""));

    const isBounce = detectBounce({ fromAddress, subject, bodyText });
    const isAutoReply = !isBounce && detectAutoReply({ subject, headers });

    return {
      providerMessageId: String(r.messageId ?? ""),
      providerThreadId: r.threadId ? String(r.threadId) : undefined,
      providerFolderId: r.folderId ? String(r.folderId) : undefined,
      rfcMessageId: headers["message-id"],
      inReplyTo: headers["in-reply-to"],
      references: headers["references"],
      fromAddress,
      toAddress: extractAddress(String(r.toAddress ?? "")),
      ccAddress: r.ccAddress ? extractAddress(String(r.ccAddress)) : undefined,
      subject,
      bodyText,
      bodyHtml: bodyHtml || undefined,
      receivedAt: new Date(Number(r.receivedTime ?? Date.now())),
      isBounce,
      isAutoReply,
      autoReplyUntil: isAutoReply ? guessReturnDate(bodyText) : undefined,
      bouncedAddress: isBounce ? extractBouncedAddress(bodyText) : undefined,
    };
  }
}

function normalizeHeaderKeys(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = v;
  return out;
}

/** Zoho returns "Name <a@b.com>" or a bare address, sometimes comma-joined. */
export function extractAddress(value: string): string {
  const first = value.split(",")[0] ?? "";
  const angled = first.match(/<([^>]+)>/);
  return (angled ? angled[1] : first).trim().toLowerCase();
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Reads a return date out of an out-of-office body so the follow-up lands after
 * they are back rather than into an empty chair. Returns undefined when the
 * message does not state one — we reschedule by a default in that case rather
 * than guessing a date.
 */
export function guessReturnDate(bodyText: string, now = new Date()): Date | undefined {
  const patterns = [
    /(?:back|return(?:ing)?|available)\s+(?:on|by|to the office on)?\s*([A-Z][a-z]+ \d{1,2}(?:,? \d{4})?)/,
    /(?:until|through|til|till)\s+([A-Z][a-z]+ \d{1,2}(?:,? \d{4})?)/,
    /(?:back|return(?:ing)?)\s+(?:on\s+)?(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/,
  ];
  for (const p of patterns) {
    const m = bodyText.match(p);
    if (!m) continue;
    const withYear = /\d{4}/.test(m[1]) ? m[1] : `${m[1]} ${now.getFullYear()}`;
    const d = new Date(withYear);
    if (!Number.isNaN(d.getTime()) && d > now) return d;
  }
  return undefined;
}
