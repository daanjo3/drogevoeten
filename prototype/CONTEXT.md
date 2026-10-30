# Droge Voeten: projectcontext voor het team

Dit bestand bundelt alles wat nodig is om over het prototype Droge Voeten te praten, ook met Claude. Upload het in een Claude-gesprek of -project (eventueel samen met `README.md` en `REACTIE_OP_FEEDBACK.md`) en stel je vragen. Het is zo geschreven dat het zonder de rest van de code te begrijpen is.

**Status:** prototype ronde 3 (v3), gebouwd op 28 oktober 2026. Gekopieerd op 30 oktober 2026 uit `~/Projects/hackalod_2026/ideas/v3/02_droge_voeten/` (Jari's lokale ideeënmap, niet in git) naar `prototype/` in deze repo.

**Andere documenten in deze map:**
- `README.md`: de volledige v3-beschrijving (pitch, datasets, linkbewijs, aansluiting op de uitdaging, draaien, risico's, volgende stappen).
- `REACTIE_OP_FEEDBACK.md`: per feedbackpunt op ronde 2 wat er in v3 veranderde.
- `proofs/`: queries en echte uitkomsten die de links bewijzen.

> **Let op paden:** README en Makefile noemen nog `cd v3/02_droge_voeten`. In deze repo is dat `prototype/`.

---

## 1. Waar gaat het over?

### De HackaLOD 2026-uitdaging

Georganiseerd door het Netwerk Digitaal Erfgoed (NDE), in de Nieuwe Kerk in Middelburg. Samenvatting van `De uitdaging.pdf` (10 september 2026):

- Bouw een toepassing die de waarde van **verbonden erfgoedinformatie** zichtbaar maakt.
- Gebruik **minstens twee open** erfgoedcollecties of erfgoedgerelateerde bronnen.
- Verbind ze met **linked-data-technieken**.
- Eindgebruikers moeten er iets aan hebben **zonder linked data te begrijpen**.
- Vorm is vrij: app, AR/VR, visualisatie, chatbot, game, installatie.
- Bij voorkeur datasets uit het **NDE Datasetregister** (ca. 600 linked-data-datasets).
- **Bonuspunten:**
  - architectuur volgens de NDE-visie "Van data naar dienst": een **datalaag** gescheiden van een **presentatielaag**, met een duidelijk **koppelvlak** ertussen;
  - het **netwerk verder brengen**: nieuwe linksets of datasets teruggeven.
- De jury let op maatschappelijke relevantie, aantrekkelijkheid, interessantheid en prikkeling.
- Code en nieuwe data moeten open beschikbaar zijn (bijvoorbeeld op GitHub).
- Een Zeeland-link is mooi meegenomen, niet verplicht.

### Het idee in één zin

Typ je adres en krijg vier antwoorden: hoe diep je woont, wie hier pompt, hoe deze plek droog werd en hoe hoog het water kan komen. Daarna zie je die waterhoogte in AR in je eigen kamer.

### Waarom dit onderwerp

- Een kwart van Nederland ligt onder zeeniveau, maar bijna niemand weet hoe zijn eigen straat droog is geworden of wie hem nu droog houdt.
- Klimaatadaptatie en waterschapsverkiezingen: mensen stemmen voor waterschappen zonder te weten wat die doen.
- Toon: geen rampenfilm. Het verhaal is "wie beschermt je, en hoe is dat zo gekomen", niet angst.

---

## 2. Geschiedenis: drie rondes

Het prototype is in drie rondes gebouwd door AI-agents (Claude) in opdracht van Jari, steeds na feedback. In de ideeënmap stonden in ronde 1 en 2 ook andere ideeën (o.a. "Waar het water nam", "Peilschaal", "Wat stond hier?", "Water als wapen", "Het onmogelijke boeket"). Alleen Droge Voeten ging door naar ronde 3.

### Ronde 1 (26 oktober 2026)

- Adres → hoogte t.o.v. NAP, het gemaal dat nu pompt, waterstaatserfgoed in de buurt.
- **"Wie beslist":** de stamboom van waterschappen op Wikidata (P1366 "vervangen door"). Rijnland heeft 195 voorgangers, Scheldestromen maar 3: het "Zeeuwse gat" in de linked data.
- Bronnen: RCE Rijksmonumenten (856 waterstaatsmonumenten), Wikidata, IMWA (actuele kunstwerken van waterschappen, via PDOK), BAG, AHN.
- Teruggegeven: `linkset.ttl` (RCE ↔ IMWA, RCE ↔ waterschap) en 88 Wikidata-voorstellen voor P137 (beheerder).

### Ronde 2 (27 oktober 2026)

**Feedback op ronde 1:**
1. "Wat bedoel je met 'erfgoed dat deze plek droog houdt'?"
2. "Werken al die oude molens nog echt om mijn voeten droog te houden, of deden ze dat vroeger?"
3. "Een kaartfunctie zou mooi zijn: welk waterschap beheert welk water?"
4. "Kun je simuleren wat het uitzetten van een gemaal doet? Het moet realistisch zijn. Ik wil niet dat je dingen verzint."
5. AR-idee: kijk rond in je kamer en zie hoe hoog het water zou komen.

**Wat ronde 2 deed:**
- Elk monument kreeg een statuslabel: *werkt nu mee* (287), *werkte vroeger* (113), *onbekend* (330), *geen werktuig* (126). Alleen letterlijke bronuitspraken tellen (Molendatabase, IMWA met naamovereenkomst, RCE-tekst, Wikidata museum). Logica in `datalayer/status.py`.
- Kaart met 9 lagen: waterschapsgrenzen, peil- en bemalingsgebieden, gemalen, erfgoed, AHN, LIWO, Klimaateffectatlas, Zeeland 90 mm.
- **Rekenvoorbeeld "gemaal uit"**, nadrukkelijk geen model: gebiedsoppervlak × natste KNMI-dag ÷ pompcapaciteit = hoe lang wegpompen duurt. Bewust **niet** berekend: hoe hoog het water in je straat komt (daarvoor ontbreken streefpeil, kwel, hydrologisch model).
- AR alleen als concept beschreven.
- Teruggegeven: `status.ttl`, linkset RCE → Molendatabase (392), 384 Wikidata-voorstellen voor P5817 (staat van gebruik).

### Ronde 3 (28 oktober 2026): het huidige prototype

**Feedback op ronde 2 en vragen van het team:**
1. **Meer verhaal en context:** "er is vast meer data die de molens en het watersysteem context geeft: hoe dingen tot stand kwamen, en wie de opdracht gaf." Concreet: een tijdlijn per adres, een tijdschuif op de kaart, een Zeeland-verdieping, meer linksets.
2. **Rust:** in v2 kwam te veel tegelijk op de gebruiker af. Eis: "wel compleet, maar niet overweldigend".
3. **AR die echt werkt**, met LIWO, 1953 en NAP.

**Keuzes van Jari vooraf (interview vóór de bouw):**
- AR: alle drie de lagen (LIWO, 1953, NAP) met een schakelaar.
- Scope: tijdlijn per adres, tijdschuif, Zeeland-verdieping, Wikidata-voorstellen en linksets.
- Opzet: "één antwoord + doorklikken", mobiel eerst.
- HTTPS voor WebXR komt van Cloudflare voor `https://vps.maijenburg.dev`; de gateway (Caddy) is niet aangepast.

---

## 3. Wat het v3-prototype doet

### Webapp (`app/index.html`)

1. **Vier zinnen**, elk met een knop "Waarom?" (bron + kanttekening). Voorbeeld Middelburg:
   - "Je voordeur ligt 2,0 m boven zeeniveau (NAP)."
   - "Gemaal Boreel pompt het water uit jouw peilgebied weg, in opdracht van Scheldestromen."
   - "Deze plek werd ingedijkt in de 11e/12e eeuw (Polder Walcheren)."
   - "Bij een dijkdoorbraak blijft het hier volgens LIWO droog."
2. **Hooguit één callout**, de meest bijzondere: geschenkwoning, oude dijk of wal vlakbij (met link naar de kaart van 1560), of 1953.
3. **Knop** "Bekijk het water in je kamer" (naar AR).
4. **Tijdlijn "Hoe werd dit droog?"**: zes stappen met "toon meer". Elke stap heeft een jaartal, een bron en een zekerheidslabel (*ca.*, *uiterlijk*, *periode*, *eeuw*, *zie bron*, *onbekend*). De oorspronkelijke jaartekst blijft zichtbaar ("11e/12e eeuw", "Voor 1300"). "Vandaag" en "Risico" staan altijd onderaan. Ontbreekt iets, dan staat er een gestippelde stap "onbekend voor deze plek". **Er wordt nooit iets ingevuld.**
5. **Uitklappers** met alles uit ronde 2: erfgoed in de buurt (statuslabels), rekenvoorbeeld "gemaal uit", overstroming in detail, wie beslist, onder de motorkap (alle URI's).
6. **Kaart met vier thema's:**
   - **Nu:** waterschappen, gemalen, erfgoed;
   - **Tijdreis:** tijdschuif 1600–nu met afspeelknop; ~21.000 molens en gemalen verschijnen en verdwijnen; polders en droogmakerijen kleuren mee; grafiek per decennium;
   - **Risico:** LIWO per kansklasse;
   - **Zeeland:** dijken naar aanlegjaar (klik → beschrijving en literatuur live van de provincie), verdronken dorpen, geschenkwoningen, historische kaarten (1560, Hattinga ca. 1750, Pourbus 1571).
   - "Alle kaartlagen" blijft beschikbaar.
7. Licht/donker thema, laad-skeletons, foutmeldingen in gewone taal.

**Tijdlijnbronnen en methode:**

| Stap | Bron | Methode |
|---|---|---|
| Indijking | Provincie Zeeland: polders per bedijkingsperiode (595 vlakken), poldernamen (658) | punt-in-vlak |
| Droogmaking | RCE Landschapsatlas, droogmakerijen (245) | punt-in-vlak |
| Dijken en wallen | Provincie Zeeland (2.486) | binnen 250 m |
| Molens die hier stonden | RCE verdwenen molens (17.119) en bestaande molens (1.872) | binnen 1 km |
| Gemalen | RCE / Nederlandse Gemalenstichting (2.663) | dichtstbijzijnde 3 binnen 3 km |
| Waterstaatskaart | RWS/RCE, kaartblad 1e editie (alleen link) | punt-in-vlak |
| Ruilverkaveling | RCE Landschapsatlas (604) | punt-in-vlak |
| Doorbraakkolken (wielen) | RCE (1.266) | binnen 1 km |
| Verdronken dorpen | Provincie Zeeland (201) | binnen 3 km |
| 1953 | Provincie Noord-Brabant, inundatiekaart | punt-in-vlak |
| Geschenkwoning | Provincie Zeeland (540) | exact BAG-adres |
| Vandaag en risico | IMWA, waterschapsgrenzen, LIWO | live per adres |

De stralen (1 km, 3 km) zijn keuzes, geen bemalingsgebieden. De app zegt daarom "in de buurt", niet "jouw molen".

### AR (`app/ar.html`)

- WebXR `immersive-ar` met hit-test: tik één keer op de vloer. Een halfdoorzichtig watervlak (30 × 30 m) stijgt in 2,6 s naar de hoogte, met een label (getal + bron). Direct bij `prefers-reduced-motion` of `instant=1`.
- **Schakelaar met drie lagen:**
  - **LIWO:** maximale waterdiepte bij een dijkdoorbraak, per kansklasse.
  - **1953:** alleen waar een open bron bestaat (zie hieronder).
  - **NAP:** zeeniveau = 0 m NAP min de AHN-hoogte. In Hoofddorp hangt dat 3,56 m boven je vloer.
- **Verdieping** kiesbaar (begane grond, 1e, 2e), met 2,80 m per verdieping en de begane grond op maaiveld. Beide vereenvoudigingen staan in de app.
- Na de animatie: kaartje **"Wie houdt dit water tegen?"** met het waterschap, het dichtstbijzijnde en het grootste gemaal binnen 3 km.
- **Zonder AR** (desktop, iPhone): een 3D-kamer met dezelfde vlakken, een deur van 2,10 m, een persoon van 1,80 m en een meetlat van 3 m.
- three.js r170 en Leaflet 1.9.4 zitten lokaal in `app/vendor/` (geen CDN).

**1953, wat er wel en niet is:**
- De enige open inundatiekaart van 1953 is die van de **Provincie Noord-Brabant** (19 vlakken, 8 zout, 11 zoet, geen dieptes).
- Rijkswaterstaat heeft gemeten zeewaterstanden van 1 februari 1953 per getijstation (bijv. Vlissingen NAP +4,53 m, Willemstad NAP +4,21 m), afgelezen van registratiebladen; de echte top kan ertussen liggen.
- **In "zout" overstroomd gebied** tekent de app een lijn op de zeewaterstand van het dichtstbijzijnde station, met de vereenvoudiging erbij.
- **In "zoet" gebied** geen lijn: de oorzaak staat niet in de bron.
- **Overal elders, ook in heel Zeeland:** "Geen betrouwbare bron voor deze plek." Een Zeeuwse 1953-inundatiekaart is niet als open data gevonden (de Zeeuwse laag "Verdronken gebied" is één inlaag bij Zierikzee, geen 1953-kaart).

### Demoverhaal (4 minuten)

| Adres (URL relatief aan de app) | Wat je laat zien |
|---|---|
| `app/?q=Abdij%204,%20Middelburg` (HackaLOD-locatie, ook `&kaart=zeeland`) | Vier zinnen; callout "Je staat 40 m van de Ringwalburg, aangelegd tussen 840 en 900"; kaart van 1560 met de ronde burcht; tijdlijn met stadswal (1304–1331), Oud-Arnemuiden, Waterstaatskaart (1872), Gemaal Boreel (1929) |
| `app/?q=Koningin%20Maudplein%201,%20Nieuwerkerk` | "Je huis is een geschenk uit Noorwegen" (geschenkwoning 1953, via BAG); ruilverkaveling Schouwen-Duiveland (1954) |
| `app/?q=Elisabethweg%202,%20Heijningen` en `app/ar.html?q=Elisabethweg%202,%20Heijningen&laag=1953` | 1953-overstroming (Noord-Brabant); in AR staat het vlak 3,52 m boven de vloer (Willemstad NAP +4,21 m) |
| `app/?q=Middenweg%2068a,%20Middenbeemster&kaart=tijd&jaar=1850` | Drooggemaakt 1612; tijdschuif: molens verdwijnen, gemalen verschijnen; de grafiek waarschuwt zelf voor de piek in 1850 |
| `app/?q=Nieuwburen%201,%20Lemmer` | Woudagemaal (1915, stoom), via de Gemalenstichting gekoppeld aan het huidige register |
| `app/ar.html?q=Hoofdweg%20569,%20Hoofddorp` | Zeeniveau hangt 3,56 m boven de vloer |

**URL-parameters:** `kaart=nu|tijd|risico|zeeland`, `jaar=1600..2026`, `data=<ander koppelvlak>`; op de AR-pagina ook `lat`, `lon`, `q`, `laag=liwo|1953|nap`, `instant=1`.

**Publieke versie:** `https://vps.maijenburg.dev/v3/droge-voeten/app/` (AR: `…/app/ar.html`). Hier staan ook v1 en v2 onder `/v1/…` en `/v2/…`, met een landingspagina op `/`.

---

## 4. Architectuur

Opgezet volgens "Van data naar dienst": de datalaag oogst, linkt en publiceert; de presentatielagen lezen alleen het koppelvlak plus open, CORS-vrije diensten.

```
bronnen (WFS/WMS/SPARQL/OGC API)
   │  datalayer/fetch.py, fetch_status.py, fetch_v3.py   → data/raw/   (oogstcache, ~80 MB)
   │  datalayer/status.py                                 (statusregels ronde 2)
   │  datalayer/build.py, build_v3.py                     → data/build/ (koppelvlak + bijdragen, ~22 MB)
   ▼
koppelvlak: data/build/droge-voeten.jsonld (+ history-areas.json, history-points.json, zeeland.json)
   │
   ├─ presentatie 1: app/index.html (web; main.js, timeline.js, mapview.js)
   ├─ presentatie 2: app/ar.html (AR/3D; ar.js)
   │     beide via de gedeelde module app/lib/core.js
   └─ presentatie 3: datalayer/whokeeps.py (terminal, uit ronde 2)
```

**Belangrijke bestanden:**

| Pad | Wat |
|---|---|
| `datalayer/fetch.py` | oogst ronde 1: RCE, Wikidata, IMWA |
| `datalayer/fetch_status.py` | oogst ronde 2: Wikidata P5817/P366/molen-ID's, Molendatabase, KNMI |
| `datalayer/fetch_v3.py` | oogst ronde 3: RCE Landschapsatlas, Zeeland, Brabant 1953, RWS 1953, PDOK-geocodering, Wikidata |
| `datalayer/status.py` | regels voor de statuslabels |
| `datalayer/services.py` | catalogus van kaartdiensten (gaat mee in het koppelvlak) |
| `datalayer/build.py` | ronde-2-koppelvlak, `linkset.ttl`, `status.ttl`, P137/P5817-voorstellen |
| `datalayer/build_v3.py` | ronde 3: `history-*.json`, `zeeland.json`, `linkset-v3.ttl`, `events.ttl`, P571/P576-voorstellen, DCAT-beschrijving. Draait altijd ná `build.py` |
| `datalayer/proofs_v2.py`, `proofs_v3.py` | schrijven de bewijsbestanden in `proofs/` |
| `datalayer/whokeeps.py` | terminalclient over hetzelfde koppelvlak |
| `datalayer/snapshot.sh` | data inpakken en terugzetten |
| `app/lib/core.js` | gedeelde datatoegang: koppelvlak laden, PDOK-geocodering, IMWA, geometrie (punt-in-vlak, afstand) |
| `queries/*.rq` | SPARQL voor RCE en Wikidata |
| `data/dataset-description.jsonld` | datasetbeschrijving (ronde 2); de v3-versie staat in `data/build/` |

**Koppelvlak, globaal:**
- `droge-voeten.jsonld`: `monuments` (met status en bewijs), `waterBoards`, `currentWaterBoards`, `waterBoardLabelToQid`, `statusVocabulary`, `rainStations` (KNMI), `services` (kaartlagen), `v3`.
- `history-areas.json`: vlakken voor de tijdlijn (polders, droogmakerijen, landinrichting, kaartbladen, 1953).
- `history-points.json`: molens (verdwenen en bestaand), gemalen, wielen, decennia-statistiek.
- `zeeland.json`: dijken, verdronken dorpen, Deltawerken, geschenkwoningen.
- Elk bestand heeft `licenses`, `featureUriTemplate` en `linkTemplates`, zodat elk object terug te voeren is op een bron-URI.

**Afspraken in de code:**
- Python alleen standaardbibliotheek, altijd gedraaid met `python3 -I` (de ruwe downloads zijn onbetrouwbare invoer).
- Webapp zonder bouwstap of npm; ES-modules.
- Alleen relatieve URL's, want de app draait achter een gateway onder `/v3/droge-voeten/`.
- Alle tekst in de app en de documentatie in het Nederlands; code en commentaar in het Engels.

---

## 5. Datasets

### Nieuw in ronde 3 (gecontroleerd op 28-10-2026)

| Bron | Uitgever | Toegang | Rol |
|---|---|---|---|
| Landschapsatlas: gemalen (2.663) | RCE / Nederlandse Gemalenstichting | WFS `https://services.rce.geovoorziening.nl/landschapsatlas/wfs` | stichtingsjaar, aandrijving toen/nu, status, link naar gemalen.nl |
| Landschapsatlas: verdwenen molens (17.119) | RCE (uit molendatabase.org) | idem | bouw- en verdwijnjaar, Ten Bruggencate-nr |
| Landschapsatlas: molens (1.872) | RCE | idem | bouwjaar, monumentnummer |
| Landschapsatlas: droogmakerijen, landinrichting, wielen, Waterstaatskaart-bladwijzer | RCE | idem | tijdlijn |
| Cultuurhistorie Zeeland: dijken, polders per bedijkingsperiode, poldernamen, verdronken dorpen, geschenkwoningen, Deltawerken | Provincie Zeeland | WFS `https://opengeodata.zeeland.nl/geoserver/wfs` | Zeeland-verdieping, tijdlijn |
| Historische kaarten 1560, Hattinga, Pourbus | Provincie Zeeland | WMS `https://opengeodata.zeeland.nl/geoserver/wms` | ondergrond |
| Historische Inundatie Ramp 1953 | Provincie Noord-Brabant | GeoJSON-download via atlas.brabant.nl | 1953 in tijdlijn en AR |
| Waterhoogte 1953, 6 getijstations | Rijkswaterstaat | DDL API (waterwebservices) | 1953-waterstand |
| Wikidata P2903, Zeeuwse polders | Wikimedia | `https://query.wikidata.org/sparql` | links en voorstellen |
| PDOK Locatieserver | Kadaster | `https://api.pdok.nl/bzk/locatieserver/search/v3_1/` | adres → coördinaat en BAG-URI |

### Uit ronde 1 en 2 (nog in gebruik)

RCE Rijksmonumenten (SPARQL, in het NDE Datasetregister), Wikidata (P359, waterschappen), Nederlandse Molendatabase, IMWA kunstwerken en waterbeheergebieden (PDOK), waterschapsgrenzen (PDOK), AHN (PDOK), LIWO (Rijkswaterstaat/Deltares), Klimaateffectatlas, Klimaat Zeeland (90 mm), KNMI-daggegevens.

Volledige URL's en licenties: `README.md` sectie 2 en `datalayer/services.py`.

### Bewust niet gebruikt

- **gemalen.nl:** heeft per gemaal de ontwerper, maar geen open licentie. Niet gescrapet; alleen de link.
- **Polderarchieven** (opendata.archieven.nl, CC0, bijv. Zeeuws Archief toegang 3001 "Polder Walcheren"): geen betrouwbare automatische koppeling polderarchief ↔ poldervlak gevonden.
- **Waterstaatskaart:** JPG's niet gegeorefereerd, alleen als link.
- Gevonden maar niet onderzocht/ingebouwd: REPUBLIC (resoluties Staten-Generaal), Fotoarchief Rijkswaterstaat, Delpher (API op aanvraag), HisGIS/kadaster 1832, Topotijdreis.

### Bevindingen over bestaande bronnen

- **Wikidata is dun op ontstaansgeschiedenis:** van 2.009 Nederlandse polders hebben er 78 een stichtingsdatum en 0 een stichter of opdrachtgever.
- **RCE-monumentdata** heeft geen gestructureerde opdrachtgever of architect, alleen vrije tekst.
- **Het NDE Datasetregister** bevat bijna geen waterstaatsdatasets.
- **"Wie gaf de opdracht?"** (de vraag van het team) is daarom nog grotendeels open.

---

## 6. Linked data: hoe het verbonden is en wat we teruggeven

### Voorbeeldketen: Woudagemaal (rijksmonument 25772)

| Dataset | URI | Koppeling |
|---|---|---|
| RCE Rijksmonumenten | `https://linkeddata.cultureelerfgoed.nl/cho-kennis/id/rijksmonument/47128` | monumentnummer 25772 (let op: het getal in de URI is níet het monumentnummer) |
| Wikidata | `wd:Q1121835` | P359 = 25772 |
| RCE Landschapsatlas, gemalen | feature `gemalen.670` (1915, stoom → stoom) | `monumentnr` 25772 |
| Gemalenstichting | `https://gemalen.nl/gemaal_detail.asp?gem_id=369` | `schema:subjectOf` |
| IMWA (huidig register) | `https://api.pdok.nl/hwh/waterschappen-kunstwerken-imwa/ogc/v2/collections/gemaal/items/5d14050a-03ee-5cc6-be05-0860cd3aa8fd` | `skos:closeMatch` (naam + afstand) |

### Links die de datalaag maakt (`data/build/stats-v3.json`)

| Link | Methode | Aantal |
|---|---|---|
| Rijksmonument ↔ molenrecord | monumentnummer → RCE-URI via SPARQL | 1.236 |
| Rijksmonument ↔ gemalen.nl | `monumentnr` in de gemalenlaag | 80 |
| Historisch gemaal ↔ IMWA | gedeeld naamwoord, ≤ 300 m, alleen "In bedrijf" | 1.519 |
| Verdwenen molen ↔ Wikidata | P2903 = molendatabase-nummer | 186 |
| Zeeuwse polder ↔ Wikidata | unieke naam én coördinaat in/bij de contour | 207 |
| Geschenkwoning ↔ BAG | exacte straat + huisnummer + woonplaats | 507 van 540 |

Plus uit ronde 1/2: RCE ↔ Wikidata (856/856), RCE ↔ IMWA (191, waarvan 88 met naamovereenkomst), RCE ↔ waterschap (854), RCE ↔ Molendatabase (392).

### Wat we teruggeven aan het netwerk (alles in `data/build/`)

- `linkset-v3.ttl`: 6 linksets, ~3.700 links (VoID). Plus `linkset.ttl` uit ronde 1/2.
- `events.ttl`: de tijdlijn als dataset, 21.374 `schema:Event`'s (molens gebouwd/verdwenen, gemalen gesticht, dijken, indijkingen, droogmakingen, landinrichtingen, geschenkwoningen). Elk event heeft de oorspronkelijke jaartekst, een nauwkeurigheidslabel en `prov:wasDerivedFrom` naar het bronobject.
- `status.ttl`: staat van gebruik van waterstaatsmonumenten (ronde 2).
- **Wikidata-QuickStatements, niet geüpload, eerst reviewen:**
  - `wikidata_P571_polders.qs`: 194× P571 (indijking) voor Zeeuwse polders, met het provinciale rapport als referentie;
  - `wikidata_P571_P576_molens.qs`: 140× P571 en 139× P576 voor verdwenen molens;
  - `wikidata_P5817_suggestions.qs` (384×) en `wikidata_P137_suggestions.qs` (88×) uit eerdere rondes.
- `proofs/v3_wikidata_date_conflicts.tsv`: 21 jaartalconflicten tussen Wikidata en de RCE-laag.
- `dataset-description.jsonld`: schema.org + DCAT-beschrijving van 6 datasets, klaar voor het NDE Datasetregister.
- De bevinding dat er geen open 1953-inundatiekaart van Zeeland is, en dat Scheldestromen op Wikidata maar 3 voorgangers heeft.

**Stabiele URI's:** RCE- en Zeeuwse lagen gebruiken `GetFeature&featureID=…`. De Zeeuwse CHS-polderlagen hebben alleen instabiele GeoServer-ID's; daar selecteert de URI op het vaste veld `code` (`CQL_FILTER=code='GEO-2049'`).

---

## 7. Zelf draaien

### Data terughalen (niet in git)

`data/raw/` (~80 MB), `data/build/` (~22 MB) en `snapshots/` staan in `.gitignore`. Na een verse clone heeft de app dus **geen data**. Drie routes:

```bash
cd prototype
make restore SNAPSHOT=<bestand.tar.zst of URL>   # exact de demodata (aanbevolen)
make harvest                                     # alles opnieuw oogsten en bouwen (~25 min, netwerk; aantallen kunnen afwijken)
make build                                       # alleen data/build/ uit data/raw/ (offline, seconden)
```

> **Open punt:** de snapshot `droge-voeten-v3-data-2026-10-30.tar.zst` (12 MB, met `.sha256`) staat alleen lokaal bij Jari in `prototype/snapshots/`. Teamleden hebben hem pas als hij gedeeld wordt, bijvoorbeeld als bijlage bij een GitHub-release.

### Starten

```bash
make serve          # of: python3 -m http.server 8000
# open http://127.0.0.1:8000/app/?q=Abdij%204,%20Middelburg
```

- Vereisten: Python 3 (alleen standaardbibliotheek), `make`, voor snapshots `zstd`. Geen npm.
- De app heeft internet nodig: PDOK, LIWO, Provincie Zeeland en Wikimedia worden live per adres aangeroepen.
- **AR** werkt alleen via HTTPS op Android Chrome met ARCore; lokaal zie je de 3D-terugval.

### Docker

```bash
make docker         # bouwt eerst data/build/ als die ontbreekt; image: droge-voeten-v3
docker run -p 8080:80 droge-voeten-v3   # http://localhost:8080/app/
```

Het image (nginx 1.27-alpine) bevat alleen `app/` en `data/build/`.

### Uitrollen (zoals het nu gaat)

Op Jari's VPS draaien alle rondes (v1, v2, v3) achter een Caddy-gateway met `docker compose`. Die opzet (`docker-compose.yml`, `gateway/Caddyfile`, landingspagina, `DEPLOY.md`) staat in de ideeënmap, **niet** in deze repo. HTTPS komt van Cloudflare.

---

## 8. Ontwerpprincipes

Deze principes liepen door alle rondes heen en verklaren veel keuzes:

- **Verzin niets.** Geen geschatte waterhoogtes, geen ingevulde jaartallen. Ontbreekt een bron, dan zegt de app "onbekend" of "geen betrouwbare bron voor deze plek".
- **Bron bij elke uitspraak.** Elke zin heeft een "Waarom?", elk object een URI.
- **Eerlijk over onzekerheid.** Jaartallen krijgen een zekerheidslabel; vereenvoudigingen (verdiepingshoogte, 1953-zeewaterstand) staan in de app.
- **Rust.** Eerst één antwoord, details achter uitklappers.
- **Respecteer licenties.** Niet scrapen zonder open licentie (gemalen.nl, Molendatabase-teksten). Nooit botbescherming omzeilen.
- **Teruggeven,** maar niets uploaden naar Wikidata zonder menselijke review.

---

## 9. Bekende beperkingen en risico's

- **AR is niet getest op een echte telefoon.** Alleen de 3D-terugval is getest (headless Chromium). Testen op Android Chrome via de publieke URL is de eerste actie.
- **Jaartallen in bronnen zijn niet altijd echt:** 1.015 poldermolens "verdwenen" in precies 1850 en 740 in precies 1929 (vermoedelijk afgerond of verzameljaar). De app waarschuwt erbij. Droogmakerij "1549" betekent in de RCE-laag "1550 en eerder"; de app toont "vóór 1550".
- **Records zonder jaartal** staan niet op de tijdschuif: 16.148 van 17.119 verdwenen molens en 2.228 van 2.663 gemalen hebben er wel een. Gesloopte gemalen hebben geen sloopjaar.
- **1953 dekt alleen Noord-Brabant.**
- **Buiten Zeeland en de droogmakerijen** is de tijdlijn kort (geen indijkingsjaar).
- **Heuristische links:** historisch gemaal ↔ IMWA en RCE ↔ IMWA zijn naam + afstand. In ronde 1 bleek bij een steekproef van matches zonder naamovereenkomst ~3–4 van de 15 fout; daarom tellen alleen naam-bevestigde matches voor status en voorstellen.
- **Het nieuwe valt weinig op:** de kaart opent op "Nu"; Tijdreis en Zeeland moet je zelf aanklikken. Ideeën: tijdlijn hoger, ander standaardtabblad, korte rondleiding voor de demo.
- **Licenties:** RCE- en Zeeuwse lagen melden "Geen beperkingen" in het Nationaal Georegister, maar zonder benoemde licentie (niet apart nagekeken). IMWA meldt CC0 in de WMS en CC BY-SA 4.0 in de OGC API. De Molendatabase had geen bereikbare gebruiksvoorwaarden.
- **Bestandsgrootte:** het koppelvlak is gezipt ~1,6 MB bij de eerste zoekopdracht; tegels of een API zouden beter zijn.
- **AHN** is een pixel van 0,5 m; een voordeur op een dijk kan hoog uitvallen. **LIWO** heeft een resolutie van 5–100 m en zegt niets over jouw drempel.
- **Cijfers:** de aantallen in de README komen uit het eindverslag van de bouwagent en zijn niet allemaal apart nagerekend. Een nieuwe oogst geeft andere aantallen; gebruik de snapshot voor een gelijke demo.

---

## 10. Volgende stappen (voor de hackathondag)

1. AR testen op een Android-telefoon via `https://vps.maijenburg.dev/v3/droge-voeten/app/ar.html`, en de hoogte controleren op een bekende drempel.
2. Gemalenstichting om toestemming vragen voor het veld "Ontwerper" (en foto's). Dan kan "wie ontwierp jouw gemaal" in de tijdlijn.
3. Wikidata: een batch van 10 polders en 10 molens live reviewen en uploaden; de 21 conflicten melden.
4. 1953 voor Zeeland: Provincie Zeeland en het Watersnoodmuseum vragen naar een gedigitaliseerde inundatiekaart.
5. Polderarchieven (Zeeuws Archief, CC0 EAD) koppelen aan polders, met een link "lees verder in het archief".
6. `linkset-v3.ttl` en `events.ttl` registreren in het NDE Datasetregister.
7. De snapshot delen met het team (zie sectie 7).
8. Verder op "wie gaf de opdracht?": REPUBLIC, het Repertorium ambtsdragers, archiefinleidingen.

---

## 11. Begrippen

| Term | Betekenis |
|---|---|
| **NAP** | Normaal Amsterdams Peil, de Nederlandse referentiehoogte (≈ zeeniveau) |
| **AHN** | Actueel Hoogtebestand Nederland: maaiveldhoogte per 0,5 m |
| **LIWO** | Landelijk Informatiesysteem Water en Overstromingen (Rijkswaterstaat/Deltares): modeluitkomst waterdiepte bij een dijkdoorbraak, in 5 kansklassen (Kaart1 = grote kans > 1/30 per jaar … Kaart5 = extreem kleine kans < 1/30.000, gelijk aan overstroomik.nl) |
| **IMWA** | Informatiemodel Waterschappen: het open register van gemalen, sluizen, stuwen en gebieden van de waterschappen, via PDOK |
| **PDOK** | Publieke Dienstverlening Op de Kaart: open geodata van de overheid |
| **BAG** | Basisregistratie Adressen en Gebouwen |
| **RCE** | Rijksdienst voor het Cultureel Erfgoed (rijksmonumenten, Landschapsatlas) |
| **NDE** | Netwerk Digitaal Erfgoed, organisator van de HackaLOD |
| **Koppelvlak** | de interface tussen datalaag en presentatielaag; hier de bestanden in `data/build/` |
| **Linkset** | een dataset die alleen links tussen twee andere datasets bevat (VoID) |
| **QuickStatements (.qs)** | tekstformaat om bulkbewerkingen op Wikidata voor te stellen |
| **P359 / P2903 / P2863** | Wikidata-eigenschappen: rijksmonumentnummer / Molendatabase verdwenen-molen-ID / Nederlandse Molendatabase-ID |
| **P571 / P576 / P5817 / P137 / P1366** | Wikidata: oprichting / opheffing / staat van gebruik / beheerder / vervangen door |
| **Ten Bruggencate-nummer** | vast nummer per molen (allemolens.nl) |
| **Peilgebied** | gebied met één beheerd waterpeil |
| **Droogmakerij** | drooggepompt meer (bijv. Beemster, 1612) |
| **Indijking** | aanwas of buitengebied dat door een dijk polder werd (typisch Zeeland) |
| **Wiel** | doorbraakkolk: diepe plas achter een oude dijkdoorbraak |
| **Geschenkwoning** | woning na de Watersnoodramp van 1953 geschonken door een ander land |
| **Ruilverkaveling / landinrichting** | herinrichting van landbouwgrond (RCE-laag `LandinrichtingNL`, met jaartallen) |
| **Waterstaatskaart** | historische kaartserie van Rijkswaterstaat; de app linkt naar het kaartblad van de 1e editie (bijv. Middelburg 1, 1872) |
