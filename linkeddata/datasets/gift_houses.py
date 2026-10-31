"""Provincie Zeeland 'Geschenkwoningen watersnoodramp 1953' -> linked data. PLAN.md dataset 9."""
import config
from datasets import common as c
from lib import model as m
from lib.source import load_layer, value
from lib.terms import FIELDS

NGR_ID = "a04a860d-296d-45c2-8fc0-2e34750c5c90"
LAYER = "chs:geocmd_gskwnn_53pnt"
META = {
    "slug": "gift-houses-1953", "module": "gift_houses",
    "name": "Geschenkwoningen na de watersnoodramp van 1953 (Provincie Zeeland) als linked data",
    "description": (
        "Woningen die na de watersnoodramp van 1953 door andere landen zijn geschonken, uit de inventarisatie van de "
        "Provincie Zeeland (Zeeland en Zuid-Holland): adres, land van herkomst, bouwvorm, datering, materiaal, "
        "beschermingsstatus, herkenbaarheid en foto's. Omgezet volgens het NDE-Schema.org-toepassingsprofiel. "
        "Gegevens over eigenaren zijn bewust niet overgenomen."),
    "license": config.CC0, "spatial": [config.GEONAMES_ZEELAND, config.GEONAMES_ZUID_HOLLAND],
    "about": [],  # no fitting CHT term ('noodwoningen' means something else; DECISIONS.md 28)
    "keywords": ["geschenkwoning", "watersnoodramp 1953", "wederopbouw"],
    "sources": [c.zld(NGR_ID, "Geschenkwoningen watersnoodramp 1953 (Provincie Zeeland)",
                      "Inventarisatie van geschenkwoningen na de watersnoodramp van 1953.", LAYER, licence=config.CC0)],
}
FIELDS.update({
    "gift-house-protection": ("Protection status of the gift house (Provincie Zeeland)", "Beschermingsstatus van de geschenkwoning (Provincie Zeeland)"),
    "house-form": ("House form (Provincie Zeeland)", "Hoofdvorm van de woning (Provincie Zeeland)"),
    "facade-material": ("Facade material (Provincie Zeeland)", "Gevelmateriaal (Provincie Zeeland)"),
    "roofing": ("Roofing (Provincie Zeeland)", "Dakbedekking (Provincie Zeeland)"),
})
# R24: clear compounds whose parts also occur on their own (DECISIONS.md 27). R22: one spelling error.
HOUSE_FORM_SPLITS = {"Vrijstaand. Zomerwoning": ["Vrijstaand", "Zomerwoning"]}
FACADE_SPLITS = {"Kunststof en stuc": ["Kunststof", "Stuc"], "Stuc en hout": ["Stuc", "Hout"]}
FACADE_SPELLING = {"Versteeld geheel": "Versteend geheel"}


def convert(g, terms, dataset):
    features, _ = load_layer("zld_geocmd_gskwnn_53pnt.json")
    stats = c.new_stats(len(features))
    keys = c.Keys(META["slug"])
    for f in features:
        p = f["properties"]
        key = value(p["objectnummer"])
        if key in keys.seen:  # DECISIONS.md 28: duplicate records (same address) are merged
            stats["overgeslagen"][f"dubbel record {key} samengevoegd (eerste gebruikt)"] += 1
            continue
        r = m.mint("gift-house", keys.add(key))
        number = f"{value(p['huisnummer']) or ''}{value(p['huisnummer_toevoeging']) or ''}"
        street = " ".join(x for x in (value(p["straat"]), number) if x)
        town = value(p["plaats"])
        name = f"Geschenkwoning {street}, {town}"  # built from source fields; the source has no name (R2)
        m.record(g, r, ["CreativeWork"], dataset, c.zld_filter_uri(LAYER, "objectnummer", key), name)
        m.object_type(g, terms, r, "gift-house")
        start, end, prec, text = m.dating(value(p["datering"]))
        if prec == "jaar":
            g.add(r, m.s("dateCreated"), m.gyear(start))
        else:
            m.add_event(g, terms, r, "construction", name, start, end, text, prec)
        if start:
            stats["years"].append(start)
        terms.link(g, r, m.dv("protectionStatus"), "gift-house-protection", value(p["status"]))
        for part in c.split(p["hoofdvorm"], HOUSE_FORM_SPLITS):
            terms.link(g, r, m.dv("houseForm"), "house-form", part)
        facade = value(p["gevels_materiaal"])
        for part in c.split(FACADE_SPELLING.get(facade, facade), FACADE_SPLITS):
            terms.link(g, r, m.s("material"), "facade-material", part, url_cotype=True)
        terms.link(g, r, m.s("material"), "roofing", value(p["dakbedekking_kleur"]), url_cotype=True)
        terms.link_place(g, r, m.dv("donatedBy"), "country", value(p["land_van_herkomst"]), scoped=False)
        lon, lat = (f["geometry"] or {}).get("coordinates", (None, None))[:2]
        g.add(r, m.s("locationCreated"), m.position(
            g, terms, r, name, lon, lat, locality=town, province=c.province(p["provincie"]),
            municipality=c.municipality(p["gemeente"]), street=street, postal_code=value(p["postcode"])))
        m.describe(g, r, [
            ("Stedenbouwkundige situatie", value(p["stedenbouwkundige_situatie"])), ("Kleur gevels", value(p["kleur_gevels"])),
            ("Bijgebouwen", value(p["bijgebouwen"])), ("Herkenbaarheid woning", value(p["herkenbaarheid_woning"])),
            ("Wijzigingen woning", value(p["wijzigingen_object"])), ("Herkenbaarheid ensemble", value(p["herkenbaarheid_ensemble"])),
            ("Wijzigingen ensemble", value(p["wijzigingen_ensemble"])), ("Opmerkingen", value(p["opmerkingen"]))])
        for n, k in enumerate(("fotoa", "fotob", "fotoc"), 1):
            m.image(g, r, value(p[k]), local=f"image-{n}")
        m.identifier(g, r, "inventory-id", "objectnummer (inventarisatie geschenkwoningen)", key)
        stats["records"] += 1
    return stats
