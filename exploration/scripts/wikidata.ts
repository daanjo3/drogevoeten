// Wikidata: find an item for every backbone village, in a single CONSTRUCT query.
//
// Reads data/backbone/villages.json (or the file given with --villages <path>). The query returns
// items whose label or alias equals a name from the name index (backbone names and alternative
// names, also without number, and the names from the Wikipedia list), plus all submerged
// settlements (Q20616831) in the Netherlands. Matching follows the SOP:
// - a name match within MAX_DISTANCE_KM of the backbone point is place-geo; without coordinates it is
//   place-name and needs review; farther away it is rejected;
// - items that are only a municipality or a disambiguation page are rejected (class);
// - an alternative name only counts for submerged or former settlements, because alternative names
//   often name a successor or a building (e.g. "Borssele" for the drowned Monster);
// - submerged settlements within LOCATION_HINT_KM without a matching name are location candidates,
//   which always need review: drowned villages often lie only 1-2 km apart;
// - the best candidate (name before alternative name, then name origin, then class, then distance)
//   is accepted; a tie between equally strong candidates needs review.
//
// Writes data/wikidata/villages.ttl (accepted and review items, and all submerged settlements),
// matches.ttl and matches.json (all candidates), homonyms.json (names that are also present-day
// places, used by the other steps), and accepted.ttl, and rebuilds data/combined.ttl.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { QueryEngine } from '@comunica/query-sparql';
import type { Quad } from '@rdfjs/types';
import { DataFactory } from 'n3';
import { writeAccepted } from './lib/combined.ts';
import { fetchWithUserAgent } from './lib/http.ts';
import { readJson, writeJson, writeTurtle } from './lib/io.ts';
import {
  applyOverrides,
  type Candidate,
  countBy,
  distanceKm,
  type Homonym,
  MAX_DISTANCE_KM,
  type NameEntry,
  ORIGIN_STRENGTH,
  statusFor,
  villageNames,
  villageQuad,
  writeMatches,
} from './lib/matching.ts';
import { normalize } from './lib/names.ts';
import { dataPath, queryPath } from './lib/paths.ts';
import type { Village } from './lib/types.ts';
import { concept, type VillageStatus, vd, villageIri } from './lib/vocab.ts';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const SOURCE_IRI = 'https://www.wikidata.org/';
const LANGUAGES = ['nl', 'mul'];
// Submerged settlements this close are listed as location candidates, but never accepted
// automatically: drowned villages often lie only 1-2 km apart, so a nearby one is usually a neighbour.
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
// Submerged or former settlements, for which an alternative name also counts.
const HISTORICAL_RANK = 1;
// Items that only have these classes share a village's name but are never the village itself,
// e.g. the present-day municipality of Reimerswaal next to the drowned town.
const EXCLUDED_CLASSES = new Set([
  `${WD}Q2039348`, // municipality of the Netherlands
  `${WD}Q4167410`, // Wikimedia disambiguation page
]);
// Classes of present-day settlements and administrative areas. An item of one of these classes that
// shares a village's name makes that name a homonym. Streets, rivers, polders, buildings and nature
// areas named after a drowned village don't count: a text that mentions them still points to it.
const PRESENT_DAY_SETTLEMENTS = new Set(
  [
    'Q486972', // human settlement
    'Q532', // village
    'Q5084', // hamlet
    'Q1484611', // buurtschap
    'Q1852859', // cadastral populated place in the Netherlands
    'Q1138414', // isolated settlement
    'Q4632675', // dwelling place
    'Q123705', // neighborhood
    'Q3957', // town
    'Q677678', // fortified town
    'Q1021711', // seaside resort
    'Q515', // city
    'Q1549591', // big city
    'Q2264924', // port city
    'Q2235075', // centre city
    'Q2039348', // municipality of the Netherlands
    'Q15303838', // municipality seat
    'Q2785216', // municipality section (Belgium)
    'Q493522', // municipality of Belgium
    'Q15273785', // Belgian municipality with the title of city
    'Q83116', // province of Belgium
    'Q484170', // commune of France
    'Q21869758', // delegated commune
    'Q253019', // Ortsteil
    'Q116457956', // municipality without town privileges in Germany
  ].map((qid) => `${WD}${qid}`),
);
// Name origins searched on Wikidata. Wikidata labels are left out (they come from this step), and
// so are names without "Oud-"/"Nieuw-", which mostly name the present-day village.
const SEARCHED_ORIGINS = new Set(['primary', 'numberless', 'wikipedia', 'alt']);

interface Item {
  iri: string;
  label: string | null;
  labels: Set<string>;
  instanceOf: Set<string>;
  countries: Set<string>;
  coords: [number, number][];
  articles: string[];
}

/** How the candidate was found: by a name of the village, an alternative name, or location only. */
type Kind = 'name' | 'altName' | 'location';

interface WikidataCandidate extends Candidate {
  village: string;
  kind: Kind;
  item: Item;
  classRank: number;
}

const { values: args } = parseArgs({
  // --refresh is accepted for consistency with the other steps; this step has no cache.
  options: { villages: { type: 'string' }, refresh: { type: 'boolean' } },
});
const villages = await readJson<Village[]>(args.villages ?? dataPath('backbone', 'villages.json'));

const searchedNames = new Map<string, NameEntry[]>(
  villages.map((v) => [v.id, villageNames(v).filter((e) => SEARCHED_ORIGINS.has(e.origin))]),
);
const names = [...new Set([...searchedNames.values()].flat().map((e) => e.name))];
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

const qidOf = (entry: Item): string => entry.iri.slice(WD.length);
const nlwikiOf = (entry: Item): string | null =>
  entry.articles.find((a) => a.startsWith('https://nl.wikipedia.org/')) ?? null;
const nearestKm = (village: Village, entry: Item): number | null =>
  entry.coords.length ? Math.min(...entry.coords.map((c) => distanceKm([village.lon, village.lat], c))) : null;
const rankOf = (entry: Item): number =>
  entry.instanceOf.size
    ? Math.min(...[...entry.instanceOf].map((iri) => CLASS_RANK[iri] ?? DEFAULT_RANK))
    : DEFAULT_RANK;
const isExcluded = (entry: Item): boolean =>
  entry.instanceOf.size > 0 && [...entry.instanceOf].every((iri) => EXCLUDED_CLASSES.has(iri));

/** A candidate with the status from the item alone: class, coordinates and distance. */
function toCandidate(village: Village, entry: Item, kind: Kind, matched: NameEntry[]): WikidataCandidate {
  const distance = nearestKm(village, entry);
  const best = matched.reduce<NameEntry | undefined>(
    (a, b) => (!a || ORIGIN_STRENGTH[b.origin] > ORIGIN_STRENGTH[a.origin] ? b : a),
    undefined,
  );
  const candidate: WikidataCandidate = {
    village: village.id,
    record: entry.iri,
    kind,
    item: entry,
    matchedBy: kind === 'location' ? 'location' : distance === null ? 'place-name' : 'place-geo',
    ...(best ? { nameOrigin: best.origin, matchedNames: [...new Set(matched.map((m) => m.name))] } : {}),
    ...(distance === null ? {} : { distanceKm: Math.round(distance * 100) / 100 }),
    classRank: rankOf(entry),
    status: null,
  };
  if (isExcluded(entry)) return { ...candidate, status: 'rejected', statusReason: 'class' };
  if (distance === null) {
    return entry.countries.has(NETHERLANDS)
      ? { ...candidate, status: 'review', statusReason: 'no-coordinates' }
      : { ...candidate, status: 'rejected', statusReason: 'location' };
  }
  if (distance > MAX_DISTANCE_KM) return { ...candidate, status: 'rejected', statusReason: 'location' };
  if (kind === 'location') return { ...candidate, ...statusFor('location') };
  if (kind === 'altName' && candidate.classRank > HISTORICAL_RANK) {
    return { ...candidate, status: 'review', statusReason: 'alt-name' };
  }
  return { ...candidate, ...statusFor(candidate.matchedBy) };
}

function findCandidates(village: Village): WikidataCandidate[] {
  const matchedNames = new Map<Item, NameEntry[]>();
  for (const entry of searchedNames.get(village.id) ?? []) {
    for (const found of itemsByName.get(normalize(entry.name)) ?? []) {
      matchedNames.set(found, [...(matchedNames.get(found) ?? []), entry]);
    }
  }
  const nearby = submerged.filter((entry) => (nearestKm(village, entry) ?? Infinity) <= LOCATION_HINT_KM);
  return [...new Set([...matchedNames.keys(), ...nearby])].map((entry) => {
    const matched = matchedNames.get(entry) ?? [];
    const kind: Kind = matched.some((m) => m.origin !== 'alt') ? 'name' : matched.length ? 'altName' : 'location';
    return toCandidate(village, entry, kind, matched);
  });
}

// Best first: the strongest kind of match, then the strongest name origin (the backbone name before
// a name from the Wikipedia list), then class rank, then distance.
const kindOrder: Record<Kind, number> = { name: 0, altName: 1, location: 2 };
const originStrength = (c: WikidataCandidate): number => (c.nameOrigin ? ORIGIN_STRENGTH[c.nameOrigin] : -1);
const compareCandidates = (a: WikidataCandidate, b: WikidataCandidate): number =>
  kindOrder[a.kind] - kindOrder[b.kind] ||
  originStrength(b) - originStrength(a) ||
  a.classRank - b.classRank ||
  (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
const equallyStrong = (a: WikidataCandidate, b: WikidataCandidate): boolean =>
  a.kind === b.kind && originStrength(a) === originStrength(b) && a.classRank === b.classRank;

const candidates: WikidataCandidate[] = villages.flatMap((village) => {
  const found = findCandidates(village).sort(compareCandidates);
  const [best, second] = found.filter((c) => c.status === 'accepted');
  if (!best) return found;
  // Two equally strong candidates of the same class need a manual check.
  if (second && equallyStrong(best, second)) {
    for (const c of found) {
      if (c.status === 'accepted' && equallyStrong(c, best)) {
        Object.assign(c, { status: 'review', statusReason: 'tie' });
      }
    }
  }
  for (const c of found) {
    if (c !== best && c.status !== 'rejected' && c.statusReason !== 'tie') {
      Object.assign(c, { status: 'rejected', statusReason: 'better-match' });
    }
  }
  return found;
});
await applyOverrides('wikidata', candidates, new Set(villages.map((v) => v.id)));

interface Match {
  id: string;
  name: string;
  /** The accepted item; null when none or more than one was accepted. */
  qid: string | null;
  status: VillageStatus;
  candidates: WikidataCandidate[];
}
const matches: Match[] = villages.map((village) => {
  const own = candidates.filter((c) => c.village === village.id);
  const accepted = own.filter((c) => c.status === 'accepted');
  let status: VillageStatus;
  if (accepted.length === 1) status = 'matched';
  else if (accepted.length > 1 || own.some((c) => c.statusReason === 'tie')) status = 'ambiguous';
  else status = own.length ? 'unconfirmed' : 'not-found';
  return {
    id: village.id,
    name: village.name,
    qid: status === 'matched' ? qidOf(accepted[0].item) : null,
    status,
    candidates: own,
  };
});
const acceptedCandidates = candidates.filter((c) => c.status === 'accepted');
const acceptedItems = new Set(acceptedCandidates.map((c) => c.record));

// Submerged settlements on Wikidata that no backbone village was matched to.
const unmatchedSubmerged = submerged
  .filter((entry) => !acceptedItems.has(entry.iri))
  .map((entry) => ({
    qid: qidOf(entry),
    label: entry.label,
    coords: entry.coords[0] ?? null,
    nlwiki: nlwikiOf(entry),
  }));

// Names that are also the name of a present-day place: an item of a present-day settlement class that
// isn't also a submerged or former settlement and wasn't accepted for a village.
const homonyms: Homonym[] = names
  .map((name) => ({
    name,
    items: [...(itemsByName.get(normalize(name)) ?? [])]
      .filter(
        (entry) =>
          [...entry.instanceOf].some((iri) => PRESENT_DAY_SETTLEMENTS.has(iri)) &&
          rankOf(entry) > HISTORICAL_RANK &&
          !acceptedItems.has(entry.iri),
      )
      .map((entry) => ({
        qid: qidOf(entry),
        label: entry.label,
        classes: [...entry.instanceOf].map((iri) => iri.slice(WD.length)),
      })),
  }))
  .filter((h) => h.items.length > 0)
  .sort((a, b) => a.name.localeCompare(b.name));

/** The triples about the given items, their nlwiki articles and the labels of the classes and areas they link to. */
function itemQuads(iris: Set<string>): Quad[] {
  const articles = new Set(
    quads.filter((q) => q.predicate.value === `${SCHEMA}about` && iris.has(q.object.value)).map((q) => q.subject.value),
  );
  const linked = new Set(
    quads.filter((q) => iris.has(q.subject.value) && q.object.termType === 'NamedNode').map((q) => q.object.value),
  );
  return quads.filter(
    (q) =>
      iris.has(q.subject.value) ||
      articles.has(q.subject.value) ||
      (linked.has(q.subject.value) && q.predicate.value === `${RDFS}label`),
  );
}

const prefixes = { wd: WD, wdt: WDT, rdfs: RDFS, skos: SKOS, schema: SCHEMA };
const keptItems = new Set([
  ...candidates.filter((c) => c.status === 'accepted' || c.status === 'review').map((c) => c.record),
  ...submerged.map((entry) => entry.iri),
]);
await writeTurtle(dataPath('wikidata', 'villages.ttl'), itemQuads(keptItems), prefixes);

const toJson = ({ item: entry, kind: _, village: __, record: ___, ...c }: WikidataCandidate) => ({
  qid: qidOf(entry),
  label: entry.label,
  ...c,
  instanceOf: [...entry.instanceOf].map((iri) => iri.slice(WD.length)),
  nlwiki: nlwikiOf(entry),
});
await writeJson(dataPath('wikidata', 'matches.json'), {
  matches: matches.map((m) => ({ ...m, candidates: m.candidates.map(toJson) })),
  unmatchedSubmerged,
});
await writeJson(dataPath('wikidata', 'homonyms.json'), homonyms);

// The match results as RDF: every candidate, each village's overall status, and the item labels.
const { namedNode, literal, quad } = DataFactory;
const extra: Quad[] = [
  ...matches.map((m) =>
    quad(namedNode(villageIri(m.id)), namedNode(vd('matchStatus')), namedNode(concept.villageStatus(m.status))),
  ),
  ...[...new Map(candidates.map((c) => [c.record, c.item])).values()]
    .filter((entry) => entry.label)
    .map((entry) => quad(namedNode(entry.iri), namedNode(`${RDFS}label`), literal(entry.label ?? '', 'nl'))),
];
await writeMatches(
  'wikidata',
  SOURCE_IRI,
  candidates.map(({ item: _, kind: __, ...c }) => c),
  extra,
);

await writeAccepted('wikidata', [
  ...acceptedCandidates.map((c) => villageQuad(c.village, `${SKOS}exactMatch`, namedNode(c.record))),
  ...itemQuads(acceptedItems),
]);

const count = (status: VillageStatus): number => matches.filter((m) => m.status === status).length;
console.log(
  `${matches.length} villages: ${count('matched')} matched, ${count('ambiguous')} ambiguous, ` +
    `${count('unconfirmed')} unconfirmed, ${count('not-found')} not found. ` +
    `Candidates: ${JSON.stringify(countBy(candidates, (c) => (c.statusReason ? `${c.status}/${c.statusReason}` : c.status)))}. ` +
    `${submerged.length} submerged settlements on Wikidata, ${unmatchedSubmerged.length} not matched to a village. ` +
    `${homonyms.length} homonyms.`,
);
