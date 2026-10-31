# Droge Voeten

**Wie houdt jouw voeten droog?**

Een kwart van Nederland ligt onder zeeniveau, maar bijna niemand weet hoe zijn eigen straat droog is geworden, of wie hem nu droog houdt. Droge Voeten is een webapp waarin je een adres of woonplaats typt en daarna ziet hoe hoog je woont, welke gemalen het water wegpompen, hoe het land droog werd en wat er gebeurt als het misgaat. Een 3D-huiskamer laat zien hoe hoog het water daar kan komen.

We maakten het voor de klas. De juf of meester typt op het digibord het adres van de school, en de groep ziet wat er gebeurt als het gemaal stilvalt. Het is gebouwd tijdens **HackaLOD 2026** van het [Netwerk Digitaal Erfgoed](https://netwerkdigitaalerfgoed.nl) door Team De Band.

## Wat je ziet

1. **Startscherm.** Typ een adres of woonplaats (of kies een voorbeeld: Middelburg, Middenbeemster, Nieuwerkerk of Heijningen).
2. **Rondleiding.** Vijf korte stappen leggen het verhaal en de menuknoppen uit. Overslaan kan altijd, en je kunt hem opnieuw starten via **Over**.
3. **Hoogtekaart en huiskamer.** Hoe hoog je woont ten opzichte van zeeniveau (AHN), en je eigen huiskamer in 3D, in een Unity WebGL-build die ook op volledig scherm kan.
4. **Als het misgaat.** Kies een overstroming (LIWO, per hoe vaak het gebeurt) of kijk wat er zonder dijken gebeurt. Het water in de huiskamer stijgt mee.
5. **Tijdreis.** Een tijdlijn van hoe dit land droog werd: indijking of droogmaking, molens en gemalen door de tijd, en wat er vandaag pompt.
6. **Gemalen in de buurt.** Op kaart en in een lijst, met uitleg over wat een gemaal is.
7. **Beelden** uit het Rijksmuseum bij de plek, en een **Deel**-knop met een link naar het adres.

Elke uitspraak heeft een bron. Ontbreekt een bron, dan zegt de app dat, in plaats van iets te verzinnen.

## Data

Alleen open bronnen, live opgehaald per adres of uit onze linked data:

| Onderwerp | Bron |
|---|---|
| Hoogte | Actueel Hoogtebestand Nederland (AHN), Rijkswaterstaat |
| Adressen en kaart | Locatieserver, BAG en BRT, Kadaster via PDOK |
| Gemalen, peilgebieden, waterschappen | Waterschapsregister (IMWA), Het Waterschapshuis |
| Gemalen door de tijd, verdwenen molens | Landschapsatlas, Rijksdienst voor het Cultureel Erfgoed, met de Nederlandse Gemalenstichting |
| Monumenten | Rijksmonumenten, RCE |
| Dijken, polders, oude kaarten | Provincie Zeeland |
| Overstromingen | LIWO (Rijkswaterstaat, Deltares), waterstanden 1953 (Rijkswaterstaat), inundatiekaart 1953 (Provincie Noord-Brabant) |
| Regen | KNMI en Klimaateffectatlas |
| Beelden | Rijksmuseum |
| Koppelingen | Wikidata |

## Opbouw van de repo

We houden de datalaag en de presentatielaag gescheiden, volgens de NDE-visie "Van data naar dienst".

| Map | Wat |
|---|---|
| [`app/`](app/) | De webapp (presentatielaag): React, React Router en Vite, TypeScript, pnpm |
| [`linkeddata/`](linkeddata/) | De datalaag: de bronlagen omgezet naar linked datasets met datasetbeschrijvingen, validatie en SPARQL-notebooks. Zie de [README daar](linkeddata/README.md) |
| [`qlever/`](qlever/) | Een QLever-SPARQL-endpoint met de Rijksmuseum-set en onze linked data uit `linkeddata/`, in één store. De app leest daaruit de tijdlijn en de beelden (`VITE_SPARQL_URL`, standaard `http://localhost:7001`). Zonder endpoint valt de app terug op voorbeeldgegevens en vaste beelden |
| [`prototype/`](prototype/) | Het webprototype van ronde 3 met de eerste datalaag in Python. Zie [`prototype/CONTEXT.md`](prototype/CONTEXT.md) |
| [`unity/`](unity/) | Het Unity-project van de 3D-huiskamer |
| [`design/`](design/) | De ontwerpreferentie: een werkend html-prototype en de ontwerpafspraken |
| [`exploration/`](exploration/) | Verkenning van datasets: SPARQL-notebooks en scripts |

## Zelf draaien

Je hebt Node.js 22 of nieuwer en [pnpm](https://pnpm.io) nodig.

```sh
cd app
pnpm install
pnpm dev
```

Open daarna het adres dat in de terminal staat, meestal `http://localhost:5173/`. Na een `git pull` kunnen er nieuwe pakketten bij zijn: draai dan opnieuw `pnpm install`, anders krijg je een wit scherm.

### De 3D-huiskamer

De Unity-build is 88 MB of meer en staat daarom niet in git. De bron staat in [`unity/`](unity/). De app zoekt de build in `app/public/woonkamer/`. Staat die er niet, dan laat de app een afbeelding van de kamer zien en werkt de rest gewoon. De build komt als `woonkamer.tar.gz` op een GitHub-release (zie `app/scripts/upload-woonkamer.sh` en `download-woonkamer.sh`).

### Publiceren

De workflow [`deploy-pages.yml`](.github/workflows/deploy-pages.yml) bouwt `app/` en zet hem op GitHub Pages, bedoeld voor [drogevoeten.app](https://drogevoeten.app/). Hij start alleen handmatig (Actions, "Deploy app to GitHub Pages", Run workflow). Optioneel zet je de repositoryvariabele `RIJKSMUSEUM_SPARQL` op een publiek HTTPS-endpoint (het QLever-endpoint hierboven).

## Team

- Wendy van der Waal: design
- Daan Meijers: development
- Jari Maijenburg: development
- Wouter de Bruijn: 3D-development

Wat we zelf aan elkaar knoopten, geven we open terug, zodat de volgende verder kan waar wij stopten.
