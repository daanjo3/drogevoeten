# AGENTS.md

Guidance for AI agents (and humans) working in this repository.

## Project

A Linked Data Minecraft experience about the drowned villages ("verdronken dorpen") of Zeeland. The backbone is the Kaart Verdronken Dorpen Zeeland (Provincie Zeeland, WFS layer `chs:geocmd_vrddrppnt`). All other sources are linked to the villages in that dataset.

## Exploratory tasks

Before exploring, fetching or querying a data source, **read [`docs/exploration-sop.md`](docs/exploration-sop.md)** and follow it. It describes the procedure per source, the script layout, matching strategies and known source quirks. Record any new findings about a source in `docs/sources.md`, and update the SOP when the procedure changes.

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

- **One source per script.** Scripts live in `exploration/scripts/`, are numbered (`NN-<source>.ts`) and run sequentially. A later script may read the outputs of earlier ones.
- Keep SPARQL queries in separate `.rq` files under `exploration/queries/`.
- `data/` (results) and `dumps/` (raw downloads) live at the repository root and are not committed. Scripts resolve them relative to the repository root. Running the scripts in order must fully recreate them.
- Scripts must fail loudly on error responses (such as an `ows:ExceptionReport` or an HTTP error) and never write them out as data.
- **Configuration** goes through environment variables, validated with [`env-schema`](https://github.com/fastify/env-schema) in `exploration/scripts/lib/config.ts`. They can also be set in `exploration/.env` (gitignored; see `.env.example`). Add new options to the schema with a default, so the scripts work without any configuration.

### Verification

- Verify claims about libraries, endpoints and public APIs against current documentation or a test request before relying on them.
- Respect the usage policies of public services. For example, Wikimedia asks for a descriptive `User-Agent` header on automated requests.
- In a sandbox where network traffic goes through an HTTP proxy, set `NODE_USE_ENV_PROXY=1` when running scripts. Node's `fetch` ignores `HTTPS_PROXY` otherwise.

### Git

- Don't run git commands that modify the repository (`add`, `commit`, `rebase`, ...) unless explicitly asked to.
