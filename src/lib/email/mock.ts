import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
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

const ROOT = path.join(process.cwd(), ".mailbox");
const OUT = path.join(ROOT, "sent");
const IN = path.join(ROOT, "inbox");

/**
 * A real mailbox on disk. Sends land in .mailbox/sent as readable JSON; drop a
 * file into .mailbox/inbox and the inbound pipeline treats it exactly like a
 * message off Zoho. This is what lets the whole loop — discover, draft,
 * approve, send, reply, classify, extract — be exercised and tested before a
 * single live email is sent to a stranger.
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = "mock";
  readonly fromAddress = env.ZOHO_FROM_ADDRESS;

  constructor() {
    fs.mkdirSync(OUT, { recursive: true });
    fs.mkdirSync(IN, { recursive: true });
  }

  private write(dir: string, id: string, payload: unknown) {
    // Recreate on every write: the directory can vanish under a long-running
    // worker (a cleanup, a test reset), and losing a "sent" record silently is
    // the one failure a mock mailbox must not have.
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(payload, null, 2));
  }

  async sendEmail(email: OutgoingEmail): Promise<SentEmail> {
    const id = randomUUID();
    const rfcMessageId = `<${id}@${this.fromAddress.split("@")[1]}>`;
    const sentAt = new Date();
    this.write(OUT, id, {
      providerMessageId: id,
      providerThreadId: id,
      rfcMessageId,
      from: this.fromAddress,
      ...email,
      sentAt: sentAt.toISOString(),
    });
    return { providerMessageId: id, providerThreadId: id, rfcMessageId, sentAt };
  }

  async sendReply(target: ReplyTarget, bodyText: string): Promise<SentEmail> {
    const id = randomUUID();
    const rfcMessageId = `<${id}@${this.fromAddress.split("@")[1]}>`;
    const sentAt = new Date();
    this.write(OUT, id, {
      providerMessageId: id,
      rfcMessageId,
      inReplyTo: target.rfcMessageId,
      references: [target.references, target.rfcMessageId].filter(Boolean).join(" "),
      from: this.fromAddress,
      to: target.to,
      subject: target.subject.startsWith("Re:") ? target.subject : `Re: ${target.subject}`,
      bodyText,
      sentAt: sentAt.toISOString(),
    });
    return { providerMessageId: id, rfcMessageId, sentAt };
  }

  private readInbox(): NormalizedMessage[] {
    if (!fs.existsSync(IN)) return [];
    return fs
      .readdirSync(IN)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return this.normalizeInboundMessage(JSON.parse(fs.readFileSync(path.join(IN, f), "utf8")));
        } catch {
          return null;
        }
      })
      .filter((m): m is NormalizedMessage => m !== null)
      .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  }

  async fetchRecentMessages(opts: { since?: Date; limit?: number }): Promise<NormalizedMessage[]> {
    let all = this.readInbox();
    if (opts.since) all = all.filter((m) => m.receivedAt >= opts.since!);
    return all.slice(0, opts.limit ?? 50);
  }

  async fetchThread(providerThreadId: string): Promise<NormalizedMessage[]> {
    return this.readInbox().filter((m) => m.providerThreadId === providerThreadId);
  }

  async searchMessages(query: string, limit = 25): Promise<NormalizedMessage[]> {
    const q = query.toLowerCase();
    return this.readInbox()
      .filter((m) => m.subject.toLowerCase().includes(q) || m.fromAddress.includes(q))
      .slice(0, limit);
  }

  async getMessage(providerMessageId: string): Promise<NormalizedMessage | null> {
    return this.readInbox().find((m) => m.providerMessageId === providerMessageId) ?? null;
  }

  normalizeInboundMessage(raw: unknown): NormalizedMessage {
    const r = raw as Record<string, unknown>;
    const subject = String(r.subject ?? "");
    const bodyText = String(r.bodyText ?? r.body ?? "");
    const fromAddress = String(r.fromAddress ?? r.from ?? "").toLowerCase();
    const headers = (r.headers as Record<string, string>) ?? {};
    const isBounce = detectBounce({ fromAddress, subject, bodyText });
    const isAutoReply = !isBounce && detectAutoReply({ subject, headers });
    return {
      providerMessageId: String(r.providerMessageId ?? r.messageId ?? randomUUID()),
      providerThreadId: r.providerThreadId ? String(r.providerThreadId) : undefined,
      rfcMessageId: r.rfcMessageId ? String(r.rfcMessageId) : undefined,
      inReplyTo: r.inReplyTo ? String(r.inReplyTo) : undefined,
      references: r.references ? String(r.references) : undefined,
      fromAddress,
      toAddress: String(r.toAddress ?? r.to ?? this.fromAddress).toLowerCase(),
      subject,
      bodyText,
      receivedAt: r.receivedAt ? new Date(String(r.receivedAt)) : new Date(),
      isBounce,
      isAutoReply,
      bouncedAddress: isBounce ? extractBouncedAddress(bodyText) : undefined,
    };
  }
}
