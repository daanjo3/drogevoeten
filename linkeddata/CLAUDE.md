# Linked data (linkeddata/)

Hier worden de bronlagen van het prototype omgezet naar losse linked datasets volgens de NDE-richtlijnen.

**Lees vóór je iets toevoegt of wijzigt:**
1. [`DECISIONS.md`](DECISIONS.md): alle ontwerpbeslissingen met hun reden. Deze gelden voor elke dataset.
2. [`PLAN.md`](PLAN.md): de **algemene mappingregels** (R1–R22: welk soort bronveld je hoe modelleert) en per dataset de veldtabel, status en bekende problemen.
3. [`README.md`](README.md): hoe je het draait.

## Werkafspraken

- **Schema Engels, inhoud Nederlands.** Predicaten, recordsoorten, fragment-, veld- en datasetnamen zijn Engels. Namen, beschrijvingen en termwaarden uit de bron blijven Nederlands (`@nl`). Zie DECISIONS §4.
- **Een knoop per record alleen voor wat echt bij dat record hoort** (positie, coördinaten, nummer, foto, gebeurtenis). **Concepten worden gedeelde lokale knopen**, nooit losse tekst:
  - `terms.term()` voor waarden uit de bron;
  - `terms.own_term()` voor soorten die wij bedenken (Engelse slug);
  - `terms.place()` (met context) voor gebieden, wateren en woonplaatsen;
  - `m.position()` voor de locatie van een gebouwd object.

  `sameAs` alleen na menselijke review. Zie DECISIONS §7–9 en §22.
- **"Geen", "Nvt" en dergelijke blijven gewone waarden; samengestelde waarden worden niet systematisch gesplitst**, alleen via een expliciete splitstabel in de module voor duidelijke gevallen in een kleine codelijst (DECISIONS §27, teruggedraaid op verzoek van Jari: niet opnieuw invoeren). Maak termen en plaatsen altijd met `terms.link()`, `terms.link_place()`, `terms.terms()` of `terms.places()`.
- Geen persoonsgegevens van privépersonen (DECISIONS §23).
- **Verzin niets.** Een onbekende waarde geeft geen statement; een onleesbare waarde wordt gemeld in `report.json`.
- Python alleen standaardbibliotheek, altijd `python3 -I`. pyshacl en pyoxigraph alleen via `uv` in `make validate` en `make notebook`.
- Hergebruik helpers uit `prototype/datalayer/build_v3.py` via `lib/source.py`.
- **Notebookqueries** (`make_sparqlbook.py`): kies bij elke naam één taal (`FILTER(LANG(?naam) = "nl")`). Eigen termen en termensets hebben een naam in het Nederlands én het Engels (één knoop, twee namen), en zonder filter krijg je dubbele rijen. Volg de gedeelde knopen (bijv. `#location` → woonplaats → provincie), niet de adrestekst. De generator weigert een notebook met lege of dubbele resultaten.
- Upload niets naar Wikidata of het Datasetregister zonder akkoord van Jari.
- **Jari wil niet alles zelf verifiëren: neem aannames** in plaats van vragen te stellen, maar maak ze herkenbaar (status `aangenomen`/`afgewezen` met reden en datum) en leg ze vast in DECISIONS §28. Verzin nooit feiten: geen e-mailadressen, geen licenties, geen afgeleide gegevens zonder bron. Controleer een termkandidaat op `scopeNote`/`broader`: een exacte labeltreffer kan een homoniem zijn.
- Een nieuwe beslissing of een afwijking van het plan: leg die vast in `DECISIONS.md` (met datum) en werk `PLAN.md` bij.

## Een dataset toevoegen

1. Controleer de licentie van de bronlaag in het NGR (`https://nationaalgeoregister.nl/geonetwork/srv/api/records/<uuid>`) en zet die in de tabel in DECISIONS §14.
2. Controleer de sleutel: uniek en stabiel? (Zie de waarschuwingen in `PLAN.md`.)
3. Maak in `PLAN.md` de **veldtabel**: elk bronveld krijgt een regel (R1–R22), of komt onder "Niet overnemen" met een reden. Past een veld bij geen enkele regel, dan is het een nieuwe beslissing: leg die vast in DECISIONS.md en voeg een regel toe aan de algemene mappingregels.
4. Maak `datasets/<engelse_naam>.py` naar het voorbeeld van `pumping_stations.py`: `META`, `FIELDS` en `convert()`. Zet hem in `DATASETS` in `build.py`.
5. Nieuwe predicaten alleen als schema.org niets heeft: eerst in `vocab/droge-voeten.ttl` en DECISIONS §19.
6. `make` → `make terms` → `make validate` (nul onverwachte overtredingen). Vergelijk drie records met de bron-URL.
7. Werk de status en de veldtabel bij in `PLAN.md`, en de datasettabel in `README.md`.
