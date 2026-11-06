# Het SPARQL-endpoint uitrollen

[`site.yml`](site.yml) bouwt de dataset en de QLever-index op je eigen machine en zet ze op een kleine Debian 13-server (1 GB geheugen, 1 vCPU), die alleen de QLever-server draait. De rol is klaar als het endpoint vanaf je eigen machine antwoordt met een aantal triples.

## Vereisten

- **Lokaal:** Ansible (met de collectie `community.docker`, zit in het pakket `ansible`), Docker, `make`, Python 3.
- **Server:** Debian 13 met Python 3. Je inlognaam komt uit je eigen SSH-config: root, of een gebruiker met sudo-rechten. Die config moet gelden voor het adres in [`inventory.yml`](inventory.yml). Poorten 80 en 443 moeten open staan bij de provider.
- **DNS:** een A-record van `data.drogevoeten.app` naar de server, in Cloudflare op "DNS only". Zonder dat kan Caddy geen certificaat halen.

## Draaien

Vul eerst in [`inventory.yml`](inventory.yml) de server in. Daarna:

```bash
cd ansible
ansible-playbook site.yml --ask-become-pass
```

Laat `--ask-become-pass` weg als je als root inlogt of als sudo geen wachtwoord vraagt. De eerste keer duurt het oogsten lang: de bronlagen en daarna het Rijksmuseum (~10 min).

## Wat er gebeurt

**Lokaal:**
1. `make harvest` in `linkeddata/`: de bronlagen in `raw/`.
2. `make` in `linkeddata/`: `build/droge-voeten.nt`.
3. `make rijksmuseum` in `linkeddata/`: `build/rijksmuseum/`. Na een echte oogst toont de playbook hoeveel verzoeken zijn gelukt en mislukt. Mislukte verzoeken worden overgeslagen en stoppen de playbook niet. Vind je het te veel, verwijder dan het oogstbestand (zie [Bijwerken](#bijwerken)) en draai de playbook opnieuw.
4. `qlever/compose.sh build`: de index. Dit stopt een lokale QLever-server. Ontbreekt een dataset of is die leeg, dan stopt de playbook hier met een fout.

**Op de server:**
5. Docker installeren met de Debian-pakketten `docker.io`, `docker-cli` en `docker-compose`.
6. `docker-compose.yml`, de Caddyfile, de Qleverfile en de index kopiëren naar `~/sparql` van de gebruiker `drogevoeten`, die de playbook zo nodig aanmaakt en die QLever draait. De brondata gaat niet mee: de server leest alleen de index. De Qleverfile krijgt daar kleinere geheugeninstellingen en een willekeurig toegangstoken, dat lokaal in `qlever/.access-token` staat.
7. Caddy en de QLever-server starten, opnieuw als er iets is veranderd, en het endpoint controleren.

Opnieuw draaien is veilig: wat er al is wordt overgeslagen en alleen gewijzigde bestanden gaan over de lijn.

## Bijwerken

| Wat | Hoe |
|---|---|
| Linked data opnieuw bouwen | `rm linkeddata/build/droge-voeten.nt` en draai de playbook |
| Rijksmuseum opnieuw oogsten | `rm linkeddata/build/rijksmuseum/rijksmuseum-linked-art.nt` en draai de playbook |
| Bronlagen opnieuw oogsten | `rm -r linkeddata/raw linkeddata/build/droge-voeten.nt` en draai de playbook |
