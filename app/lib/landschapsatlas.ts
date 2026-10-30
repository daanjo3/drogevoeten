// https://services.rce.geovoorziening.nl/landschapsatlas/wfs?request=GetCapabilities
// GeoServer WFS 2.0 of the RCE Landschapsatlas.

import { queryOptions, useQuery } from "@tanstack/react-query";

const BASE_URL = "https://services.rce.geovoorziening.nl/landschapsatlas/wfs";

/* Minimal GeoJSON types; only points are used for now. */
export interface PointGeometry {
  type: "Point";
  /* [lon, lat] */
  coordinates: [number, number];
}

export interface Feature<P> {
  type: "Feature";
  /* GeoServer feature id, e.g. "gemalen.670" */
  id: string;
  geometry: PointGeometry;
  properties: P;
}

export interface FeatureCollection<P> {
  type: "FeatureCollection";
  features: Feature<P>[];
  numberMatched?: number | "unknown";
  numberReturned?: number;
}

/* Feature types we use, see GetCapabilities for the full list. */
export interface LayerProperties {
  "landschapsatlas:gemalen": Gemaal;
  "landschapsatlas:Molens": Molen;
}

export type TypeName = keyof LayerProperties;

/* Geometry column per layer (from DescribeFeatureType), needed in CQL filters. */
const GEOMETRY_COLUMN: Record<TypeName, string> = {
  "landschapsatlas:gemalen": "shape",
  "landschapsatlas:Molens": "the_geom",
};

/* Pumping stations, from the Nederlandse Gemalenstichting. */
export interface Gemaal {
  objectid: number;
  /* gemalen.nl id */
  id: number;
  naam_gemaal: string;
  functie: string;
  /* e.g. "In bedrijf" */
  status: string;
  /* text, may be empty or approximate */
  stichtingsjaar: string;
  plaats: string;
  provincie: string;
  aandrijving_oorspronkelijk: string;
  aandrijving_huidig: string;
  bemalingsgebied: string;
  lozend_op: string;
  bescherming: string;
  /* rijksmonument number, empty if none */
  monumentnr: string;
  infolink: string;
  foto_thumb: string;
  foto_groot: string;
  fotograaf: string;
}

/* Existing mills. Field names are upper case in this layer. */
export interface Molen {
  gid: number;
  NAAM: string;
  PLAATS: string;
  CATEGORIE: string;
  FUNCTIE: string;
  HFDFUNCTIE: string;
  TYPE: string;
  /* e.g. "bestaand" */
  STAAT: string;
  RMONNUMMER: string;
  /* Ten Bruggencate number */
  TBGCNUMMER: string;
  INFOLINK: string;
  THUMBNAIL: string;
  FOTO_GROOT: string;
  FOTOGRAAF: string;
  BOUWJAAR: string;
}

export interface GetFeatureParams<T extends TypeName> {
  typeName: T;
  /* WGS84 [minLat, minLon, maxLat, maxLon] */
  bbox?: [number, number, number, number];
  /* max features, server order (not by distance) */
  count?: number;
  /* GeoServer ECQL filter, e.g. "status='In bedrijf'" */
  cqlFilter?: string;
}

export interface NearParams<T extends TypeName> {
  typeName: T;
  lat?: number;
  lon?: number;
  /* search radius in metres */
  radius: number;
  /* number of nearest features to keep */
  limit: number;
  cqlFilter?: string;
}

export type NearFeature<P> = Feature<P> & {
  /* distance to the search point in metres */
  distance: number;
};

/* Nearest features around a point. The WFS can only filter by bbox, so this
   fetches the bbox around the circle and sorts by distance client side. */
export function nearQueryOptions<T extends TypeName>(params: NearParams<T>) {
  const { typeName, lat, lon, radius, limit, cqlFilter } = params;
  return queryOptions({
    queryKey: ["wfs", "near", params],
    queryFn: async ({ signal }): Promise<NearFeature<LayerProperties[T]>[]> => {
      const fc = await getFeature(
        // a generous count, so the nearest ones are not cut off by the server
        { typeName, bbox: bboxAround(lat!, lon!, radius), count: 1000, cqlFilter },
        signal,
      );
      return fc.features
        .map((f) => ({ ...f, distance: distanceM(lat!, lon!, f.geometry.coordinates[1], f.geometry.coordinates[0]) }))
        .filter((f) => f.distance <= radius)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);
    },
    enabled: lat !== undefined && lon !== undefined,
    // the Landschapsatlas changes rarely
    staleTime: 60 * 60 * 1000,
  });
}

export function useNear<T extends TypeName>(params: NearParams<T>) {
  return useQuery(nearQueryOptions(params));
}

/* Stable link to one feature, for "bron" links. */
export function featureUrl(typeName: TypeName, featureId: string): string {
  const url = new URL(BASE_URL);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", typeName);
  url.searchParams.set("featureID", featureId);
  url.searchParams.set("outputFormat", "application/json");
  return url.toString();
}

async function getFeature<T extends TypeName>(
  params: GetFeatureParams<T>,
  signal?: AbortSignal,
): Promise<FeatureCollection<LayerProperties[T]>> {
  const url = new URL(BASE_URL);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", params.typeName);
  url.searchParams.set("outputFormat", "application/json");
  // GeoJSON output is then [lon, lat]
  url.searchParams.set("srsName", "EPSG:4326");
  if (params.count !== undefined) url.searchParams.set("count", String(params.count));
  if (params.cqlFilter) url.searchParams.set("CQL_FILTER", params.cqlFilter);
  // bbox and CQL_FILTER are exclusive in GeoServer; fold the bbox into the filter
  if (params.bbox) {
    const [minLat, minLon, maxLat, maxLon] = params.bbox;
    if (params.cqlFilter) {
      url.searchParams.set(
        "CQL_FILTER",
        `(${params.cqlFilter}) AND BBOX(${GEOMETRY_COLUMN[params.typeName]},${minLon},${minLat},${maxLon},${maxLat},'CRS:84')`,
      );
    } else {
      // WFS 2.0 with the EPSG urn uses lat/lon axis order
      url.searchParams.set("bbox", `${minLat},${minLon},${maxLat},${maxLon},urn:ogc:def:crs:EPSG::4326`);
    }
  }

  const res = await fetch(url, { signal });
  // GeoServer reports some errors as a 200 with an XML ExceptionReport
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("json")) {
    const body = await res.text();
    const msg = body.match(/<ows:ExceptionText>([\s\S]*?)<\/ows:ExceptionText>/)?.[1];
    throw new Error(`WFS GetFeature ${params.typeName} failed: ${res.status} ${msg ?? res.statusText}`);
  }
  return res.json() as Promise<FeatureCollection<LayerProperties[T]>>;
}

/* WGS84 [minLat, minLon, maxLat, maxLon] around a point. */
export function bboxAround(lat: number, lon: number, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
}

/* Haversine distance in metres. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}
