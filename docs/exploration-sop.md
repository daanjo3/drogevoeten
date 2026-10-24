# Exploration SOP: finding data about the drowned villages

This document describes how we explore and fetch data sources for the project. Use it as the checklist whenever a new source from the source list (`tmp/Datalijstje voor hackalod 2026 - Blad1.csv`) is picked up.

## Goal

Use the **Kaart Verdronken Dorpen Zeeland** (Provincie Zeeland, WFS layer `chs:geocmd_vrddrppnt`) as the backbone and find, for every village in it, related information in the other sources. The end result is:

1. One RDF (preferred) or JSON output per source, containing only the information relevant to the villages.
2. A summary of which information is available where, per village and per source.
3. A combined RDF dump that aggregates everything around the backbone villages.

## Principles

- **Linked data first.** Prefer RDF over anything else. Turtle (`.ttl`) is the preferred serialization. Non-RDF sources (such as the WFS geodata) produce at least JSON. Converting them to RDF happens in a later step.
- **SPARQL through Comunica.** All SPARQL querying, whether against a remote endpoint or a local dump, goes through [Comunica](https://comunica.dev/docs/query/getting_started/query_app/):
  - `@comunica/query-sparql` for remote endpoints, for example `{ type: 'sparql', value: 'https://query.wikidata.org/sparql' }`. Set `type: 'sparql'` explicitly so the endpoint isn't mistaken for a file.
  - `@comunica/query-sparql-file` for local files in `dumps/`, for example `{ type: 'file', value: 'dumps/foo.ttl' }`.
  - Consume results with `await bindingsStream.toArray()`, or `quadStream.toArray()` for CONSTRUCT. Use a streaming `data` listener only when a result set is large.
- **Query each source once.** Batch the villages into a single query with `VALUES`, for example `VALUES ?name { "Reimerswaal"@nl "Valkenisse"@nl ... }`. Don't loop one query per village. Query a source more than once only when the questions are about wildly different topics.
- **Dump small datasets.** For a small or moderately sized dataset, download a dump into `dumps/` once and query it locally with Comunica. Don't hammer the remote service.
- **One source per script.** Every script touches at most one external source. Scripts are numbered and run in order. A later script may read the outputs of earlier ones.
- **Reproducible.** `data/` and `dumps/` are not committed. Anyone who clones the repository must be able to recreate both by running the scripts in order.

## Layout

The repository is a pnpm workspace. The exploration code is its own workspace package in `exploration/`. `data/` and `dumps/` live at the repository root so that other packages (for example the Minecraft side) can use them. Scripts resolve these paths relative to the repository root, not the current working directory.

```
pnpm-workspace.yaml
package.json                   # workspace root
exploration/                   # workspace package @verdronkendorpen/exploration
  package.json                 # Comunica and other exploration dependencies, run scripts
  tsconfig.json                # type checking only (noEmit)
  scripts/
    01-fetch-backbone.ts       # WFS -> data/backbone/
    02-wikidata-villages.ts    # Wikidata SPARQL -> data/wikidata/
    03-zeeuws-erfgoedplatform.ts  # Collectie Zeeland museum objects dump -> data/zeeuws-erfgoedplatform/
    NN-<source>.ts             # one per source
    lib/                       # shared helpers (config, paths, HTTP with User-Agent, JSON/Turtle writing, types)
  resources/                   # committed input files, e.g. the backbone backup
  datasets/                    # dataset descriptions (DCAT/schema.org from the NDE Datasetregister)
  notebooks/                   # SPARQL Notebooks (.sparqlbook) to explore a source's dump
  .env.example                 # configuration options; copy to .env
  queries/
    <source>-<topic>.rq        # SPARQL queries as separate files, loaded by the scripts
dumps/                         # raw downloaded dumps (gitignored, except .gitkeep)
data/                          # results (gitignored)
  backbone/villages.geojson
  backbone/villages.json
  wikidata/villages.ttl
  wikidata/matches.ttl         # match results as RDF (vd:Village, skos:exactMatch, vd:candidate)
  wikidata/matches.json
  <source>/...                 # .ttl preferred, .json otherwise
  summary.json                 # what was found where
  combined.ttl                 # aggregated RDF
docs/
  exploration-sop.md           # this document
  sources.md                   # findings per source (human-readable)
```

Scripts are TypeScript, run directly by Node 26 or later (type stripping, no build step). Install with `pnpm install` at the repository root. Each script has a package script, and `fetch:all` runs them all in order:

```sh
pnpm --filter @verdronkendorpen/exploration run fetch:backbone   # 01
pnpm --filter @verdronkendorpen/exploration run fetch:wikidata   # 02
pnpm --filter @verdronkendorpen/exploration run fetch:all
pnpm --filter @verdronkendorpen/exploration run typecheck
```

Scripts are configured with environment variables or `exploration/.env` (see `.env.example`), validated by `env-schema` in `scripts/lib/config.ts`. For example, `BACKBONE_SOURCE=backup pnpm --filter @verdronkendorpen/exploration run fetch:all` runs everything without the WFS.

## Procedure per source

For every source on the list:

1. **Assess access.** Find out what the source offers: SPARQL endpoint, RDF dump, Linked Data Fragments, REST/JSON API, WFS, or website only. Look in the NDE Datasetregister first, since it often lists distributions that the source's website doesn't mention. Verify endpoints and API behaviour against live documentation or a test request. Don't rely on assumptions.
2. **Choose a strategy**, in order of preference:
   1. RDF dump (small or moderate size) in `dumps/`, then a local Comunica query.
   2. SPARQL endpoint, then a remote Comunica query with `VALUES` batching.
   3. Non-RDF API or download, then save the raw JSON and extract the relevant fields.
   4. Website only: record it in `docs/sources.md` as a manual or narrative source. Don't scrape it.
3. **Decide the matching key.** Decide how a record in the source links to a backbone village:
   - A direct identifier, such as a Wikidata QID, which is best once step 02 has produced them.
   - The village name, including spelling variants and alternative names, normalised for case and diacritics.
   - Location: distance to the backbone coordinates, or the municipality as a coarse fallback.

   Record which key was used, because name-only matches can be ambiguous.
4. **Write the script** `exploration/scripts/NN-<source>.ts` and add a package script for it. It should:
   - read its input (usually `data/backbone/villages.json`, plus QIDs from `data/wikidata/` where useful);
   - query or fetch the source once (with batching), or download the dump if it's missing (`dumps/` acts as a cache);
   - write the results to `data/<source>/` as `.ttl` (CONSTRUCT) or `.json`;
   - log a short summary: the number of villages matched and the number of records found.
5. **Add a notebook** for sources with a dump: `exploration/notebooks/<source>.sparqlbook` for the [SPARQL Notebook](https://marketplace.visualstudio.com/items?itemName=Zazuko.sparql-notebook) VS Code extension. Each code cell starts with `# [endpoint=../../dumps/<dump>.ttl]` (relative to the notebook). Cover the classes, the properties of the main entities, where places and texts are, images, licences, and an example search. Check the queries with Comunica before committing.
6. **Record findings.** Add or update the source's section in `docs/sources.md`: access method, licence, matching key, coverage (how many villages matched), what kind of information it contains, and any caveats. The summary script reads the output files to produce `data/summary.json`.

## Final steps

- **Summary** (`exploration/scripts/90-summary.ts`): for each backbone village, lists which sources have information and of what kind. Writes `data/summary.json`, optionally also as a Markdown table.
- **Combine** (`exploration/scripts/99-combine.ts`): converts the backbone to RDF if that hasn't been done yet, merges all `.ttl` outputs, and links them to the backbone village URIs (via `owl:sameAs` or `schema:sameAs` to the Wikidata QIDs). Writes `data/combined.ttl`.

## Source notes

### 01: Backbone, Kaart Verdronken Dorpen (WFS)

- Capabilities: `https://opengeodata.zeeland.nl/geoserver/chs/wfs?request=GetCapabilities`
- Layer: `chs:geocmd_vrddrppnt` (title "Verdronken dorpen").
- The default CRS is RD New (`EPSG:28992`). GetFeature supports `outputFormat=application/json` (GeoJSON) and `srsName=EPSG:4326` (WGS84, which is needed for matching against Wikidata coordinates). The script checks the axis order against the layer's WGS84 bounding box and swaps the axes if needed.
- Request: `service=WFS&version=2.0.0&request=GetFeature&typeNames=chs:geocmd_vrddrppnt&outputFormat=application/json&srsName=EPSG:4326`
- The service is unreliable. On 2026-10-24 GetFeature sometimes returned a GeoServer `ows:ExceptionReport` (HTTP 500 after about 30 seconds) because the backend database (`geopg-ext.zeeland.nl:5432`) refused connections, while the same request worked at other times. The script retries, rejects exception reports instead of writing them as data, and caches the response in `dumps/verdronken-dorpen.geojson`. As a fallback, download the request URL in a browser and save it there.
- The property that holds the village name is detected at runtime (`naam`, `name`, ...). The script fails and lists the available properties if none is found.
- **Backup:** `exploration/resources/verdronken_dorpen_backup.json` holds an export of the layer: 201 records with `naam`, `namen` (alternative and historical names), `gemeente`, RD coordinates and WGS84 `lat`/`lon`. Select it with `BACKBONE_SOURCE=backup`, and point to another file with `BACKBONE_BACKUP_FILE`. Known quirks, handled by the script:
  - Exact duplicates ("Agger 2", "Kreke"), which are skipped, leaving 199 villages.
  - Names that occur more than once (Westkerke, Oostkerke, Weele, ...). Their ids get the municipality added.
  - Numbered locations of one village ("Oud-Westdorpe 1/2"). 02 also searches the name without the number.
  - One garbled name ("V?lckerdorp", which triggers a warning) and a misspelled municipality ("Reimersaal").
  - Two records have a municipality outside Zeeland (Woensdrecht, Bergen op Zoom).
- `villages.json` has the same shape for both sources: `id`, `name`, `altNames` (only from the backup), `municipality`, `lon`, `lat`, and the original record in `properties`.
- The licence is listed as unknown in the registry and still has to be checked with the Provincie Zeeland.

### 02: Wikidata

- Endpoint: `https://query.wikidata.org/sparql` (Comunica source type `sparql`).
- Query: `exploration/queries/wikidata-villages.rq`, one CONSTRUCT. Comunica forwards the whole query to the endpoint in a single request.
- Item set: labels or aliases equal to a backbone village name or alternative name, also without a trailing number (`VALUES` with `@nl` and `@mul` literals, about 300 names), **plus every submerged settlement in the Netherlands** (`wdt:P31 wd:Q20616831` "verdronken plaats" with `wdt:P17 wd:Q55`, 79 items on 2026-10-24). The second part catches villages that are spelled differently, and shows which drowned places Wikidata knows that the backbone lacks.
- Returned per item: labels and aliases (nl, en, mul), `P31` with nl class labels, `P17`, `P131` with labels, coordinates `P625`, inception `P571`, dissolution `P576`, Rijksmonument ID `P359` (useful for RCE later), Commons category `P373`, image `P18`, and the nlwiki article.
- **Blazegraph needs a query hint.** Without `hint:Query hint:optimizer "None"` the endpoint evaluates the UNION branches (for example `?item wdt:P31 ?class`) over all of Wikidata and times out with HTTP 504 after about 60 seconds. With the hint and the item subquery first, it answers in about 2 seconds. Comunica passes the hint through unchanged.
- Matching, in the script:
  - A candidate is **accepted** when its coordinates are within 5 km of the backbone point.
  - Each candidate records how it was found (`match`): `name` (the village name), `altName` (an alternative name from the backup) or `location` (a submerged settlement within 2 km).
  - Items whose only classes are "municipality of the Netherlands" (Q2039348) or "disambiguation page" (Q4167410) are always rejected. They share a village's name but are never the village itself, for example the present-day municipality of Reimerswaal (Q10078) next to the drowned town (Q2590944).
  - Candidates are ranked by kind of match (name > altName > location), then by class (submerged settlement > former settlement or ghost town > human settlement > other), then by distance.
  - **Only name matches are selected automatically.** An `altName` match is selected only if the item is a submerged or former settlement, because alternative names often point to a successor village or a building (the drowned Monster's alternative name "Borssele" matches the present-day village). **Location-only candidates are never selected**: drowned villages often lie 1 to 2 km apart, so a nearby one is usually a neighbour (Looxhaven is 0.28 km from Rengerskerke).
  - Per village the status is `matched` (one clear best), `ambiguous` (a tie between equally strong matches), `unconfirmed` (candidates exist but none can be selected, so check by hand) or `not-found`.
  - Result with the backup on 2026-10-24: 199 villages, of which 59 matched, 2 ambiguous (Viane has two items at the same spot; Schelphoek vs. a motorway service area), 75 unconfirmed (20 with only location hints) and 63 not found. 44 of the 79 Dutch submerged settlements on Wikidata were not matched to a backbone village.
- Output: `data/wikidata/villages.ttl` (the selected items and all submerged settlements), `data/wikidata/matches.ttl` (the match results as RDF) and `data/wikidata/matches.json` (the same results, plus `unmatchedSubmerged`).
- `matches.ttl` gives every backbone village an IRI (`lib/vocab.ts`), and links it to its item with `skos:exactMatch`. It also has the label, alternative names, municipality and coordinates, a `vd:matchStatus`, and a `vd:candidate` node per candidate (`vd:item`, `vd:candidateStatus`, `vd:matchedBy`, `vd:distanceKm`, `vd:classRank`). The project namespace is a placeholder under the GitHub repository URL. Choose a permanent base before publishing.
- Notebook: `exploration/notebooks/wikidata-matches.sparqlbook` covers the status overview, good matches, matches to review, what the matched items add (nlwiki, images, Commons, dates), open cases, and drowned places only on Wikidata. On 2026-10-24 the 59 matched villages pointed to 53 items, because some backbone entries share an item: all 53 have an nlwiki article, 21 an image, 14 a Commons category, 3 dates and none a Rijksmonument number.
- Wikimedia's policy asks for a descriptive `User-Agent` header on automated requests. Comunica's `fetch` context option is used to set it.

### 03: Zeeuws erfgoedplatform, museum objects (Collectie Zeeland)

- Dataset description: `exploration/datasets/zeeuws-erfgoedplatform-museum-object.jsonld` (schema.org, from the NDE Datasetregister). The script reads the Turtle download URL from it with Comunica (`queries/zeeuws-erfgoedplatform-distribution.rq`), so a new URL only needs a new description file.
- Dump: about 24 MB of Turtle, downloaded in a few seconds into `dumps/zeeuws-erfgoedplatform-museum-objecten.ttl`, and reused unless `--refresh` is passed. The description gives CC0 as the licence (dateModified 2026-10-11). Inside the dump, objects use two spellings of the CC0 URL, and 1,298 objects have no licence at all.
- Content: 8,151 objects (`crm:E22_Human-Made_Object`) in CIDOC-CRM, with schema.org for identifiers, licences and images. 6,853 objects have an IIIF manifest and 6,822 a thumbnail.
- **Places are free text.** The only structured places are 595 production places (`P108i_was_produced_by/P7_took_place_at`), mostly not in Zeeland (IJlst, Aardenburg, Epe). Find spots are only mentioned in titles, for example "Glas-in-lood fragmenten, gevonden op de plaats waar het verdronken Hontenisse heeft gelegen".
- The Groene Man from Emelisse (`hdl 21.12128/327448257`) from the source list is **not** in this dump. It probably belongs to another Collectie Zeeland set.
- Search (`queries/zeeuws-erfgoedplatform-texts.rq`): one query over the title, abstract, description, type labels, production place and references, filtered by one REGEX with all names (2 to 3 seconds). `VALUES ?name` with `CONTAINS` is far too slow here (30 seconds for 6 names), because Comunica crosses every name with every literal.
- Matching, in the script:
  - **Names.** The backbone names, alternative names and numberless variants, plus the Wikidata labels and aliases of villages matched in 02 (about 370 names). Matched case-sensitively as whole words, so "namen", "monster" and "schare" don't match as ordinary words.
  - **Evidence.** `context` when the object's texts also mention drowning (`verdronk|verdwen|verzwolg|verzonk|overspoeld`); `name` for the name alone. Name-only matches are mostly present-day places with the same name (Groede, Westkerke on Tholen, Borssele, Kapelle) or the 1953 flood (Schelphoek, Noordwelle), so review them.
  - **Shortened names.** A name without "Oud-"/"Nieuw-" ("Hontenisse" for "Oud-Hontenisse 1") only counts with context.
  - **Generic objects.** Objects about drowning without a known name are kept as `generic`, with spelling-based suggestions (edit distance up to 2 for words of 6 or more letters): "Verdronken dorp Tolseinde" suggests Tolsende.
- **Dating**, so objects made after a village drowned can be ruled out later (`queries/zeeuws-erfgoedplatform-dates.rq`). Every found object gets:
  - `created`: `{ beginYear, endYear }` from the production period (`P108i_was_produced_by/P4_has_time-span`, `P82a`/`P82b`), or `null`. Only about 14% of all objects have one (1,151 of 8,151), mostly from the 20th century (582), the 19th (138) and the Roman period (2nd century, 215).
  - The dataset writes unknown dates as `0001-01-01`: in 422 end dates and in every `schema:datePublished`, which is therefore not used. Year 1 counts as unknown, so `endYear` can be `null` while `beginYear` is known. An object with several production periods spans all of them.
  - `yearsInTitle`: years 1000 to 2029 mentioned in the title ("Foto Noordwelle 1953"). This is a weaker hint, because a title year can also be the event an object commemorates.
- Output: `data/zeeuws-erfgoedplatform/matches.json` (`dataset`, `villages` with their objects, `generic`, each object with its dating) and `objects.ttl`, the full descriptions of all found objects, including their production periods (`queries/zeeuws-erfgoedplatform-objects.rq`).
- Result with the backup on 2026-10-24: 10 villages with objects, 1 match with context (Oud-Hontenisse), 15 name-only matches, and 5 generic objects. Of the 17 objects found, only 2 have a production date and 1 has a year in its title, so the date check will rule out little in this collection. The yield is low, because this collection rarely names find spots.
- Notebook: `exploration/notebooks/zeeuws-erfgoedplatform.sparqlbook`.
