export type DirectoryQuery = {
  /** e.g. "funeral home". Combined with each location into one text search. */
  term: string;
  /** e.g. "Minneapolis, MN". */
  location: string;
  limit: number;
};

export type DirectoryRecord = {
  externalId: string;
  name: string;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  primaryType: string | null;
  /** CLOSED_PERMANENTLY businesses are dropped before they reach a candidate. */
  operational: boolean;
  sourceUrl: string | null;
};

export type DirectorySearchResult = {
  records: DirectoryRecord[];
  calls: number;
  costUsd: number;
};

/**
 * Enumeration, separated from judgement.
 *
 * Measured 2026-09-07: asking the model to enumerate cost $0.41 a call and
 * returned six organizations — about $0.07 each — because every web search
 * result comes back as an enormous input blob and search is billed per use on
 * top. A directory API returns the same names structured, with a website and a
 * phone number, for a fraction of a cent. The model's judgement is worth paying
 * for; its ability to read a listing page is not.
 */
export interface DirectoryProvider {
  readonly name: string;
  search(query: DirectoryQuery): Promise<DirectorySearchResult>;
}
