// Volksverhalenbank van de Lage Landen (Meertens Instituut): find folktales about the backbone villages.
//
// 1. Searches the Omeka Classic REST API (https://www.verhalenbank.nl/api/items, JSON only, no dump)
//    for stories (item type "Volksverhaal"), within the request budget of the SOP:
//    - a full-text search for each word in CONTEXT_SEARCHES ("verdronken"), about 2 pages;
//    - the village names as exact values of the field "Named Entity Location", batched into a few
//      requests with one advanced search row of type "matches" (MySQL REGEXP, "^(name|name|...)$").
//      The full-text search can't batch names, because it combines words with AND. A row per name
//      joined by OR works too, but Omeka adds a table join per row, and 53 rows got an HTTP 502.
//    Homonyms (present-day places such as Oostende or Kapelle) go in batches of their own, fetched
//    last and only as far as the budget allows: they can return thousands of Flemish stories.
//    Every response is cached in dumps/verhalenbank/requests/ and reused unless --refresh is passed;
//    a changed batch (another name list) is a new request.
// 2. Matches the stories following the SOP:
//    - a name in "Named Entity Location" or "Place of Action" is place-name, compared by spelling
//      key; a Place of Action in another province ("Monster (Zuid-Holland)") is rejected (location);
//    - a name in the title, summary or text is text-context with drowning words near it, else
//      text-name; a name without "Oud-"/"Nieuw-" only counts with context near it;
//    - homonyms need context near the name, also in a place field; a name shared by several
//      villages is a tie; a match on alternative names only needs review (alt-name);
//    - stories about drowned land ("verdronken dorp", "verzonken stad") that name no village are
//      generic, with near spellings as suggestions.
//    "Coverage" (where a story was recorded) is kept but not matched: it names where the teller
//    lived, not what the story is about.
// 3. Writes data/verhalenbank/stories.json and stories.ttl (the found stories), matches.json and
//    matches.ttl (all candidates) and accepted.ttl, and rebuilds data/combined.ttl.
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Quad, Quad_Object } from '@rdfjs/types';
import { DataFactory } from 'n3';
import { writeAccepted } from './lib/combined.ts';
import { fetchWithUserAgent } from './lib/http.ts';
import { exists, readJson, writeJson, writeTurtle } from './lib/io.ts';
import {
  applyOverrides,
  buildNameIndex,
  type Candidate,
  contextNear,
  countBy,
  loadHomonyms,
  loadWikidataLabels,
  locationGroup,
  ORIGIN_STRENGTH,
  statusFor,
  villageQuad,
  writeMatches,
} from './lib/matching.ts';
import { editDistance, escapeRegExp, spellingKey } from './lib/names.ts';
import { dataPath, dumpPath } from './lib/paths.ts';
import type { Village } from './lib/types.ts';
import type { NameOrigin } from './lib/vocab.ts';
import { PREFIXES } from './lib/vocab.ts';

const SOURCE = 'verhalenbank';
const SITE = 'https://www.verhalenbank.nl/';
const API = `${SITE}api/items`;
const OUTPUT_DIR = dataPath(SOURCE);
const CACHE_DIR = dumpPath(SOURCE, 'requests');

/** At most this many requests to the host per run (the SOP's request budget). Cached responses don't count. */
const REQUEST_BUDGET = 10;
/** Pause between requests. */
const REQUEST_DELAY_MS = 1_000;
/** Item type "Volksverhaal"; the other types are tale types, motifs, persons and lexicon items. */
const STORY_TYPE = 18;
/** Element "Named Entity Location": one place mentioned in the story per value. */
const NAMED_ENTITY_LOCATION = 93;
/** Names per REGEXP search; the URL then stays well below nginx's default limit of 8 KB. */
const MAX_BATCH_NAMES = 100;
/** Full-text searches for stories about drowning. */
const CONTEXT_SEARCHES = ['verdronken'];
/** Names of these origins are searched in Named Entity Location; weaker ones are matched locally only. */
const SEARCHED_ORIGINS = new Set<NameOrigin>(['primary', 'numberless', 'wikipedia', 'wikidata']);

const PLACE_FIELDS = ['Named Entity Location', 'Place of Action'];
const TEXT_FIELDS = ['Title', 'Description', 'Text'];
/** Drowned land, for generic stories. Plain "verdronken" mostly means that a person drowned. */
const DROWNED_LAND_PATTERN =
  '(?:verdronken|verzonken|verdwenen|vergane?)\\s+(?:land|dorp|dorpen|stad|steden|parochie|kerk|klok|klokken|heerlijkhe|eiland)';
const MIN_FUZZY_LENGTH = 6;
const YEAR = /(?<!\d)(1\d{3}|20[0-2]\d)(?!\d)/g;

const refresh = process.argv.includes('--refresh');

interface ElementText {
  text: string;
  element: { id: number; name: string };
  element_set: { name: string };
}

interface OmekaItem {
  id: number;
  collection: { id: number } | null;
  item_type: { id: number; name: string } | null;
  element_texts: ElementText[];
}

interface CachedPage {
  url: string;
  fetchedAt: string;
  totalResults: number;
  items: OmekaItem[];
}

interface Search {
  label: string;
  params: string;
  /** Fetched only as far as the budget allows, after all other searches. */
  optional: boolean;
  names?: string[];
}

interface SearchResult {
  label: string;
  url: string;
  names?: string[];
  totalResults: number;
  fetched: number;
  truncated: boolean;
}

// 1. Search the API.
let requests = 0;
const cacheFile = (url: string) =>
  join(CACHE_DIR, `${createHash('sha256').update(url).digest('hex').slice(0, 16)}.json`);
const isCached = async (url: string) => !refresh && (await exists(cacheFile(url)));

async function fetchPage(url: string): Promise<CachedPage> {
  const file = cacheFile(url);
  if (await isCached(url)) return readJson<CachedPage>(file);
  if (requests >= REQUEST_BUDGET) throw new Error(`Request budget of ${REQUEST_BUDGET} exceeded before ${url}`);
  if (requests > 0) await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  requests++;
  console.log(`Request ${requests}/${REQUEST_BUDGET}: ${url.slice(0, 150)}${url.length > 150 ? '…' : ''}`);
  // No retries: every attempt counts against the budget. A rerun reuses the pages already cached.
  const response = await fetchWithUserAgent(url, { signal: AbortSignal.timeout(120_000) });
  const body = await response.text();
  if (!response.ok)
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}\n${body.slice(0, 1000)}`);
  const items: unknown = JSON.parse(body);
  if (!Array.isArray(items)) throw new Error(`Expected a JSON array of items from ${url}, got ${body.slice(0, 500)}`);
  const totalResults = Number(response.headers.get('omeka-total-results'));
  if (Number.isNaN(totalResults)) throw new Error(`No Omeka-Total-Results header for ${url}`);
  const page: CachedPage = { url, fetchedAt: new Date().toISOString(), totalResults, items: items as OmekaItem[] };
  await writeJson(file, page);
  return page;
}

async function runSearch(search: Search, items: Map<number, OmekaItem>): Promise<SearchResult> {
  const url = (page: number) => `${API}?${search.params}&page=${page}`;
  let fetched = 0;
  let totalResults = 0;
  let truncated = false;
  for (let page = 1; ; page++) {
    if (search.optional && requests >= REQUEST_BUDGET && !(await isCached(url(page)))) {
      truncated = true;
      console.warn(`Budget used up: ${search.label} stops after ${fetched} of ${totalResults} stories`);
      break;
    }
    const result = await fetchPage(url(page));
    totalResults = result.totalResults;
    for (const item of result.items) items.set(item.id, item);
    fetched += result.items.length;
    if (result.items.length === 0 || fetched >= totalResults) break;
  }
  console.log(`${search.label}: ${fetched} of ${totalResults} stories`);
  return { label: search.label, url: url(1), names: search.names, totalResults, fetched, truncated };
}

/** One advanced search row: Named Entity Location is exactly one of the names (MySQL REGEXP). */
const nameRow = (names: string[]) =>
  `advanced[0][element_id]=${NAMED_ENTITY_LOCATION}&advanced[0][type]=matches` +
  `&advanced[0][terms]=${encodeURIComponent(`^(${names.map(escapeRegExp).join('|')})$`)}`;

/** The names in batches of at most MAX_BATCH_NAMES. */
function nameSearches(label: string, names: string[], optional: boolean): Search[] {
  const count = Math.ceil(names.length / MAX_BATCH_NAMES);
  const size = Math.ceil(names.length / Math.max(count, 1));
  return Array.from({ length: count }, (_, i) => names.slice(i * size, (i + 1) * size)).map((batch, i) => ({
    label: `${label} ${i + 1}/${count}`,
    params: `item_type=${STORY_TYPE}&${nameRow(batch)}`,
    optional,
    names: batch,
  }));
}

const villages = await readJson<Village[]>(dataPath('backbone', 'villages.json'));
const nameIndex = buildNameIndex(villages, await loadWikidataLabels());
const homonyms = await loadHomonyms();
const groupOf = new Map(villages.map((v) => [v.id, locationGroup(v)]));

const searchedNames = [...nameIndex]
  .filter(([, entries]) => entries.some((e) => SEARCHED_ORIGINS.has(e.origin)))
  // "Agger 1" is the backbone's numbering; the story says "Agger", which is searched as well.
  .filter(([name]) => !/\s\d+$/.test(name))
  .map(([name]) => name)
  .sort();
const searches: Search[] = [
  ...CONTEXT_SEARCHES.map((word) => ({
    label: `search "${word}"`,
    params: `item_type=${STORY_TYPE}&search=${encodeURIComponent(word)}`,
    optional: false,
  })),
  ...nameSearches(
    'names',
    searchedNames.filter((n) => !homonyms.has(n)),
    false,
  ),
  ...nameSearches(
    'homonyms',
    searchedNames.filter((n) => homonyms.has(n)),
    true,
  ),
];
console.log(
  `${searches.length} searches: ${CONTEXT_SEARCHES.length} full-text, ${searchedNames.length} names ` +
    `(${searchedNames.filter((n) => homonyms.has(n)).length} homonyms)`,
);

const items = new Map<number, OmekaItem>();
const searchResults: SearchResult[] = [];
for (const search of searches.filter((s) => !s.optional)) searchResults.push(await runSearch(search, items));
for (const search of searches.filter((s) => s.optional)) searchResults.push(await runSearch(search, items));
console.log(`${items.size} stories, ${requests} requests sent (${REQUEST_BUDGET} allowed)`);

// 2. Match the stories.
interface Story {
  id: number;
  record: string;
  collection: number | null;
  title: string | null;
  fields: Record<string, string[]>;
}
const storyOf = (item: OmekaItem): Story => {
  const fields: Record<string, string[]> = {};
  for (const { element, text } of item.element_texts) fields[element.name] = [...(fields[element.name] ?? []), text];
  return {
    id: item.id,
    record: `${SITE}items/show/${item.id}`,
    collection: item.collection?.id ?? null,
    title: fields.Title?.[0] ?? null,
    fields,
  };
};
const stories = [...items.values()]
  .filter((item) => item.item_type?.id === STORY_TYPE)
  .map(storyOf)
  .sort((a, b) => a.id - b.id);

// Longest names first, so "Oud-Hontenisse" wins over "Hontenisse".
const allNames = [...nameIndex.keys()].sort((a, b) => b.length - a.length);
const nameRegExp = new RegExp(`(?<![\\p{L}\\p{N}])(${allNames.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
const namesByKey = new Map<string, string[]>();
for (const name of allNames) namesByKey.set(spellingKey(name), [...(namesByKey.get(spellingKey(name)) ?? []), name]);
const drownedLandRegExp = new RegExp(DROWNED_LAND_PATTERN, 'i');

/** A place value without its province, and the province: "Monster (Zuid-Holland)". */
function parsePlace(value: string): { place: string; province: string | null } {
  const match = value.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return match ? { place: match[1], province: match[2].trim() } : { place: value.trim(), province: null };
}

// Suggestions for stories without an exact name: capitalized words that are spelled almost like a name.
const fuzzyNames = allNames.filter((name) => name.length >= MIN_FUZZY_LENGTH && !/\s/.test(name));
function possibleVillages(texts: string[]): { villageId: string; word: string; name: string }[] {
  const words = new Set(texts.flatMap((text) => text.match(/\p{Lu}[\p{L}-]{5,}/gu) ?? []));
  const suggestions = [];
  for (const word of words) {
    for (const name of fuzzyNames) {
      if (Math.abs(word.length - name.length) > 2 || editDistance(word.toLowerCase(), name.toLowerCase()) > 2) continue;
      for (const { villageId } of nameIndex.get(name) ?? []) suggestions.push({ villageId, word, name });
    }
  }
  return suggestions;
}

interface Hit {
  names: Set<string>;
  origins: Set<NameOrigin>;
  fields: Set<string>;
  shared: boolean[];
  context: boolean;
  /** A place field that names the village in or without a province. */
  place: boolean;
  /** A Place of Action with this name in another province. */
  elsewhere: boolean;
  /** A name in the title, summary or text. */
  text: boolean;
  /** A match on a name that isn't a homonym, nor spelled like one. */
  plainName: boolean;
}

const candidates: Candidate[] = [];
const suggestionsByStory = new Map<string, ReturnType<typeof possibleVillages>>();
for (const story of stories) {
  const found = new Map<string, Hit>();
  const hitFor = (villageId: string) => {
    const hit = found.get(villageId) ?? {
      names: new Set(),
      origins: new Set(),
      fields: new Set(),
      shared: [],
      context: false,
      place: false,
      elsewhere: false,
      text: false,
      plainName: false,
    };
    found.set(villageId, hit);
    return hit;
  };
  const record = (name: string, field: string, origin: NameOrigin, entries: { villageId: string }[], hit: Hit) => {
    hit.names.add(name);
    hit.origins.add(origin);
    hit.fields.add(field);
    hit.shared.push(new Set(entries.map((e) => groupOf.get(e.villageId))).size > 1);
  };

  for (const field of TEXT_FIELDS) {
    for (const text of story.fields[field] ?? []) {
      for (const match of text.matchAll(nameRegExp)) {
        const name = match[1];
        const near = contextNear(text, match.index, name.length);
        const entries = nameIndex.get(name) ?? [];
        for (const { villageId, origin } of entries) {
          // On its own, a name without "Oud-"/"Nieuw-" names the present-day village.
          if (origin === 'stem' && !near) continue;
          const hit = hitFor(villageId);
          record(name, field, origin, entries, hit);
          hit.text = true;
          hit.plainName ||= !homonyms.has(name);
          hit.context ||= near;
        }
      }
    }
  }
  for (const field of PLACE_FIELDS) {
    for (const value of story.fields[field] ?? []) {
      const { place, province } = parsePlace(value);
      // A place value stands for every name with its spelling key: "Koudekerke" is also "Coudekerke".
      // So it is a homonym when any of them is one, and a tie when they belong to different villages.
      const names = namesByKey.get(spellingKey(place)) ?? [];
      const keyEntries = names.flatMap((name) => nameIndex.get(name) ?? []);
      const homonymKey = names.some((name) => homonyms.has(name));
      for (const name of names) {
        for (const { villageId, origin } of nameIndex.get(name) ?? []) {
          // A place field that names the present-day village; it counts only through a text hit with context.
          if (origin === 'stem') continue;
          const hit = hitFor(villageId);
          record(name, field, origin, keyEntries, hit);
          hit.plainName ||= !homonymKey;
          if (province && province !== 'Zeeland') hit.elsewhere = true;
          else hit.place = true;
        }
      }
    }
  }

  if (found.size === 0) {
    const texts = TEXT_FIELDS.flatMap((f) => story.fields[f] ?? []);
    if (texts.some((text) => drownedLandRegExp.test(text))) {
      const suggestions = possibleVillages(texts);
      suggestionsByStory.set(story.record, suggestions);
      candidates.push({
        village: null,
        record: story.record,
        matchedBy: 'generic',
        fields: TEXT_FIELDS.filter((f) => story.fields[f]?.some((text) => drownedLandRegExp.test(text))),
        status: null,
        suggestedVillages: [...new Set(suggestions.map((s) => s.villageId))],
      });
    }
    continue;
  }

  for (const [villageId, hit] of found) {
    const matchedBy = hit.place ? 'place-name' : hit.context ? 'text-context' : 'text-name';
    const nameOrigin = [...hit.origins].reduce((a, b) => (ORIGIN_STRENGTH[a] >= ORIGIN_STRENGTH[b] ? a : b));
    const homonym = !hit.plainName;
    let status = statusFor(matchedBy, { homonym, context: hit.context });
    if (hit.elsewhere && !hit.place && !hit.text) status = { status: 'rejected', statusReason: 'location' };
    // Alternative names often point to a successor village or a building.
    if (status.status === 'accepted' && [...hit.origins].every((o) => o === 'alt')) {
      status = { status: 'review', statusReason: 'alt-name' };
    }
    // A name that several backbone villages share (Westkerke, Oostkerke) doesn't tell them apart.
    if (status.status === 'accepted' && hit.shared.every(Boolean)) status = { status: 'review', statusReason: 'tie' };
    candidates.push({
      village: villageId,
      record: story.record,
      matchedBy,
      nameOrigin,
      matchedNames: [...hit.names],
      fields: [...hit.fields],
      ...status,
    });
  }
}
await applyOverrides(SOURCE, candidates, new Set(villages.map((v) => v.id)));

// 3. Write the results.
const found = new Set(candidates.map((c) => c.record));
const storyByRecord = new Map(stories.filter((s) => found.has(s.record)).map((s) => [s.record, s]));
/** The years in the field "Date", which is when the story was told or published, not when it is set. */
const datedOf = (story: Story) => {
  const years = (story.fields.Date ?? []).flatMap((d) => [...d.matchAll(YEAR)].map((m) => Number(m[1])));
  return years.length ? { beginYear: Math.min(...years), endYear: Math.max(...years) } : null;
};
const summaryOf = (story: Story) => ({
  title: story.title,
  identifier: story.fields.Identifier?.[0] ?? null,
  subgenre: story.fields.Subgenre ?? [],
  placeOfAction: story.fields['Place of Action'] ?? [],
  namedEntityLocations: story.fields['Named Entity Location'] ?? [],
  coverage: story.fields.Coverage ?? [],
  dated: datedOf(story),
  description: story.fields.Description?.[0] ?? null,
});

await writeJson(
  join(OUTPUT_DIR, 'stories.json'),
  [...storyByRecord.values()].map((s) => ({ ...s, dated: datedOf(s) })),
);
const describe = (c: Candidate) => {
  const story = storyByRecord.get(c.record);
  return { ...c, ...(story ? summaryOf(story) : {}) };
};
await writeJson(join(OUTPUT_DIR, 'matches.json'), {
  source: { api: API, licence: null, requests, searches: searchResults },
  villages: villages
    .map((v) => ({
      id: v.id,
      name: v.name,
      drowned: v.drowned,
      stories: candidates.filter((c) => c.village === v.id).map(describe),
    }))
    .filter((v) => v.stories.length),
  generic: candidates
    .filter((c) => c.village === null)
    .map((c) => ({ ...describe(c), possibleVillages: suggestionsByStory.get(c.record) ?? [] })),
});
await writeMatches(SOURCE, SITE, candidates);

// Accepted: the link from the village to the story, and a short description of the story.
const { namedNode, literal, quad } = DataFactory;
const schema = (local: string) => namedNode(`${PREFIXES.schema}${local}`);
function storyQuads(story: Story): Quad[] {
  const subject = namedNode(story.record);
  const quads: Quad[] = [];
  const add = (predicate: string, object: Quad_Object) => quads.push(quad(subject, schema(predicate), object));
  quads.push(quad(subject, namedNode(`${PREFIXES.rdf}type`), schema('CreativeWork')));
  add('url', namedNode(story.record));
  add('isPartOf', namedNode(SITE));
  if (story.title) add('name', literal(story.title, 'nl'));
  for (const text of story.fields.Description ?? []) add('abstract', literal(text, 'nl'));
  for (const text of story.fields.Text ?? []) add('text', literal(text));
  for (const genre of story.fields.Subgenre ?? []) add('genre', literal(genre, 'nl'));
  for (const id of story.fields.Identifier ?? []) add('identifier', literal(id));
  for (const place of [...(story.fields['Place of Action'] ?? []), ...(story.fields['Named Entity Location'] ?? [])]) {
    add('contentLocation', literal(place));
  }
  for (const place of story.fields.Coverage ?? []) add('locationCreated', literal(place));
  for (const date of story.fields.Date ?? []) add('dateCreated', literal(date));
  for (const tale of story.fields.Subject ?? []) add('about', literal(tale));
  for (const language of story.fields.Language ?? []) add('inLanguage', literal(language));
  return quads;
}
await writeTurtle(join(OUTPUT_DIR, 'stories.ttl'), [...storyByRecord.values()].flatMap(storyQuads), PREFIXES);

const accepted = candidates.filter(
  (c): c is Candidate & { village: string } => c.status === 'accepted' && c.village !== null,
);
const acceptedStories = [...new Set(accepted.map((c) => c.record))].map((r) => storyByRecord.get(r) as Story);
await writeAccepted(SOURCE, [
  ...accepted.map((c) => villageQuad(c.village, `${PREFIXES.schema}subjectOf`, namedNode(c.record))),
  ...acceptedStories.flatMap(storyQuads),
]);

const withVillage = candidates.filter((c) => c.village !== null);
console.log(
  `${new Set(withVillage.map((c) => c.village)).size} villages with stories, ` +
    `${new Set(accepted.map((c) => c.village)).size} with accepted stories (${acceptedStories.length} stories). ` +
    `Candidates: ${JSON.stringify(countBy(withVillage, (c) => (c.statusReason ? `${c.status}/${c.statusReason}` : c.status)))}, ` +
    `by key ${JSON.stringify(countBy(withVillage, (c) => c.matchedBy))}. ` +
    `${candidates.length - withVillage.length} generic stories about drowned land. ` +
    `${searchResults.filter((s) => s.truncated).length} searches cut off by the budget.`,
);
