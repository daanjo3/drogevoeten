/* Rijksmuseum images from the local N-Triples file, queried in the browser
   with Comunica. Only the test page uses this: it is a separate module so the
   query engine and the N3 parser (well over a megabyte of JavaScript) stay out
   of the app's main bundle and don't start on every page load. The app itself
   asks the SPARQL endpoint (rijksmuseum.ts). */

import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { Parser, Store } from "n3";
import { DATA_URL, imagesQuery, toImage, type ImagesOptions, type Location, type RijksImage } from "./rijksmuseum";

let storePromise: Promise<Store> | undefined;

/* Parse the N-Triples file once per page load. */
export function loadStore(text?: string): Promise<Store> {
  storePromise ??= (async () => {
    const body = text ?? (await (await fetch(DATA_URL)).text());
    return new Store(new Parser({ format: "N-Triples" }).parse(body));
  })();
  return storePromise;
}

let engine: QueryEngine | undefined;

/* Comunica over the local N-Triples file. */
export async function findImages(loc: Location, options?: ImagesOptions): Promise<RijksImage[]> {
  const store = await loadStore();
  engine ??= new QueryEngine();
  const stream = await engine.queryBindings(imagesQuery(loc, options), { sources: [store] });
  const rows = await stream.toArray();
  return rows.map((b) => toImage((name) => b.get(name)?.value));
}
