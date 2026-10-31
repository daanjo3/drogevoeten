// https://basisinformatie-overstromingen.nl/geoserver/ows
// GeoServer WMS of LIWO (Rijkswaterstaat, made by Deltares): the largest water
// depth at a point over all computed dike breaches. Read with GetFeatureInfo,
// sends CORS headers.
//
// We only use Kaart5, the "extreem kleine kans" class (less than 1/30.000 per
// year), the same map as overstroomik.nl: the app is for children, so one
// "the dike breaks" button instead of five probability classes.
//
// Quirks found by probing the service:
// - No water at a point is GRAY_INDEX -9999, not 0.
// - WMS 1.3.0 with EPSG:4326 wants the bbox as lat,lon.

import { queryOptions, useQuery } from "@tanstack/react-query";

const BASE_URL = "https://basisinformatie-overstromingen.nl/geoserver/ows";
export const LIWO_LAYER = "LIWO_Basis:MaximaleWaterdiepteNederland_Kaart5";
/* depths below this count as dry, like in the prototype */
const DRY_M = 0.02;

/* Water depth above the ground in m, 0 when LIWO has no water here. */
export function liwoQueryOptions(lat?: number, lon?: number) {
  return queryOptions({
    queryKey: ["liwo", LIWO_LAYER, { lat, lon }],
    queryFn: async ({ signal }): Promise<number> => {
      const res = await fetch(featureInfoUrl(lat!, lon!), { signal });
      if (!res.ok) throw new Error(`LIWO GetFeatureInfo failed: ${res.status} ${res.statusText}`);
      const json = (await res.json()) as { features?: { properties?: { GRAY_INDEX?: number | string } }[] };
      const v = Number(json.features?.[0]?.properties?.GRAY_INDEX);
      return Number.isFinite(v) && v > DRY_M ? v : 0;
    },
    enabled: lat !== undefined && lon !== undefined,
    staleTime: Infinity,
  });
}

export function useLiwo(lat?: number, lon?: number) {
  return useQuery(liwoQueryOptions(lat, lon));
}

/* A 3x3 image of about 10 m around the point; we read the middle pixel. */
export function featureInfoUrl(lat: number, lon: number): string {
  const d = 0.00005;
  const url = new URL(BASE_URL);
  url.searchParams.set("SERVICE", "WMS");
  url.searchParams.set("VERSION", "1.3.0");
  url.searchParams.set("REQUEST", "GetFeatureInfo");
  url.searchParams.set("LAYERS", LIWO_LAYER);
  url.searchParams.set("QUERY_LAYERS", LIWO_LAYER);
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
