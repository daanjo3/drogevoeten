# Reactie op de feedback: Droge Voeten (ronde 3)

De feedback op ronde 2 kwam neer op drie wensen:
1. **Meer verhaal:** een tijdlijn per adres, een tijdschuif op de kaart, een Zeeland-verdieping en meer linksets.
2. **Rust:** "Wel compleet, maar niet overweldigend".
3. **AR die echt werkt**, met LIWO, 1953 en NAP.

Hieronder per punt wat we deden, wat we bewust níet deden, en waarom.

---

## 1. "In v2 komt er te veel tegelijk op de gebruiker af"

**Nieuwe opzet: één antwoord, daarna doorklikken, mobiel eerst.** Na het adres zie je eerst alleen dit:
- **Vier zinnen**, bijvoorbeeld voor Middelburg:
  - "Je voordeur ligt 2,0 m boven zeeniveau (NAP)."
  - "Gemaal Boreel pompt het water uit jouw peilgebied weg, in opdracht van Scheldestromen."
  - "Deze plek werd ingedijkt in de 11e/12e eeuw (Polder Walcheren)."
  - "Bij een dijkdoorbraak blijft het hier volgens LIWO droog."

  Achter elke zin zit een knopje **"Waarom?"** met de bron en de kanttekening.
- **Hooguit één callout.** De app kiest de meest bijzondere: een geschenkwoning, een oude dijk of wal vlakbij, of 1953.
- **Eén knop:** "Bekijk het water in je kamer".
- **De tijdlijn** "Hoe werd dit droog?": zes stappen, met "toon meer". "Vandaag" en "Risico" staan altijd onderaan.

Alles uit ronde 2 bestaat nog, maar zit nu achter **uitklappers**:
- erfgoed in de buurt (met de statuslabels);
- het rekenvoorbeeld "gemaal uit";
- overstroming in detail;
- wie beslist;
- onder de motorkap.

De **kaart** heeft vier thema's (**Nu, Tijdreis, Risico, Zeeland**) in plaats van een lijst van negen lagen. "Alle kaartlagen" is er nog voor wie wil.

**Vormgeving:**
- rustige typografie;
- weinig kleur: inkt, grijs, één waterblauw, en één warme kleur voor "onder zeeniveau" en risico;
- licht en donker thema, dat het systeem volgt en een wisselknop heeft;
- laad-skeletons en foutmeldingen in gewone taal ("Adres niet gevonden. Probeer straat, huisnummer en plaats.").

De oude demo-URL's werken nog: `?q=Nieuwburen 1, Lemmer` en `?q=Middenweg 68a, Middenbeemster`.

## 2. Tijdlijn per adres: "Hoe werd dit droog?"

Elke stap heeft een **jaartal, een bron en een label voor hoe zeker dat jaartal is**: *ca.*, *uiterlijk*, *periode*, *eeuw*, *zie bron* of *onbekend*. We tonen altijd de oorspronkelijke jaartekst, zoals "11e/12e eeuw", "1304–1331" of "Voor 1300".

| Stap | Bron | Methode |
|---|---|---|
| Indijking | Provincie Zeeland, polders per bedijkingsperiode (595 vlakken) en poldernamen (658) | punt-in-vlak |
| Droogmaking | RCE Landschapsatlas, droogmakerijen (245); "1549" is in de bron "1550 en eerder", wij tonen "vóór 1550" | punt-in-vlak |
| Dijken en wallen | Provincie Zeeland (2.486, 2.453 met aanlegjaar); de beschrijving en literatuur halen we live bij de bron op | binnen 250 m |
| Molens die hier stonden | RCE, verdwenen molens (17.119) en bestaande molens (1.872) | binnen 1 km |
| Gemalen | RCE / Nederlandse Gemalenstichting (2.663): stichtingsjaar en aandrijving, bijvoorbeeld "eerst stoom, nu elektro" | dichtstbijzijnde 3 binnen 3 km |
| Waterstaatskaart | Rijkswaterstaat / RCE, kaartblad 1e editie, alleen als link (niet gegeorefereerd) | punt-in-vlak |
| Ruilverkaveling | RCE Landschapsatlas (604) | punt-in-vlak |
| Doorbraakkolken | RCE, wielen (1.266; het jaartal is bijna altijd onbekend en staat er dan zo) | binnen 1 km |
| 1953 | zie punt 5 | punt-in-vlak |
| Geschenkwoning | Provincie Zeeland (540), gekoppeld op BAG-adres | exact adres |
| Vandaag en risico | IMWA, waterschapsgrenzen, LIWO (uit ronde 2) | live |

Ontbreekt iets, dan staat er een gestippelde stap, bijvoorbeeld "Indijking of droogmaking: onbekend voor deze plek". We vullen nooit iets in.

## 3. Tijdschuif op de kaart

**Wat je ziet** onder "Tijdreis" (van 1600 tot nu, met een afspeelknop):
- verdwenen molens tussen hun bouw- en verdwijnjaar;
- bestaande molens vanaf hun bouwjaar;
- gemalen vanaf hun stichtingsjaar;
- polders en droogmakerijen, die gekleurd raken zodra ze bestaan.

**Hoe:** de ongeveer 21.000 punten staan op één canvas, dus het blijft vlot. Een klik op een punt opent een popup met links naar molendatabase.org, allemolens.nl, de Gemalenstichting, Wikidata en het bronobject.

**Wat we eerlijk vermelden:**
- **Gesloopte gemalen** hebben geen sloopjaar in de bron. Ze staan er als open vierkantje bij ("gesloopt, jaar onbekend") en verdwijnen pas bij "nu".
- **Records zonder jaartal** staan niet op de tijdschuif, en dat staat erbij: 16.148 van 17.119 verdwenen molens en 2.228 van 2.663 gemalen hebben er wel een.
- **De grafiek** "poldermolens verdwenen tegenover gemalen gesticht per tien jaar" wordt berekend uit dezelfde data.
- **Opvallende pieken in de bron.** Er zijn twee pieken: 1.015 poldermolens "verdwenen" in precies 1850 en 740 in precies 1929. De app zegt erbij dat dat waarschijnlijk afgeronde of geschatte jaartallen in de bron zijn, geen echte golf. Gecontroleerd hebben we dat niet; we laten het zien in plaats van het weg te poetsen.

## 4. Zeeland-verdieping, en Middelburg als slot van de demo

- **Dijken** zijn gekleurd naar aanlegperiode en klikbaar. De popup haalt de beschrijving en literatuur live bij de Provincie Zeeland op; hun WFS is CORS-open.
- **Op de kaart** staan ook verdronken dorpen, geschenkwoningen en de polders per periode.
- **Historische ondergrond:** de kaarten van 1560 (15 steden, waaronder Middelburg & Arnemuiden), de Hattinga-kaarten (rond 1750) en Pourbus (1571, alleen Zeeuws-Vlaanderen).
- **Abdij 4, Middelburg:**
  - de callout zegt "Je staat 40 m van de Ringwalburg, aangelegd tussen 840 en 900";
  - één klik toont de kaart van 1560, met de ronde burcht precies om je adres;
  - de tijdlijn loopt van de ringwalburg via Polder Walcheren, de stadswal (1304–1331), het verdronken Oud-Arnemuiden en de Waterstaatskaart (1872) naar Gemaal Boreel (1929).
- **Geschenkwoning:** "Je huis is een geschenk uit Noorwegen" (Koningin Maudplein 1, Nieuwerkerk), met foto. 507 van de 540 geschenkwoningen konden we exact op BAG-adres koppelen.

## 5. AR: beide waterhoogtes én NAP, met een schakelaar

`app/ar.html?lat=…&lon=…`, een aparte pagina. Die haalt de hoogtes uit dezelfde bronnen als de app (gedeelde module `app/lib/core.js`). De schakelaar heeft drie standen:

- **(a) Dijkdoorbraak (LIWO):** de maximale waterdiepte per kansklasse (te kiezen).
- **(b) 1953.** We zochten een open bron voor de waterhoogte of het inundatiegebied:
  - **Zeeland:** de laag "Verdronken gebied" (`chs:geocmd_zwrvrdgbdvlk`) is één inlaag bij Zierikzee, geen 1953-kaart.
  - **Nationaal Georegister, Klimaateffectatlas en NDE Datasetregister:** de enige open inundatiekaart van 1953 is die van de **Provincie Noord-Brabant**.
  - **Rijkswaterstaat** heeft wel gemeten waterstanden van 1 februari 1953 per getijstation, zoals Vlissingen NAP +4,53 m en Willemstad NAP +4,21 m.

  Daarom:
  - **In "zout" overstroomd gebied** tekenen we een lijn op de zeewaterstand van het dichtstbijzijnde station. De vereenvoudiging staat er letterlijk bij: "de waterstand op zee bij Willemstad … Binnen de polder kan het anders zijn geweest."
  - **In "zoet" gebied** tekenen we geen lijn: daar is de zeewaterstand geen maat.
  - **Overal elders, ook in Middelburg en Nieuwerkerk,** staat er: **"Geen betrouwbare bron voor deze plek"**, zonder schatting.
- **(c) Zeeniveau (NAP):** 0 m NAP min de AHN-hoogte. In Hoofddorp hangt dat vlak 3,56 m boven je vloer.

**Verdieping:** begane grond, 1e of 2e. We rekenen met 2,80 m per verdieping, met de vloer van de begane grond op maaiveld. Die vereenvoudiging staat in de app.

**Techniek:**
- WebXR `immersive-ar` met `hit-test`: je kiest de vloer met één tik.
- three.js r170 (lokaal opgenomen, MIT) tekent halfdoorzichtige vlakken met een label (getal + bron).
- `dom-overlay` toont de schakelaar ook in AR.
- **Beleving:** geen rampenfilm. Het water stijgt rustig in 2,6 seconden, en direct bij `prefers-reduced-motion`. Daarna verschijnt het kaartje **"Wie houdt dit water tegen?"** met het waterschap, het dichtstbijzijnde gemaal en het grootste gemaal binnen 3 km.

**Zonder AR-ondersteuning** (desktop, iPhone Safari; gedetecteerd met `navigator.xr?.isSessionSupported('immersive-ar')`) zie je een 3D-kamer. Die heeft dezelfde vlakken en dezelfde schakelaar, met een deur van 2,10 m, een persoon van 1,80 m en een meetlat van 3 m als maat.

**Eerlijk:**
- De 3D-kamer hebben we getest in headless Chromium.
- **De WebXR-modus zelf konden we niet testen:** headless heeft geen AR-camera. Op een Android-telefoon met Chrome moet dat nog gebeuren, via de HTTPS-URL achter Cloudflare.

## 6. Linksets en teruggeven aan het netwerk

Nieuw in `data/build/`:
- **`linkset-v3.ttl`:**
  - rijksmonument ↔ molenrecord, met Ten Bruggencate-nummer en allemolens.nl (1.236);
  - rijksmonument ↔ gemalen.nl (80);
  - historisch gemaal ↔ huidig gemaal in IMWA (1.519);
  - verdwenen molen ↔ Wikidata via P2903 (186);
  - Zeeuwse polder ↔ Wikidata (207);
  - geschenkwoning ↔ BAG (507).
- **`events.ttl`:** de tijdlijn als dataset, met 21.374 `schema:Event`'s. Elk event heeft de jaartekst, de nauwkeurigheid en `prov:wasDerivedFrom` naar het bronobject.
- **QuickStatements, ter review en niet geüpload:**
  - 194 keer P571 voor Zeeuwse polders: alleen bij een eenduidige naam- en locatiematch, alleen exacte jaartallen of "ca." met kwalificatie, met het provinciale rapport als referentie;
  - 140 keer P571 en 139 keer P576 voor verdwenen molens via P2903, alleen jaartallen zonder kwalificatie.
  - Daarnaast 21 conflicten tussen Wikidata en de RCE-laag, apart in `proofs/v3_wikidata_date_conflicts.tsv`.
- **`dataset-description.jsonld`:** bijgewerkt met schema.org en DCAT. Het beschrijft 6 datasets met hun distributies.

**Wat we onderweg vonden en oplosten:** de CHS-polderlagen van Zeeland hebben alleen instabiele, automatisch gegenereerde GeoServer-ID's. Onze bron-URI's selecteren daarom op het vaste veld `code` (bijvoorbeeld GEO-2049).

## Wat niet lukte of bewust is weggelaten

- **gemalen.nl** ("Ontwerper"): geen open licentie, dus niet gescrapet. We tonen alleen de link. Toestemming vragen is een vervolgstap.
- **Polderarchieven** (opendata.archieven.nl, CC0): geen betrouwbare automatische koppeling gevonden. Dit is een vervolgstap.
- **Een 1953-waterlijn voor Zeeland:** geen open bron gevonden, dus geen lijn.
- **WebXR op een echt toestel:** nog niet getest.
