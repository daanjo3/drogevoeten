# Droge Voeten als linked data

Deze map zet de bronlagen die het prototype oogst (molens, gemalen, polders, dijken, ...) om naar losse linked datasets. Elke laag wordt een eigen dataset met een eigen datasetbeschrijving, zo veel mogelijk volgens de NDE-richtlijnen:
- het NDE-Schema.org-toepassingsprofiel;
- de Requirements for Datasets;
- de visie "Van data naar dienst".

Uitgever en maker: **Team De Band (HackaLOD 2026)**. Links tussen de datasets volgen later (fase 2).

| Document | Waarover |
|---|---|
| [`DECISIONS.md`](DECISIONS.md) | **Alle ontwerpbeslissingen en waarom**: URI's, taal, klassen, concepten zonder externe definitie, datums, herkomst, licenties, validatie |
| [`PLAN.md`](PLAN.md) | Status en mapping per dataset, bekende sleutelproblemen, fase 2 |
| [`CLAUDE.md`](CLAUDE.md) | Werkafspraken en de stappen om een dataset toe te voegen |

## Draaien

```bash
cd prototype && make restore SNAPSHOT=<bestand.tar.zst>   # of: make harvest (de invoer staat in prototype/data/raw/)
cd ../linkeddata
make                      # build/: datasets, catalogus, rapport (offline, seconden)
make terms                # review-tabellen terms/*.csv aanvullen met voorstellen uit het Termennetwerk (netwerk)
make terms ARGS=--offline # alleen ontbrekende rijen toevoegen, zonder voorstellen
make validate             # SHACL-controle tegen de NDE-shapes (pyshacl via uv)
make notebook             # alle .sparqlbook-notebooks opnieuw maken, elke query getest (pyoxigraph via uv)
make assume               # termvoorstellen beoordelen met domeinregels (netwerk; DECISIONS §28)
make check                # steekproef: 3 records per dataset live vergelijken met de bron (netwerk)
```

Vereisten: Python 3 (alleen standaardbibliotheek, altijd `python3 -I`). Voor `validate` en `notebook` ook [uv](https://docs.astral.sh/uv/); voor `validate` ook `curl`.

## Wat er in `build/` komt

| Bestand | Inhoud |
|---|---|
| `<dataset>.ttl`, `<dataset>.nt` | De datasetbeschrijving, alle records en de termen en plaatsen die ze gebruiken (Turtle en N-Triples, dezelfde inhoud) |
| `catalog.ttl`, `catalog.jsonld` | `schema:DataCatalog` met alle datasetbeschrijvingen en hun downloads (relatieve IRI's naar de bestanden ernaast). Dit bestand gaat naar het NDE Datasetregister |
| `report.json` | Per dataset: bronobjecten tegenover records, wat is overgeslagen of aangepast en waarom, de zelfcontrole, en per veld de reviewstatus van termen en plaatsen |
| `term-values.json` | Alle bronwaarden per veld (invoer voor `terms_lookup.py`) |
| `validation.txt` | Uitkomst van `make validate` |

Voorbeeldqueries voor de VS Code-extensie *SPARQL Notebook* (Zazuko), op de bestanden in `build/`:

| Notebook | Datasets |
|---|---|
| `pumping-stations.sparqlbook` | gemalen |
| `windmills.sparqlbook` | molens en verdwenen molens (gedeelde termensets, gedeelde Ten Bruggencate-nummers) |
| `drained-lakes.sparqlbook` | droogmakerijen en hun maalinrichtingen (met de gemalen via het gem_id) |
| `land-consolidation.sparqlbook` | landinrichting |
| `breach-pools.sparqlbook` | wielen |
| `zeeland.sparqlbook` | dijken, polders, geschenkwoningen, verdronken dorpen en Deltawerken (via de gedeelde gemeenten) |
| `water-boards.sparqlbook` | IMWA-gemalen, -sluizen en -stuwen (en de historische gemalen via de gedeelde objectsoort) |
| `shared-concepts.sparqlbook` | wat het samenvoegen oplevert: gedeelde termen, woonplaatsen, polders en droogmakerijen over de datasets heen |
| `timeline.sparqlbook` | de tijdlijn per adres: indijking of droogmaking, gemalen en dijken in de buurt |

**Tijdlijn per adres:** `queries/timeline-polder.rq`, `timeline-gemalen.rq` en `timeline-dijken.rq` geven de indijking of droogmaking van de polder waarin een adres ligt, de stichting van de gemalen in de buurt (ca. 3 km) en de aanleg van de dijken in de buurt (ca. 250 m, alleen Zeeland). Vervang de `VALUES`-regel door de coördinaten van het adres. Elke query draait op een paar kleine datasets, in minder dan een tiende seconde (DECISIONS §30).

`make notebook` maakt ze opnieuw en test elke query; de queries staan in `make_sparqlbook.py` (gemalen) en `notebook_cells.py` (de rest).

## Datasets

Stand op 31-10-2026. Alle datasets komen uit de oogst van het prototype van 28-10-2026; details per dataset staan in [`PLAN.md`](PLAN.md).

| Dataset | Bron | Records | Licentie |
|---|---|---|---|
| `pumping-stations` (gemalen) | RCE Landschapsatlas, Nederlandse Gemalen Stichting | 2.663 | CC0 |
| `windmills` (molens) | RCE Landschapsatlas | 1.872 | CC0 |
| `lost-windmills` (verdwenen molens) | RCE Landschapsatlas, molendatabase.org | 17.119 | CC0 |
| `drained-lakes` (droogmakerijen en hun maalinrichtingen) | RCE Landschapsatlas | 245 + 561 | CC0 |
| `land-consolidation` (landinrichting 1924-2015) | RCE Landschapsatlas | 604 | CC0 |
| `breach-pools` (wielen) | RCE Landschapsatlas | 1.266 | CC0 |
| `zeeland-dikes` (dijken, dammen, wallen) | Provincie Zeeland | 2.486 | CC0 |
| `zeeland-polders` (polders per bedijkingsperiode) | Provincie Zeeland | 560 | CC0 |
| `gift-houses-1953` (geschenkwoningen) | Provincie Zeeland | 538 | CC0 |
| `drowned-villages` (verdronken dorpen) | Provincie Zeeland | 201 | CC0 |
| `delta-works` (Deltawerken) | Provincie Zeeland | 9 | CC0 |
| `water-board-pumping-stations`, `water-board-locks`, `water-board-weirs` | Het Waterschapshuis, IMWA (PDOK) | 8.565 + 890 + 53.137 | CC BY-SA 4.0 |

Niet gebouwd: de Zeeuwse **poldernamen**, omdat er geen licentie te vinden is.

**Alles samen:**

| Dataset | Inhoud | Licentie |
|---|---|---|
| `droge-voeten` | alle datasets in één bestand (`build/droge-voeten.ttl`, `.nt`) | CC BY-SA 4.0 (bevat IMWA) |
| `concept-merges` | welke termen en plaatsen uit verschillende datasets tot één knoop zijn samengevoegd (`dct:replaces`), en volgens welke regel | CC0 |

Termen, woonplaatsen en gebieden die in meer dan één dataset voorkomen, zijn één knoop, ook in de losse datasets. Voorbeelden:
- "poldermolen" als molenfunctie en als soort maalinrichting;
- Meppel bij de molens en bij de gemalen;
- de Onrustpolder bij een dijk is het polderrecord;
- het bemalingsgebied "De Beemster" is de droogmakerij.

De regels staan in DECISIONS §29.

## Review van termen en plaatsen

Elke bronwaarde die een concept is (een functie, een aandrijving, een bemalingsgebied, een water) wordt één gedeelde knoop met een Nederlandse naam. Een koppeling (`sameAs`) naar de Cultuurhistorische Thesaurus, AAT, Wikidata of GeoNames komt er pas in na een menselijke review in `terms/<veld>.csv`: zet `status` op `gecontroleerd` of `weglaten`. Zie DECISIONS §8–9 en §27.

Stand op 31-10-2026: beoordeeld door Claude als aanname (status `aangenomen`/`afgewezen`, met reden; DECISIONS §28).
- Gekoppeld:
  - de 12 provincies → Wikidata + GeoNames;
  - "gemaal", "poldergemaal" en "boezemgemaal" → de Cultuurhistorische Thesaurus.
- Afgewezen: de overige termen (de kandidaat betekende iets anders, of er was geen passende term).
- Woonplaatsen, bemalingsgebieden en wateren: bewust niet gekoppeld in fase 1.

Wie wil, kan een aanname controleren en de status op `gecontroleerd` zetten.

## Validatie

Stand op 31-10-2026: de records geven geen meldingen. De catalogus geeft alleen Info-tips en één waarschuwing: het contactpunt (naam + e-mail) ontbreekt. Vul `TEAM["contact_email"]` in `config.py` in. De `https://`-meldingen van het register zijn verwacht zolang de IRI's URN's zijn (DECISIONS §20).
