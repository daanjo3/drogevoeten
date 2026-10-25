# AGENTS.md

Guidance for AI agents (and humans) working in this repository.

## Project

A Linked Data Minecraft experience about the drowned villages ("verdronken dorpen") of Zeeland. The backbone is the Kaart Verdronken Dorpen Zeeland (Provincie Zeeland, WFS layer `chs:geocmd_vrddrppnt`). All other sources are linked to the villages in that dataset.

## Exploratory tasks

Before exploring, fetching or querying a data source, **read [`docs/exploration-sop.md`](docs/exploration-sop.md)** and follow it. It describes the procedure per source, the script layout, matching strategies and known source quirks. Record any new findings about a source in the SOP's source notes, and update the SOP when the procedure changes.

## Project-wide requirements

### Data formats

1. **RDF first.** Linked data is the core of the project. Prefer RDF sources and outputs. Use Turtle (`.ttl`) as the default serialization.
2. **JSON second.** When a source isn't available as RDF (for example WFS geodata or a REST API), store at least a JSON (or GeoJSON) output. Converting it to RDF is a separate, later step.
3. Other formats (CSV, XML, HTML scraping) are a last resort. Document why they were needed.

### Querying

- Use **SPARQL** wherever possible, also for filtering and transforming RDF that is already local.
- Run all SPARQL through **[Comunica](https://comunica.dev/docs/query/getting_started/query_app/)**:
  - `@comunica/query-sparql` for remote endpoints, with `type: 'sparql'` set explicitly in the source.
  - `@comunica/query-sparql-file` for local dumps in `dumps/`.
- Consume result streams with `.toArray()` unless the result set is large.
- **Query each source as few times as possible.** Batch the villages with `VALUES` instead of running one query per village.
- For small datasets, download a dump into `dumps/` once and query it locally instead of querying the remote service repeatedly.

### Workspace

- The repository is a **pnpm workspace** (`pnpm-workspace.yaml`). Use `pnpm`, not npm or yarn, and run `pnpm install` from the repository root.
- Each part of the project is its own workspace package with its own `package.json`. Add a dependency to the package that uses it (`pnpm --filter <package> add <dep>`), not to the root.
- Exploration and data-fetching code lives in `exploration/` (`@verdronkendorpen/exploration`).

### TypeScript and Node

- Write **TypeScript**, and require **Node 26 or later** (`.nvmrc` at the root, `engines` in `package.json`).
- Node runs `.ts` files directly by stripping the types, with no build step. That means **erasable syntax only**: no `enum`, `namespace` or constructor parameter properties. Import local files with their `.ts` extension, and import types with `import type`.
- `tsc` only type-checks (`noEmit`). Run `pnpm --filter <package> run typecheck` and keep it passing.

### Formatting and linting

- **[Biome](https://biomejs.dev)** formats, lints and organizes imports for all `.ts`, `.js`, `.mjs` and `.json` files in the workspace. It's configured once at the root in `biome.json` and respects `.gitignore`.
- Run `pnpm check` to verify and `pnpm check:fix` to apply safe fixes. Both run from the repository root. Keep `pnpm check` passing.
- Don't add Prettier or ESLint, or per-package formatter configs.

### Scripts and reproducibility

- **One source per step.** Each step is a script `exploration/scripts/<source>.ts`, named after its source and its `data/<source>/` directory, without a number. The backbone step (`backbone.ts`) runs first and is the only one every step depends on; it is also the only one that combines two sources (the WFS layer and the Wikipedia list).
- **The run order lives in `exploration/scripts/main.ts`** (`STEPS`), which `fetch:all` runs. Steps don't depend on each other: a step may use another step's output when it exists, but must still work, with a warning, without it.
- **Matching** a source to the villages follows the SOP's "Matching villages", with the shared helpers in `exploration/scripts/lib/matching.ts`. Every step writes its candidates to `matches.ttl` and its accepted matches to `accepted.ttl`, which together with the backbone make up `data/combined.ttl`. Manual review decisions go in `exploration/resources/match-overrides.json`.
- **Vocabulary.** Every custom (`vd:`) term is defined in `vocab/vd.ttl`. Define a new term there before using it: the scripts refuse to write RDF with undefined `vd:` terms.
- Keep SPARQL queries in separate `.rq` files under `exploration/queries/`.
- `data/` (results) and `dumps/` (raw downloads) live at the repository root and are not committed. Scripts resolve them relative to the repository root. Running `fetch:all` must fully recreate them.
- Scripts must fail loudly on error responses (such as an `ows:ExceptionReport` or an HTTP error) and never write them out as data.
- **Configuration** goes through environment variables, validated with [`env-schema`](https://github.com/fastify/env-schema) in `exploration/scripts/lib/config.ts`. They can also be set in `exploration/.env` (gitignored; see `.env.example`). Add new options to the schema with a default, so the scripts work without any configuration.

### Large datasets and memory

Lessons from the RCE dump (60 million triples, 850 MB gzipped N-Triples). Follow them for any source with more than about a million triples:

- **Comunica's file source loads the whole file into memory.** About 3 million triples already take roughly 4 GB of memory and 12 to 20 seconds to parse. A full dump of tens of millions of triples can't be queried this way at all.
- **Stream large dumps, don't load them.** Download with `downloadFile` (`lib/http.ts`), which streams to disk via a `.part` file, never with `fetchText`, which buffers the whole response. Read dumps line by line with `forEachTriple` (`lib/ntriples.ts`) and filter them to the part that's relevant to the villages. Cache that subset in `dumps/` and rebuild it only when the dump is newer (see `lib/rce-cho.ts`).
- **Parse a subset once.** With a file source, every Comunica query parses the file again. Load the subset once into an N3 `Store` and pass the store as the query source (`sources: [store]`).
- **Avoid heavy SPARQL over a large store.** A CONSTRUCT with nested UNIONs and OPTIONALs over a thousand records and millions of triples ran Node out of heap, even with an 8 GB limit: the process aborts with `FATAL ERROR: ... JavaScript heap out of memory` and exit code 134. Keep queries over large stores simple, such as one pattern with a `VALUES` filter, and collect related resources by walking the store with `store.getQuads()` instead (`describeRecords` in `lib/rce-cho.ts`).
- **Give heavy steps more heap.** Node's default heap limit is about 4 GB. Set `--max-old-space-size` both in the step's package script and in its `nodeOptions` in `STEPS` (`main.ts`), because `main.ts` starts every step in its own process.
- **Recognize out-of-memory crashes.** Exit code 134 (abort) with `JavaScript heap out of memory` at the end of stderr means V8 ran out of heap. Exit code 137 without a message would mean the operating system's out-of-memory killer. Log before every heavy stage (loading, each query, describing), so the last line in the log shows where a process stopped. Check the exit code: `main.ts` reports a failing step and stops. When testing, run heavy steps in the foreground with `timeout` and capture stderr, and wait for the process to end before reading its log. A crash message comes last and is easy to miss while the process is still running.
- **Keep notebooks small.** A SPARQL Notebook cell also loads its endpoint files into memory, so point notebooks for large sources at the step's output (the found records), not at the dump or the subset.

### Verification

- Verify claims about libraries, endpoints and public APIs against current documentation or a test request before relying on them.
- Respect the usage policies of public services. For example, Wikimedia asks for a descriptive `User-Agent` header on automated requests.
- In a sandbox where network traffic goes through an HTTP proxy, set `NODE_USE_ENV_PROXY=1` when running scripts. Node's `fetch` ignores `HTTPS_PROXY` otherwise.

### Git

- Don't run git commands that modify the repository (`add`, `commit`, `rebase`, ...) unless explicitly asked to.
