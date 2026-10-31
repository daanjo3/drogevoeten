# Plan: bronlagen als linked data

Dit is het werkplan: eerst de **algemene mappingregels**, die voor elke dataset gelden, en daarna per dataset de toepassing ervan. Het waarom van elke regel staat in [`DECISIONS.md`](DECISIONS.md) ("§n" verwijst daarnaar); de werkwijze in [`CLAUDE.md`](CLAUDE.md). Goedgekeurd door Jari op 30-10-2026; herschreven op 31-10-2026 met de algemene regels.

**Fase 1:** elke laag apart. **Fase 2:** links tussen de datasets (onderaan).

---

## Algemene mappingregels

Ga bij elke nieuwe laag **elk bronveld** langs en wijs het één regel toe. Een veld zonder regel is óf een nieuwe beslissing (leg die vast in DECISIONS.md en voeg hier een regel toe), óf iets voor "niet overnemen" (R15). De regel-ID's (R1, R2, ...) gebruik je in de veldtabel per dataset.

| Regel | Soort bronveld | Modellering | Waarom |
|---|---|---|---|
| **R1** | Het object zelf | Eén record per bronobject. Gebouwd object → `CreativeWork`, gebied → `Place`. IRI `id:<soort>:<sleutel>`; de sleutel is uniek en stabiel en wordt gecontroleerd door het script | §3, §5 |
| **R2** | Naam, alternatieve namen | `name`@nl, `alternateName`@nl. Ontbreekt de naam, dan een naam die alleen uit bronvelden is opgebouwd, met "(naam onbekend)" | §6, §11 |
| **R3** | Soort, type, functie, categorie | `additionalType` → term uit een **bronset** (co-type `URL`), plus altijd onze **eigen** term `object-type:<soort>` (Engelse slug, `terms.own_term()`). Een bronset is gedeeld over de datasets als het hetzelfde begrippenkader is | §4, §5, §8, §22 |
| **R4** | Status, staat, in gebruik | Bij `CreativeWork`: `creativeWorkStatus` → term. Bij `Place`: een `dv:`-predicaat (`dv:status`, toe te voegen bij eerste gebruik) → term | §8, §19 |
| **R5** | Een enkel, zeker jaartal van ontstaan | `dateCreated` (gYear) | §10 |
| **R6** | Periode, onzekere datering, ander moment (verdwenen, ingedijkt, ...) | `Event` `<record>#<soort>`, `additionalType` → `term:event-type:<soort>`, `startDate`/`endDate`, `dv:dateText`, `dv:datePrecision`, `about`. 0 of leeg = onbekend: geen event | §10 |
| **R7** | Waar een gebouwd object staat (punt, plaats, provincie) | `locationCreated` → `m.position()`: `#location` (coördinaten, adres) `containedInPlace` → `place:locality:<provincie>:<naam>` → `place:province:<naam>` | §7 |
| **R8** | Geometrie van een gebied-record | Op het record zelf: `schema:geo` bij een punt, GeoSPARQL-WKT bij een vlak of lijn. Geen `#location` | §7, §25 |
| **R9** | Bestuurlijke eenheid die de bron toekent (gemeente, provincie) | `containedInPlace` → gedeelde plaats (`place:municipality:<provincie>:<naam>`, `place:province:<naam>`) | §25, §26 |
| **R10** | Adresachtige tekst (straat, huisnummer, plaats als adres) | `address` → `PostalAddress` (op `#location` of op het gebied-record). Een woonplaats daarnaast als gedeelde plaats (R7/R9), alleen als de bron hem als woonplaats noemt | §25 |
| **R11** | Een ánder genoemd gebied of water (bemalingsgebied, polder bij een dijk, rivier) | Gedeelde `place:<veld>:<provincie>:<naam>` via een domeinpredicaat (`dv:drainsArea`, ...). Staat het gebied als record in **dezelfde** dataset, dan direct naar dat record | §1, §8 |
| **R12** | Persoon of organisatie | Gedeelde `Person`/`Organization`. Een gesloten set (waterschappen) via Wikidata-SPARQL. **Privépersonen nooit** (R15) | §8, §23, §26 |
| **R13** | Land (bijv. land van herkomst) | Gedeelde `place:country:<naam>` (gesloten set, zonder context, via Wikidata-SPARQL) | §26 |
| **R14** | Nummer in een eigen of ander register | `identifier` → `PropertyValue` `#<reeks>-id`. De koppeling met dat register is fase 2 | §16 |
| **R15** | Technisch veld, afgeleide maat, persoonsgegevens | Niet overnemen; per dataset opsommen met reden | §23 |
| **R16** | Webpagina over het object | `url` | §24 |
| **R17** | Rapport of document over het object | `subjectOf` → `CreativeWork` `#report` (`url`, `name`@nl) | §24 |
| **R18** | Bronvermelding, literatuur | `citation`@nl | §24 |
| **R19** | Vrije tekst over het object | Eén `description`@nl; meerdere velden samengevoegd, elk met zijn label | §24 |
| **R20** | Foto | `associatedMedia` → `ImageObject` `#image` (of `#image-<n>`), licentie CNE, fotograaf in `copyrightNotice` | §15 |
| **R21** | Maat met eenheid (oppervlak, capaciteit) | `QuantitativeValue` met `value`, `unitCode` (UN/CEFACT) en `unitText` | profiel §4.9 |
| **R22** | Spelvarianten in een gecodeerd veld | Normalisatietabel in de module; vermelden bij de dataset | §12 |
| **R23** | "Geen", "Nvt" en dergelijke | Een gewone waarde: term of plaats zoals elke andere. Alleen leeg en "Onbekend" vallen weg (R15/§11) | §11, §27 |
| **R24** | Waarde die duidelijk meerdere termen uit een kleine codelijst noemt ("Boezem- en Poldergemaal") | Splitstabel in de module (zoals R22), alleen als de delen ook los voorkomen; tellen in `report.json`. Namen van gebieden, wateren en plaatsen niet splitsen | §27 |

Maak termen en plaatsen altijd met `terms.link()`, `terms.link_place()`, `terms.terms()` of `terms.places()`, nooit met een zelfgebouwde term-IRI.

Verder voor elk record (§6) en elke dataset (§17): `isPartOf`, `sdDatePublished`, `prov:wasDerivedFrom` (`feature_uri`, of `zld_code_uri` bij de CHS-lagen), en een datasetbeschrijving met de licentie uit het NGR (§14).

**Regels zonder bron mogen niet.** Leid niets af wat de bron niet zegt: geen provincie uit een punt, geen jaartal uit een periode, geen "jouw molen". Afleiden kan alleen als expliciete verrijking in fase 2, met de methode erbij.

### Gedeelde termensets en plaatsen (R3, R4, R6, R11–R13)

Gebruik voor hetzelfde begrippenkader dezelfde veldnaam (§22). Al vastgelegd of gepland:

| Veld | Soort | Gebruikt door |
|---|---|---|
| `object-type` | **eigen** term (Engelse slugs: `pumping-station`, `windmill`, `drained-lake`, `drained-lake-structure`, `land-consolidation-project`, `breach-pool`, `dike`, `polder`, `gift-house`, `drowned-village`, `delta-work`, `lock`, `weir`) | alle datasets |
| `event-type` | **eigen** term (Engelse slugs, §10) | alle datasets met gebeurtenissen |
| `pumping-station-function`, `pumping-station-status` | term | gemalen; de gemalen in droogmakerijen als dezelfde codes |
| `drive-type` | term | gemalen; verdwenen molens (`aandrijvin`), als de waarden hetzelfde betekenen, anders `windmill-drive` |
| `protection-status` | term | gemalen |
| `windmill-category`, `windmill-type`, `windmill-function`, `windmill-status` | term | molens en verdwenen molens (beide uit de molendatabase) |
| `dike-function`, `dike-status` | term | Zeeuwse dijken |
| `land-consolidation-form`, `land-consolidation-status` | term | landinrichting |
| `material`, `house-form` | term | geschenkwoningen |
| `imwa-function` | term | IMWA (eigen codelijst, §22) |
| `province`, `country` | plaats, gesloten set | alle datasets |
| `locality`, `municipality` | plaats, context = provincie | alle datasets |
| `drained-area`, `receiving-water` | plaats, context = provincie | gemalen |
| `polder` | plaats, context = provincie | Zeeuwse dijken (veld `polder`) |
| `river` | plaats, context = provincie | wielen (`hoofdstr`) |

### Context bij gedeelde plaatsen

De context is de **provincie die de bron bij het record noemt**. Voor de Zeeuwse lagen van de provincie is dat altijd "Zeeland": de bron dekt alleen Zeeland. Noemt de bron geen provincie (molens, verdwenen molens, wielen, droogmakerijen), dan is de context `no-context`. De provincie wordt in fase 1 **niet** uit het punt afgeleid (aanname, DECISIONS §28).

### Stappen per dataset

1. Licentie in het NGR nakijken en in DECISIONS §14 zetten.
2. De sleutel controleren (uniek, stabiel).
3. Een veldtabel maken: bronveld → regel → modellering. Daarna `datasets/<naam>.py` schrijven.
4. `make` en `make terms`; daarna reviewt een mens.
5. `report.json` nakijken.
6. `make validate`: nul onverwachte overtredingen.
7. Drie records met de hand vergelijken met de bron-URL.
8. De status en de veldtabel hieronder bijwerken; eventueel queries toevoegen aan een notebook.

---

## Status

| # | Dataset (slug) | Recordsoort | Bron in `prototype/data/raw/` | Status |
|---|---|---|---|---|
| 1 | `pumping-stations` | `pumping-station` | `v3/rce_gemalen.json` (2.663) | **klaar** (pilot); termen beoordeeld als aanname (§28) |
| 2 | `windmills` | `windmill` | `v3/rce_Molens.json` (1.872) | te doen |
| 3 | `lost-windmills` | `lost-windmill` | `v3/rce_verdwenenmolens.json` (17.119) | te doen |
| 4 | `drained-lakes` | `drained-lake`, `drained-lake-structure` | `v3/rce_droogmakerijen.json` (245), `v3/rce_drgmk_molens_gemalen.json` (561) | te doen |
| 5 | `land-consolidation` | `land-consolidation-project` | `v3/rce_LandinrichtingNL.json` (604) | te doen; licentie nakijken |
| 6 | `breach-pools` | `breach-pool` | `v3/rce_wielen.json` (1.266) | te doen; licentie nakijken |
| 7 | `zeeland-dikes` | `dike` | `v3/zld_ext_chs_dykdamwalzld.json` (2.486) | te doen |
| 8 | `zeeland-polders` | `polder` | 7× `v3/zld_geocmd_chspld_*` (595) | te doen |
| 8b | `zeeland-polder-names` | `polder-area` | `v3/zld_geonam_pldvlk.json` (658) | te doen; licentie nakijken |
| 9 | `gift-houses-1953` | `gift-house` | `v3/zld_geocmd_gskwnn_53pnt.json` (540) | te doen |
| 10 | `drowned-villages` | `drowned-village` | `v3/zld_geocmd_vrddrppnt.json` (201) | te doen |
| 10b | `delta-works` | `delta-work` | `v3/zld_geocmd_chsdltwrkvln.json` (9) | te doen; licentie nakijken |
| 11 | `water-board-structures` | `water-board-structure` | `imwa_gemaal.json` (8.565), `imwa_sluis.json` (890), `imwa_stuw.json` (53.137) | te doen |

---

## Per dataset

In de veldtabellen staat per bronveld de regel. Velden onder "Niet overnemen" vallen onder R15.

### 1. Gemalen: `pumping-stations` (klaar)

Bron: RCE Landschapsatlas "Gemalen" (gegevens van de Nederlandse Gemalen Stichting), NGR `c81e0dd2-3e91-44af-aaeb-4dcfed4b8b56`, CC0. Sleutel `id` (gem_id), uniek. `CreativeWork`.

| Bronveld | Regel | Modellering |
|---|---|---|
| `naam_gemaal` | R2 | `name` (10× "Onbekend" → "<functie> in <plaats> (naam onbekend)") |
| `functie` | R3, R24 | `additionalType` `pumping-station-function`, plus `object-type:pumping-station`. `FUNCTION_SPLITS`: "Boezem- en Poldergemaal" (4×) → "Boezemgemaal" + "Poldergemaal" |
| `status` | R4 | `creativeWorkStatus` `pumping-station-status` |
| `stichtingsjaar` | R5 | `dateCreated` (1 onleesbaar, weggelaten) |
| `aandrijving_oorspronkelijk`, `aandrijving_huidig` | R3 | `dv:originalDrive`, `dv:currentDrive` → `drive-type` |
| `bescherming` | R3 | `dv:protectionStatus` → `protection-status` |
| punt, `plaats`, `provincie` | R7, R22 | `locationCreated` → `#location` → `locality` → `province`; `PROVINCES` corrigeert "Groninger", "Drente", "Noord-Braband". 38 zonder plaats → direct naar de provincie |
| `bemalingsgebied`, `lozend_op` | R11 | `dv:drainsArea` → `drained-area`, `dv:dischargesInto` → `receiving-water` |
| `id`, `monumentnr` | R14 | `#gemalenstichting-id`, `#rijksmonument-id` |
| `infolink` | R16 | `url` (gemalen.nl) |
| `foto_groot`, `foto_thumb`, `fotograaf` | R20 | `#image` |
| Niet overnemen | R15 | `objectid` |

### 2. Molens, bestaand: `windmills`

Bron: RCE Landschapsatlas "Molens", NGR `291afe4b-4f4b-497c-8026-fb437c4e9c7e`, PDM → CC0. `CreativeWork`.

**Sleutel (aanname, §28):** `TBGCNUMMER` (Ten Bruggencate); bij de 4 dubbelen (00706, 01244, 08814, "01110 kk") `<TBGCNUMMER>-<gid>`, gemeld in `report.json`.

| Bronveld | Regel | Modellering |
|---|---|---|
| `NAAM` | R2 | `name` |
| `CATEGORIE`, `TYPE`, `HFDFUNCTIE`, `FUNCTIE` | R3 | `windmill-category`, `windmill-type`, `windmill-function` (beide functievelden in dezelfde set), plus `object-type:windmill` |
| `STAAT` | R4 | `creativeWorkStatus` `windmill-status` |
| `BOUWJAAR` | R5 / R6 | `dateCreated` als het een zeker jaartal is, anders een event `#construction` |
| punt, `PLAATS` | R7 | `m.position()`; geen provincieveld → context `no-context` |
| `TBGCNUMMER`, `RMONNUMMER` | R14 | `#ten-bruggencate-id`, `#rijksmonument-id` |
| `INFOLINK` | R16 | `url` (allemolens.nl) |
| `FOTO_GROOT`, `THUMBNAIL`, `FOTOGRAAF` | R20 | `#image` |
| Niet overnemen | R15 | `gid` (tenzij als sleutel) |

### 3. Verdwenen molens: `lost-windmills`

Bron: RCE Landschapsatlas "Verdwenen molens" (uit molendatabase.org), NGR `7e41f6fa-936d-4fbe-b3b7-fb40dfe1283d`, CC0. Sleutel `molen_dbnr` (uniek). `CreativeWork`.

| Bronveld | Regel | Modellering |
|---|---|---|
| `molen_naam` | R2 | `name` |
| `hoofdcat`, `type`, `functie` | R3 | `windmill-category`, `windmill-type`, `windmill-function` (dezelfde sets als bij 2), plus `object-type:windmill` |
| `aandrijvin` | R3 | `drive-type` als de waarden dezelfde betekenis hebben als bij de gemalen, anders `windmill-drive` (beslissen bij de bouw, §22) |
| `status` | R4 | `creativeWorkStatus` `windmill-status` |
| `bouwjaar_1`, `bouwjaar_2` | R5 / R6 | alleen `bouwjaar_1` → `dateCreated`; beide → event `#construction` (start/eind) |
| `verdwenen1`, `verdwenen2` | R6 | event `#disappearance`. Bij de verzameljaren 1850 en 1929 een waarschuwing in `dv:dateText` (CONTEXT §9) |
| punt | R7 | `m.position()` zonder woonplaats (de laag heeft geen plaatsveld): `#location` met alleen coördinaten |
| `molen_dbnr`, `ten_brugge` | R14 | `#molendatabase-id`, `#ten-bruggencate-id` |
| `infolink` | R16 | `url` (molendatabase.org) |
| Niet overnemen | R15 | `ogc_fid` |

### 4. Droogmakerijen: `drained-lakes`

Bron: RCE Landschapsatlas "Droogmakerijen", NGR `cd53d540-f499-4850-8053-e1172c97372e`, CC0, en de laag "molens en gemalen in droogmakerijen" (licentie nakijken).

**Droogmakerij** (`drained-lake`, `Place`, sleutel `id`):

| Bronveld | Regel | Modellering |
|---|---|---|
| `poldernaam` | R2 | `name` |
| `nai_polder` | R3 | `additionalType` `drained-lake-type`, plus `object-type:drained-lake` |
| `datum_droo`, `periode` | R6 | event `#reclamation`. "1549" = "1550 en eerder" → `dv:dateText` "vóór 1550", precisie `voor` |
| `polderpeil` | nieuw | `dv:waterLevel` (tekst zoals in de bron, bijv. "-4 / -3"; eerst toevoegen aan het vocabulaire, §19) |
| geometrie | R8 | WKT op het record |
| `bron_data`, `bron_geo` | R18 | `citation` |
| Niet overnemen | R15 | `periodeid`, `shape_leng`, `shape_area` |

**Molen of gemaal in een droogmakerij** (`drained-lake-structure`, `CreativeWork`, sleutel `MolGemID`):

| Bronveld | Regel | Modellering |
|---|---|---|
| `naam` (140 van 561) | R2 | `name`; anders "<type> in <poldernaam> (naam onbekend)" |
| `type` | R3 | bronset `drained-lake-structure-type` (poldermolen, gemaal, ...), plus `object-type:drained-lake-structure` |
| `polderID` | R11 | `containedInPlace` → het `drained-lake`-record (dezelfde dataset) |
| punt | R7 | `#location` met alleen coördinaten (geen plaatsveld) |
| `monument_n`, `tenBruggec`, `ID_gemalen` | R14 | `identifier`s (koppeling met de molen- en gemalendatasets is fase 2) |
| Niet overnemen | R15 | `gid`; `poldernaam`, `poldertype`, `periode`, `periodeID`, `datum_droo`, `bron_geo` (herhaald van de droogmakerij) |

### 5. Landinrichting: `land-consolidation`

Bron: RCE Landschapsatlas "Landinrichting"; licentie nakijken. `Place` (projectgebied).

**Sleutel (aanname, §28):** `objectid` (uniek, maar een database-ID; gemeld als instabiel). `proj_num` is niet uniek (0 en 5276 meerdere keren) en is bij 12 projecten leeg.

| Bronveld | Regel | Modellering |
|---|---|---|
| `labelnaam`, `projnaam` | R2 | `name` = `labelnaam`; `projnaam` als `alternateName` als die anders is |
| `livorm_oms` | R3 | `land-consolidation-form`, plus `object-type:land-consolidation-project` |
| `status` | R4 | `dv:status` → `land-consolidation-status` |
| `jaarvoor`, `jaargoed`, `jaaruitv`, `jaarakte`, `jaarafsl` | R6 | events `#preparation`, `#approval`, `#execution`, `#deed`, `#completion`; 0 = geen event |
| `bropperv` | R21 | `QuantitativeValue`, ha (`unitCode` "HAR") |
| `provincie` | R9 | `containedInPlace` → `province` |
| geometrie | R8 | WKT |
| `proj_num`, `crnummer` | R14 | `identifier`s (als ze gevuld zijn) |
| Niet overnemen | R15 | `livorm` (code van `livorm_oms`), `klassiek`, `modulair` (eerst nakijken wat ze betekenen), `shape_*` |

### 6. Wielen: `breach-pools`

Bron: RCE Landschapsatlas "Wielen"; licentie nakijken. `Place`.

**Sleutel (aanname, §28):** `id` (uniek). `uniekeid` is maar 27× gevuld.

| Bronveld | Regel | Modellering |
|---|---|---|
| `naamwiel`, `altnmwiel` (424 en 20 van 1.266) | R2 | `name`, `alternateName`; anders "Wiel bij <plaats> (naam onbekend)" |
| `type` | R3 | bronset `breach-pool-type`, plus `object-type:breach-pool` |
| `ontstjaar` (8×) | R6 | event `#dike-breach`, alleen als > 0 |
| punt | R8 | `schema:geo` op het record |
| `plaats` | R9 | `containedInPlace` → `locality` (context `no-context`) |
| `hoofdstr`, `oever`, `dwarsdijk` | R11 / R19 | `hoofdstr` → `dv:nearRiver` → `river` (nieuw predicaat, §19); `oever` en `dwarsdijk` in de `description` |
| `bijzheid` | R19 | `description` |
| `foto_groot`, `foto_thumb` | R20 | `#image` |
| Niet overnemen | R15 | `hfdstrgeb`, `id_hfdstr`, `id_dwarsd`, `volgorde` (hulpnummers), `datbezoek` (datum van inventarisatie), `foto` (dubbel), `ontstwijze` (leeg) |

### 7. Zeeuwse dijken: `zeeland-dikes`

Bron: Provincie Zeeland, dijken, dammen en wallen, NGR `e5c91c39-8cff-435f-a45d-3218e4584d5c`, PDM → CC0. Sleutel `bron_id` (uniek). `CreativeWork`. Context van gedeelde plaatsen: Zeeland. `spatialCoverage` Zeeland.

| Bronveld | Regel | Modellering |
|---|---|---|
| `naam` (2.042 van 2.486) | R2 | `name`; anders "<oorspronkelijke functie> in <polder> (naam onbekend)" |
| `oorsprfunc`, `naspfunc` | R3 | `additionalType` `dike-function`; `naspfunc` → `dv:currentFunction` → `dike-function` (nieuw predicaat); plus `object-type:dike` |
| `status` | R4 | `creativeWorkStatus` `dike-status` |
| `aanleg_beg`, `aanleg_ein`, `aanleg_ind` | R5 / R6 | `dateCreated` alleen als begin = eind; anders event `#construction`. `aanleg_ind` is een indicatiejaar: in `dv:dateText` |
| `verdwenen` | R6 | event `#disappearance` |
| `polder` | R11 | `dv:inPolder` → `place:polder:zeeland:<naam>` (nieuw predicaat) |
| `herkomst` | R3 | `dv:origin` → term `dike-origin` (eerst nakijken wat de waarden zijn) |
| geometrie | R8-variant | lijn als WKT op het record (een dijk is een gebouwd object met een lijngeometrie, geen `#location`) |
| `bijzonderh`, `bijzonderh_uitg` | R19 | `description` (de uitgebreide versie als die er is) |
| `bron_geo`, `bron_data`, `bron_data_uitg` | R18 | `citation` |
| `afbeelding` | R20 | `#image` (eerst nakijken: URL of bestandsnaam) |
| `bron_id` | R14 | `#source-id` |
| Niet overnemen | R15 | `fid`, `objectid`, `rce_zone` (eerst nakijken), `waternaam` (leeg), `gdb_geomattr_data` |

### 8. Zeeuwse polders: `zeeland-polders` en `zeeland-polder-names`

**Polders per bedijkingsperiode** (7 lagen, NGR `bfcfbdbf-0c42-4333-93eb-742ab69b9a75`, PDM → CC0). Sleutel `code` (GEO-…, stabiel); een meerdelige polder is één record. `Place`. Bron-URI via `zld_code_uri`.

| Bronveld | Regel | Modellering |
|---|---|---|
| `naam` | R2 | `name` |
| — | R3 | `object-type:polder`; de periodelaag zelf (bijv. "1300–1421") in het event |
| `periodevan` | R6 | event `#embankment` via `parse_period` |
| `gemeente` | R9 | `containedInPlace` → `municipality` (context Zeeland) |
| `plaats`, `straat` | R10 | `address` (de plek van het rapport of object; niet als woonplaats) |
| `reportlink` | R17 | `subjectOf` → `#report` |
| geometrie | R8 | WKT (de delen samengevoegd) |
| Niet overnemen | R15 | `objectid`, `id` (leeg), `subcode`, `indivcode`, `nr` (zit in `code`), `periodetot` (leeg) |

**Poldernamen** (licentie nakijken): sleutel `objectid` (instabiel, melden). `Place`.

| Bronveld | Regel | Modellering |
|---|---|---|
| `naam` | R2 | `name` |
| `indijking` | R6 | event `#embankment` |
| geometrie | R8 | WKT |
| Niet overnemen | R15 | `objectid_1`, `shape_leng`, `gdb_geomattr_data` |

### 9. Geschenkwoningen: `gift-houses-1953`

Bron: Provincie Zeeland, geschenkwoningen, NGR `a04a860d-296d-45c2-8fc0-2e34750c5c90`, CC0. `CreativeWork`.

**Sleutel (aanname, §28):** `objectnummer`; de 2 dubbelen (EG006, ZH237, telkens hetzelfde adres) worden samengevoegd tot één record en gemeld.

| Bronveld | Regel | Modellering |
|---|---|---|
| — | R2 | `name` = "Geschenkwoning <straat> <huisnummer>, <plaats>" (opgebouwd; de bron heeft geen naam) |
| — | R3 | `object-type:gift-house` |
| `hoofdvorm` | R3 | `dv:houseForm` → `house-form` (nieuw predicaat) |
| `gevels_materiaal`, `dakbedekking_kleur` | R3 | `material` → `material` (dakbedekking: eerst nakijken of het een materiaal is of alleen een kleur) |
| `kleur_gevels` | R19 | in de `description` (een kleur is geen materiaal) |
| `datering` | R5 | `dateCreated` |
| `status` | R4 | `creativeWorkStatus` (eerst nakijken: monumentstatus of staat) |
| `land_van_herkomst` | R13 | `dv:donatedBy` → `place:country:<land>` (nieuw predicaat) |
| punt, `straat`, `huisnummer`, `huisnummer_toevoeging`, `postcode`, `plaats`, `gemeente`, `provincie` | R7, R10 | `m.position()` met het volledige adres; gemeente als `municipality` |
| `stedenbouwkundige_situatie`, `herkenbaarheid_woning`, `wijzigingen_object`, `herkenbaarheid_ensemble`, `wijzigingen_ensemble`, `bijgebouwen`, `opmerkingen` | R19 | één `description`, elk deel met zijn label |
| `fotoa`, `fotob`, `fotoc` | R20 | `#image-1..3` (eerst nakijken: URL of bestandsnaam) |
| `objectnummer` | R14 | `#inventory-id` |
| Niet overnemen | R15 | **`eigenaar`** (persoonsgegevens, §23), `objectid`, `aantal_fotos_met_fotonummer`, `fotoens` (leeg), `datum_inventarisatie` (hoogstens later als `sdDatePublished`-bron; nu niet) |

De koppeling met de BAG is fase 2.

### 10. Verdronken dorpen en Deltawerken: `drowned-villages`, `delta-works`

**Verdronken dorpen** (NGR `6eb9a0b2-b751-40a3-9a7d-5f3ed9d78a8b`, PDM → CC0). Sleutel `id` (uniek). `Place`.

| Bronveld | Regel | Modellering |
|---|---|---|
| `naam`, `naam2`–`naam4` | R2 | `name`, `alternateName` |
| — | R3 | `object-type:drowned-village` |
| `periode` | R6 | event `#drowning` via `parse_period` |
| punt (al WGS84 in de oogst) | R8 | `schema:geo` op het record |
| `gemeente` | R9 | `containedInPlace` → `municipality` (de huidige gemeente) |
| `archis3_nu`, `archis2` | R14 | `#archis-id`, `#archis2-id` |
| `referentie`, `refid` | R18 | `citation` (eerst nakijken: literatuurnummer of tekst) |
| Niet overnemen | R15 | `objectid`; `nieuwe_x`, `nieuwe_y`, `x_scez`, `y_scez` (zitten al in de geometrie); `is_gelijk`, `zaa`, `polygoon`, `selectieli` (eerst nakijken wat ze betekenen) |

**Deltawerken** (licentie nakijken). Sleutel `code`. `CreativeWork`. Zelfde opbouw als de polders (8): `periodevan` → `dateCreated` (R5) als het een jaartal is, anders event `#construction`; `gemeente` R9; `plaats`/`straat` R10; `reportlink` R17; lijn als WKT. `object-type:delta-work`; de soort (dam, kering) alleen als de bron het zegt.

### 11. IMWA-kunstwerken: `water-board-structures`

Bron: Het Waterschapshuis, IMWA kunstwerken (PDOK, OGC API), **CC BY-SA 4.0**. Sleutel `id` (NL.WBHCODE…). `CreativeWork`. Groot (62.592 records); kijk of één dataset per soort (gemaal, sluis, stuw) handiger is.

| Bronveld | Regel | Modellering |
|---|---|---|
| `naam` (vaak leeg) | R2 | `name`; anders "<soort> <code> (naam onbekend)" |
| soort (bestand) | R3 | `object-type:pumping-station`/`lock`/`weir`. Het gemaal heeft dezelfde eigen term als in dataset 1, dus beide datasets delen hem |
| `functie` | R3 | `imwa-function` |
| `status` | R4 | `creativeWorkStatus` `imwa-status` |
| `waterbeheerder` | R12 | `maintainer` → het waterschap als `Organization` (gesloten set; `sameAs` uit `waterBoardLabelToQid`) |
| `capaciteit` | R21 | `QuantitativeValue` (eenheid eerst nakijken in de IMWA-documentatie) |
| `lon`, `lat` | R7 | `#location` met alleen coördinaten |
| `code` | R14 | `#water-board-code` |
| `uri` | — | `prov:wasDerivedFrom` |

---

## Fase 2: links tussen de datasets (later)

Elke soort link wordt een **eigen linkset-dataset**: VoID, met per link de methode en `prov:wasDerivedFrom`, en een eigen beschrijving in de catalogus. Waar het kan, hergebruiken we de logica uit `prototype/datalayer/build_v3.py`:

- **Bestaande regels, tussen de nieuwe URI's:**
  - historisch gemaal ↔ IMWA (gedeeld naamwoord, ≤ 300 m, "In bedrijf");
  - verdwenen molen ↔ Wikidata (P2903);
  - polder ↔ Wikidata;
  - geschenkwoning ↔ BAG (`pdok_giftaddresses.json`);
  - molen/gemaal ↔ rijksmonument (`rce_monument_uris.csv`).
- **Via identificatienummers (R14):** molen in droogmakerij ↔ molen (Ten Bruggencate), gemaal in droogmakerij ↔ gemaal (`ID_gemalen`).
- **Ruimtelijk** (`in_geom`, `km`):
  - molen/gemaal ligt in polder of droogmakerij;
  - wiel bij dijk;
  - verdronken dorp in polder;
  - eventueel de provincie bij records zonder provincieveld (open vraag).
- **Gedeelde plaatsen** (`drained-area`, `receiving-water`, `polder`, `locality`, ...) koppelen aan echte gebieden (IMWA-afvoergebieden, onze polders, BAG-woonplaatsen, Wikidata). Alleen bij een eenduidige naam plus ligging, na review via `sameAs` of als linkset.

## Open punten

Bijna alles is beslist met aannames (DECISIONS §28): sleutels, provincie zonder provincieveld (niet afleiden), onduidelijke velden (niet overnemen), termreview. Wat overblijft:
- **E-mailadres voor het contactpunt** van het team (§2). Dat kan alleen Jari geven.
- **Licenties** van landinrichting, wielen, molens/gemalen in droogmakerijen, poldernamen en Deltawerken: nakijken bij de bouw. Geen open licentie gevonden: niet bouwen.
- Bij hosting: `BASE` naar HTTPS, URI's laten resolven (HTML + RDF), registreren in het Datasetregister, de lagen aanbieden aan RCE en Provincie Zeeland.
- Eventueel een DCAT-AP-NL-versie van de catalogus naast de schema.org-versie (§17).
