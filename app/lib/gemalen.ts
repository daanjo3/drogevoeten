/* Pumping stations around a point, from the Droge Voeten linked data
   (linkeddata/) in our QLever endpoint, the same store as the time line:
   - pumping-stations: the Landschapsatlas layer of the RCE, from the
     Nederlandse Gemalenstichting (history: founding year, drive, status,
     gemalen.nl page, photo);
   - water-board-pumping-stations: IMWA, the register of the water boards
     (now: position, function, status, water board).
   The two are not linked in the data yet (linkeddata/DECISIONS.md §29), so
   linkset.ts pairs them on name and distance. */

import { queryOptions, useQuery } from "@tanstack/react-query";
import { DS, PREFIXES, select, within, type Point, type Row } from "./sparql";

/* A gemaal from either dataset */
export interface Station {
  /* the record IRI in the linked data */
  id: string;
  name: string;
  lat: number;
  lon: number;
  /* metres to the search point */
  distance: number;
  /* the source object the record was made from (prov:wasDerivedFrom) */
  derivedFrom?: string;
}

/* From the RCE / Gemalenstichting dataset */
export interface AtlasStation extends Station {
  founded?: string;
  status?: string;
  functions: string[];
  driveThen?: string;
  driveNow?: string;
  outlets: string[];
  /* the gemalen.nl page */
  url?: string;
  photo?: { thumb: string; credit?: string };
}

/* From the IMWA dataset */
export interface ImwaStation extends Station {
  function?: string;
  status?: string;
  maintainer?: string;
}

/* Names the conversion built from other fields, because the source had none */
export const isBuiltName = (name: string) => name.endsWith("(naam onbekend)");

/* The names of a record's terms in one term set, Dutch only */
const terms = (pred: string, set: string, v: string) => `OPTIONAL {
    ?station ${pred} ?${v}T .
    ?${v}T schema:inDefinedTermSet <urn:drogevoeten:termset:${set}> ; schema:name ?${v} .
    FILTER(LANG(?${v}) = "nl")
  }`;

export function atlasQuery(p: Point, km: number): string {
  return `${PREFIXES}
SELECT ?station (SAMPLE(?n) AS ?name) (SAMPLE(?lat) AS ?y) (SAMPLE(?lon) AS ?x) (MIN(?d) AS ?km)
       (SAMPLE(?f) AS ?founded) (SAMPLE(?s) AS ?status) (GROUP_CONCAT(DISTINCT ?fn; separator="|") AS ?functions)
       (SAMPLE(?od) AS ?driveThen) (SAMPLE(?cd) AS ?driveNow) (GROUP_CONCAT(DISTINCT ?out; separator="|") AS ?outlets)
       (SAMPLE(?u) AS ?url) (SAMPLE(?th) AS ?thumb) (SAMPLE(?cr) AS ?credit) (SAMPLE(?from) AS ?derivedFrom) WHERE {
  ?station schema:isPartOf <${DS}pumping-stations> ;
    schema:name ?n ;
    schema:locationCreated/schema:geo ?pt .
  ${within(p, km)}
  OPTIONAL { ?station schema:dateCreated ?f }
  ${terms("schema:creativeWorkStatus", "pumping-station-status", "s")}
  ${terms("schema:additionalType", "pumping-station-function", "fn")}
  ${terms("dv:originalDrive", "drive-type", "od")}
  ${terms("dv:currentDrive", "drive-type", "cd")}
  OPTIONAL { ?station dv:dischargesInto/schema:name ?out }
  OPTIONAL { ?station schema:url ?u }
  OPTIONAL {
    ?station schema:associatedMedia ?img .
    ?img schema:thumbnailUrl ?th .
    OPTIONAL { ?img schema:copyrightNotice ?cr }
  }
  OPTIONAL { ?station prov:wasDerivedFrom ?from }
}
GROUP BY ?station
ORDER BY ?km`;
}

export function imwaQuery(p: Point, km: number): string {
  return `${PREFIXES}
SELECT ?station (SAMPLE(?n) AS ?name) (SAMPLE(?lat) AS ?y) (SAMPLE(?lon) AS ?x) (MIN(?d) AS ?km)
       (SAMPLE(?fn) AS ?function) (SAMPLE(?s) AS ?status) (SAMPLE(?mn) AS ?maintainer)
       (SAMPLE(?from) AS ?derivedFrom) WHERE {
  ?station schema:isPartOf <${DS}water-board-pumping-stations> ;
    schema:name ?n ;
    schema:locationCreated/schema:geo ?pt .
  ${within(p, km)}
  ${terms("schema:additionalType", "imwa-function", "fn")}
  ${terms("schema:creativeWorkStatus", "imwa-status", "s")}
  OPTIONAL { ?station schema:maintainer/schema:name ?mn }
  OPTIONAL { ?station prov:wasDerivedFrom ?from }
}
GROUP BY ?station
ORDER BY ?km`;
}

const list = (v?: string) => (v ? v.split("|").filter(Boolean) : []);

function station(r: Row): Station {
  return {
    id: r.station!,
    name: r.name?.trim() || "Gemaal zonder naam",
    lat: Number(r.y),
    lon: Number(r.x),
    distance: Number(r.km) * 1000,
    derivedFrom: r.derivedFrom,
  };
}

export async function findAtlas(p: Point, km: number, signal?: AbortSignal): Promise<AtlasStation[]> {
  const rows = await select(atlasQuery(p, km), signal);
  return rows.map((r) => ({
    ...station(r),
    founded: r.founded,
    status: r.status,
    functions: list(r.functions),
    driveThen: r.driveThen,
    driveNow: r.driveNow,
    outlets: list(r.outlets),
    url: r.url,
    photo: r.thumb ? { thumb: r.thumb, credit: r.credit } : undefined,
  }));
}

export async function findImwa(p: Point, km: number, signal?: AbortSignal): Promise<ImwaStation[]> {
  const rows = await select(imwaQuery(p, km), signal);
  return rows.map((r) => ({
    ...station(r),
    // "Onbekend" says nothing
    function: r.function && r.function.toLowerCase() !== "onbekend" ? r.function : undefined,
    status: r.status,
    maintainer: r.maintainer,
  }));
}

const options = { retry: false, staleTime: Infinity } as const;

export function atlasQueryOptions(p: Point | undefined, km: number) {
  return queryOptions({
    queryKey: ["gemalen", "atlas", p, km],
    queryFn: ({ signal }) => findAtlas(p!, km, signal),
    enabled: !!p,
    ...options,
  });
}

export function imwaQueryOptions(p: Point | undefined, km: number) {
  return queryOptions({
    queryKey: ["gemalen", "imwa", p, km],
    queryFn: ({ signal }) => findImwa(p!, km, signal),
    enabled: !!p,
    ...options,
  });
}

/* Both datasets around a point: IMWA within km, the RCE dataset a bit wider
   (extraKm), so IMWA gemalen near the edge can still be paired */
export function useGemalen(p: Point | undefined, km: number, extraKm: number) {
  const imwa = useQuery(imwaQueryOptions(p, km));
  const atlas = useQuery(atlasQueryOptions(p, km + extraKm));
  return { imwa, atlas };
}
