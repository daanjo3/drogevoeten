// Rijksmuseum: prints, drawings, paintings and other objects about the backbone villages.
//
// 1. Downloads the Rijksmuseum's EDM collection dump (January 2020: 153 MB of zipped Turtle, about
//    668,000 objects) into dumps/, unless it is already there (pass --refresh to download again).
//    That is the step's only request: the current APIs can't be searched within the request budget.
// 2. Filters the dump down to the objects that may be about a village (dumps/rijksmuseum-edm-subset.nt,
//    rebuilt when the dump or the name index changes), because Comunica can't load the whole dump:
//    objects whose title or description names a village or mentions drowning, and objects that refer
//    to a flood, to an event or concept that names a village, or to a place named after a village
//    (also by spelling key) that has no coordinates or lies within MAX_DISTANCE_KM of a village.
//    People named like a village (Jacob van Campen) don't count. See lib/rijksmuseum-edm.ts.
// 3. Matches the objects to the villages following the SOP, with Comunica on the subset:
//    - a name in a depicted place (dc:subject) or production place (dct:spatial) is place-geo when
//      the place has coordinates within MAX_DISTANCE_KM of the backbone point, rejected (location)
//      when they lie farther away, and place-name without coordinates. The whole label (without a
//      qualifier such as "(Schouwen)") must have the spelling key of a name, so "Rommerswael" matches
//      but "Vietri sul Mare" doesn't. Near spellings are not used: in a thesaurus of 120,000 terms
//      they mostly find other places ("Napels" for Kapelle, "Holland" for Rilland);
//    - a thesaurus place is nearly always the present-day place, so for a homonym, a name without
//      "Oud-" or an alternative name, coordinates nearby don't prove it is the drowned village
//      (Borssele lies 0.9 km from the drowned Monster): those need review;
//    - a name in the title, description, event or concept is text-context when the object mentions
//      drowning or refers to a flood (an event such as "Sint Elisabethsvloed"), else text-name;
//    - homonyms, alternative names and names shared by several villages need review;
//    - objects about drowned land that name no village are generic candidates: "verdronken land",
//      "verdronken dorpen" and the like, or drowning words together with a flood. The shared drowning
//      words alone are too broad here ("verdwenen schilderij", "in gedachten verzonken", a hat with a
//      "verzonken bol").
// 4. Adds when each object was made (dct:created), the years of the events it shows and the years in
//    its title, so objects made after a village drowned can be ruled out later.
// 5. Writes data/rijksmuseum/objects.ttl (full descriptions of all found objects), matches.json and
//    matches.ttl (all candidates) and accepted.ttl, and rebuilds data/combined.ttl.
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { QueryEngine } from '@comunica/query-sparql-file';
import type { Quad } from '@rdfjs/types';
import { DataFactory, Store } from 'n3';
import { writeAccepted } from './lib/combined.ts';
import { downloadFile } from './lib/http.ts';
import { exists, readJson, writeJson, writeTurtle } from './lib/io.ts';
import {
  applyOverrides,
  buildNameIndex,
  type Candidate,
  CONTEXT_PATTERN,
  countBy,
  distanceKm,
  loadHomonyms,
  loadWikidataLabels,
  locationGroup,
  MAX_DISTANCE_KM,
  ORIGIN_STRENGTH,
  statusFor,
  villageQuad,
  writeMatches,
} from './lib/matching.ts';
import { editDistance, escapeRegExp, spellingKey } from './lib/names.ts';
import { dataPath, dumpPath, queryPath } from './lib/paths.ts';
import {
  buildSubset,
  DATASET_IRI,
  DC,
  DCT,
  DUMP_URL,
  EDM,
  loadNTriples,
  type SubsetStats,
  type Term,
  WGS84,
} from './lib/rijksmuseum-edm.ts';
import type { Village } from './lib/types.ts';
import { type MatchKey, PREFIXES } from './lib/vocab.ts';

const SOURCE = 'rijksmuseum';
const DUMP_FILE = dumpPath('rijksmuseum-edm-collection-202001.zip');
const SUBSET_FILE = dumpPath('rijksmuseum-edm-subset.nt');
const SUBSET_STATS_FILE = dumpPath('rijksmuseum-edm-subset.json');
const OUTPUT_DIR = dataPath(SOURCE);
/** The licence of the metadata, from the dataset description (https://id.rijksmuseum.nl/260251). */
const LICENSE = 'https://creativecommons.org/publicdomain/zero/1.0/';
// Structured place fields, as named by the texts query.
const PLACE_FIELDS = new Set(['depictedPlace', 'productionPlace']);
// Thesaurus fields whose labels can name a flood.
const TERM_FIELDS = new Set(['event', 'subject']);
/** Events and concepts about floods ("Sint Elisabethsvloed", "Watersnood 1775"), which count as drowning context. */
const FLOOD_PATTERN = 'vloed|watersnood|overstroming|dijkdoorbra|inundatie';
/** Drowned land, for generic objects (see the header). */
const DROWNED_LAND_PATTERN =
  'verdronken\\s+(?:land|dorp|stad|steden|parochie|polder|heerlijkhe|gebied|Zeeland|Vlaanderen)';
// Generic objects get suggestions for capitalized words of at least this length.
const MIN_FUZZY_LENGTH = 6;
// The subset holds a few thousand objects; far more means the filter is too broad (see buildSubset).
const MAX_SUBSET_OBJECTS = 20_000;
// Bump when the subset filter changes in a way the names don't show.
const FILTER_VERSION = 4;
const YEAR = /(?<!\d)(1\d{3}|20[0-2]\d)(?!\d)/g;
const CREATED_YEAR = /(?<!\d)(\d{3,4})(?!\d)/g;

const refresh = process.argv.includes('--refresh');
const engine = new QueryEngine();
let store: Store | undefined;

async function query(queryFile: string, replacements: Record<string, string> = {}) {
  let text = await readFile(queryPath(queryFile), 'utf8');
  for (const [key, value] of Object.entries(replacements)) text = text.replace(`{{${key}}}`, value);
  return text;
}
const select = async (queryFile: string, replacements: Record<string, string> = {}) =>
  (await engine.queryBindings(await query(queryFile, replacements), { sources: [store as Store] })).toArray();
const construct = async (queryFile: string, replacements: Record<string, string>): Promise<Quad[]> =>
  (await engine.queryQuads(await query(queryFile, replacements), { sources: [store as Store] })).toArray();

const villages = await readJson<Village[]>(dataPath('backbone', 'villages.json'));
const villageById = new Map(villages.map((v) => [v.id, v]));
const nameIndex = buildNameIndex(villages, await loadWikidataLabels());
const homonyms = await loadHomonyms();
const groupOf = new Map(villages.map((v) => [v.id, locationGroup(v)]));

// Longest names first, so "Oud-Hontenisse" wins over "Hontenisse".
const allNames = [...nameIndex.keys()].sort((a, b) => b.length - a.length);
const alternation = allNames.map(escapeRegExp).join('|');
const nameRegExp = new RegExp(`(?<![\\p{L}\\p{N}])(${alternation})(?![\\p{L}\\p{N}])`, 'gu');
const nameTest = new RegExp(nameRegExp.source, 'u');
const contextRegExp = new RegExp(CONTEXT_PATTERN, 'i');
const floodRegExp = new RegExp(FLOOD_PATTERN, 'i');
const drownedLandRegExp = new RegExp(DROWNED_LAND_PATTERN, 'i');

// Place labels are compared by spelling key, without a qualifier such as "(Zeeland)".
const namesByKey = new Map<string, string[]>();
for (const name of allNames) namesByKey.set(spellingKey(name), [...(namesByKey.get(spellingKey(name)) ?? []), name]);
const placeKey = (label: string) => spellingKey(label.replace(/\s*\(.*\)\s*$/, ''));

/** The names a place label stands for: the names with the spelling key of the whole label. */
const placeNames = (label: string): string[] => namesByKey.get(placeKey(label)) ?? [];

// 1. The dump.
if (refresh || !(await exists(DUMP_FILE))) {
  console.log(`Downloading ${DUMP_URL} (about 153 MB)`);
  await downloadFile(DUMP_URL, DUMP_FILE);
} else {
  console.log(`Using cached dump ${DUMP_FILE} (pass --refresh to download again)`);
}

// 2. The subset, rebuilt when it is missing, older than the dump, or made with other names.
const filterKey = createHash('sha256')
  .update(JSON.stringify({ FILTER_VERSION, allNames, CONTEXT_PATTERN, FLOOD_PATTERN }))
  .digest('hex');
const cachedStats = (await exists(SUBSET_STATS_FILE)) ? await readJson<SubsetStats>(SUBSET_STATS_FILE) : null;
let subsetStats: SubsetStats;
if (
  cachedStats?.filterKey === filterKey &&
  (await exists(SUBSET_FILE)) &&
  (await stat(SUBSET_FILE)).mtimeMs > (await stat(DUMP_FILE)).mtimeMs
) {
  console.log(`Using cached subset ${SUBSET_FILE}`);
  subsetStats = cachedStats;
} else {
  const nearAVillage = ([lon, lat]: [number, number]) =>
    villages.some((v) => distanceKm([v.lon, v.lat], [lon, lat]) <= MAX_DISTANCE_KM);
  const selectTerm = ({ type, labels, coords }: Term) => {
    if (type === `${EDM}Place`) {
      // A place with coordinates elsewhere (Namen, Oostende, Kampen) would be rejected on distance anyway.
      return labels.some((label) => placeNames(label).length > 0) && (coords === null || nearAVillage(coords));
    }
    // A person named like a village (Jacob van Campen, Pieter de Mare) isn't about it.
    if (type === `${EDM}Agent`) return false;
    return labels.some((label) => nameTest.test(label) || floodRegExp.test(label) || contextRegExp.test(label));
  };
  subsetStats = await buildSubset(DUMP_FILE, SUBSET_FILE, {
    key: filterKey,
    term: selectTerm,
    texts: (texts) => texts.some((text) => nameTest.test(text) || contextRegExp.test(text)),
    maxObjects: MAX_SUBSET_OBJECTS,
  });
  await writeJson(SUBSET_STATS_FILE, subsetStats);
}
console.log(`Loading ${SUBSET_FILE} (${subsetStats.triples} triples)`);
store = await loadNTriples(SUBSET_FILE);

// 3. Matching.
interface Text {
  field: string;
  text: string;
  term: string | null;
  coords: [number, number] | null;
}
const rows = await select('rijksmuseum-texts.rq');
const textsByObject = new Map<string, Text[]>();
for (const row of rows) {
  const object = row.get('object')?.value ?? '';
  const lat = Number.parseFloat(row.get('lat')?.value ?? '');
  const long = Number.parseFloat(row.get('long')?.value ?? '');
  textsByObject.set(object, [
    ...(textsByObject.get(object) ?? []),
    {
      field: row.get('field')?.value ?? '',
      text: row.get('text')?.value ?? '',
      term: row.get('term')?.value ?? null,
      coords: Number.isNaN(lat) || Number.isNaN(long) ? null : [long, lat],
    },
  ]);
}
console.log(`${rows.length} texts of ${textsByObject.size} objects`);

// Suggestions for generic objects: capitalized words spelled almost like a name.
const fuzzyNames = allNames.filter((name) => name.length >= MIN_FUZZY_LENGTH && !/\s/.test(name));
function suggestedVillages(texts: Text[]): string[] {
  const words = new Set(texts.flatMap(({ text }) => text.match(/\p{Lu}[\p{L}-]{5,}/gu) ?? []));
  const suggestions = new Set<string>();
  for (const word of words) {
    for (const name of fuzzyNames) {
      if (Math.abs(word.length - name.length) > 2 || editDistance(word.toLowerCase(), name.toLowerCase()) > 2) continue;
      for (const { villageId } of nameIndex.get(name) ?? []) suggestions.add(villageId);
    }
  }
  return [...suggestions];
}

interface Hit {
  names: Set<string>;
  origins: Set<NonNullable<Candidate['nameOrigin']>>;
  fields: Set<string>;
  shared: boolean[];
  /** Coordinates of the matched places that have them. */
  coords: [number, number][];
}

const candidates: Candidate[] = [];
for (const [object, texts] of textsByObject) {
  const mentionsDrowning = texts.some(({ text }) => contextRegExp.test(text));
  const showsFlood = texts.some(({ field, text }) => TERM_FIELDS.has(field) && floodRegExp.test(text));
  const hasContext = mentionsDrowning || showsFlood;
  const found = new Map<string, Hit>();
  /** Adds the villages of names that stand for one mention: one name in a text, or the names of a place label. */
  const addHits = (names: string[], { field, coords }: Text) => {
    const entries = names.flatMap((name) => (nameIndex.get(name) ?? []).map((entry) => ({ ...entry, name })));
    // "Koudekerke" and "Coudekerke" share a spelling key but are different villages: that is a tie.
    const shared = new Set(entries.map((e) => groupOf.get(e.villageId))).size > 1;
    for (const { villageId, origin, name } of entries) {
      if (origin === 'stem' && !hasContext) continue;
      const hit = found.get(villageId) ?? {
        names: new Set(),
        origins: new Set(),
        fields: new Set(),
        shared: [],
        coords: [],
      };
      hit.names.add(name);
      hit.origins.add(origin);
      hit.fields.add(field);
      hit.shared.push(shared);
      if (coords && PLACE_FIELDS.has(field)) hit.coords.push(coords);
      found.set(villageId, hit);
    }
  };
  for (const text of texts) {
    if (PLACE_FIELDS.has(text.field)) addHits(placeNames(text.text), text);
    else for (const [, name] of text.text.matchAll(nameRegExp)) addHits([name], text);
  }

  const own: Candidate[] = [];
  const sharedName = new Set<string>();
  for (const [villageId, hit] of found) {
    const village = villageById.get(villageId);
    if (!village) continue;
    const distances = hit.coords.map((c) => distanceKm([village.lon, village.lat], c));
    const distance = distances.length ? Math.round(Math.min(...distances) * 100) / 100 : undefined;
    const inPlaceField = [...hit.fields].some((f) => PLACE_FIELDS.has(f));
    let matchedBy: MatchKey;
    if (inPlaceField) matchedBy = distance === undefined ? 'place-name' : 'place-geo';
    else matchedBy = hasContext ? 'text-context' : 'text-name';
    const nameOrigin = [...hit.origins].reduce((a, b) => (ORIGIN_STRENGTH[a] >= ORIGIN_STRENGTH[b] ? a : b));
    const homonym = [...hit.names].every((name) => homonyms.has(name));
    let status =
      distance !== undefined && distance > MAX_DISTANCE_KM
        ? ({ status: 'rejected', statusReason: 'location' } as const)
        : statusFor(matchedBy, { homonym });
    // An alternative name often names a successor village or a building; an object isn't a historical place.
    if (status.status === 'accepted' && nameOrigin === 'alt') status = { status: 'review', statusReason: 'alt-name' };
    // The thesaurus place is nearly always the present-day place: nearby coordinates don't settle a
    // homonym, and a name without "Oud-" in a place field is the present-day village.
    const presentDay = (matchedBy === 'place-geo' && homonym) || (inPlaceField && nameOrigin === 'stem');
    if (status.status === 'accepted' && presentDay) {
      status = { status: 'review', statusReason: 'homonym' };
    }
    if (hit.shared.every(Boolean)) sharedName.add(villageId);
    own.push({
      village: villageId,
      record: object,
      matchedBy,
      nameOrigin,
      matchedNames: [...hit.names],
      fields: [...hit.fields],
      ...(distance === undefined ? {} : { distanceKm: distance }),
      ...status,
    });
  }
  // A name that several villages share doesn't tell them apart, unless coordinates do: the ones
  // farther away are already rejected.
  const open = own.filter((c) => c.status !== 'rejected');
  const groups = new Set(open.map((c) => groupOf.get(c.village ?? '')));
  for (const c of open) {
    if (c.status === 'accepted' && c.matchedBy !== 'place-geo' && sharedName.has(c.village ?? '') && groups.size > 1) {
      Object.assign(c, { status: 'review', statusReason: 'tie' });
    }
  }
  candidates.push(...own);

  // A flood alone is mostly about other places, and drowning words alone are too broad (see the header).
  const aboutDrownedLand = texts.some(({ text }) => drownedLandRegExp.test(text)) || (mentionsDrowning && showsFlood);
  if (own.length === 0 && aboutDrownedLand) {
    candidates.push({
      village: null,
      record: object,
      matchedBy: 'generic',
      fields: [...new Set(texts.map((t) => t.field))],
      status: null,
      suggestedVillages: suggestedVillages(texts),
    });
  }
}
await applyOverrides(SOURCE, candidates, new Set(villageById.keys()));

// 4. Describe all found objects, with when they were made.
const objects = [...new Set(candidates.map((c) => c.record))];
const quads = objects.length
  ? await construct('rijksmuseum-objects.rq', { OBJECTS: objects.map((iri) => `<${iri}>`).join(' ') })
  : [];
const described = new Store(quads);
const valuesOf = (subject: string, predicate: string) => described.getObjects(subject, predicate, null);
const aggregationOf = new Map(
  quads.filter((q) => q.predicate.value === `${EDM}aggregatedCHO`).map((q) => [q.object.value, q.subject.value]),
);
const labelOf = new Map(
  quads
    .filter((q) => q.predicate.value === 'http://www.w3.org/2004/02/skos/core#prefLabel')
    .map((q) => [q.subject.value, q.object.value]),
);
const yearsIn = (texts: string[], pattern: RegExp) => [
  ...new Set(texts.flatMap((text) => [...text.matchAll(pattern)].map((m) => Number(m[1])))),
];

function summary(object: string) {
  const titles = valuesOf(object, `${DC}title`).map((t) => t.value);
  const createdYears = yearsIn(
    valuesOf(object, `${DCT}created`).map((t) => t.value),
    CREATED_YEAR,
  );
  const events = [...valuesOf(object, `${DC}subject`), ...valuesOf(object, `${DCT}temporal`)]
    .filter((t) => (textsByObject.get(object) ?? []).some((x) => x.field === 'event' && x.term === t.value))
    .map((t) => labelOf.get(t.value) ?? t.value);
  const aggregation = aggregationOf.get(object) ?? '';
  return {
    objectNumber: valuesOf(object, `${DC}identifier`)[0]?.value ?? null,
    title: titles[0] ?? null,
    image: valuesOf(aggregation, `${EDM}isShownBy`)[0]?.value ?? null,
    rights: valuesOf(aggregation, `${EDM}rights`)[0]?.value ?? null,
    events: [...new Set(events)],
    created: createdYears.length ? { beginYear: Math.min(...createdYears), endYear: Math.max(...createdYears) } : null,
    eventYears: yearsIn(events, YEAR),
    yearsInTitle: yearsIn(titles, YEAR),
  };
}

// 5. Write the results.
const objectPrefixes = {
  dc: DC,
  dct: DCT,
  edm: EDM,
  ore: 'http://www.openarchives.org/ore/terms/',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  wgs84_pos: WGS84,
  rm: 'http://hdl.handle.net/10934/',
};
await writeTurtle(join(OUTPUT_DIR, 'objects.ttl'), quads, objectPrefixes);

const dataset = { iri: DATASET_IRI, dump: DUMP_URL, license: LICENSE, subset: subsetStats };
const describe = (c: Candidate) => ({ ...c, ...summary(c.record) });
await writeJson(join(OUTPUT_DIR, 'matches.json'), {
  dataset,
  villages: villages
    .map((v) => ({
      id: v.id,
      name: v.name,
      drowned: v.drowned,
      objects: candidates.filter((c) => c.village === v.id).map(describe),
    }))
    .filter((v) => v.objects.length),
  generic: candidates.filter((c) => c.village === null).map(describe),
});
await writeMatches(SOURCE, DATASET_IRI, candidates);

// Accepted: the link from the village to the object, and the object's description.
const { namedNode } = DataFactory;
const accepted = candidates.filter(
  (c): c is Candidate & { village: string } => c.status === 'accepted' && c.village !== null,
);
const acceptedObjects = new Set(accepted.map((c) => c.record));
const describedBy = new Set([...acceptedObjects].map((o) => aggregationOf.get(o) ?? ''));
const referenced = new Set(
  quads
    .filter((q) => acceptedObjects.has(q.subject.value) && q.object.termType === 'NamedNode')
    .map((q) => q.object.value),
);
await writeAccepted(SOURCE, [
  ...accepted.map((c) => villageQuad(c.village, `${PREFIXES.schema}subjectOf`, namedNode(c.record))),
  ...quads.filter(
    (q) => acceptedObjects.has(q.subject.value) || describedBy.has(q.subject.value) || referenced.has(q.subject.value),
  ),
]);

const withVillage = candidates.filter((c) => c.village !== null);
const summaries = objects.map(summary);
console.log(
  `${new Set(withVillage.map((c) => c.village)).size} villages with objects. Candidates: ` +
    `${JSON.stringify(countBy(withVillage, (c) => (c.statusReason ? `${c.status}/${c.statusReason}` : c.status)))}, ` +
    `by key ${JSON.stringify(countBy(withVillage, (c) => c.matchedBy))}. ` +
    `${candidates.length - withVillage.length} generic objects about drowning. ${objects.length} objects described, ` +
    `${summaries.filter((s) => s.created).length} with a production date, ` +
    `${summaries.filter((s) => s.image).length} with an image.`,
);
