# SHACL-shapes

`make shapes` haalt twee sets op. De `.ttl`-bestanden staan niet in git.

| Bestand | Bron | Versie | Waarvoor |
|---|---|---|---|
| `schema-profile-shacl.ttl` | `netwerk-digitaal-erfgoed/schema-profile`, `shacl.ttl` | commit `8949539a8afd0c7702b02412b26eb119f64be7b1` (29-10-2026, profiel v1.7.0) | de records in `build/<dataset>.ttl` |
| `datasetregister-shacl.ttl` | `https://datasetregister.netwerkdigitaalerfgoed.nl/api/shacl` | niet vast te pinnen; opgehaald op 30-10-2026 (Requirements for Datasets v1.16.0) | `build/catalog.ttl` |

De shapes van het Datasetregister bevatten twee "probe"-controles (is een download online bereikbaar, klopt het Content-Type). Die voert het register zelf uit; ze hebben geen SHACL-validator. `validate.py` laat ze lokaal weg en meldt dat.
