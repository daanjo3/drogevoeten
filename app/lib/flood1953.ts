/* Did this place flood in 1953? From the flood map of Provincie Noord-Brabant
   ("Historische Inundatie Ramp 1953"), as a static GeoJSON file made by
   app/scripts/flood_1953.py. Not linked data on purpose (DECISIONS §33).

   The map only covers Noord-Brabant, and says nothing about depth. Outside
   its areas we say nothing: not being on the map does not mean it stayed dry. */

import { useQuery } from "@tanstack/react-query";
import type { LocatieserverDoc } from "./locatieserver";
import { locationOf } from "./rijksmuseum";

interface Point {
  lat: number;
  lon: number;
}

export const FLOOD_URL = `${import.meta.env?.BASE_URL ?? "/"}data/flood-1953-noord-brabant.geojson`;

type Ring = number[][];
interface FloodFeature {
  properties: { salt?: string };
  geometry: { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
}
interface FloodMap {
  publisher: string;
  metadata: string;
  features: FloodFeature[];
}

export interface Flood {
  /* "zout" or "zoet", as the source says */
  salt?: string;
  publisher: string;
  metadata: string;
}

/* Even-odd ray casting over all rings, so holes count as outside */
function inPolygon({ lat, lon }: Point, rings: Ring[]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

let map: Promise<FloodMap> | undefined;
function loadMap(): Promise<FloodMap> {
  map ??= fetch(FLOOD_URL).then((res) => {
    if (!res.ok) throw new Error(`flood map: HTTP ${res.status}`);
    return res.json() as Promise<FloodMap>;
  });
  // try again next time after a failure
  map.catch(() => (map = undefined));
  return map;
}

/* The flooded area the point lies in, or null */
export async function findFlood1953(p: Point): Promise<Flood | null> {
  const m = await loadMap();
  for (const f of m.features) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    if (polys.some((rings) => inPolygon(p, rings)))
      return { salt: f.properties.salt, publisher: m.publisher, metadata: m.metadata };
  }
  return null;
}

/* The flooded area for an address, for the address panel. A failed load
   counts as "nothing to say": the panel shows no flood text then. */
export function useFlood1953(doc?: LocatieserverDoc) {
  const loc = locationOf(doc);
  const p = loc && { lat: loc.lat, lon: loc.lon };
  return useQuery({
    queryKey: ["flood1953", p],
    queryFn: () => findFlood1953(p!).catch(() => null),
    enabled: !!p,
    staleTime: Infinity,
  });
}
