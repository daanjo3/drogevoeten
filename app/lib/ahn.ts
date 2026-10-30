// https://service.pdok.nl/rws/actueel-hoogtebestand-nederland/wms/v1_0?request=GetCapabilities&service=WMS
// MapServer WMS of the Actueel Hoogtebestand Nederland (AHN), 0.5 m rasters.
// Heights in m relative to NAP, read with GetFeatureInfo. Sends CORS headers.
//
// Quirks found by probing the service:
// - GetFeatureInfo only answers in the native RD grid (EPSG:28992); CRS:84
//   and EPSG:4326 return an empty FeatureCollection.
// - It returns every raster cell within ~3 screen pixels of (i, j), so the
//   map scale sets the search radius. A 1x1 image returns nothing.
// - The terrain model (DTM) has no data under buildings, and a BAG address
//   point lies inside its building. So we take the nearest cell that has a value.
// - Querying two layers in one request does not say which value is which.

import { queryOptions, useQuery } from "@tanstack/react-query";
import { wktPoint, type LocatieserverDoc } from "./locatieserver";

const BASE_URL = "https://service.pdok.nl/rws/actueel-hoogtebestand-nederland/wms/v1_0";

export type Layer =
  /* Digital Terrain Model: the ground, without buildings and trees */
  | "dtm_05m"
  /* Digital Surface Model: the top of whatever is there (roofs, trees) */
  | "dsm_05m";

/* One raster cell. */
export interface HeightSample {
  /* m relative to NAP */
  value: number;
  /* distance from the requested point to the cell centre, in m */
  distance: number;
  /* cell centre in RD (EPSG:28992) */
  x: number;
  y: number;
}

export interface Height {
  /* ground level (maaiveld) nearest to the point, null if none within ~14 m */
  ground: HeightSample | null;
  /* surface at the point, e.g. the roof for an address; null if no data */
  surface: HeightSample | null;
}

export interface HeightParams {
  /* RD New (EPSG:28992), e.g. from Locatieserver's centroide_rd */
  x?: number;
  y?: number;
}

/* Metres per screen pixel per search step, tried in order until a cell is
   found. With a ~3 px window: 2 -> ±6.5 m (~100 cells, ~20-80 KB),
   4.5 -> ±14 m (~1100 cells, ~200-350 KB, only for large buildings). */
const GROUND_STEPS = [2, 4.5];
/* the surface should be at the point itself: ±1.5 m */
const SURFACE_STEPS = [0.5];
const IMAGE_PX = 51;

export function heightQueryOptions({ x, y }: HeightParams) {
  return queryOptions({
    queryKey: ["ahn", "height", { x, y }],
    queryFn: async ({ signal }): Promise<Height> => {
      const [ground, surface] = await Promise.all([
        nearestSample("dtm_05m", x!, y!, GROUND_STEPS, signal),
        nearestSample("dsm_05m", x!, y!, SURFACE_STEPS, signal),
      ]);
      return { ground, surface };
    },
    enabled: x !== undefined && y !== undefined,
    // the AHN is updated once every few years
    staleTime: Infinity,
  });
}

export function useHeight(params: HeightParams) {
  return useQuery(heightQueryOptions(params));
}

/* Height at a Locatieserver address, via its RD centroid. */
export function useAddressHeight(doc?: LocatieserverDoc) {
  const [x, y] = wktPoint(doc?.centroide_rd) ?? [];
  return useHeight({ x, y });
}

/* The nearest cell with a value, widening the search per step. */
async function nearestSample(
  layer: Layer,
  x: number,
  y: number,
  steps: number[],
  signal?: AbortSignal,
): Promise<HeightSample | null> {
  for (const metresPerPx of steps) {
    const cells = await getFeatureInfo(layer, x, y, metresPerPx, signal);
    let best: HeightSample | null = null;
    for (const c of cells) {
      const distance = Math.hypot(c.x - x, c.y - y);
      if (!best || distance < best.distance) best = { ...c, distance };
    }
    if (best) return best;
  }
  return null;
}

interface FeatureInfoResponse {
  type: "FeatureCollection";
  features: {
    geometry: { type: "Point"; coordinates: [number, number] };
    /* the cell value as text, e.g. "2.030999899" */
    properties: { value_list: string };
  }[];
}

/* All cells with a value around (x, y), centred in an image of IMAGE_PX. */
async function getFeatureInfo(
  layer: Layer,
  x: number,
  y: number,
  metresPerPx: number,
  signal?: AbortSignal,
): Promise<{ x: number; y: number; value: number }[]> {
  const half = (metresPerPx * IMAGE_PX) / 2;
  const centre = Math.floor(IMAGE_PX / 2);
  const url = new URL(BASE_URL);
  url.searchParams.set("service", "WMS");
  url.searchParams.set("version", "1.3.0");
  url.searchParams.set("request", "GetFeatureInfo");
  url.searchParams.set("layers", layer);
  url.searchParams.set("query_layers", layer);
  url.searchParams.set("styles", "");
  // EPSG:28992 axis order is x,y
  url.searchParams.set("crs", "EPSG:28992");
  url.searchParams.set("bbox", `${x - half},${y - half},${x + half},${y + half}`);
  url.searchParams.set("width", String(IMAGE_PX));
  url.searchParams.set("height", String(IMAGE_PX));
  url.searchParams.set("i", String(centre));
  url.searchParams.set("j", String(centre));
  url.searchParams.set("info_format", "application/json");
  // default is 1; we want every cell in the window
  url.searchParams.set("feature_count", "10000");

  const res = await fetch(url, { signal });
  // MapServer reports some errors as a 200 with an XML ServiceExceptionReport
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("json")) {
    const body = await res.text();
    const msg = body.match(/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/)?.[1]?.trim();
    throw new Error(`AHN GetFeatureInfo ${layer} failed: ${res.status} ${msg ?? res.statusText}`);
  }
  const data = (await res.json()) as FeatureInfoResponse;
  return data.features
    .map((f) => ({ x: f.geometry.coordinates[0], y: f.geometry.coordinates[1], value: Number(f.properties.value_list) }))
    .filter((c) => Number.isFinite(c.value));
}
