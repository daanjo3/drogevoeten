# Droge Voeten: *Wie houdt mijn voeten droog?* (ronde 3)

## 1. Pitch

**Naam:** Droge Voeten

**Oneliner:** Typ je adres en krijg vier antwoorden: hoe diep je woont, wie hier pompt, hoe deze plek droog werd en hoe hoog het water kan komen. Daarna zie je die waterhoogte in je eigen kamer.

**Jurypitch (~150 woorden).**
Een kwart van Nederland ligt onder zeeniveau, maar bijna niemand weet hoe zijn eigen straat droog is geworden. Droge Voeten maakt van een adres een persoonlijk waterverhaal. Eerst krijg je vier zinnen. Daarna volgt een tijdlijn "Hoe werd dit droog?": de indijking of droogmaking, de poldermolens die hier stonden en verdwenen, de gemalen die ze vervingen (van stoom naar elektro), de ruilverkaveling, het gemaal dat nu pompt en het overstromingsrisico. Elke stap heeft een jaartal, een bron en een eerlijk label voor hoe zeker dat jaartal is. Een tijdschuif laat 21.000 molens en gemalen verschijnen en verdwijnen. In Zeeland klik je op dijken uit 840 of 1852 en bekijk je je straat op de kaart van 1560. Met "Bekijk het water in je kamer" zet je in AR een waterlijn op je vloer: LIWO bij een dijkdoorbraak, zeeniveau, of 1953 waar daar een open bron voor is. We geven linksets, een gebeurtenissen-dataset en Wikidata-voorstellen terug.

**Demoverhaal (4 minuten).**
1. **Middelburg** (`app/?q=Abdij%204,%20Middelburg`), de HackaLOD-plek:
   - de vier zinnen: +2,0 m NAP; Gemaal Boreel pompt het peilgebied leeg voor Scheldestromen; ingedijkt in de 11e/12e eeuw (Polder Walcheren); bij een dijkdoorbraak droog volgens LIWO;
   - de callout: "Je staat 40 m van de Ringwalburg, aangelegd tussen 840 en 900";
   - één klik ("Bekijk deze plek op de kaart van 1560") toont de kaart van 1560 met de ronde burcht om de Abdij;
   - in de tijdlijn staan de stadswal (1304–1331), het verdronken dorp Oud-Arnemuiden, Waterstaatskaartblad Middelburg 1 (1872) en Gemaal Boreel (1929).
2. **Nieuwerkerk** (`app/?q=Koningin%20Maudplein%201,%20Nieuwerkerk`): "Je huis is een geschenk uit Noorwegen", gekoppeld via het BAG-adres. De tijdlijn noemt ook de ruilverkaveling Schouwen-Duiveland (1954).
3. **Heijningen** (`app/?q=Elisabethweg%202,%20Heijningen`): deze plek liep in 1953 onder volgens de open inundatiekaart van de Provincie Noord-Brabant. Open de AR-pagina en kies **1953**:
   - het vlak staat 3,52 m boven de vloer;
   - de hoogte is de zeewaterstand bij Willemstad (NAP +4,21 m), met de vereenvoudiging erbij vermeld.
4. **Beemster** (`app/?q=Middenweg%2068a,%20Middenbeemster&kaart=tijd&jaar=1850`):
   - drooggemaakt in 1612;
   - de tijdschuif van 1600 naar nu laat de molens verdwijnen en de gemalen verschijnen;
   - de grafiek per decennium waarschuwt zelf dat "1850" in de bron opvallend vaak voorkomt.
5. **Lemmer** (`app/?q=Nieuwburen%201,%20Lemmer`): het Woudagemaal (1915, stoom) staat in de tijdlijn en is via de Gemalenstichting gekoppeld aan het huidige register.
6. **AR**: op een Android-telefoon tik je op de vloer en stijgt het water rustig tot de LIWO-hoogte. Daarna verschijnt het kaartje "Wie houdt dit water tegen?". Op desktop en iPhone zie je dezelfde vlakken in een 3D-kamer.

## 2. Datasets

Nieuw in ronde 3 (alle bronnen gecontroleerd op 28-10-2026):

| Bron | Uitgever | In NDE Datasetregister? | Toegangs-URL | Rol | Licentie |
|---|---|---|---|---|---|
| Landschapsatlas: gemalen (2.663) | RCE / Nederlandse Gemalenstichting | nee | WFS `https://services.rce.geovoorziening.nl/landschapsatlas/wfs` (`landschapsatlas:gemalen`) | stichtingsjaar, aandrijving toen/nu, status, link naar gemalen.nl | NGR c81e0dd2…: "Geen beperkingen" |
| Landschapsatlas: verdwenen molens (17.119) | RCE (uit molendatabase.org) | nee | idem, `verdwenenmolens` | bouw- en verdwijnjaar met kwalificatie, Ten Bruggencate-nr | NGR 7e41f6fa…: "Geen beperkingen" |
| Landschapsatlas: molens (1.872 bestaand) | RCE | nee | idem, `Molens` | bouwjaar, monumentnummer, allemolens.nl | NGR 291afe4b…: "Geen beperkingen" |
| Landschapsatlas: droogmakerijen (245), landinrichting (604), wielen (1.266), Waterstaatskaart-bladwijzer (183) | RCE | nee | idem | punt-in-vlak voor de tijdlijn | NGR cd53d540…: "Geen beperkingen" |
| Cultuurhistorie Zeeland: dijken, dammen en wallen (2.486), polders per bedijkingsperiode (7 lagen, 595 vlakken), poldernamen (658), verdronken dorpen (201), geschenkwoningen 1953 (540), Deltawerken | Provincie Zeeland | nee | WFS `https://opengeodata.zeeland.nl/geoserver/wfs` | Zeeland-verdieping, tijdlijn | NGR e5c91c39…, bfcfbdbf…, 6eb9a0b2…, a04a860d…: "Geen beperkingen" |
| Historische kaarten 1560 (15 steden), Hattinga ca. 1750, Pourbus 1571 | Provincie Zeeland | nee | WMS `https://opengeodata.zeeland.nl/geoserver/wms` | ondergrond | 1560: NGR 6813884d… "Geen beperkingen"; overige: capabilities `AccessConstraints NONE` |
| Historische Inundatie Ramp 1953 (19 vlakken, zout/zoet) | Provincie Noord-Brabant | nee | `https://atlas.brabant.nl/data_download/geojson/1515e932-56eb-4e6f-adb9-b3ef30af9bfe.zip` (NGR dc382a09…) | 1953 in tijdlijn en AR, alleen Noord-Brabant | "Geen gebruiksbeperking" |
| Waterhoogte 31-01 t/m 02-02-1953, 6 getijstations | Rijkswaterstaat | nee | `https://ddapi20-waterwebservices.rijkswaterstaat.nl/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen` | 1953-waterstand (vereenvoudiging) | open data RWS |
| Wikidata: P2903 (369 items), polders in Zeeland (698) | Wikimedia | hub | `https://query.wikidata.org/sparql` | links en QuickStatements | CC0 |
| PDOK Locatieserver | Kadaster | BAG wel | `https://api.pdok.nl/bzk/locatieserver/search/v3_1/` | geschenkwoning → BAG-adres | CC0 |

Uit ronde 2, ongewijzigd in gebruik:
- RCE Rijksmonumenten;
- Wikidata (P359, waterschappen);
- Nederlandse Molendatabase;
- IMWA (kunstwerken en waterbeheergebieden);
- waterschapsgrenzen;
- AHN;
- LIWO;
- Klimaateffectatlas;
- Klimaat Zeeland (90 mm);
- KNMI.

Zie ook `datalayer/services.py` en de README van ronde 2.

**Over 1953: wat we zochten en vonden.**
- **Zeeland-geoserver**, laag `chs:geocmd_zwrvrdgbdvlk` "Verdronken gebied": dat is **één** vlak, de Lockersinlaag bij Zierikzee (een buitendijkse inlaag), geen inundatiekaart. **Afgewezen.**
- **Nationaal Georegister** (zoektermen 1953, watersnoodramp, inundatie, stormvloed): de enige open inundatiekaart is die van de **Provincie Noord-Brabant**.
  - Die bevat 19 vlakken: 8 met zout water, 11 met zoet water, onder andere bij 's-Hertogenbosch.
  - Er zitten geen dieptes in.
  - "Watersnoodramp 1953: Sporen …" gaat over herinneringspunten, niet over inundatie.
- **Klimaateffectatlas** en **NDE Datasetregister**: geen 1953-kaart gevonden.
- **Rijkswaterstaat DDL API 2.0**: gemeten waterstanden van 1 februari 1953, afgelezen van registratiebladen. Bijvoorbeeld:
  - Vlissingen: NAP +4,53 m om 03:40, uurwaarde, "ongecontroleerd";
  - Willemstad: NAP +4,21 m, 3-uurswaarde.

  De echte top kan tussen de aflezingen liggen.
- **Wat de app daarmee doet:**
  - In "zout" overstroomd gebied (Noord-Brabant) tekent de app een 1953-waterlijn op de zeewaterstand van het dichtstbijzijnde station, als expliciet benoemde vereenvoudiging.
  - In "zoet" gebied tekent hij geen lijn: dat water kwam niet rechtstreeks uit zee, en de oorzaak staat niet in de bron.
  - Elders, ook in Middelburg, staat er: "Geen betrouwbare bron voor deze plek."

**Afgewezen of niet gebruikt:**
- **gemalen.nl:** heeft per gemaal ook de "Ontwerper", maar we vonden geen open licentie. **Niet gescrapet.** We tonen alleen de infolink uit de RCE-laag.
- **Polderarchieven op opendata.archieven.nl** (CC0, bijvoorbeeld Zeeuws Archief toegang 3001 "Polder Walcheren 1870-1953"): niet ingebouwd. We vonden geen betrouwbare automatische koppeling van polderarchief aan poldervlak. Dit is een vervolgstap.
- **Landschapsatlas `hoofdwaterwegen_historie`:** niet nodig voor de tijdlijn.
- **Waterstaatskaart:** de JPG's zijn niet gegeorefereerd, dus alleen als link per kaartblad.

## 3. Bewijs van linkbaarheid

Volledige transcripten: `proofs/v3_link_proofs.txt` (gegenereerd door `datalayer/proofs_v3.py` uit de gebouwde data), plus `proofs/link_proofs.txt` en `proofs/v2_link_proofs.txt` uit eerdere rondes. Tegenstrijdige jaartallen tussen Wikidata en de RCE-laag staan in `proofs/v3_wikidata_date_conflicts.tsv` (21).

**Keten voor het Woudagemaal (rijksmonument 25772):**

| Dataset | URI | Hoe het linkt |
|---|---|---|
| RCE Rijksmonumenten | `https://linkeddata.cultureelerfgoed.nl/cho-kennis/id/rijksmonument/47128` | monumentnummer 25772 |
| RCE Landschapsatlas, gemalen | `…/landschapsatlas/wfs?…typeNames=landschapsatlas:gemalen&featureID=gemalen.670…` (stichtingsjaar 1915, stoom → stoom) | **nieuw**: `monumentnr` 25772 → `schema:subjectOf` |
| Nederlandse Gemalenstichting | `https://gemalen.nl/gemaal_detail.asp?gem_id=369` | **nieuw**: `schema:subjectOf` |
| IMWA (huidig register) | `https://api.pdok.nl/hwh/waterschappen-kunstwerken-imwa/ogc/v2/collections/gemaal/items/5d14050a-03ee-5cc6-be05-0860cd3aa8fd` | **nieuw**: historisch gemaal ↔ actueel gemaal, `skos:closeMatch` (5 m, naamwoord "woudagemaal") |
| Wikidata | `wd:Q1121835` | P359 (ronde 1) |

**Andere voorbeelden** (alle URI's in het bewijsbestand):
- **Molen:**
  - `rijksmonument/44513` → `https://zoeken.allemolens.nl/tenbruggencatenummer/00003`;
  - Ten Bruggencate-nummer `00003` ("De Trouwe Waghter", Tienhoven).
- **Verdwenen molen** `wd:Q1814216` (Molen van Wolfswinkel, P2903 = 15012) `skos:exactMatch` het RCE-feature `verdwenenmolens.6711`. Daaruit volgt het voorstel P571 = 1215, P576 = 1826, met als referentie de molendatabase.org-pagina.
- **Polder** `chs:geocmd_chspld16491808vvl` met code GEO-2049 `skos:closeMatch` `wd:Q1810498` (Klein-Cambronpolder). Daaruit volgt het voorstel P571 = 1770, met als referentie het rapport `https://dataportaal.zeeland.nl/cultuurhistorie/rapporten/GEOOBJ/2049.pdf`.
- **Geschenkwoning:**
  - feature `geocmd_gskwnn_53pnt.542` (Koningin Maudplein 1, Nieuwerkerk, Noorwegen, 1953-1954);
  - `schema:address` → `https://bag.basisregistraties.overheid.nl/bag/id/nummeraanduiding/1676200000516909`.

**Methoden en uitkomsten** (`data/build/stats-v3.json`):

| Link / afleiding | Methode | Resultaat |
|---|---|---|
| Rijksmonument ↔ molenrecord (allemolens, Ten Bruggencate, RCE-feature) | RMONNUMMER → RCE-URI via RCE-SPARQL (`queries/rce_monument_uri_by_number.rq`) | 1.236 monumenten |
| Rijksmonument ↔ gemalen.nl | `monumentnr` in de gemalenlaag | 80 |
| Historisch gemaal ↔ IMWA | gedeeld naamwoord, ≤ 300 m, alleen status "In bedrijf" | 1.519 |
| Verdwenen molen ↔ Wikidata | P2903 = `molen_dbnr`: mediane afstand 13 m bij 194 treffers, dus bevestigd. Bij meerdere records met hetzelfde nummer kiezen we het dichtstbijzijnde; > 5 km verschil wordt overgeslagen (15×). | 186 (van 369 items; 169 zonder RCE-record) |
| Zeeuwse polder ↔ Wikidata | unieke naam (ook "A of B"-varianten) én de Wikidata-coördinaat ligt in of vlak bij de contour; naam die meerdere items delen → overgeslagen (24×) | 207 |
| Geschenkwoning ↔ BAG | PDOK-geocodering; alleen exacte overeenkomst van straat, huisnummer en woonplaats | 507 van 540 |
| Tijdlijn per adres | punt-in-vlak (polders, droogmakerijen, landinrichting, kaartbladen, 1953) en straal (molens 1 km, gemalen 3 km, dijken 250 m, verdronken dorpen 3 km) in de browser, op het koppelvlak | per adres |

**Wikidata-voorstellen (QuickStatements, niet geüpload):**
- `wikidata_P571_polders.qs`: **194** keer P571 (indijking).
  - Alleen exacte jaartallen, of "ca." met P1480 = Q5727902.
  - Alleen waar Wikidata nog geen P571 heeft. Dat is bij alle 698 Zeeuwse polders in ons venster zo.
  - Elk voorstel heeft het provinciale rapport als S854 en S813 = 28-10-2026.
- `wikidata_P571_P576_molens.qs`: **140** keer P571 en **139** keer P576 voor verdwenen molens via P2903.
  - Alleen jaartallen zonder kwalificatie ("voor", "of eerder") in de bron.
  - Alleen waar de waarde op Wikidata ontbreekt.

**Tijdlijn als dataset:** `events.ttl` bevat **21.374** `schema:Event`'s:
- 7.214 molens gebouwd en 6.884 verdwenen (alleen poldermolens);
- 2.228 gemalen gesticht;
- 2.453 dijken aangelegd;
- 1.206 indijkingen (zonder dubbele polderdelen);
- 245 droogmakingen;
- 604 landinrichtingen;
- 540 geschenkwoningen.

Elk event heeft de oorspronkelijke jaartekst, een nauwkeurigheidslabel en `prov:wasDerivedFrom` naar het bronobject.

**Stabiele bron-URI's:**
- Voor de RCE-lagen, de Zeeuwse dijken, de verdronken dorpen en de geschenkwoningen gebruiken we `GetFeature&featureID=…`. Die is dereferenceerbaar en CORS-open, en de app haalt er de dijkbeschrijving live mee op.
- De Zeeuwse CHS-lagen (polders, Deltawerken) hebben alleen automatisch gegenereerde GeoServer-fid's, en die zijn niet stabiel. Daar selecteert de URI op het vaste veld `code` (`CQL_FILTER=code='GEO-2049'`).

## 4. Aansluiting op de uitdaging

| Criterium | Hoe |
|---|---|
| ≥ 2 open erfgoedbronnen | RCE Rijksmonumenten en Landschapsatlas, Cultuurhistorie Zeeland, Nederlandse Molendatabase/molendatabase.org, Wikidata, plus open overheidsdata (IMWA, AHN, LIWO, BAG, KNMI, RWS) |
| Linked-data-technieken | gedeelde identifiers (monumentnummer, P2903, Ten Bruggencate, BAG-ID), dereferenceerbare feature-URI's, SPARQL (RCE, Wikidata), VoID-linksets, `schema:Event` + PROV, QuickStatements met referenties |
| Waarde zonder kennis van LD | vier zinnen en een tijdlijn; de LD zit achter "Waarom?", "bron" en "Onder de motorkap" |
| NDE Datasetregister | `data/build/dataset-description.jsonld` (schema.org + DCAT) beschrijft 6 datasets en hun distributies, klaar voor registratie |
| **Scheiding data/presentatie** | **Datalaag:** `fetch.py`, `fetch_status.py`, `fetch_v3.py` (oogst) → `build.py`, `build_v3.py` (linken, publiceren) → koppelvlak `data/build/` (`droge-voeten.jsonld` + `history-areas.json`, `history-points.json`, `zeeland.json`). **Presentatie 1:** `app/index.html` (web). **Presentatie 2:** `app/ar.html` (AR / 3D), dezelfde datalaag via `app/lib/core.js`. **Presentatie 3:** `datalayer/whokeeps.py` (terminal, ronde 2). |
| **Bijdragen aan het netwerk** | `linkset-v3.ttl` (6 linksets, ~3.700 links), `events.ttl` (21.374 gebeurtenissen), 473 Wikidata-voorstellen, de lijst van 21 jaartalconflicten Wikidata ↔ RCE, en de bevinding dat er geen open 1953-inundatiekaart van Zeeland is. Plus alles uit ronde 2. |
| Maatschappelijke relevantie | klimaatadaptatie: je ziet wie je nu beschermt, hoe dat zo gekomen is en wat er op het spel staat, zonder rampenfilm |
| Zeeland | de demo eindigt in Middelburg: de Ringwalburg, de kaart van 1560, Polder Walcheren en Gemaal Boreel. Ook dijken, verdronken dorpen en geschenkwoningen. |

## 5. Prototype

```
02_droge_voeten/
  datalayer/fetch.py, fetch_status.py   oogst ronde 1/2 (RCE, Wikidata, IMWA, Molendatabase, KNMI)
  datalayer/fetch_v3.py                 oogst ronde 3 (RCE Landschapsatlas, Zeeland, Brabant 1953, RWS 1953, PDOK, Wikidata)
  datalayer/build.py                    ronde 2: koppelvlak, linkset.ttl, status.ttl, P5817/P137-voorstellen
  datalayer/build_v3.py                 ronde 3: history-*.json, zeeland.json, linkset-v3.ttl, events.ttl, P571/P576-voorstellen, DCAT
  datalayer/proofs_v3.py                proofs/v3_link_proofs.txt
  datalayer/services.py                 kaartdiensten (nu ook 1560, Hattinga, Pourbus)
  app/index.html, main.js, timeline.js, mapview.js, style.css    webapp
  app/ar.html, ar.js                    AR (WebXR) + 3D-kamer
  app/lib/core.js                       gedeelde datatoegang (koppelvlak + live diensten)
  app/vendor/leaflet/                   Leaflet 1.9.4 (BSD-2-Clause)
  app/vendor/three-0.170.0/             three.js r170 (three.module.min.js, OrbitControls.js; MIT, LICENSE erbij; uit npm three@0.170.0)
  data/build/                           koppelvlak en bijdragen (zie boven)
  queries/                              SPARQL (RCE, Wikidata)
```

**Data terughalen (niet in git):**
`data/raw/` (oogstcache, ~80 MB) en `data/build/` (koppelvlak, ~22 MB) staan niet in git (zie `.gitignore`). Na een verse clone kies je één van drie routes:

```bash
cd v3/02_droge_voeten
make restore SNAPSHOT=<bestand.tar.zst of URL>   # exact de data van de demo (aanbevolen)
make harvest                                     # alles opnieuw oogsten en bouwen (~25 min, netwerk; uitkomst kan afwijken)
make build                                       # alleen data/build/ opnieuw maken uit data/raw/ (offline, seconden)
make snapshot                                    # data/raw/ + data/build/ inpakken -> snapshots/*.tar.zst (+ .sha256)
```

- De bronnen veranderen, dus een nieuwe oogst geeft andere aantallen dan in deze README staan. Voor een gelijke demo gebruik je de snapshot; zet die bijvoorbeeld als bijlage bij een release.
- `make build` op dezelfde cache geeft dezelfde uitvoer, op de datumvelden (`dateModified`, `generated`, `dateCreated`) na.
- `make harvest` draait `fetch.py` → `build.py` → `fetch_status.py` → `fetch_v3.py` → `build.py` + `build_v3.py`. `fetch_status.py` leest de monumentenlijst uit `data/build/`, daarom bouwt `build.py` tussendoor.

**Draaien:**
```bash
cd v3/02_droge_voeten
python3 -I datalayer/fetch_v3.py        # optioneel, ~6 min (geocodering 540 adressen, WDQS 1 verzoek/min)
python3 -I datalayer/build.py           # ronde-2-koppelvlak
python3 -I datalayer/build_v3.py        # ronde-3-uitbreiding (draai altijd na build.py)
python3 -I datalayer/proofs_v3.py
python3 -m http.server 8000             # http://localhost:8000/app/
```
**Docker:**
- `docker build -t droge-voeten-v3 .` slaagt (nginx 1.27-alpine, gzip ook voor JS en CSS). Het image bevat alleen `app/` en `data/build/`.
- `data/build/` moet er dan al staan: na een verse clone eerst `make restore` of `make build` (of meteen `make docker`, die bouwt zo nodig eerst).
- Achter de gateway draait de app onder `/v3/droge-voeten/`; alle URL's zijn relatief.

**Demo-URL's** (relatief):
- `app/?q=Abdij%204,%20Middelburg` (ook `&kaart=zeeland`)
- `app/?q=Koningin%20Maudplein%201,%20Nieuwerkerk` (geschenkwoning, Noorwegen)
- `app/?q=Elisabethweg%202,%20Heijningen` en `app/ar.html?q=Elisabethweg%202,%20Heijningen&laag=1953`
- `app/?q=Middenweg%2068a,%20Middenbeemster` (ook `&kaart=tijd&jaar=1850`)
- `app/?q=Nieuwburen%201,%20Lemmer`
- `app/ar.html?q=Hoofdweg%20569,%20Hoofddorp` (zeeniveau 3,56 m boven de vloer)

**Parameters:**
- `kaart=nu|tijd|risico|zeeland`: kies het kaartthema;
- `jaar=1600..2026`: zet de tijdschuif;
- `data=`: gebruik een ander koppelvlak;
- op de AR-pagina: `lat`, `lon`, `q`, `laag=liwo|1953|nap` en `instant=1` (zonder animatie; ook bij `prefers-reduced-motion`).

**Opzet van de webapp** ("één antwoord + doorklikken", mobiel eerst):
1. **Vier zinnen**, elk met "Waarom?": de hoogte, wie pompt, hoe het droog werd en het risico.
2. **Eén callout:** geschenkwoning, oude dijk of wal vlakbij (met een link naar de kaart van 1560), of 1953.
3. **De knop naar AR.**
4. **De tijdlijn** "Hoe werd dit droog?": zes stappen, met "toon meer". "Vandaag" en "Risico" staan altijd onderaan. Onbekende stappen staan er gestippeld als "onbekend voor deze plek".
5. **Uitklappers:** erfgoed in de buurt (de statuslabels uit ronde 2), het rekenvoorbeeld "gemaal uit", overstroming in detail (alle LIWO-klassen, 90 mm Zeeland, 1953), wie beslist, en onder de motorkap.
6. **Kaart** met vier thema's in plaats van negen losse lagen:
   - **Nu:** waterschappen, gemalen en erfgoed;
   - **Tijdreis:** tijdschuif 1600–nu, afspeelknop, polders en droogmakerijen kleuren mee, plus een grafiek per decennium;
   - **Risico:** LIWO met kansklasse en legenda;
   - **Zeeland:** dijken naar aanlegjaar (klik voor beschrijving en literatuur, live opgehaald bij de provincie), verdronken dorpen, geschenkwoningen, en de kaarten van 1560, 1750 of 1571.

   "Alle kaartlagen" blijft beschikbaar.
7. **Licht en donker thema** (volgt het systeem, met een wisselknop), laad-skeletons en foutmeldingen in gewone taal.

**AR (`app/ar.html`):**
- **Hoe het werkt:**
  - WebXR `immersive-ar` met `hit-test`. Je tikt één keer op de vloer.
  - Een halfdoorzichtig vlak van 30 × 30 m stijgt in 2,6 s naar de hoogte. Het label noemt de hoogte boven je vloer en de bron.
  - `dom-overlay` toont de schakelaar LIWO / 1953 / NAP in AR. Tikken op het paneel plaatst geen vloer (`beforexrselect`).
  - Na de animatie verschijnt het kaartje "Wie houdt dit water tegen?": het waterschap (officiële grens), het dichtstbijzijnde en het grootste gemaal binnen 3 km (IMWA).
- **Zonder AR** (desktop, iOS Safari) zie je een 3D-kamer met dezelfde vlakken en schakelaar: een vloer van 5 × 5 m, een deur van 2,10 m, een persoon van 1,80 m en een meetlat van 3 m.
- **Verdieping:** begane grond, 1e of 2e. We rekenen met 2,80 m per verdieping en nemen aan dat de vloer van de begane grond op maaiveld ligt. Beide vereenvoudigingen staan in de app.
- **Getest:**
  - De 3D-terugval is getest in headless Chromium (SwiftShader-WebGL) voor Hoofddorp (NAP), Beemster (LIWO 0,36 m, mobiel) en Heijningen (1953). Screenshots staan niet in de projectmap.
  - **WebXR zelf is niet getest:** headless Chromium heeft geen AR-camera. Op een Android-telefoon met Chrome en ARCore moet dat nog, via `https://vps.maijenburg.dev/v3/droge-voeten/app/ar.html` (veilige context via Cloudflare).

## 6. Risico's en open vragen

- **Jaartallen in bronnen zijn niet altijd echte jaartallen.**
  - 1.015 poldermolens "verdwenen in precies 1850" en 740 in precies 1929. Dat zijn waarschijnlijk afgeronde of verzameljaren; de app waarschuwt erbij.
  - "Ca.", "voor", "periode" en "eeuw" tonen we als label en schrijven we zo in `events.ttl`.
  - Een eeuw sorteren we op het begin van die eeuw, en dat zeggen we erbij.
- **Droogmakerij "1549"** betekent in de RCE-laag "1550 en eerder". Wij tonen "vóór 1550".
- **1953 dekt alleen Noord-Brabant.** De zeewaterstand is een vereenvoudiging: 3-uurlijkse aflezingen kunnen de top missen, en in de polder kan het anders hebben gestaan.
- **De koppeling historisch gemaal ↔ IMWA is heuristisch** (naam + afstand). Een vervangend gemaal met dezelfde naam kan een ander object zijn; daarom koppelen we alleen status "In bedrijf".
- **Tijdlijnstraal:** "binnen 1 km" en "binnen 3 km" zijn keuzes, geen bemalingsgebieden. De app zegt "in de buurt", niet "jouw molen".
- **Licenties:**
  - RCE- en Zeeland-lagen: "Geen beperkingen" in het Nationaal Georegister, maar zonder benoemde licentie.
  - gemalen.nl: geen open licentie; we tonen alleen de link.
  - De Molendatabase-kwestie uit ronde 2 blijft open.
- **Bestandsgrootte:** het koppelvlak is gezipt ongeveer 1,6 MB bij de eerste zoekopdracht. Dat is redelijk op 4G, maar tegels of een API zouden beter zijn.
- **WebXR** is nog niet op een toestel getest (zie boven).

## 7. Volgende stappen voor de hackathondag

1. **AR op een echte Android-telefoon testen** via de publieke URL, en de hoogte op een bekende drempel controleren.
2. **Gemalenstichting:** toestemming vragen om het veld "Ontwerper" (en eventueel foto's) te gebruiken. Daarna kan "wie ontwierp jouw gemaal" in de tijdlijn.
3. **Wikidata:** een batch van 10 P571-polders en 10 molens live reviewen en uploaden, en de 21 conflicten melden.
4. **1953 voor Zeeland:** bij de Provincie Zeeland en het Watersnoodmuseum vragen naar een gedigitaliseerde inundatiekaart, en die als open dataset helpen publiceren.
5. **Polderarchieven** (Zeeuws Archief, CC0 EAD): polder ↔ archieftoegang koppelen en een link "lees verder in het archief" toevoegen in de tijdlijn.
6. **Registreren** van `linkset-v3.ttl` en `events.ttl` in het NDE Datasetregister.
