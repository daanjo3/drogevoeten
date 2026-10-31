"""RCE Landschapsatlas 'Landinrichting in Nederland (1924-2015)' -> linked data. PLAN.md dataset 5."""
import config
from datasets import common as c
from lib import model as m
from lib.source import load_layer, norm, value
from lib.terms import FIELDS

NGR_ID = "ceb8c100-6ce8-4bb1-8084-2b5b215064e9"
META = {
    "slug": "land-consolidation", "module": "land_consolidation",
    "name": "Landinrichting in Nederland 1924-2015 (RCE Landschapsatlas) als linked data",
    "description": (
        "Ruilverkavelingen en andere landinrichtingsprojecten uit de Landschapsatlas van de Rijksdienst voor het "
        "Cultureel Erfgoed: vorm van landinrichting, status, oppervlakte, provincie en de jaren van voorbereiding, "
        "goedkeuring, uitvoering, akte en afsluiting. Omgezet volgens het NDE-Schema.org-toepassingsprofiel."),
    "license": config.CC0, "spatial": config.GEONAMES_NL,
    "about": ["https://data.cultureelerfgoed.nl/term/id/cht/f2c78f68-c736-493c-b7d6-273413c26ade"],  # CHT 'landinrichtingsgebied'
    "keywords": ["landinrichting", "ruilverkaveling", "landschap"],
    "sources": [c.rce(NGR_ID, "Landinrichting in Nederland 1924-2015 (RCE Landschapsatlas)",
                      "Kaartlaag met landinrichtingsprojecten in Nederland.", "landschapsatlas:LandinrichtingNL")],
}
FIELDS.update({
    "land-consolidation-form": ("Form of land consolidation", "Vorm van landinrichting"),
    "land-consolidation-status": ("Status of the land consolidation project", "Status van het landinrichtingsproject"),
})
MILESTONES = (("jaarvoor", "preparation"), ("jaargoed", "approval"), ("jaaruitv", "execution"),
              ("jaarakte", "deed"), ("jaarafsl", "completion"))


def convert(g, terms, dataset):
    features, _ = load_layer("rce_LandinrichtingNL.json")
    stats = c.new_stats(len(features))
    keys = c.Keys(META["slug"])
    for f in features:
        p = f["properties"]
        r = m.mint("land-consolidation-project", keys.add(p["objectid"]))  # DECISIONS.md 28: objectid
        name = c.missing_name(value(p["labelnaam"]), "Landinrichtingsproject", stats)
        src = c.rce_uri("LandinrichtingNL", f["id"])
        m.record(g, r, ["Place"], dataset, src, name)
        alt = value(p["projnaam"])
        if alt and norm(alt) != norm(name):
            g.add(r, m.s("alternateName"), m.nl(alt))
        m.object_type(g, terms, r, "land-consolidation-project")
        terms.link(g, r, m.s("additionalType"), "land-consolidation-form", value(p["livorm_oms"]), url_cotype=True)
        terms.link(g, r, m.dv("status"), "land-consolidation-status", value(p["status"]))
        for field, kind in MILESTONES:
            y = c.year(p[field])
            if y:
                m.add_event(g, terms, r, kind, name, y, None, str(y), "jaar", src)
                stats["years"].append(y)
        area = p.get("bropperv")
        if isinstance(area, (int, float)) and area > 0:
            pv = m.part(r, "area")
            g.add(pv, m.A, m.s("PropertyValue"))
            g.add(pv, m.s("name"), m.nl("bruto oppervlakte"))
            g.add(pv, m.s("value"), m.decimal(area, 2))
            g.add(pv, m.s("unitCode"), m.plain("HAR"))
            g.add(pv, m.s("unitText"), m.plain("ha"))
            g.add(r, m.s("additionalProperty"), pv)
        terms.link_place(g, r, m.s("containedInPlace"), "province", c.province(p["provincie"]), scoped=False)
        m.point_on_record(g, r, f["geometry"])
        if p.get("proj_num"):
            m.identifier(g, r, "project-id", "projectnummer landinrichting", p["proj_num"])
        if p.get("crnummer"):
            m.identifier(g, r, "cr-id", "crnummer landinrichting", p["crnummer"])
        stats["records"] += 1
    return stats
