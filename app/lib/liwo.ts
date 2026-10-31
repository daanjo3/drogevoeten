// https://basisinformatie-overstromingen.nl/geoserver/ows
// GeoServer WMS of LIWO (Rijkswaterstaat, made by Deltares): "maximale
// overstromingsdiepte Nederland", the largest water depth above the ground at
// a point over many computed floods. Read with GetFeatureInfo, sends CORS headers.
//
// From "Technische uitgangspunten en methode LIWO afgeleide kaarten"
// (Deltares 11211536-000-ZWS-0003, 21 November 2025), sections 2.1.1 and 2.3.1:
// - It combines four kinds of flood: outside the dikes (A), a breach of a
//   primary dike (B), a breach of a regional dike (C), and the regional water
//   system (D). So it is not only about dikes breaking.
// - One map per probability class. A map holds every flood at least as likely
//   as its class, so Kaart5 holds them all (the same map as overstroomik.nl).
// - These depth maps are for today: "Deze gevolgkaarten veranderen niet voor
//   de toekomst". Climate change only enters the separate probability maps.
// - Depths can exceed the gap to NAP 0 m: in a storm or with a high river the
//   water outside the dike stands far above mean sea level.
//
// Quirks found by probing the service:
// - No water at a point is GRAY_INDEX -9999, not 0.
// - WMS 1.3.0 with EPSG:4326 wants the bbox as lat,lon.

import { queryOptions, useQuery } from "@tanstack/react-query";

const BASE_URL = "https://basisinformatie-overstromingen.nl/geoserver/ows";

/* The five probability classes. "odds" is the class bound: map n holds the
   floods with a chance of at least 1 in odds per year (map 1: more than 1 in
   30; map 5: all, also below 1 in 30.000). The buttons say how often it happens:
   "label" is the big text, "sub" the small line, "short" the small line in the
   phone dropdown, "often" the range as it reads in the sentence under them. */
export const LIWO_CLASSES = [
  { map: 1, name: "grote kans", probability: "meer dan 1/30 per jaar", label: "Vaak", sub: "vaker dan eens per 30 jaar", short: "30 jaar", often: "vaker dan eens per 30 jaar", odds: "30" },
  { map: 2, name: "middelgrote kans", probability: "1/30 tot 1/300 per jaar", label: "Soms", sub: "eens per 30 tot 300 jaar", short: "300 jaar", often: "eens per 30 tot 300 jaar", odds: "300" },
  { map: 3, name: "kleine kans", probability: "1/300 tot 1/3.000 per jaar", label: "Zelden", sub: "eens per 300 tot 3.000 jaar", short: "3.000 jaar", often: "eens per 300 tot 3.000 jaar", odds: "3.000" },
  { map: 4, name: "zeer kleine kans", probability: "1/3.000 tot 1/30.000 per jaar", label: "Heel zelden", sub: "eens per 3.000 tot 30.000 jaar", short: "30.000 jaar", often: "eens per 3.000 tot 30.000 jaar", odds: "30.000" },
  { map: 5, name: "extreem kleine kans", probability: "minder dan 1/30.000 per jaar", label: "Bijna nooit", sub: "nog minder vaak", short: "nog minder", often: "minder dan eens per 30.000 jaar", odds: null },
] as const;

export type LiwoMap = (typeof LIWO_CLASSES)[number]["map"];

export function liwoClass(map: LiwoMap) {
  return LIWO_CLASSES[map - 1];
}

function layer(map: LiwoMap): string {
  return `LIWO_Basis:MaximaleWaterdiepteNederland_Kaart${map}`;
}

/* depths below this count as dry, like in the prototype */
const DRY_M = 0.02;

/* Water depth above the ground in m, 0 when LIWO has no water here. */
export function liwoQueryOptions(map: LiwoMap, lat?: number, lon?: number) {
  return queryOptions({
    queryKey: ["liwo", map, { lat, lon }],
    queryFn: async ({ signal }): Promise<number> => {
      const res = await fetch(featureInfoUrl(map, lat!, lon!), { signal });
      if (!res.ok) throw new Error(`LIWO GetFeatureInfo failed: ${res.status} ${res.statusText}`);
      const json = (await res.json()) as { features?: { properties?: { GRAY_INDEX?: number | string } }[] };
      const v = Number(json.features?.[0]?.properties?.GRAY_INDEX);
      return Number.isFinite(v) && v > DRY_M ? v : 0;
    },
    enabled: lat !== undefined && lon !== undefined,
    staleTime: Infinity,
  });
}

export function useLiwo(map: LiwoMap, lat?: number, lon?: number) {
  return useQuery(liwoQueryOptions(map, lat, lon));
}

/* A 3x3 image of about 10 m around the point; we read the middle pixel. */
export function featureInfoUrl(map: LiwoMap, lat: number, lon: number): string {
  const d = 0.00005;
  const url = new URL(BASE_URL);
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.3.0");
  url.searchParams.set("REQUEST", "GetFeatureInfo");
  url.searchParams.set("LAYERS", layer(map));
  url.searchParams.set("QUERY_LAYERS", layer(map));
  url.searchParams.set("STYLES", "");
  url.searchParams.set("CRS", "EPSG:4326");
  url.searchParams.set("BBOX", `${lat - d},${lon - d},${lat + d},${lon + d}`);
  url.searchParams.set("WIDTH", "3");
  url.searchParams.set("HEIGHT", "3");
  url.searchParams.set("I", "1");
  url.searchParams.set("J", "1");
  url.searchParams.set("INFO_FORMAT", "application/json");
  return url.toString();
}
