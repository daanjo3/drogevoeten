// https://api.pdok.nl/bzk/locatieserver/search/v3_1/ui/#/Locatieserver

import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";

const BASE_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1";

export interface FreeParams {
  /* search terms, Solr syntax allowed, max 400 chars */
  q?: string;
  /* WGS84 point to sort results by distance */
  lat?: number;
  lon?: number;
  /* fields to return, space or comma separated */
  fl?: string;
  /* filter queries, e.g. "bron:BAG" or "type:adres" */
  fq?: string[];
  /* default search field */
  df?: string;
  /* field boosts */
  qf?: string;
  /* field value boosts, e.g. "type:gemeente^1.5" */
  bq?: string[];
  /* zero-based index of the first result, max 10000 */
  start?: number;
  /* number of results, max 100 */
  rows?: number;
  sort?: string;
}

/* Same parameters as free; suggest is tuned for type-ahead. */
export type SuggestParams = FreeParams;

export interface LookupParams {
  /* object id, e.g. from a free or suggest result */
  id: string;
  fl?: string;
  fq?: string[];
}

/* A single result. Which fields are present depends on `type` and `fl`. */
export interface LocatieserverDoc {
  id: string;
  type: string;
  weergavenaam: string;
  bron?: string;
  identificatie?: string;
  straatnaam?: string;
  huisnummer?: number;
  huisletter?: string;
  huisnummertoevoeging?: string;
  postcode?: string;
  woonplaatsnaam?: string;
  gemeentenaam?: string;
  provincienaam?: string;
  nummeraanduiding_id?: string;
  adresseerbaarobject_id?: string;
  waterschapsnaam?: string;
  waterschapscode?: string;
  /* WKT, e.g. "POINT(5.12 52.09)" */
  centroide_ll?: string;
  centroide_rd?: string;
  score?: number;
  [field: string]: unknown;
}

export interface LocatieserverResponse {
  response: {
    numFound: number;
    numFoundExact?: boolean;
    start: number;
    maxScore?: number;
    docs: LocatieserverDoc[];
  };
}

/* What the search accepts: an exact address or a whole town or city.
   The Locatieserver ranks a town above addresses, so "Middelburg" gives the
   town and "Abdij 4, Middelburg" still gives the address. */
export const PLACE_FILTER = ["type:(adres OR woonplaats)"];

/* Free search (classic geocoding): results directly from a query. */
export function freeQueryOptions(params: FreeParams) {
  return queryOptions({
    queryKey: ["locatieserver", "free", params],
    queryFn: ({ signal }) => request("free", params, signal),
    enabled: !!params.q,
  });
}

/* Suggest (type-ahead): matches for a partial query, with id and weergavenaam. */
export function suggestQueryOptions(params: SuggestParams) {
  return queryOptions({
    queryKey: ["locatieserver", "suggest", params],
    queryFn: ({ signal }) => request("suggest", params, signal),
    enabled: !!params.q,
    // keep the old list on screen while the next one loads
    placeholderData: keepPreviousData,
  });
}

export function useSuggest(params: SuggestParams, enabled = true) {
  return useQuery({ ...suggestQueryOptions(params), enabled: enabled && !!params.q });
}

/* Lookup a single object by id, including its (simplified) geometry. */
export function lookupQueryOptions(params: LookupParams) {
  return queryOptions({
    queryKey: ["locatieserver", "lookup", params],
    queryFn: ({ signal }) => request("lookup", params, signal),
    enabled: !!params.id,
    // an object id always points to the same object
    staleTime: Infinity,
  });
}

export function useLookup(params: LookupParams) {
  return useQuery(lookupQueryOptions(params));
}

/* "POINT(a b)" -> [a, b], in WKT order: [lon, lat] for centroide_ll,
   [x, y] for centroide_rd. */
export function wktPoint(wkt?: string): [number, number] | undefined {
  const m = wkt?.match(/POINT\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/);
  return m ? [Number(m[1]), Number(m[2])] : undefined;
}

type Params = Record<string, string | number | string[] | undefined>;

async function request(
  path: string,
  params: FreeParams | SuggestParams | LookupParams,
  signal?: AbortSignal,
): Promise<LocatieserverResponse> {
  const url = new URL(`${BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params as Params)) {
    if (value === undefined) continue;
    // fq and bq are exploded: one query parameter per value
    for (const v of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(key, String(v));
    }
  }
  url.searchParams.set("wt", "json");

  const res = await fetch(url, { signal });
  if (!res.ok) {
    // TODO: 400 may be JSON ({ error: { code, msg } }) or plain text
    throw new Error(`Locatieserver ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<LocatieserverResponse>;
}
