// Distances between a backbone point and a WKT geometry (WGS84, longitude first), for matching
// records with geometries. Accurate enough at the scale of Zeeland: the shape is projected onto a
// plane around the point (equirectangular), which is off by well under 1% within tens of kilometres.

type Ring = [number, number][];

const RING = /\(([^()]+)\)/g;

/** The rings (polygon rings, line strings or single points) of a WKT geometry, as [lon, lat] pairs. */
export function wktRings(wkt: string): { rings: Ring[]; polygon: boolean } {
  const body = wkt.replace(/^\s*<[^>]*>\s*/, ''); // an optional CRS IRI
  const polygon = /POLYGON/i.test(body);
  const rings = [...body.matchAll(RING)].map(([, coords]) =>
    coords.split(',').map((pair) => {
      const [lon, lat] = pair.trim().split(/\s+/).map(Number);
      return [lon, lat] as [number, number];
    }),
  );
  return {
    rings: rings.filter((r) => r.length > 0 && r.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))),
    polygon,
  };
}

const EARTH_KM = 6371;

/**
 * The distance in kilometres from a point to a WKT geometry: 0 inside a polygon, otherwise the
 * distance to the nearest edge or point. Null when the WKT has no coordinates.
 */
export function distanceToWktKm([lon, lat]: [number, number], wkt: string): number | null {
  const { rings, polygon } = wktRings(wkt);
  if (rings.length === 0) return null;
  const rad = Math.PI / 180;
  const kx = EARTH_KM * rad * Math.cos(lat * rad);
  const ky = EARTH_KM * rad;
  const project = ([x, y]: [number, number]): [number, number] => [(x - lon) * kx, (y - lat) * ky];

  // Inside a polygon: an odd number of ring crossings (holes count as rings too).
  if (polygon) {
    let inside = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = project(ring[i]);
        const [xj, yj] = project(ring[j]);
        if (yi > 0 !== yj > 0 && 0 < ((xj - xi) * (0 - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return 0;
  }

  let best = Number.POSITIVE_INFINITY;
  for (const ring of rings) {
    const points = ring.map(project);
    if (points.length === 1) best = Math.min(best, Math.hypot(points[0][0], points[0][1]));
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1];
      const [bx, by] = points[i];
      const [dx, dy] = [bx - ax, by - ay];
      const length2 = dx * dx + dy * dy;
      const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2));
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}
