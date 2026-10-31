/* The time line for an address, from the Droge Voeten linked data
   (linkeddata/) in our QLever endpoint. Three moments, as chosen in
   linkeddata/DECISIONS.md §30:
   - the embankment or reclamation of the polder the address lies in;
   - the founding of the pumping stations nearby (3 km);
   - the construction of the dikes nearby (250 m, Zeeland only).
   The queries are the QLever versions of linkeddata/queries/timeline-*.rq
   (DECISIONS §31): QLever has geof:distance, but no geof:sf* inside OPTIONAL
   or on a polygon built in the query, so distances replace the boxes.
   Every step only says what the data says; nothing is filled in. */

import { queryOptions } from "@tanstack/react-query";
import type { TimelineStep } from "../data/place";
import { select, type Row } from "./sparql";

export interface Point {
  lat: number;
  lon: number;
}

/* Search radii, as in the prototype's time line */
export const STATION_KM = 3;
export const DIKE_M = 250;
/* At most this many pumping stations and dikes, so the polder stays in view */
const MAX_STATIONS = 3;
const MAX_DIKES = 3;

const PREFIXES = `PREFIX schema: <https://schema.org/>
PREFIX dv: <urn:drogevoeten:def:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
`;

const wkt = ({ lat, lon }: Point) => `"POINT(${Number(lon)} ${Number(lat)})"^^geo:wktLiteral`;

/* The polder or drained lake the point lies in, and what happened to it. */
export function polderQuery(p: Point): string {
  return `${PREFIXES}
SELECT ?area ?name ?eventType ?start ?end ?dateText ?precision ?source WHERE {
  VALUES ?ds { <urn:drogevoeten:dataset:zeeland-polders> <urn:drogevoeten:dataset:drained-lakes> }
  # drained-lakes also holds the pumping installations: only the areas
  VALUES ?type { <urn:drogevoeten:term:object-type:polder> <urn:drogevoeten:term:object-type:drained-lake> }
  ?area schema:isPartOf ?ds ;
    schema:additionalType ?type ;
    schema:name ?name ;
    geo:hasGeometry/geo:asWKT ?shape .
  FILTER(geof:sfContains(?shape, ${wkt(p)}))
  ?event schema:about ?area ;
    schema:additionalType/schema:name ?eventType .
  FILTER(LANG(?eventType) = "nl")
  OPTIONAL { ?event schema:startDate ?start }
  OPTIONAL { ?event schema:endDate ?end }
  OPTIONAL { ?event dv:dateText ?dateText }
  OPTIONAL { ?event dv:datePrecision ?precision }
  OPTIONAL { ?ds schema:isBasedOn/schema:name ?source }
}`;
}

/* Pumping stations with a founding year within STATION_KM, nearest first,
   with the areas they drain according to the source. */
export function stationsQuery(p: Point): string {
  return `${PREFIXES}
SELECT ?station (SAMPLE(?n) AS ?name) (SAMPLE(?f) AS ?founded) (SAMPLE(?s) AS ?status) (MIN(?d) AS ?km)
       (GROUP_CONCAT(DISTINCT STR(?drains); separator=" ") AS ?drainsAreas) (SAMPLE(?src) AS ?source) WHERE {
  ?station schema:isPartOf <urn:drogevoeten:dataset:pumping-stations> ;
    schema:name ?n ;
    schema:dateCreated ?f ;
    schema:locationCreated/schema:geo ?pt .
  ?pt schema:latitude ?lat ; schema:longitude ?lon .
  BIND(geof:distance(STRDT(CONCAT("POINT(", STR(?lon), " ", STR(?lat), ")"), geo:wktLiteral), ${wkt(p)}) AS ?d)
  FILTER(?d <= ${STATION_KM})
  OPTIONAL { ?station schema:creativeWorkStatus/schema:name ?s . FILTER(LANG(?s) = "nl") }
  OPTIONAL { ?station dv:drainsArea ?drains }
  OPTIONAL { <urn:drogevoeten:dataset:pumping-stations> schema:isBasedOn/schema:name ?src }
}
GROUP BY ?station
ORDER BY ?km`;
}

/* Dikes within DIKE_M with a year, nearest first. Not the original
   function: the source sometimes swaps it with the later one (the
   Ringwalburg has "Straten" as original and "ringwalburg" as later function). */
export function dikesQuery(p: Point): string {
  return `${PREFIXES}
SELECT ?dike (SAMPLE(?n) AS ?name) (SAMPLE(?b) AS ?built) (SAMPLE(?s) AS ?start) (SAMPLE(?e) AS ?end)
       (SAMPLE(?p) AS ?precision) (MIN(?d) AS ?m)
       (GROUP_CONCAT(DISTINCT STR(?polder); separator=" ") AS ?polders) (SAMPLE(?src) AS ?source) WHERE {
  ?dike schema:isPartOf <urn:drogevoeten:dataset:zeeland-dikes> ;
    schema:name ?n ;
    schema:locationCreated/geo:hasGeometry/geo:asWKT ?line .
  BIND(geof:distance(?line, ${wkt(p)}, <http://qudt.org/vocab/unit/M>) AS ?d)
  FILTER(?d <= ${DIKE_M})
  OPTIONAL { ?dike schema:dateCreated ?b }
  OPTIONAL {
    ?event schema:about ?dike ; schema:additionalType <urn:drogevoeten:term:event-type:construction> .
    OPTIONAL { ?event schema:startDate ?s }
    OPTIONAL { ?event schema:endDate ?e }
    OPTIONAL { ?event dv:datePrecision ?p }
  }
  FILTER(BOUND(?b) || BOUND(?s) || BOUND(?e))
  OPTIONAL { ?dike dv:inPolder ?polder }
  OPTIONAL { <urn:drogevoeten:dataset:zeeland-dikes> schema:isBasedOn/schema:name ?src }
}
GROUP BY ?dike
ORDER BY ?m`;
}

/* What the precision labels mean (the values of dv:datePrecision) */
const PRECISION_HELP: Record<string, string> = {
  circa: 'De bron zegt "ca.": ongeveer dit jaar.',
  voor: "De bron geeft een jaar waarvoor het gebeurde.",
  na: "De bron geeft een jaar waarna het gebeurde.",
  periode: "De bron geeft een periode.",
  eeuw: "Alleen de eeuw is bekend.",
  onzeker: "De bron geeft dit jaar met een kanttekening.",
};

/* "0840" (xsd:gYear) -> 840 */
function year(v?: string): number | undefined {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

interface When {
  /* for ordering the steps */
  sort: number;
  label: string;
}

/* The heading of a step, from the dates and the precision of the source.
   A century keeps the source's own text ("11e/12e eeuw"). */
function when(start?: string, end?: string, precision?: string, text?: string): When | undefined {
  const s = year(start);
  const e = year(end);
  const sort = s ?? e;
  if (sort === undefined) return undefined;
  let label: string;
  if (precision === "eeuw" && text) label = text;
  else if (precision === "voor" && e !== undefined) label = `Vóór ${e}`;
  else if (precision === "na" && s !== undefined) label = `Na ${s}`;
  else if (precision === "circa") label = `Ca. ${sort}`;
  else if (s !== undefined && e !== undefined && s !== e) label = `${s}–${e}`;
  else label = String(sort);
  return { sort, label };
}

function sourceTip(source: string | undefined, precision?: string, text?: string): string {
  const parts = [`Bron: ${source ?? "Droge Voeten linked data"}.`];
  if (precision && PRECISION_HELP[precision]) parts.push(PRECISION_HELP[precision]);
  if (text) parts.push(`Jaartekst in de bron: "${text}".`);
  return parts.join(" ");
}

const km = (d: number) => `${d.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km`;
const meters = (d: number) => `${Math.max(10, Math.round(d / 10) * 10)} m`;
/* "Beenhouwersingel,Molenberg" -> "Beenhouwersingel, Molenberg" */
const names = (s: string) => s.replace(/,(?=\S)/g, ", ");
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Step = TimelineStep & { sort: number };

function polderStep(r: Row): Step | undefined {
  const w = when(r.start, r.end, r.precision, r.dateText);
  if (!w || !r.name) return undefined;
  const text =
    r.eventType === "indijking"
      ? `${r.name} wordt ingedijkt. Een [dijk] houdt het water buiten en het land wordt [polder]. Jouw adres ligt in deze polder.`
      : r.eventType === "droogmaking"
        ? `${r.name} wordt drooggemaakt: het water wordt weggepompt en het land wordt [polder]. Jouw adres ligt in deze droogmakerij.`
        : `${capital(r.eventType ?? "gebeurtenis")}: ${r.name}. Jouw adres ligt hier.`;
  return { year: w.label, sort: w.sort, text, source: sourceTip(r.source, r.precision, r.dateText) };
}

function stationStep(r: Row, homeAreas: Set<string>): Step | undefined {
  const w = when(r.founded);
  if (!w || !r.name) return undefined;
  const drainsHome = (r.drainsAreas ?? "").split(" ").some((a) => homeAreas.has(a));
  let text = `[Gemaal] ${r.name} wordt gesticht, op ${km(Number(r.km))} van je adres.`;
  if (drainsHome) text += " Volgens de bron pompt het water uit jouw polder.";
  if (r.status) text += ` Nu: ${r.status.toLowerCase()}.`;
  return { year: w.label, sort: w.sort, text, source: sourceTip(r.source) };
}

function dikeStep(r: Row, homeAreas: Set<string>): Step | undefined {
  const w = when(r.built ?? r.start, r.built ?? r.end, r.built ? undefined : r.precision);
  if (!w || !r.name) return undefined;
  const ofHome = (r.polders ?? "").split(" ").some((a) => homeAreas.has(a));
  let text = `De [dijk] ${names(r.name)} wordt aangelegd, op ${meters(Number(r.m))} van je adres.`;
  if (ofHome) text += " Volgens de bron hoort hij bij jouw polder.";
  return { year: w.label, sort: w.sort, text, source: sourceTip(r.source, r.built ? undefined : r.precision) };
}

/* Shown when the data has nothing for this address */
export const UNKNOWN_STEP: TimelineStep = {
  year: "Onbekend",
  text: "Voor deze plek vinden we geen indijking of droogmaking, en geen gemaal of dijk in de buurt met een jaartal.",
  source: "Bron: Droge Voeten linked data (polders, droogmakerijen, gemalen, dijken).",
};

/* The steps for a point, oldest first. Throws when the endpoint fails. */
export async function findTimeline(p: Point, signal?: AbortSignal): Promise<TimelineStep[]> {
  const [polders, stations, dikes] = await Promise.all([
    select(polderQuery(p), signal),
    select(stationsQuery(p), signal),
    select(dikesQuery(p), signal),
  ]);
  const homeAreas = new Set(polders.map((r) => r.area).filter((a): a is string => !!a));
  // stations that drain the home polder first, then by distance (the query's order)
  const stationSteps = stations
    .map((r) => ({ r, home: (r.drainsAreas ?? "").split(" ").some((a) => homeAreas.has(a)) }))
    .sort((a, b) => Number(b.home) - Number(a.home))
    .slice(0, MAX_STATIONS)
    .map(({ r }) => stationStep(r, homeAreas));
  const steps = [
    ...polders.map(polderStep),
    ...stationSteps,
    ...dikes.slice(0, MAX_DIKES).map((r) => dikeStep(r, homeAreas)),
  ].filter((s): s is Step => !!s);
  steps.sort((a, b) => a.sort - b.sort);
  return steps.length ? steps.map(({ sort: _, ...s }) => s) : [UNKNOWN_STEP];
}

export function timelineQueryOptions(p: Point | undefined) {
  return queryOptions({
    queryKey: ["timeline", p],
    queryFn: ({ signal }) => findTimeline(p!, signal),
    enabled: !!p,
    // no retries: when the endpoint is not running, fall back right away
    retry: false,
    // the data only changes with a new build of linkeddata/
    staleTime: Infinity,
  });
}
