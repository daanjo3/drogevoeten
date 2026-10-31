/* The drainage area of an address and the pumping stations that drain it.
   Ported from drainage() in prototype/app/main.js:
   - area: the smallest IMWA afvoergebied of type Bemalingsgebied or
     Afwateringsgebied (or without type) that contains the address, else the
     smallest peilgebied;
   - pumps: IMWA gemalen in the area or on its edge (up to 15 m), with
     function "Afvoeren" or "Af- en Aanvoeren" and a capacity, largest first.
   That a pump drains the area is our inference: IMWA does not record the
   relation pump <-> area. */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getItems, type ImwaGemaal } from "./imwa";
import type { Feature } from "./landschapsatlas";
import { containsPoint, useAtPoint, type AreaFeature, type AreaGeometry } from "./waterbeheergebieden";

/* pumps on the outline count as part of the area up to this distance */
const EDGE_M = 15;
const DRAIN_FUNCTIONS = ["Afvoeren", "Af- en Aanvoeren"];
const AREA_TYPES = ["Bemalingsgebied", "Afwateringsgebied", null];
/* the scenario shows at most this many pumps, the largest */
export const MAX_PUMPS = 2;

export interface DrainageArea {
  kind: "afvoergebied" | "peilgebied";
  code: string | null;
  naam: string | null;
  waterbeheerder: string | null;
  areaM2: number;
  geometry: AreaGeometry;
}

export interface DrainagePump {
  id: string;
  name: string;
  /* m3 per minute */
  capacity: number;
  waterbeheerder: string | null;
}

export function useDrainage(lat?: number, lon?: number) {
  const afvoer = useAtPoint({ collection: "afvoergebiedaanvoergebied", lat, lon });
  const peil = useAtPoint({ collection: "peilgebied", lat, lon });
  const areasDone = !afvoer.isPending && !peil.isPending;

  // geometries are large; pick once per answer
  const area = useMemo(
    () => (areasDone && lat !== undefined ? pickArea(afvoer.data ?? [], peil.data ?? [], lat) : undefined),
    [areasDone, afvoer.data, peil.data, lat],
  );

  const pumps = useQuery({
    queryKey: ["drainage", "pumps", area?.kind, area?.code, lat, lon],
    queryFn: async ({ signal }): Promise<DrainagePump[]> => {
      const [x0, y0, x1, y1] = bboxOf(area!.geometry);
      // a little margin, so pumps just outside the outline come along
      const m = 0.002;
      const res = await getItems({ collection: "gemaal", bbox: [y0 - m, x0 - m, y1 + m, x1 + m], limit: 1000 }, signal);
      return selectPumps(res.features, area!, lat!);
    },
    enabled: !!area,
    staleTime: 60 * 60 * 1000,
  });

  /* pending: still looking; then area undefined means no area in the open data */
  const isPending = lat === undefined || !areasDone || (!!area && pumps.isPending);
  const isError = (afvoer.isError && peil.isError) || pumps.isError;
  const all = pumps.data ?? [];
  return { isPending, isError, area, pumps: all.slice(0, MAX_PUMPS), pumpsFound: all.length };
}

export function pickArea(
  afvoer: AreaFeature<{ typeafvoeraanvoergebied: string | null; code: string | null; naam: string | null; waterbeheerder: string | null }>[],
  peil: AreaFeature<{ code: string | null; naam: string | null; waterbeheerder: string | null }>[],
  lat: number,
): DrainageArea | undefined {
  const smallest = <P extends { code: string | null; naam: string | null; waterbeheerder: string | null }>(
    fs: AreaFeature<P>[],
    kind: DrainageArea["kind"],
  ) =>
    fs
      .map((f) => ({
        kind,
        code: f.properties.code,
        naam: f.properties.naam,
        waterbeheerder: f.properties.waterbeheerder,
        areaM2: areaM2(f.geometry, lat),
        geometry: f.geometry,
      }))
      .sort((a, b) => a.areaM2 - b.areaM2)[0];
  return (
    smallest(
      afvoer.filter((f) => AREA_TYPES.includes(f.properties.typeafvoeraanvoergebied ?? null)),
      "afvoergebied",
    ) ?? smallest(peil, "peilgebied")
  );
}

/* The gemalen that drain the area, largest first. */
export function selectPumps(features: Feature<ImwaGemaal>[], area: DrainageArea, lat0: number): DrainagePump[] {
  return features
    .filter((f) => f.geometry?.type === "Point")
    .filter((f) => {
      const p = f.properties;
      if (!p.maximalecapaciteit || !DRAIN_FUNCTIONS.includes(p.functiegemaal ?? "")) return false;
      const [lon, lat] = f.geometry.coordinates;
      return containsPoint(area.geometry, lon, lat) || distToEdgeM([lon, lat], area.geometry, lat0) <= EDGE_M;
    })
    .sort((a, b) => (b.properties.maximalecapaciteit ?? 0) - (a.properties.maximalecapaciteit ?? 0))
    .map((f) => ({
      id: f.id,
      name: pumpName(f.properties.naam, f.properties.code),
      capacity: f.properties.maximalecapaciteit!,
      waterbeheerder: f.properties.waterbeheerder,
    }));
}

/* Same fallback as the prototype: "NVT" is no name. */
function pumpName(naam: string | null, code: string | null): string {
  return naam && naam !== "NVT" ? naam : code || "zonder naam";
}

type Position = [number, number];

function polygonsOf(g: AreaGeometry): Position[][][] {
  return g.type === "Polygon" ? [g.coordinates] : g.coordinates;
}

/* Equirectangular projection to metres around lat0; fine at polder scale. */
function project(lat0: number) {
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_574;
  return ([lon, lat]: Position): Position => [lon * kx, lat * ky];
}

/* Area in m2: outer rings minus holes (shoelace). */
function areaM2(g: AreaGeometry, lat0: number): number {
  const p = project(lat0);
  let total = 0;
  for (const rings of polygonsOf(g)) {
    rings.forEach((ring, i) => {
      const r = ring.map(p);
      let s = 0;
      for (let k = 0; k < r.length - 1; k++) s += r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1];
      total += (i ? -1 : 1) * (Math.abs(s) / 2);
    });
  }
  return total;
}

/* Shortest distance in metres from a point to the outline. */
function distToEdgeM(pt: Position, g: AreaGeometry, lat0: number): number {
  const p = project(lat0);
  const [px, py] = p(pt);
  let best = Infinity;
  for (const rings of polygonsOf(g)) {
    for (const ring of rings) {
      const r = ring.map(p);
      for (let k = 0; k < r.length - 1; k++) {
        const [ax, ay] = r[k];
        const [bx, by] = r[k + 1];
        const dx = bx - ax;
        const dy = by - ay;
        const l = dx * dx + dy * dy;
        const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
        best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
      }
    }
  }
  return best;
}

/* [minLon, minLat, maxLon, maxLat] of the outer rings. */
function bboxOf(g: AreaGeometry): [number, number, number, number] {
  let x0 = 180;
  let y0 = 90;
  let x1 = -180;
  let y1 = -90;
  for (const rings of polygonsOf(g)) {
    for (const [x, y] of rings[0]) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return [x0, y0, x1, y1];
}

export type Drainage = ReturnType<typeof useDrainage>;
