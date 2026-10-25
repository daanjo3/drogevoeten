// The Rijksmuseum collection as a Europeana Data Model (EDM) dump in Turtle (January 2020, from the
// "historical data dumps" at https://data.rijksmuseum.nl/docs/data-dumps/historical-dumps), and
// filtering it down to the objects that may be about a village, small enough to query with Comunica.
// The current Linked Art APIs have no object dump and no OR search, so they don't fit the request
// budget (see the SOP's source notes).
//
// The zip holds 14 Turtle files (1.5 GB). Each file lists its aggregations (image and licence) first,
// then the thesaurus terms (places, events, concepts, people), then the objects (edm:ProvidedCHO).
// Terms recur in several files, so the filter makes two passes: one for the terms, one for the objects.
import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { rename, stat } from 'node:fs/promises';
import { type Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Quad } from '@rdfjs/types';
import { Store, StreamParser, Writer } from 'n3';
import { openPromise } from 'yauzl';

export const DUMP_URL =
  'https://github.com/Rijksmuseum/rijksmuseum.github.io/releases/download/1.0.0/202001-rma-edm-collection.zip';
/** The dataset of all published objects, of which the dump is an older export. */
export const DATASET_IRI = 'https://id.rijksmuseum.nl/260251';

export const EDM = 'http://www.europeana.eu/schemas/edm/';
export const DC = 'http://purl.org/dc/elements/1.1/';
export const DCT = 'http://purl.org/dc/terms/';
export const WGS84 = 'http://www.w3.org/2003/01/geo/wgs84_pos#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SKOS_PREF_LABEL = 'http://www.w3.org/2004/02/skos/core#prefLabel';
const ORE_AGGREGATION = 'http://www.openarchives.org/ore/terms/Aggregation';
const OBJECT_CLASS = `${EDM}ProvidedCHO`;
/** Thesaurus classes, and what the filter keeps of them. */
const TERM_CLASSES = new Set([
  `${EDM}Place`,
  `${EDM}TimeSpan`,
  `${EDM}Agent`,
  'http://www.w3.org/2004/02/skos/core#Concept',
]);
const TERM_PREDICATES = new Set([RDF_TYPE, SKOS_PREF_LABEL, `${WGS84}lat`, `${WGS84}long`]);
/**
 * A term with more labels than this is a placeholder: RM0001.PEOPLE.0 collects some 28,800 names of
 * unknown makers. A real term has one label per language. Placeholders keep their type, not their labels.
 */
const MAX_TERM_LABELS = 10;
/** The texts of an object that the filter searches. */
const TEXT_PREDICATES = new Set([`${DC}title`, `${DC}description`]);

/** A thesaurus term: a place, event (edm:TimeSpan), concept or person. */
export interface Term {
  iri: string;
  type: string;
  labels: string[];
  /** [longitude, latitude], for the places that have coordinates. */
  coords: [number, number] | null;
}

export interface SubsetStats {
  /** Which filter the subset was made with; the step rebuilds the subset when it changes. */
  filterKey: string;
  sourceTriples: number;
  /** IRIs in the dump that aren't absolute IRIs, rewritten to INVALID_IRI. */
  invalidIris: number;
  objects: number;
  terms: number;
  selectedTerms: number;
  /** Terms with more than MAX_TERM_LABELS labels, written without their labels. */
  placeholders: string[];
  keptObjects: number;
  triples: number;
}

export interface SubsetFilter {
  /** A key for the filter's settings (such as a hash of the names searched for). */
  key: string;
  /** Whether objects that refer to this term belong in the subset. */
  term: (term: Term) => boolean;
  /** Whether an object belongs in the subset, by its own texts (titles, descriptions). */
  texts: (texts: string[]) => boolean;
  /**
   * Fail when the filter keeps more objects than this: a filter that is too broad makes a subset
   * that Comunica can't handle in memory, and the reason is easier to find here than in a crash.
   */
  maxObjects: number;
}

// An IRI at the start of a line (a subject), or after the indentation and an optional predicate (an
// object). The dump writes one IRI per line in those positions.
const IRI_AT_LINE_START = /^(\s*(?:[A-Za-z][\w-]*:[\w-]+\s+)?)<([^>]*)>(?=[\s,;.]|$)/;
const ABSOLUTE_IRI = /^[A-Za-z][A-Za-z0-9+.-]*:[^\s<>"{}|\\^`]*$/;
/** Where the dump's invalid IRIs ("ttp://...", "Balmoral boots") end up, so the files can be parsed. */
export const INVALID_IRI = 'urn:invalid-iri:';

/**
 * Rewrites the IRIs that aren't absolute IRIs, such as "<ttp://vocab.getty.edu/aat/300043236>" or
 * "<Balmoral boots>", to `urn:invalid-iri:<encoded>`. A Turtle parser rejects them, and there are a
 * few hundred in the dump. Text inside long (triple-quoted) literals is left alone.
 */
function fixInvalidIris(counter: { invalidIris: number }): Transform {
  let rest = '';
  let inLongLiteral = false;
  const fix = (line: string) => {
    const fixed = inLongLiteral
      ? line
      : line.replace(IRI_AT_LINE_START, (match, before: string, iri: string) => {
          if (ABSOLUTE_IRI.test(iri)) return match;
          counter.invalidIris++;
          return `${before}<${INVALID_IRI}${encodeURIComponent(iri)}>`;
        });
    if ((line.split('"""').length - 1) % 2 === 1) inLongLiteral = !inLongLiteral;
    return fixed;
  };
  return new Transform({
    decodeStrings: false,
    transform(chunk: string, _encoding, done) {
      const lines = (rest + chunk).split('\n');
      rest = lines.pop() ?? '';
      done(null, lines.length ? `${lines.map(fix).join('\n')}\n` : '');
    },
    flush(done) {
      done(null, fix(rest));
    },
  });
}

/** Calls `visit` for every quad of every Turtle file in the zip, file by file. */
async function forEachQuad(
  zipPath: string,
  visit: (quad: Quad) => void,
  endOfFile: () => Promise<void> = async () => {},
): Promise<{ triples: number; invalidIris: number }> {
  const zip = await openPromise(zipPath);
  const counter = { invalidIris: 0 };
  let triples = 0;
  for await (const entry of zip.eachEntry()) {
    if (!entry.fileName.endsWith('.ttl')) continue;
    console.log(`  ${entry.fileName}`);
    const input: Readable = await zip.openReadStreamPromise(entry);
    input.setEncoding('utf8');
    const sink = new Writable({
      objectMode: true,
      write(quad: Quad, _encoding, done) {
        triples++;
        visit(quad);
        done();
      },
    });
    await pipeline(input, fixInvalidIris(counter), new StreamParser({ format: 'Turtle' }), sink);
    await endOfFile();
  }
  zip.close();
  return { triples, invalidIris: counter.invalidIris };
}

/**
 * Writes the objects that `filter` selects, with their aggregations and the terms they refer to, to
 * `subsetPath` (N-Triples). An object is selected when one of its texts passes `filter.texts` or
 * when it refers (as subject, place, period or anything else) to a term that passes `filter.term`.
 */
export async function buildSubset(zipPath: string, subsetPath: string, filter: SubsetFilter): Promise<SubsetStats> {
  // Pass 1: the thesaurus terms.
  console.log(`Pass 1: reading the thesaurus terms in ${zipPath}`);
  // Every subject's triples are listed together, starting with its type.
  const termQuads = new Map<string, Map<string, Quad>>();
  const termTypes = new Map<string, string>();
  let subject = '';
  let kind = '';
  const { triples: sourceTriples, invalidIris } = await forEachQuad(zipPath, (quad) => {
    if (quad.subject.value !== subject) {
      subject = quad.subject.value;
      kind = '';
    }
    if (quad.predicate.value === RDF_TYPE) {
      kind = quad.object.value;
      if (TERM_CLASSES.has(kind)) termTypes.set(subject, kind);
    }
    if (!TERM_CLASSES.has(kind) || !TERM_PREDICATES.has(quad.predicate.value)) return;
    const quads = termQuads.get(subject) ?? new Map<string, Quad>();
    // Terms recur in several files: keep each triple once.
    quads.set(`${quad.predicate.value} ${quad.object.termType} ${quad.object.value}`, quad);
    termQuads.set(subject, quads);
  });

  const placeholders: string[] = [];
  for (const [iri, quads] of termQuads) {
    const labels = [...quads].filter(([, q]) => q.predicate.value === SKOS_PREF_LABEL);
    if (labels.length <= MAX_TERM_LABELS) continue;
    placeholders.push(iri);
    for (const [key] of labels) quads.delete(key);
  }
  if (placeholders.length) console.log(`  Placeholder terms without their labels: ${placeholders.join(', ')}`);

  const selectedTerms = new Set<string>();
  for (const [iri, quads] of termQuads) {
    const values = (predicate: string) =>
      [...quads.values()].filter((q) => q.predicate.value === predicate).map((q) => q.object.value);
    const [lat, long] = [Number.parseFloat(values(`${WGS84}lat`)[0]), Number.parseFloat(values(`${WGS84}long`)[0])];
    const coords: Term['coords'] = Number.isNaN(lat) || Number.isNaN(long) ? null : [long, lat];
    if (filter.term({ iri, type: termTypes.get(iri) ?? '', labels: values(SKOS_PREF_LABEL), coords })) {
      selectedTerms.add(iri);
    }
  }
  console.log(
    `  ${sourceTriples} triples (${invalidIris} invalid IRIs rewritten to ${INVALID_IRI}), ` +
      `${termQuads.size} terms, ${selectedTerms.size} selected`,
  );

  // Pass 2: the objects, with their aggregations (which come earlier in the same file).
  console.log('Pass 2: selecting objects');
  const part = `${subsetPath}.part`;
  const out = createWriteStream(part);
  const writer = new Writer({ format: 'N-Triples' });
  let buffered: string[] = [];
  let triples = 0;
  const write = (quads: Iterable<Quad>) => {
    for (const q of quads) {
      buffered.push(writer.quadToString(q.subject, q.predicate, q.object));
      triples++;
    }
  };
  const flush = async () => {
    if (buffered.length && !out.write(buffered.join(''))) await once(out, 'drain');
    buffered = [];
  };

  const aggregations = new Map<string, Quad[]>(); // aggregation -> its quads, for the current file
  const aggregationOf = new Map<string, string>(); // object -> aggregation, for the current file
  const writtenTerms = new Set<string>();
  let objects = 0;
  let keptObjects = 0;
  let current: Quad[] = [];
  let missingAggregations = 0;

  const decide = () => {
    if (current.length === 0) return;
    const object = current[0].subject.value;
    objects++;
    const texts = current.filter((q) => TEXT_PREDICATES.has(q.predicate.value)).map((q) => q.object.value);
    const terms = current.filter((q) => q.object.termType === 'NamedNode').map((q) => q.object.value);
    if (filter.texts(texts) || terms.some((t) => selectedTerms.has(t))) {
      keptObjects++;
      if (keptObjects > filter.maxObjects) {
        throw new Error(
          `The subset filter keeps more than ${filter.maxObjects} objects (after ${objects} objects); ` +
            'it is too broad. Check which terms it selects.',
        );
      }
      write(current);
      const aggregation = aggregationOf.get(object);
      if (aggregation) write(aggregations.get(aggregation) ?? []);
      else missingAggregations++;
      for (const term of terms) {
        if (writtenTerms.has(term) || !termQuads.has(term)) continue;
        writtenTerms.add(term);
        write(termQuads.get(term)?.values() ?? []);
      }
    }
    current = [];
  };

  subject = '';
  kind = '';
  await forEachQuad(
    zipPath,
    (quad) => {
      if (quad.subject.value !== subject) {
        if (kind === OBJECT_CLASS) decide();
        subject = quad.subject.value;
        kind = '';
      }
      if (quad.predicate.value === RDF_TYPE) kind = quad.object.value;
      if (kind === ORE_AGGREGATION) {
        const quads = aggregations.get(subject);
        if (quads) quads.push(quad);
        else aggregations.set(subject, [quad]);
        if (quad.predicate.value === `${EDM}aggregatedCHO`) aggregationOf.set(quad.object.value, subject);
      } else if (kind === OBJECT_CLASS) {
        current.push(quad);
      }
    },
    async () => {
      if (kind === OBJECT_CLASS) decide();
      subject = '';
      kind = '';
      aggregations.clear();
      aggregationOf.clear();
      await flush();
    },
  );
  out.end();
  await once(out, 'finish');
  await rename(part, subsetPath);
  if (missingAggregations)
    console.warn(`  ${missingAggregations} selected objects without an aggregation in their file`);
  const { size } = await stat(subsetPath);
  console.log(
    `Wrote ${subsetPath} (${keptObjects} of ${objects} objects, ${triples} triples, ${Math.round(size / 1e6)} MB)`,
  );
  return {
    filterKey: filter.key,
    sourceTriples,
    invalidIris,
    objects,
    terms: termQuads.size,
    placeholders,
    selectedTerms: selectedTerms.size,
    keptObjects,
    triples,
  };
}

/** Loads an N-Triples file into an in-memory store, so every query doesn't parse the file again. */
export async function loadNTriples(path: string): Promise<Store> {
  const store = new Store();
  await new Promise<void>((resolve, reject) => {
    const parser = new StreamParser({ format: 'N-Triples' });
    createReadStream(path).on('error', reject).pipe(parser);
    parser
      .on('data', (quad: Quad) => store.addQuad(quad))
      .on('error', reject)
      .on('end', resolve);
  });
  return store;
}
