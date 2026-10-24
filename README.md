# Verdronken dorpen

Linked Data Minecraft experience about the drowned villages of Zeeland.

## Dataset exploration

For now the repository contains the exploration of datasets about the drowned villages, in [`exploration/`](exploration/). Scripts fetch the villages from the Provincie Zeeland map, then look them up in other sources (so far Wikidata and the Collectie Zeeland museum objects). The results are written to `data/` as RDF (Turtle) and JSON, with downloaded dumps in `dumps/`. Neither folder is committed: the scripts recreate both.

### Requirements

- Node.js 26 or later (`nvm use` picks up `.nvmrc`)
- [pnpm](https://pnpm.io)

### Fetching the data

```sh
pnpm install
pnpm --filter @verdronkendorpen/exploration run fetch:all
```

The village map's WFS service is sometimes unavailable. In that case, use the committed backup of the villages instead:

```sh
BACKBONE_SOURCE=backup pnpm --filter @verdronkendorpen/exploration run fetch:all
```

You can also set this in `exploration/.env` (see [`exploration/.env.example`](exploration/.env.example)).

### Inspecting the results

The SPARQL notebooks in [`exploration/notebooks/`](exploration/notebooks/) query the fetched data and dumps directly. Open them in VS Code with the [SPARQL Notebook](https://marketplace.visualstudio.com/items?itemName=Zazuko.sparql-notebook) extension:

- `wikidata-matches.sparqlbook`: which drowned villages have a good Wikidata match, which are still open, and what the matches add (articles, images, dates).
- `zeeuws-erfgoedplatform.sparqlbook`: the structure of the Collectie Zeeland museum objects dataset: places, types, dates, images and licences.

Run `fetch:all` first, because the notebooks read the files in `data/` and `dumps/`.

### More information

- [`docs/exploration-sop.md`](docs/exploration-sop.md): how sources are explored, and what we know about each source so far.
- [`AGENTS.md`](AGENTS.md): project conventions (RDF first, SPARQL through Comunica, TypeScript, Biome).
