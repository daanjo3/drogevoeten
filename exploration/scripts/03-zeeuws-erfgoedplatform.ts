// Zeeuws erfgoedplatform, museum objects (Collectie Zeeland): find objects about the backbone villages.
//
// 1. Reads the dataset description in exploration/datasets/ and downloads its Turtle distribution
//    into dumps/, unless it is already there (pass --refresh to download again).
// 2. Searches the dump with Comunica for object texts (title, abstract, description, types,
//    production place, references) that mention a village name or drowning. Places are free text
//    in this dataset, so matching happens on names:
//    - the village names and alternative names from data/backbone/villages.json, plus the labels
//      and aliases of its Wikidata item (from 02, if it has run);
//    - names are matched case-sensitively as whole words, so "namen" or "monster" don't match;
//    - evidence "context": the object's texts also mention drowning ("verdronken", "verdwenen", ...);
//      evidence "name": the name alone, which is often a present-day place with the same name;
//    - a name without "Oud-"/"Nieuw-" ("Hontenisse" for "Oud-Hontenisse") only counts with context.
//    Objects about drowning without a village name are listed separately as "generic", with
//    villages whose name is spelled almost the same as a word in the text as suggestions
//    ("Tolseinde" for "Tholseinde").
// 3. Adds when each object was made, to rule out objects made after a village drowned:
//    - created: the begin and end year of the production period (P108i/P4/P82a-b), available for
//      about 14% of the objects; the dataset's placeholder year 1 counts as unknown;
//    - yearsInTitle: years mentioned in the title ("Foto Noordwelle 1953"), a weaker hint because a
//      title year can also be what the object commemorates.
// 4. Writes data/zeeuws-erfgoedplatform/objects.ttl (full descriptions of all found objects) and
//    data/zeeuws-erfgoedplatform/matches.json.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { QueryEngine } from '@comunica/query-sparql-file';
import type { Quad } from '@rdfjs/types';
import { fetchText } from './lib/http.ts';
import { readJson, writeJson, writeTurtle } from './lib/io.ts';
import { escapeRegExp, escapeSparqlString, nameVariants, stem } from './lib/names.ts';
import { dataPath, dumpPath, EXPLORATION_ROOT, queryPath } from './lib/paths.ts';
import type { Village } from './lib/types.ts';

const CATALOG_FILE = join(EXPLORATION_ROOT, 'datasets', 'zeeuws-erfgoedplatform-museum-object.jsonld');
const DUMP_FILE = dumpPath('zeeuws-erfgoedplatform-museum-objecten.ttl');
const OUTPUT_DIR = dataPath('zeeuws-erfgoedplatform');
// Words that tie a text to drowned land.
const CONTEXT_PATTERN = 'verdronk|verdwen|verzwolg|verzonk|overspoeld';

const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
// The dataset writes unknown dates as 0001-01-01.
const PLACEHOLDER_YEAR = 1;
const TITLE_YEAR = /(?<!\d)(1\d{3}|20[0-2]\d)(?!\d)/g;
const WD = 'http://www.wikidata.org/entity/';

type Evidence = 'context' | 'name';

interface Dating {
  /** Production period in years; either year may be null when unknown. Null without a production period. */
  created: { beginYear: number | null; endYear: number | null } | null;
  /** Years mentioned in the title. */
  yearsInTitle: number[];
}

interface ObjectMatch extends Dating {
  object: string;
  title: string | null;
  evidence: Evidence;
  matchedNames: string[];
  fields: string[];
  /** The matched name also belongs to other backbone villages. */
  sharedName: boolean;
}

interface WikidataMatches {
  matches: { id: string; qid: string | null }[];
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

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

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

// 2. Collect the names to search for.
const villages = await readJson<Village[]>(dataPath('backbone', 'villages.json'));

const wikidataLabels = new Map<string, string[]>();
const wikidataFile = dataPath('wikidata', 'villages.ttl');
if (await exists(dataPath('wikidata', 'matches.json'))) {
  const { matches } = await readJson<WikidataMatches>(dataPath('wikidata', 'matches.json'));
  const qidByVillage = new Map(matches.filter((m) => m.qid).map((m) => [m.id, `${WD}${m.qid}`]));
  const rows = await select('wikidata-item-labels.rq', [wikidataFile], {
    ITEMS: [...new Set(qidByVillage.values())].map((iri) => `<${iri}>`).join(' '),
  });
  for (const [villageId, iri] of qidByVillage) {
    const labels = rows
      .filter((row) => row.get('item')?.value === iri)
      .map((row) => (row.get('label')?.value ?? '').replace(/\s*\(.*\)$/, '').trim());
    wikidataLabels.set(villageId, labels.filter(Boolean));
  }
  console.log(`Added Wikidata labels for ${qidByVillage.size} matched villages`);
} else {
  console.warn('No Wikidata matches found; run 02-wikidata-villages first for extra spellings.');
}

// Which villages each name refers to, and whether it needs drowning context.
const nameIndex = new Map<string, { villageId: string; needsContext: boolean }[]>();
const addName = (name: string, villageId: string, needsContext: boolean) => {
  if (name.length < 3) return;
  const entries = nameIndex.get(name) ?? [];
  if (!entries.some((e) => e.villageId === villageId)) entries.push({ villageId, needsContext });
  nameIndex.set(name, entries);
};
for (const village of villages) {
  const names = [...new Set([...nameVariants(village), ...(wikidataLabels.get(village.id) ?? [])])];
  for (const name of names) addName(name, village.id, false);
  for (const name of names) {
    const stemmed = stem(name);
    if (stemmed && !nameIndex.has(stemmed)) addName(stemmed, village.id, true);
  }
}
// Longest names first, so "Oud-Hontenisse" wins over "Hontenisse".
const allNames = [...nameIndex.keys()].sort((a, b) => b.length - a.length);
const alternation = allNames.map(escapeRegExp).join('|');
const nameRegExp = new RegExp(`(?<![\\p{L}\\p{N}])(${alternation})(?![\\p{L}\\p{N}])`, 'gu');
const contextRegExp = new RegExp(CONTEXT_PATTERN, 'i');

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

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

const matchesByVillage = new Map<string, ObjectMatch[]>();
const generic: { object: string; fields: string[]; possibleVillages: ReturnType<typeof possibleVillages> }[] = [];
for (const [object, texts] of textsByObject) {
  const hasContext = texts.some(({ text }) => contextRegExp.test(text));
  const found = new Map<string, { names: Set<string>; fields: Set<string>; shared: boolean }>();
  for (const { field, text } of texts) {
    for (const [, name] of text.matchAll(nameRegExp)) {
      const entries = nameIndex.get(name) ?? [];
      for (const { villageId, needsContext } of entries) {
        if (needsContext && !hasContext) continue;
        const hit = found.get(villageId) ?? { names: new Set(), fields: new Set(), shared: false };
        hit.names.add(name);
        hit.fields.add(field);
        hit.shared ||= entries.length > 1;
        found.set(villageId, hit);
      }
    }
  }
  if (found.size === 0) {
    if (hasContext) {
      generic.push({
        object,
        fields: [...new Set(texts.map((t) => t.field))],
        possibleVillages: possibleVillages(texts),
      });
    }
    continue;
  }
  for (const [villageId, hit] of found) {
    const list = matchesByVillage.get(villageId) ?? [];
    list.push({
      object,
      title: null,
      evidence: hasContext ? 'context' : 'name',
      created: null,
      yearsInTitle: [],
      matchedNames: [...hit.names],
      fields: [...hit.fields],
      sharedName: hit.shared,
    });
    matchesByVillage.set(villageId, list);
  }
}

// 3. Describe all found objects and write the results.
const objects = [
  ...new Set([...[...matchesByVillage.values()].flat().map((m) => m.object), ...generic.map((g) => g.object)]),
];
const quads = objects.length
  ? await construct('zeeuws-erfgoedplatform-objects.rq', [DUMP_FILE], {
      OBJECTS: objects.map((iri) => `<${iri}>`).join(' '),
    })
  : [];
const titles = new Map(
  quads
    .filter((q) => q.predicate.value === RDFS_LABEL && objects.includes(q.subject.value))
    .map((q) => [q.subject.value, q.object.value]),
);

// When the objects were made.
const yearOf = (dateTime: string | undefined): number | null => {
  const year = dateTime ? Number.parseInt(dateTime.match(/^(-?\d+)-/)?.[1] ?? '', 10) : Number.NaN;
  return Number.isNaN(year) || year === PLACEHOLDER_YEAR ? null : year;
};
const dateRows = objects.length
  ? await select('zeeuws-erfgoedplatform-dates.rq', [DUMP_FILE], {
      OBJECTS: objects.map((iri) => `<${iri}>`).join(' '),
    })
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

for (const list of matchesByVillage.values()) {
  for (const m of list) Object.assign(m, { title: titles.get(m.object) ?? null, ...datingOf(m.object) });
}

await writeTurtle(join(OUTPUT_DIR, 'objects.ttl'), quads, {
  crm: 'http://www.cidoc-crm.org/cidoc-crm/',
  schema: 'https://schema.org/',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  aat: 'http://vocab.getty.edu/aat/',
  hdl: 'https://hdl.handle.net/21.12128/',
});
await writeJson(join(OUTPUT_DIR, 'matches.json'), {
  dataset,
  villages: villages
    .filter((v) => matchesByVillage.has(v.id))
    .map((v) => ({ id: v.id, name: v.name, objects: matchesByVillage.get(v.id) })),
  generic: generic.map((g) => ({ ...g, title: titles.get(g.object) ?? null, ...datingOf(g.object) })),
});

const all = [...matchesByVillage.values()].flat();
console.log(
  `${matchesByVillage.size} villages with objects: ${all.filter((m) => m.evidence === 'context').length} matches with ` +
    `drowning context, ${all.filter((m) => m.evidence === 'name').length} on name only. ` +
    `${generic.length} generic objects about drowning. ${objects.length} objects described, ` +
    `${objects.filter((o) => created.has(o)).length} with a production date and ` +
    `${objects.filter((o) => datingOf(o).yearsInTitle.length).length} with a year in the title.`,
);
