import type {
  DirectoryProvider,
  DirectoryQuery,
  DirectoryRecord,
  DirectorySearchResult,
} from "./provider";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

/** Text Search (Advanced) SKU, for the cost we record on each run. */
const COST_PER_CALL_USD = 0.032;

/** 20 per page, three pages, which is the API's hard ceiling per query. */
const PAGE_SIZE = 20;
const MAX_PAGES = 3;

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.primaryType",
  "places.businessStatus",
  "places.googleMapsUri",
  "nextPageToken",
].join(",");

type PlacesResponse = {
  places?: Array<{
    id: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
    websiteUri?: string;
    nationalPhoneNumber?: string;
    primaryType?: string;
    businessStatus?: string;
    googleMapsUri?: string;
  }>;
  nextPageToken?: string;
  error?: { message?: string; status?: string };
};

export class GooglePlacesDirectory implements DirectoryProvider {
  readonly name = "google-places";

  constructor(private apiKey: string) {
    if (!apiKey) throw new Error("GooglePlacesDirectory needs GOOGLE_PLACES_API_KEY.");
  }

  async search(query: DirectoryQuery): Promise<DirectorySearchResult> {
    const records: DirectoryRecord[] = [];
    let pageToken: string | undefined;
    let calls = 0;

    for (let page = 0; page < MAX_PAGES && records.length < query.limit; page++) {
      const body: Record<string, unknown> = {
        textQuery: `${query.term} in ${query.location}`,
        pageSize: Math.min(PAGE_SIZE, query.limit - records.length),
      };
      if (pageToken) body.pageToken = pageToken;

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(body),
      });
      calls++;

      const data = (await res.json()) as PlacesResponse;
      if (!res.ok || data.error) {
        throw new Error(`Places ${res.status}: ${data.error?.message ?? "unknown error"}`);
      }
      for (const p of data.places ?? []) {
        records.push(toRecord(p));
      }

      pageToken = data.nextPageToken;
      if (!pageToken) break;
      // The API rejects a page token used too quickly after it is issued.
      await new Promise((r) => setTimeout(r, 1500));
    }

    return {
      records: records.filter((r) => r.operational).slice(0, query.limit),
      calls,
      costUsd: calls * COST_PER_CALL_USD,
    };
  }
}

function component(
  components: Array<{ longText?: string; shortText?: string; types?: string[] }> | undefined,
  type: string,
  short = false,
): string | null {
  const hit = (components ?? []).find((c) => c.types?.includes(type));
  return (short ? hit?.shortText : hit?.longText) ?? null;
}

function toRecord(p: NonNullable<PlacesResponse["places"]>[number]): DirectoryRecord {
  return {
    externalId: p.id,
    name: p.displayName?.text ?? "",
    website: p.websiteUri ?? null,
    phone: p.nationalPhoneNumber ?? null,
    address: p.formattedAddress ?? null,
    city:
      component(p.addressComponents, "locality") ??
      component(p.addressComponents, "postal_town") ??
      component(p.addressComponents, "administrative_area_level_2"),
    state: component(p.addressComponents, "administrative_area_level_1", true),
    primaryType: p.primaryType ?? null,
    // A permanently closed business is a wasted research call and, worse, a
    // wasted email to somebody who no longer works there.
    operational: (p.businessStatus ?? "OPERATIONAL") === "OPERATIONAL",
    sourceUrl: p.googleMapsUri ?? null,
  };
}
