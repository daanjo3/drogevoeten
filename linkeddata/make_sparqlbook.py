#!/usr/bin/env python3
"""Generate the .sparqlbook notebooks (VS Code extension 'SPARQL Notebook' by Zazuko) and test every query first
with pyoxigraph, the engine the extension uses for local files. The notebook is only written if every query runs
and returns rows without duplicates (e.g. a label in two languages). Development step (needs pyoxigraph):

  uv run --no-project --with pyoxigraph python -I linkeddata/make_sparqlbook.py [notebook ...]   (or: make notebook)

The pumping-stations notebook is defined below; the others are in notebook_cells.py.
"""
import json
import os
import sys

import pyoxigraph as ox

HERE = os.path.dirname(os.path.abspath(__file__))
PFX = """PREFIX schema: <https://schema.org/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX dv: <urn:drogevoeten:def:>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
"""

PUMPING_STATIONS = [
    ("md", """# Gemalen als linked data

Deze notebook bevraagt `build/pumping-stations.ttl`: de gemalen uit de RCE Landschapsatlas (Nederlandse Gemalen Stichting), omgezet volgens het NDE-Schema.org-toepassingsprofiel.

**Eerst:** draai `make` in `linkeddata/`, zodat `build/pumping-stations.ttl` bestaat. Elke query laadt het bestand lokaal (Oxigraph), dus de eerste keer duurt het een paar seconden. Open dit bestand in VS Code met de extensie *SPARQL Notebook* (Zazuko) en klik op ▶ bij een cel.

## Hoe de data is opgebouwd

- **Elk gemaal** is een `schema:CreativeWork` met IRI `urn:drogevoeten:id:pumping-station:<id>`.
- **Wat alleen bij dat gemaal hoort**, heeft een IRI onder het record: de eigen positie `#location` (met `#location-geo` en `#location-address`), de foto `#image` en de nummers `#…-id`.
- **Wat ook bij andere gemalen voorkomt**, is een gedeelde knoop:
  - termen: `urn:drogevoeten:term:<veld>:<waarde>`, elk in een termenset `urn:drogevoeten:termset:<veld>`;
  - plaatsen: woonplaats `place:locality:<provincie>:<naam>`, provincie `place:province:<naam>`, bemalingsgebied `place:drained-area:…`, water `place:receiving-water:…`.
- **De keten van de locatie:** gemaal `schema:locationCreated` → `#location` `schema:containedInPlace` → woonplaats `schema:containedInPlace` → provincie.
- **`schema:sameAs`** naar de Cultuurhistorische Thesaurus, Wikidata of GeoNames staat alleen bij knopen die beoordeeld zijn (status `aangenomen` of `gecontroleerd` in `terms/*.csv`).
- **Talen:** de inhoud is Nederlands (`@nl`). Termen en termensets die wij zelf bedenken (de objectsoort, de namen van de termensets) hebben ook een Engelse naam (`@en`). Het is dan één knoop met twee namen, geen twee termen. Kies daarom in een query altijd één taal: `FILTER(LANG(?naam) = "nl")`."""),

    ("md", "## 1. De datasetbeschrijving\n\nWat zegt de dataset over zichzelf: naam, licentie, maker, periode, gebied en de bronlaag."),
    ("q", """SELECT ?naam ?licentie ?maker ?periode ?gebied ?bron ?bronLicentie ?bronhouder WHERE {
  ?d a schema:Dataset ;
     schema:includedInDataCatalog ?catalogus ;
     schema:name ?naam ;
     schema:license ?licentie ;
     schema:creator/schema:name ?maker ;
     schema:temporalCoverage ?periode ;
     schema:spatialCoverage ?gebied ;
     schema:isBasedOn ?bron .
  ?bron schema:license ?bronLicentie ;
        schema:publisher/schema:name ?bronhouder .
}"""),

    ("md", "## 2. Hoeveel van wat?\n\nAantal knopen per type. Een `DefinedTerm` met co-type `URL` telt bij beide types mee (het profiel vraagt dat bij `additionalType`)."),
    ("q", """SELECT ?type (COUNT(?s) AS ?aantal) WHERE {
  ?s a ?type .
}
GROUP BY ?type
ORDER BY DESC(?aantal)"""),

    ("md", "## 3. Eén gemaal helemaal: het Woudagemaal\n\nAlle eigenschappen van het record, met de Nederlandse naam van de knoop waarnaar ze wijzen."),
    ("q", """SELECT ?eigenschap ?waarde ?naamVanWaarde WHERE {
  <urn:drogevoeten:id:pumping-station:369> ?eigenschap ?waarde .
  OPTIONAL { ?waarde schema:name ?naamVanWaarde FILTER(LANG(?naamVanWaarde) = "nl") }
}"""),

    ("md", "Hetzelfde gemaal als Turtle: het record met zijn eigen delen, plus de gedeelde termen en plaatsen waarnaar het wijst (met hun `sameAs`), tot en met de provincie."),
    ("q", """CONSTRUCT {
  ?s ?p ?o .
} WHERE {
  {
    ?s ?p ?o .
    FILTER(STRSTARTS(STR(?s), "urn:drogevoeten:id:pumping-station:369"))
  } UNION {
    ?r ?x ?gedeeld .
    ?gedeeld schema:containedInPlace* ?s .
    ?s ?p ?o .
    FILTER(STRSTARTS(STR(?r), "urn:drogevoeten:id:pumping-station:369"))
    FILTER(STRSTARTS(STR(?s), "urn:drogevoeten:term:") || STRSTARTS(STR(?s), "urn:drogevoeten:place:"))
    FILTER(?p != schema:inDefinedTermSet)
  }
}"""),

    ("md", "## 4. Gemalen per functie\n\nDe functie is een term in de termenset `pumping-station-function`. De eigen objectsoort \"gemaal\" zit in een andere termenset (`object-type`) en telt hier dus niet mee. \"Boezem- en Poldergemaal\" (4×) is in de omzetting gesplitst in een boezemgemaal én een poldergemaal."),
    ("q", """SELECT ?functie (COUNT(?g) AS ?gemalen) WHERE {
  ?g schema:additionalType ?t .
  ?t schema:inDefinedTermSet <urn:drogevoeten:termset:pumping-station-function> ;
     schema:name ?functie .
  FILTER(LANG(?functie) = "nl")
}
GROUP BY ?functie
ORDER BY DESC(?gemalen)"""),

    ("md", "## 5. Van stoom naar elektro\n\nOorspronkelijke tegenover huidige aandrijving, zoals de bron ze noemt. \"Geen\" is een gewone waarde: het kan bijvoorbeeld betekenen dat het gemaal niet meer werkt."),
    ("q", """SELECT ?oorspronkelijk ?huidig (COUNT(?g) AS ?gemalen) WHERE {
  ?g dv:originalDrive/schema:name ?oorspronkelijk ;
     dv:currentDrive/schema:name ?huidig .
}
GROUP BY ?oorspronkelijk ?huidig
ORDER BY DESC(?gemalen)"""),

    ("md", "## 6. De oudste gemalen die nog in bedrijf zijn"),
    ("q", """SELECT ?naam ?jaar ?woonplaats ?aandrijving WHERE {
  ?g schema:name ?naam ;
     schema:dateCreated ?jaar ;
     schema:creativeWorkStatus/schema:name "In bedrijf"@nl ;
     schema:locationCreated/schema:containedInPlace ?w .
  ?w schema:name ?woonplaats .
  FILTER(STRSTARTS(STR(?w), "urn:drogevoeten:place:locality:"))
  OPTIONAL { ?g dv:currentDrive/schema:name ?aandrijving }
}
ORDER BY ?jaar
LIMIT 15"""),

    ("md", "## 7. Per provincie\n\nVia de gedeelde knopen: gemaal → `#location` → woonplaats → provincie. Met het aantal woonplaatsen en gemalen, hoeveel daarvan in bedrijf zijn, en de koppelingen naar Wikidata en GeoNames (aangenomen, zie `terms/province.csv`)."),
    ("q", """SELECT ?provincie ?wikidata ?geonames (COUNT(DISTINCT ?w) AS ?woonplaatsen) (COUNT(DISTINCT ?g) AS ?gemalen) (COUNT(DISTINCT ?werkt) AS ?inBedrijf) WHERE {
  ?g schema:locationCreated/schema:containedInPlace+ ?prov .
  ?prov schema:name ?provincie .
  FILTER(STRSTARTS(STR(?prov), "urn:drogevoeten:place:province:"))
  OPTIONAL { ?g schema:locationCreated/schema:containedInPlace ?w . ?w schema:containedInPlace ?prov }
  OPTIONAL { ?g schema:creativeWorkStatus/schema:name "In bedrijf"@nl . BIND(?g AS ?werkt) }
  OPTIONAL { ?prov schema:sameAs ?wikidata FILTER(STRSTARTS(STR(?wikidata), "http://www.wikidata.org/")) }
  OPTIONAL { ?prov schema:sameAs ?geonames FILTER(STRSTARTS(STR(?geonames), "https://sws.geonames.org/")) }
}
GROUP BY ?provincie ?wikidata ?geonames
ORDER BY DESC(?gemalen)"""),

    ("md", "## 8. Gestichte gemalen per decennium\n\nAlleen gemalen met een stichtingsjaar in de bron (2.227 van de 2.663)."),
    ("q", """SELECT ?decennium (COUNT(?g) AS ?gemalen) WHERE {
  ?g schema:dateCreated ?d .
  BIND(xsd:integer(SUBSTR(STR(?d), 1, 4)) AS ?jaar)
  BIND(xsd:integer(FLOOR(?jaar / 10) * 10) AS ?decennium)
}
GROUP BY ?decennium
ORDER BY ?decennium"""),

    ("md", "## 9. Rijksmonumenten met foto\n\nGemalen met een rijksmonumentnummer, met de link naar gemalen.nl en de foto (gelinkt, niet gekopieerd; licentie niet beoordeeld)."),
    ("q", """SELECT ?naam ?monumentnummer ?jaar ?gemalenNl ?foto ?fotograaf WHERE {
  ?g schema:name ?naam ;
     schema:identifier ?id ;
     schema:url ?gemalenNl ;
     schema:associatedMedia ?m .
  ?id schema:propertyID "rijksmonumentnummer" ;
      schema:value ?monumentnummer .
  ?m schema:thumbnailUrl ?foto ;
     schema:copyrightNotice ?fotograaf .
  OPTIONAL { ?g schema:dateCreated ?jaar }
}
ORDER BY ?jaar"""),

    ("md", "## 10. Gemalen in de buurt van de Abdij in Middelburg\n\nDe tien dichtstbijzijnde, gesorteerd op afstand (een benadering in km²; SPARQL heeft geen wortel)."),
    ("q", """SELECT ?naam ?woonplaats ?status ?lat ?lon WHERE {
  ?g schema:name ?naam ;
     schema:locationCreated ?loc .
  ?loc schema:geo ?geo .
  ?geo schema:latitude ?lat ;
       schema:longitude ?lon .
  OPTIONAL { ?loc schema:containedInPlace/schema:name ?woonplaats }
  OPTIONAL { ?g schema:creativeWorkStatus/schema:name ?status }
  BIND((?lat - 51.4988) * 111.2 AS ?dy)
  BIND((?lon - 3.6136) * 69.3 AS ?dx)
  BIND(?dx * ?dx + ?dy * ?dy AS ?km2)
}
ORDER BY ?km2
LIMIT 10"""),

    ("md", "## 11. Waar pompen de meeste gemalen?\n\nElk bemalingsgebied is één gedeelde `Place` per naam en provincie, zodat alle gemalen van hetzelfde gebied naar dezelfde knoop wijzen. Koppelen aan echte gebieden (IMWA, polders, Wikidata) volgt in fase 2."),
    ("q", """SELECT ?gebied ?knoop (COUNT(?g) AS ?gemalen) WHERE {
  ?g dv:drainsArea ?knoop .
  ?knoop schema:name ?gebied .
}
GROUP BY ?gebied ?knoop
HAVING (COUNT(?g) > 2)
ORDER BY DESC(?gemalen)
LIMIT 20"""),

    ("md", "## 12. De termen en hun koppelingen\n\nAlle termen per termenset, met hoe vaak ze gebruikt worden en hun `sameAs`. In de tabellen `terms/*.csv` staat per term de status (`aangenomen` of `afgewezen`) en de reden. Termen die wij zelf bedenken, hebben ook een Engelse naam (kolom `termEn`)."),
    ("q", """SELECT ?termenset ?term ?termEn (COUNT(DISTINCT ?g) AS ?gebruikt) (GROUP_CONCAT(DISTINCT STR(?same); separator=" ") AS ?sameAs) WHERE {
  ?t a schema:DefinedTerm ;
     schema:name ?term ;
     schema:inDefinedTermSet ?set .
  ?set schema:name ?termenset .
  FILTER(LANG(?term) = "nl" && LANG(?termenset) = "nl")
  ?g ?p ?t .
  OPTIONAL { ?t schema:name ?termEn FILTER(LANG(?termEn) = "en") }
  OPTIONAL { ?t schema:sameAs ?same }
}
GROUP BY ?termenset ?term ?termEn
ORDER BY ?termenset DESC(?gebruikt)"""),

    ("md", "Eén termenset, twee namen: zo ziet een termenset eruit in het Nederlands en het Engels."),
    ("q", """SELECT ?termenset ?naamNl ?naamEn WHERE {
  ?termenset a schema:DefinedTermSet ;
             schema:name ?naamNl , ?naamEn .
  FILTER(LANG(?naamNl) = "nl" && LANG(?naamEn) = "en")
}
ORDER BY ?naamNl"""),

    ("md", "## 13. Alle koppelingen naar buiten\n\nElke knoop met een `sameAs`: dat is wat deze dataset verbindt met de Cultuurhistorische Thesaurus, Wikidata en GeoNames."),
    ("q", """SELECT ?knoop ?naam ?extern WHERE {
  ?knoop schema:sameAs ?extern ;
         schema:name ?naam .
  FILTER(LANG(?naam) = "nl")
}
ORDER BY ?knoop ?extern"""),

    ("md", "## 14. Herkomst: terug naar de bron\n\nElk record verwijst met `prov:wasDerivedFrom` naar het WFS-object van de RCE. Open zo'n URL in de browser om te vergelijken."),
    ("q", """SELECT ?naam ?bronobject WHERE {
  ?g a schema:CreativeWork ;
     schema:name ?naam ;
     prov:wasDerivedFrom ?bronobject .
}
LIMIT 5"""),

    ("md", "En de omzetting zelf als `prov:Activity`: wie, wanneer, uit welke bron."),
    ("q", """SELECT ?activiteit ?uitgevoerdDoor ?klaar ?gebruikt ?toelichting WHERE {
  ?d prov:wasGeneratedBy ?act .
  ?act rdfs:label ?activiteit ;
       prov:wasAssociatedWith/schema:name ?uitgevoerdDoor ;
       prov:endedAtTime ?klaar ;
       prov:used/schema:name ?gebruikt ;
       rdfs:comment ?toelichting .
}"""),
]

_stores = {}


def store_for(files):
    """One in-memory store per set of files (as the extension loads every file of a cell's endpoint lines)."""
    key = tuple(sorted(files))
    if key not in _stores:
        st = ox.Store()
        for f in key:
            st.bulk_load(path=os.path.join(HERE, "build", f), format=ox.RdfFormat.TURTLE)
        _stores[key] = st
    return _stores[key]


def run(out, files, cells):
    """Test every query (must return rows, SELECTs without duplicate rows) and write the notebook."""
    print(f"== {out}")
    nb, ok = [], True
    for cell in cells:
        kind, text = cell[0], cell[1]
        if kind == "md":
            nb.append({"kind": 1, "language": "markdown", "value": text, "metadata": {}})
            continue
        cell_files = cell[2] if len(cell) > 2 else files
        q = PFX + "\n" + text
        try:
            rows = list(store_for(cell_files).query(q))
            print(f"OK {len(rows):5} rij(en): {text.splitlines()[0][:70]}")
            if not rows:
                ok = False
                print("   LEEG")
            elif text.lstrip().startswith("SELECT"):
                seen = [tuple(str(v) for v in r) for r in rows]
                if len(seen) != len(set(seen)):
                    ok = False
                    print("   DUBBELE RIJEN")
        except Exception as e:  # noqa: BLE001
            ok = False
            print("FOUT", text.splitlines()[0][:70], e)
        endpoint = "".join(f"# [endpoint=./build/{f}]\n" for f in cell_files)
        nb.append({"kind": 2, "language": "sparql", "value": endpoint + "\n" + q, "metadata": {}})
    if not ok:
        print(f"   niet geschreven: {out} (een query faalt, is leeg of geeft dubbele rijen)")
        return False
    json.dump(nb, open(os.path.join(HERE, out), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("   geschreven:", out)
    return True


if __name__ == "__main__":
    sys.path.insert(0, HERE)
    from notebook_cells import NOTEBOOKS  # noqa: E402
    all_books = [("pumping-stations.sparqlbook", ["pumping-stations.ttl"], PUMPING_STATIONS)] + NOTEBOOKS
    only = set(sys.argv[1:])
    results = [run(out, files, cells) for out, files, cells in all_books if not only or out in only]
    sys.exit(0 if all(results) else 1)
