"""Het Waterschapshuis, IMWA kunstwerken (PDOK OGC API) -> linked data, one dataset per kind (PLAN.md dataset 11):
pumping stations, locks and weirs. Licence CC BY-SA 4.0 (the OGC API's licence link). 'capaciteit' is not converted:
the API schema gives no unit (DECISIONS.md 28)."""
import json
import os

import config
from datasets import common as c
from lib import model as m
from lib.source import value
from lib.terms import FIELDS

API = "https://api.pdok.nl/hwh/waterschappen-kunstwerken-imwa/ogc/v2"
FIELDS.update({
    "imwa-function": ("Function of the structure (IMWA)", "Functie van het kunstwerk (IMWA)"),
    "imwa-status": ("Status of the structure (IMWA)", "Status van het kunstwerk (IMWA)"),
})
NO_NAME = {"nvt", "<null>", "none", "null"}  # placeholders in the name field, not names (R2)
KINDS = {  # module kind -> (collection/file, object type, Dutch noun, CHT 'about')
    "pumping-stations": ("gemaal", "pumping-station", "Gemaal", "https://data.cultureelerfgoed.nl/term/id/cht/63e3cea6-22d0-4d8a-b79b-2b8c3d049587"),
    "locks": ("sluis", "lock", "Sluis", "https://data.cultureelerfgoed.nl/term/id/cht/88326f50-39d4-42c8-bec3-28a44ff3e472"),
    "weirs": ("stuw", "weir", "Stuw", "https://data.cultureelerfgoed.nl/term/id/cht/30a6488b-e695-48a0-b361-bd48fb4ae340"),
}


def meta(kind, module, title_nl):
    coll, _, noun, about = KINDS[kind]
    return {
        "slug": f"water-board-{kind}", "module": module,
        "name": f"{title_nl} van de waterschappen (IMWA) als linked data",
        "description": (
            f"{title_nl} uit het open register van de waterschappen (Informatiemodel Waterschappen, IMWA, via PDOK): "
            "naam, code, functie, status, waterbeheerder en ligging. Omgezet volgens het NDE-Schema.org-toepassingsprofiel; "
            "elk object verwijst met prov:wasDerivedFrom naar het object in de OGC API."),
        "license": config.CC_BY_SA, "spatial": config.GEONAMES_NL, "about": [about],
        "keywords": [noun.lower(), "waterschap", "waterbeheer", "IMWA"],
        "sources": [{"iri": f"{API}/collections/{coll}", "name": f"Waterschappen Kunstwerken IMWA: {noun.lower()} (PDOK)",
                     "description": "Kunstwerken (gemalen, sluizen, stuwen) uit het Informatiemodel Waterschappen, via PDOK.",
                     "publisher": "hwh", "license": config.CC_BY_SA, "service": API,
                     "download": f"{API}/collections/{coll}/items?f=json"}],
    }


def make_convert(kind):
    coll, otype, noun, _ = KINDS[kind]

    def convert(g, terms, dataset):
        rows = json.load(open(os.path.join(config.RAW2, f"imwa_{coll}.json"), encoding="utf-8"))
        stats = c.new_stats(len(rows))
        keys = c.Keys(f"water-board-{kind}")
        for p in rows:
            r = m.mint("water-board-structure", keys.add(p["id"]))
            raw_name = value(p["naam"])
            if raw_name and raw_name.strip().lower() in NO_NAME:
                raw_name = None
            code = value(p["code"])
            name = c.missing_name(raw_name, f"{noun} {code or p['id']}", stats)
            m.record(g, r, ["CreativeWork"], dataset, p["uri"], name)
            m.object_type(g, terms, r, otype)
            terms.link(g, r, m.s("additionalType"), "imwa-function", value(p["functie"]), url_cotype=True)
            terms.link(g, r, m.s("creativeWorkStatus"), "imwa-status", value(p["status"]))
            for org in terms.organization(g, "water-board", value(p["waterbeheerder"])):
                g.add(r, m.s("maintainer"), org)
            g.add(r, m.s("locationCreated"), m.position(g, terms, r, name, p.get("lon"), p.get("lat")))
            m.identifier(g, r, "water-board-code", "code van de waterbeheerder", code)
            m.identifier(g, r, "imwa-id", "IMWA-identificatie", p["id"])
            stats["records"] += 1
        return stats
    return convert
