"""RCE Landschapsatlas 'Molens' (existing mills, from the Nederlandse Molendatabase) -> linked data. PLAN.md dataset 2."""
import collections

import config
from datasets import common as c
from lib import model as m
from lib.source import load_layer, value
from lib.terms import FIELDS

NGR_ID = "291afe4b-4f4b-497c-8026-fb437c4e9c7e"
META = {
    "slug": "windmills", "module": "windmills",
    "name": "Molens in Nederland (RCE Landschapsatlas) als linked data",
    "description": (
        "Bestaande molens en molenrestanten uit de Landschapsatlas van de Rijksdienst voor het Cultureel Erfgoed: "
        "soort aandrijving, type, (hoofd)functie, staat, bouwjaar, plaats, Ten Bruggencate-nummer, rijksmonumentnummer "
        "en foto. Omgezet volgens het NDE-Schema.org-toepassingsprofiel; elke molen verwijst met prov:wasDerivedFrom "
        "naar het WFS-object van de RCE."),
    "license": config.CC0, "spatial": config.GEONAMES_NL,
    "about": ["https://data.cultureelerfgoed.nl/term/id/cht/0198a25a-3469-469e-8103-a613e32fcdc6"],  # CHT 'molens'
    "keywords": ["molen", "windmolen", "watermolen", "erfgoed"],
    "sources": [c.rce(NGR_ID, "Molens (RCE Landschapsatlas)", "Kaartlaag met bestaande molens en molenrestanten in Nederland.",
                      "landschapsatlas:Molens", licence=config.PDM)],
}
FIELDS.update({
    "windmill-drive": ("Drive of the mill (Molendatabase)", "Aandrijving van de molen (Molendatabase)"),
    "windmill-type": ("Type of mill (Molendatabase)", "Type molen (Molendatabase)"),
    "windmill-function": ("Function of the mill (Molendatabase)", "Functie van de molen (Molendatabase)"),
    "windmill-main-category": ("Main category of the mill (Molendatabase)", "Hoofdcategorie of hoofdfunctie van de molen (Molendatabase)"),
    "windmill-status": ("State of the mill (Molendatabase)", "Staat van de molen (Molendatabase)"),
})


def convert(g, terms, dataset):
    features, _ = load_layer("rce_Molens.json")
    stats = c.new_stats(len(features))
    keys = c.Keys(META["slug"])
    tbgc_count = collections.Counter(f["properties"]["TBGCNUMMER"] for f in features)
    for f in features:
        p = f["properties"]
        tbgc = value(p["TBGCNUMMER"])
        key = tbgc if tbgc_count[tbgc] == 1 else f"{tbgc}-{p['gid']}"  # DECISIONS.md 28: duplicate numbers
        if tbgc_count[tbgc] > 1:
            stats["overgeslagen"][f"dubbel Ten Bruggencate-nummer {tbgc}: sleutel {key}"] += 1
        r = m.mint("windmill", keys.add(key))
        name = c.missing_name(value(p["NAAM"]), f"{value(p['TYPE']) or 'Molen'} in {value(p['PLAATS']) or 'onbekende plaats'}", stats)
        m.record(g, r, ["CreativeWork"], dataset, c.rce_uri("Molens", f["id"]), name)
        m.object_type(g, terms, r, "windmill")
        for field, src in (("windmill-drive", "CATEGORIE"), ("windmill-type", "TYPE"),
                           ("windmill-main-category", "HFDFUNCTIE"), ("windmill-function", "FUNCTIE")):
            terms.link(g, r, m.s("additionalType"), field, value(p[src]), url_cotype=True)
        terms.link(g, r, m.s("creativeWorkStatus"), "windmill-status", value(p["STAAT"]))
        y = c.year(p["BOUWJAAR"])
        if y:
            g.add(r, m.s("dateCreated"), m.gyear(y))
            stats["years"].append(y)
        elif value(p["BOUWJAAR"]):
            stats["overgeslagen"][f"bouwjaar niet te lezen: {p['BOUWJAAR']}"] += 1
        lon, lat = (f["geometry"] or {}).get("coordinates", (None, None))[:2]
        g.add(r, m.s("locationCreated"), m.position(g, terms, r, name, lon, lat, locality=value(p["PLAATS"])))
        m.identifier(g, r, "ten-bruggencate-id", "Ten Bruggencate-nummer", tbgc)
        rmon = value(p["RMONNUMMER"])
        m.identifier(g, r, "rijksmonument-id", "rijksmonumentnummer", rmon if rmon and rmon.isdigit() else None)
        g.add(r, m.s("url"), m.url(value(p["INFOLINK"])))
        foto = value(p["FOTOGRAAF"])
        m.image(g, r, value(p["FOTO_GROOT"]), value(p["THUMBNAIL"]), f"Foto: {foto}" if foto else None)
        stats["records"] += 1
    return stats
