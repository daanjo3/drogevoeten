// RCE, Cultuurhistorische Objecten (rce/cho on linkeddata.cultureelerfgoed.nl): rijksmonumenten,
// archeologische terreinen, vondstlocaties, onderzoeksgebieden, complexen and gezichten about the
// backbone villages.
//
// 1. Downloads the full N-Triples dump (about 850 MB gzipped, 60 million triples) into dumps/,
//    unless it is already there (pass --refresh to download again). The dataset's description
//    (exploration/datasets/linked-data-rce.rdf) only links to the website, so the dump URL comes
//    from the TriplyDB API.
// 2. Filters the dump down to the records in and around Zeeland and everything that describes them
//    (dumps/rce-cho-zeeland.nt, rebuilt when the dump is newer), because Comunica can't load the
//    whole dump into memory. See lib/rce-cho.ts.
// 3. Matches the records to the villages following the SOP, with Comunica on the subset:
//    - a name from the name index in the record's name or location name is place-geo when the
//      record's geometry lies within MAX_DISTANCE_KM of the backbone point, rejected (location) when
//      it lies farther away, and place-name without a geometry;
//    - a name in a description is text-context when the record's texts also mention drowning, else
//      text-name; a geometry beyond MAX_DISTANCE_KM rejects it;
//    - an archaeological record within LOCATION_KM of a village that names no village but mentions
//      drowning is a location candidate (review);
//    - other records about drowning without a village are generic candidates.
// 4. Writes data/rce/records.ttl (full descriptions of all found records, read from the store:
//    the equivalent SPARQL CONSTRUCT is too heavy for Comunica on millions of triples), matches.json and
//    matches.ttl (all candidates) and accepted.ttl, and rebuilds data/combined.ttl.
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { QueryEngine } from '@comunica/query-sparql-file';
import { DataFactory, Store } from 'n3';
import { writeAccepted } from './lib/combined.ts';
import { distanceToWktKm } from './lib/geo.ts';
import { downloadFile } from './lib/http.ts';
import { exists, readJson, writeJson, writeTurtle } from './lib/io.ts';
import {
  applyOverrides,
  buildNameIndex,
  type Candidate,
  CONTEXT_PATTERN,
  contextNear,
  countBy,
  loadHomonyms,
  loadWikidataLabels,
  locationGroup,
  MAX_DISTANCE_KM,
  mentionsDrowning,
  ORIGIN_STRENGTH,
  statusFor,
  villageQuad,
  writeMatches,
} from './lib/matching.ts';
import { editDistance, escapeRegExp, escapeSparqlString } from './lib/names.ts';
import { dataPath, dumpPath, queryPath } from './lib/paths.ts';
import {
  buildSubset,
  CEO,
  DATASET_IRI,
  DUMP_URL,
  datasetInfo,
  describeRecords,
  loadSubset,
  RECORD_CLASSES,
  type SubsetStats,
} from './lib/rce-cho.ts';
import type { Village } from './lib/types.ts';
import { type MatchKey, PREFIXES } from './lib/vocab.ts';

const SOURCE = 'rce';
const DUMP_FILE = dumpPath('rce-cho.nt.gz');
const SUBSET_FILE = dumpPath('rce-cho-zeeland.nt');
const SUBSET_STATS_FILE = dumpPath('rce-cho-zeeland.json');
const OUTPUT_DIR = dataPath(SOURCE);
// Structured place fields of the records, as named by the texts query.
const PLACE_FIELDS = new Set(['name', 'locationName', 'locationDescription']);
// Archaeological records this close to a village point are location candidates when they mention
// drowning but name no village.
const LOCATION_KM = 1;
const ARCHAEOLOGICAL = new Set(
  ['ArcheologischTerrein', 'Vondstlocatie', 'ArcheologischOnderzoeksgebied'].map((c) => `${CEO}${c}`),
);
// The margin around the backbone villages for the subset, in degrees (about 7 to 11 km).
const BBOX_MARGIN = 0.1;

const refresh = process.argv.includes('--refresh');
const engine = new QueryEngine();
const classValues = RECORD_CLASSES.map((iri) => `<${iri}>`).join(' ');

async function query(queryFile: string, replacements: Record<string, string>) {
  let text = await readFile(queryPath(queryFile), 'utf8');
  for (const [key, value] of Object.entries(replacements)) text = text.replace(`{{${key}}}`, value);
  return text;
}
let store = new Store();
const select = async (queryFile: string, replacements: Record<string, string> = {}) =>
  (await engine.queryBindings(await query(queryFile, replacements), { sources: [store] })).toArray();

const villages = await readJson<Village[]>(dataPath('backbone', 'villages.json'));

// 1. The dump.
const info = await datasetInfo();
console.log(
  `Dataset ${DATASET_IRI}: ${info.statements} statements, updated ${info.updatedAt}, licence ${info.license}`,
);
if (refresh || !(await exists(DUMP_FILE))) {
  console.log(`Downloading ${DUMP_URL} (about 850 MB)`);
  await downloadFile(DUMP_URL, DUMP_FILE);
} else {
  console.log(`Using cached dump ${DUMP_FILE} (pass --refresh to download again)`);
}

// 2. The Zeeland subset, rebuilt when it is missing or older than the dump.
const lons = villages.map((v) => v.lon);
const lats = villages.map((v) => v.lat);
const box = {
  minLon: Math.min(...lons) - BBOX_MARGIN,
  maxLon: Math.max(...lons) + BBOX_MARGIN,
  minLat: Math.min(...lats) - BBOX_MARGIN,
  maxLat: Math.max(...lats) + BBOX_MARGIN,
};
const dumpTime = (await stat(DUMP_FILE)).mtimeMs;
let subsetStats: SubsetStats;
if ((await exists(SUBSET_FILE)) && (await exists(SUBSET_STATS_FILE)) && (await stat(SUBSET_FILE)).mtimeMs > dumpTime) {
  console.log(`Using cached subset ${SUBSET_FILE}`);
  subsetStats = await readJson<SubsetStats>(SUBSET_STATS_FILE);
} else {
  subsetStats = await buildSubset(DUMP_FILE, SUBSET_FILE, box);
  await writeJson(SUBSET_STATS_FILE, subsetStats);
}

console.log(`Loading ${SUBSET_FILE} (${subsetStats.triples} triples)`);
store = await loadSubset(SUBSET_FILE);
const zeelandRecords = new Set(subsetStats.recordIris);

// 3. Matching.
const nameIndex = buildNameIndex(villages, await loadWikidataLabels());
const homonyms = await loadHomonyms();
const groupOf = new Map(villages.map((v) => [v.id, locationGroup(v)]));
const villageById = new Map(villages.map((v) => [v.id, v]));
const allNames = [...nameIndex.keys()].sort((a, b) => b.length - a.length);
const alternation = allNames.map(escapeRegExp).join('|');
const nameRegExp = new RegExp(`(?<![\\p{L}\\p{N}])(${alternation})(?![\\p{L}\\p{N}])`, 'gu');

console.log(`Searching the subset for ${allNames.length} names`);
const textRows = await select('rce-cho-texts.rq', {
  CLASSES: classValues,
  NAMES: escapeSparqlString(alternation),
  CONTEXT: escapeSparqlString(CONTEXT_PATTERN),
});
const geometryRows = await select('rce-cho-geometries.rq', { CLASSES: classValues });

const textsByRecord = new Map<string, { field: string; text: string }[]>();
const classOf = new Map<string, string>();
for (const row of textRows) {
  const record = row.get('record')?.value ?? '';
  // Neighbouring records outside Zeeland are only in the subset because a Zeeland record links to them.
  if (!zeelandRecords.has(record)) continue;
  classOf.set(record, row.get('class')?.value ?? '');
  textsByRecord.set(record, [
    ...(textsByRecord.get(record) ?? []),
    { field: row.get('field')?.value ?? '', text: row.get('text')?.value ?? '' },
  ]);
}
const wktByRecord = new Map<string, string[]>();
for (const row of geometryRows) {
  const record = row.get('record')?.value ?? '';
  wktByRecord.set(record, [...(wktByRecord.get(record) ?? []), row.get('wkt')?.value ?? '']);
}

console.log(`${textRows.length} matching texts in ${textsByRecord.size} records, ${geometryRows.length} geometries`);

/** The distance from the village to the nearest geometry of the record, rounded, or undefined without one. */
function recordDistanceKm(record: string, village: Village): number | undefined {
  const distances = (wktByRecord.get(record) ?? [])
    .map((wkt) => distanceToWktKm([village.lon, village.lat], wkt))
    .filter((d): d is number => d !== null);
  return distances.length ? Math.round(Math.min(...distances) * 100) / 100 : undefined;
}

// Suggestions for generic records: capitalized words spelled almost like a name.
const MIN_FUZZY_LENGTH = 6;
const fuzzyNames = allNames.filter((name) => name.length >= MIN_FUZZY_LENGTH && !/\s/.test(name));
function suggestedVillages(texts: { text: string }[]): string[] {
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

const candidates: Candidate[] = [];
for (const [record, texts] of textsByRecord) {
  const hasContext = texts.some(({ text }) => mentionsDrowning(text));
  const found = new Map<
    string,
    {
      names: Set<string>;
      origins: Set<NonNullable<Candidate['nameOrigin']>>;
      fields: Set<string>;
      shared: boolean[];
      context: boolean;
    }
  >();
  for (const { field, text } of texts) {
    for (const match of text.matchAll(nameRegExp)) {
      const name = match[1];
      const near = contextNear(text, match.index, name.length);
      const entries = nameIndex.get(name) ?? [];
      for (const { villageId, origin } of entries) {
        // On its own, a name without "Oud-"/"Nieuw-" names the present-day village.
        if (origin === 'stem' && !near) continue;
        const hit = found.get(villageId) ?? {
          names: new Set(),
          origins: new Set(),
          fields: new Set(),
          shared: [],
          context: false,
        };
        hit.names.add(name);
        hit.origins.add(origin);
        hit.fields.add(field);
        hit.shared.push(new Set(entries.map((e) => groupOf.get(e.villageId))).size > 1);
        hit.context ||= near;
        found.set(villageId, hit);
      }
    }
  }

  const own: Candidate[] = [];
  const sharedName = new Set<string>();
  for (const [villageId, hit] of found) {
    const village = villageById.get(villageId);
    if (!village) continue;
    const distance = recordDistanceKm(record, village);
    const inPlaceField = [...hit.fields].some((f) => PLACE_FIELDS.has(f));
    let matchedBy: MatchKey;
    if (inPlaceField) matchedBy = distance === undefined ? 'place-name' : 'place-geo';
    else matchedBy = hit.context ? 'text-context' : 'text-name';
    const nameOrigin = [...hit.origins].reduce((a, b) => (ORIGIN_STRENGTH[a] >= ORIGIN_STRENGTH[b] ? a : b));
    const homonym = [...hit.names].every((name) => homonyms.has(name));
    const status =
      distance !== undefined && distance > MAX_DISTANCE_KM
        ? ({ status: 'rejected', statusReason: 'location' } as const)
        : statusFor(matchedBy, { homonym, context: hit.context });
    if (hit.shared.every(Boolean)) sharedName.add(villageId);
    own.push({
      village: villageId,
      record,
      matchedBy,
      nameOrigin,
      matchedNames: [...hit.names],
      fields: [...hit.fields],
      ...(distance === undefined ? {} : { distanceKm: distance }),
      ...status,
    });
  }
  // A name that several villages share doesn't tell them apart, unless the geometry does: the ones
  // farther away are already rejected.
  const open = own.filter((c) => c.status !== 'rejected');
  const groups = new Set(open.map((c) => groupOf.get(c.village ?? '')));
  for (const c of open) {
    if (c.status === 'accepted' && sharedName.has(c.village ?? '') && groups.size > 1) {
      Object.assign(c, { status: 'review', statusReason: 'tie' });
    }
  }
  candidates.push(...own);

  if (own.length === 0 && hasContext) {
    // No village named: a nearby archaeological record is a location candidate, any other a generic one.
    const nearby = ARCHAEOLOGICAL.has(classOf.get(record) ?? '')
      ? villages
          .map((v) => ({ village: v, distance: recordDistanceKm(record, v) }))
          .filter(
            (n): n is { village: Village; distance: number } => n.distance !== undefined && n.distance <= LOCATION_KM,
          )
      : [];
    if (nearby.length) {
      for (const { village, distance } of nearby) {
        candidates.push({
          village: village.id,
          record,
          matchedBy: 'location',
          fields: [...new Set(texts.map((t) => t.field))],
          distanceKm: distance,
          ...statusFor('location'),
        });
      }
    } else {
      candidates.push({
        village: null,
        record,
        matchedBy: 'generic',
        fields: [...new Set(texts.map((t) => t.field))],
        status: null,
        suggestedVillages: suggestedVillages(texts),
      });
    }
  }
}
await applyOverrides(SOURCE, candidates, new Set(villageById.keys()));

// 4. Describe the found records and write the results.
const records = [...new Set(candidates.map((c) => c.record))];
console.log(`Describing ${records.length} records`);
const recordValues = records.map((iri) => `<${iri}>`).join(' ');
const quads = describeRecords(store, records);
const summaries = new Map(
  (records.length ? await select('rce-cho-records.rq', { RECORDS: recordValues }) : []).map((row) => [
    row.get('record')?.value ?? '',
    {
      class: (row.get('class')?.value ?? '').slice(CEO.length),
      objectNumber: row.get('objectNumber')?.value ?? null,
      monumentNumber: row.get('monumentNumber')?.value ?? null,
      label: row.get('label')?.value ?? null,
      woonplaats: row.get('woonplaats')?.value ?? null,
      images: Number(row.get('images')?.value ?? 0),
    },
  ]),
);

const recordPrefixes = {
  ceo: CEO,
  rn: 'https://data.cultureelerfgoed.nl/term/id/rn/',
  abr: 'https://data.cultureelerfgoed.nl/term/id/abr/',
  chok: 'https://linkeddata.cultureelerfgoed.nl/cho-kennis/id/',
  edm: 'http://www.europeana.eu/schemas/edm/',
  geo: 'http://www.opengis.net/ont/geosparql#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  foaf: 'http://xmlns.com/foaf/0.1/',
};
await writeTurtle(join(OUTPUT_DIR, 'records.ttl'), quads, recordPrefixes);

const firstText = (record: string) => {
  const texts = textsByRecord.get(record) ?? [];
  return (texts.find((t) => t.field === 'description') ?? texts[0])?.text.slice(0, 300) ?? null;
};
const describe = (c: Candidate) => ({ ...c, ...summaries.get(c.record), excerpt: firstText(c.record) });
await writeJson(join(OUTPUT_DIR, 'matches.json'), {
  dataset: { iri: DATASET_IRI, dump: DUMP_URL, ...info },
  subset: subsetStats,
  villages: villages
    .map((v) => ({
      id: v.id,
      name: v.name,
      drowned: v.drowned,
      records: candidates.filter((c) => c.village === v.id).map(describe),
    }))
    .filter((v) => v.records.length),
  generic: candidates.filter((c) => c.village === null).map(describe),
});
await writeMatches(SOURCE, DATASET_IRI, candidates);

// Accepted: the link from the village to the record, and the record's description.
const { namedNode } = DataFactory;
const accepted = candidates.filter(
  (c): c is Candidate & { village: string } => c.status === 'accepted' && c.village !== null,
);
const acceptedRecords = new Set(accepted.map((c) => c.record));
const acceptedDescriptions = describeRecords(store, acceptedRecords);
await writeAccepted(SOURCE, [
  ...accepted.map((c) => villageQuad(c.village, `${PREFIXES.schema}subjectOf`, namedNode(c.record))),
  ...acceptedDescriptions,
]);

const withVillage = candidates.filter((c) => c.village !== null);
console.log(
  `${new Set(withVillage.map((c) => c.village)).size} villages with records. Candidates: ` +
    `${JSON.stringify(countBy(withVillage, (c) => (c.statusReason ? `${c.status}/${c.statusReason}` : c.status)))}, ` +
    `by key ${JSON.stringify(countBy(withVillage, (c) => c.matchedBy))}. ` +
    `${candidates.length - withVillage.length} generic records about drowning. ${records.length} records described, ` +
    `${[...summaries.values()].filter((s) => s.images > 0).length} with images.`,
);
