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
make notebook             # pumping-stations.sparqlbook opnieuw maken, elke query getest (pyoxigraph via uv)
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

`pumping-stations.sparqlbook` bevat voorbeeldqueries op `build/pumping-stations.ttl`, voor de VS Code-extensie *SPARQL Notebook* (Zazuko).

## Datasets

| Dataset | Bron | Records | Licentie | Status |
|---|---|---|---|---|
| `pumping-stations` (gemalen) | RCE Landschapsatlas "Gemalen" (Nederlandse Gemalen Stichting) | 2.663 / 2.663 | CC0 | klaar (pilot); SHACL zonder overtredingen; termen beoordeeld als aanname |

De andere tien lagen en hun mapping staan in [`PLAN.md`](PLAN.md).

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
