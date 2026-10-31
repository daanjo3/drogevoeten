"""Provincie Zeeland 'Verdronken dorpen' -> linked data. PLAN.md dataset 10."""
import re

import config
from datasets import common as c
from lib import model as m
from lib.source import load_layer, value

NGR_ID = "6eb9a0b2-b751-40a3-9a7d-5f3ed9d78a8b"
LAYER = "chs:geocmd_vrddrppnt"
META = {
    "slug": "drowned-villages", "module": "drowned_villages",
    "name": "Verdronken dorpen in Zeeland (Provincie Zeeland) als linked data",
    "description": (
        "Dorpen die door overstromingen zijn verdwenen, uit de cultuurhistorische kaart van de Provincie Zeeland: "
        "namen, periode van verdrinken, huidige gemeente en Archis- en ZAA-nummers. Omgezet volgens het "
        "NDE-Schema.org-toepassingsprofiel."),
    "license": config.CC0, "spatial": config.GEONAMES_ZEELAND,
    "about": [],  # no fitting CHT term found (DECISIONS.md 28)
    "keywords": ["verdronken dorp", "overstroming", "Zeeland", "archeologie"],
    "sources": [c.zld(NGR_ID, "Verdronken dorpen (Provincie Zeeland)",
                      "Cultuurhistorische kaartlaag met verdronken dorpen in Zeeland.", LAYER)],
}


def numbers(v):
    """'2810695100, 3290733100' -> ['2810695100', '3290733100']; placeholders without digits are dropped."""
    v = value(v)
    return [x.strip() for x in re.split(r"[,;]", v) if re.search(r"\d", x)] if v else []


def convert(g, terms, dataset):
    features, _ = load_layer("zld_geocmd_vrddrppnt.json")
    stats = c.new_stats(len(features))
    keys = c.Keys(META["slug"])
    for f in features:
        p = f["properties"]
        key = keys.add(p["id"])
        r = m.mint("drowned-village", key)
        name = c.missing_name(value(p["naam"]), "Verdronken dorp", stats)
        src = c.zld_filter_uri(LAYER, "id", key)
        m.record(g, r, ["Place"], dataset, src, name)
        for k in ("naam2", "naam3", "naam4"):
            g.add(r, m.s("alternateName"), m.nl(value(p[k])))
        m.object_type(g, terms, r, "drowned-village")
        start, end, prec, text = m.dating(value(p["periode"]))
        m.add_event(g, terms, r, "drowning", name, start, end, text, prec, src)
        if start:
            stats["years"].append(start)
        m.point_on_record(g, r, f["geometry"])
        terms.link_place(g, r, m.s("containedInPlace"), "municipality", c.municipality(p["gemeente"]), scoped=False)
        for field, local, label in (("archis3_nu", "archis-id", "Archis-waarnemingsnummer"),
                                    ("archis2", "archis2-id", "Archis2-waarnemingsnummer")):
            nums = numbers(p[field])
            for n, num in enumerate(nums, 1):
                m.identifier(g, r, local if len(nums) == 1 else f"{local}-{n}", label, num)
        zaa = value(p["zaa"])
        m.identifier(g, r, "zaa-id", "ZAA-nummer (Zeeuws Archeologisch Archief)", zaa if zaa and re.search(r"\d", zaa) else None)
        stats["records"] += 1
    return stats
