// Zeeuws erfgoedplatform, museum objects (Collectie Zeeland): find objects about the backbone villages.
//
// 1. Reads the dataset description in exploration/datasets/ and downloads its Turtle distribution
//    into dumps/, unless it is already there (pass --refresh to download again).
// 2. Searches the dump with Comunica for object texts (title, abstract, description, types,
//    production place, references) that mention a village name or drowning, and matches them
//    following the SOP. Places are free text in this dataset, so matching happens on names from the
//    shared name index (backbone, Wikipedia list and Wikidata names):
//    - names are matched case-sensitively as whole words, so "namen" or "monster" don't match;
//    - a name in the production place is place-name; in other texts it is text-context when the
//      object's texts also mention drowning ("verdronken", "verdwenen", ...), else text-name;
//    - a name without "Oud-"/"Nieuw-" ("Hontenisse" for "Oud-Hontenisse") only counts with context,
//      because on its own it names the present-day village;
//    - homonyms (present-day places with the same name, from the wikidata step) and names shared by
//      several backbone villages need review; locations of one village ("Oud-Hontenisse 1" and "2")
//      sharing a name is not a tie.
//    Objects about drowning without a village name are generic candidates, with villages whose name
//    is spelled almost the same as a word in the text as suggestions ("Tolseinde" for "Tolsende").
// 3. Adds when each object was made, so objects made after a village drowned can be ruled out later:
//    - created: the begin and end year of the production period (P108i/P4/P82a-b), available for
//      about 14% of the objects; the dataset's placeholder year 1 counts as unknown;
//    - yearsInTitle: years mentioned in the title ("Foto Noordwelle 1953"), a weaker hint because a
//      title year can also be what the object commemorates.
// 4. Writes data/zeeuws-erfgoedplatform/objects.ttl (full descriptions of all found objects),
//    matches.json and matches.ttl (all candidates) and accepted.ttl, and rebuilds data/combined.ttl.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { QueryEngine } from '@comunica/query-sparql-file';
import type { Quad } from '@rdfjs/types';
import { DataFactory } from 'n3';
import { writeAccepted } from './lib/combined.ts';
import { fetchText } from './lib/http.ts';
import { exists, readJson, writeJson, writeTurtle } from './lib/io.ts';
import {
  applyOverrides,
  buildNameIndex,
  type Candidate,
  CONTEXT_PATTERN,
  countBy,
  loadHomonyms,
  loadWikidataLabels,
  locationGroup,
  ORIGIN_STRENGTH,
  statusFor,
  villageQuad,
  writeMatches,
} from './lib/matching.ts';
import { editDistance, escapeRegExp, escapeSparqlString } from './lib/names.ts';
import { dataPath, dumpPath, EXPLORATION_ROOT, queryPath } from './lib/paths.ts';
import type { Village } from './lib/types.ts';
import { PREFIXES } from './lib/vocab.ts';

const SOURCE = 'zeeuws-erfgoedplatform';
const CATALOG_FILE = join(EXPLORATION_ROOT, 'datasets', 'zeeuws-erfgoedplatform-museum-object.jsonld');
const DUMP_FILE = dumpPath('zeeuws-erfgoedplatform-museum-objecten.ttl');
const OUTPUT_DIR = dataPath(SOURCE);
// The structured place field of this dataset, as named by the texts query.
const PLACE_FIELDS = new Set(['productionPlace']);

const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
// The dataset writes unknown dates as 0001-01-01.
const PLACEHOLDER_YEAR = 1;
const TITLE_YEAR = /(?<!\d)(1\d{3}|20[0-2]\d)(?!\d)/g;

interface Dating {
  /** Production period in years; either year may be null when unknown. Null without a production period. */
  created: { beginYear: number | null; endYear: number | null } | null;
  /** Years mentioned in the title. */
  yearsInTitle: number[];
}

const refresh = process.argv.includes('--refresh');
const engine = new QueryEngine();

async function select(queryFile: string, sources: string[], replacements: Record<string, string> = {}) {
  let query = await readFile(queryPath(queryFile), 'utf8');
  for (const [key, value] of Object.entries(replacements)) query = query.replace(`{{${key}}}`, value);
  const stream = await engine.queryBindings(query, { sources: sources.map((value) => ({ type: 'file', value })) });
  return stream.toArray();
}

async function construct(queryFile: string, sources: string[], replacements: Record<string, string>): Promise<Quad[]> {
  let query = await readFile(queryPath(queryFile), 'utf8');
  for (const [key, value] of Object.entries(replacements)) query = query.replace(`{{${key}}}`, value);
  const stream = await engine.queryQuads(query, { sources: sources.map((value) => ({ type: 'file', value })) });
  return stream.toArray();
}

// 1. Find and download the dump.
const [distribution] = await select('zeeuws-erfgoedplatform-distribution.rq', [CATALOG_FILE]);
if (!distribution) throw new Error(`No Turtle distribution found in ${CATALOG_FILE}`);
const dataset = {
  iri: distribution.get('dataset')?.value ?? null,
  url: distribution.get('url')?.value ?? '',
  license: distribution.get('license')?.value ?? null,
  modified: distribution.get('modified')?.value ?? null,
};
console.log(`Dataset ${dataset.iri} (modified ${dataset.modified}, licence ${dataset.license})`);

if (refresh || !(await exists(DUMP_FILE))) {
  console.log(`Downloading ${dataset.url}`);
  const body = await fetchText(dataset.url, {
    validate: (text) => {
      if (/^\s*(<!doctype|<html)/i.test(text)) throw new Error('Expected Turtle, got an HTML page');
    },
  });
  await mkdir(dirname(DUMP_FILE), { recursive: true });
  await writeFile(DUMP_FILE, body);
  console.log(`Wrote ${DUMP_FILE}`);
} else {
  console.log(`Using cached dump ${DUMP_FILE} (pass --refresh to download again)`);
}

// 2. Search the dump for the names in the name index.
const villages = await readJson<Village[]>(dataPath('backbone', 'villages.json'));
const nameIndex = buildNameIndex(villages, await loadWikidataLabels());
const homonyms = await loadHomonyms();
const groupOf = new Map(villages.map((v) => [v.id, locationGroup(v)]));

// Longest names first, so "Oud-Hontenisse" wins over "Hontenisse".
const allNames = [...nameIndex.keys()].sort((a, b) => b.length - a.length);
const alternation = allNames.map(escapeRegExp).join('|');
const nameRegExp = new RegExp(`(?<![\\p{L}\\p{N}])(${alternation})(?![\\p{L}\\p{N}])`, 'gu');
const contextRegExp = new RegExp(CONTEXT_PATTERN, 'i');

// Suggestions for texts without an exact name: capitalized words that are spelled almost like a name.
const MIN_FUZZY_LENGTH = 6;
const fuzzyNames = allNames.filter((name) => name.length >= MIN_FUZZY_LENGTH && !/\s/.test(name));
function possibleVillages(texts: { text: string }[]): { villageId: string; word: string; name: string }[] {
  const words = new Set(texts.flatMap(({ text }) => text.match(/\p{Lu}[\p{L}-]{5,}/gu) ?? []));
  const suggestions = [];
  for (const word of words) {
    for (const name of fuzzyNames) {
      if (Math.abs(word.length - name.length) > 2 || editDistance(word.toLowerCase(), name.toLowerCase()) > 2) continue;
      for (const { villageId } of nameIndex.get(name) ?? []) suggestions.push({ villageId, word, name });
    }
  }
  return suggestions;
}

console.log(`Searching ${DUMP_FILE} for ${allNames.length} names`);
const rows = await select('zeeuws-erfgoedplatform-texts.rq', [DUMP_FILE], {
  NAMES: escapeSparqlString(alternation),
  CONTEXT: escapeSparqlString(CONTEXT_PATTERN),
});
console.log(`${rows.length} matching texts`);

// Group the texts per object.
const textsByObject = new Map<string, { field: string; text: string }[]>();
for (const row of rows) {
  const object = row.get('object')?.value ?? '';
  const texts = textsByObject.get(object) ?? [];
  texts.push({ field: row.get('field')?.value ?? '', text: row.get('text')?.value ?? '' });
  textsByObject.set(object, texts);
}

const candidates: Candidate[] = [];
const suggestionsByObject = new Map<string, ReturnType<typeof possibleVillages>>();
for (const [object, texts] of textsByObject) {
  const hasContext = texts.some(({ text }) => contextRegExp.test(text));
  const found = new Map<
    string,
    { names: Set<string>; origins: Set<Candidate['nameOrigin']>; fields: Set<string>; shared: boolean[] }
  >();
  for (const { field, text } of texts) {
    for (const [, name] of text.matchAll(nameRegExp)) {
      const entries = nameIndex.get(name) ?? [];
      for (const { villageId, origin } of entries) {
        if (origin === 'stem' && !hasContext) continue;
        const hit = found.get(villageId) ?? { names: new Set(), origins: new Set(), fields: new Set(), shared: [] };
        hit.names.add(name);
        hit.origins.add(origin);
        hit.fields.add(field);
        hit.shared.push(new Set(entries.map((e) => groupOf.get(e.villageId))).size > 1);
        found.set(villageId, hit);
      }
    }
  }
  if (found.size === 0) {
    if (hasContext) {
      const suggestions = possibleVillages(texts);
      suggestionsByObject.set(object, suggestions);
      candidates.push({
        village: null,
        record: object,
        matchedBy: 'generic',
        fields: [...new Set(texts.map((t) => t.field))],
        status: null,
        suggestedVillages: [...new Set(suggestions.map((s) => s.villageId))],
      });
    }
    continue;
  }
  for (const [villageId, hit] of found) {
    const matchedBy = [...hit.fields].some((f) => PLACE_FIELDS.has(f))
      ? 'place-name'
      : hasContext
        ? 'text-context'
        : 'text-name';
    const nameOrigin = [...hit.origins].reduce((a, b) =>
      a && ORIGIN_STRENGTH[a] >= ORIGIN_STRENGTH[b ?? 'stem'] ? a : b,
    );
    const homonym = [...hit.names].every((name) => homonyms.has(name));
    let status = statusFor(matchedBy, { homonym });
    // A name that several backbone villages share (Westkerke, Oostkerke) doesn't tell them apart.
    if (status.status === 'accepted' && hit.shared.every(Boolean)) status = { status: 'review', statusReason: 'tie' };
    candidates.push({
      village: villageId,
      record: object,
      matchedBy,
      nameOrigin,
      matchedNames: [...hit.names],
      fields: [...hit.fields],
      ...status,
    });
  }
}
await applyOverrides(SOURCE, candidates, new Set(villages.map((v) => v.id)));

// 3. Describe all found objects, with when they were made.
const objects = [...new Set(candidates.map((c) => c.record))];
const objectValues = objects.map((iri) => `<${iri}>`).join(' ');
const quads = objects.length
  ? await construct('zeeuws-erfgoedplatform-objects.rq', [DUMP_FILE], { OBJECTS: objectValues })
  : [];
const titles = new Map(
  quads
    .filter((q) => q.predicate.value === RDFS_LABEL && objects.includes(q.subject.value))
    .map((q) => [q.subject.value, q.object.value]),
);

const yearOf = (dateTime: string | undefined): number | null => {
  const year = dateTime ? Number.parseInt(dateTime.match(/^(-?\d+)-/)?.[1] ?? '', 10) : Number.NaN;
  return Number.isNaN(year) || year === PLACEHOLDER_YEAR ? null : year;
};
const dateRows = objects.length
  ? await select('zeeuws-erfgoedplatform-dates.rq', [DUMP_FILE], { OBJECTS: objectValues })
  : [];
const created = new Map<string, NonNullable<Dating['created']>>();
for (const row of dateRows) {
  const object = row.get('object')?.value ?? '';
  const begin = yearOf(row.get('begin')?.value);
  const end = yearOf(row.get('end')?.value);
  // An object with several production periods spans all of them.
  const known = created.get(object);
  const min = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));
  const max = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));
  created.set(object, { beginYear: min(known?.beginYear ?? null, begin), endYear: max(known?.endYear ?? null, end) });
}
const datingOf = (object: string): Dating => ({
  created: created.get(object) ?? null,
  yearsInTitle: [...new Set([...(titles.get(object) ?? '').matchAll(TITLE_YEAR)].map((m) => Number(m[1])))],
});

// 4. Write the results.
const objectPrefixes = {
  crm: 'http://www.cidoc-crm.org/cidoc-crm/',
  schema: 'https://schema.org/',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  aat: 'http://vocab.getty.edu/aat/',
  hdl: 'https://hdl.handle.net/21.12128/',
};
await writeTurtle(join(OUTPUT_DIR, 'objects.ttl'), quads, objectPrefixes);

const describe = (c: Candidate) => ({ ...c, title: titles.get(c.record) ?? null, ...datingOf(c.record) });
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
  generic: candidates
    .filter((c) => c.village === null)
    .map((c) => ({ ...describe(c), possibleVillages: suggestionsByObject.get(c.record) ?? [] })),
});
await writeMatches(SOURCE, dataset.iri ?? dataset.url, candidates);

// Accepted: the link from the village to the object, and the object's description.
const { namedNode } = DataFactory;
const accepted = candidates.filter(
  (c): c is Candidate & { village: string } => c.status === 'accepted' && c.village !== null,
);
const acceptedObjects = new Set(accepted.map((c) => c.record));
/** The objects' own triples, the blank nodes they lead to, and the labels of the types and places they name. */
function descriptionOf(subjects: Set<string>): Quad[] {
  const reached = new Set(subjects);
  for (let added = true; added; ) {
    added = false;
    for (const q of quads) {
      if (reached.has(q.subject.value) && q.object.termType === 'BlankNode' && !reached.has(q.object.value)) {
        reached.add(q.object.value);
        added = true;
      }
    }
  }
  const own = quads.filter((q) => reached.has(q.subject.value));
  const named = new Set(own.filter((q) => q.object.termType === 'NamedNode').map((q) => q.object.value));
  return [...own, ...quads.filter((q) => named.has(q.subject.value) && q.predicate.value === RDFS_LABEL)];
}
await writeAccepted(SOURCE, [
  ...accepted.map((c) => villageQuad(c.village, `${PREFIXES.schema}subjectOf`, namedNode(c.record))),
  ...descriptionOf(acceptedObjects),
]);

const withVillage = candidates.filter((c) => c.village !== null);
console.log(
  `${new Set(withVillage.map((c) => c.village)).size} villages with objects. Candidates: ` +
    `${JSON.stringify(countBy(withVillage, (c) => (c.statusReason ? `${c.status}/${c.statusReason}` : c.status)))}, ` +
    `by key ${JSON.stringify(countBy(withVillage, (c) => c.matchedBy))}. ` +
    `${candidates.length - withVillage.length} generic objects about drowning. ${objects.length} objects described, ` +
    `${objects.filter((o) => created.has(o)).length} with a production date and ` +
    `${objects.filter((o) => datingOf(o).yearsInTitle.length).length} with a year in the title.`,
);
