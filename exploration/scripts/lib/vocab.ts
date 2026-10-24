// IRIs for the project's own resources and terms.
// TODO: choose a permanent, dereferenceable base (e.g. a w3id.org redirect) before publishing data.
export const BASE_IRI = 'https://github.com/daanjo3/verdronkendorpen/';

/** A backbone village, by its id from data/backbone/villages.json. */
export const villageIri = (id: string): string => `${BASE_IRI}id/village/${encodeURIComponent(id)}`;

/** Project vocabulary for match results that existing vocabularies don't cover. */
export const VD = `${BASE_IRI}vocab#`;

export const PREFIXES = {
  vd: VD,
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  village: `${BASE_IRI}id/village/`,
  wd: 'http://www.wikidata.org/entity/',
  wdt: 'http://www.wikidata.org/prop/direct/',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  schema: 'http://schema.org/',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
};
