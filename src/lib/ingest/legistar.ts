import fs from "node:fs";
import { prisma, j } from "../db";
import { candidateDedupeKey, normalizeOrgName } from "../domain/dedupe";
import { logActivity } from "../domain/activity";
import { enqueue } from "../jobs/queue";

/**
 * Import sole-source procurement records as prospect candidates.
 *
 * Source: ~/Desktop/workspace/the-google-of-obsolete-infrastructure-parts — 1,128 records
 * off the Legistar public API across 18 agencies, each carrying the agency, the
 * manufacturer and model, what they paid, and the agency's own verbatim
 * justification for why nobody else could sell it to them.
 *
 * What it is actually good for, measured 2026-09-07 rather than assumed:
 *
 *   - As a BUYER LIST it is excellent. 18 agencies that demonstrably buy
 *     sole-source physical infrastructure and publish the paperwork — 163
 *     records across pumps, treatment process, switchgear, motors, generators,
 *     valves and pipe. Free, versus about $0.48 per discovery call.
 *   - As an OBSOLESCENCE signal it is thin, and this matters. Only 26 of 1,128
 *     records cite obsolescence at all, and roughly half of those are software
 *     end-of-life (SharePoint, election management, records management) rather
 *     than the physical equipment this experiment is about.
 *
 * So: every agency is imported, but only PHYSICAL records become evidence, and
 * a candidate whose file contains no physical obsolescence says so in its own
 * relevanceReason. We do not pretend an agency has the problem because it once
 * renewed a software licence — the researcher and the qualifier still have to
 * earn that.
 */

export type LegistarRecord = {
  id: string;
  agency: string;
  state: string | null;
  date: string | null;
  manufacturer: string | null;
  model: string | null;
  part: string | null;
  quantity: string | null;
  price_usd: number | null;
  lead_time: string | null;
  sole_source_vendor: string | null;
  reason: string | null;
  equipment_class: string | null;
  installed_location: string | null;
  is_obsolete: boolean | null;
  source_url: string | null;
  legistar_url: string | null;
};

/**
 * Not every sole-source filing is our problem. Most are "this vendor is the
 * only one who makes it", which is proprietary-by-design, not discontinued.
 * We want the ones where support has ENDED — those are the agencies stuck with
 * equipment nobody will sell them parts for.
 */
const OBSOLESCENCE = /\b(obsolete|discontinued|no longer (manufactur|support|produc|avail)|end[- ]of[- ](life|support)|out of production|unsupported|parts are no longer)\b/i;

export function isObsolescenceSignal(r: LegistarRecord): boolean {
  if (r.is_obsolete) return true;
  return OBSOLESCENCE.test(r.reason ?? "");
}

/**
 * The thesis is PHYSICAL obsolete infrastructure — a board, a drive, an
 * impeller, a controller. Not software.
 *
 * `equipment_class` alone cannot express that, because the upstream extraction
 * emits one bucket called "SCADA/controls/software" holding 386 records that
 * mix the two: "BOARD FLIR VIP3D.1s Video Detection Processor" and "MODULE PIM
 * CARD SDLC INTERFACE" sit beside "Self-checkout kiosk software module
 * subscription". An industrial control board IS the canonical case in this
 * experiment; a library kiosk licence is not, and no class filter separates
 * them. So we read the part text.
 */
const SOFTWARE_MARKERS =
  /\b(software|licen[cs]e|licensing|subscription|saas|cloud|hosting|hosted|records management|professional services|maintenance and support|implementation services|training|portal|website|web app|mobile app|data migration|annual support|user seats?)\b/i;

const HARDWARE_MARKERS =
  /\b(board|card|module|rack|chassis|panel|encoder|decoder|processor|cpu|drive|vfd|plc|rtu|hmi|controller|actuator|relay|contactor|breaker|switchgear|transformer|starter|motor|pump|impeller|bearing|gearbox|seal|valve|gate|pipe|fitting|blower|compressor|generator|sensor|transmitter|probe|analyzer|meter|power supply|assembly|housing|rotor|stator|shaft|coupling|bushing|membrane|centrifuge|screen|clarifier|aerator|mixer)\b/i;

/** Classes that are physical by definition, whatever the part text says. */
const PHYSICAL_CLASSES = [
  "pump",
  "motor/drive",
  "valve",
  "pipe/fitting",
  "generator",
  "electrical/switchgear/transformer",
  "HVAC",
  "treatment process (membrane/centrifuge/UV/chemical feed)",
  "instrumentation/calibration",
];

/**
 * True when this record is about a physical thing that can wear out and need a
 * replacement part. Software is excluded first, because "software module" and
 * "control module" both contain "module" and only one of them is our problem.
 */
export function isPhysicalInfrastructure(r: LegistarRecord): boolean {
  const text = `${r.part ?? ""} ${r.manufacturer ?? ""} ${r.model ?? ""}`;
  if (SOFTWARE_MARKERS.test(text)) return false;
  if (r.equipment_class === "service/maintenance contract") return false;
  if (PHYSICAL_CLASSES.includes(r.equipment_class ?? "")) return true;
  return HARDWARE_MARKERS.test(text);
}

/**
 * Physical is a gate, not a preference: a software end-of-life filing never
 * becomes evidence for this experiment, however loudly it says "obsolete".
 * Within the physical records, obsolescence ranks first.
 */
function evidenceRank(r: LegistarRecord): number {
  if (!isPhysicalInfrastructure(r)) return 99;
  return isObsolescenceSignal(r) ? 0 : 1;
}

export function readRecords(filePath: string): LegistarRecord[] {
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as LegistarRecord);
}

export type ImportResult = {
  agencies: number;
  created: number;
  skipped: number;
  evidence: number;
  obsolescenceRecords: number;
};

export async function importLegistarRecords(args: {
  experimentSlug: string;
  filePath: string;
  /**
   * Import only agencies with an obsolescence filing. Default false: that
   * filter would discard 11 of 18 agencies that are still real municipal
   * buyers of the equipment in question.
   */
  requireObsolescence?: boolean;
}): Promise<ImportResult> {
  const experiment = await prisma.marketExperiment.findUniqueOrThrow({
    where: { slug: args.experimentSlug },
  });
  const records = readRecords(args.filePath);

  const byAgency = new Map<string, LegistarRecord[]>();
  for (const r of records) {
    if (!r.agency) continue;
    byAgency.set(r.agency, [...(byAgency.get(r.agency) ?? []), r]);
  }

  const result: ImportResult = { agencies: byAgency.size, created: 0, skipped: 0, evidence: 0, obsolescenceRecords: 0 };

  for (const [agency, rows] of byAgency) {
    const physical = rows.filter(isPhysicalInfrastructure);
    // Obsolescence counted over PHYSICAL records only — a SharePoint
    // end-of-support notice is not evidence that a plant cannot find a pump part.
    const obsolete = physical.filter(isObsolescenceSignal);
    result.obsolescenceRecords += obsolete.length;
    if (args.requireObsolescence === true && obsolete.length === 0) {
      result.skipped++;
      continue;
    }

    const state = rows.find((r) => r.state)?.state ?? null;
    const dedupeKey = candidateDedupeKey({ organizationName: agency });

    if (
      await prisma.prospectCandidate.findUnique({
        where: { experimentId_dedupeKey: { experimentId: experiment.id, dedupeKey } },
      })
    ) {
      result.skipped++;
      continue;
    }

    const organization = await prisma.organization.create({
      data: { name: agency, orgType: "Municipal agency", state },
    });

    // The evidence IS the agency's own words. We quote the justification
    // verbatim and link the filing, so a reviewer can read the council packet.
    const ranked = [...rows].sort((a, b) => evidenceRank(a) - evidenceRank(b));
    const evidence = ranked
      .filter((r) => evidenceRank(r) <= 1)
      .slice(0, 6)
      .map((r) => ({
      claim: [
        r.manufacturer && r.model ? `${r.manufacturer} ${r.model}` : (r.part ?? "equipment"),
        r.installed_location ? `at ${r.installed_location}` : null,
        isObsolescenceSignal(r)
          ? "was bought sole-source citing obsolescence or ended support"
          : "was bought sole-source",
        r.price_usd ? `($${r.price_usd.toLocaleString()})` : null,
        r.date ? `on ${r.date}` : null,
      ]
        .filter(Boolean)
        .join(" "),
      sourceUrl: r.source_url ?? r.legistar_url,
      quote: r.reason,
      kind: isObsolescenceSignal(r) ? "PROBLEM_SIGNAL" : "FACT",
    }));

    const example = obsolete.find(isPhysicalInfrastructure) ?? obsolete[0];
    await prisma.prospectCandidate.create({
      data: {
        experimentId: experiment.id,
        organizationId: organization.id,
        organizationName: agency,
        state,
        orgType: "Municipal agency",
        dedupeKey,
        status: "DISCOVERED",
        relevanceReason:
          obsolete.length > 0
            ? `Filed ${obsolete.length} sole-source justification${obsolete.length === 1 ? "" : "s"} citing obsolescence or ended support, and ${physical.length} for physical equipment, out of ${rows.length} sole-source purchases on record.`
            : `Filed ${physical.length} sole-source purchase${physical.length === 1 ? "" : "s"} for physical equipment out of ${rows.length} on record. No obsolescence justification yet — the problem is unconfirmed here.`,
        likelyProblemFit: example
          ? `They have already written down the problem: "${(example.reason ?? "").slice(0, 300)}"`
          : null,
        sourceUrls: j(
          [...new Set(ranked.slice(0, 10).map((r) => r.source_url ?? r.legistar_url).filter(Boolean))],
        ),
        researchNotes: `Imported from the Legistar sole-source extraction (~/Desktop/workspace/the-google-of-obsolete-infrastructure-parts). ${rows.length} sole-source records, ${physical.length} for physical equipment, ${obsolete.length} citing obsolescence. Manufacturers on record: ${[
          ...new Set(physical.map((r) => r.manufacturer).filter(Boolean)),
        ]
          .slice(0, 8)
          .join(", ")}.`,
        evidence: { create: evidence },
      },
    });

    result.created++;
    result.evidence += evidence.length;
  }

  await logActivity({
    experimentId: experiment.id,
    kind: "DISCOVERY",
    message: `Imported ${result.created} agencies from Legistar sole-source records (${result.obsolescenceRecords} obsolescence filings across ${result.agencies} agencies). Each arrives with the agency's own justification as evidence.`,
    detail: result,
  });

  if (result.created > 0) {
    await enqueue({
      kind: "MAINTAIN_PIPELINE",
      payload: { experimentId: experiment.id },
      experimentId: experiment.id,
    });
  }

  return result;
}
