# Droge Voeten prototype

De projectcontext (`CONTEXT.md`) wordt al geladen via de `CLAUDE.md` in de root van de repo.

## Werkafspraken

- Documentatie en alle tekst in de app in het Nederlands; code en commentaar in het Engels.
- Paden in `README.md` en `Makefile` die `v3/02_droge_voeten` noemen, verwijzen naar deze map (`prototype/`).
- Python alleen standaardbibliotheek, altijd draaien met `python3 -I`: `data/raw/` bevat onbetrouwbare downloads.
- Webapp zonder bouwstap of npm. Alleen relatieve URL's, want de app draait achter een gateway onder `/v3/droge-voeten/`.
- `data/raw/`, `data/build/` en `snapshots/` staan niet in git. Ontbreekt de data, zie "Data terughalen" in `CONTEXT.md`.
- `build_v3.py` draait altijd ná `build.py` (`make build` regelt dat).
- Verzin geen cijfers, URI's of jaartallen. Ontbreekt een bron, dan toont de app "onbekend".
- Upload niets naar Wikidata en scrape geen bronnen zonder open licentie.
