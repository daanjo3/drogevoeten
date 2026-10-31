"""Provincie Zeeland 'Polders per bedijkingsperiode' (7 layers, cultuurhistorie) -> linked data. PLAN.md dataset 8."""
import config
from datasets import common as c
from lib import model as m
from lib.source import load_layer, value, zld_code_uri

NGR_ID = "bfcfbdbf-0c42-4333-93eb-742ab69b9a75"
LAYERS = [  # layer, period of the layer (used only when a polder has no date of its own)
    ("geocmd_chspld_vr1300vvl", "vóór 1300"), ("geocmd_chspld13001421vvl", "1300-1421"),
    ("geocmd_chspld14221532vvl", "1422-1532"), ("geocmd_chspld15331648vvl", "1533-1648"),
    ("geocmd_chspld16491808vvl", "1649-1808"), ("geocmd_chspld18091953vvl", "1809-1953"),
    ("geocmd_chspld_na1953vvl", "na 1953")]
META = {
    "slug": "zeeland-polders", "module": "zeeland_polders",
    "name": "Polders in Zeeland per bedijkingsperiode (Provincie Zeeland) als linked data",
    "description": (
        "Zeeuwse polders uit de cultuurhistorische kaart van de Provincie Zeeland, ingedeeld naar bedijkingsperiode: "
        "naam, datering van de indijking zoals in de bron, gemeente, adres en het cultuurhistorische rapport. Omgezet "
        "volgens het NDE-Schema.org-toepassingsprofiel."),
    "license": config.CC0, "spatial": config.GEONAMES_ZEELAND,
    "about": ["https://data.cultureelerfgoed.nl/term/id/cht/57fc851e-b0b1-45c5-8226-5e9cd60537a5"],  # CHT 'polders'
    "keywords": ["polder", "indijking", "Zeeland"],
    "sources": [dict(c.zld(NGR_ID, "Polders per bedijkingsperiode (Provincie Zeeland)",
                           "Cultuurhistorische kaartlagen met Zeeuwse polders, één laag per bedijkingsperiode.",
                           "chs:" + LAYERS[0][0]),
                     downloads=[c.zld(NGR_ID, "", "", "chs:" + layer)["download"] for layer, _ in LAYERS])],
}


def merge(geoms):
    """Several parts of one polder -> one MultiPolygon."""
    polys = []
    for gm in geoms:
        polys += [gm["coordinates"]] if gm["type"] == "Polygon" else gm["coordinates"]
    return {"type": "MultiPolygon", "coordinates": polys}


def convert(g, terms, dataset):
    parts = {}  # code -> list of (layer, period, feature)
    total = 0
    for layer, period in LAYERS:
        features, _ = load_layer(f"zld_{layer}.json")
        total += len(features)
        for f in features:
            parts.setdefault(f["properties"]["code"], []).append((layer, period, f))
    stats = c.new_stats(total)
    keys = c.Keys(META["slug"])
    for code, items in parts.items():
        layer, period, f = items[0]
        p = f["properties"]
        if len(items) > 1:
            stats["overgeslagen"]["polder in meerdere delen samengevoegd tot één record"] += 1
            if len({(it[2]["properties"]["naam"], it[2]["properties"]["periodevan"]) for it in items}) > 1:
                stats["overgeslagen"][f"delen van {code} verschillen in naam of datering; eerste deel gebruikt"] += 1
        r = m.mint("polder", keys.add(code))
        name = c.missing_name(value(p["naam"]), f"Polder {code}", stats)
        src = zld_code_uri("chs:" + layer, code)
        m.record(g, r, ["Place"], dataset, src, name)
        m.object_type(g, terms, r, "polder")
        start, end, prec, text = m.dating(value(p["periodevan"]))
        if start is None and end is None:  # no date of its own: the period of the layer, said so
            start, end, prec, _ = m.dating(period)
            text = f"{period} (periode van de kaartlaag; geen eigen datering)"
        m.add_event(g, terms, r, "embankment", name, start, end, text, prec, src)
        for y in (start, end):
            if y:
                stats["years"].append(y)
        terms.link_place(g, r, m.s("containedInPlace"), "municipality", c.municipality(p["gemeente"]), scoped=False)
        m.address(g, r, street=value(p["straat"]), locality=value(p["plaats"]))
        m.report_document(g, r, value(p["reportlink"]), f"Cultuurhistorisch rapport: {name}")
        geoms = [it[2]["geometry"] for it in items if it[2]["geometry"]]
        m.point_on_record(g, r, merge(geoms) if len(geoms) > 1 else (geoms[0] if geoms else None))
        m.identifier(g, r, "geo-object-id", "geo-objectcode (Provincie Zeeland, cultuurhistorie)", code)
        stats["records"] += 1
    return stats
