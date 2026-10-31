# Ontwerpbeslissingen: bronlagen als linked data

Dit bestand legt vast **wat** we besloten hebben en **waarom**, zodat elke volgende omzetting dezelfde keuzes maakt. Het praktische recept (welk soort bronveld je hoe modelleert) staat in [`PLAN.md`](PLAN.md), "Algemene mappingregels". Wijzig je een beslissing, pas dan dit bestand aan (met datum) en de code die erbij hoort. Het plan per dataset staat in [`PLAN.md`](PLAN.md); werkafspraken voor wie code schrijft in [`CLAUDE.md`](CLAUDE.md).

Normen waarop alles rust:
- **SCHEMA-AP-NDE** v1.7.0, het NDE-Schema.org-toepassingsprofiel (<https://docs.nde.nl/schema-profile/>), voor de records.
- **NDE Requirements for Datasets** v1.16.0 (<https://docs.nde.nl/requirements-datasets/>), voor de datasetbeschrijvingen. **v2.0** (vanaf 3 mei 2027) is de norm.
- **"Van data naar dienst"**, de visie van het NDE (Meijers, v1.0, nov. 2025, doi 10.5281/zenodo.17541400). Daaruit gebruiken we:
  - wie omzet of verrijkt, wordt bronhouder van nieuwe informatie en publiceert die als eigen dataset met herkomst (PROV-O);
  - koppelen aan termen (via het Termennetwerk) is verrijking (stap 5);
  - normaliseren hoort bij stap 3.

---

## 1. Aanpak en scope (30-10-2026)

- **Fase 1:** elke bronlaag apart omzetten naar een eigen linked dataset met een eigen datasetbeschrijving. **Fase 2:** links tussen de datasets, als **aparte linkset-datasets** met methode en herkomst. *Waarom:* de visie wil verrijkingen als losse, herleidbare datasets; zo blijft elke omzetting een getrouwe weergave van één bron.
- In fase 1 komen alleen koppelingen **binnen** één bron, bijv. molen ↔ droogmakerij via `polderID` in dezelfde RCE-laag.
- De invoer is de oogst van het prototype (`prototype/data/raw/`). `linkeddata/` oogst niet zelf. *Waarom:* één oogst en één set parseerregels.

## 2. Uitgever, maker en bronhouders (30-10-2026)

- Uitgever (`schema:publisher`) en maker (`schema:creator`) van elke dataset: **"Team De Band (HackaLOD 2026)"**@nl, IRI `urn:drogevoeten:org:team-de-band`.
- Bronhouders worden aangeduid met hun **Wikidata-entiteit-IRI** (requirements §5.3.1: de IRI moet de organisatie zelf aanduiden):
  - RCE: `wd:Q1766396`;
  - Provincie Zeeland: `wd:Q705`;
  - Nederlandse Gemalen Stichting: `wd:Q27188363`.

  De lijst staat in `config.ORGS`.
- **Open:** `contactPoint` (naam + e-mail) wordt verplicht in v2.0. Vul `TEAM["contact_email"]` in `config.py` in (liefst een teamadres).

## 3. URI's (30-10-2026)

- Voorlopig **lokale bestanden, dus URN's**. Alles hangt aan `BASE = "urn:drogevoeten:"` in `config.py`; bij hosting wordt dat een HTTPS-basis (bijv. `https://w3id.org/drogevoeten/`). Verder verandert er dan niets.
- Patronen:

| Wat | Patroon | Voorbeeld |
|---|---|---|
| Record | `id:<soort>:<bronsleutel>` | `id:pumping-station:369` |
| Deel van een record | `<record>#<deel>`, genest `<record>#<deel>-<subdeel>` | `…:369#location`, `…:369#location-geo` |
| Gebeurtenis van een record | `<record>#<gebeurtenissoort>` | `…:lost-windmill:1053#disappearance` |
| Meerdere delen van dezelfde soort | `<record>#<deel>-<n>` (vanaf 1) | `…#image-2` |
| Term | `term:<veld>:<waarde>` | `term:drive-type:stoom` |
| Termenset | `termset:<veld>` | `termset:drive-type` |
| Gedeelde plaats | `place:<veld>:<context>:<waarde>` | `place:drained-area:friesland:friese-boezem`, `place:locality:friesland:lemmer` |
| Gedeelde plaats uit een gesloten set | `place:<veld>:<waarde>` | `place:province:friesland`, `place:municipality:veere`, `place:country:zweden` |
| Gedeelde organisatie | `org:<veld>:<waarde>` | `org:water-board:wetterskip-fryslan` |
| Dataset | `dataset:<slug>` | `dataset:pumping-stations` |
| Catalogus / team / omzetting | `catalog`, `org:<naam>`, `activity:<slug>-<datum>` | `activity:pumping-stations-2026-10-30` |
| Eigen vocabulaire | `def:<predicaat>` (prefix `dv:`) | `dv:drainsArea` |

- **Geen blank nodes.** Elke knoop heeft een IRI (profiel: `CreativeWork` mag geen blank node zijn; zo blijft alles ook te linken).
- **Hooguit één `#` per IRI.** Een deel van een deel krijgt `-` (`#location-geo`). `lib/model.part()` regelt dat.
- De **bronsleutel** komt uit een stabiel bronveld. Het script stopt bij een dubbele sleutel. Is er geen stabiel veld, gebruik dan de beste kandidaat en meld dat in `PLAN.md` ("instabiel").
- Een slug is de genormaliseerde tekst: kleine letters, zonder accenten, spaties worden `-` (`lib.terms.slug`).

## 4. Taal: schema Engels, inhoud Nederlands (30-10-2026)

- **Engels:** alles wat wij als schema of structuur bedenken. Dat zijn predicaten (`dv:drainsArea`), recordsoorten (`pumping-station`), fragmentnamen (`#location`), veld- en termensetnamen (`drive-type`), dataset-slugs (`pumping-stations`), module- en bestandsnamen.
- **Termen die wíj bedenken** (de soorten in `object-type` en `event-type`) zijn schema: Engelse slug (`term:object-type:pumping-station`) en een naam in het Nederlands én het Engels ("gemaal"@nl, "pumping station"@en). Ze worden gemaakt met `terms.own_term()`. Termwaarden uit de bron houden hun Nederlandse slug (`term:drive-type:stoom`).
- **Nederlands, niet vertalen:** de inhoud uit de bron. Dat zijn namen, beschrijvingen, termwaarden (ook als slug in een IRI: `term:drive-type:stoom`) en `propertyID`'s die bestaande nummerreeksen noemen ("rijksmonumentnummer").
- Elke tekst heeft een taaltag (profiel: verplicht, ook bij één taal). Inhoud is `@nl`.
- Het vocabulaire (`vocab/droge-voeten.ttl`) en de namen van de termensets: Engels (`@en`), met Nederlands (`@nl`) erbij.
- Mensgerichte hulpmiddelen blijven Nederlands: de kolommen en statussen van `terms/*.csv`, de sleutels in `report.json` en de documentatie. *Waarom:* de repo-regel "documentatie Nederlands, code Engels"; de reviewers zijn Nederlandstalig.

## 5. Klassen (30-10-2026)

- **Gebouwde objecten** (molen, gemaal, dijk, woning, Deltawerk, kunstwerk) → `schema:CreativeWork`. *Waarom:* het profiel gebruikt `CreativeWork` voor alle erfgoedobjecten en noemt een brug expliciet "a less natural fit, still CreativeWork". Fijner type via `additionalType` (zie §8).
- **Gebieden** (polder, droogmakerij, wiel, verdronken dorp, ruilverkavelingsgebied) → `schema:Place`.
- Elk record krijgt `additionalType` → onze eigen term `object-type:<soort>` (Engelse slug, bijv. `object-type:pumping-station` "gemaal"@nl), plus de fijnere classificatie uit de bron in een eigen termenset (functie, type). Een veld `type` uit de bron gaat dus **niet** in `object-type`, maar in een bronset als `breach-pool-type` (§22).

## 6. Verplichte delen van elk record (30-10-2026)

`schema:name`@nl, `schema:isPartOf` → de dataset, `schema:sdDatePublished` (de bouwdatum, `xsd:date`) en `prov:wasDerivedFrom` → het bronobject. `build.py` controleert dit zelf en stopt als het ontbreekt.

## 7. Locatie en geometrie (30-10-2026, herzien 31-10-2026)

- Waar een gebouwd object staat: **`schema:locationCreated`**. *Waarom niet `contentLocation`:* in schema.org betekent dat "de plek die het werk afbeeldt". Dit wijkt af van het eerste plan.
- De locatie bestaat uit twee lagen (`lib/model.position()`, voor elke dataset):
  1. **De eigen positie van het object**: `#location`, een `Place` per record met de naam "Locatie van <naam>", `GeoCoordinates` en een `PostalAddress` (plaats, provincie, `addressCountry "NL"`; een adres is in schema.org gewoon tekst). Per record, omdat alleen dit object op deze plek staat.
  2. **De woonplaats en de provincie**: gedeelde plaatsen (§8). `#location` `schema:containedInPlace` → `place:locality:<provincie>:<naam>` `schema:containedInPlace` → `place:province:<naam>`. Zonder woonplaats wijst `#location` direct naar de provincie.
- *Waarom herzien:* eerst heette `#location` "Lemmer" en stonden woonplaats en provincie alleen als tekst in het adres. Dan zijn het geen gedeelde concepten, en de knoop beweerde Lemmer te zijn, terwijl hij een punt in Lemmer is.
- `containedInPlace` van woonplaats naar provincie mag: de bron noemt beide bij het object, en een woonplaats ligt in één provincie. Bij gebieden en wateren doen we dat niet (§8.5).
- Punten: `schema:geo` → `GeoCoordinates` (WGS84, `xsd:decimal`). Vlakken en lijnen daarnaast als GeoSPARQL `geo:hasGeometry/geo:asWKT` (profiel §3.2, "combined"-methode).
- Een `Place` moet een naam hebben (profiel §4.5).

## 8. Concepten zonder externe definitie: gedeelde lokale knopen (31-10-2026)

**Het probleem:** veel bronwaarden zijn concepten (een functie, een aandrijving, een bemalingsgebied, een water), maar staan nergens als term of object gedefinieerd.

**Wat het NDE zegt** (profiel §3.6, "Reference terms"):
- Een verwijzing naar een concept is een **knoop met een naam**, geen losse tekst. Bij `additionalType` en `material` is dat zelfs een `DefinedTerm`.
- Die knoop "may carry its own @id (a dataset-local IRI)".
- "If known, the term's public URI from a controlled vocabulary MUST be provided via sameAs." Afnemers vergelijken `sameAs`, niet de lokale IRI.
- Bij `Place`, `Person` en `Organization` is `sameAs` "required if a term is available". Zonder bekende term is een lokale knoop dus toegestaan.

**Besluit:**
0. **Hoofdregel: een knoop per record alleen voor wat echt bij dat ene record hoort** (de eigen positie `#location`, de coördinaten, een identificatienummer, een foto). **Alles wat ook bij andere records kan voorkomen, wordt een gedeelde knoop.**
1. Elke bronwaarde die een concept is, wordt een **gedeelde lokale knoop op datasetniveau**: één knoop per waarde, waar alle records naar wijzen. **Nooit een knoop per record** voor een concept. *Waarom:* alleen dan is "hetzelfde gebied" zichtbaar en kan één review alle records tegelijk koppelen. De eerste versie maakte per gemaal een `#drained-area`-knoop; dat is teruggedraaid.
2. Het **soort knoop** volgt wat het concept is:
   - termen (soort, functie, type, status, aandrijving, materiaal) → `DefinedTerm` (met co-type `URL` bij `additionalType`/`material`), in een `DefinedTermSet` per veld, via `terms.term(g, veld, waarde)`;
   - gebieden, wateren en woonplaatsen → `Place`, via `terms.place(g, veld, waarde, context)`;
   - gesloten sets met unieke namen (provincies) → `Place` zonder context, via `terms.place(g, veld, waarde, scoped=False)`;
   - personen en organisaties (later, bijv. een ontwerper) → `Person`/`Organization`, op dezelfde manier.
3. **Geen losse tekst voor concepten.** Tekst alleen voor wat echt tekst is: een beschrijving, een opmerking, een letterlijke jaartekst.
4. **Context in de sleutel bij plaatsen.** Dezelfde naam is niet altijd hetzelfde gebied ("Polder Oost"), daarom komt de provincie van het record in de sleutel: `place:drained-area:friesland:friese-boezem`. Zonder provincie wordt de context `no-context`. *Waarom:* te weinig samenvoegen is te herstellen (in de review, via `sameAs`); ten onrechte samenvoegen is een stille fout. Gevolg: het IJsselmeer bestaat voorlopig per provincie als aparte knoop.
5. Er komt geen bewering die de bron niet doet. Een gedeelde plaats krijgt bijvoorbeeld geen `containedInPlace` → provincie: het gemaal ligt in die provincie, maar het gebied kan groter zijn.
6. **`sameAs` alleen na menselijke review** (§9). Koppelen aan échte objecten (een IMWA-afvoergebied, een polder uit een andere dataset) is fase 2, als linkset.

## 9. Termen en plaatsen reviewen (30-10-2026, aangevuld 31-10-2026)

- Per veld één tabel `terms/<veld>.csv` met de kolommen: `brontekst, context, label_nl, cht, aat, wikidata, geonames, status, opmerking`. De sleutel is `context|brontekst`, genormaliseerd: hoofdletters en accenten tellen niet, dus "Poldergemaal" en "poldergemaal" zijn één term.
- `make terms` (`terms_lookup.py`) voegt ontbrekende waarden toe en zoekt voorstellen via de **GraphQL-API van het Termennetwerk** (`https://termennetwerk-api.netwerkdigitaalerfgoed.nl/graphql`):
  - termen → Cultuurhistorische Thesaurus (eerste keus) + AAT;
  - plaatsen → Wikidata (plaatsen NL/BE) + GeoNames (NL/BE/DE).

  De labels van GeoNames hebben een landcode ("Lemmer (NL)"); die telt niet mee bij het vergelijken. Bij provincies krijgt een GeoNames-"Bestuurlijke eenheid" voorrang, bij woonplaatsen een "Plaats".

  `make terms ARGS=--offline` voegt alleen rijen toe, zonder netwerk.
- **Alleen exacte labeltreffers** (prefLabel of altLabel) komen in de URI-kolommen (status `voorstel`). Andere treffers staan als hint in `opmerking` (status `twijfel`).
- `status`:
  - `gecontroleerd`: een mens heeft de URI's gecontroleerd; ze gaan mee als `sameAs`;
  - `aangenomen`: Claude heeft beoordeeld dat de URI's kloppen. Ze gaan mee als `sameAs`, en de reden staat in `opmerking` (§28);
  - `afgewezen`: geen passende term; de knoop blijft, zonder `sameAs`. De reden staat in `opmerking`;
  - `weglaten`: geen uitspraak, de relatie vervalt.

  `voorstel`, `twijfel` en een lege status geven een knoop zonder `sameAs`. Bestaande rijen worden nooit overschreven door `make terms`.
- *Waarom review:* ook exacte treffers kunnen fout zijn ("Hybride" → AAT "hybriditeit"; "Gesloopt" → CHT "slopen", een handeling).
- **Ervaring met plaatsen (31-10-2026):** de Wikidata-bron "plaatsen" van het Termennetwerk geeft bij een provincienaam vaak de stad of het dorp (Groningen → Q749, de stad). GeoNames gaf bij Groningen en Utrecht de gemeente in plaats van de provincie. Daarom:
  - **Gesloten sets** (provincies, later bijv. waterschappen) vullen we uit **Wikidata-SPARQL op klasse**: provincies via `wdt:P31 wd:Q134390`, GeoNames via `wdt:P1566`. De query en de datum staan in `opmerking`. Dat is gedaan voor `terms/province.csv`.
  - Bij **woonplaatsen** houdt de reviewer de provincie in de gaten (kolom `context`): het Termennetwerk zoekt alleen op naam, en dezelfde naam komt in meerdere provincies voor.

## 10. Datums en gebeurtenissen (30-10-2026)

- Jaartal: `xsd:gYear` (vier cijfers). Volledige datum: `xsd:date`. **Nooit** `xsd:date` voor een onvolledige datum (profiel).
- `schema:dateCreated`: **hooguit één**, alleen bij een enkel, zeker jaartal. Geen intervallen (profiel).
- Een periode, onzekerheid, of iets zonder profielpredicaat (verdwenen, ingedijkt, drooggemaakt, aangelegd van/tot) wordt een `schema:Event`, zoals in `prototype/data/build/events.ttl`. Zo'n event heeft:
  - `additionalType` → term;
  - `about` → het record;
  - `startDate`/`endDate` (gYear);
  - `dv:dateText`@nl (de letterlijke jaartekst);
  - `dv:datePrecision` (jaar, circa, periode, eeuw, voor, onbekend; uit `parse_period`);
  - `prov:wasDerivedFrom`.

  *Waarom:* het profiel heeft geen Event-klasse; dit is een bewuste domeinuitbreiding.
- **IRI van een gebeurtenis:** `<record>#<gebeurtenissoort>` (§3). Een gebeurtenis hoort bij één record, dus volgens §8.0 geen gedeelde knoop.
- **Soort gebeurtenis:** een term in de termenset `event-type`. Die soorten bedenken wij (ze staan niet in de bron), daarom zijn de slugs Engels (§4) en hebben de termen een naam in het Nederlands én het Engels:
  - `construction` (aanleg/bouw);
  - `disappearance` (verdwenen);
  - `embankment` (indijking);
  - `reclamation` (droogmaking);
  - `dike-breach` (dijkdoorbraak);
  - `drowning` (verdronken);
  - de mijlpalen van een landinrichting: `preparation`, `approval`, `execution`, `deed`, `completion`.

  Een nieuwe soort voeg je hier toe. De term-IRI is `term:event-type:<slug>`, gedeeld over alle datasets.
- **Verzin niets.** Een jaartal 0 of leeg betekent onbekend: geen statement. Een onleesbare waarde wordt weggelaten en gemeld in `report.json` (bijv. "1961 (2008").

## 11. Ontbrekende of onbekende waarden (30-10-2026)

- `lib.source.value()` maakt van leeg, `*`, `-` en "Onbekend" een `None`. `None` geeft **geen statement** (`Graph.add` slaat het over).
- "Geen" is wél een waarde (bijv. huidige aandrijving "Geen", bescherming "Geen") en wordt een term. We kunnen niet weten of "Geen" betekenis heeft ("niet beschermd") of eigenlijk "leeg" bedoelt, dus we houden wat de bron zegt (§27).
- Een record dat een naam nodig heeft maar "Onbekend" heet, krijgt een naam die alleen uit bronvelden is opgebouwd, met de toevoeging dat de naam onbekend is: "Poldergemaal in Winsum (naam onbekend)". Dit wordt geteld in `report.json`.

## 12. Normaliseren (30-10-2026)

Duidelijke spelfouten in gecodeerde velden worden gecorrigeerd met een expliciete tabel in de datasetmodule (bijv. `PROVINCES`: "Groninger" → "Groningen"). Vrije tekst wordt niet aangepast. Elke tabel staat in `PLAN.md` bij de dataset. *Waarom:* de visie, stap 3: normaliseren, maar herleidbaar.

## 13. Herkomst (30-10-2026)

- Record: `prov:wasDerivedFrom` → het bronobject. Voor RCE en Zeeland is dat de WFS-GetFeature-URL met `featureID` (`feature_uri`). Bij de Zeeuwse CHS-lagen met instabiele ID's selecteert de URL op het vaste veld `code` (`zld_code_uri`). Beide komen uit `prototype/datalayer/build_v3.py`.
- Dataset:
  - `schema:isBasedOn` → de bronlaag, met als IRI het **NGR-record** (`https://nationaalgeoregister.nl/geonetwork/srv/api/records/<uuid>`). Die bronlaag is beschreven als `schema:Dataset` met naam, uitgever (bronhouder), licentie en WFS-download.
  - `prov:wasGeneratedBy` → een `prov:Activity` (`used` de bron, `wasAssociatedWith` het team, tijd, script en versie).

## 14. Licenties (30-10-2026, nagekeken in het NGR)

| Bronlaag | Licentie in het NGR | Onze dataset |
|---|---|---|
| RCE gemalen, verdwenen molens, droogmakerijen | CC0 | CC0 |
| RCE molens | Public Domain Mark | CC0 |
| Zeeland dijken, polders, verdronken dorpen | Public Domain Mark | CC0 |
| Zeeland geschenkwoningen | CC0 | CC0 |
| RCE landinrichting (NGR `ceb8c100-…`), wielen (`a1f41210-…`) | CC0 | CC0 |
| RCE molens en gemalen in droogmakerijen | valt onder het NGR-record "Droogmakerijen" ("Bij deze dataset hoort de dataset Molens en Gemalen") | CC0 |
| Zeeland Deltawerken (NGR `2b81ed49-…`) | Public Domain Mark | CC0 |
| Zeeland poldernamen | **geen metadata of licentie gevonden** (NGR en dataportaal Zeeland, 31-10-2026) | **niet gebouwd** (§28) |
| IMWA kunstwerken (OGC API, licentielink in de API) | CC BY-SA 4.0 | CC BY-SA 4.0 |

Gebruik canonieke Creative Commons-IRI's met `http://` en een `/` aan het eind (zoals het Datasetregister ze opslaat). Zoek een nieuwe bron op in het NGR (`/geonetwork/srv/api/search/records/_search`) en lees de licentie uit het record (`/api/records/<uuid>/formatters/xml`).

## 15. Beeldmateriaal (30-10-2026)

Foto's (RCE-beeldbank via Memorix, Zeeuwse cultuurhistorie) worden **gelinkt, niet gekopieerd**: `schema:associatedMedia` → `ImageObject` met `contentUrl` en `thumbnailUrl`. De licentie is onbekend, dus `http://rightsstatements.org/vocab/CNE/1.0/` (Copyright Not Evaluated), met de fotograaf in `copyrightNotice`@nl. Meerdere foto's bij één record: `#image-1`, `#image-2`, ... (§3).

## 16. Identificatienummers (30-10-2026)

`schema:identifier` → `PropertyValue` (`#<reeks>-id`) met `propertyID` (de naam van de reeks, bijv. "rijksmonumentnummer") en `value`. Links naar de websites van de bron (gemalen.nl, allemolens.nl) gaan in `schema:url`. Nummers uit **andere registers** (rijksmonumentnummer, Ten Bruggencate, Archis, molendatabase) blijven in fase 1 een `identifier`. De koppeling met het object in dat register (de RCE-URI, het Wikidata-item) is een linkset in fase 2 (§1).

## 17. Datasetbeschrijving en catalogus (30-10-2026)

- In **schema.org**, niet in DCAT. *Waarom:* de requirements laten de keuze vrij (§5.1) en noemen schema.org beter vindbaar; het Datasetregister zet alles zelf om naar DCAT-AP-NL 3.0. Een DCAT-versie kan er later naast komen.
- Per dataset:
  - verplicht: `name`@nl, `description`@nl, `license`, `creator`, `publisher`;
  - verder: `dateCreated` (eerste omzetting), `dateModified`, `version`, `inLanguage "nl"`, `spatialCoverage` (de meest specifieke GeoNames-IRI: Nederland 2750405, Zeeland 2744011), `temporalCoverage` (uit de data), `about` (CHT-IRI van het onderwerp), `keywords`@nl, `includedInDataCatalog`, `isBasedOn`, `prov:wasGeneratedBy`;
  - nog niet: `datePublished`, want er is nog niets gepubliceerd.
- **Downloads** (`DataDownload`: `contentUrl`, `encodingFormat`, `usageInfo` = de profiel-URI, `dateModified`) staan **alleen in de catalogus**. Ze gebruiken relatieve IRI's (`pumping-stations.ttl`), zodat ze lokaal én na hosting naast de catalogus resolven. In het datasetbestand zelf staat de beschrijving zonder downloads, omdat N-Triples geen relatieve IRI's kent.

## 18. Formaten (30-10-2026)

- Per dataset: Turtle (`.ttl`, leesbaar) en N-Triples (`.nt`, dump), met dezelfde inhoud.
- Catalogus: Turtle en JSON-LD. De JSON-LD heeft expliciete waarde-objecten en geen typecoercie, waardoor de schema.org-contextvalkuil die het NDE beschrijft niet speelt.
- Altijd `https://schema.org/` (niet `http`).

## 19. Eigen vocabulaire (30-10-2026)

Alleen predicaten waar schema.org niets heeft, zo weinig mogelijk, in `vocab/droge-voeten.ttl`. Elk predicaat krijgt `rdfs:label` en `rdfs:comment` in het Engels (plus het label in het Nederlands) en `schema:domainIncludes`/`rangeIncludes`. Nu in gebruik:
- `dv:originalDrive`, `dv:currentDrive`;
- `dv:drainsArea`, `dv:dischargesInto`;
- `dv:protectionStatus`;
- `dv:dateText`, `dv:datePrecision`.

Voeg een nieuw predicaat eerst hier toe, en controleer of schema.org er echt niets voor heeft.

## 20. Validatie (30-10-2026)

- `make validate` (pyshacl via `uv`, dus buiten de standaardbibliotheek) toetst:
  - elke dataset aan de **profielshapes**, vastgepind op commit `8949539a…`;
  - `catalog.ttl` aan de **shapes van het Datasetregister**.

  Zie `shapes/README.md`. **Norm: nul onverwachte overtredingen.**
- **Verwacht** (telt niet als fout): de `^https?://`-regels van het register voor dataset-, organisatie-, catalogus- en download-IRI's. Die verdwijnen bij hosting.
- De twee "probe"-componenten van het register (online bereikbaarheid, Content-Type) hebben geen SHACL-validator en worden lokaal weggelaten.
- Daarnaast doet `build.py` een eigen controle (§6, datumtypes). Per dataset vergelijken we ook drie records met de hand met de bron-URL.

## 21. Code (30-10-2026)

- Python, alleen de standaardbibliotheek, altijd `python3 -I` (de oogst is onbetrouwbare invoer). pyshacl en pyoxigraph alleen in de losse ontwikkelstappen (`make validate`, `make notebook`).
- Eén module per dataset in `datasets/` (Engelse naam). Elke module heeft `META` (beschrijving en bron) en `convert(g, terms, dataset) -> stats`, en registreert zijn termvelden in `FIELDS`. Toevoegen aan `DATASETS` in `build.py`.
- Helpers uit `prototype/datalayer/build_v3.py` hergebruiken via `lib/source.py`, niet kopiëren.

## 22. Termensets gelden voor alle datasets (31-10-2026)

- Een termenset hoort bij een **betekenis**, niet bij een dataset. De term-IRI (`term:<veld>:<waarde>`) bevat geen dataset. Gebruiken twee lagen hetzelfde begrippenkader, dan gebruiken ze dezelfde veldnaam en dus dezelfde knopen. Bijvoorbeeld `windmill-type` voor `TYPE` (molens) en `type` (verdwenen molens), beide uit de molendatabase. *Waarom:* dan sluiten de datasets zonder extra linkset op elkaar aan, en is één review genoeg.
- **Bij twijfel apart houden** (zoals §8.4): verschillende bronnen met eigen codelijsten krijgen eigen sets (`imwa-function` naast `pumping-station-function`). Samenvoegen kan later via `sameAs`; ten onrechte samengevoegde termen zijn niet meer te scheiden.
- Veldnamen: Engels, `<objectsoort>-<kenmerk>` (`windmill-function`), of alleen het kenmerk als het algemeen is (`drive-type`, `event-type`, `province`, `locality`, `country`).
- **Twee soorten termensets, niet mengen:**
  - **eigen sets** (`object-type`, `event-type`): wij bedenken de soorten, met een Engelse slug (§4), via `terms.own_term()`;
  - **bronsets**: de waarden uit een bronveld, met de Nederlandse slug van de waarde, via `terms.term()`.

## 23. Wat we niet overnemen (31-10-2026)

- **Technische velden:** database-ID's die geen sleutel zijn, oppervlakte en lengte van de geometrie (`shape_area`, `shape_leng`; die volgen uit de geometrie), `gdb_*`, sorteer- en hulpnummers, tellers ("aantal foto's"). *Waarom:* het zijn geen uitspraken over het erfgoed.
- **Persoonsgegevens van privépersonen:** nooit. Bijvoorbeeld `eigenaar` bij de geschenkwoningen. *Waarom:* AVG, en het NDE-ontwerpprincipe om niets over particulieren te publiceren. Namen van fotografen en makers die de bron zelf als vermelding publiceert, mogen wel.
- Per dataset staat in `PLAN.md` welke velden niet worden overgenomen, met de reden. Wat niet in die lijst staat en niet gemapt is, is een fout.

## 24. Tekstvelden en verwijzingen (31-10-2026)

- **Vrije tekst over het object** (bijzonderheden, opmerkingen, situatie) → `schema:description`@nl. Meerdere tekstvelden worden **één** `description`@nl, elk deel met het veldlabel ervoor ("Bijzonderheden: … Opmerkingen: …"). *Waarom:* het profiel vraagt `uniqueLang` bij tekst, en zo blijft zichtbaar waar elke zin vandaan komt.
- **Bronvermelding of literatuur** in tekst (`bron_data`, `bron_geo`) → `schema:citation`@nl.
- **Een webpagina over het object** (gemalen.nl, allemolens.nl) → `schema:url`. **Een rapport of document dat het object beschrijft** (`reportlink` van de provincie) → `schema:subjectOf` → een `CreativeWork` (`#report`) met `url` en `name`@nl.

## 25. Gebieden als record (31-10-2026)

- Is het record zelf een gebied (`Place`: polder, droogmakerij, wiel, verdronken dorp, ruilverkaveling), dan komt de **geometrie direct op het record** (`schema:geo` bij een punt, GeoSPARQL bij een vlak). Er is dan geen `#location`.
- Een **bestuurlijke eenheid die de bron aan het gebied toekent** (een veld `gemeente` of `provincie`) → `schema:containedInPlace` → de gedeelde plaats (`place:municipality:<provincie>:<naam>`, `place:province:<naam>`). Dat is de uitspraak van de bron, ook als het gebied over de grens loopt.
- **Adresachtige tekst** (`plaats`, `straat` in de Zeeuwse CHS-lagen: waar het object ligt of is beschreven) → `schema:address` → `PostalAddress` op het record (bij een gebouwd object op `#location`). De `plaats` wordt **daarnaast** een gedeelde woonplaats via `containedInPlace`, maar alleen als de bron hem als de woonplaats van het object noemt. Bij twijfel alleen het adres.

## 26. Gesloten sets van concepten (31-10-2026)

Sommige concepten vormen een vaste, bekende set: provincies, landen, waterschappen. Daarvoor:
- een gedeelde plaats of organisatie **zonder context** (`terms.place(..., scoped=False)`, IRI `place:province:friesland`, `place:country:zweden`);
- een reviewtabel die gevuld wordt uit **Wikidata-SPARQL op klasse**, niet uit de zoekdienst (§9):
  - provincies: `wdt:P31 wd:Q134390`;
  - landen: `wdt:P31 wd:Q6256` (een land) of `wd:Q3624078` (een soevereine staat);
  - gemeenten: `wdt:P31 wd:Q2039348` (gemeente van Nederland). Gemeentenamen zijn in Nederland uniek, dus de gemeente is een gesloten set zonder context (`place:municipality:<naam>`). *Waarom geen provincie als context:* de Zeeuwse laag verdronken dorpen noemt ook Bergen op Zoom en Woensdrecht, die in Noord-Brabant liggen. Bij twee kandidaten kiezen we het item met een GeoNames-ID (Middelburg, Sluis: het andere is een oude gemeente). Zonder eenduidig GeoNames-ID (Papendrecht) nemen we alleen Wikidata;
  - waterschappen: gedeelde `Organization` (`org:water-board:<naam>`, via `terms.organization()`), met Wikidata uit de bestaande tabel `waterBoardLabelToQid` in het prototype.

  De query en de datum staan in `opmerking`.

## 27. Null-flavors en samengestelde waarden (31-10-2026)

Op 31-10-2026 even ingevoerd en dezelfde dag **teruggedraaid** door Jari. Voer ze niet opnieuw in zonder overleg.

- **Null-flavors blijven staan.** "Geen", "Geen functie peilbeheer", "Nvt" en "N.v.t." worden gewone termen of plaatsen, zoals elke andere bronwaarde. Alleen leeg en "Onbekend" geven geen statement (§11). *Waarom:* we kunnen niet zeker weten of "Geen" betekenis heeft. Bescherming "Geen" betekent waarschijnlijk "geen monument", aandrijving "Geen" mogelijk "buiten werking". Weglaten zou die informatie stil weggooien. *Teruggedraaid:* een automatische lijst van null-flavors die relaties weglaat.
- **Geen systematisch splitsen van samengestelde waarden.** *Waarom:* in namen hoort "en" of "/" vaak bij één naam ("Land van Maas en Waal", "Berkel en Rodenrijs", "Alphen a/d Rijn"), dus splitsen vraagt per waarde een oordeel. Bij honderden bemalingsgebieden en wateren is dat te veel handwerk voor de waarde die het oplevert. *Teruggedraaid:* de reviewkolom `splitsen` en de markering "mogelijk samengesteld".
- **Wel: een expliciete splitstabel in de datasetmodule voor duidelijke gevallen in een kleine, gecodeerde termenlijst**, op dezelfde manier als een normalisatietabel (§12). Voorwaarde: de delen komen in hetzelfde veld ook los voor. Elke splitsing wordt geteld in `report.json` en vermeld in `PLAN.md`.
  - Nu: `FUNCTION_SPLITS` in `pumping_stations.py`: "Boezem- en Poldergemaal" (4×) → `additionalType` "Boezemgemaal" + "Poldergemaal".
  - Niet voor namen van gebieden, wateren of plaatsen.

## 28. Aannames in plaats van verificatie (31-10-2026)

Jari wil niet alles zelf verifiëren: "maak maar aannames". Daarom beslist Claude waar eerder een menselijke controle stond, met twee voorwaarden. **Elke aanname is herkenbaar en herleidbaar** (status `aangenomen` of `afgewezen`, met reden en datum). En **er wordt niets verzonnen**: waar een aanname zou betekenen dat we een feit verzinnen, kiezen we de veilige kant. Aannames tot nu toe:

**Termen en plaatsen** (`terms/*.csv`):
- Provincies: alle 12 `aangenomen` (Wikidata-SPARQL op klasse, §9).
- Objectsoort "gemaal" → CHT "gemalen" `aangenomen`. De AAT-kandidaat "gemalen" (300386271) betekent huwelijkspartners (prins-gemaal): verwijderd. *Les: een exacte labeltreffer kan een homoniem zijn; kijk naar `scopeNote` en `broader`.*
- Functies "Poldergemaal" en "Boezemgemaal" → CHT `aangenomen`.
- Afgewezen, omdat de kandidaat iets anders betekent:
  - aandrijving → de stof ("stoom", "aardgas");
  - bescherming "Rijk"/"Gemeente"/"Provincie" → de overheid of het gebied, niet het monumenttype;
  - status "Gesloopt" → de handeling "slopen".

  De rest is afgewezen omdat er geen passende term is.
- Woonplaatsen, bemalingsgebieden en wateren: **geen koppelingen** in fase 1. *Waarom:* het Termennetwerk zoekt alleen op naam, dezelfde naam komt in meerdere provincies voor, en zonder controle is de kans op verkeerde `sameAs` groot. Ze blijven lokale knopen (toegestaan, §8). Koppelen kan in fase 2 met naam én ligging.

**Modelkeuzes, bevestigd als aanname:** CC0 voor afgeleide datasets van CC0/PDM-bronnen (§14), gebouwen als `CreativeWork` en `locationCreated` (§5, §7), opgebouwde namen met "(naam onbekend)" (§11), foto's met CNE (§15).

**Voor de volgende datasets:**
- **Provincie bij lagen zonder provincieveld: niet afleiden** uit het punt in fase 1. Context `no-context`. *Waarom:* "Regels zonder bron mogen niet" (PLAN), en er zijn geen provinciegrenzen geoogst. Afleiden kan in fase 2 als verrijking met methode.
- **Niet-unieke sleutels:**
  - Molens: `TBGCNUMMER`, en bij een dubbel nummer `<TBGCNUMMER>-<gid>` (gemeld).
  - Landinrichting: `objectid` (gemeld als instabiel).
  - Wielen: `id`.
  - Geschenkwoningen: `objectnummer`; dubbele records met hetzelfde adres worden samengevoegd (gemeld).
- **Licenties:** nakijken in het NGR bij de bouw. **Is er geen open licentie te vinden, dan bouwen we de dataset niet** (geen aanname over rechten).
- **Velden waarvan de betekenis onduidelijk is** (`rce_zone`, `klassiek`, `modulair`, `zaa`, `is_gelijk`, `selectieli`, `polygoon`, ...): niet overnemen (R15), tenzij de bron of het NGR-record de betekenis noemt.

**Niet aangenomen, want dat zou verzinnen zijn:** een e-mailadres voor het contactpunt (§2). De waarschuwing van het Datasetregister blijft staan tot er een adres is.

**Bij de uitvoering van alle datasets (31-10-2026):**
- **Termvoorstellen beoordelen met regels:** `assume_terms.py` (`make assume`) neemt een CHT-voorstel alleen aan als een bredere term (tot 3 niveaus) in het domein van het veld ligt (bijv. "molens" voor `windmill-type`). AAT- en Wikidata-kandidaten voor termen worden altijd verwijderd, omdat exacte labels daar homoniemen bleken. Statussen, IMWA-functies en eigen gebeurtenissoorten worden niet gekoppeld. Eigen objectsoorten zijn met de hand gekoppeld (CHT, gecontroleerd op `scopeNote` en `broader`; tabel `OBJECT_TYPES`).
- **Poldernamen (Zeeland) niet gebouwd:** geen open licentie te vinden (§14).
- **IMWA:** `capaciteit` niet overgenomen, omdat het API-schema geen eenheid noemt. Naamwaarden "NVT" en "<Null>" zijn geen namen (R2): opgebouwde naam. Uitgever Het Waterschapshuis staat niet als organisatie in Wikidata (Q2582955 is een gebouw in Wierum): eigen IRI `org:het-waterschapshuis`. Drie datasets (gemalen, sluizen, stuwen) in plaats van één: de stuwen zijn alleen al 53.137 records.
- **Verzameljaren** bij de verdwenen molens (bouwjaar 1832 en 1560, verdwenen 1850 en 1929) krijgen nooit `dateCreated`. Ze worden een gebeurtenis met precisie `onzeker` en de telling uit de bron in `dv:dateText`.
- **Kwalificaties bij jaartallen** ("voor", "ca.", "of eerder; 1674 verwoest…"): de tekst gaat letterlijk in `dv:dateText`; alleen het begin bepaalt de precisie. "Voor <jaar>" maakt van het jaar een `endDate` (uiterlijk), niet een `startDate`.
- **Steekproef** (`spot_check.py`, `make check`): 3 records per dataset live vergeleken met de bron. Eén verschil: een IMWA-sluis heet in de oogst van 28-10 "Sluis 1 (Oudehorne)" en nu "Willem Loresluis". De bron is dus gewijzigd. De datasets zijn een momentopname van de oogst; een nieuwe `make harvest` in het prototype werkt ze bij.

## 29. Alle datasets samen, en gedeelde concepten samenvoegen (31-10-2026)

**Vraag van Jari:** combineer alle datasets in één grote dataset; staat dezelfde term in dataset A en B, dan moet er één term zijn waar beide naar linken, voor zoveel mogelijk termen.

**Wat al zo was:** term-, plaats- en organisatie-IRI's bevatten geen dataset (`term:<veld>:<waarde>`, §3, §22). Dezelfde waarde in hetzelfde veld is dus al één knoop in alle datasets.

**Wat erbij komt: samenvoegen** (`lib/merge.py`), in twee rondes in `build.py`. Ronde 1 verzamelt per dataset de feiten (namen, `sameAs`, termensets, coördinaten van de records die een knoop gebruiken). Daarna wordt bepaald wat samengaat, en ronde 2 schrijft alles met de samengevoegde IRI's. Dat geldt ook voor de losse datasets: ook die linken nu naar de gedeelde knoop. Regels, van sterk naar minder sterk:
1. **Dezelfde externe term:** knopen met een gedeelde `schema:sameAs` (status `aangenomen` of `gecontroleerd`). Voorbeeld: "paltrok" en "paltrokmolen" (beide CHT "paltrokmolens").
2. **Hetzelfde label binnen één betekenisdomein** (`TERM_GROUPS`): `drainage-structure` (de molen- en maalvelden), `dike-function`, `status`, `protection`, `material`. Dat wordt één term `term:<domein>:<slug>`, die in alle betrokken termensets zit. Voorbeeld: "poldermolen" als molenfunctie, hoofdcategorie en soort maalinrichting. **Niet over domeinen heen:** "Geen" als aandrijving is iets anders dan "Geen" als bescherming.
3. **Woonplaats zonder provincie** (`locality:no-context:<naam>`, uit de molens en de wielen) → de enige woonplaats met dezelfde naam én een provincie, als de records van beide binnen 10 km van elkaar liggen. Twee of meer kandidaten: niet samenvoegen.
4. **Een genoemd gebied wordt het gebiedsrecord:** de polder bij een dijk (`dv:inPolder`) en het bemalingsgebied van een gemaal (`dv:drainsArea`) → het record met dezelfde naam in `zeeland-polders` of `drained-lakes`, als een coördinaat van een record dat het gebied noemt, in de omhullende rechthoek van het gebied ligt (plus ca. 1 km). Alleen bij precies één kandidaat.

**De gedeelde knoop** is een record als dat erbij zit, anders een knoop met provincie (boven een zonder), anders een eigen term, anders een nieuwe domeinterm (regel 2). Hij krijgt één Nederlandse naam; afwijkende labels worden `schema:alternateName`. `build.py` controleert in het gecombineerde bestand dat elke knoop hooguit één naam per taal heeft.

**Herleidbaar:** de dataset `concept-merges` (`build/concept-merges.ttl`) noemt per gedeelde knoop de opgegane knopen (`dct:replaces`), met de regel in `rdfs:comment`. Stand op 31-10-2026: 947 knopen opgegaan in 911 gedeelde knopen, waaronder 522 woonplaatsen, 337 polders bij dijken, 33 bemalingsgebieden die een droogmakerij zijn, en 45 termen.

**De gecombineerde dataset** `droge-voeten` (`build/droge-voeten.ttl` en `.nt`) bevat alle datasets plus `concept-merges`, en `schema:hasPart` naar elk ervan. **Licentie CC BY-SA 4.0**, omdat de IMWA-data erin zit (share-alike). De losse RCE- en Zeeland-datasets blijven CC0. Het bestand is de vereniging van de gevalideerde datasets en wordt zelf niet met pyshacl gevalideerd: met bijna 2,5 miljoen triples is het daarvoor te groot (§20).

**Bewust niet samengevoegd:** rivieren (wielen) met wateren (gemalen), omdat namen als "IJssel" en "Hollandse IJssel" te dicht bij elkaar liggen; bemalingsgebieden met elkaar over provinciegrenzen heen; namen die als gebied meer dan één kandidaat hebben. Koppelingen tussen **records** (molen ↔ rijksmonument, gemaal ↔ IMWA) zijn nog fase 2.

## 30. Tijdlijnqueries per adres (31-10-2026)

**Vraag van Jari:** de belangrijkste momenten voor de tijdlijn zijn de indijking van de polder, de stichting van de gemalen in de buurt en de aanleg van de dijken in de buurt. Kan dat efficiënt op de kleinere datasets, en zijn ze goed genoeg gelinkt?

- **Drie queries** in `queries/` (`timeline-polder.rq`, `timeline-gemalen.rq`, `timeline-dijken.rq`), elk op twee of drie kleine datasets. Laden kost 0,2 s, een query 0,02–0,1 s. De invoer is één `VALUES (?lat ?lon)`-regel (WGS84). Notebook: `timeline.sparqlbook`.
- **Niet op het gecombineerde bestand:** een tijdlijnquery over 2,4 miljoen triples met `UNION { BIND(?r AS ?n) }` en `geof:distance` liep minuten. Dat kwam niet door de data, maar door een query die Oxigraph slecht optimaliseert.
- **Ruimtelijk:**
  - Oxigraph (0.5) kent `geof:sfContains` en `geof:sfIntersects`, maar **niet `geof:distance`** (geeft geen waarde).
  - Daarom: polder of droogmakerij met `sfContains`; dijken met `sfIntersects` met een vierkant van ca. 250 m (opgebouwd in de query uit lat/lon); gemalen met een getallenvak van ca. 3 km en een afstand in klassen (SPARQL heeft geen wortel).
  - Rekenen in `xsd:double`: het kwadraat van een `xsd:decimal` met tien decimalen loopt in Oxigraph over en geeft geen waarde.
- **De links helpen:** de gemalen- en dijkenquery markeren met `?bemaaltDezePolder` en `?vanDezePolder` wat volgens de bron bij de polder van het adres hoort (via de samengevoegde polderknoop, §29). Daarvoor is regel 4 van §29 uitgebreid:
  - eerst de exacte naam;
  - daarna dezelfde naam zonder "polder", "de", "het" en zonder een toevoeging tussen haakjes **aan de verwijzende kant** ("De Beemster (Waterland)" → "De Beemster", "Vierbannen van Duiveland" → "Polder Vierbannen van Duiveland").

  Bij het record blijven de haakjes staan: "Slabbekoornpolder (oost)" is een deel van de polder, niet de hele polder.
- **Fout hersteld:** jaartallen van drie cijfers (de Ringwalburg, aangelegd 840–900) vielen weg. Ze worden nu als `xsd:gYear` "0840" geschreven.
- **Bekende grenzen:**
  - dijken zijn er alleen voor Zeeland;
  - een indijkingsjaar alleen voor Zeeuwse polders, een droogmakingsjaar alleen voor droogmakerijen;
  - de dijken rond Middelburg noemen als "polder" de stad ("Middelburg"), dus die worden geen polderrecord;
  - "Polder Vierbannen en Duiveland" (met "en") wordt niet gekoppeld aan "…van Duiveland": we zoeken niet bij benadering;
  - de 1953-laag en de Waterstaatskaart uit de tijdlijn van het prototype zijn (nog) geen linked data.


## 31. De linked data in de QLever-store, en de tijdlijn in de app (31-10-2026)

**Vraag van Jari:** zet de datasets uit `linkeddata/` in de triple store op de VPS (QLever, `qlever/`, waar ook de Rijksmuseum-subset staat) en vul daarmee de tijdlijn in de app.

- **Wat erin gaat:** het gecombineerde `build/droge-voeten.nt` (alle datasets, `concept-merges` en de catalogus; 2,4 miljoen triples), gezipt tot `qlever/data/droge-voeten.nt.gz` (~21 MB), als named graph `https://w3id.org/drogevoeten/graph/droge-voeten`. Eén graph en niet een per dataset: termknopen staan in meerdere bestanden, en binnen één graph ontdubbelt QLever die triples. Niet ook de losse datasets laden, anders staat alles dubbel. Indexeren kost ca. 15 s.
- **Geen botsingen met het Rijksmuseum:** onze IRI's zijn `urn:drogevoeten:…`, de Rijksmuseum-view gebruikt `https://w3id.org/drogevoeten/def#` als `dv:`. De Rijksmuseum-query geeft met beide graphs dezelfde soort uitkomst in ca. 0,5 s.
- **Bouwen gebeurt lokaal:** de VPS heeft de oogst van het prototype niet. `qlever/compose.sh` zipt het bestand als het nieuwer is; `qlever/deploy.sh` stuurt het mee. QLever indexeert opnieuw als een `data/*.nt(.gz)` nieuwer is dan de index.
- **QLever is anders dan Oxigraph (§30):**
  - `geof:distance` werkt wel (km, of meter met `<http://qudt.org/vocab/unit/M>`), ook van een punt tot een dijklijn;
  - `geof:sfContains`/`sfIntersects` werken alleen in een eenvoudige vorm: punt-in-vlak op het hoogste niveau wel, maar niet binnen een `OPTIONAL` en niet met een vlak dat in de query wordt opgebouwd ("only implemented for a subset of all possible queries").
- **Daarom eigen QLever-versies van de drie queries,** in `app/lib/timeline.ts` (de `.rq`-bestanden in `queries/` blijven voor Oxigraph en de notebooks):
  - polder of droogmakerij: zoals §30, met `sfContains`;
  - gemalen: echte afstand ≤ 3 km in plaats van een vak en afstandsklassen;
  - dijken: afstand tot de lijn ≤ 250 m in plaats van een vierkant;
  - "bemaalt jouw polder" en "hoort bij jouw polder" vergelijkt de app zelf met de polder uit de eerste query, zodat er geen `sfContains` in een `OPTIONAL` nodig is.
  - De bronnaam komt uit de catalogus (`schema:isBasedOn/schema:name`).
- **Wat de app toont:** de indijking of droogmaking, hooguit 3 gemalen met een stichtingsjaar (eerst die volgens de bron jouw polder bemalen, dan de dichtstbijzijnde) en hooguit 3 dijken met een aanlegjaar, op jaar gesorteerd. Jaartekst en precisie uit de bron staan in de bron-tip. Niets gevonden: één stap "Onbekend". Endpoint onbereikbaar: het oude voorbeeld blijft staan, net als bij de Rijksmuseum-werken.
- **De oorspronkelijke functie van een dijk staat niet in de tijdlijn:** bij de Ringwalburg geeft de bron "Straten" als oorspronkelijke en "ringwalburg" als latere functie (`oorsprfunc`/`naspfunc` lijken omgewisseld).
- **Bekend:** de punt-in-vlakquery kost ca. 0,6 s (alle vlakken). De 1953-laag en de Waterstaatskaart zitten er nog niet in (§30).


## 32. De tijdlijn in de app aangevuld tot die van het prototype (31-10-2026)

**Vraag van Jari:** het prototype toont bij "Middenweg 68a, Middenbeemster" meer in de tijdlijn dan de app. Bepaal welke onderdelen van de prototype-tijdlijn (`prototype/app/timeline.js`) met de linked data kunnen, en bouw die.

- **Erbij gekomen** (`app/lib/timeline.ts`), met de stralen en aantallen van het prototype:
  - **droogmakerij:** het polderpeil (`dv:waterLevel`) in de tekst, de literatuur (`schema:citation`) in de bron-tip. De polderquery groepeert nu per gebeurtenis, anders geven twee citaten twee stappen;
  - **landinrichting** waarin het adres ligt (punt-in-vlak, eigen query): vorm, uitvoeringsjaar als stap, akte en afsluiting in de tekst, status in de tip;
  - **molens binnen 1 km:** het aantal verdwenen poldermolens met de oudste (bouwjaar), een stap voor de laatste die verdween, en hooguit 2 bestaande poldermolens. Geen poldermolens maar wel andere verdwenen molens: één stap zonder jaar. "Poldermolen" is `additionalType` `drainage-structure:poldermolen`; die term is gedeeld tussen hoofdcategorie en functie, dus hij telt een molen met poldermolen als functie ook mee (het prototype keek alleen naar de hoofdcategorie);
  - **verdronken dorpen** binnen 3 km (hooguit 2), met de vroegste verdrinking en de andere namen;
  - **wielen** binnen 1 km (hooguit 2). Wielen met dezelfde naam, soort en rivier worden één stap ("2× Wiel bij Krimpen aan de Lek (naam onbekend)"). Zonder doorbraakjaar: een stap zonder jaar;
  - **geschenkwoningen:** de woning op het adres zelf (straat + huisnummer + huisletter/-toevoeging en woonplaats, gelijk aan `streetAddress` en `addressLocality`), anders één stap voor die binnen 500 m met de landen;
  - **gemalen:** de aandrijving toen en nu, en ook gemalen zonder stichtingsjaar (als stap zonder jaar), zoals het prototype;
  - **dijken:** de staat nu (`creativeWorkStatus`);
  - zonder polder of droogmakerij de stap "weten we niet", zoals het prototype.
- **Stappen zonder jaar** krijgen "Onbekend" en staan onderaan.
- **Snelheid:** acht queries tegelijk, 0,7–1,2 s per adres op een lokale QLever. De puntqueries filteren eerst op een vak rond het adres, en rekenen pas daarna `geof:distance`.
- **Niet mogelijk, want geen linked data:** de Waterstaatskaart, de 1953-inundatiekaart van Noord-Brabant en de melding "of deze plek in 1953 onderliep, weten we niet", de poldernamenkaart van Zeeland (§28). "Vandaag" en "Risico" komen uit live diensten (IMWA, LIWO), niet uit de tijdlijn.
- **Getest** op de zeven demo-adressen naast het prototype: op de punten hierboven na dezelfde stappen. Bij Middelburg toont de app als derde gemaal Poppekinderen (bemaalt volgens de bron jouw polder, §31) in plaats van Veerse Watergang.
