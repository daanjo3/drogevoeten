# Droge Voeten, ontwerp van de presentatielaag

HackaLOD 2026, Netwerk Digitaal Erfgoed. Team van vier: Wendy (design, verhaal, UX, presentatie), twee datamensen (linked data, SPARQL), één persoon voor 3D/AR/VR.

## Concept

Een leerzame, speelse webapp die leerkrachten in groep 7 en 8 klassikaal gebruiken. Je typt een adres en ziet wie dat land droog houdt, hoe het droog werd, welke gemalen en molen in de buurt werken, en wat er gebeurt als het misgaat. Doel is bewustwording over klimaat en erfgoed bij kinderen.

Gedragsprofiel (NDE) is **Leren**, met **Intens beleven** als moment dat de leerkracht aan de klas geeft.

Deze map `design/` is de **ontwerpreferentie** voor de presentatielaag: een werkend html-prototype dat laat zien hoe het eruit moet zien en moet bewegen. De echte app wordt in React gebouwd in `app/`.

De datalaag en het koppelvlak staan in `prototype/` in deze repo (ronde 3, live op https://vps.maijenburg.dev/v3/droge-voeten/). Houd de scheiding tussen datalaag en presentatielaag zichtbaar, de jury let erop.

Teamafspraak: documentatie in het Nederlands, code en commentaar in het Engels.

## Bestanden

- `index.html` bevat alles: markup, css en js in één bestand. Open het direct in de browser.
- `img/` bevat drie placeholderbeelden die Wendy aanleverde. De bron is nog niet bekend.

## Opbouw van de pagina

1. **Startscherm.** Kop, intro, zoekbalk met eigen knipperende cursor, drie voorbeeldplekken. Onderaan een landschap in drie svg-lagen (zee hoger dan polder, dijk, molen, gemaal) met parallax en subtiele animaties. Na zoeken volgt een vertrektransitie: tekst schuift weg, speld valt, je duikt het landschap in, het grid zoomt in.
2. **Canvas** (`#world` > `#canvas`). Bento-grid van absoluut gepositioneerde blokken in vw/vh, vrij scrollbaar in twee richtingen. De randen vagen weg via een css-mask op `#world`.
   - `#p-huis` is de huiskamer. In het prototype staat hier een render als placeholder; in de app draait de 3D-woonkamer uit Unity (zie hieronder). Het water stijgt hier in de misgaat-modus.
   - `#p-info` staat naast de huiskamer en heeft twee modi, `data-mode="info"` en `data-mode="risk"`. In risk toont het de scenarioknoppen.
   - `#p-tijd` is de tijdreis, een lange verticale kolom.
   - `#p-buurt` toont de gemalen in de buurt, klikbaar op kaart en lijst.
   - `#p-map` is het kaartje van Nederland met een speld.
   - `.img`-tegels zijn beelden verspreid door het grid.
3. **Vaste elementen.** Locatielabel bovenin, zwevende navigatiegroep onderin (Begin, Huiskamer, Tijdreis, Buurt, Als het misgaat), minimap rechtsonder.

Navigatie gebruikt `go(key)`. Huiskamer en info worden samen gecentreerd, de tijdreis wordt bovenin uitgelijnd, de buurt gecentreerd.

## Design

- Achtergrond `#F4EFEB`, inkt `#242424`.
- Kleuren: blauw `#0087D8`, lavendel `#D28AE1`, groen `#617E5A`, sunshade `#FFA654`, deep gray `#242424`. Blokken hebben zachte verlopen naar een lichtere tint.
- Koppen in **Fraunces** (700, SOFT 100, WONK 1). Tekst in **Instrument Sans**. Labels, bronnen en tags in kapitalen met wat letterspatiëring.
- Knoppen vallen op, informatie is subtiel.
- **Informatie heeft scherpe hoeken, knoppen zijn afgerond.** Zo lijkt een informatiekaartje nooit op een knop. Geldt voor het rondleidingkaartje, de labels daarin en het straatnaamlabel bovenin (`#where`: witte achtergrond, zwarte outline, geen ronde hoeken).
- Moeilijke woorden hebben een tooltip (`.tip.term`). Bronnen staan in een tooltip (`.tip.bron`).
- Iconen zijn eigen lijntekeningen (svg `<symbol>`).

## Schrijfstijl

- Nederlands, B1-niveau, vertellend, korte zinnen.
- Geen streepjes als scheidingsteken (geen —, – of --).
- Geen zinnen als "Het resultaat: een snellere site". Schrijf ze uit.
- Geen marketingtaal.
- Elk feit heeft een bron. Weet je het niet, zeg dat dan.

## Wat echt is en wat placeholder

Echt (uit v3, voor Abdij 4 Middelburg): NAP +2,0 m (AHN), Gemaal Boreel 844 m³/min, peilgebied GPG437 van 3,09 km² (IMWA), natste dag Vlissingen 80,9 mm op 2005-07-04, natste dag vorig jaar 31,8 mm (KNMI).

Het cijfer "een kwart van Nederland ligt lager dan de zee" komt van het PBL (2010) en moet nog gecontroleerd worden.

Placeholder:
- De rest van de teksten per adres.
- Waterhoogte bij lekken of breken van de dijk (zou uit LIWO moeten komen).
- Molen in de buurt en Sluis Veere.
- Positie van de stippen op de buurtkaart.
- Het kaartje van Nederland (handgetekend, beter uit PDOK).
- De speld op de kaart, die nu alleen vier plaatsnamen kent.

## Open punten

- [x] De 3D-huiskamer in `#p-huis`, als WebGL-build van het Unity-project in `unity/`. Zit in de app (`app/components/UnityRoom.tsx`). Het water zit in de Unity-kamer: `UnityRoom` stuurt het waterniveau uit het scenario (meter boven de vloer, 0 buiten de risicomodus) naar `SetWaterHeight` in Unity. De oude html-laag met water en waterlijn is weg.
- [ ] Data per adres ophalen via het koppelvlak van de datalaag, in plaats van hardcoded.
- [ ] Beelden via IIIF bij de bron (Rijksmuseum, RCE beeldbank). Bronnen van de drie beelden in `img/` invullen.
- [ ] Kaart van Nederland uit open data (PDOK), speld op echte coördinaten van de PDOK Locatieserver.
- [ ] Mobiele en beamer-layout testen. Er is een basis-fallback onder 900px.
- [ ] Tooltips testen met toetsenbord en op een touchscreen.

## Referentiedocs (lokaal, niet in git)

In `design/docs/` staan referentiedocs die bewust niet in de repo staan (zie `.gitignore`). Lees ze als een keuze erom vraagt:

- `docs/02-jurering-en-oplevering.md` bevat de juryeisen en wat we moeten opleveren.
- `docs/04-integration-layer-api.md` is de NDE-spec voor het koppelvlak tussen datalaag en presentatielaag.
- `docs/05-laws-of-ux.md` bevat de ontwerpprincipes om keuzes aan te toetsen.

## Stand van zaken in `app/`

Gebouwd en werkend: startscherm met landschap en vertrektransitie, het canvas met alle blokken, navigatie, minimap, risicomodus met scenarioknoppen, tooltips, infoknop met bronnenkaart, deelknop, en de 3D-woonkamer. Het buurtblok haalt gemalen en molens live op uit de Landschapsatlas (RCE). De overige teksten en cijfers staan nog in `app/data/place.ts` (Middelburg) en wachten op het koppelvlak.

### 3D-woonkamer

De Unity WebGL-build staat in `app/public/woonkamer/` en is bewust niet in git (te groot, zie `.gitignore`); de bron staat in `unity/`. `UnityRoom.tsx` laadt hem via `mount()` uit `woonkamer/unity-embed.js`, pas nadat een adres is gekozen. Tijdens het laden staat de render-png met een voortgangsbalk; mislukt het laden, dan blijft de png staan. Het canvas heeft `pointer-events: none`, zodat het grid eroverheen blijft scrollen; interactie met de kamer kan via de knop "volledig scherm".

### Navigatie en afwerking

Het canvas is 256vh hoog, zodat ook het onderste blok (gemalen) in het midden kan staan. Scrollt iemand tot vlak bij een blok (binnen 30% van het scherm), dan schuift `useCanvas` het blok af (`snap`, op `scrollend`); een lopende klik op de navigatie wordt daarbij met rust gelaten. De tijdlijnstappen schuiven één voor één in zodra het tijdreisblok het dichtstbijzijnde blok is (class `in` op `#p-tijd`). De lijst in het gemalenblok scrolt in zijn eigen kolom (`.buurt .side`). Alle blokken en vaste elementen hebben een zachte schaduw (`--shadow`); de knoppen "Over" en "Deel" zijn donker, de minimap ook.

### Rondleiding

Na elke zoekopdracht (en via "Rondleiding opnieuw" in de Over-kaart) verschijnt `Rondleiding.tsx`: één kaartje in vier stappen, kaart, tijdreis, gemalen, huiskamer. Elke stap scrolt het grid naar zijn blok via `useCanvas` en laat de menuknop oplichten; bij de laatste stap pulseert "Als het misgaat" en heet Verder "Zelf proberen", wat de misgaatstand aanzet. Terug, Verder, de tekstlink "Rondleiding overslaan", pijltjestoetsen, Enter en Escape. Op telefoons is het kaartje een balk onderaan: het menu is dan verborgen, de knoppen staan als labels in de tekst, met pijlknoppen en vier puntjes. Een klik op het menu stopt de rondleiding. Het kaartje meldt zijn hoogte aan het canvas (`setInset`), zodat het blok erboven in beeld komt.

### Copy

De teksten zijn aangepast (startscherm, "Welkom thuis", infokaart, gemalenblok, navigatie, regenknoppen, bronnenkaart). In de infokaart variëren hoogte, boven/onder, gemaal, waterschap en jaartal per adres; die velden staan in `PlaceData`.

## Plan: bouwen in React (`app/`)

Het team bouwt de app in `app/`: React Router 8 (framework mode) met Vite, TypeScript en pnpm. Leaflet staat er al in voor kaarten. Dit html-prototype is daarbij de ontwerpreferentie.

- **Css.** Neem de css zo veel mogelijk over, als één globaal bestand of als css modules per component. De design tokens staan in `:root`.
- **Componenten** in `app/components/`, ongeveer één per blok: `StartScreen` (met `Landscape` en `SearchBar`), `Canvas`, `HuiskamerPanel`, `InfoPanel` (modus info of risico), `ScenarioControls`, `TijdreisPanel`, `BuurtPanel`, `NlMap`, `ImageTile`, `FloatingNav`, `MiniMap`, `Tooltip`.
- **State.** Op app-niveau: gekozen adres, modus (`info` of `risk`) en de scenario-keuzes (regen, gemaal, dijk). De waterlijn in de huiskamer volgt die state. Het adres kan in de url (`?q=`), net als in `prototype/`.
- **Data.** Haal alles per adres op via het koppelvlak van de datalaag in `prototype/` (zie ook `docs/04-integration-layer-api.md`). Geen data hardcoden in componenten.
- **Gedrag om te behouden.** Gecentreerd scrollen per sectie (`go(key)`), het vignet via css-mask, de vertrektransitie, tooltips met hover, focus en tik, en `prefers-reduced-motion`.
- **Volgorde.** Bouw eerst het grid en de navigatie na en check dat het er hetzelfde uitziet. Pas daarna de data koppelen.

## Animaties en interactie (specificatie)

Alles staat werkend in `index.html`. Deze lijst is de specificatie bij een herbouw.

### Startscherm
- **Cursor.** Eigen dikke cursor (3 px breed), knippert elke 1,05 s en volgt de getypte tekst. De echte cursor is verborgen (`caret-color: transparent`). Het veld heeft autofocus.
- **Parallax.** Drie landschapslagen schuiven mee met de muis, maximaal 24 px maal een factor per laag (0,25, 0,6 en 1,1).
- **Landschap.**
  - De molen draait in 18 s per rondje, de verre molen in 32 s.
  - De wolken drijven 30 px heen en weer, in 24 en 32 s.
  - De golven deinen 5 px in 3,4 s.
  - Het water in de sloten stroomt via stroke-dashoffset in 7 s.
  - Uit het gemaal komt rook, drie bolletjes die om de 2 s opstijgen in een cyclus van 6 s.
  - Het riet wiegt 5 graden in 4,5 s.
- **Vertrektransitie** na zoeken of het kiezen van een voorbeeldplek:
  1. De tekst schuift omhoog en vervaagt (0,35 s).
  2. Een oranje speld valt met een stuit (0,7 s, start na 0,2 s).
  3. De lagen zoomen in, schaal 1,3, 2 en 3 met een kleine verschuiving naar beneden (1,2 s, start na 0,25 s, oorsprong 56% 80%).
  4. Na 1,15 s vervaagt het startscherm (0,5 s) en zoomt het grid in van schaal 0,92 naar 1 (0,8 s).
- **Begin-knop.** Zet alles terug zonder animatie, leegt het veld en geeft het focus.

### Canvas
- **Scrollen.** Vrij in twee richtingen. Navigatieknoppen scrollen vloeiend naar een vaste positie: huiskamer en info samen gecentreerd, tijdreis bovenin uitgelijnd (90 px onder de bovenrand), buurt gecentreerd.
- **Actieve knop.** Volgt het blok dat het dichtst bij het midden van het scherm ligt. Bij de huiskamer telt ook de modus mee.
- **Vignet.** Css-mask op `#world` met een vervaging van 14vmin aan alle randen. Zit vast aan het scherm.
- **Minimap.** Toont alle blokken op schaal plus een kader van wat je ziet. Klik op een blok om erheen te scrollen.

### Huiskamer en "Als het misgaat"
- **Modus wisselen.** Het infoblok kruisfadet tussen info en scenario (0,35 s vervagen, 0,45 s omhoog schuiven, de nieuwe inhoud start na 0,12 s). In de risicomodus wordt het blok donker en krijgt de huiskamer een oranje rand met gloed.
- **Water.** De hoogte animeert in 0,7 s. De waterlijn en de uitlegkaart verschijnen alleen in de risicomodus.
- **Scenarioknoppen.** Segmentknoppen, één keuze per rij. De berekening en de tekst updaten direct.

### Overig
- **Buurt.** Stippen op de kaart en regels in de lijst zijn aan elkaar gekoppeld. Klik op een van beide om ze samen te markeren en de details te tonen.
- **NL-kaart.** De speld verplaatst naar de gekozen plaats (0,6 s met een stuit) en heeft een puls die elke 2 s uitdijt.
- **Tooltips.** Openen op hover, focus en tik. Ze sluiten met Escape, bij nog een tik, of als je scrollt. Ze worden boven het element geplaatst en eronder als er boven geen ruimte is. Elke tooltip heeft `role="tooltip"` en `aria-describedby`.
- **Minder beweging.** Met `prefers-reduced-motion` staan alle landschapsanimaties, de cursor en de speld stil, en slaat de vertrektransitie over naar een directe wissel.
