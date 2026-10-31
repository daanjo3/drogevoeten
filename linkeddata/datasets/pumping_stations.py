"""RCE Landschapsatlas 'Gemalen' (data of the Nederlandse Gemalen Stichting) -> linked data."""
import collections
import re

import config
from datasets import common as c
from lib import model as m
from lib.source import feature_uri, load_layer, value
from lib.terms import FIELDS

LAYER = "landschapsatlas:gemalen"
NGR_ID = "c81e0dd2-3e91-44af-aaeb-4dcfed4b8b56"

META = {
    "slug": "pumping-stations",
    "module": "pumping_stations",
    "name": "Gemalen in Nederland (RCE Landschapsatlas) als linked data",
    "description": (
        "Historische en huidige gemalen uit de Landschapsatlas van de Rijksdienst voor het Cultureel Erfgoed, met gegevens "
        "van de Nederlandse Gemalen Stichting: functie, stichtingsjaar, status, oorspronkelijke en huidige aandrijving, "
        "bemalingsgebied, waarop het gemaal loost, beschermingsstatus en foto. Omgezet volgens het NDE-Schema.org-"
        "toepassingsprofiel; elk gemaal verwijst met prov:wasDerivedFrom naar het WFS-object van de RCE."),
    "license": config.CC0,
    "spatial": config.GEONAMES_NL,
    "about": ["https://data.cultureelerfgoed.nl/term/id/cht/63e3cea6-22d0-4d8a-b79b-2b8c3d049587"],  # CHT 'gemalen'
    "keywords": ["gemaal", "waterstaat", "polder", "bemaling"],
    "sources": [{
        "iri": config.NGR + NGR_ID,
        "name": "Gemalen (RCE Landschapsatlas)",
        "description": "Kaartlaag met gemalen in Nederland, gebaseerd op de gegevens van de Nederlandse Gemalen Stichting.",
        "publisher": "rce",
        "license": config.CC0,  # NGR: creativecommons.org/publicdomain/zero/1.0
        "service": config.RCE_WFS,
        "download": f"{config.RCE_WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames={LAYER}&outputFormat=application/json",
    }],
}

FIELDS.update({  # term-set IRI segment -> (English name, Dutch name)
    "object-type": ("Object type", "Soort object"),
    "pumping-station-function": ("Function of the pumping station (Gemalen Stichting)", "Functie van het gemaal (Gemalen Stichting)"),
    "pumping-station-status": ("Status of the pumping station (Gemalen Stichting)", "Status van het gemaal (Gemalen Stichting)"),
    "drive-type": ("Drive of the pumping station", "Aandrijving van het gemaal"),
    "protection-status": ("Heritage protection status", "Beschermingsstatus (monument)"),
})


# Values of 'functie' that clearly name two functions that also occur on their own (DECISIONS.md section 27).
FUNCTION_SPLITS = {"Boezem- en Poldergemaal": ["Boezemgemaal", "Poldergemaal"]}


def convert(g, terms, dataset):
    features, _ = load_layer("rce_gemalen.json")
    stats = {"bron": len(features), "records": 0, "overgeslagen": collections.Counter(), "years": []}
    seen = set()
    for f in features:
        p = f["properties"]
        key = p["id"]
        if key in seen:
            raise SystemExit(f"pumping-stations: dubbele sleutel id={key}")
        seen.add(key)
        r = m.mint("pumping-station", key)
        name = value(p["naam_gemaal"])
        if not name:  # built only from source fields, and says so
            name = f"{value(p['functie']) or 'Gemaal'} in {value(p['plaats']) or 'onbekende plaats'} (naam onbekend)"
            stats["overgeslagen"]["naam onbekend, naam opgebouwd uit functie en plaats"] += 1
        m.record(g, r, ["CreativeWork"], dataset, feature_uri(config.RCE_WFS, LAYER, f["id"]), name)
        m.object_type(g, terms, r, "pumping-station")
        function = value(p["functie"])
        if function in FUNCTION_SPLITS:
            stats["overgeslagen"][f"functie gesplitst: {function}"] += 1
        for part in FUNCTION_SPLITS.get(function, [function]):
            terms.link(g, r, m.s("additionalType"), "pumping-station-function", part, url_cotype=True)
        terms.link(g, r, m.s("creativeWorkStatus"), "pumping-station-status", value(p["status"]))

        year = value(p["stichtingsjaar"])
        if year and re.fullmatch(r"\d{4}", year):
            g.add(r, m.s("dateCreated"), m.gyear(int(year)))
            stats["years"].append(int(year))
        elif year and re.fullmatch(r"\d{4}-\d{2}-\d{2}", year):
            g.add(r, m.s("dateCreated"), m.xdate(year))
            stats["years"].append(int(year[:4]))
        elif year:
            stats["overgeslagen"]["stichtingsjaar niet te lezen: " + year] += 1

        terms.link(g, r, m.dv("originalDrive"), "drive-type", value(p["aandrijving_oorspronkelijk"]))
        terms.link(g, r, m.dv("currentDrive"), "drive-type", value(p["aandrijving_huidig"]))
        terms.link(g, r, m.dv("protectionStatus"), "protection-status", value(p["bescherming"]))

        # Where it stands: own position (coordinates, address) in the shared locality and province.
        lon, lat = (f["geometry"] or {}).get("coordinates", (None, None))[:2]
        region = c.province(p["provincie"])
        g.add(r, m.s("locationCreated"), m.position(g, terms, r, name, lon, lat, value(p["plaats"]), region))

        # Area it drains and water it discharges into: shared local Places per name + province (DECISIONS.md
        # section 8); sameAs only after review, links to real areas in phase 2.
        terms.link_place(g, r, m.dv("drainsArea"), "drained-area", value(p["bemalingsgebied"]), region)
        terms.link_place(g, r, m.dv("dischargesInto"), "receiving-water", value(p["lozend_op"]), region)

        m.identifier(g, r, "gemalenstichting-id", "Nederlandse Gemalen Stichting gem_id", key)
        m.identifier(g, r, "rijksmonument-id", "rijksmonumentnummer", value(p["monumentnr"]))
        g.add(r, m.s("url"), m.url(value(p["infolink"])))
        m.image(g, r, value(p["foto_groot"]), value(p["foto_thumb"]),
                f"Foto: {value(p['fotograaf'])}" if value(p["fotograaf"]) else None)
        stats["records"] += 1
    return stats
