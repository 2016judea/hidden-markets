import { parseJson } from "@/lib/db";
import { painSignalsForReview, replyQueue } from "@/lib/queries";
import { ReplyReviewer, type ReplyItem, type SignalPreview } from "./ReplyReviewer";

export const dynamic = "force-dynamic";

const SIGNAL_FIELDS = [
  "requestedItem",
  "manufacturer",
  "model",
  "partNumber",
  "quantity",
  "currentSupplier",
  "currentPrice",
  "estimatedSpend",
  "deadline",
  "urgency",
  "frequency",
  "durationSoFar",
  "currentWorkaround",
  "dissatisfaction",
] as const;

export default async function RepliesPage() {
  const reviews = await replyQueue();
  const signalMap = await painSignalsForReview(reviews.map((r) => r.id));

  const items: ReplyItem[] = reviews.map((r) => {
    const signals: SignalPreview[] = (signalMap.get(r.id) ?? []).map((s) => {
      const conf = parseJson<Record<string, number>>(s.fieldConfidence, {});
      const row = s as unknown as Record<string, string | null>;
      return {
        id: s.id,
        category: s.category,
        summary: s.summary,
        verbatim: s.verbatim,
        status: s.status,
        confidence: s.confidence,
        fields: SIGNAL_FIELDS.filter((f) => row[f]).map(
          (f) => [f, String(row[f]), conf[f] ?? null] as [string, string, number | null],
        ),
      };
    });

    return {
      id: r.id,
      status: r.status,
      classifications: parseJson<string[]>(r.classifications, []),
      interpretation: r.interpretation,
      confidence: r.confidence,
      draftSubject: r.draftSubject,
      draftBody: r.draftBody,
      aiDraftBody: r.aiDraftBody,
      draftRationale: r.draftRationale,
      experimentName: r.experiment.name,
      from: r.inboundMessage.fromAddress,
      subject: r.inboundMessage.subject,
      body: r.inboundMessage.bodyText,
      receivedAt: (r.inboundMessage.receivedAt ?? r.inboundMessage.createdAt).toISOString().slice(0, 16).replace("T", " "),
      prospect: r.thread.prospect
        ? {
            organizationName: r.thread.prospect.organizationName,
            contactName: r.thread.prospect.contactName,
            title: r.thread.prospect.title,
            status: r.thread.prospect.status,
          }
        : null,
      thread: r.thread.messages
        .filter((m) => m.id !== r.inboundMessageId)
        .map((m) => ({
          direction: m.direction,
          subject: m.subject,
          body: m.bodyText,
          at: (m.sentAt ?? m.receivedAt ?? m.createdAt).toISOString().slice(0, 16).replace("T", " "),
        })),
      signals,
      transactionish: parseJson<string[]>(r.classifications, []).some((c) =>
        ["WANTS_PRICE", "WANTS_CALL", "HAS_ACTIVE_PROBLEM"].includes(c),
      ),
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reply review</h1>
        <p className="text-sm text-muted-foreground">
          Classified, extracted and drafted already. You decide what actually goes back.
        </p>
      </div>
      <ReplyReviewer items={items} />
    </div>
  );
}
