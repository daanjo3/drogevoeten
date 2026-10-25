// The RCE dataset "Cultuurhistorische Objecten" (rce/cho on linkeddata.cultureelerfgoed.nl):
// downloading the full N-Triples dump and filtering it down to the records in and around Zeeland,
// small enough to query with Comunica. See the SOP's source notes for the data model.

import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { rename, stat } from 'node:fs/promises';
import type { Quad } from '@rdfjs/types';
import { Store, StreamParser } from 'n3';
import { fetchWithUserAgent } from './http.ts';
import { forEachTriple, literalValue, objectIri } from './ntriples.ts';

export const DATASET_API = 'https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/cho';
export const DATASET_IRI = 'https://linkeddata.cultureelerfgoed.nl/rce/cho';
export const DUMP_URL = `${DATASET_API}/download`;

export const CEO = 'https://linkeddata.cultureelerfgoed.nl/def/ceo#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const GEO_AS_WKT = 'http://www.opengis.net/ont/geosparql#asWKT';
const IMX_GEO = 'http://modellen.geostandaarden.nl/def/imx-geo#';
const EDM_AGGREGATED_CHO = 'http://www.europeana.eu/schemas/edm/aggregatedCHO';
const ZEELAND_OWMS = 'http://standaarden.overheid.nl/owms/terms/Zeeland_(provincie)';
const ZEELAND_KADASTER = 'https://data.kkg.kadaster.nl/id/provincie/PV29/1';
const LABELS = new Set(['http://www.w3.org/2004/02/skos/core#prefLabel', 'http://www.w3.org/2000/01/rdf-schema#label']);
// Resources the closure follows: RCE's own records and registrations, and thesaurus terms (labels only).
const RECORD_NAMESPACE = 'https://linkeddata.cultureelerfgoed.nl/cho-kennis/';
const TERM_NAMESPACE = 'https://data.cultureelerfgoed.nl/term/';
// Links from a resource to a record that describe the record: descriptions, names and images.
const INVERSE_LINKS = new Set([`${CEO}heeftBetrekkingOp`, EDM_AGGREGATED_CHO]);

/** The classes of records that can be about a village. Finds and complexes are parts of these. */
export const RECORD_CLASSES = [
  'Rijksmonument',
  'Complex',
  'ArcheologischTerrein',
  'Vondstlocatie',
  'ArcheologischOnderzoeksgebied',
  'Gezicht',
  'Werelderfgoed',
].map((c) => `${CEO}${c}`);

/** How many links deep the description of a record is followed (record -> event -> dating -> begin date). */
const MAX_DEPTH = 4;

export interface BBox {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

export interface DatasetInfo {
  statements: number;
  updatedAt: string;
  license: string;
}

export async function datasetInfo(): Promise<DatasetInfo> {
  const response = await fetchWithUserAgent(DATASET_API);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${DATASET_API}`);
  const { statements, updatedAt, license } = (await response.json()) as DatasetInfo;
  return { statements, updatedAt, license };
}

const WKT_POINT = /(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;
const inBBox = (wkt: string, box: BBox): boolean => {
  for (const [, x, y] of wkt.matchAll(WKT_POINT)) {
    const [lon, lat] = [Number(x), Number(y)];
    if (lon >= box.minLon && lon <= box.maxLon && lat >= box.minLat && lat <= box.maxLat) return true;
  }
  return false;
};

const add = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

export interface SubsetStats {
  sourceTriples: number;
  records: number;
  /** The IRIs of the records in Zeeland; the subset also describes some neighbouring records they link to. */
  recordIris: string[];
  byClass: Record<string, number>;
  triples: number;
  passes: number;
}

/**
 * Writes the records in Zeeland and everything that describes them to `subsetPath` (N-Triples).
 * A record is in Zeeland when its registration names the province of Zeeland, when its BAG place
 * (woonplaats) lies in Zeeland, or when its geometry has a point inside `box`. The description
 * follows links from the record into RCE's own resources up to MAX_DEPTH deep, plus the resources
 * that point to it (descriptions, names, images), and the labels of the thesaurus terms used.
 */
export async function buildSubset(dumpPath: string, subsetPath: string, box: BBox): Promise<SubsetStats> {
  // Pass 1: the records and how they are located.
  const recordClass = new Map<string, string>();
  const registrations = new Map<string, string[]>(); // record -> basisregistratierelatie
  const geometries = new Map<string, string[]>(); // record -> geometrie
  const bagRelations = new Map<string, string[]>(); // basisregistratierelatie -> BAG-relatie
  const bagPlace = new Map<string, string>(); // BAG-relatie -> woonplaatsnaam
  const zeelandRegistrations = new Set<string>();
  const geometriesInBox = new Set<string>();
  const placeNames = new Map<string, string>(); // woonplaats -> naam
  const zeelandPlaces = new Set<string>();
  const recordClasses = new Set(RECORD_CLASSES);

  console.log(`Pass 1: finding the records in Zeeland in ${dumpPath} (a few minutes)`);
  const sourceTriples = await forEachTriple(dumpPath, ({ subject, predicate, object }) => {
    switch (predicate) {
      case RDF_TYPE: {
        const type = objectIri(object);
        if (type && recordClasses.has(type)) recordClass.set(subject, type);
        break;
      }
      case `${CEO}heeftBasisregistratieRelatie`:
        add(registrations, subject, objectIri(object) ?? object);
        break;
      case `${CEO}heeftGeometrie`:
        add(geometries, subject, objectIri(object) ?? object);
        break;
      case `${CEO}heeftProvincie`:
        if (objectIri(object) === ZEELAND_OWMS) zeelandRegistrations.add(subject);
        break;
      case `${CEO}heeftBAGRelatie`:
        add(bagRelations, subject, objectIri(object) ?? object);
        break;
      case `${CEO}woonplaatsnaam`:
        bagPlace.set(subject, literalValue(object) ?? '');
        break;
      case GEO_AS_WKT:
        if (inBBox(literalValue(object) ?? '', box)) geometriesInBox.add(subject);
        break;
      case `${IMX_GEO}ligtInProvincie`:
        if (objectIri(object) === ZEELAND_KADASTER) zeelandPlaces.add(subject);
        break;
      case `${IMX_GEO}naam`:
        placeNames.set(subject, literalValue(object) ?? '');
        break;
    }
  });
  const zeelandPlaceNames = new Set([...zeelandPlaces].map((p) => placeNames.get(p)).filter((n) => n));
  console.log(`  ${sourceTriples} triples, ${recordClass.size} records, ${zeelandPlaceNames.size} places in Zeeland`);

  const records = new Set<string>();
  for (const record of recordClass.keys()) {
    const regs = registrations.get(record) ?? [];
    const inZeeland =
      regs.some((r) => zeelandRegistrations.has(r)) ||
      regs.some((r) => (bagRelations.get(r) ?? []).some((b) => zeelandPlaceNames.has(bagPlace.get(b) ?? ''))) ||
      (geometries.get(record) ?? []).some((g) => geometriesInBox.has(g));
    if (inZeeland) records.add(record);
  }
  const byClass: Record<string, number> = {};
  for (const record of records) {
    const name = (recordClass.get(record) ?? '').slice(CEO.length);
    byClass[name] = (byClass[name] ?? 0) + 1;
  }
  console.log(`  ${records.size} records in Zeeland: ${JSON.stringify(byClass)}`);

  // Passes 2 and further: write the records and what describes them, one level deeper per pass.
  const part = `${subsetPath}.part`;
  const out = createWriteStream(part);
  const write = async (line: string) => {
    if (!out.write(`${line}\n`)) await once(out, 'drain');
  };
  const done = new Set<string>();
  let frontier = new Set(records);
  let triples = 0;
  let passes = 1;
  for (let depth = 0; frontier.size > 0 && depth <= MAX_DEPTH; depth++) {
    passes++;
    console.log(`Pass ${passes}: ${frontier.size} resources at depth ${depth}`);
    const next = new Set<string>();
    const pending: string[] = [];
    for (const r of frontier) done.add(r);
    const follow = (iri: string | null) => {
      if (iri && !done.has(iri) && (iri.startsWith(RECORD_NAMESPACE) || iri.startsWith(TERM_NAMESPACE))) next.add(iri);
    };
    await forEachTriple(dumpPath, ({ subject, predicate, object, line }) => {
      if (frontier.has(subject)) {
        // Thesaurus terms only contribute their labels.
        if (subject.startsWith(TERM_NAMESPACE) && !LABELS.has(predicate)) return;
        pending.push(line);
        if (depth < MAX_DEPTH && !subject.startsWith(TERM_NAMESPACE)) follow(objectIri(object));
      } else if (depth === 0 && INVERSE_LINKS.has(predicate) && records.has(objectIri(object) ?? '')) {
        // A description, name or image of a record: its own triples follow in the next pass.
        next.add(subject);
      }
    });
    for (const line of pending) await write(line);
    triples += pending.length;
    frontier = next;
  }
  out.end();
  await once(out, 'finish');
  await rename(part, subsetPath);
  const { size } = await stat(subsetPath);
  console.log(`Wrote ${subsetPath} (${triples} triples, ${Math.round(size / 1e6)} MB)`);
  return { sourceTriples, records: records.size, recordIris: [...records], byClass, triples, passes };
}

/** Loads the subset into an in-memory store once, so every query doesn't parse the file again. */
export async function loadSubset(subsetPath: string): Promise<Store> {
  const store = new Store();
  await new Promise<void>((resolve, reject) => {
    const parser = new StreamParser({ format: 'N-Triples' });
    createReadStream(subsetPath).on('error', reject).pipe(parser);
    parser
      .on('data', (quad) => store.addQuad(quad))
      .on('error', reject)
      .on('end', resolve);
  });
  return store;
}

/**
 * The full descriptions of the given records, read directly from the store: the record's own
 * triples, RCE's resources it links to up to `depth` levels deep, as deep as the subset (location,
 * geometry, events, dating, finds, types), the descriptions, names and images that point to the record, and the
 * labels of the thesaurus terms used. A SPARQL CONSTRUCT with these UNIONs over a store of
 * millions of triples is too heavy for Comunica, so this walks the store instead.
 */
export function describeRecords(store: Store, records: Iterable<string>, depth = MAX_DEPTH): Quad[] {
  const out: Quad[] = [];
  const seen = new Set<string>();
  let frontier: string[] = [];
  for (const record of records) {
    frontier.push(record);
    for (const link of INVERSE_LINKS) {
      for (const q of store.getQuads(null, link, record, null)) frontier.push(q.subject.value);
    }
  }
  const terms = new Set<string>();
  for (let level = 0; level <= depth && frontier.length; level++) {
    const next: string[] = [];
    for (const iri of frontier) {
      if (seen.has(iri)) continue;
      seen.add(iri);
      for (const q of store.getQuads(iri, null, null, null)) {
        out.push(q);
        if (q.object.termType !== 'NamedNode') continue;
        if (q.object.value.startsWith(TERM_NAMESPACE)) terms.add(q.object.value);
        else if (q.object.value.startsWith(RECORD_NAMESPACE)) next.push(q.object.value);
      }
    }
    frontier = next;
  }
  for (const term of terms) {
    for (const label of LABELS) out.push(...store.getQuads(term, label, null, null));
  }
  return out;
}
