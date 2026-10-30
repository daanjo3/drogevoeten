// https://api.pdok.nl/hwh/waterschappen-waterbeheergebieden-imwa/ogc/v1
// OGC API Features of the IMWA water management areas of the water boards.
// GeoJSON in CRS84 ([lon, lat]) by default, sends CORS headers.
//
// Quirks found by probing the service:
// - bbox selects every area that touches the box, so neighbours come along;
//   we keep only the areas that contain the point (point in polygon).
// - A zero-size bbox is a 400; we use a box of about 1 m.
// - Some water boards publish a peilgebied twice, as "Praktijk" (the level
//   kept in practice) and "Vigerend" (the level in the peilbesluit), with
//   nearly the same outline.
// - Geometries are detailed: one peilgebied is 3-210 KB, all peilgebieden in
//   a 5 km radius up to 13 MB. So fetch per point, not per map view.

import { queryOptions, useQuery } from "@tanstack/react-query";

const BASE_URL = "https://api.pdok.nl/hwh/waterschappen-waterbeheergebieden-imwa/ogc/v1";

/* [lon, lat] */
type Position = [number, number];
/* outer ring first, then holes */
type PolygonCoords = Position[][];

export type AreaGeometry =
  | { type: "Polygon"; coordinates: PolygonCoords }
  | { type: "MultiPolygon"; coordinates: PolygonCoords[] };

export interface AreaFeature<P> {
  type: "Feature";
  id: string;
  geometry: AreaGeometry;
  properties: P;
}

/* Fields shared by all collections. Most can be null. */
interface AreaBase {
  /* water board code, e.g. "GPG437" */
  code: string | null;
  naam: string | null;
  guid: string | null;
  nen3610id: string | null;
  /* e.g. "gerealiseerd" */
  statusobject: string | null;
  /* e.g. "Waterschap Scheldestromen" */
  waterbeheerder: string | null;
  /* a web page, e.g. the published peilbesluit */
  url: string | null;
  opmerking: string | null;
  objectbegintijd: string | null;
  tijdstipregistratie: string | null;
  [field: string]: unknown;
}

/* An area in which one water level is maintained. */
export interface Peilgebied extends AreaBase {
  /* "Praktijk" or "Vigerend" */
  statuspeilgebied: string | null;
  peilbesluitgebiedid: string | null;
}

/* The area covered by one peilbesluit (decision on the water levels). */
export type Peilbesluitgebied = AreaBase;

/* A drainage (or supply) area, from small to whole river basins. */
export interface Afvoergebied extends AreaBase {
  /* e.g. "Afwateringsgebied", "Deelstroomgebied" */
  typeafvoeraanvoergebied: string | null;
  /* m2 */
  oppervlakte: number | null;
}

/* Collections we use, see /collections for the full list. */
export interface CollectionProperties {
  peilgebied: Peilgebied;
  peilbesluitgebied: Peilbesluitgebied;
  afvoergebiedaanvoergebied: Afvoergebied;
  peilafwijkinggebied: AreaBase;
}

export type CollectionId = keyof CollectionProperties;

export interface ItemsResponse<P> {
  type: "FeatureCollection";
  features: AreaFeature<P>[];
  numberReturned?: number;
  links?: { rel: string; href: string }[];
}

export interface AtPointParams<C extends CollectionId> {
  collection: C;
  lat?: number;
  lon?: number;
}

/* The areas of one collection that contain the point. */
export function atPointQueryOptions<C extends CollectionId>(params: AtPointParams<C>) {
  const { collection, lat, lon } = params;
  return queryOptions({
    queryKey: ["waterbeheergebieden", "atPoint", params],
    queryFn: async ({ signal }): Promise<AreaFeature<CollectionProperties[C]>[]> => {
      // about 1 m around the point
      const d = 0.00001;
      const res = await getItems(collection, [lon! - d, lat! - d, lon! + d, lat! + d], signal);
      return res.features.filter((f) => containsPoint(f.geometry, lon!, lat!));
    },
    enabled: lat !== undefined && lon !== undefined,
    // the register changes rarely
    staleTime: 60 * 60 * 1000,
  });
}

export function useAtPoint<C extends CollectionId>(params: AtPointParams<C>) {
  return useQuery(atPointQueryOptions(params));
}

/* The peilgebied of a point: the "Praktijk" one when a water board
   publishes both, since that is the level actually kept. */
export function usePeilgebied(lat?: number, lon?: number) {
  const q = useAtPoint({ collection: "peilgebied", lat, lon });
  const all = q.data ?? [];
  const peilgebied = all.find((f) => f.properties.statuspeilgebied === "Praktijk") ?? all[0];
  return { ...q, peilgebied };
}

/* Polygon rings as Leaflet positions ([lat, lon]), for <Polygon positions>. */
export function toLatLngs(g: AreaGeometry): [number, number][][][] {
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polygons.map((rings) => rings.map((ring) => ring.map(([lon, lat]) => [lat, lon])));
}

/* Even-odd point in polygon; holes are rings too, so they count out. */
function containsPoint(g: AreaGeometry, lon: number, lat: number): boolean {
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polygons.some((rings) => rings.filter((ring) => inRing(ring, lon, lat)).length % 2 === 1);
}

function inRing(ring: Position[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

async function getItems<C extends CollectionId>(
  collection: C,
  /* CRS84 minLon, minLat, maxLon, maxLat */
  bbox: [number, number, number, number],
  signal?: AbortSignal,
): Promise<ItemsResponse<CollectionProperties[C]>> {
  const url = new URL(`${BASE_URL}/collections/${collection}/items`);
  url.searchParams.set("f", "json");
  // a handful overlap a point; a high limit so none is cut off
  url.searchParams.set("limit", "100");
  url.searchParams.set("bbox", bbox.join(","));

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Waterbeheergebieden ${collection} items failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<ItemsResponse<CollectionProperties[C]>>;
}
