// Backbone: Kaart Verdronken Dorpen Zeeland (Provincie Zeeland), WFS layer chs:geocmd_vrddrppnt,
// enriched with the table of the Wikipedia list of drowned villages. Every other step depends on it.
//
// 1. Reads the villages from one of two sources, selected with BACKBONE_SOURCE (see lib/config.ts):
//    - wfs (default): downloads the layer as GeoJSON in WGS84 into dumps/ (reused on later runs, pass
//      --refresh to download again). The WFS backend is sometimes unavailable (GeoServer answers with
//      an ows:ExceptionReport); then use the backup, or open WFS_URL in a browser and save the
//      response as dumps/verdronken-dorpen.geojson.
//    - backup: reads the JSON export in BACKBONE_BACKUP_FILE (exploration/resources/ by default).
// 2. Matches the rows of the table "Tabel bij de kaart" in the Dutch Wikipedia article "Lijst van
//    verdronken dorpen in Zeeland" (wikitext from the MediaWiki API, cached in dumps/) to the
//    villages by name, following the SOP. Rows have no coordinates, so the key is place-name; the
//    article title's disambiguator ("Westkerke (Goes)") confirms or rules out a municipality. An
//    accepted row adds the linked article, the date of drowning (the last date in the column) and
//    its causes to the village.
// 3. Writes data/backbone/villages.json, villages.geojson and villages.ttl (the villages as RDF,
//    the base of data/combined.ttl), wikipedia-list.json and wikipedia-list.ttl (the parsed rows),
//    and matches.ttl (the row candidates), and rebuilds data/combined.ttl.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Quad, Quad_Object, Quad_Subject } from '@rdfjs/types';
import { DataFactory } from 'n3';
import { updateCombined } from './lib/combined.ts';
import { config } from './lib/config.ts';
import { fetchText } from './lib/http.ts';
import { readJson, writeJson, writeTurtle } from './lib/io.ts';
import {
  applyOverrides,
  type Candidate,
  countBy,
  locationGroup,
  ORIGIN_STRENGTH,
  statusFor,
  villageNames,
  writeMatches,
} from './lib/matching.ts';
import { editDistance, normalize, spellingKey } from './lib/names.ts';
import { dataPath, dumpPath } from './lib/paths.ts';
import type { Village } from './lib/types.ts';
import { assertVocabulary, concept, PREFIXES, vd, villageIri } from './lib/vocab.ts';
import { loadPage, PAGE_URL, parseTable, type WikipediaListRow } from './lib/wikipedia-list.ts';

interface Feature {
  type: 'Feature';
  id: string;
  geometry: { type: string; coordinates: number[] } | null;
  properties: Record<string, unknown>;
}

interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

/** A record in the backup file. */
interface BackupRecord {
  naam: string;
  namen: string[];
  gemeente: string;
  rd_x: number;
  rd_y: number;
  lat: number;
  lon: number;
}

const WFS_URL =
  'https://opengeodata.zeeland.nl/geoserver/chs/wfs?service=WFS&version=2.0.0&request=GetFeature' +
  '&typeNames=chs:geocmd_vrddrppnt&outputFormat=application/json&srsName=EPSG:4326';

// WGS84 bounding box of the layer according to GetCapabilities, widened slightly.
const BBOX = { minLon: 3.2, maxLon: 4.4, minLat: 51.1, maxLat: 51.9 };

// Property keys that may hold the village name; the actual schema is checked at runtime.
const NAME_KEY_PATTERN = /^(naam|name|dorp|dorpsnaam|plaatsnaam)$/i;

const DUMP_FILE = dumpPath('verdronken-dorpen.geojson');
const WIKIPEDIA_FILE = dumpPath('wikipedia-lijst-verdronken-dorpen-zeeland.json');
const refresh = process.argv.includes('--refresh');

const inBbox = ([lon, lat]: number[]): boolean =>
  lon >= BBOX.minLon && lon <= BBOX.maxLon && lat >= BBOX.minLat && lat <= BBOX.maxLat;

function rejectExceptionReport(body: string): void {
  if (body.trimStart().startsWith('<')) {
    const message = body.match(/<ows:ExceptionText>([\s\S]*?)<\/ows:ExceptionText>/)?.[1] ?? body.slice(0, 500);
    throw new Error(`WFS returned an exception instead of GeoJSON: ${message.split('\n')[0]}`);
  }
}

async function loadGeoJson(): Promise<FeatureCollection> {
  if (!refresh) {
    try {
      const cached = JSON.parse(await readFile(DUMP_FILE, 'utf8')) as FeatureCollection;
      console.log(`Using cached dump ${DUMP_FILE} (pass --refresh to download again)`);
      return cached;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  console.log(`Fetching ${WFS_URL}\n(this can take a minute)`);
  const body = await fetchText(WFS_URL, { validate: rejectExceptionReport });
  await mkdir(dirname(DUMP_FILE), { recursive: true });
  await writeFile(DUMP_FILE, body);
  console.log(`Wrote ${DUMP_FILE}`);
  return JSON.parse(body) as FeatureCollection;
}

/** Returns [lon, lat], swapping the axes if the service returned lat/lon order. */
function toLonLat(feature: Feature): [number, number] {
  if (feature.geometry?.type !== 'Point') {
    throw new Error(`Feature ${feature.id} has geometry ${feature.geometry?.type}, expected Point`);
  }
  const [x, y] = feature.geometry.coordinates;
  if (inBbox([x, y])) return [x, y];
  if (inBbox([y, x])) return [y, x];
  throw new Error(
    `Feature ${feature.id} has coordinates ${x},${y} outside Zeeland. ` +
      'Is the dump in EPSG:4326? Download it with srsName=EPSG:4326.',
  );
}

type BackboneVillage = Omit<Village, 'wikipedia' | 'drowned'>;

async function loadFromWfs(): Promise<BackboneVillage[]> {
  const geojson = await loadGeoJson();
  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('Expected a GeoJSON FeatureCollection');
  }
  const propertyKeys = Object.keys(geojson.features[0]?.properties ?? {});
  const nameKey = propertyKeys.find((key) => NAME_KEY_PATTERN.test(key));
  if (!nameKey) {
    throw new Error(`No name property found. Available properties: ${propertyKeys.join(', ')}`);
  }
  console.log(`Name taken from property "${nameKey}"; properties: ${propertyKeys.join(', ')}`);
  return geojson.features.map((feature) => {
    const [lon, lat] = toLonLat(feature);
    return {
      id: feature.id,
      name: String(feature.properties[nameKey]).trim(),
      altNames: [],
      municipality: null,
      lon,
      lat,
      properties: feature.properties,
    };
  });
}

const slug = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

async function loadFromBackup(): Promise<BackboneVillage[]> {
  console.log(`Reading backup ${config.backboneBackupFile}`);
  const records = await readJson<BackupRecord[]>(config.backboneBackupFile);
  if (!Array.isArray(records)) throw new Error('Expected the backup file to contain a JSON array');

  // The backup contains a few exact duplicates.
  const unique = [...new Map(records.map((r) => [JSON.stringify(r), r])).values()];
  if (unique.length < records.length) console.log(`Skipped ${records.length - unique.length} duplicate records`);

  // Ids from the name, with the municipality added where a name occurs more than once.
  const nameCounts = new Map<string, number>();
  for (const r of unique) nameCounts.set(r.naam, (nameCounts.get(r.naam) ?? 0) + 1);
  const ids = new Set<string>();

  return unique.map((record) => {
    const { naam, namen, gemeente, lat, lon } = record;
    if (typeof naam !== 'string' || typeof lat !== 'number' || typeof lon !== 'number') {
      throw new Error(`Invalid backup record: ${JSON.stringify(record)}`);
    }
    if (!inBbox([lon, lat])) throw new Error(`Backup record ${naam} has coordinates ${lon},${lat} outside Zeeland`);

    let id = slug((nameCounts.get(naam) ?? 0) > 1 ? `${naam} ${gemeente}` : naam);
    for (let n = 2; ids.has(id); n++) id = `${slug(naam)}-${n}`;
    ids.add(id);

    const name = naam.trim();
    const altNames = [...new Set((namen ?? []).map((n) => n.trim()))].filter((n) => n && n !== name);
    for (const n of [name, ...altNames]) {
      if (n.includes('?')) console.warn(`Warning: name "${n}" of ${id} looks garbled (encoding problem?)`);
    }
    return {
      id,
      name,
      altNames,
      municipality: gemeente?.trim() || null,
      lon,
      lat,
      properties: record as unknown as Record<string, unknown>,
    };
  });
}

console.log(`Backbone source: ${config.backboneSource}`);
const backbone = config.backboneSource === 'backup' ? await loadFromBackup() : await loadFromWfs();
const villages: Village[] = backbone.map((v) => ({ ...v, wikipedia: null, drowned: null }));
const villageById = new Map(villages.map((v) => [v.id, v]));

// 2. The Wikipedia list.
const page = await loadPage(WIKIPEDIA_FILE, refresh);
const rows = parseTable(page.wikitext);
console.log(`${rows.length} rows in the Wikipedia list (revision ${page.revid})`);
const rowByIri = new Map(rows.map((r) => [r.record, r]));

// Names of the row and of the village are compared by spelling key; near spellings only for rows
// without any other match, and only for longer names.
const ROW_ORIGIN_STRENGTH = { primary: 3, alt: 1 };
const MAX_EDIT_DISTANCE = 2;
const MIN_FUZZY_LENGTH = 6;

interface Pair extends Candidate {
  village: string;
  score: number;
}

/** "Schouwen" confirms "Schouwen-Duiveland", "Goes" confirms "Goes". */
const sameMunicipality = (disambiguator: string, municipality: string | null): boolean => {
  if (!municipality) return false;
  const [a, b] = [normalize(disambiguator), normalize(municipality)];
  return a === b || b.startsWith(`${a} `) || a.startsWith(`${b} `);
};

function pairsFor(row: WikipediaListRow, fuzzy: boolean): Pair[] {
  const rowNames = [
    ...row.names.map((name) => ({ name, origin: 'primary' as const })),
    ...row.altNames.map((name) => ({ name, origin: 'alt' as const })),
  ].map((n) => ({ ...n, key: spellingKey(n.name) }));
  const pairs: Pair[] = [];
  for (const village of villages) {
    const matched = new Map<string, { origin: Candidate['nameOrigin']; quality: number; distance: number }>();
    let strength = 0;
    for (const entry of villageNames(village)) {
      const key = spellingKey(entry.name);
      for (const rowName of rowNames) {
        const distance = key === rowName.key ? 0 : fuzzy ? editDistance(key, rowName.key) : Infinity;
        if (
          distance > 0 &&
          (distance > MAX_EDIT_DISTANCE || Math.min(key.length, rowName.key.length) < MIN_FUZZY_LENGTH)
        ) {
          continue;
        }
        const quality = distance > 0 ? 0 : normalize(entry.name) === normalize(rowName.name) ? 2 : 1;
        const known = matched.get(entry.name);
        if (!known || quality > known.quality) matched.set(entry.name, { origin: entry.origin, quality, distance });
        strength = Math.max(strength, ROW_ORIGIN_STRENGTH[rowName.origin] + ORIGIN_STRENGTH[entry.origin]);
      }
    }
    if (matched.size === 0) continue;
    const hits = [...matched.entries()];
    const best = hits.reduce((a, b) =>
      ORIGIN_STRENGTH[b[1].origin ?? 'stem'] > ORIGIN_STRENGTH[a[1].origin ?? 'stem'] ? b : a,
    );
    const confirmed = row.disambiguator !== null && sameMunicipality(row.disambiguator, village.municipality);
    const minDistance = Math.min(...hits.map(([, h]) => h.distance));
    pairs.push({
      village: village.id,
      record: row.record,
      matchedBy: 'place-name',
      nameOrigin: best[1].origin,
      matchedNames: hits.map(([name]) => name),
      status: null,
      ...(minDistance > 0 ? { editDistance: minDistance } : {}),
      score: (confirmed ? 1000 : 0) + matched.size * 100 + Math.max(...hits.map(([, h]) => h.quality)) * 10 + strength,
    });
  }
  // A disambiguator that names the municipality of another candidate rules this one out.
  const municipalities = new Set(
    pairs
      .filter(
        (p) =>
          row.disambiguator && sameMunicipality(row.disambiguator, villageById.get(p.village)?.municipality ?? null),
      )
      .map((p) => p.village),
  );
  if (municipalities.size) {
    for (const p of pairs) {
      if (!municipalities.has(p.village)) Object.assign(p, { status: 'rejected', statusReason: 'location' });
    }
  }
  return pairs;
}

const pairs = rows.flatMap((row) => {
  const exact = pairsFor(row, false);
  return exact.length ? exact : pairsFor(row, true);
});

// Assign rows to villages, best pairs first. A village gets one row. A row can go to several
// villages only when they are locations of one village ("Oud-Hontenisse 1" and "2"). A pair is
// assigned when it is the best for both its village and its row, without a tie; that is repeated
// until nothing changes, so "Weele (Sint-Marie)" first goes to the Weele with that alternative name
// and the other Weele then gets the remaining row.
const groupOf = (villageId: string): string => {
  const village = villageById.get(villageId);
  return village ? locationGroup(village) : villageId;
};
const rowOfVillage = new Map<string, string>();
const groupOfRow = new Map<string, string>();
for (;;) {
  const open = pairs.filter(
    (p) =>
      p.status !== 'rejected' &&
      !rowOfVillage.has(p.village) &&
      (groupOfRow.get(p.record) ?? groupOf(p.village)) === groupOf(p.village),
  );
  const best = (key: (p: Pair) => string) => {
    const scores = new Map<string, number>();
    for (const p of open) scores.set(key(p), Math.max(scores.get(key(p)) ?? -1, p.score));
    return scores;
  };
  const bestOfVillage = best((p) => p.village);
  const bestOfRow = best((p) => p.record);
  const winners = open.filter((p) => p.score === bestOfVillage.get(p.village) && p.score === bestOfRow.get(p.record));
  const clean = winners.filter(
    (p) =>
      open.filter((q) => q.village === p.village && q.score === p.score).length === 1 &&
      new Set(open.filter((q) => q.record === p.record && q.score === p.score).map((q) => groupOf(q.village))).size ===
        1,
  );
  if (clean.length === 0) break;
  for (const p of clean) {
    rowOfVillage.set(p.village, p.record);
    groupOfRow.set(p.record, groupOf(p.village));
  }
}
for (const p of pairs) {
  if (p.status === 'rejected') continue;
  // No homonym check: the list is about drowned villages only, which counts as context.
  if (rowOfVillage.get(p.village) === p.record) Object.assign(p, statusFor('place-name', p));
  else if (
    rowOfVillage.has(p.village) ||
    (groupOfRow.has(p.record) && groupOfRow.get(p.record) !== groupOf(p.village))
  ) {
    Object.assign(p, { status: 'rejected', statusReason: 'better-match' });
  } else Object.assign(p, { status: 'review', statusReason: 'tie' });
}

const candidates = await applyOverrides(
  'backbone',
  pairs.map(({ score: _, ...candidate }) => candidate),
  new Set(villageById.keys()),
);

// Accepted rows enrich their villages.
for (const village of villages) {
  const accepted = candidates.filter((c) => c.village === village.id && c.status === 'accepted');
  if (accepted.length > 1) {
    console.warn(`Warning: ${village.id} has ${accepted.length} accepted rows; check the overrides. Using none.`);
    continue;
  }
  const row = accepted[0] && rowByIri.get(accepted[0].record);
  if (!row) continue;
  village.wikipedia = { row: row.row, record: row.record, names: row.names, article: row.article };
  village.drowned = row.drowned;
}

// 3. Write the results.
const features = villages.map((village) => ({
  type: 'Feature',
  id: village.id,
  geometry: { type: 'Point', coordinates: [village.lon, village.lat] },
  properties: village.properties,
}));
await writeJson(dataPath('backbone', 'villages.geojson'), { type: 'FeatureCollection', features });
await writeJson(dataPath('backbone', 'villages.json'), villages);

const candidatesOfRow = (row: WikipediaListRow) =>
  candidates
    .filter((c) => c.record === row.record)
    .map(({ village, status, statusReason, matchedNames, editDistance }) => ({
      village,
      status,
      statusReason,
      matchedNames,
      editDistance,
    }));
await writeJson(dataPath('backbone', 'wikipedia-list.json'), {
  page: { title: page.title, url: PAGE_URL, revid: page.revid, revisionUrl: page.revisionUrl },
  rows: rows.map((row) => ({ ...row, candidates: candidatesOfRow(row) })),
});

const { namedNode, literal, quad } = DataFactory;
const xsd = (type: string) => namedNode(`${PREFIXES.xsd}${type}`);
const RDFS_LABEL = `${PREFIXES.rdfs}label`;
const SKOS_ALT_LABEL = `${PREFIXES.skos}altLabel`;

/** Triples for the drowning date, causes and article, shared by villages and rows. */
function wikipediaQuads(subject: Quad_Subject, drowned: Village['drowned'], article: string | null): Quad[] {
  const quads: Quad[] = [];
  const add = (predicate: string, object: Quad_Object) => quads.push(quad(subject, namedNode(predicate), object));
  if (drowned) {
    add(vd('drownedBeginYear'), literal(String(drowned.beginYear), xsd('integer')));
    add(vd('drownedEndYear'), literal(String(drowned.endYear), xsd('integer')));
    add(vd('drownedNote'), literal(drowned.text, 'nl'));
    for (const cause of drowned.cause) add(vd('drowningCause'), namedNode(concept.drowningCause(cause)));
  }
  if (article) add(vd('wikipediaArticle'), namedNode(article));
  return quads;
}

const villageQuads: Quad[] = villages.flatMap((village) => {
  const subject = namedNode(villageIri(village.id));
  const add = (predicate: string, object: Quad_Object) => quad(subject, namedNode(predicate), object);
  return [
    add(`${PREFIXES.rdf}type`, namedNode(vd('Village'))),
    add(RDFS_LABEL, literal(village.name, 'nl')),
    ...village.altNames.map((alt) => add(SKOS_ALT_LABEL, literal(alt, 'nl'))),
    ...(village.municipality ? [add(vd('municipality'), literal(village.municipality))] : []),
    add(`${PREFIXES.schema}latitude`, literal(String(village.lat), xsd('decimal'))),
    add(`${PREFIXES.schema}longitude`, literal(String(village.lon), xsd('decimal'))),
    ...wikipediaQuads(subject, village.drowned, village.wikipedia?.article ?? null),
  ];
});
assertVocabulary(villageQuads);
await writeTurtle(dataPath('backbone', 'villages.ttl'), villageQuads, PREFIXES);

const rowQuads: Quad[] = rows.flatMap((row) => {
  const subject = namedNode(row.record);
  const add = (predicate: string, object: Quad_Object) => quad(subject, namedNode(predicate), object);
  return [
    add(`${PREFIXES.rdf}type`, namedNode(vd('WikipediaListRow'))),
    add(vd('rowNumber'), literal(String(row.row), xsd('integer'))),
    ...row.names.map((name) => add(RDFS_LABEL, literal(name, 'nl'))),
    ...row.altNames.map((name) => add(SKOS_ALT_LABEL, literal(name, 'nl'))),
    add(`${PREFIXES.dcterms}isPartOf`, namedNode(PAGE_URL)),
    add(`${PREFIXES.dcterms}source`, namedNode(page.revisionUrl)),
    ...wikipediaQuads(subject, row.drowned, row.article),
  ];
});
assertVocabulary(rowQuads);
await writeTurtle(dataPath('backbone', 'wikipedia-list.ttl'), rowQuads, PREFIXES);
await writeMatches('backbone', PAGE_URL, candidates);
await updateCombined();

const rowsWithStatus = (status: Candidate['status']) =>
  new Set(candidates.filter((c) => c.status === status).map((c) => c.record));
const unmatchedRows = rows.filter((r) => !candidates.some((c) => c.record === r.record && c.status !== 'rejected'));
console.log(
  `${villages.length} villages from ${config.backboneSource}. Wikipedia list: ${rows.length} rows, ` +
    `${rowsWithStatus('accepted').size} accepted for ${villages.filter((v) => v.wikipedia).length} villages ` +
    `(${villages.filter((v) => v.drowned).length} with a date of drowning), ` +
    `${[...rowsWithStatus('review')].filter((r) => !rowsWithStatus('accepted').has(r)).length} rows to review, ` +
    `${unmatchedRows.length} without a candidate. Candidates: ${JSON.stringify(countBy(candidates, (c) => (c.statusReason ? `${c.status}/${c.statusReason}` : c.status)))}`,
);
