"""RCE Landschapsatlas 'Wielen' (dike breach pools) -> linked data. PLAN.md dataset 6."""
import config
from datasets import common as c
from lib import model as m
from lib.source import load_layer, value
from lib.terms import FIELDS

NGR_ID = "a1f41210-4f4b-4821-abe3-fd74efc580d4"
META = {
    "slug": "breach-pools", "module": "breach_pools",
    "name": "Wielen (doorbraakkolken) in Nederland (RCE Landschapsatlas) als linked data",
    "description": (
        "Wielen: diepe plassen die zijn ontstaan bij een dijkdoorbraak, uit de Landschapsatlas van de Rijksdienst voor het "
        "Cultureel Erfgoed: naam, plaats, rivier, oever, stroomgebied, jaar van ontstaan en foto. Omgezet volgens het "
        "NDE-Schema.org-toepassingsprofiel."),
    "license": config.CC0, "spatial": config.GEONAMES_NL,
    "about": [],  # no fitting CHT term found (DECISIONS.md 28)
    "keywords": ["wiel", "dijkdoorbraak", "doorbraakkolk", "rivier"],
    "sources": [c.rce(NGR_ID, "Wielen (RCE Landschapsatlas)", "Kaartlaag met wielen (doorbraakkolken) in Nederland.",
                      "landschapsatlas:wielen")],
}
FIELDS.update({"breach-pool-type": ("Type of breach pool (RCE)", "Soort wiel (RCE)")})


def convert(g, terms, dataset):
    features, _ = load_layer("rce_wielen.json")
    stats = c.new_stats(len(features))
    keys = c.Keys(META["slug"])
    for f in features:
        p = f["properties"]
        r = m.mint("breach-pool", keys.add(p["id"]))  # DECISIONS.md 28: id
        town = value(p["plaats"])
        name = c.missing_name(value(p["naamwiel"]), f"Wiel bij {town or 'onbekende plaats'}", stats)
        src = c.rce_uri("wielen", f["id"])
        m.record(g, r, ["Place"], dataset, src, name)
        g.add(r, m.s("alternateName"), m.nl(value(p["altnmwiel"])))
        m.object_type(g, terms, r, "breach-pool")
        terms.link(g, r, m.s("additionalType"), "breach-pool-type", value(p["type"]), url_cotype=True)
        y = c.year(p["ontstjaar"])
        if y:
            m.add_event(g, terms, r, "dike-breach", name, y, None, str(y), "jaar", src)
            stats["years"].append(y)
        m.point_on_record(g, r, f["geometry"])
        terms.link_place(g, r, m.s("containedInPlace"), "locality", town, None)
        terms.link_place(g, r, m.dv("alongRiver"), "river", value(p["hoofdstr"]), None)
        m.describe(g, r, [("Stroomgebied", value(p["hfdstrgeb"])), ("Oever", value(p["oever"])),
                          ("Dwarsdijk", value(p["dwarsdijk"])), ("Bijzonderheden", value(p["bijzheid"]))])
        photographer = value(p["foto"])
        m.image(g, r, value(p["foto_groot"]), value(p["foto_thumb"]), f"Foto: {photographer}" if photographer else None)
        stats["records"] += 1
    return stats
