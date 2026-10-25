// The table "Tabel bij de kaart" in the Dutch Wikipedia article "Lijst van verdronken dorpen in
// Zeeland": fetching the article's wikitext (cached in dumps/) and parsing the table rows.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fetchText } from './http.ts';
import { exists } from './io.ts';
import type { Drowning } from './types.ts';
import { type DrowningCause, wikipediaListRowIri } from './vocab.ts';

export const PAGE_TITLE = 'Lijst van verdronken dorpen in Zeeland';
export const PAGE_URL = `https://nl.wikipedia.org/wiki/${PAGE_TITLE.replace(/ /g, '_')}`;
const SECTION = 'Tabel bij de kaart';
const API_URL =
  'https://nl.wikipedia.org/w/api.php?action=parse&prop=wikitext|revid&format=json&formatversion=2' +
  `&page=${encodeURIComponent(PAGE_TITLE)}`;

interface ParseResponse {
  parse?: { title: string; pageid: number; revid: number; wikitext: string };
  error?: { code: string; info: string };
}

export interface WikipediaPage {
  title: string;
  revid: number;
  /** A permanent link to the parsed revision. */
  revisionUrl: string;
  wikitext: string;
}

/** The article's wikitext, from the MediaWiki API; reuses the cached response unless refresh is set. */
export async function loadPage(cacheFile: string, refresh: boolean): Promise<WikipediaPage> {
  let body: string;
  if (!refresh && (await exists(cacheFile))) {
    console.log(`Using cached Wikipedia page ${cacheFile} (pass --refresh to download again)`);
    body = await readFile(cacheFile, 'utf8');
  } else {
    console.log(`Fetching ${API_URL}`);
    body = await fetchText(API_URL, {
      validate: (text) => {
        const response = JSON.parse(text) as ParseResponse;
        if (response.error) throw new Error(`MediaWiki API error ${response.error.code}: ${response.error.info}`);
        if (!response.parse?.wikitext) throw new Error('MediaWiki API response has no wikitext');
      },
    });
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, body);
    console.log(`Wrote ${cacheFile}`);
  }
  const { parse } = JSON.parse(body) as ParseResponse;
  if (!parse) throw new Error(`${cacheFile} is not a MediaWiki parse response; delete it and run again.`);
  return {
    title: parse.title,
    revid: parse.revid,
    revisionUrl: `https://nl.wikipedia.org/w/index.php?oldid=${parse.revid}`,
    wikitext: parse.wikitext,
  };
}

export interface WikipediaListRow {
  row: number;
  /** The IRI of the row (vd:WikipediaListRow). */
  record: string;
  /** The names in the first column, before the parentheses ("Saemslach/Genderdijk" gives two). */
  names: string[];
  /** Names in parentheses, plus the linked article's title when the link is the whole name. */
  altNames: string[];
  /** The first linked article in the name column, or null. */
  article: string | null;
  /** The part in parentheses of the article title ("Goes" in "Westkerke (Goes)"), often a municipality. */
  disambiguator: string | null;
  drowned: Drowning | null;
  /** The cells as wikitext. */
  wikitext: { name: string; drowned: string };
}

const LINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
// {{Sorteer|sort key|text shown}}: the second parameter is what the table shows.
const SORT_TEMPLATE = /\{\{\s*Sorteer\s*\|([^|}]*)\|([^}]*)\}\}/gi;

/** Wikitext to plain text: links become their text, and "'Oud'-" becomes "Oud-". */
const render = (wikitext: string): string =>
  wikitext
    .replace(SORT_TEMPLATE, (_, _key, text: string) => text)
    .replace(LINK, (_, target: string, text?: string) => text ?? target)
    .replace(/'(Oud|Nieuw)'/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

const cleanName = (name: string): string => name.replace(/\?/g, '').trim();

export const articleUrl = (title: string): string => {
  const normalized = title.trim().replace(/ /g, '_');
  return `https://nl.wikipedia.org/wiki/${encodeURIComponent(normalized[0].toUpperCase() + normalized.slice(1))}`;
};

function parseNameCell(cell: string) {
  // The parentheses outside links separate the names from the alternative names.
  const masked = cell.replace(LINK, (link) => 'x'.repeat(link.length));
  const parenAt = masked.indexOf('(');
  const mainWikitext = parenAt === -1 ? cell : cell.slice(0, parenAt);
  const altWikitext = parenAt === -1 ? '' : cell.slice(parenAt + 1, cell.lastIndexOf(')'));

  const main = render(mainWikitext);
  const names = main.split('/').map(cleanName).filter(Boolean);
  const altNames = render(altWikitext).split(',').map(cleanName).filter(Boolean);

  const [link] = mainWikitext.matchAll(LINK);
  let article: string | null = null;
  let disambiguator: string | null = null;
  if (link) {
    const target = link[1].trim();
    article = articleUrl(target);
    disambiguator = target.match(/\(([^)]+)\)\s*$/)?.[1] ?? null;
    const title = target.replace(/\s*\([^)]*\)\s*$/, '');
    // The article's title is another name of the village only when the link is the whole name.
    // "'Oud'-[[Kortgene]]" links to the present-day village.
    if (render(link[0]) === main && !names.includes(title)) altNames.push(title);
  }
  return { names, altNames: [...new Set(altNames)].filter((n) => !names.includes(n)), article, disambiguator };
}

// Terms for the cause of drowning, longest first so "militaire inundatie" isn't also counted as "inundatie".
const CAUSES: DrowningCause[] = ['militaire inundatie', 'buitengedijkt', 'stormvloed', 'inundatie', 'verlaten'];
// A year ("1530"), a range of years ("1550-1600") or a century ("16e eeuw").
const DATE = /(?<!\d)(\d{3,4})(?:\s*-\s*(\d{3,4}))?(?!\d)|(?<!\d)(\d{1,2})e\s+eeuw/g;

/** The last date in a text as a year range, or null. Words around the dates ("voor", "na") are ignored. */
function lastDate(text: string): { beginYear: number; endYear: number } | null {
  const last = [...text.matchAll(DATE)].at(-1);
  if (!last) return null;
  const [, year, rangeEnd, century] = last;
  if (century) {
    const start = (Number(century) - 1) * 100;
    return { beginYear: start, endYear: start + 99 };
  }
  return { beginYear: Number(year), endYear: Number(rangeEnd ?? year) };
}

/**
 * The drowning column. When the shown text of a {{Sorteer}} template has no date ("opgegaan in
 * Hoedekenskerke"), its sort key ("17e eeuw") is used.
 */
function parseDrownedCell(cell: string): Drowning | null {
  const text = render(cell);
  if (!text) return null;
  const sortKeys = [...cell.matchAll(SORT_TEMPLATE)].map((m) => m[1]);
  const date = lastDate(text) ?? lastDate(sortKeys.join(', '));
  if (!date) {
    console.warn(`Warning: no date found in "${text}"`);
    return null;
  }
  let rest = text.toLowerCase();
  const cause: DrowningCause[] = [];
  for (const term of CAUSES) {
    if (rest.includes(term)) {
      cause.push(term);
      rest = rest.replaceAll(term, ' ');
    }
  }
  return { text, ...date, cause };
}

/** The rows of the table "Tabel bij de kaart". Fails when the table can't be found or a row looks wrong. */
export function parseTable(wikitext: string): WikipediaListRow[] {
  const sectionAt = wikitext.search(new RegExp(`^=+\\s*${SECTION}\\s*=+\\s*$`, 'm'));
  if (sectionAt === -1) throw new Error(`Section "${SECTION}" not found in "${PAGE_TITLE}"`);
  const tableStart = wikitext.indexOf('{|', sectionAt);
  const tableEnd = wikitext.indexOf('\n|}', tableStart);
  if (tableStart === -1 || tableEnd === -1) throw new Error(`No table found in section "${SECTION}"`);

  const [header, ...rows] = wikitext.slice(tableStart, tableEnd).split(/\n\|-[^\n]*/);
  const columns = header
    .slice(header.indexOf('\n!') + 2)
    .split('!!')
    .map((c) => c.trim());
  if (
    columns.length !== 3 ||
    !/^Nr/.test(columns[0]) ||
    !/^Plaatsnaam/.test(columns[1]) ||
    !/^Verdronken/.test(columns[2])
  ) {
    throw new Error(`Unexpected table columns: ${columns.join(' | ')}`);
  }

  return rows
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const cells = row
        .replace(/^\|/, '')
        .split('||')
        .map((c) => c.trim());
      const number = Number(cells[0]);
      if (cells.length !== 3 || !Number.isInteger(number)) throw new Error(`Unexpected table row: ${row}`);
      return {
        row: number,
        record: wikipediaListRowIri(number),
        ...parseNameCell(cells[1]),
        drowned: parseDrownedCell(cells[2]),
        wikitext: { name: cells[1], drowned: cells[2] },
      };
    });
}
