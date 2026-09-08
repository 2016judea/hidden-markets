import { parseJson } from "@/lib/db";
import { outboxQueue } from "@/lib/queries";
import { OutboxReviewer, type OutboxItem } from "./OutboxReviewer";

export const dynamic = "force-dynamic";

export default async function OutboxPage() {
  const drafts = await outboxQueue();

  const items: OutboxItem[] = drafts.map((d) => ({
    id: d.id,
    kind: d.kind,
    sequenceIndex: d.sequenceIndex,
    subject: d.subject,
    body: d.body,
    aiSubject: d.aiSubject,
    aiBody: d.aiBody,
    altSubject: d.altSubject,
    altBody: d.altBody,
    rationale: d.rationale,
    hypothesisTested: d.hypothesisTested,
    personalizationUsed: parseJson<string[]>(d.personalizationUsed, []),
    confidence: d.confidence,
    riskLevel: d.riskLevel,
    experimentName: d.experiment.name,
    experimentHypothesis: d.experiment.hypothesis,
    prospect: {
      organizationName: d.prospect.organizationName,
      contactName: d.prospect.contactName,
      title: d.prospect.title,
      email: d.prospect.email,
      city: d.prospect.city,
      state: d.prospect.state,
      orgType: d.prospect.orgType,
      score: d.prospect.qualificationScore,
      breakdown: parseJson<unknown>(d.prospect.scoreBreakdown, null),
      emailConfidence: d.prospect.candidate?.emailConfidence ?? null,
      emailBasis: d.prospect.candidate?.emailInferenceNote ?? null,
      researchNotes: d.prospect.candidate?.researchNotes ?? null,
      relevanceReason: d.prospect.candidate?.relevanceReason ?? null,
      likelyProblemFit: d.prospect.candidate?.likelyProblemFit ?? null,
    },
    evidence: (d.prospect.candidate?.evidence ?? []).map((e) => ({
      id: e.id,
      claim: e.claim,
      sourceUrl: e.sourceUrl,
      quote: e.quote,
      kind: e.kind,
    })),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Outbox</h1>
        <p className="text-sm text-muted-foreground">
          Nothing here has been sent. Approving is the only way an email leaves this machine.
        </p>
      </div>
      <OutboxReviewer items={items} />
    </div>
  );
}
