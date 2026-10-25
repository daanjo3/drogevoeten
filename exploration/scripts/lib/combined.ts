// The shared combined output: data/combined.ttl is rebuilt from the backbone villages
// (data/backbone/villages.ttl) and every step's accepted matches (data/<source>/accepted.ttl).
// Each step writes its own accepted.ttl and then calls updateCombined(), so running one step again
// replaces only that step's part, and combined.ttl is up to date after every step.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Quad } from '@rdfjs/types';
import { Parser } from 'n3';
import { exists, writeTurtle } from './io.ts';
import { DATA_DIR, dataPath } from './paths.ts';
import { assertVocabulary, PREFIXES } from './vocab.ts';

const COMBINED_PREFIXES = {
  ...PREFIXES,
  crm: 'http://www.cidoc-crm.org/cidoc-crm/',
  aat: 'http://vocab.getty.edu/aat/',
  hdl: 'https://hdl.handle.net/21.12128/',
  ceo: 'https://linkeddata.cultureelerfgoed.nl/def/ceo#',
  edm: 'http://www.europeana.eu/schemas/edm/',
  foaf: 'http://xmlns.com/foaf/0.1/',
  geo: 'http://www.opengis.net/ont/geosparql#',
};

async function parseTurtle(path: string, blankNodePrefix: string): Promise<Quad[]> {
  return new Parser({ blankNodePrefix }).parse(await readFile(path, 'utf8'));
}

/** Writes a step's accepted matches to data/<source>/accepted.ttl and rebuilds data/combined.ttl. */
export async function writeAccepted(source: string, quads: Quad[]): Promise<void> {
  assertVocabulary(quads);
  await writeTurtle(dataPath(source, 'accepted.ttl'), quads, COMBINED_PREFIXES);
  await updateCombined();
}

/** Rebuilds data/combined.ttl from data/backbone/villages.ttl and every data/<source>/accepted.ttl. */
export async function updateCombined(): Promise<void> {
  const villagesFile = dataPath('backbone', 'villages.ttl');
  if (!(await exists(villagesFile))) throw new Error(`Missing ${villagesFile}; run the backbone step first.`);
  const quads = await parseTurtle(villagesFile, 'backbone_');
  const parts = ['backbone/villages.ttl'];
  const dirs = (await readdir(DATA_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  for (const dir of dirs.sort()) {
    const file = join(DATA_DIR, dir, 'accepted.ttl');
    if (!(await exists(file))) continue;
    // A prefix per file keeps blank nodes from different files apart.
    quads.push(...(await parseTurtle(file, `${dir.replace(/\W/g, '_')}_`)));
    parts.push(`${dir}/accepted.ttl`);
  }
  assertVocabulary(quads);
  console.log(`Combining ${parts.join(', ')}`);
  await writeTurtle(dataPath('combined.ttl'), quads, COMBINED_PREFIXES);
}
