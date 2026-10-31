"""RCE Landschapsatlas 'Droogmakerijen' + 'Molens en gemalen' (the drainage installations used for the reclamation)
-> linked data. PLAN.md dataset 4."""
import config
from datasets import common as c
from lib import model as m
from lib.source import load_layer, value
from lib.terms import FIELDS

NGR_ID = "cd53d540-f499-4850-8053-e1172c97372e"
META = {
    "slug": "drained-lakes", "module": "drained_lakes",
    "name": "Droogmakerijen in Nederland en hun maalinrichtingen (RCE Landschapsatlas) als linked data",
    "description": (
        "Droogmakerijen uit de Landschapsatlas van de Rijksdienst voor het Cultureel Erfgoed (kartering volgens de NAi "
        "Polderatlas): poldertype, jaar en periode van droogmaking, huidig polderpeil en bronnen, met de molens en gemalen "
        "waarmee ze zijn drooggemaakt. Omgezet volgens het NDE-Schema.org-toepassingsprofiel."),
    "license": config.CC0, "spatial": config.GEONAMES_NL,
    "about": ["https://data.cultureelerfgoed.nl/term/id/cht/ff8e83fe-8c42-450a-ad53-f71b399f00c5"],  # CHT 'droogmakerijen'
    "keywords": ["droogmakerij", "polder", "molen", "gemaal", "droogmaking"],
    "sources": [dict(c.rce(NGR_ID, "Droogmakerijen (RCE Landschapsatlas)",
                           "Landelijke kartering van droogmakerijen, met de bijbehorende dataset Molens en Gemalen.",
                           "landschapsatlas:droogmakerijen"),
                     downloads=[c.rce(NGR_ID, "", "", "landschapsatlas:droogmakerijen")["download"],
                                c.rce(NGR_ID, "", "", "landschapsatlas:drgmk_molens_gemalen")["download"]])],
}
FIELDS.update({
    "drained-lake-type": ("Type of polder (NAi Polderatlas)", "Poldertype (NAi Polderatlas)"),
    "drained-lake-structure-type": ("Type of drainage installation", "Soort maalinrichting"),
})


def convert(g, terms, dataset):
    lakes, _ = load_layer("rce_droogmakerijen.json")
    mills, _ = load_layer("rce_drgmk_molens_gemalen.json")
    stats = c.new_stats(len(lakes) + len(mills))
    keys = c.Keys(META["slug"])
    lake_iri = {}
    for f in lakes:
        p = f["properties"]
        r = m.mint("drained-lake", keys.add(p["id"]))
        lake_iri[p["id"]] = r
        name = c.missing_name(value(p["poldernaam"]), "Droogmakerij", stats)
        src = c.rce_uri("droogmakerijen", f["id"])
        m.record(g, r, ["Place"], dataset, src, name)
        m.object_type(g, terms, r, "drained-lake")
        terms.link(g, r, m.s("additionalType"), "drained-lake-type", value(p["nai_polder"]), url_cotype=True)
        y, period = c.year(p["datum_droo"]), value(p["periode"])
        if y == 1549:  # the RCE layer's code for '1550 en eerder' (CONTEXT.md section 9)
            m.add_event(g, terms, r, "reclamation", name, None, 1550, f"1550 en eerder (periode {period})", "voor", src)
        elif y:
            m.add_event(g, terms, r, "reclamation", name, y, None, f"{y} (periode {period})" if period else str(y), "jaar", src)
        if y:
            stats["years"].append(y)
        g.add(r, m.dv("waterLevel"), m.plain(value(p["polderpeil"])))
        m.point_on_record(g, r, f["geometry"])
        for k in ("bron_data", "bron_geo"):
            g.add(r, m.s("citation"), m.nl(value(p[k])))
        stats["records"] += 1
    for f in mills:
        p = f["properties"]
        r = m.mint("drained-lake-structure", keys.add(p["MolGemID"]))
        kind = value(p["type"])
        name = c.missing_name(value(p["naam"]), f"{(kind or 'Maalinrichting').capitalize()} in {value(p['poldernaam'])}", stats)
        m.record(g, r, ["CreativeWork"], dataset, c.rce_uri("drgmk_molens_gemalen", f["id"]), name)
        m.object_type(g, terms, r, "drained-lake-structure")
        terms.link(g, r, m.s("additionalType"), "drained-lake-structure-type", kind, url_cotype=True)
        lon, lat = (f["geometry"] or {}).get("coordinates", (None, None))[:2]
        loc = m.position(g, terms, r, name, lon, lat)
        g.add(r, m.s("locationCreated"), loc)
        g.add(loc, m.s("containedInPlace"), lake_iri.get(value(p["polderID"])))  # same dataset (R11)
        m.identifier(g, r, "rijksmonument-id", "rijksmonumentnummer", value(p["monument_n"]))
        m.identifier(g, r, "ten-bruggencate-id", "Ten Bruggencate-nummer", value(p["tenBruggec"]))
        m.identifier(g, r, "gemalenstichting-id", "Nederlandse Gemalen Stichting gem_id", value(p["ID_gemalen"]))
        stats["records"] += 1
    return stats
