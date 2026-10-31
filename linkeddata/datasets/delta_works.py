"""Provincie Zeeland 'Deltawerken' (cultuurhistorie) -> linked data. PLAN.md dataset 10b."""
import config
from datasets import common as c
from lib import model as m
from lib.source import load_layer, value, zld_code_uri

NGR_ID = "2b81ed49-78b2-4fe1-a221-c70e8b6ac55b"
LAYER = "chs:geocmd_chsdltwrkvln"
META = {
    "slug": "delta-works", "module": "delta_works",
    "name": "Deltawerken in Zeeland (Provincie Zeeland) als linked data",
    "description": (
        "Dammen en keringen van de Deltawerken uit de cultuurhistorische kaart van de Provincie Zeeland: naam, periode "
        "van aanleg, gemeente, adres en het cultuurhistorische rapport. Omgezet volgens het NDE-Schema.org-toepassingsprofiel."),
    "license": config.CC0, "spatial": config.GEONAMES_ZEELAND,
    "about": ["https://data.cultureelerfgoed.nl/term/id/cht/bd31cd7f-3289-4520-98f2-e566edb35bcf"],  # CHT 'Deltawerken'
    "keywords": ["Deltawerken", "dam", "stormvloedkering", "Zeeland"],
    "sources": [c.zld(NGR_ID, "Deltawerken (Provincie Zeeland)", "Cultuurhistorische kaartlaag met de Deltawerken in Zeeland.", LAYER)],
}


def convert(g, terms, dataset):
    features, _ = load_layer("zld_geocmd_chsdltwrkvln.json")
    stats = c.new_stats(len(features))
    keys = c.Keys(META["slug"])
    for f in features:
        p = f["properties"]
        code = keys.add(p["code"])
        r = m.mint("delta-work", code)
        name = c.missing_name(value(p["naam"]), f"Deltawerk {code}", stats)
        src = zld_code_uri(LAYER, code)
        m.record(g, r, ["CreativeWork"], dataset, src, name)
        m.object_type(g, terms, r, "delta-work")
        y = m.dated(g, terms, r, "construction", name, value(p["periodevan"]), src)
        if y:
            stats["years"].append(y)
        g.add(r, m.s("locationCreated"), m.position(
            g, terms, r, name, geom=f["geometry"], municipality=c.municipality(p["gemeente"]),
            street=value(p["straat"]), address_locality=value(p["plaats"])))
        m.report_document(g, r, value(p["reportlink"]), f"Cultuurhistorisch rapport: {name}")
        m.identifier(g, r, "geo-object-id", "geo-objectcode (Provincie Zeeland, cultuurhistorie)", code)
        stats["records"] += 1
    return stats
