# Exploration SOP: finding data about the drowned villages

This document describes how we explore and fetch data sources for the project. Use it as the checklist whenever a new source from the source list (`tmp/Datalijstje voor hackalod 2026 - Blad1.csv`) is picked up. Findings per source go in the [source notes](#source-notes) at the end.

## Goal

Use the **Kaart Verdronken Dorpen Zeeland** (Provincie Zeeland, WFS layer `chs:geocmd_vrddrppnt`) as the backbone and find, for every village in it, related information in the other sources. The end result is:

1. One RDF (preferred) or JSON output per source, containing only the information relevant to the villages.
2. A summary of which information is available where, per village and per source.
3. A combined RDF dump (`data/combined.ttl`) that aggregates every accepted match around the backbone villages. Every step contributes to it (see [Combined output](#combined-output)).

## Principles

- **Linked data first.** Prefer RDF over anything else. Turtle (`.ttl`) is the preferred serialization. Non-RDF sources (such as the WFS geodata) produce at least JSON. Converting them to RDF happens in a later step.
- **SPARQL through Comunica.** All SPARQL querying, whether against a remote endpoint or a local dump, goes through [Comunica](https://comunica.dev/docs/query/getting_started/query_app/):
  - `@comunica/query-sparql` for remote endpoints, for example `{ type: 'sparql', value: 'https://query.wikidata.org/sparql' }`. Set `type: 'sparql'` explicitly so the endpoint isn't mistaken for a file.
  - `@comunica/query-sparql-file` for local files in `dumps/`, for example `{ type: 'file', value: 'dumps/foo.ttl' }`.
  - Consume results with `await bindingsStream.toArray()`, or `quadStream.toArray()` for CONSTRUCT. Use a streaming `data` listener only when a result set is large.
- **Query each source once.** Batch the villages into a single query with `VALUES`, for example `VALUES ?name { "Reimerswaal"@nl "Valkenisse"@nl ... }`. Don't loop one query per village. Query a source more than once only when the questions are about wildly different topics.
- **Dump small datasets.** For a small or moderately sized dataset, download a dump into `dumps/` once and query it locally with Comunica. Don't hammer the remote service.
- **Request budget: at most 10 requests per remote endpoint (host) per pipeline run.** Every request counts: queries, search pages, lookups of single records, metadata calls and downloads. A source that can't be covered within the budget and has no dump is dropped and recorded as such in the [source notes](#source-notes); don't work around the limit with throttling or many small requests. Large dumps are fine: one download, filtered locally (as for RCE and the Rijksmuseum).
- **One source per step.** Every source step touches at most one external source. The exception is the backbone step, which combines the WFS layer with the Wikipedia list of drowned villages, because both describe the villages themselves.
- **Steps are independent.** Every step reads the backbone (`data/backbone/villages.json`) and nothing else is required. A step may use the output of another step when it exists (the museum step uses the Wikidata labels and homonyms), but must still work, with a warning, when it doesn't. The run order is configured in one place, `exploration/scripts/main.ts`, not in file names.
- **Reproducible.** `data/` and `dumps/` are not committed. Anyone who clones the repository must be able to recreate both by running `fetch:all`.

## Layout

The repository is a pnpm workspace. The exploration code is its own workspace package in `exploration/`. `data/` and `dumps/` live at the repository root so that other packages (for example the Minecraft side) can use them. Scripts resolve these paths relative to the repository root, not the current working directory.

```
pnpm-workspace.yaml
package.json                   # workspace root
vocab/
  vd.ttl                       # the project vocabulary (vd:), every custom term used in the data
exploration/                   # workspace package @verdronkendorpen/exploration
  package.json                 # Comunica and other exploration dependencies, run scripts
  tsconfig.json                # type checking only (noEmit)
  scripts/
    main.ts                    # runs the backbone and then the steps, in the configured order
    backbone.ts                # WFS + Wikipedia list -> data/backbone/
    wikidata.ts                # Wikidata SPARQL -> data/wikidata/
    zeeuws-erfgoedplatform.ts  # Collectie Zeeland museum objects dump -> data/zeeuws-erfgoedplatform/
    rijksmuseum.ts             # Rijksmuseum EDM dump (2020), filtered locally -> data/rijksmuseum/
    rce.ts                     # RCE Cultuurhistorische Objecten dump (Zeeland subset) -> data/rce/
    <source>.ts                # one per source; the name is also the data/ directory and the override source
    lib/                       # shared helpers (config, paths, HTTP with User-Agent, JSON/Turtle writing, types)
      matching.ts              # shared matching: name index, homonyms, statuses, overrides, matches.ttl
      combined.ts              # accepted.ttl and data/combined.ttl
      vocab.ts                 # IRIs and the check that every vd: term is defined in vocab/vd.ttl
      wikipedia-list.ts        # fetching and parsing the Wikipedia list (used by the backbone)
      rijksmuseum-edm.ts       # the Rijksmuseum dump: download URL, streaming the zip, the subset filter
      ntriples.ts              # streaming over large (gzipped) N-Triples dumps, line by line
      rce-cho.ts               # the RCE dump: download, Zeeland subset, describing records
      geo.ts                   # distances between a point and a WKT geometry
  resources/                   # committed input files, e.g. the backbone backup
    match-overrides.json       # manual review decisions, applied by every step (create it when needed)
  datasets/                    # dataset descriptions (DCAT/schema.org from the NDE Datasetregister)
  notebooks/                   # SPARQL Notebooks (.sparqlbook) to explore a source's dump or results
  .env.example                 # configuration options; copy to .env
  queries/
    <source>-<topic>.rq        # SPARQL queries as separate files, loaded by the scripts
dumps/                         # raw downloaded dumps (gitignored, except .gitkeep)
data/                          # results (gitignored)
  backbone/villages.json       # the villages, with their Wikipedia row and date of drowning
  backbone/villages.geojson
  backbone/villages.ttl        # the villages as RDF, the base of combined.ttl
  backbone/wikipedia-list.json # the parsed rows of the Wikipedia list, with their candidates
  backbone/wikipedia-list.ttl
  backbone/matches.ttl         # row candidates
  wikidata/villages.ttl        # the accepted and review items, and all Dutch submerged settlements
  wikidata/matches.json
  wikidata/homonyms.json       # derived homonym list (names shared with present-day places)
  <source>/...                 # the source's own output: .ttl preferred, .json otherwise
  <source>/matches.ttl         # all candidates in the shared vd: vocabulary
  <source>/accepted.ttl        # this source's contribution to combined.ttl
  summary.json                 # what was found where (not written yet)
  combined.ttl                 # aggregated RDF: backbone plus every accepted match
docs/
  exploration-sop.md           # this document, including the findings per source
```

Scripts are TypeScript, run directly by Node 26 or later (type stripping, no build step). Install with `pnpm install` at the repository root. Each step has a package script, and `fetch:all` runs `main.ts`: the backbone first, then every step in the order of `STEPS` in `main.ts`. Pass step names to run only those (the backbone always runs, and is quick with its caches), and `--refresh` to download cached sources again:

```sh
pnpm --filter @verdronkendorpen/exploration run fetch:all
pnpm --filter @verdronkendorpen/exploration run fetch:all zeeuws-erfgoedplatform
pnpm --filter @verdronkendorpen/exploration run fetch:backbone
pnpm --filter @verdronkendorpen/exploration run fetch:wikidata
pnpm --filter @verdronkendorpen/exploration run typecheck
```

Scripts are configured with environment variables or `exploration/.env` (see `.env.example`), validated by `env-schema` in `scripts/lib/config.ts`. For example, `BACKBONE_SOURCE=backup pnpm --filter @verdronkendorpen/exploration run fetch:all` runs everything without the WFS.

## Procedure per source

For every source on the list:

1. **Assess access.** Find out what the source offers: SPARQL endpoint, RDF dump, Linked Data Fragments, REST/JSON API, WFS, or website only. Look in the NDE Datasetregister first, since it often lists distributions that the source's website doesn't mention. Also look for older or "historical" dumps on the source's documentation pages: a dataset description doesn't always list them (the Rijksmuseum's does not). Verify endpoints and API behaviour against live documentation or a test request, with a handful of requests at most. Don't rely on assumptions.
2. **Count the requests.** Work out how many requests the step would send per run, including paging and per-record lookups, and check whether the source can batch (`VALUES`, an OR search, a bulk endpoint). It must stay within the [request budget](#principles) of 10 per endpoint. If it can't and there is no dump, stop here and record the source as dropped.
3. **Choose a strategy**, in order of preference:
   1. RDF dump (small or moderate size) in `dumps/`, then a local Comunica query.
   2. SPARQL endpoint, then a remote Comunica query with `VALUES` batching.
   3. Non-RDF API or download, then save the raw JSON and extract the relevant fields.
   4. Website only: record it in the [source notes](#source-notes) as a manual or narrative source. Don't scrape it.
4. **Decide the matching keys.** Find out which [match keys](#2-match-keys) the source supports: identifiers, structured place fields, coordinates, or only free text. Then follow [Matching villages](#matching-villages). Use the strongest key the source offers, and fall back to weaker keys only for records the stronger ones don't reach.
5. **Write the step** `exploration/scripts/<source>.ts`, add a package script `fetch:<source>` for it, and add it to `STEPS` in `main.ts`, after the steps whose output it uses. It should:
   - read its input (usually `data/backbone/villages.json`, plus what other steps wrote where useful, with a warning when it's missing);
   - query or fetch the source once (with batching), or download the dump if it's missing (`dumps/` acts as a cache, `--refresh` downloads again), and stay within the request budget of 10 requests per endpoint, also on a run without cache;
   - match with the shared helpers in `lib/matching.ts`, and apply the overrides with `applyOverrides`;
   - write the source's own results to `data/<source>/` as `.ttl` (CONSTRUCT) or `.json`, the candidates with `writeMatches` (`matches.ttl`), and the accepted matches with `writeAccepted` (`accepted.ttl`, which also rebuilds `data/combined.ttl`);
   - define any new `vd:` term in `vocab/vd.ttl` first: writing fails on terms that aren't defined there;
   - log a short summary: the number of villages matched, the number of records found, and the counts per status.
6. **Add a notebook** for sources with a dump: `exploration/notebooks/<source>.sparqlbook` for the [SPARQL Notebook](https://marketplace.visualstudio.com/items?itemName=Zazuko.sparql-notebook) VS Code extension. Each code cell starts with `# [endpoint=../../dumps/<dump>.ttl]` (relative to the notebook). Cover the classes, the properties of the main entities, where places and texts are, images, licences, and an example search. Check the queries with Comunica before committing. For a large source, whose dump or subset doesn't fit comfortably in memory, point the notebook at the step's output instead (see "Large datasets and memory" in `AGENTS.md`).
7. **Record findings.** Add or update the source's section in the [source notes](#source-notes): access method, the number of requests per run, licence, matching keys, coverage (how many villages matched, per status), what kind of information it contains, and any caveats.

## Matching villages

Every source links its records to backbone villages the same way. The shared parts live in `exploration/scripts/lib/matching.ts`. A step contains only what is specific to its source: access, fields and dates.

### 1. Name index

One index of all village names (`villageNames` and `buildNameIndex`), shared by every step. Each name records where it comes from, because its origin determines how much it proves:

| Origin | Example | Strength |
| --- | --- | --- |
| `primary` | the backbone name, "Reimerswaal" | strong |
| `numberless` | "Agger" for "Agger 1" | strong |
| `wikipedia` | the name in the village's row of the Wikipedia list, "Hinkelenoord" | medium |
| `wikidata` | labels and aliases of the Wikidata item accepted for the village | medium |
| `alt` | an alternative or historical name from the backup's `namen` | weak: often points to a successor village or a building |
| `stem` | "Hontenisse" for "Oud-Hontenisse 1" | weakest: on its own it names the present-day village, so it only counts with drowning context |

- A name occurs once per village, with its strongest origin. Names shorter than 3 letters are left out.
- Compare names normalised for diacritics, hyphens and whitespace (`normalize` in `lib/names.ts`). In free text, match **case-sensitively and as whole words**, so ordinary words like "namen", "monster" and "schare" don't match.
- To compare structured names from two sources, use the **spelling key** (`spellingKey`), which is the same for common spelling variants of historical Dutch names: ij/y, ae/a, gh/g, th/t, c/k, a final d/t, and doubled consonants ("Beoostenbly" and "Beoostenblij", "Saeftinghe" and "Saefthinge"). Doubled vowels stay, so "Weele" and "Welle" remain different. A match on the spelling key counts as exact. A near spelling (edit distance up to 2 on the spelling key, both keys at least 6 letters) is a fallback for records without an exact match, and always needs review.
- **Numbered locations** of one village ("Oud-Hontenisse 1" and "2") form one group (`locationGroup`). A record that matches several locations of one village is linked to all of them, and that is not a tie.
- **Homonyms**: a name that is also the name of a present-day place, such as Borssele, Kapelle, Groede or Westkerke. The list is derived, not maintained by hand. The wikidata step writes `data/wikidata/homonyms.json`: every searched name that is a label or alias of a Wikidata item of a present-day settlement class (village, town, hamlet, buurtschap, municipality, Belgian municipality section, French commune and similar, listed in `PRESENT_DAY_SETTLEMENTS` in `wikidata.ts`), excluding items that are also submerged or former settlements and items accepted for a village. Streets, polders, nature areas and buildings named after a drowned village don't count. Load the list with `loadHomonyms`.

### 2. Match keys

From strong to weak. Record per candidate which key matched it, in `vd:matchedBy` (the concepts `vd:key-*` in `vocab/vd.ttl`).

1. **`identifier`**: a shared identifier, such as the Wikidata QID, and later Rijksmonument numbers, GeoNames or Getty TGN ids.
2. **`place-geo`**: a name from the index in a structured place field or label, with coordinates within the distance threshold of the backbone point. The default threshold is 5 km (`MAX_DISTANCE_KM`).
3. **`place-name`**: a name from the index in a structured place field or label, without usable coordinates.
4. **`location`**: coordinates close to the backbone point, without a matching name. Never accepted automatically.
5. **`text-context`**: a name in free text (title, description, subject) with words about drowning **near it**: within `CONTEXT_WINDOW` (150) characters in the same text (`contextNear`), as in "het verdronken dorp Tolsende". The words are `CONTEXT_PATTERN`: `verdronk`, `verzwolg`, `verzonk`, `overspoel`, and `verdwenen` only in "verdwenen dorp/stad/parochie/nederzetting/kerk". Plain "verdwenen" is far too common in descriptions ("de oorspronkelijke ramen zijn verdwenen"), and context elsewhere in a long record often concerns another place.
6. **`text-name`**: a name in free text alone.
7. **`generic`**: the record is about drowning but names no village from the index. It can carry near-spelling suggestions (`vd:suggestedVillage`, such as Tolsende for "Tolseinde"). A generic record is never linked to a village automatically.

### 3. Disambiguation

Apply these checks to every candidate, in this order:

1. **Distance**: when the record has coordinates, a candidate beyond the threshold is rejected. Distance alone never selects a candidate, because drowned villages often lie 1 to 2 km apart (Looxhaven is 0.28 km from Rengerskerke).
2. **Location without coordinates**: a municipality in the record (for example the disambiguator in "Westkerke (Goes)") confirms the candidate in that municipality and rules out the others.
3. **Type or class**: types that are never the village are rejected, such as municipalities and disambiguation pages. Historical, former and submerged places rank above present-day ones.
4. **Homonyms and weak names**: a homonym only counts with drowning context near the name. That applies even to a place field with coordinates: present-day Schore, Borssele and Nieuwvliet lie right next to their drowned namesakes, so a monument with that location name is about the present-day village. A source that is about drowned villages as a whole, such as the Wikipedia list, counts as context. An `alt` name only counts for a record that is a historical place. A `stem` name only counts with context near it.
5. **Competition**: of the candidates for one village, the strongest wins, and the others are rejected as `better-match`. Equally strong candidates for different villages, or different records for one village, are a `tie`.
6. **Time**: a record dated after the village drowned is probably not about the village, but about its successor or a later event such as the 1953 flood. The date of drowning per village comes from the Wikipedia list (`drowned` in `villages.json`; `vd:drownedBeginYear` and `vd:drownedEndYear` in RDF). This check isn't applied yet: steps record each record's dating (production date, years in the title), so it can be added once we know how often objects are made later on purpose (maps, photos, commemorations).

### 4. Statuses

Every candidate (a pair of a village and a record) gets one status (`statusFor` gives the default per match key):

- **`accepted`**: selected automatically. That is `identifier`, `place-geo` and `place-name` on a name that isn't a homonym or has context near it, and `text-context`, when the checks pass and nothing ties.
- **`review`**: plausible, but needs checking by hand, with the reason in `vd:statusReason`: `tie`, `homonym`, `weak-key` (`location`, `text-name`), `spelling` (a near spelling), `alt-name` or `no-coordinates`.
- **`rejected`**: ruled out, with the reason in `vd:statusReason`: `location`, `class`, `date` or `better-match`.

An override sets the status to `accepted` or `rejected` with the reason `override`. `generic` candidates get no status. They stay in `matches.ttl` until someone links them to a village with an override.

A source with at most one record per village (such as Wikidata) also gives each village an overall status in `vd:matchStatus`: `matched` (exactly one accepted), `ambiguous` (a tie, or more than one accepted), `unconfirmed` (candidates, none accepted) or `not-found`.

Every step writes its candidates to `data/<source>/matches.ttl` with `writeMatches`. Each candidate is a `vd:Candidate` node with `vd:village`, `vd:record`, `vd:source`, `vd:matchedBy`, `vd:status`, and where relevant `vd:nameOrigin`, `vd:matchedName`, `vd:matchedField`, `vd:statusReason`, `vd:overrideNote`, `vd:distanceKm`, `vd:classRank`, `vd:editDistance` and `vd:suggestedVillage`. Statuses, reasons, keys and origins are SKOS concepts in `vocab/vd.ttl`. JSON output may be written next to it for convenience, but the RDF is leading.

### 5. Manual review (overrides)

Review decisions are kept in `exploration/resources/match-overrides.json`, which is committed. It is JSON, so it is easy to read and edit by hand. Every step applies it after automatic matching, so a decision survives when the steps run again.

```json
[
  {
    "source": "backbone",
    "village": "hinkeloord",
    "record": "https://github.com/daanjo3/verdronkendorpen/id/wikipedia-list-row/61",
    "decision": "accept",
    "reason": "Hinkelenoord is a spelling of Hinkeloord",
    "date": "2026-10-25"
  }
]
```

- `source` is the step name (also the directory under `data/`), `village` the backbone id, and `record` the record's IRI as it appears in `matches.ttl`.
- `decision` is `accept` or `reject`. An override can also link a `generic` record to a village.
- `reason` is required, so the next person can follow the decision. It ends up in `vd:overrideNote`.
- A step warns about overrides whose record or village no longer exists, and doesn't fail on them. It fails on an override that isn't valid.

## Combined output

Every step contributes its accepted matches to one shared `data/combined.ttl` (`lib/combined.ts`):

1. The backbone writes the villages as RDF to `data/backbone/villages.ttl`, including the date of drowning, the causes and the Wikipedia article of the accepted rows.
2. Every other step writes its own contribution to `data/<source>/accepted.ttl` with `writeAccepted`. This contains each accepted link from a backbone village IRI to a record (`schema:subjectOf` for a record about the village, or `skos:exactMatch` for an equivalent such as a Wikidata item), plus the record's description from the source.
3. `writeAccepted` (and the backbone, through `updateCombined`) then rebuilds `data/combined.ttl` from `backbone/villages.ttl` and every `data/*/accepted.ttl` that exists.

This keeps reruns idempotent: running one step again replaces only that step's part, and `combined.ttl` is always up to date after any step. `review`, `rejected` and `generic` candidates stay in the per-source `matches.ttl` and never go into `combined.ttl`. Before writing, the helpers check that every `vd:` term used is defined in `vocab/vd.ttl`.

The notebook `exploration/notebooks/combined.sparqlbook` summarizes `combined.ttl` per village: what each source added, a `richness` score (3 per record about the village, 2 per image, 1 per article, Wikidata item, date and cause of drowning), the richest villages as showcase candidates with their texts and images, the images and texts per village, the drowning dates and causes, map data, and the villages with nothing beyond the backbone.

## Final steps

- **Summary** (not written yet): for each backbone village, list which sources have information, of what kind and with which status. It reads every `data/*/matches.ttl` and writes `data/summary.json`, optionally also as a Markdown table. Add it as the last entry of `STEPS` in `main.ts`.

## Source notes

### Backbone: Kaart Verdronken Dorpen (WFS)

- Capabilities: `https://opengeodata.zeeland.nl/geoserver/chs/wfs?request=GetCapabilities`
- Layer: `chs:geocmd_vrddrppnt` (title "Verdronken dorpen").
- The default CRS is RD New (`EPSG:28992`). GetFeature supports `outputFormat=application/json` (GeoJSON) and `srsName=EPSG:4326` (WGS84, which is needed for matching against Wikidata coordinates). The script checks the axis order against the layer's WGS84 bounding box and swaps the axes if needed.
- Request: `service=WFS&version=2.0.0&request=GetFeature&typeNames=chs:geocmd_vrddrppnt&outputFormat=application/json&srsName=EPSG:4326`
- The service is unreliable. On 2026-10-24 GetFeature sometimes returned a GeoServer `ows:ExceptionReport` (HTTP 500 after about 30 seconds) because the backend database (`geopg-ext.zeeland.nl:5432`) refused connections, while the same request worked at other times. The script retries, rejects exception reports instead of writing them as data, and caches the response in `dumps/verdronken-dorpen.geojson`. As a fallback, download the request URL in a browser and save it there.
- The property that holds the village name is detected at runtime (`naam`, `name`, ...). The script fails and lists the available properties if none is found.
- **Backup:** `exploration/resources/verdronken_dorpen_backup.json` holds an export of the layer: 201 records with `naam`, `namen` (alternative and historical names), `gemeente`, RD coordinates and WGS84 `lat`/`lon`. Select it with `BACKBONE_SOURCE=backup`, and point to another file with `BACKBONE_BACKUP_FILE`. Known quirks, handled by the script:
  - Exact duplicates ("Agger 2", "Kreke"), which are skipped, leaving 199 villages.
  - Names that occur more than once (Westkerke, Oostkerke, Weele, ...). Their ids get the municipality added.
  - Numbered locations of one village ("Oud-Westdorpe 1/2"). The name index also has the name without the number.
  - One garbled name ("V?lckerdorp", which triggers a warning) and a misspelled municipality ("Reimersaal").
  - Two records have a municipality outside Zeeland (Woensdrecht, Bergen op Zoom).
- `villages.json` has the same shape for both sources: `id`, `name`, `altNames` (only from the backup), `municipality`, `lon`, `lat`, `wikipedia` and `drowned` (from the Wikipedia list, below, or `null`), and the original record in `properties`.
- The licence is listed as unknown in the registry and still has to be checked with the Provincie Zeeland.

### Backbone: Wikipedia list of drowned villages

- Source: the table "Tabel bij de kaart" in the Dutch Wikipedia article [Lijst van verdronken dorpen in Zeeland](https://nl.wikipedia.org/wiki/Lijst_van_verdronken_dorpen_in_Zeeland), with 117 rows (columns Nr, Plaatsnaam (alt. naam), Verdronken). The numbers are those of the map in the article. The three places under "Niet op de kaart" are not used. Licence CC BY-SA 4.0, like all Wikipedia text.
- Part of the backbone step, because it describes the villages themselves: the date of drowning is needed by every other step (the time check), and the names add spellings to the name index.
- Access: the MediaWiki API (`action=parse&prop=wikitext|revid&format=json&formatversion=2`), one request, cached in `dumps/wikipedia-lijst-verdronken-dorpen-zeeland.json` and reused unless `--refresh` is passed. An `error` in the response fails the step. Wikitext is used because the table exists nowhere else as data: Wikidata has no property for these dates or for the map numbers. The parser (`lib/wikipedia-list.ts`) fails when the section, the table or its columns change shape.
- Parsing:
  - **Names**: the text before the parentheses, with links replaced by their text and `'Oud'-` written as `Oud-`. A slash gives two names ("Saemslach/Genderdijk"). The names in parentheses are alternative names (with "?" removed). The title of the linked article (without its disambiguator) is an extra alternative name only when the link covers the whole name: "[[Oud-Nieuwvliet|Nieuwvliet]]" adds Oud-Nieuwvliet, but "'Oud'-[[Kortgene]]" links to the present-day village.
  - **Article**: the first link in the name column, as `vd:wikipediaArticle`. It can describe a successor of the drowned village (Kortgene, Kamperland for Campen, Zaamslag for Saemslach). Its disambiguator ("Westkerke (Goes)") is used as a municipality hint.
  - **Date of drowning**: the column can hold several dates ("1530/1532", "1508, 1509, 1511", "1570 en militaire inundatie 1584"); the last one is used. A date is a year, a range of years ("1550-1600"), or a century ("16e eeuw" is 1500 to 1599), stored as `beginYear` and `endYear`. Words around the dates ("voor", "na", "circa", "vermoedelijk", "begin", "2e helft") are ignored. For `{{Sorteer|key|text}}` the shown text is used, or the sort key when the text has no date ("opgegaan in Hoedekenskerke" has the key "17e eeuw"). Six rows have no date.
  - **Cause**: the terms "militaire inundatie", "inundatie", "stormvloed", "buitengedijkt" and "verlaten" anywhere in the column, as `cause` (the `vd:DrowningCauses` concepts in RDF). Other words, such as "storm" or "stormramp", are ignored.
- Matching (key `place-name`, since the rows have no coordinates): row names and village names are compared by spelling key; near spellings only for rows without any other match. A disambiguator that is a municipality confirms the village there and rules out the others (`location`). Pairs are scored (municipality, number of matching names, exact over spelling key, name origins) and assigned best-first, repeatedly, so "Weele (Sint-Marie)" first goes to the Weele with that alternative name and the other Weele then gets the remaining Weele row. A row goes to all numbered locations of one village. Homonyms don't apply, because the whole list is about drowned villages.
- Result on 2026-10-25 (revision 68233122): 110 rows accepted for 120 villages, 113 of them with a date of drowning (8 as a century) and 13 with a cause, and 116 with an article. To review: Oud-Wissenkerke (rows 29 and 30 for two locations), Oostende (rows 51 and 111 for two villages called Oostende, plus row 112 Sint-Lambert-Wulpen, an alternative name of Oostende in Vlissingen) and Hinkelenoord (row 61) for Hinkeloord (near spelling). Row 103 (Elmare) has no candidate.
- Output: `data/backbone/wikipedia-list.json` (the page and revision, every row with its candidates) and `wikipedia-list.ttl` (`vd:WikipediaListRow` per row, with `dcterms:source` the revision), `matches.ttl`, and the accepted data on the villages in `villages.json` and `villages.ttl`.

### Wikidata

- Endpoint: `https://query.wikidata.org/sparql` (Comunica source type `sparql`).
- Query: `exploration/queries/wikidata-villages.rq`, one CONSTRUCT. Comunica forwards the whole query to the endpoint in a single request.
- Item set: labels or aliases equal to a name from the name index with origin `primary`, `numberless`, `wikipedia` or `alt` (`VALUES` with `@nl` and `@mul` literals, 316 names on 2026-10-25), **plus every submerged settlement in the Netherlands** (`wdt:P31 wd:Q20616831` "verdronken plaats" with `wdt:P17 wd:Q55`, 79 items on 2026-10-24). The second part catches villages that are spelled differently, and shows which drowned places Wikidata knows that the backbone lacks.
- Returned per item: labels and aliases (nl, en, mul), `P31` with nl class labels, `P17`, `P131` with labels, coordinates `P625`, inception `P571`, dissolution `P576`, Rijksmonument ID `P359` (useful for RCE later), Commons category `P373`, image `P18`, and the nlwiki article.
- **Blazegraph needs a query hint.** Without `hint:Query hint:optimizer "None"` the endpoint evaluates the UNION branches (for example `?item wdt:P31 ?class`) over all of Wikidata and times out with HTTP 504 after about 60 seconds. With the hint and the item subquery first, it answers in about 2 seconds. Comunica passes the hint through unchanged.
- Matching, in the step:
  - A name match with coordinates within 5 km of the backbone point is `place-geo`; farther away it is rejected (`location`). A Dutch item without coordinates is `place-name` and needs review (`no-coordinates`).
  - Items whose only classes are "municipality of the Netherlands" (Q2039348) or "disambiguation page" (Q4167410) are rejected (`class`). They share a village's name but are never the village itself, for example the present-day municipality of Reimerswaal (Q10078) next to the drowned town (Q2590944).
  - An `alt` name only counts if the item is a submerged or former settlement; otherwise it needs review (`alt-name`), because alternative names often point to a successor village or a building (the drowned Monster's alternative name "Borssele" matches the present-day village).
  - A submerged settlement within 2 km without a matching name is a `location` candidate, which needs review (`weak-key`): drowned villages often lie 1 to 2 km apart, so a nearby one is usually a neighbour.
  - Candidates are ranked by kind of match (name > alternative name > location), then name origin (`primary`/`numberless` > `wikipedia`), then class (submerged settlement > former settlement or ghost town > human settlement > other), then distance. The best is accepted, the rest is rejected as `better-match`; equally strong candidates are a `tie`.
  - Result with the backup on 2026-10-25: 199 villages, of which 61 matched (53 items, because locations of one village share an item), 2 ambiguous (Viane has two items at the same spot; Schelphoek vs. a motorway service area), 76 unconfirmed (27 with only location candidates) and 60 not found. 44 of the 79 Dutch submerged settlements on Wikidata were not matched to a backbone village. Wikidata's Agger (Q2667239) lies 40 km from the backbone's Agger, so it is rejected. Wikidata gives "Sint-Nicolaas in Vaerne" as an alias of Elmare (Q3231566), so that village is matched to Elmare, while the Wikipedia list has them as two places: check this one.
- **Homonyms**: `data/wikidata/homonyms.json` lists the searched names that are also a present-day settlement on Wikidata (see [Name index](#1-name-index)), with the items: 42 names on 2026-10-25, such as Borssele, Kapelle, Groede, Westkerke, Schelphoek and Namen.
- Output: `data/wikidata/villages.ttl` (accepted and review items and all submerged settlements), `matches.ttl` (all candidates, each village's `vd:matchStatus` and the item labels), `matches.json` (the same, plus `unmatchedSubmerged`), `homonyms.json`, and `accepted.ttl` (`skos:exactMatch` from the village to the item, plus the item's triples).
- Notebook: `exploration/notebooks/wikidata-matches.sparqlbook` covers the status overview, good matches, matches to review, what the matched items add (nlwiki, images, Commons, dates, next to the date of drowning), open cases, and drowned places only on Wikidata. On 2026-10-25 the 53 accepted items all have an nlwiki article; 21 have an image, 14 a Commons category, 3 dates and none a Rijksmonument number.
- Wikimedia's policy asks for a descriptive `User-Agent` header on automated requests. Comunica's `fetch` context option is used to set it.

### Zeeuws erfgoedplatform, museum objects (Collectie Zeeland)

- Dataset description: `exploration/datasets/zeeuws-erfgoedplatform-museum-object.jsonld` (schema.org, from the NDE Datasetregister). The step reads the Turtle download URL from it with Comunica (`queries/zeeuws-erfgoedplatform-distribution.rq`), so a new URL only needs a new description file.
- Dump: about 24 MB of Turtle, downloaded in a few seconds into `dumps/zeeuws-erfgoedplatform-museum-objecten.ttl`, and reused unless `--refresh` is passed. The description gives CC0 as the licence (dateModified 2026-10-11). Inside the dump, objects use two spellings of the CC0 URL, and 1,298 objects have no licence at all.
- Content: 8,151 objects (`crm:E22_Human-Made_Object`) in CIDOC-CRM, with schema.org for identifiers, licences and images. 6,853 objects have an IIIF manifest and 6,822 a thumbnail.
- **Places are free text.** The only structured places are 595 production places (`P108i_was_produced_by/P7_took_place_at`), mostly not in Zeeland (IJlst, Aardenburg, Epe). Find spots are only mentioned in titles, for example "Glas-in-lood fragmenten, gevonden op de plaats waar het verdronken Hontenisse heeft gelegen".
- The Groene Man from Emelisse (`hdl 21.12128/327448257`) from the source list is **not** in this dump. It probably belongs to another Collectie Zeeland set.
- Search (`queries/zeeuws-erfgoedplatform-texts.rq`): one query over the title, abstract, description, type labels, production place and references, filtered by one REGEX with all names (2 to 3 seconds). `VALUES ?name` with `CONTAINS` is far too slow here (30 seconds for 6 names), because Comunica crosses every name with every literal.
- Matching, in the step:
  - **Names**: the whole name index, including the Wikipedia list names and the Wikidata labels and aliases of the accepted items (383 names on 2026-10-25), matched case-sensitively as whole words.
  - **Keys**: a name in the production place is `place-name`; in other texts it is `text-context` when drowning words are near the name, and `text-name` otherwise. A `stem` name only counts with context near it: "IJzendijke" or "Westdorpe" as a production place is the present-day town.
  - **Homonyms** (from the wikidata step) need review without context near the name, even in the production place. Name-only matches are mostly present-day places with the same name (Groede, Westkerke on Tholen, Borssele, Kapelle) or the 1953 flood (Schelphoek, Noordwelle).
  - A name shared by several villages (Westkerke) is a tie, except between locations of one village (Oud-Hontenisse 1 and 2).
  - **Generic objects**: objects about drowning without a known name are generic candidates, with near-spelling suggestions (edit distance up to 2 for words of 6 or more letters): "Verdronken dorp Tolseinde" suggests Tolsende.
- **Dating**, so objects made after a village drowned can be ruled out later (`queries/zeeuws-erfgoedplatform-dates.rq`). Every found object gets:
  - `created`: `{ beginYear, endYear }` from the production period (`P108i_was_produced_by/P4_has_time-span`, `P82a`/`P82b`), or `null`. Only about 14% of all objects have one (1,151 of 8,151), mostly from the 20th century (582), the 19th (138) and the Roman period (2nd century, 215).
  - The dataset writes unknown dates as `0001-01-01`: in 422 end dates and in every `schema:datePublished`, which is therefore not used. Year 1 counts as unknown, so `endYear` can be `null` while `beginYear` is known. An object with several production periods spans all of them.
  - `yearsInTitle`: years 1000 to 2029 mentioned in the title ("Foto Noordwelle 1953"). This is a weaker hint, because a title year can also be the event an object commemorates.
- Output: `data/zeeuws-erfgoedplatform/objects.ttl` (the full descriptions of all found objects, including their production periods, `queries/zeeuws-erfgoedplatform-objects.rq`), `matches.json` (`dataset`, `villages` with their date of drowning and their candidates, `generic`, each object with its dating), `matches.ttl`, and `accepted.ttl` (`schema:subjectOf` from the village to the object, plus the object's description).
- Result with the backup on 2026-10-25: 11 villages with candidates. 2 accepted (the glass fragments from the drowned Hontenisse, for both locations of Oud-Hontenisse), 15 to review as homonyms, and 5 generic objects. Of the 17 objects found, only 2 have a production date and 1 has a year in its title, so the date check will rule out little in this collection. The yield is low, because this collection rarely names find spots.
- Notebook: `exploration/notebooks/zeeuws-erfgoedplatform.sparqlbook`.

### Rijksmuseum

- **Access, and why a dump from 2020.** The dataset description `https://id.rijksmuseum.nl/260251` ("All published objects", 841,378 objects, CC0) lists three distributions: a IIIF Change Discovery feed and an LDES feed of the whole collection, and the Linked Art Search API. None fits the [request budget](#principles):
  - The Search API (`data.rijksmuseum.nl/search/collection`, parameters `title`, `description`, `creator`, `creationDate` and others) can't OR values. A repeated parameter is an AND, and commas, `OR` and `|` all return 0. That means one request per name per field (about 770), plus one per object to fetch it. It has no parameter for depicted places either.
  - The current data dumps (`data.rijksmuseum.nl/docs/data-dumps`, from 2024-11-07, signed Azure links) only hold places, sets, concepts, people and library records, no collection objects. Their places do link to Wikidata (about 8,000) and Getty TGN (about 12,600), but no place links back to its objects.
  - There is no SPARQL endpoint.
- **The dump used:** the EDM collection dump on the "historical data dumps" page, `202001-rma-edm-collection.zip` on the Rijksmuseum's GitHub releases. It is 153 MB zipped and 1.5 GB of Turtle in 14 files, with 667,890 objects (January 2020) and 26.4 million triples. The dataset description doesn't mention it. **Requests per run: 1** (the download, plus GitHub's redirect), and none while `dumps/` holds the zip.
- **Content (Europeana Data Model):**
  - Objects are `edm:ProvidedCHO` with `dc:title`, `dc:description`, `dc:identifier` (the object number, such as `RP-P-OB-79.638`), `dct:created` (free text such as "ca. 1700 - voor 1720"; about every object has one), and `dc:subject` (what it depicts: places, events, Iconclass, concepts, years as text). `dct:spatial` is where the object was made, `dct:temporal` the event it shows.
  - The image (`edm:isShownBy`, a Google-hosted link that still worked in October 2026) and its rights (mostly `publicdomain/mark/1.0`) sit on an `ore:Aggregation`.
  - Places, events (`edm:TimeSpan`), concepts and people come from the Rijksmuseum thesaurus (`hdl.handle.net/10934/RM0001.THESAU.*`, `PEOPLE.*`). They have only a `skos:prefLabel`, and 5,241 places also have `wgs84_pos:lat/long`. There are no links to Wikidata or TGN in this dump, so there is no `identifier` key.
  - Flood events are well covered: "Sint Elisabethsvloed", "Allerheiligenvloed (1570)", "Watersnood 1775", "Watersnoodramp 1953" and more.
- **Quirks of the dump:**
  - 78 IRIs aren't absolute (`<ttp://vocab.getty.edu/aat/...>`, `<%20http://...>`, `<Balmoral boots>`), and a Turtle parser stops on them. The step rewrites them to `urn:invalid-iri:<encoded>` before parsing.
  - `RM0001.PEOPLE.0` is a placeholder with some 28,800 names of unknown makers, and `RM0001.THESAU.53879` is another such placeholder. Followed naively, they put tens of thousands of labels into every object's description. Terms with more than 10 labels keep their type but not their labels.
  - Each file lists its aggregations first, then the thesaurus terms, then the objects, and terms recur in several files.
- **Filtering** (`lib/rijksmuseum-edm.ts`): Comunica can't load the dump, so the step makes two streaming passes over the zip (about 5 minutes each) and writes a subset to `dumps/rijksmuseum-edm-subset.nt`. That was 3,216 objects and 132,331 triples (19 MB) on 2026-10-25. An object is kept when:
  - its title or description has a name from the index or a drowning word; or
  - it refers to a selected term: a flood event or concept, an event or concept naming a village, or a place whose whole label has the spelling key of a name, with no coordinates or within 5 km of a village.

  People never count. The subset is rebuilt when the dump or the name index changes. The step fails when the filter keeps more than 20,000 objects, a sign that it has become too broad. An earlier version with near spellings kept 89,242 objects ("Napels" for Kapelle, "Holland" for Rilland, "Vlissingen" for Vinningen), which is too big to query in memory.
- **Matching:**
  - **`place-geo` / `place-name`**: a depicted or production place whose whole label (without a qualifier such as "(Schouwen)") has a name's spelling key. It is `place-geo` within 5 km, rejected (`location`) beyond 5 km, and `place-name` without coordinates. Labels are not searched for names inside them, because "Mare" (an alternative name of Meere) would match "Vietri sul Mare". Near spellings are not used.
  - **Present-day places**: a thesaurus place is nearly always the present-day place, so coordinates don't settle a homonym. Borssele lies 0.9 km from the drowned village Monster, and its objects are photos of the 1978 protests at the nuclear plant. Homonyms, `stem` names (such as "Sint-Philipsland" for Oud-Sint-Philipsland) and `alt` names in a place field need review.
  - **`text-context` / `text-name`**: a name in the title, description, event or concept. It is `text-context` when the object has a drowning word or refers to a flood event or concept.
  - **Generic**: the shared drowning words alone are too broad in this collection: "verdwenen schilderij", "in gedachten verzonken", Bible scenes with "verzwolgen", hats with a "verzonken bol". A generic object needs "verdronken land", "verdronken dorpen" and the like, or a drowning word together with a flood.
  - **Ties**: "Koudekerke" and "Coudekerke" share a spelling key but are different villages, so a label matching both is a tie. This exposed a bug in `locationGroup`, fixed in `lib/matching.ts`: a village id could equal the group key of another village's numbered locations. The backbone and Collectie Zeeland results don't change.
- **Result with the backup on 2026-10-25:**
  - 50 villages with candidates. **17 accepted links for 6 villages**: Saeftinghe 1 to 3 (prints of the siege of Hulst in 1645 whose descriptions mention the drowned land, and "Het wassende water"), Bakendorp (two prints of the church ruin, 1743), Welzinge (1786) and Bommenee ("Bommenede ingenomen door de Spanjaarden, 1575"). 13 of the 17 have an image.
  - **In review:**
    - 1,663 homonyms, mostly Oostende (682) and Namen (462) in titles, which are Ostend and Namur;
    - 202 weak keys (text names without context);
    - 13 alternative names;
    - 9 ties (Koudekerke and Coudekerke).
  - **Rejected:** 57 on location (Campen, the present-day Kampen; Monster in Zuid-Holland; and others).
  - **Generic:** 35 objects, such as prints of the floods of 1740, 1775 and 1809.
  - Luyken's "Reimerswaal in huidige en vroegere tijden" (`RP-P-1896-A-19368-1069`, one of the highlights on the source list) is in review as a homonym. Reimerswaal is also today's municipality, and its old spelling "geinundeert" isn't one of the drowning words. Accept it with an override.
- **Dating:** `created` (from `dct:created`, for every described object), `eventYears` (years in the labels of the events an object shows) and `yearsInTitle`, in `matches.json`. These are for the time check, which isn't applied yet.
- Output: `data/rijksmuseum/objects.ttl` (`queries/rijksmuseum-objects.rq`), `matches.json`, `matches.ttl` and `accepted.ttl` (`schema:subjectOf` from the village to the object, with the object, its aggregation and the labels of the terms it refers to).
- Notebook: `exploration/notebooks/rijksmuseum.sparqlbook`, on the subset.

### RCE: Cultuurhistorische Objecten

- Dataset: [`rce/cho`](https://linkeddata.cultureelerfgoed.nl/rce/cho) on the RCE's TriplyDB instance, described by `exploration/datasets/linked-data-rce.rdf` (from data.overheid.nl). Licence CC BY 4.0. It holds rijksmonumenten, complexen, archeologische terreinen and complexen, vondstlocaties with their vondsten, archeologische onderzoeksgebieden, gezichten and werelderfgoed, in the Cultureel Erfgoed Ontologie (`ceo:`, `https://linkeddata.cultureelerfgoed.nl/def/ceo#`). On 2026-10-25: 59.8 million triples in 35 graphs, updated daily.
- Access: the description only links to the website, so the step reads the dataset's metadata from the TriplyDB API (`https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/cho`) and downloads the dump from `.../datasets/rce/cho/download`: `cho.nt.gz`, 846 MB of gzipped N-Triples (about a minute), into `dumps/rce-cho.nt.gz`, reused unless `--refresh` is passed. There is also a Virtuoso SPARQL endpoint (`.../datasets/rce/cho/services/cho/sparql`), used only to explore the model; heavier exploratory queries time out (HTTP 504). The other distributions in the description are REST APIs for the High Value Datasets, which are subsets of this dump.
- **Requests per run:** 1 to `api.linkeddata.cultureelerfgoed.nl` with the dump in `dumps/` (the dataset metadata), 2 without it (plus the download), well within the budget. The SPARQL endpoint isn't used by the step.
- **Zeeland subset.** The whole dump can't be queried with Comunica (see "Large datasets and memory" in `AGENTS.md`), so the step filters it in streaming passes (`buildSubset` in `lib/rce-cho.ts`, about 4 minutes) into `dumps/rce-cho-zeeland.nt`, rebuilt when the dump is newer, with its statistics and record list in `rce-cho-zeeland.json`:
  - A record is in Zeeland when its `ceo:heeftBasisregistratieRelatie` has `ceo:heeftProvincie` `owms:Zeeland_(provincie)` (note the suffix; plain `owms:Zeeland` matches nothing), when its BAG relation's `ceo:woonplaatsnaam` is one of the 124 places in Zeeland (from the dataset's own place graph, `imx-geo:ligtInProvincie` `PV29`), or when its geometry has a point inside the bounding box of the backbone villages plus 0.1°. Archaeological sites (`ceo:ArcheologischTerrein`) have no province and no geometry of their own, so only the place name finds them.
  - Result: 15,929 records (4,812 rijksmonumenten, 5,054 onderzoeksgebieden, 5,736 vondstlocaties, 302 archeologische terreinen, 25 gezichten), and everything that describes them up to four links deep, plus the resources that point to them (descriptions, names, events and images) and the labels of the thesaurus terms used: 2.87 million triples, 615 MB. That is as much as Comunica can comfortably handle: parsing it into an N3 store takes 12 seconds and about 4 GB of memory.
- **Model**, as far as the step uses it:
  - Location: `ceo:heeftLocatieAanduiding/ceo:locatienaam` (often a present-day place or address, such as "Oud-Westdorpe / Axelsestraat"), `ceo:heeftGeometrie/geo:asWKT` (WGS84, longitude first; also `ceo:asWKT-RD` in RD New), and the present-day BAG place `ceo:heeftBasisregistratieRelatie/ceo:heeftBAGRelatie/ceo:woonplaatsnaam`.
  - Texts: names (`ceo:heeftNaam/ceo:naam`, rare) and descriptions (`ceo:Omschrijving` with `ceo:omschrijving`). Both point to the record with `ceo:heeftBetrekkingOp`.
  - Dating: events (`ceo:heeftGebeurtenisNaam`, also pointing to the record with `ceo:heeftBetrekkingOp`) with `ceo:heeftDatering/ceo:heeftBeginDatering|ceo:heeftEindDatering`, as a `ceo:datum` or a thesaurus period (`ceo:heeftPeriode`).
  - Finds: `ceo:bevatObject` from a find location or site, with types (`ceo:heeftType/ceo:heeftTypeNaam`) and materials.
  - Images: only rijksmonumenten have them (91,715 in the whole dataset), as `edm:ProvidedCHO` records that point to the monument with `edm:aggregatedCHO`. Each has a thumbnail (`foaf:depiction`, images.memorix.nl), the full image on Commons (`edm:isShownBy`), a title and a licence (`dc:rights`, mostly CC BY 4.0).
- Matching, in the step:
  - The texts query (`queries/rce-cho-texts.rq`) returns the record names, location names and location descriptions (structured place fields) and the descriptions (free text) that contain a name from the index or drowning words. The present-day BAG place is not searched, because it always names the place as it is now.
  - A name in a place field is `place-geo` when the record's geometry lies within 5 km of the backbone point (distance to the polygon, 0 inside it; `lib/geo.ts`), `place-name` without a geometry, and rejected (`location`) farther away. A name in a description is `text-context` with drowning words near it, else `text-name`, and is also rejected beyond 5 km. Homonyms need context near the name, even in a place field with coordinates: without that rule, dozens of farm buildings in present-day Borssele, Schore and Nieuwvliet were accepted for the drowned Monster, Schore and Oud-Nieuwvliet.
  - A shared name (Westkerke) is a tie, unless the geometry has already rejected the villages farther away.
  - An archaeological record that mentions drowning but names no village and lies within 1 km of a village point is a `location` candidate (review). Any other record about drowning without a name is generic.
- Result with the backup on 2026-10-25: 211 records accepted for 81 villages (292 candidates, because numbered locations share records), almost all archaeological (by candidate: 233 vondstlocaties, 30 onderzoeksgebieden, 26 archeologische terreinen), plus 3 rijksmonumenten that are about the drowned villages themselves (the site of Valkenisse, Coudorpe, Brijdorpe). The most records go to Saeftinghe (25), Tolsende (13), Oud-Rilland and Waterdunen (11). To review: 474 homonyms, 65 ties (including Koudekerke and Coudekerke, which share a spelling key) and 86 weak keys. 319 candidates are rejected on distance, and 62 records are generic. None of the accepted records has images, because those only exist for rijksmonumenten.
- Caveat: a site description often names neighbouring villages too ("Het betreft Oostkerke, dat verdronk in 1530 ... bij Monster"). With drowning words nearby, such a record is also accepted for the neighbour. Check these with the notebook, and reject them with an override.
- Output: `data/rce/records.ttl` (the full descriptions of all 925 records with a candidate, read from the store with `describeRecords`, since the equivalent CONSTRUCT is too heavy for Comunica), `matches.json` (the dataset and subset metadata, and per village the candidates with class, numbers, label, present-day place, image count and the start of the description), `matches.ttl` and `accepted.ttl`.
- Notebook: `exploration/notebooks/rce.sparqlbook` queries `records.ttl` and `matches.ttl`, not the subset. It covers the classes and statuses, the accepted records per village, their datings and finds, images, candidates to review, and generic records.
