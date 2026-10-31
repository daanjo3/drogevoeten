/* Our QLever endpoint (qlever/): the Rijksmuseum subset and the Droge Voeten
   linked data (linkeddata/) in one store. Set VITE_SPARQL_URL for another
   one; VITE_RIJKSMUSEUM_SPARQL is the older name of the same setting. */
export const SPARQL_URL: string =
  import.meta.env?.VITE_SPARQL_URL || import.meta.env?.VITE_RIJKSMUSEUM_SPARQL || "http://localhost:7001";

/* Give up on the endpoint after this long, so callers can fall back */
const ENDPOINT_TIMEOUT_MS = 8000;

export type Row = Record<string, string | undefined>;

interface SparqlResults {
  results: { bindings: Record<string, { value: string } | undefined>[] };
}

/* Run a SELECT query at the endpoint and return the rows as plain strings.
   Throws when the endpoint is down, slow or answers with an error, so
   callers can fall back. */
export async function select(query: string, signal?: AbortSignal): Promise<Row[]> {
  const timeout = AbortSignal.timeout(ENDPOINT_TIMEOUT_MS);
  // form-encoded POST: a "simple" CORS request, so no preflight
  const res = await fetch(SPARQL_URL, {
    method: "POST",
    headers: { Accept: "application/sparql-results+json" },
    body: new URLSearchParams({ query }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) {
    throw new Error(`SPARQL failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as SparqlResults;
  return json.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v?.value])));
}

/* Shared pieces for queries on the Droge Voeten linked data */

export interface Point {
  lat: number;
  lon: number;
}

export const PREFIXES = `PREFIX schema: <https://schema.org/>
PREFIX dv: <urn:drogevoeten:def:>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
`;

export const DS = "urn:drogevoeten:dataset:";

export const wkt = ({ lat, lon }: Point) => `"POINT(${Number(lon)} ${Number(lat)})"^^geo:wktLiteral`;

/* The name of a dataset's source, from the catalog */
export const sourceOf = (ds: string) => `VALUES ?ds { <${DS}${ds}> }
  OPTIONAL { ?ds schema:isBasedOn/schema:name ?src }`;

/* ?pt (schema:latitude/longitude) within `km` of p, as ?d in km. The box
   first, so geof:distance only runs on the points close by. */
export function within(p: Point, km: number): string {
  const dLat = km / 111;
  const dLon = km / (111 * Math.cos((p.lat * Math.PI) / 180));
  return `?pt schema:latitude ?lat ; schema:longitude ?lon .
  FILTER(?lat >= ${p.lat - dLat} && ?lat <= ${p.lat + dLat} && ?lon >= ${p.lon - dLon} && ?lon <= ${p.lon + dLon})
  BIND(geof:distance(STRDT(CONCAT("POINT(", STR(?lon), " ", STR(?lat), ")"), geo:wktLiteral), ${wkt(p)}) AS ?d)
  FILTER(?d <= ${km})`;
}
