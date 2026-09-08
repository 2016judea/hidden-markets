/**
 * Deduplication keys. Candidates arrive from repeated discovery runs and the
 * same facility genuinely turns up under three names ("City of Mesa Water",
 * "Mesa Water Resources", "Mesa, AZ — Water Resources Dept"), so the email is
 * the only reliable key and the name key is a best effort behind it.
 */

const NOISE =
  /\b(the|city of|county of|town of|village of|inc|llc|ltd|corp|corporation|company|co|dept|department|district|authority|and|of)\b/g;

export function normalizeOrgName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDomain(websiteOrEmail: string | null | undefined): string | null {
  if (!websiteOrEmail) return null;
  const raw = websiteOrEmail.includes("@")
    ? websiteOrEmail.split("@")[1]
    : websiteOrEmail.replace(/^https?:\/\//i, "").split("/")[0];
  const host = (raw ?? "").toLowerCase().replace(/^www\./, "").trim();
  return host && host.includes(".") ? host : null;
}

/**
 * The key stored on ProspectCandidate, unique per experiment. Email wins when
 * we have one because two records with the same address ARE the same person;
 * without one we fall back to org + person, which over-merges rarely and
 * under-merges often — the safer direction, since a duplicate candidate costs a
 * research call and a duplicate SEND costs a relationship.
 */
export function candidateDedupeKey(args: {
  email?: string | null;
  organizationName: string;
  contactName?: string | null;
  title?: string | null;
}): string {
  if (args.email) return `email:${args.email.toLowerCase().trim()}`;
  const person = (args.contactName ?? args.title ?? "unknown").toLowerCase().trim();
  return `org:${normalizeOrgName(args.organizationName)}|${person}`;
}
