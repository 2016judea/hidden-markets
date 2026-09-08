/**
 * What this operation can honestly say it does today. Handed to draftReply as a
 * hard boundary — the model may promise nothing outside this list.
 *
 * Keep it short and keep it true. Every line added here is a thing a stranger
 * may be told we will do, and the whole system's value rests on the replies
 * being worth trusting.
 */
export const CAPABILITIES: string[] = [
  "Investigate a specific sourcing problem and report honestly what we find, including finding nothing.",
  "Search public and secondary markets, surplus channels, and OEM/aftermarket suppliers for a named part or item.",
  "Introduce them to a supplier or buyer we find, with no markup and no exclusivity.",
  "Ask follow-up questions and keep what they tell us confidential to this research.",
];

/** Things only the operator may do. Present in the UI wherever a draft is flagged. */
export const HUMAN_ONLY: string[] = [
  "Quote a price or agree a price",
  "Commit to a delivery date",
  "State that a part is technically compatible with their equipment",
  "Offer a warranty, guarantee or return policy",
  "Accept an order or take payment",
  "Sign or agree to any contract or terms",
  "Change what the business claims it can do",
];
