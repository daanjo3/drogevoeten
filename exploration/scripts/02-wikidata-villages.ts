// Wikidata: find an item for every backbone village, in a single CONSTRUCT query.
//
// Reads data/backbone/villages.json (or the file given with --villages <path>). The query returns
// items whose label or alias equals a village name or alternative name, plus all submerged
// settlements (Q20616831) in the Netherlands. Candidates are validated by distance to the backbone
// point and ranked by kind of match (name > alternative name > location) and class, so the drowned
// village wins over a present-day municipality with the same name. Candidates found by location
// only are listed as hints but never selected.
//
// Writes data/wikidata/villages.ttl (selected items and all submerged settlements), and the match
// results as data/wikidata/matches.ttl (for SPARQL, see notebooks/wikidata-matches.sparqlbook) and
// data/wikidata/matches.json.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { QueryEngine } from '@comunica/query-sparql';
import type { Quad, Quad_Object } from '@rdfjs/types';
import { DataFactory } from 'n3';
import { fetchWithUserAgent } from './lib/http.ts';
import { readJson, writeJson, writeTurtle } from './lib/io.ts';
import { nameVariants, normalize } from './lib/names.ts';
import { dataPath, queryPath } from './lib/paths.ts';
import type { Village } from './lib/types.ts';
import { PREFIXES, VD, villageIri } from './lib/vocab.ts';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const LANGUAGES = ['nl', 'mul'];
// Backbone points mark approximate locations of villages that no longer exist.
const MAX_DISTANCE_KM = 5;
// Submerged settlements this close are listed as hints, but never selected automatically: drowned
// villages often lie only 1-2 km apart, so a nearby one is usually a neighbour.
const LOCATION_HINT_KM = 2;

const WD = 'http://www.wikidata.org/entity/';
const WDT = 'http://www.wikidata.org/prop/direct/';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const SCHEMA = 'http://schema.org/';
const NETHERLANDS = `${WD}Q55`;
const SUBMERGED_SETTLEMENT = `${WD}Q20616831`;

// Lower is better. Classes not listed get DEFAULT_RANK.
const CLASS_RANK: Record<string, number> = {
  [SUBMERGED_SETTLEMENT]: 0,
  [`${WD}Q22674925`]: 1, // former settlement
  [`${WD}Q74047`]: 1, // ghost town
  [`${WD}Q486972`]: 2, // human settlement
};
const DEFAULT_RANK = 3;
// Items that only have these classes share a village's name but are never the village itself,
// e.g. the present-day municipality of Reimerswaal next to the drowned town.
const EXCLUDED_CLASSES = new Set([
  `${WD}Q2039348`, // municipality of the Netherlands
  `${WD}Q4167410`, // Wikimedia disambiguation page
]);

interface Item {
  iri: string;
  label: string | null;
  labels: Set<string>;
  instanceOf: Set<string>;
  countries: Set<string>;
  coords: [number, number][];
  articles: string[];
}

type CandidateStatus = 'accepted' | 'no-coordinates' | 'rejected';
type MatchKind = 'name' | 'altName' | 'location';

interface Candidate {
  qid: string;
  label: string | null;
  /** How the candidate was found, strongest first: the village name, an alternative name, or location only. */
  match: MatchKind;
  status: CandidateStatus;
  distanceKm: number | null;
  rank: number;
  instanceOf: string[];
  nlwiki: string | null;
}

interface Match {
  id: string;
  name: string;
  /** The selected item; null when nothing or more than one equally good item was accepted. */
  qid: string | null;
  status: 'matched' | 'ambiguous' | 'unconfirmed' | 'not-found';
  candidates: Candidate[];
}

const { values: args } = parseArgs({ options: { villages: { type: 'string' } } });
const villages = await readJson<Village[]>(args.villages ?? dataPath('backbone', 'villages.json'));

const names = [...new Set(villages.flatMap(nameVariants))];
const literals = names.flatMap((name) => LANGUAGES.map((lang) => `${JSON.stringify(name)}@${lang}`));
const query = (await readFile(queryPath('wikidata-villages.rq'), 'utf8')).replace('{{NAMES}}', literals.join(' '));

console.log(`Querying Wikidata for ${names.length} names and all Dutch submerged settlements`);
const engine = new QueryEngine();
const quadStream = await engine.queryQuads(query, {
  sources: [{ type: 'sparql', value: ENDPOINT }],
  fetch: fetchWithUserAgent,
  httpTimeout: 120_000,
});
const quads: Quad[] = await quadStream.toArray();
console.log(`Received ${quads.length} triples`);

// Group the triples per Wikidata item. Classes and admin areas also show up as subjects (with
// their labels), but they have no class or coordinates of their own and never become candidates.
const items = new Map<string, Item>();
const item = (iri: string): Item => {
  let entry = items.get(iri);
  if (!entry) {
    entry = {
      iri,
      label: null,
      labels: new Set(),
      instanceOf: new Set(),
      countries: new Set(),
      coords: [],
      articles: [],
    };
    items.set(iri, entry);
  }
  return entry;
};
for (const { subject, predicate, object } of quads) {
  const s = subject.value;
  switch (predicate.value) {
    case `${SCHEMA}about`:
      item(object.value).articles.push(s);
      break;
    case `${RDFS}label`:
      if (!s.startsWith(WD)) break;
      item(s).labels.add(object.value);
      if (object.termType === 'Literal' && object.language === 'nl') item(s).label = object.value;
      break;
    case `${SKOS}altLabel`:
      if (s.startsWith(WD)) item(s).labels.add(object.value);
      break;
    case `${WDT}P31`:
      item(s).instanceOf.add(object.value);
      break;
    case `${WDT}P17`:
      item(s).countries.add(object.value);
      break;
    case `${WDT}P625`: {
      const point = object.value.match(/Point\(\s*(\S+)\s+(\S+)\s*\)/i);
      if (point) item(s).coords.push([Number(point[1]), Number(point[2])]);
      break;
    }
  }
}

const itemsByName = new Map<string, Set<Item>>();
for (const entry of items.values()) {
  for (const label of entry.labels) {
    const key = normalize(label);
    const set = itemsByName.get(key) ?? new Set<Item>();
    set.add(entry);
    itemsByName.set(key, set);
  }
}
const submerged = [...items.values()].filter((entry) => entry.instanceOf.has(SUBMERGED_SETTLEMENT));

function distanceKm([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

const nearestKm = (village: Village, entry: Item): number | null =>
  entry.coords.length ? Math.min(...entry.coords.map((c) => distanceKm([village.lon, village.lat], c))) : null;

const rankOf = (entry: Item): number =>
  entry.instanceOf.size
    ? Math.min(...[...entry.instanceOf].map((iri) => CLASS_RANK[iri] ?? DEFAULT_RANK))
    : DEFAULT_RANK;

function toCandidate(village: Village, entry: Item, match: MatchKind): Candidate {
  const distance = nearestKm(village, entry);
  const excluded = entry.instanceOf.size > 0 && [...entry.instanceOf].every((iri) => EXCLUDED_CLASSES.has(iri));
  let status: CandidateStatus;
  if (excluded) status = 'rejected';
  else if (distance === null) status = entry.countries.has(NETHERLANDS) ? 'no-coordinates' : 'rejected';
  else status = distance <= MAX_DISTANCE_KM ? 'accepted' : 'rejected';
  return {
    qid: entry.iri.slice(WD.length),
    label: entry.label,
    match,
    status,
    distanceKm: distance === null ? null : Math.round(distance * 100) / 100,
    rank: rankOf(entry),
    instanceOf: [...entry.instanceOf].map((iri) => iri.slice(WD.length)),
    nlwiki: entry.articles.find((a) => a.startsWith('https://nl.wikipedia.org/')) ?? null,
  };
}

const itemsNamed = (names: string[]): Set<Item> =>
  new Set(names.flatMap((name) => [...(itemsByName.get(normalize(name)) ?? [])]));

function findCandidates(village: Village): Candidate[] {
  const byName = itemsNamed(nameVariants({ ...village, altNames: [] }));
  const byAltName = itemsNamed(nameVariants(village));
  const nearby = submerged.filter((entry) => (nearestKm(village, entry) ?? Infinity) <= LOCATION_HINT_KM);
  return [...new Set([...byAltName, ...nearby])].map((entry) =>
    toCandidate(village, entry, byName.has(entry) ? 'name' : byAltName.has(entry) ? 'altName' : 'location'),
  );
}

// Best first: accepted before the rest, then the strongest kind of match, then class rank, then distance.
const statusOrder: Record<CandidateStatus, number> = { accepted: 0, 'no-coordinates': 1, rejected: 2 };
const matchOrder: Record<MatchKind, number> = { name: 0, altName: 1, location: 2 };
const compareCandidates = (a: Candidate, b: Candidate): number =>
  statusOrder[a.status] - statusOrder[b.status] ||
  matchOrder[a.match] - matchOrder[b.match] ||
  a.rank - b.rank ||
  (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);

// Only accepted candidates found by name can be selected. An alternative name often names a successor
// or a building (e.g. "Borssele" for the drowned Monster), so those only count for historical places.
const HISTORICAL_RANK = 1;
const selectable = (candidates: Candidate[]): Candidate[] =>
  candidates.filter(
    (c) => c.status === 'accepted' && (c.match === 'name' || (c.match === 'altName' && c.rank <= HISTORICAL_RANK)),
  );

const matches: Match[] = villages.map((village) => {
  const candidates = findCandidates(village).sort(compareCandidates);
  const [best, second] = selectable(candidates);
  // Two equally strong matches of the same class need a manual check.
  const tied = best && second && best.match === second.match && best.rank === second.rank;
  let status: Match['status'];
  if (best) status = tied ? 'ambiguous' : 'matched';
  // Candidates that were all rejected (e.g. on distance) or only found nearby still deserve a manual look.
  else status = candidates.length ? 'unconfirmed' : 'not-found';
  return { id: village.id, name: village.name, qid: status === 'matched' ? best.qid : null, status, candidates };
});

// Submerged settlements on Wikidata that no backbone village was matched to.
const matchedQids = new Set(matches.map((m) => m.qid).filter((qid) => qid !== null));
const unmatchedSubmerged = submerged
  .filter((entry) => !matchedQids.has(entry.iri.slice(WD.length)))
  .map((entry) => ({
    qid: entry.iri.slice(WD.length),
    label: entry.label,
    coords: entry.coords[0] ?? null,
    nlwiki: entry.articles.find((a) => a.startsWith('https://nl.wikipedia.org/')) ?? null,
  }));

// Keep the triples about selected items (matched, the tied candidates of ambiguous matches, and
// coordinate-less candidates of unconfirmed ones) and all submerged settlements, plus their nlwiki
// articles and the labels of the classes and admin areas they link to.
const selected = (m: Match): Candidate[] => {
  if (m.status === 'matched') return m.candidates.filter((c) => c.qid === m.qid);
  if (m.status === 'ambiguous') {
    const [best] = selectable(m.candidates);
    return selectable(m.candidates).filter((c) => c.match === best.match && c.rank === best.rank);
  }
  return m.candidates.filter((c) => c.status === 'no-coordinates');
};
const keptItems = new Set([
  ...matches.flatMap((m) => selected(m).map((c) => `${WD}${c.qid}`)),
  ...submerged.map((entry) => entry.iri),
]);
const keptArticles = new Set(
  quads
    .filter((q) => q.predicate.value === `${SCHEMA}about` && keptItems.has(q.object.value))
    .map((q) => q.subject.value),
);
const linked = new Set(
  quads.filter((q) => keptItems.has(q.subject.value) && q.object.termType === 'NamedNode').map((q) => q.object.value),
);
const relevant = quads.filter(
  (q) =>
    keptItems.has(q.subject.value) ||
    keptArticles.has(q.subject.value) ||
    (linked.has(q.subject.value) && q.predicate.value === `${RDFS}label`),
);

await writeTurtle(dataPath('wikidata', 'villages.ttl'), relevant, {
  wd: WD,
  wdt: WDT,
  rdfs: RDFS,
  skos: SKOS,
  schema: SCHEMA,
});
await writeJson(dataPath('wikidata', 'matches.json'), { matches, unmatchedSubmerged });

// The match results as RDF: each village with its status, its selected item (skos:exactMatch) and
// all candidates with how they were found.
const { namedNode, literal, blankNode, quad } = DataFactory;
const decimal = namedNode(`${PREFIXES.xsd}decimal`);
const integer = namedNode(`${PREFIXES.xsd}integer`);
const itemLabels = new Map(matches.flatMap((m) => m.candidates.map((c) => [c.qid, c.label] as const)));
const matchQuads: Quad[] = [];
const villageById = new Map(villages.map((v) => [v.id, v]));
for (const m of matches) {
  const village = villageById.get(m.id);
  if (!village) continue;
  const subject = namedNode(villageIri(m.id));
  const add = (predicate: string, object: Quad_Object) => matchQuads.push(quad(subject, namedNode(predicate), object));
  add(`${PREFIXES.rdf}type`, namedNode(`${VD}Village`));
  add(`${RDFS}label`, literal(village.name, 'nl'));
  for (const alt of village.altNames ?? []) add(`${SKOS}altLabel`, literal(alt, 'nl'));
  if (village.municipality) add(`${VD}municipality`, literal(village.municipality));
  add(`${SCHEMA}latitude`, literal(String(village.lat), decimal));
  add(`${SCHEMA}longitude`, literal(String(village.lon), decimal));
  add(`${VD}matchStatus`, literal(m.status));
  if (m.qid) add(`${SKOS}exactMatch`, namedNode(`${WD}${m.qid}`));
  for (const c of m.candidates) {
    const node = blankNode();
    add(`${VD}candidate`, node);
    const addC = (predicate: string, object: Quad_Object) => matchQuads.push(quad(node, namedNode(predicate), object));
    addC(`${VD}item`, namedNode(`${WD}${c.qid}`));
    addC(`${VD}candidateStatus`, literal(c.status));
    addC(`${VD}matchedBy`, literal(c.match));
    addC(`${VD}classRank`, literal(String(c.rank), integer));
    if (c.distanceKm !== null) addC(`${VD}distanceKm`, literal(String(c.distanceKm), decimal));
  }
}
for (const [qid, label] of itemLabels) {
  if (label) matchQuads.push(quad(namedNode(`${WD}${qid}`), namedNode(`${RDFS}label`), literal(label, 'nl')));
}
await writeTurtle(dataPath('wikidata', 'matches.ttl'), matchQuads, PREFIXES);

const count = (status: Match['status']): number => matches.filter((m) => m.status === status).length;
console.log(
  `${matches.length} villages: ${count('matched')} matched, ${count('ambiguous')} ambiguous, ` +
    `${count('unconfirmed')} unconfirmed, ${count('not-found')} not found. ` +
    `${submerged.length} submerged settlements on Wikidata, ${unmatchedSubmerged.length} not matched to a village.`,
);
