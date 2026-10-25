import { readFileSync } from 'node:fs';
import type { Quad } from '@rdfjs/types';
import { Parser } from 'n3';
import { VOCAB_FILE } from './paths.ts';

// IRIs for the project's own resources and terms.
// TODO: choose a permanent, dereferenceable base (e.g. a w3id.org redirect) before publishing data.
export const BASE_IRI = 'https://github.com/daanjo3/verdronkendorpen/';

/** A backbone village, by its id from data/backbone/villages.json. */
export const villageIri = (id: string): string => `${BASE_IRI}id/village/${encodeURIComponent(id)}`;

/** A row of the table in the Wikipedia list of drowned villages, by its number ("Nr"). */
export const wikipediaListRowIri = (row: number): string => `${BASE_IRI}id/wikipedia-list-row/${row}`;

/** Project vocabulary for terms that existing vocabularies don't cover, defined in vocab/vd.ttl. */
export const VD = `${BASE_IRI}vocab#`;

export const PREFIXES = {
  vd: VD,
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  village: `${BASE_IRI}id/village/`,
  row: `${BASE_IRI}id/wikipedia-list-row/`,
  wd: 'http://www.wikidata.org/entity/',
  wdt: 'http://www.wikidata.org/prop/direct/',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  schema: 'http://schema.org/',
  dcterms: 'http://purl.org/dc/terms/',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
};

/** How a record was linked to a village, from strong to weak (see the SOP, "Match keys"). */
export type MatchKey =
  | 'identifier'
  | 'place-geo'
  | 'place-name'
  | 'location'
  | 'text-context'
  | 'text-name'
  | 'generic';

/** Where a name in the name index comes from. */
export type NameOrigin = 'primary' | 'numberless' | 'wikipedia' | 'wikidata' | 'alt' | 'stem';

export type Status = 'accepted' | 'review' | 'rejected';

/** Why a candidate got its status: rejection reasons, review reasons, or an override. */
export type StatusReason =
  | 'location'
  | 'class'
  | 'date'
  | 'better-match'
  | 'override'
  | 'tie'
  | 'homonym'
  | 'weak-key'
  | 'spelling'
  | 'alt-name'
  | 'no-coordinates';

/** The overall result for a village in a source with at most one record per village. */
export type VillageStatus = 'matched' | 'ambiguous' | 'unconfirmed' | 'not-found';

/** Causes of drowning, as written in the Wikipedia list. */
export type DrowningCause = 'militaire inundatie' | 'inundatie' | 'stormvloed' | 'buitengedijkt' | 'verlaten';

const DROWNING_CAUSE_LOCAL: Record<DrowningCause, string> = {
  'militaire inundatie': 'military-inundation',
  inundatie: 'inundation',
  stormvloed: 'storm-surge',
  buitengedijkt: 'outside-dikes',
  verlaten: 'abandoned',
};

/** IRIs of the concepts in vocab/vd.ttl. */
export const concept = {
  matchKey: (key: MatchKey): string => `${VD}key-${key}`,
  nameOrigin: (origin: NameOrigin): string => `${VD}origin-${origin}`,
  status: (status: Status): string => `${VD}status-${status}`,
  statusReason: (reason: StatusReason): string => `${VD}reason-${reason}`,
  villageStatus: (status: VillageStatus): string => `${VD}village-${status}`,
  drowningCause: (cause: DrowningCause): string => `${VD}cause-${DROWNING_CAUSE_LOCAL[cause]}`,
};

/** A term of the vd vocabulary, such as vd('candidate'). */
export const vd = (local: string): string => `${VD}${local}`;

let definedTerms: Set<string> | undefined;

/** Throws when quads use a vd: term that vocab/vd.ttl doesn't define, so typos never reach the data. */
export function assertVocabulary(quads: Quad[]): void {
  definedTerms ??= new Set(
    new Parser()
      .parse(readFileSync(VOCAB_FILE, 'utf8'))
      .flatMap((q) => (q.subject.value.startsWith(VD) ? [q.subject.value] : [])),
  );
  const undefinedTerms = new Set<string>();
  for (const q of quads) {
    for (const term of [q.subject, q.predicate, q.object]) {
      if (term.termType === 'NamedNode' && term.value.startsWith(VD) && !definedTerms.has(term.value)) {
        undefinedTerms.add(term.value);
      }
    }
  }
  if (undefinedTerms.size) {
    throw new Error(`Terms missing from ${VOCAB_FILE}: ${[...undefinedTerms].join(', ')}`);
  }
}
