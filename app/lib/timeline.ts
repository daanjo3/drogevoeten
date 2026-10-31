/* The time line for an address, from the Droge Voeten linked data
   (linkeddata/) in our QLever endpoint. The same moments as the time line of
   the prototype (prototype/app/timeline.js), as far as they are linked data
   (linkeddata/DECISIONS.md §30–§32):
   - the embankment or reclamation of the polder the address lies in, with
     the polder level and literature of a drained lake;
   - land consolidation of the area the address lies in;
   - the dikes nearby (250 m, Zeeland only) and their state now;
   - drowned villages nearby (3 km, Zeeland only);
   - the mills within 1 km: how many polder mills stood here, the oldest, the
     last one to disappear, and polder mills that still stand;
   - the 3 pumping stations nearest by (3 km), with their drive then and
     now, also those without a founding year;
   - dike-breach pools within 1 km;
   - a gift house after the 1953 flood: the house itself, or those within 500 m.
   Not here, because they are no linked data (yet): the Waterstaatskaart, the
   1953 flood map of Noord-Brabant and the polder names map of Zeeland.

   The queries are QLever versions of linkeddata/queries/timeline-*.rq
   (DECISIONS §31): QLever has geof:distance, but no geof:sf* inside OPTIONAL
   or on a polygon built in the query, so distances replace the boxes, and
   each point-in-polygon test is a query of its own.
   Every step only says what the data says; nothing is filled in. */

import { queryOptions } from "@tanstack/react-query";
import type { TimelineStep } from "../data/place";
import type { LocatieserverDoc } from "./locatieserver";
import { select, type Row } from "./sparql";

export interface Point {
  lat: number;
  lon: number;
}

/* The address as the gift houses name it: "Malmöweg 5", "Den Bommel" */
export interface Address {
  street: string;
  locality: string;
}

/* Search radii, as in the prototype's time line */
export const STATION_KM = 3;
export const DIKE_M = 250;
export const MILL_KM = 1;
export const VILLAGE_KM = 3;
export const POOL_KM = 1;
export const GIFT_KM = 0.5;
/* At most this many of each, so the polder stays in view */
const MAX_STATIONS = 3;
const MAX_DIKES = 3;
const MAX_STANDING_MILLS = 2;
const MAX_VILLAGES = 2;
const MAX_POOLS = 2;

const PREFIXES = `PREFIX schema: <https://schema.org/>
PREFIX dv: <urn:drogevoeten:def:>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
`;

const DS = "urn:drogevoeten:dataset:";
const EVENT = "urn:drogevoeten:term:event-type:";
const POLDER_MILL = "<urn:drogevoeten:term:drainage-structure:poldermolen>";

const wkt = ({ lat, lon }: Point) => `"POINT(${Number(lon)} ${Number(lat)})"^^geo:wktLiteral`;

/* The name of a dataset's source, from the catalog */
const sourceOf = (ds: string) => `VALUES ?ds { <${DS}${ds}> }
  OPTIONAL { ?ds schema:isBasedOn/schema:name ?src }`;

/* ?pt (schema:latitude/longitude) within `km` of p, as ?d in km. The box
   first, so geof:distance only runs on the points close by. */
function within(p: Point, km: number): string {
  const dLat = km / 111;
  const dLon = km / (111 * Math.cos((p.lat * Math.PI) / 180));
  return `?pt schema:latitude ?lat ; schema:longitude ?lon .
  FILTER(?lat >= ${p.lat - dLat} && ?lat <= ${p.lat + dLat} && ?lon >= ${p.lon - dLon} && ?lon <= ${p.lon + dLon})
  BIND(geof:distance(STRDT(CONCAT("POINT(", STR(?lon), " ", STR(?lat), ")"), geo:wktLiteral), ${wkt(p)}) AS ?d)
  FILTER(?d <= ${km})`;
}

/* An event of one type about ?subject, with its dates as ?<v>Start,
   ?<v>End, ?<v>Precision and ?<v>Text */
function event(subject: string, type: string, v: string): string {
  return `OPTIONAL {
    ?${v}Event schema:about ?${subject} ; schema:additionalType <${EVENT}${type}> .
    OPTIONAL { ?${v}Event schema:startDate ?${v}S }
    OPTIONAL { ?${v}Event schema:endDate ?${v}E }
    OPTIONAL { ?${v}Event dv:datePrecision ?${v}P }
    OPTIONAL { ?${v}Event dv:dateText ?${v}T }
  }`;
}
const eventVars = (v: string) =>
  `(SAMPLE(?${v}S) AS ?${v}Start) (SAMPLE(?${v}E) AS ?${v}End) (SAMPLE(?${v}P) AS ?${v}Precision) (SAMPLE(?${v}T) AS ?${v}Text)`;

/* The polder or drained lake the point lies in, and what happened to it.
   Grouped per event: a drained lake can have more than one citation. */
export function polderQuery(p: Point): string {
  return `${PREFIXES}
SELECT ?area ?event (SAMPLE(?n) AS ?name) (SAMPLE(?et) AS ?eventType) (SAMPLE(?s) AS ?start) (SAMPLE(?e) AS ?end)
       (SAMPLE(?t) AS ?dateText) (SAMPLE(?pr) AS ?precision) (SAMPLE(?wl) AS ?waterLevel)
       (GROUP_CONCAT(DISTINCT ?c; separator="; ") AS ?citations) (SAMPLE(?src) AS ?source) WHERE {
  VALUES ?ds { <${DS}zeeland-polders> <${DS}drained-lakes> }
  # drained-lakes also holds the pumping installations: only the areas
  VALUES ?type { <urn:drogevoeten:term:object-type:polder> <urn:drogevoeten:term:object-type:drained-lake> }
  ?area schema:isPartOf ?ds ;
    schema:additionalType ?type ;
    schema:name ?n ;
    geo:hasGeometry/geo:asWKT ?shape .
  FILTER(geof:sfContains(?shape, ${wkt(p)}))
  ?event schema:about ?area ;
    schema:additionalType/schema:name ?et .
  FILTER(LANG(?et) = "nl")
  OPTIONAL { ?event schema:startDate ?s }
  OPTIONAL { ?event schema:endDate ?e }
  OPTIONAL { ?event dv:dateText ?t }
  OPTIONAL { ?event dv:datePrecision ?pr }
  OPTIONAL { ?area dv:waterLevel ?wl }
  OPTIONAL { ?area schema:citation ?c }
  OPTIONAL { ?ds schema:isBasedOn/schema:name ?src }
}
GROUP BY ?area ?event`;
}

/* The land consolidation project the point lies in, with its milestones */
export function landQuery(p: Point): string {
  return `${PREFIXES}
SELECT ?area (SAMPLE(?n) AS ?name) (SAMPLE(?f) AS ?form) (SAMPLE(?st) AS ?status)
       ${eventVars("exec")} ${eventVars("deed")} ${eventVars("done")} (SAMPLE(?src) AS ?source) WHERE {
  ?area schema:isPartOf <${DS}land-consolidation> ;
    schema:name ?n ;
    geo:hasGeometry/geo:asWKT ?shape .
  FILTER(geof:sfContains(?shape, ${wkt(p)}))
  OPTIONAL {
    ?area schema:additionalType ?ft .
    ?ft schema:inDefinedTermSet <urn:drogevoeten:termset:land-consolidation-form> ; schema:name ?f .
  }
  OPTIONAL { ?area dv:status/schema:name ?st }
  ${event("area", "execution", "exec")}
  ${event("area", "deed", "deed")}
  ${event("area", "completion", "done")}
  ${sourceOf("land-consolidation")}
}
GROUP BY ?area`;
}

/* Pumping stations within STATION_KM, nearest first, with their founding
   year (if known), the areas they drain and their drive then and now. */
export function stationsQuery(p: Point): string {
  return `${PREFIXES}
SELECT ?station (SAMPLE(?n) AS ?name) (SAMPLE(?f) AS ?founded) (SAMPLE(?s) AS ?status) (MIN(?d) AS ?km)
       (SAMPLE(?od) AS ?driveThen) (SAMPLE(?cd) AS ?driveNow)
       (GROUP_CONCAT(DISTINCT STR(?drains); separator=" ") AS ?drainsAreas) (SAMPLE(?src) AS ?source) WHERE {
  ?station schema:isPartOf <${DS}pumping-stations> ;
    schema:name ?n ;
    schema:locationCreated/schema:geo ?pt .
  ${within(p, STATION_KM)}
  OPTIONAL { ?station schema:dateCreated ?f }
  OPTIONAL { ?station schema:creativeWorkStatus/schema:name ?s . FILTER(LANG(?s) = "nl") }
  OPTIONAL { ?station dv:originalDrive/schema:name ?od . FILTER(LANG(?od) = "nl") }
  OPTIONAL { ?station dv:currentDrive/schema:name ?cd . FILTER(LANG(?cd) = "nl") }
  OPTIONAL { ?station dv:drainsArea ?drains }
  ${sourceOf("pumping-stations")}
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
       (SAMPLE(?p) AS ?precision) (SAMPLE(?st) AS ?status) (MIN(?d) AS ?m)
       (GROUP_CONCAT(DISTINCT STR(?polder); separator=" ") AS ?polders) (SAMPLE(?src) AS ?source) WHERE {
  ?dike schema:isPartOf <${DS}zeeland-dikes> ;
    schema:name ?n ;
    schema:locationCreated/geo:hasGeometry/geo:asWKT ?line .
  BIND(geof:distance(?line, ${wkt(p)}, <http://qudt.org/vocab/unit/M>) AS ?d)
  FILTER(?d <= ${DIKE_M})
  OPTIONAL { ?dike schema:dateCreated ?b }
  OPTIONAL {
    ?event schema:about ?dike ; schema:additionalType <${EVENT}construction> .
    OPTIONAL { ?event schema:startDate ?s }
    OPTIONAL { ?event schema:endDate ?e }
    OPTIONAL { ?event dv:datePrecision ?p }
  }
  FILTER(BOUND(?b) || BOUND(?s) || BOUND(?e))
  OPTIONAL { ?dike schema:creativeWorkStatus/schema:name ?st . FILTER(LANG(?st) = "nl") }
  OPTIONAL { ?dike dv:inPolder ?polder }
  ${sourceOf("zeeland-dikes")}
}
GROUP BY ?dike
ORDER BY ?m`;
}

/* Mills within MILL_KM, lost and standing, nearest first. ?polderMill is
   set when the source calls it a polder mill (main category or function). */
export function millsQuery(p: Point): string {
  return `${PREFIXES}
SELECT ?mill ?ds (SAMPLE(?n) AS ?name) (SAMPLE(?pm) AS ?polderMill) (SAMPLE(?b) AS ?built)
       ${eventVars("built")} ${eventVars("gone")}
       (SAMPLE(?st) AS ?status) (SAMPLE(?u) AS ?url) (MIN(?d) AS ?km) (SAMPLE(?src) AS ?source) WHERE {
  VALUES ?ds { <${DS}lost-windmills> <${DS}windmills> }
  ?mill schema:isPartOf ?ds ;
    schema:name ?n ;
    schema:locationCreated/schema:geo ?pt .
  ${within(p, MILL_KM)}
  OPTIONAL { ?mill schema:additionalType ${POLDER_MILL} . BIND(true AS ?pm) }
  OPTIONAL { ?mill schema:dateCreated ?b }
  ${event("mill", "construction", "built")}
  ${event("mill", "disappearance", "gone")}
  OPTIONAL { ?mill schema:creativeWorkStatus/schema:name ?st . FILTER(LANG(?st) = "nl") }
  OPTIONAL { ?mill schema:url ?u }
  OPTIONAL { ?ds schema:isBasedOn/schema:name ?src }
}
GROUP BY ?mill ?ds
ORDER BY ?km`;
}

/* Drowned villages within VILLAGE_KM, nearest first, one row per drowning */
export function villagesQuery(p: Point): string {
  return `${PREFIXES}
SELECT ?village ?event (SAMPLE(?n) AS ?name) (GROUP_CONCAT(DISTINCT ?alt; separator=", ") AS ?altNames)
       (SAMPLE(?s) AS ?start) (SAMPLE(?e) AS ?end) (SAMPLE(?pr) AS ?precision) (SAMPLE(?t) AS ?dateText)
       (MIN(?d) AS ?km) (SAMPLE(?src) AS ?source) WHERE {
  ?village schema:isPartOf <${DS}drowned-villages> ;
    schema:name ?n ;
    schema:geo ?pt .
  ${within(p, VILLAGE_KM)}
  OPTIONAL { ?village schema:alternateName ?alt }
  OPTIONAL {
    ?event schema:about ?village ; schema:additionalType <${EVENT}drowning> .
    OPTIONAL { ?event schema:startDate ?s }
    OPTIONAL { ?event schema:endDate ?e }
    OPTIONAL { ?event dv:datePrecision ?pr }
    OPTIONAL { ?event dv:dateText ?t }
  }
  ${sourceOf("drowned-villages")}
}
GROUP BY ?village ?event
ORDER BY ?km`;
}

/* Dike-breach pools within POOL_KM, nearest first */
export function poolsQuery(p: Point): string {
  return `${PREFIXES}
SELECT ?pool (SAMPLE(?n) AS ?name) (SAMPLE(?t) AS ?type) (SAMPLE(?r) AS ?river)
       ${eventVars("breach")} (MIN(?d) AS ?km) (SAMPLE(?src) AS ?source) WHERE {
  ?pool schema:isPartOf <${DS}breach-pools> ;
    schema:name ?n ;
    schema:geo ?pt .
  ${within(p, POOL_KM)}
  OPTIONAL {
    ?pool schema:additionalType ?tt .
    ?tt schema:inDefinedTermSet <urn:drogevoeten:termset:breach-pool-type> ; schema:name ?t .
  }
  OPTIONAL { ?pool dv:alongRiver/schema:name ?r }
  ${event("pool", "dike-breach", "breach")}
  ${sourceOf("breach-pools")}
}
GROUP BY ?pool
ORDER BY ?km`;
}

/* Gift houses within GIFT_KM, nearest first, with their address, so the
   app can find the house at the address itself */
export function giftsQuery(p: Point): string {
  return `${PREFIXES}
SELECT ?house (SAMPLE(?n) AS ?name) (SAMPLE(?sa) AS ?street) (SAMPLE(?lo) AS ?locality)
       (GROUP_CONCAT(DISTINCT ?c; separator=", ") AS ?countries) (SAMPLE(?b) AS ?built)
       ${eventVars("built")} (MIN(?d) AS ?km) (SAMPLE(?src) AS ?source) WHERE {
  ?house schema:isPartOf <${DS}gift-houses-1953> ;
    schema:name ?n ;
    schema:locationCreated ?loc .
  ?loc schema:geo ?pt .
  ${within(p, GIFT_KM)}
  OPTIONAL {
    ?loc schema:address ?a .
    OPTIONAL { ?a schema:streetAddress ?sa }
    OPTIONAL { ?a schema:addressLocality ?lo }
  }
  OPTIONAL { ?house dv:donatedBy/schema:name ?c . FILTER(LANG(?c) = "nl") }
  OPTIONAL { ?house schema:dateCreated ?b }
  ${event("house", "construction", "built")}
  ${sourceOf("gift-houses-1953")}
}
GROUP BY ?house
ORDER BY ?km`;
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

/* A certain year (dateCreated) or else the event with the prefix v */
function whenOf(r: Row, certain: string | undefined, v: string): When | undefined {
  return certain ? when(certain) : when(r[`${v}Start`], r[`${v}End`], r[`${v}Precision`], r[`${v}Text`]);
}
const precisionOf = (r: Row, certain: string | undefined, v: string) => (certain ? undefined : r[`${v}Precision`]);

function sourceTip(source: string | undefined, precision?: string, text?: string, extra?: string): string {
  const parts = [`Bron: ${source ?? "Droge Voeten linked data"}.`];
  if (precision && PRECISION_HELP[precision]) parts.push(PRECISION_HELP[precision]);
  if (text) parts.push(`Jaartekst in de bron: "${text}".`);
  if (extra) parts.push(extra);
  return parts.join(" ");
}

const distance = (km: number) =>
  km < 1
    ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m`
    : `${km.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km`;
const meters = (m: number) => distance(m / 1000);
/* "Beenhouwersingel,Molenberg" -> "Beenhouwersingel, Molenberg" */
const names = (s: string) => s.replace(/,(?=\S)/g, ", ");
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/* Some mill names in the Molendatabase hold html */
const plain = (s?: string) => (s ?? "").replace(/<[^>]+>/g, "").trim();
/* "Noorwegen, Zweden, Denemarken" -> "Noorwegen, Zweden en Denemarken" */
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} en ${xs[xs.length - 1]}` : xs[0] ?? "");

/* sort: Infinity for a step without a year; those go last */
type Step = TimelineStep & { sort: number };
const UNDATED = "Onbekend";

function undated(text: string, source: string): Step {
  return { year: UNDATED, sort: Infinity, text, source };
}

function polderStep(r: Row): Step | undefined {
  const w = when(r.start, r.end, r.precision, r.dateText);
  if (!w || !r.name) return undefined;
  let text =
    r.eventType === "indijking"
      ? `${r.name} wordt ingedijkt. Een [dijk] houdt het water buiten en het land wordt [polder]. Jouw adres ligt in deze polder.`
      : r.eventType === "droogmaking"
        ? `${r.name} wordt drooggemaakt: het water wordt weggepompt en het land wordt [polder]. Jouw adres ligt in deze droogmakerij.`
        : `${capital(r.eventType ?? "gebeurtenis")}: ${r.name}. Jouw adres ligt hier.`;
  if (r.waterLevel) text += ` Het polderpeil is volgens de bron ${r.waterLevel}.`;
  const literature = r.citations ? `Literatuur: ${r.citations}.` : undefined;
  return { year: w.label, sort: w.sort, text, source: sourceTip(r.source, r.precision, r.dateText, literature) };
}

/* No polder or drained lake: say so, as the prototype does */
const NO_POLDER_STEP = undated(
  "Wanneer deze plek is ingedijkt of drooggemaakt, weten we niet. De kaarten die we gebruiken dekken deze plek niet. Dat zegt niet dat hier geen [polder] is.",
  "Bron: Droge Voeten linked data (polders van de Provincie Zeeland, droogmakerijen van de RCE).",
);

function landStep(r: Row): Step | undefined {
  if (!r.name) return undefined;
  const w = when(r.execStart, r.execEnd, r.execPrecision, r.execText);
  const deed = year(r.deedStart ?? r.deedEnd);
  const done = year(r.doneStart ?? r.doneEnd);
  let text = `${r.form ?? "Landinrichting"}: ${r.name}. Kavels, sloten en wegen worden opnieuw ingedeeld. Jouw adres ligt in dit gebied.`;
  const later = [deed && `volgt de akte in ${deed}`, done && `wordt het project in ${done} afgesloten`].filter(Boolean);
  if (later.length) text += ` Volgens de bron ${list(later as string[])}.`;
  const tip = sourceTip(r.source, r.execPrecision, undefined, r.status ? `Status: ${r.status}.` : undefined);
  return w ? { year: w.label, sort: w.sort, text, source: tip } : undated(text, tip);
}

function stationStep(r: Row, homeAreas: Set<string>): Step | undefined {
  if (!r.name) return undefined;
  const w = when(r.founded);
  const drainsHome = (r.drainsAreas ?? "").split(" ").some((a) => homeAreas.has(a));
  let text = `[Gemaal] ${r.name} wordt gesticht, op ${distance(Number(r.km))} van je adres.`;
  if (drainsHome) text += " Volgens de bron pompt het water uit jouw polder.";
  const then = r.driveThen?.toLowerCase();
  const now = r.driveNow?.toLowerCase();
  if (then && now === "geen") text += ` Het werkte eerst op ${then}; nu heeft het geen aandrijving meer.`;
  else if (then && now && then !== now) text += ` Het werkte eerst op ${then}, nu op ${now}.`;
  else if (then) text += ` Aandrijving: ${then}.`;
  if (r.status) text += ` Nu: ${r.status.toLowerCase()}.`;
  if (!w) return undated(`${text} Wanneer het gesticht is, staat niet in de bron.`, sourceTip(r.source));
  return { year: w.label, sort: w.sort, text, source: sourceTip(r.source) };
}

function dikeStep(r: Row, homeAreas: Set<string>): Step | undefined {
  const w = when(r.built ?? r.start, r.built ?? r.end, r.built ? undefined : r.precision);
  if (!w || !r.name) return undefined;
  const ofHome = (r.polders ?? "").split(" ").some((a) => homeAreas.has(a));
  let text = `De [dijk] ${names(r.name)} wordt aangelegd, op ${meters(Number(r.m))} van je adres.`;
  if (ofHome) text += " Volgens de bron hoort hij bij jouw polder.";
  if (r.status) text += ` Nu: ${r.status.toLowerCase()}.`;
  return { year: w.label, sort: w.sort, text, source: sourceTip(r.source, r.built ? undefined : r.precision) };
}

function villageStep(r: Row): Step | undefined {
  if (!r.name) return undefined;
  const w = when(r.start, r.end, r.precision, r.dateText);
  let text = `Het dorp ${r.name} verdrinkt: de zee neemt het land terug. Het lag op ${distance(Number(r.km))} van je adres.`;
  if (r.altNames) text += ` Ook bekend als ${r.altNames}.`;
  const tip = sourceTip(r.source, r.precision, r.dateText);
  return w ? { year: w.label, sort: w.sort, text, source: tip } : undated(text, tip);
}

/* The lost polder mills: how many, the oldest, and the last one to go.
   Without polder mills, the other lost mills as one step without a year. */
function lostMillSteps(rows: Row[]): Step[] {
  const polder = rows.filter((r) => r.polderMill);
  const other = rows.length - polder.length;
  const source = rows[0]?.source;
  if (!polder.length) {
    return other
      ? [
          undated(
            `Binnen ${MILL_KM} km zijn geen [poldermolens] bekend. Wel verdwenen hier ${other} andere ${other === 1 ? "molen" : "molens"} (koren, olie, zaag), die geen water verzetten.`,
            sourceTip(source),
          ),
        ]
      : [];
  }
  const built = polder
    .map((r) => ({ r, w: whenOf(r, r.built, "built") }))
    .filter((x): x is { r: Row; w: When } => !!x.w)
    .sort((a, b) => a.w.sort - b.w.sort);
  const gone = polder
    .map((r) => ({ r, w: when(r.goneStart, r.goneEnd, r.gonePrecision, r.goneText) }))
    .filter((x): x is { r: Row; w: When } => !!x.w)
    .sort((a, b) => b.w.sort - a.w.sort);
  const n = polder.length;
  let text = `Binnen ${MILL_KM} km van je adres ${n === 1 ? "stond 1 [poldermolen]" : `stonden ${n} [poldermolens]`}. Ze pompten het water uit de polder.`;
  const oldest = built[0];
  if (oldest) text += ` De oudste met een bekend bouwjaar: ${plain(oldest.r.name)}.`;
  text += n === 1 ? " Hij is verdwenen." : " Ze zijn allemaal verdwenen.";
  if (other) text += ` Ook ${other} andere ${other === 1 ? "molen" : "molens"} (koren, olie, zaag) verdwenen hier.`;
  const first = oldest ? oldest.r : undefined;
  const tip = sourceTip(source, first && precisionOf(first, first.built, "built"), first?.builtText);
  const steps: Step[] = [oldest ? { year: oldest.w.label, sort: oldest.w.sort, text, source: tip } : undated(text, tip)];
  const last = gone[0];
  if (last) {
    steps.push({
      year: last.w.label,
      sort: last.w.sort,
      text: `De laatste [poldermolen] hier verdwijnt: ${plain(last.r.name)}, op ${distance(Number(last.r.km))} van je adres.`,
      source: sourceTip(source, last.r.gonePrecision, last.r.goneText),
    });
  }
  return steps;
}

/* A polder mill that still stands */
function standingMillStep(r: Row): Step {
  const w = whenOf(r, r.built, "built");
  let text = `De [poldermolen] ${plain(r.name)} wordt gebouwd, op ${distance(Number(r.km))} van je adres.`;
  // the statuses of the RCE layer: bestaand, herbouwd, restant, in aanbouw
  const status = r.status?.toLowerCase();
  if (status === "bestaand") text += " Hij staat er nog.";
  else if (status === "herbouwd") text += " Hij is herbouwd en staat er weer.";
  else if (status === "restant") text += " Er staat nog een restant van.";
  else if (status) text += ` Nu: ${status}.`;
  const tip = sourceTip(r.source, precisionOf(r, r.built, "built"), r.built ? undefined : r.builtText);
  return w ? { year: w.label, sort: w.sort, text, source: tip } : undated(text, tip);
}

/* Pools with the same name, type and river ("Wiel bij Krimpen aan de Lek
   (naam onbekend)" twice) become one step; the nearest gives the year. */
function poolSteps(rows: Row[]): Step[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = [r.name, r.type, r.river].join("|");
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].slice(0, MAX_POOLS).map((g) => {
    const r = g[0];
    const n = g.length;
    const w = when(r.breachStart, r.breachEnd, r.breachPrecision, r.breachText);
    const type = (r.type ?? "wiel").toLowerCase();
    const what =
      n === 1
        ? `${r.name}, een ${type} op ${distance(Number(r.km))} van je adres${r.river ? `, langs de ${r.river}` : ""}`
        : `${n}× ${r.name}, vanaf ${distance(Number(r.km))} van je adres${r.river ? `, langs de ${r.river}` : ""}`;
    const kolk = n === 1 ? "een diepe kolk" : `${n} diepe kolken`;
    const text = w
      ? `Een dijk breekt door. Het water slaat ${kolk} uit: ${what}. Zo'n kolk heet een [wiel].`
      : `Hier brak ooit een dijk door. Het water sloeg ${kolk} uit: ${what}. Zo'n kolk heet een [wiel]. Wanneer, staat niet in de bron.`;
    const tip = sourceTip(r.source, r.breachPrecision, r.breachText);
    return w ? { year: w.label, sort: w.sort, text, source: tip } : undated(text, tip);
  });
}

/* "Malmöweg 5" and "malmöweg  5" are the same address */
const norm = (s?: string) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/* The gift house at the address itself, or else those nearby as one step */
function giftSteps(rows: Row[], address?: Address): Step[] {
  if (!rows.length) return [];
  const own = address
    ? rows.find((r) => norm(r.street) === norm(address.street) && norm(r.locality) === norm(address.locality))
    : undefined;
  if (own) {
    const w = whenOf(own, own.built, "built");
    const from = own.countries ? ` uit ${list(own.countries.split(", "))}` : "";
    const text = `Je huis is een geschenk${from}. Na de watersnoodramp van 1953 gaven andere landen huizen aan de mensen die alles kwijt waren. Dit is zo'n [geschenkwoning].`;
    const tip = sourceTip(own.source, precisionOf(own, own.built, "built"), own.built ? undefined : own.builtText);
    return [w ? { year: w.label, sort: w.sort, text, source: tip } : undated(text, tip)];
  }
  const countries = [...new Set(rows.flatMap((r) => (r.countries ? r.countries.split(", ") : [])))];
  const dated = rows
    .map((r) => whenOf(r, r.built, "built"))
    .filter((w): w is When => !!w)
    .sort((a, b) => a.sort - b.sort);
  const n = rows.length;
  let text = `Binnen ${distance(GIFT_KM)} van je adres ${n === 1 ? "staat 1 [geschenkwoning]" : `staan ${n} [geschenkwoningen]`}: huizen die andere landen gaven na de watersnoodramp van 1953.`;
  if (countries.length) text += ` Ze komen uit ${list(countries)}.`;
  const tip = sourceTip(rows[0].source, undefined, undefined, dated.length ? "Het jaar is dat van de oudste woning." : undefined);
  return [dated[0] ? { year: dated[0].label, sort: dated[0].sort, text, source: tip } : undated(text, tip)];
}

/* Shown when the data has nothing for this address */
export const UNKNOWN_STEP: TimelineStep = {
  year: "Onbekend",
  text: "Voor deze plek vinden we geen indijking of droogmaking, en in de buurt geen dijk, molen, gemaal of wiel met een jaartal.",
  source: "Bron: Droge Voeten linked data (polders, droogmakerijen, landinrichting, dijken, molens, gemalen, wielen).",
};

/* The steps for a point, oldest first, steps without a year last. Throws
   when the endpoint fails. */
export async function findTimeline(p: Point, address?: Address, signal?: AbortSignal): Promise<TimelineStep[]> {
  const [polders, lands, stations, dikes, mills, villages, pools, gifts] = await Promise.all(
    [polderQuery, landQuery, stationsQuery, dikesQuery, millsQuery, villagesQuery, poolsQuery, giftsQuery].map((q) =>
      select(q(p), signal),
    ),
  );
  const homeAreas = new Set(polders.map((r) => r.area).filter((a): a is string => !!a));
  // stations that drain the home polder first, then by distance (the query's order)
  const stationSteps = stations
    .map((r) => ({ r, home: (r.drainsAreas ?? "").split(" ").some((a) => homeAreas.has(a)) }))
    .sort((a, b) => Number(b.home) - Number(a.home))
    .slice(0, MAX_STATIONS)
    .map(({ r }) => stationStep(r, homeAreas));
  const lost = mills.filter((r) => r.ds === `${DS}lost-windmills`);
  const standing = mills.filter((r) => r.ds === `${DS}windmills` && r.polderMill).slice(0, MAX_STANDING_MILLS);
  // one step per village: its earliest drowning
  const firstDrowning = new Map<string, Row>();
  for (const r of [...villages].sort((a, b) => (year(a.start ?? a.end) ?? 1e9) - (year(b.start ?? b.end) ?? 1e9)))
    if (r.village && !firstDrowning.has(r.village)) firstDrowning.set(r.village, r);
  const nearestVillages = [...firstDrowning.values()].sort((a, b) => Number(a.km) - Number(b.km)).slice(0, MAX_VILLAGES);

  const history = [
    ...polders.map(polderStep),
    ...lands.map(landStep),
    ...dikes.slice(0, MAX_DIKES).map((r) => dikeStep(r, homeAreas)),
    ...nearestVillages.map(villageStep),
    ...lostMillSteps(lost),
    ...standing.map(standingMillStep),
    ...stationSteps,
    ...poolSteps(pools),
    ...giftSteps(gifts, address),
  ].filter((s): s is Step => !!s);
  if (!history.length) return [UNKNOWN_STEP];
  const steps = homeAreas.size ? history : [...history, NO_POLDER_STEP];
  // stable sort: steps in the same year keep the order above
  steps.sort((a, b) => a.sort - b.sort);
  return steps.map(({ sort: _, ...s }) => s);
}

/* The street address and locality of a Locatieserver address, as the gift
   houses write them: "Hoofdweg 569A-1", "Hoofddorp" */
export function addressOf(doc?: LocatieserverDoc): Address | undefined {
  if (!doc?.straatnaam || doc.huisnummer === undefined || !doc.woonplaatsnaam) return undefined;
  const number = `${doc.huisnummer}${doc.huisletter ?? ""}${doc.huisnummertoevoeging ? `-${doc.huisnummertoevoeging}` : ""}`;
  return { street: `${doc.straatnaam} ${number}`, locality: doc.woonplaatsnaam };
}

export function timelineQueryOptions(p: Point | undefined, address?: Address) {
  return queryOptions({
    queryKey: ["timeline", p, address],
    queryFn: ({ signal }) => findTimeline(p!, address, signal),
    enabled: !!p,
    // no retries: when the endpoint is not running, fall back right away
    retry: false,
    // the data only changes with a new build of linkeddata/
    staleTime: Infinity,
  });
}
