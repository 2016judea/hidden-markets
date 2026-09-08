import { describe, expect, it } from "vitest";
import {
  IllegalTransition,
  assertCandidateTransition,
  assertOutboxTransition,
  assertProspectTransition,
  canContact,
} from "@/lib/domain/stateMachine";
import { candidateDedupeKey, normalizeDomain, normalizeOrgName } from "@/lib/domain/dedupe";
import { detectAutoReply, detectBounce, extractBouncedAddress } from "@/lib/email/provider";
import { extractAddress, guessReturnDate, htmlToText } from "@/lib/email/zoho";
import { computeQualificationScore } from "@/lib/ai/prompts/qualifyProspect";
import { mayAutoApprove } from "@/lib/jobs/handlers/outbound";
import { featuresOf, titleBucket } from "@/lib/domain/targeting";
import { draftOutboundEmail } from "@/lib/ai/prompts/draftOutboundEmail";
import { identifyDecisionMakers } from "@/lib/ai/prompts/identifyDecisionMakers";
import { extractPainSignals } from "@/lib/ai/prompts/extractPainSignals";
import { analyzeExperiment } from "@/lib/ai/prompts/analyzeExperiment";

describe("state machine", () => {
  it("refuses to let a draft reach SENT without passing through approval", () => {
    expect(() => assertOutboxTransition("PENDING_REVIEW", "SENT")).toThrow(IllegalTransition);
    expect(() => assertOutboxTransition("PENDING_REVIEW", "SENDING")).toThrow(IllegalTransition);
    expect(() => assertOutboxTransition("PENDING_REVIEW", "APPROVED")).not.toThrow();
    expect(() => assertOutboxTransition("APPROVED", "SENDING")).not.toThrow();
    expect(() => assertOutboxTransition("SENDING", "SENT")).not.toThrow();
  });

  it("makes unsubscribed terminal", () => {
    expect(() => assertProspectTransition("UNSUBSCRIBED", "CONTACTED")).toThrow(IllegalTransition);
    expect(canContact("UNSUBSCRIBED")).toBe(false);
    expect(canContact("BOUNCED")).toBe(false);
    expect(canContact("REPLIED")).toBe(true);
  });

  it("will not let a candidate skip research", () => {
    expect(() => assertCandidateTransition("DISCOVERED", "QUALIFIED")).toThrow(IllegalTransition);
  });
});

describe("dedupe", () => {
  it("collapses the same facility written three ways", () => {
    const a = normalizeOrgName("City of Mesa Water Resources Department");
    const b = normalizeOrgName("Mesa Water Resources Dept.");
    expect(a).toBe(b);
  });

  it("prefers the email as the key", () => {
    expect(candidateDedupeKey({ email: "A.Smith@City.GOV", organizationName: "x" })).toBe("email:a.smith@city.gov");
  });

  it("pulls an apex domain from a URL or an address", () => {
    expect(normalizeDomain("https://www.mesaaz.gov/water")).toBe("mesaaz.gov");
    expect(normalizeDomain("jane@mesaaz.gov")).toBe("mesaaz.gov");
    expect(normalizeDomain("not-a-domain")).toBeNull();
  });
});

describe("administrative mail", () => {
  it("detects a bounce from the sender or the subject", () => {
    expect(detectBounce({ fromAddress: "MAILER-DAEMON@zoho.com", subject: "hi", bodyText: "" })).toBe(true);
    expect(detectBounce({ fromAddress: "a@b.com", subject: "Undeliverable: your message", bodyText: "" })).toBe(true);
    expect(detectBounce({ fromAddress: "a@b.com", subject: "Re: pumps", bodyText: "" })).toBe(false);
  });

  it("trusts the Auto-Submitted header over the subject", () => {
    expect(detectAutoReply({ subject: "Re: pumps", headers: { "auto-submitted": "auto-replied" } })).toBe(true);
    expect(detectAutoReply({ subject: "Re: pumps", headers: { "auto-submitted": "no" } })).toBe(false);
    expect(detectAutoReply({ subject: "Out of Office: pumps", headers: {} })).toBe(true);
  });

  it("reads a stated return date and ignores an absent one", () => {
    const now = new Date("2026-03-01");
    expect(guessReturnDate("I am out of the office and will return on March 15.", now)?.getMonth()).toBe(2);
    expect(guessReturnDate("I am away.", now)).toBeUndefined();
  });

  it("finds the failed recipient in a DSN", () => {
    expect(
      extractBouncedAddress("Final-Recipient: rfc822; jsmith@oldcity.gov\nAction: failed"),
    ).toBe("jsmith@oldcity.gov");
  });

  it("flattens html without swallowing the text", () => {
    expect(htmlToText("<p>We need a <b>Flygt</b> board.</p><br>Thanks")).toContain("We need a Flygt board.");
    expect(extractAddress("Jane Smith <Jane.Smith@City.gov>, other@x.com")).toBe("jane.smith@city.gov");
  });
});

describe("qualification scoring", () => {
  const parts = {
    buyerFit: { score: 90, reason: "r" },
    problemLikelihood: { score: 80, reason: "r" },
    contactAuthority: { score: 90, reason: "r" },
    organizationFit: { score: 70, reason: "r" },
    evidenceQuality: { score: 60, reason: "r" },
    verdict: "QUALIFIED" as const,
    verdictReason: "reason enough",
    personalizationFacts: [],
    confidence: 0.8,
  };

  it("penalises an unverified address, deterministically", () => {
    const verified = computeQualificationScore(parts, "VERIFIED");
    const guessed = computeQualificationScore(parts, "GUESSED");
    expect(verified.total - guessed.total).toBe(20);
  });

  it("shows every component that produced the number", () => {
    const { breakdown } = computeQualificationScore(parts, "VERIFIED");
    const components = (breakdown as { components: Record<string, unknown> }).components;
    expect(Object.keys(components)).toHaveLength(5);
  });
});

describe("trust policy", () => {
  const low = { kind: "INITIAL", riskLevel: "LOW" };
  const followup = { kind: "FOLLOWUP", riskLevel: "NORMAL" };
  const referral = { kind: "REFERRAL_INTRO", riskLevel: "LOW" };
  const high = { kind: "FOLLOWUP", riskLevel: "HIGH" };

  it("auto-approves nothing at level 1", () => {
    for (const d of [low, followup, referral, high]) expect(mayAutoApprove("REVIEW_ALL", d)).toBe(false);
  });

  it("auto-approves only follow-ups at level 2", () => {
    expect(mayAutoApprove("TRUSTED_FOLLOWUPS", followup)).toBe(true);
    expect(mayAutoApprove("TRUSTED_FOLLOWUPS", low)).toBe(false);
  });

  it("never auto-approves a referral intro or a high-risk draft, at any level", () => {
    expect(mayAutoApprove("HIGH_AUTOMATION", referral)).toBe(false);
    expect(mayAutoApprove("HIGH_AUTOMATION", high)).toBe(false);
    expect(mayAutoApprove("HIGH_AUTOMATION", low)).toBe(true);
  });
});

describe("targeting features", () => {
  it("buckets the many spellings of one role", () => {
    expect(titleBucket("Supt. of Water Reclamation")).toBe("SUPERINTENDENT");
    expect(titleBucket("WWTP Superintendent")).toBe("SUPERINTENDENT");
    expect(titleBucket("Purchasing Agent")).toBe("PURCHASING");
    expect(titleBucket(null)).toBe("UNKNOWN");
  });

  it("records whether problem evidence existed at contact time", () => {
    expect(featuresOf({ title: "Maintenance Manager", hasProblemEvidence: true }).HAS_PROBLEM_EVIDENCE).toBe("YES");
  });
});

describe("prompt validators", () => {
  const draftInput = {
    brief: {} as never,
    kind: "INITIAL" as const,
    sequenceIndex: 0,
    organizationName: "Mesa Water",
    contactName: "Jane",
    title: "Superintendent",
    city: null,
    state: null,
    personalizationFacts: [{ fact: "Their 2025 capital plan lists three lift-station pumps.", sourceUrl: "https://x", quote: null, whyItMatters: "y" }],
    problemSignals: [],
    operatorName: "Aidan",
    previousMessages: [],
    referral: null,
  };

  it("rejects flattery and other banned phrases", () => {
    const problems = draftOutboundEmail.validate!(
      {
        subject: "quick question",
        body: "I've been following your incredible work at Mesa Water. What do you do when a pump controller fails?",
        altSubject: null,
        altBody: null,
        rationale: "r",
        personalizationUsed: [],
        hypothesisTested: "h",
        confidence: 0.8,
        containsCommitment: false,
      },
      draftInput,
    );
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(" ")).toContain("i've been following");
  });

  it("catches personalization the model was never given", () => {
    const problems = draftOutboundEmail.validate!(
      {
        subject: "pump controllers",
        body: "What do you do when a controller on an older lift station fails? Aidan",
        altSubject: null,
        altBody: null,
        rationale: "r",
        personalizationUsed: ["They just won an award for excellence"],
        hypothesisTested: "h",
        confidence: 0.8,
        containsCommitment: false,
      },
      draftInput,
    );
    expect(problems.join(" ")).toContain("was not supplied");
  });

  it("passes a plain, sourced, unflattering email", () => {
    expect(
      draftOutboundEmail.validate!(
        {
          subject: "obsolete pump controllers",
          body: "I'm researching how plants source parts for equipment the manufacturer has stopped supporting. What do you actually do when a controller on an older lift station fails and the OEM says it's unsupported? Aidan",
          altSubject: null,
          altBody: null,
          rationale: "r",
          personalizationUsed: [],
          hypothesisTested: "h",
          confidence: 0.8,
          containsCommitment: false,
        },
        draftInput,
      ),
    ).toEqual([]);
  });

  it("will not let an address be called VERIFIED without a source", () => {
    const problems = identifyDecisionMakers.validate!(
      {
        people: [
          {
            name: "Jane Smith",
            title: "Superintendent",
            email: "jane@mesaaz.gov",
            emailConfidence: "VERIFIED",
            emailBasis: null,
            phone: null,
            sourceUrl: null,
            buyingRelevance: "owns it",
            matchesTargetTitle: true,
          },
        ],
        notes: "",
      },
      {} as never,
    );
    expect(problems.join(" ")).toContain("VERIFIED without a source URL");
  });

  it("catches a fabricated verbatim quote", () => {
    const input = {
      brief: {} as never,
      organizationName: "Mesa Water",
      reply: { fromAddress: "j@x.gov", subject: "re", body: "We have been looking for an obsolete Allen-Bradley board for six weeks." },
    };
    const signal = {
      category: "Obsolete infrastructure component",
      summary: "s",
      verbatim: "We would pay literally anything to solve this immediately",
      requestedItem: { value: "control board", confidence: 0.9 },
      manufacturer: { value: "Allen-Bradley", confidence: 0.9 },
      model: { value: null, confidence: 0 },
      partNumber: { value: null, confidence: 0 },
      quantity: { value: null, confidence: 0 },
      currentSupplier: { value: null, confidence: 0 },
      currentPrice: { value: null, confidence: 0 },
      estimatedSpend: { value: null, confidence: 0 },
      deadline: { value: null, confidence: 0 },
      urgency: "HIGH" as const,
      frequency: "UNKNOWN" as const,
      durationSoFar: { value: "6 weeks", confidence: 0.9 },
      currentWorkaround: { value: null, confidence: 0 },
      dissatisfaction: { value: null, confidence: 0 },
      commercialSignal: null,
      confidence: 0.9,
    };
    const problems = extractPainSignals.validate!(
      { signals: [signal], transactionOpportunities: [], nothingToExtract: false },
      input,
    );
    expect(problems.join(" ")).toContain("does not appear in the reply");
  });

  it("blocks a PROMOTE recommendation built on nothing", () => {
    const memo = {
      learning: "x".repeat(50),
      strongestEvidence: [],
      weakestAssumptions: [],
      emergingBuyerProfile: null,
      commonProblems: [],
      commercialEvidence: [],
      surprises: [],
      recommendedNext: "y".repeat(30),
      stageRecommendation: "PROMOTE" as const,
      stageRationale: "z".repeat(30),
    };
    const problems = analyzeExperiment.validate!(memo, {
      brief: {} as never,
      stage: "SCOUT",
      counts: { contacted: 3, replied: 1, qualifiedPain: 0, commercial: 0, negative: 0, bounced: 0, transactionOpportunities: 0 },
      painSignals: [],
      observedTargeting: [],
      negativeQuotes: [],
      previousMemoLearning: null,
    });
    expect(problems.length).toBe(2);
  });
});
