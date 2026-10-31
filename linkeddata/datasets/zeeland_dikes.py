"""Provincie Zeeland 'Dijken, dammen en wallen' (cultuurhistorie) -> linked data. PLAN.md dataset 7."""
import config
from datasets import common as c
from lib import model as m
from lib.source import load_layer, value
from lib.terms import FIELDS

NGR_ID = "e5c91c39-8cff-435f-a45d-3218e4584d5c"
LAYER = "chs:ext_chs_dykdamwalzld"
META = {
    "slug": "zeeland-dikes", "module": "zeeland_dikes",
    "name": "Dijken, dammen en wallen in Zeeland (Provincie Zeeland) als linked data",
    "description": (
        "Dijken, dammen en wallen uit de cultuurhistorische kaart van de Provincie Zeeland: oorspronkelijke en latere "
        "functie, status, aanlegperiode, verdwijnen, polder, bijzonderheden, literatuur en afbeelding. Omgezet volgens "
        "het NDE-Schema.org-toepassingsprofiel."),
    "license": config.CC0, "spatial": config.GEONAMES_ZEELAND,
    "about": ["https://data.cultureelerfgoed.nl/term/id/cht/c615eaa4-85a7-4f2b-9a96-02aa766e8331"],  # CHT 'dijken'
    "keywords": ["dijk", "dam", "wal", "Zeeland", "waterkering"],
    "sources": [c.zld(NGR_ID, "Dijken, dammen en wallen (Provincie Zeeland)",
                      "Cultuurhistorische kaartlaag met dijken, dammen en wallen in Zeeland.", LAYER)],
}
FIELDS.update({
    "dike-original-function": ("Original function of the dike (Provincie Zeeland)", "Oorspronkelijke functie van de dijk (Provincie Zeeland)"),
    "dike-later-function": ("Later function of the dike (Provincie Zeeland)", "Latere functie van de dijk (Provincie Zeeland)"),
    "dike-status": ("Status of the dike (Provincie Zeeland)", "Status van de dijk (Provincie Zeeland)"),
})


def convert(g, terms, dataset):
    features, _ = load_layer("zld_ext_chs_dykdamwalzld.json")
    stats = c.new_stats(len(features))
    keys = c.Keys(META["slug"])
    for f in features:
        p = f["properties"]
        key = value(p["bron_id"]) or f"objectid-{p['objectid']}"
        if not value(p["bron_id"]):
            stats["overgeslagen"]["geen bron_id: sleutel objectid (instabiel)"] += 1
        r = m.mint("dike", keys.add(key))
        func, polder = value(p["oorsprfunc"]), value(p["polder"])
        name = c.missing_name(value(p["naam"]), f"{func or 'Dijk'} in {polder or 'Zeeland'}", stats)
        src = c.zld_uri(LAYER, f["id"])
        m.record(g, r, ["CreativeWork"], dataset, src, name)
        m.object_type(g, terms, r, "dike")
        terms.link(g, r, m.s("additionalType"), "dike-original-function", func, url_cotype=True)
        terms.link(g, r, m.dv("laterFunction"), "dike-later-function", value(p["naspfunc"]))
        terms.link(g, r, m.s("creativeWorkStatus"), "dike-status", value(p["status"]))
        beg, ein, ind = c.year(p["aanleg_beg"]), c.year(p["aanleg_ein"]), c.year(p["aanleg_ind"])
        if beg and (ein in (None, beg)) and (ind in (None, beg)):
            g.add(r, m.s("dateCreated"), m.gyear(beg))
        elif beg or ein or ind:
            text = ", ".join(f"{lbl} {v}" for lbl, v in (("begin", beg), ("eind", ein), ("indicatiejaar", ind)) if v)
            m.add_event(g, terms, r, "construction", name, beg, ein, f"aanleg: {text}", "periode", src)
        for y in (beg, ein, ind):
            if y:
                stats["years"].append(y)
        start, end, prec, text = m.dating(value(p["verdwenen"]))
        m.add_event(g, terms, r, "disappearance", name, start, end, text, prec, src)
        terms.link_place(g, r, m.dv("inPolder"), "polder", polder, "Zeeland")
        g.add(r, m.s("locationCreated"), m.position(g, terms, r, name, geom=f["geometry"]))
        m.describe(g, r, [(None, value(p["bijzonderh_uitg"]) or value(p["bijzonderh"]))])
        g.add(r, m.s("citation"), m.nl(value(p["bron_data_uitg"]) or value(p["bron_data"])))
        bron_geo = value(p["bron_geo"])
        g.add(r, m.s("citation"), m.nl(bron_geo if bron_geo and len(bron_geo) > 2 else None))
        m.image(g, r, value(p["afbeelding"]))
        m.identifier(g, r, "source-id", "bron-id (Provincie Zeeland, cultuurhistorie)", value(p["bron_id"]))
        stats["records"] += 1
    return stats
