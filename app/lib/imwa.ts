// https://api.pdok.nl/hwh/waterschappen-kunstwerken-imwa/ogc/v2
// OGC API Features of IMWA, the register of structures of the water boards.
// GeoJSON in CRS84 ([lon, lat]) by default, sends CORS headers.

import { queryOptions, useQuery } from "@tanstack/react-query";
import { bboxAround, distanceM, type Feature, type NearFeature } from "./landschapsatlas";

const BASE_URL = "https://api.pdok.nl/hwh/waterschappen-kunstwerken-imwa/ogc/v2";

/* Collections we use. */
export interface CollectionProperties {
  gemaal: ImwaGemaal;
}

export type CollectionId = keyof CollectionProperties;

/* A pumping station as registered by the water board. Most fields can be null. */
export interface ImwaGemaal {
  naam: string | null;
  /* water board code, e.g. "KGM77" */
  code: string | null;
  guid: string | null;
  nen3610id: string | null;
  /* e.g. "Onderbemalen", "Afvoeren", "Onbekend" */
  functiegemaal: string | null;
  /* m3 per minute */
  maximalecapaciteit: number | null;
  /* e.g. "gerealiseerd" */
  statusobject: string | null;
  /* e.g. "Waterschap Scheldestromen" */
  waterbeheerder: string | null;
  url: string | null;
  opmerking: string | null;
  [field: string]: unknown;
}

export interface ItemsResponse<P> {
  type: "FeatureCollection";
  features: Feature<P>[];
  numberReturned?: number;
  links?: { rel: string; href: string }[];
}

export interface ItemsParams<C extends CollectionId> {
  collection: C;
  /* WGS84 [minLat, minLon, maxLat, maxLon], same order as in landschapsatlas.ts */
  bbox?: [number, number, number, number];
  /* max features per page; the server accepts at least 1000 */
  limit?: number;
}

export interface NearParams<C extends CollectionId> {
  collection: C;
  lat?: number;
  lon?: number;
  /* search radius in metres */
  radius: number;
  /* number of nearest features to keep */
  limit: number;
}

/* Nearest features around a point: fetch the bbox around the circle, then
   sort by distance client side. */
export function nearQueryOptions<C extends CollectionId>(params: NearParams<C>) {
  const { collection, lat, lon, radius, limit } = params;
  return queryOptions({
    queryKey: ["imwa", "near", params],
    queryFn: async ({ signal }): Promise<NearFeature<CollectionProperties[C]>[]> => {
      // one page; a 5 km bbox holds a few dozen gemalen at most
      const res = await getItems({ collection, bbox: bboxAround(lat!, lon!, radius), limit: 1000 }, signal);
      return res.features
        .map((f) => ({ ...f, distance: distanceM(lat!, lon!, f.geometry.coordinates[1], f.geometry.coordinates[0]) }))
        .filter((f) => f.distance <= radius)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);
    },
    enabled: lat !== undefined && lon !== undefined,
    // the register changes rarely
    staleTime: 60 * 60 * 1000,
  });
}

export function useNear<C extends CollectionId>(params: NearParams<C>) {
  return useQuery(nearQueryOptions(params));
}

/* Stable link to one feature: "html" is the readable page (the item's
   rel=alternate text/html link), "json" the GeoJSON. */
export function itemUrl(collection: CollectionId, id: string, format: "html" | "json" = "json"): string {
  return `${BASE_URL}/collections/${collection}/items/${encodeURIComponent(id)}?f=${format}`;
}

export async function getItems<C extends CollectionId>(
  params: ItemsParams<C>,
  signal?: AbortSignal,
): Promise<ItemsResponse<CollectionProperties[C]>> {
  const url = new URL(`${BASE_URL}/collections/${params.collection}/items`);
  url.searchParams.set("f", "json");
  if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
  if (params.bbox) {
    // OGC API bbox is minLon,minLat,maxLon,maxLat in CRS84
    const [minLat, minLon, maxLat, maxLon] = params.bbox;
    url.searchParams.set("bbox", `${minLon},${minLat},${maxLon},${maxLat}`);
  }

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`IMWA ${params.collection} items failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<ItemsResponse<CollectionProperties[C]>>;
}
