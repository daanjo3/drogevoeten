// Shared matching of source records to backbone villages, as described in docs/exploration-sop.md
// ("Matching villages"): the name index, homonyms, statuses, overrides and the match output.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { QueryEngine } from '@comunica/query-sparql-file';
import type { Quad, Quad_Object, Quad_Subject } from '@rdfjs/types';
import { DataFactory } from 'n3';
import { exists, readJson, writeTurtle } from './io.ts';
import { numberless, spellingKey, stem } from './names.ts';
import { DATA_DIR, dataPath, OVERRIDES_FILE, queryPath } from './paths.ts';
import type { Village } from './types.ts';
import {
  assertVocabulary,
  concept,
  type MatchKey,
  type NameOrigin,
  PREFIXES,
  type Status,
  type StatusReason,
  vd,
  villageIri,
} from './vocab.ts';

/**
 * Words that tie a text to drowned land. "Verdwenen" alone is too common ("de ramen zijn verdwenen"),
 * so it only counts for a vanished settlement.
 */
export const CONTEXT_PATTERN = 'verdronk|verzwolg|verzonk|overspoel|verdwenen (dorp|stad|parochie|nederzetting|kerk)';

/** How close, in characters, drowning words must be to a name in the same text to count as its context. */
export const CONTEXT_WINDOW = 150;

const contextRegExp = new RegExp(CONTEXT_PATTERN, 'i');

/** Whether the text mentions drowning anywhere. */
export const mentionsDrowning = (text: string): boolean => contextRegExp.test(text);

/** Whether drowning words occur within CONTEXT_WINDOW characters of the name at `index` in the text. */
export const contextNear = (text: string, index: number, length: number): boolean =>
  contextRegExp.test(text.slice(Math.max(0, index - CONTEXT_WINDOW), index + length + CONTEXT_WINDOW));

/** Default distance threshold between a record's coordinates and the backbone point. */
export const MAX_DISTANCE_KM = 5;

/** Names shorter than this are left out of the index: they match too many ordinary words. */
const MIN_NAME_LENGTH = 3;

/** How much a match on a name proves, by origin. Higher is stronger. */
export const ORIGIN_STRENGTH: Record<NameOrigin, number> = {
  primary: 3,
  numberless: 3,
  wikipedia: 2,
  wikidata: 2,
  alt: 1,
  stem: 0,
};

export interface NameEntry {
  name: string;
  villageId: string;
  origin: NameOrigin;
}

/**
 * All names of a village with their origin, strongest first. A name is listed once, with its
 * strongest origin.
 */
export function villageNames(village: Village, wikidataLabels: string[] = []): NameEntry[] {
  const entries = new Map<string, NameEntry>();
  const add = (name: string | null, origin: NameOrigin) => {
    const trimmed = name?.trim();
    if (!trimmed || trimmed.length < MIN_NAME_LENGTH || entries.has(trimmed)) return;
    entries.set(trimmed, { name: trimmed, villageId: village.id, origin });
  };
  add(village.name, 'primary');
  add(numberless(village.name), 'numberless');
  for (const name of village.wikipedia?.names ?? []) add(name, 'wikipedia');
  for (const name of wikidataLabels) add(name, 'wikidata');
  for (const name of village.altNames) add(name, 'alt');
  for (const name of village.altNames) add(numberless(name), 'alt');
  for (const { name } of [...entries.values()]) add(stem(name), 'stem');
  return [...entries.values()];
}

/** Which villages each name refers to, for the names of all villages. */
export function buildNameIndex(villages: Village[], wikidataLabels = new Map<string, string[]>()) {
  const index = new Map<string, NameEntry[]>();
  for (const village of villages) {
    for (const entry of villageNames(village, wikidataLabels.get(village.id))) {
      index.set(entry.name, [...(index.get(entry.name) ?? []), entry]);
    }
  }
  return index;
}

const WD = 'http://www.wikidata.org/entity/';

/**
 * The labels and aliases of the Wikidata item accepted for each village, from the output of the
 * wikidata step. Empty, with a warning, when that step hasn't run.
 */
export async function loadWikidataLabels(): Promise<Map<string, string[]>> {
  const labels = new Map<string, string[]>();
  const matchesFile = dataPath('wikidata', 'matches.json');
  if (!(await exists(matchesFile))) {
    console.warn('No Wikidata matches found; run the wikidata step first for extra spellings.');
    return labels;
  }
  const { matches } = await readJson<{ matches: { id: string; qid: string | null }[] }>(matchesFile);
  const qidByVillage = new Map(matches.filter((m) => m.qid).map((m) => [m.id, `${WD}${m.qid}`]));
  if (qidByVillage.size === 0) return labels;
  const query = (await readFile(queryPath('wikidata-item-labels.rq'), 'utf8')).replace(
    '{{ITEMS}}',
    [...new Set(qidByVillage.values())].map((iri) => `<${iri}>`).join(' '),
  );
  const stream = await new QueryEngine().queryBindings(query, {
    sources: [{ type: 'file', value: dataPath('wikidata', 'villages.ttl') }],
  });
  const rows = await stream.toArray();
  for (const [villageId, iri] of qidByVillage) {
    const itemLabels = rows
      .filter((row) => row.get('item')?.value === iri)
      // Drop disambiguating suffixes such as "Westkerke (Goes)".
      .map((row) => (row.get('label')?.value ?? '').replace(/\s*\(.*\)$/, '').trim());
    labels.set(villageId, [...new Set(itemLabels.filter(Boolean))]);
  }
  console.log(`Added Wikidata labels for ${qidByVillage.size} matched villages`);
  return labels;
}

export interface Homonym {
  name: string;
  items: { qid: string; label: string | null; classes: string[] }[];
}

/**
 * Names that are also the name of a present-day place, derived by the wikidata step
 * (data/wikidata/homonyms.json). Empty, with a warning, when that step hasn't run.
 */
export async function loadHomonyms(): Promise<Set<string>> {
  const file = dataPath('wikidata', 'homonyms.json');
  if (!(await exists(file))) {
    console.warn('No homonym list found; run the wikidata step first. Treating no name as a homonym.');
    return new Set();
  }
  const homonyms = await readJson<Homonym[]>(file);
  return new Set(homonyms.map((h) => h.name));
}

/**
 * The village a backbone location belongs to: numbered locations of one village ("Oud-Hontenisse 1"
 * and "2") share a group; any other village is a group of its own. A name shared within one group is
 * not a tie.
 */
export const locationGroup = (village: Village): string =>
  numberless(village.name) === village.name ? village.id : spellingKey(numberless(village.name));

export function distanceKm([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** A possible link between a village and a record. Generic candidates have no village and no status. */
export interface Candidate {
  village: string | null;
  record: string;
  matchedBy: MatchKey;
  nameOrigin?: NameOrigin;
  matchedNames?: string[];
  fields?: string[];
  status: Status | null;
  statusReason?: StatusReason;
  overrideNote?: string;
  distanceKm?: number;
  classRank?: number;
  editDistance?: number;
  suggestedVillages?: string[];
}

/**
 * The status the SOP gives a candidate with this match key, before checks that need other candidates
 * (ties, better matches) or source-specific data (distance, class). Null for generic candidates.
 */
export function statusFor(
  matchedBy: MatchKey,
  {
    homonym = false,
    context = false,
    editDistance = 0,
  }: { homonym?: boolean; context?: boolean; editDistance?: number } = {},
): Pick<Candidate, 'status' | 'statusReason'> {
  if (matchedBy === 'generic') return { status: null };
  if (editDistance > 0) return { status: 'review', statusReason: 'spelling' };
  switch (matchedBy) {
    case 'identifier':
      return { status: 'accepted' };
    case 'place-geo':
    case 'place-name':
      // A place field on its own can't tell a present-day place from the drowned village next to it,
      // not even with coordinates: Schore and Borssele lie right next to their drowned namesakes.
      return homonym && !context ? { status: 'review', statusReason: 'homonym' } : { status: 'accepted' };
    case 'text-context':
      // Drowning words next to the name: "verdronken dorp Westdorpe".
      return { status: 'accepted' };
    case 'location':
    case 'text-name':
      return { status: 'review', statusReason: homonym ? 'homonym' : 'weak-key' };
  }
}

interface Override {
  source: string;
  village: string;
  record: string;
  decision: 'accept' | 'reject';
  reason: string;
  date?: string;
}

async function loadOverrides(): Promise<Override[]> {
  if (!(await exists(OVERRIDES_FILE))) return [];
  const overrides = await readJson<Override[]>(OVERRIDES_FILE);
  if (!Array.isArray(overrides)) throw new Error(`${OVERRIDES_FILE} must contain a JSON array`);
  for (const o of overrides) {
    const valid =
      typeof o.source === 'string' &&
      typeof o.village === 'string' &&
      typeof o.record === 'string' &&
      (o.decision === 'accept' || o.decision === 'reject') &&
      typeof o.reason === 'string' &&
      o.reason.trim() !== '';
    if (!valid) {
      throw new Error(
        `Invalid override in ${OVERRIDES_FILE}: ${JSON.stringify(o)}. ` +
          'Expected source, village, record, decision ("accept" or "reject") and a reason.',
      );
    }
  }
  return overrides;
}

/**
 * Applies the manual decisions in exploration/resources/match-overrides.json for this source. An
 * accepted override on a generic record adds a candidate for the village. Overrides whose village or
 * record no longer exists are reported, not fatal.
 */
export async function applyOverrides(source: string, candidates: Candidate[], villageIds: Set<string>) {
  const overrides = (await loadOverrides()).filter((o) => o.source === source);
  let applied = 0;
  for (const o of overrides) {
    if (!villageIds.has(o.village)) {
      console.warn(`Override skipped: village "${o.village}" no longer exists (${o.record})`);
      continue;
    }
    const status: Status = o.decision === 'accept' ? 'accepted' : 'rejected';
    const existing = candidates.find((c) => c.village === o.village && c.record === o.record);
    if (existing) {
      Object.assign(existing, { status, statusReason: 'override', overrideNote: o.reason });
      applied++;
      continue;
    }
    const generic = candidates.find((c) => c.village === null && c.record === o.record);
    if (generic) {
      candidates.push({
        village: o.village,
        record: o.record,
        matchedBy: 'generic',
        status,
        statusReason: 'override',
        overrideNote: o.reason,
      });
      applied++;
      continue;
    }
    console.warn(`Override skipped: no candidate for ${o.village} and ${o.record} in ${source}`);
  }
  if (overrides.length) console.log(`Applied ${applied} of ${overrides.length} overrides for ${source}`);
  return candidates;
}

const { namedNode, literal, blankNode, quad } = DataFactory;

/** The candidates as RDF (vd:Candidate nodes), for matches.ttl. */
export function candidateQuads(sourceIri: string, candidates: Candidate[]): Quad[] {
  const quads: Quad[] = [];
  const decimal = namedNode(`${PREFIXES.xsd}decimal`);
  const integer = namedNode(`${PREFIXES.xsd}integer`);
  for (const c of candidates) {
    const node = blankNode();
    const add = (local: string, object: Quad_Object) => quads.push(quad(node, namedNode(vd(local)), object));
    quads.push(quad(node, namedNode(`${PREFIXES.rdf}type`), namedNode(vd('Candidate'))));
    if (c.village) add('village', namedNode(villageIri(c.village)));
    add('record', namedNode(c.record));
    add('source', namedNode(sourceIri));
    add('matchedBy', namedNode(concept.matchKey(c.matchedBy)));
    if (c.nameOrigin) add('nameOrigin', namedNode(concept.nameOrigin(c.nameOrigin)));
    for (const name of c.matchedNames ?? []) add('matchedName', literal(name));
    for (const field of c.fields ?? []) add('matchedField', literal(field));
    if (c.status) add('status', namedNode(concept.status(c.status)));
    if (c.statusReason) add('statusReason', namedNode(concept.statusReason(c.statusReason)));
    if (c.overrideNote) add('overrideNote', literal(c.overrideNote));
    if (c.distanceKm !== undefined) add('distanceKm', literal(String(c.distanceKm), decimal));
    if (c.classRank !== undefined) add('classRank', literal(String(c.classRank), integer));
    if (c.editDistance) add('editDistance', literal(String(c.editDistance), integer));
    for (const village of c.suggestedVillages ?? []) add('suggestedVillage', namedNode(villageIri(village)));
  }
  return quads;
}

/** Writes data/<source>/matches.ttl: all candidates, plus any extra quads (labels, village statuses). */
export async function writeMatches(
  source: string,
  sourceIri: string,
  candidates: Candidate[],
  extra: Quad[] = [],
): Promise<void> {
  const quads = [...candidateQuads(sourceIri, candidates), ...extra];
  assertVocabulary(quads);
  await writeTurtle(join(DATA_DIR, source, 'matches.ttl'), quads, PREFIXES);
}

/** A triple about a village, for accepted.ttl. */
export const villageQuad = (villageId: string, predicate: string, object: Quad_Object): Quad =>
  quad(namedNode(villageIri(villageId)) as Quad_Subject, namedNode(predicate), object);

export const countBy = <T>(items: T[], key: (item: T) => string | null | undefined): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item) ?? 'none';
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
};
