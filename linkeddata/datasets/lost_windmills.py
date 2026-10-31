"""RCE Landschapsatlas 'Verdwenen molens' (from molendatabase.org) -> linked data. PLAN.md dataset 3."""
import collections

import config
from datasets import common as c
from datasets import windmills  # noqa: F401  (registers the shared windmill term sets)
from lib import model as m
from lib.source import load_layer, value

NGR_ID = "7e41f6fa-936d-4fbe-b3b7-fb40dfe1283d"
META = {
    "slug": "lost-windmills", "module": "lost_windmills",
    "name": "Verdwenen molens in Nederland (RCE Landschapsatlas) als linked data",
    "description": (
        "Verdwenen molens uit de Landschapsatlas van de Rijksdienst voor het Cultureel Erfgoed (gegevens van de "
        "database verdwenen molens, molendatabase.org): hoofdcategorie, type, functie, aandrijving, bouwjaar en jaar "
        "van verdwijnen, met de jaartekst zoals in de bron. Omgezet volgens het NDE-Schema.org-toepassingsprofiel."),
    "license": config.CC0, "spatial": config.GEONAMES_NL,
    "about": ["https://data.cultureelerfgoed.nl/term/id/cht/0198a25a-3469-469e-8103-a613e32fcdc6"],  # CHT 'molens'
    "keywords": ["molen", "verdwenen molen", "erfgoed"],
    "sources": [c.rce(NGR_ID, "Verdwenen molens (RCE Landschapsatlas)", "Kaartlaag met verdwenen molens in Nederland.",
                      "landschapsatlas:verdwenenmolens")],
}
# Years that occur conspicuously often (CONTEXT.md section 9); probably collecting years, so never 'certain'.
PEAK_BUILT = (1832, 1560)
PEAK_GONE = (1850, 1929)


def convert(g, terms, dataset):
    features, _ = load_layer("rce_verdwenenmolens.json")
    stats = c.new_stats(len(features))
    keys = c.Keys(META["slug"])
    built = collections.Counter(c.year(f["properties"]["bouwjaar_1"]) for f in features)
    gone = collections.Counter(c.year(f["properties"]["verdwenen1"]) for f in features)
    for f in features:
        p = f["properties"]
        r = m.mint("lost-windmill", keys.add(p["molen_dbnr"]))
        name = c.missing_name(value(p["molen_naam"]), f"{value(p['functie']) or 'Molen'} (verdwenen)", stats)
        src = c.rce_uri("verdwenenmolens", f["id"])
        m.record(g, r, ["CreativeWork"], dataset, src, name)
        m.object_type(g, terms, r, "windmill")
        for field, key in (("windmill-main-category", "hoofdcat"), ("windmill-type", "type"),
                           ("windmill-function", "functie"), ("windmill-drive", "aandrijvin")):
            terms.link(g, r, m.s("additionalType"), field, value(p[key]), url_cotype=True)
        terms.link(g, r, m.s("creativeWorkStatus"), "windmill-status", value(p["status"]))

        y = c.year(p["bouwjaar_1"])
        start, end, prec, text, plain = c.year_with_qualifier(
            y, p["bouwjaar_2"], PEAK_BUILT, f"dit bouwjaar komt in de bron {built[y]}× voor; mogelijk een verzameljaar")
        if plain:
            g.add(r, m.s("dateCreated"), m.gyear(y))
        else:
            m.add_event(g, terms, r, "construction", name, start, end, text, prec, src)
        if y:
            stats["years"].append(y)
        y = c.year(p["verdwenen1"])
        start, end, prec, text, _ = c.year_with_qualifier(
            y, p["verdwenen2"], PEAK_GONE, f"dit jaar van verdwijnen komt in de bron {gone[y]}× voor; mogelijk een verzameljaar")
        m.add_event(g, terms, r, "disappearance", name, start, end, text or (str(y) if y else None), prec, src)
        if y:
            stats["years"].append(y)

        lon, lat = (f["geometry"] or {}).get("coordinates", (None, None))[:2]
        g.add(r, m.s("locationCreated"), m.position(g, terms, r, name, lon, lat))
        m.identifier(g, r, "molendatabase-id", "molendatabase.org verdwenen-molen-nummer", p["molen_dbnr"])
        m.identifier(g, r, "ten-bruggencate-id", "Ten Bruggencate-nummer", value(p["ten_brugge"]))
        g.add(r, m.s("url"), m.url(value(p["infolink"])))
        stats["records"] += 1
    return stats
