/* Rijksmuseum images for a location, queried with Comunica over a local
   N-Triples file. The file is a slim schema.org view of the harvest, made by
   qlever/rijksmuseum/slim.py (the Rijksmuseum has no SPARQL endpoint). */

import { QueryEngine } from "@comunica/query-sparql-rdfjs-lite";
import { Parser, Store } from "n3";

export const DATA_URL = `${import.meta.env?.BASE_URL ?? "/"}data/rijksmuseum-water.nt`;

/* Themes are Iconclass subtrees. Iconclass codes are hierarchical by prefix,
   so "25H199" also covers 25H1991 (dike-break) and 25H1992 (rescue work). */
export const THEMES = {
  flood: [
    "25H199", // flood, dike-break, rescue work during a flood
    "25H23122", // flood, high tide
  ],
  infrastructure: [
    "25H2171", // dikes, levee
    "25H192", // polder; 25H1921 pumping installation, 25H1922 pumping-engine details
    "25H193", // draining for land reclamation
    "25H22", // canal, lock, dam, sluice, weir, ditch
  ],
} as const;
export type Theme = keyof typeof THEMES;

/* How many images per theme. Infrastructure only gets objects that are not
   also flood images, so the two lists never overlap. */
export const DEFAULT_LIMITS: Record<Theme, number> = { flood: 5, infrastructure: 1 };

/* Radius for "near", in km. Museum points are per town (Getty TGN). */
export const NEAR_KM = 20;

export const RANK_LABELS: Record<number, string> = {
  1: "woonplaats of gemeente",
  2: `binnen ${NEAR_KM} km`,
  3: "provincie",
  4: "Nederland",
};

export interface Location {
  lat: number;
  lon: number;
  /* woonplaats and gemeente from the Locatieserver */
  places: string[];
  province?: string;
}

export interface RijksImage {
  object: string;
  theme: Theme;
  rank: number;
  /* approximate distance to the nearest depicted place with a point */
  km?: number;
  title: string;
  year?: number;
  /* IIIF Image API base, e.g. https://iiif.micr.io/bopoG */
  iiif: string;
  page?: string;
  license?: string;
  objectNumber?: string;
  depicts: string;
}

/* Same normalisation as slim.py's match_name: lowercase, no "(provincie)". */
export function matchName(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, "").trim().toLowerCase();
}

/* PDOK uses the Frisian name; the museum's thesaurus the Dutch one. */
const PROVINCE_ALIASES: Record<string, string> = { "fryslân": "friesland" };

const lit = (s: string) => JSON.stringify(s);

/* dv:iconclassCode lists a term's own code and every broader one (slim.py),
   so "under 25H199" is an exact join instead of a string filter. */
function themeFilter(theme: Theme, v: string): string {
  const roots = THEMES[theme].map(lit).join(" ");
  return `VALUES ?${v}Root { ${roots} }
    ?${v}Ic dv:iconclassCode ?${v}Root .
    ?object schema:about ?${v}Ic .`;
}

/* Rank of each depicted place: 1 woonplaats/gemeente (or inside it),
   2 within NEAR_KM, 3 inside the province, 4 "Nederland" as a whole.
   Distance is approximate: SPARQL has no square root, so it uses
   alpha-max-beta-min (at most ~4% off), good enough to sort by. */
function rankPatterns(loc: Location): string {
  const kmLon = 111.32 * Math.cos((loc.lat * Math.PI) / 180);
  const dist = (lat: string, lon: string) =>
    `IF(ABS(${lon} - ${loc.lon}) * ${kmLon.toFixed(3)} > ABS(${lat} - ${loc.lat}) * 111.2,
        0.96 * ABS(${lon} - ${loc.lon}) * ${kmLon.toFixed(3)} + 0.4 * ABS(${lat} - ${loc.lat}) * 111.2,
        0.96 * ABS(${lat} - ${loc.lat}) * 111.2 + 0.4 * ABS(${lon} - ${loc.lon}) * ${kmLon.toFixed(3)})`;
  const places = [...new Set(loc.places.map(matchName))].map(lit).join(" ") || '""';
  const province = loc.province ? matchName(loc.province) : "";
  const provinceName = PROVINCE_ALIASES[province] ?? province;
  // Rank the few hundred places once, then join the objects that depict them
  return `{ SELECT ?place (MIN(?placeTier) AS ?tier) (MIN(?placeKm) AS ?d) WHERE {
    {
      # VALUES, not FILTER IN, and bind the town before the zero-length path:
      # both are orders of magnitude faster in Comunica
      VALUES ?townName { ${places} }
      ?town dv:matchName ?townName .
      ?place schema:containedInPlace? ?town .
      BIND(1 AS ?placeTier)
    } UNION {
      ?place schema:latitude ?nearLat ; schema:longitude ?nearLon .
      FILTER(${dist("?nearLat", "?nearLon")} <= ${NEAR_KM})
      BIND(2 AS ?placeTier)
    } UNION {
      ?region dv:regionName ${lit(provinceName)} .
      ?place schema:containedInPlace? ?region .
      BIND(3 AS ?placeTier)
    } UNION {
      VALUES ?place { <https://id.rijksmuseum.nl/2301> }
      BIND(4 AS ?placeTier)
    }
    OPTIONAL {
      ?place schema:latitude ?lat ; schema:longitude ?lon .
      BIND(${dist("?lat", "?lon")} AS ?placeKm)
    }
    } GROUP BY ?place }
    ?object schema:contentLocation ?place .`;
}

const OPEN_LICENSES = ["https://creativecommons.org/publicdomain/mark/1.0/", "https://creativecommons.org/publicdomain/zero/1.0/"];

export interface ImagesOptions {
  limits?: Record<Theme, number>;
  /* only images the app may show: Public Domain Mark or CC0 (default true) */
  openOnly?: boolean;
}

function bucket(loc: Location, theme: Theme, limit: number, openOnly: boolean): string {
  // flood is the main theme; other themes skip flood images so lists don't overlap
  // MINUS works on the whole set; FILTER NOT EXISTS reruns a query per row
  const exclude = theme === "flood" ? "" : `MINUS { ${themeFilter("flood", "not")} }`;
  const open = openOnly
    ? `?object schema:license ?openLicense . VALUES ?openLicense { ${OPEN_LICENSES.map((l) => `<${l}>`).join(" ")} }`
    : "";
  // Grouped by title: prints often exist in several impressions with the same title.
  // ?best is "tier object", so its MIN is the best-ranked object of the group.
  return `{
    SELECT (MIN(CONCAT(STR(?tier), " ", STR(?object))) AS ?best) ?theme (MIN(?tier) AS ?rank) (MIN(COALESCE(?d, 9999)) AS ?km) WHERE {
    ${rankPatterns(loc)}
    ${themeFilter(theme, "in")}
    ${exclude}
    ${open}
    ?object schema:name ?groupTitle .
    BIND(${lit(theme)} AS ?theme)
    }
    GROUP BY ?groupTitle ?theme
    ORDER BY ?rank ?km ?groupTitle
    LIMIT ${limit}
  }`;
}

/* One query: the best `limits[theme]` objects per theme, nearest first. */
export function imagesQuery(loc: Location, { limits = DEFAULT_LIMITS, openOnly = true }: ImagesOptions = {}): string {
  const buckets = (Object.keys(limits) as Theme[])
    .filter((t) => limits[t] > 0)
    .map((t) => bucket(loc, t, limits[t], openOnly));
  return `PREFIX schema: <https://schema.org/>
PREFIX dv: <https://w3id.org/drogevoeten/def#>

SELECT ?object ?theme ?rank ?km ?title ?year ?image ?page ?license ?number
       (GROUP_CONCAT(DISTINCT ?placeName; separator=", ") AS ?depicts)
WHERE {
  ${buckets.join("\n  UNION\n  ")}
  BIND(IRI(STRAFTER(?best, " ")) AS ?object)
  ?object schema:name ?title ; schema:image ?image .
  OPTIONAL { ?object dv:year ?year }
  OPTIONAL { ?object schema:url ?page }
  OPTIONAL { ?object schema:license ?license }
  OPTIONAL { ?object schema:identifier ?number }
  OPTIONAL { ?object schema:contentLocation/schema:name ?placeName }
}
GROUP BY ?object ?theme ?rank ?km ?title ?year ?image ?page ?license ?number
ORDER BY ?theme ?rank ?km`;
}

let storePromise: Promise<Store> | undefined;

/* Parse the N-Triples file once per page load. */
export function loadStore(text?: string): Promise<Store> {
  storePromise ??= (async () => {
    const body = text ?? (await (await fetch(DATA_URL)).text());
    return new Store(new Parser({ format: "N-Triples" }).parse(body));
  })();
  return storePromise;
}

const engine = new QueryEngine();

export async function findImages(loc: Location, options?: ImagesOptions): Promise<RijksImage[]> {
  const store = await loadStore();
  const stream = await engine.queryBindings(imagesQuery(loc, options), { sources: [store] });
  const rows = await stream.toArray();
  return rows.map((b) => {
    const v = (name: string) => b.get(name)?.value;
    const km = Number(v("km"));
    return {
      object: v("object")!,
      theme: v("theme") as Theme,
      rank: Number(v("rank")),
      km: km < 9999 ? km : undefined,
      title: v("title")!,
      year: v("year") ? Number(v("year")) : undefined,
      iiif: v("image")!,
      page: v("page"),
      license: v("license"),
      objectNumber: v("number"),
      depicts: v("depicts") ?? "",
    };
  });
}
