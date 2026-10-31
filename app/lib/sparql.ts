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
