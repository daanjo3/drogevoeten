"""Turn the Linked Art harvest into a small schema.org view for the app.

The harvest (harvest.py) is ~100 MB of CIDOC-CRM with long paths for simple
facts. This keeps only what the app queries, one triple per fact, so its
queries stay short and fast:

  <object>  a schema:VisualArtwork ;
            schema:name "Dutch title" ; schema:identifier "RP-P-OB-..." ;
            dv:year 1855 ; schema:image <IIIF Image API base> ;
            schema:url <collection page> ; schema:license <rights on the image> ;
            schema:contentLocation <depicted place> ;     (P65/P138 -> E53_Place)
            schema:about <depicted event> , <Iconclass> . (P65/P138 -> E7, P65/P199 -> equivalent)
  <place>   a schema:Place ; schema:name "..." ; dv:matchName "vlissingen" ;
            schema:latitude / schema:longitude (when the museum has a point) ;
            schema:containedInPlace <every ancestor> ;   (transitive closure of P89)
            schema:sameAs <Wikidata/GeoNames/TGN> .
  <region>  a schema:Place, dv:Region ; dv:regionName "zeeland" .  (places directly within Nederland)
  <event>   a schema:Event ; schema:name "..." .
  <iconclass> schema:name "dike-break" ;
            dv:iconclassCode "25H1991", "25H199", "25H19", ... "2" .  (itself and every broader code)

dv:matchName / dv:regionName are lowercase names without a qualifier
("Zeeland (provincie)" -> "zeeland"), for exact matching with VALUES.

Only objects with an image and at least one depicted place are kept.
Subjects keep their Rijksmuseum IRIs, so every fact traces back to the source.

Idempotent: does nothing if the output is newer than the input (pass --force
to rebuild anyway). The output is written to a temporary file first.

Run with: python3 -I qlever/rijksmuseum/slim.py [--force]
          (or as the `data` service in qlever/docker-compose.yml)
Input:    qlever/data/rijksmuseum-linked-art.nt
Output:   qlever/data/rijksmuseum-app.nt (served by qlever/, see its Qleverfile)
"""

import argparse
import os
import re
import urllib.parse
from collections import defaultdict
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
IN = DATA / "rijksmuseum-linked-art.nt"
OUT = DATA / "rijksmuseum-app.nt"

CRM = "http://www.cidoc-crm.org/cidoc-crm/"
LA = "https://linked.art/ns/terms/"
AAT = "http://vocab.getty.edu/aat/"
RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
SCHEMA = "https://schema.org/"
DV = "https://w3id.org/drogevoeten/def#"
HARVEST = "https://w3id.org/drogevoeten/harvest#matchedSearch"
XSD = "http://www.w3.org/2001/XMLSchema#"
NEDERLAND = "https://id.rijksmuseum.nl/2301"

PREFERRED = AAT + "300404670"
DUTCH = AAT + "300388256"
ACCESSION = AAT + "300312355"

TERM = r'(<[^>]*>|_:\S+|"(?:[^"\\]|\\.)*"(?:@[\w-]+|\^\^<[^>]*>)?)'
TRIPLE = re.compile(rf"^{TERM} <([^>]*)> {TERM} \.$")
POINT = re.compile(r"POINT\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)")


def load():
    out = defaultdict(lambda: defaultdict(list))
    for line in IN.open(encoding="utf-8"):
        m = TRIPLE.match(line.strip())
        if m:
            s, p, o = m.groups()
            out[s][p].append(o)
    return out


def iri(term):
    return term[1:-1] if term.startswith("<") else None


ESCAPE = re.compile(r"\\(u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|.)")
SIMPLE_ESCAPES = {"t": "\t", "n": "\n", "r": "\r", "b": "\b", "f": "\f", '"': '"', "'": "'", "\\": "\\"}


def literal(term):
    if not term.startswith('"'):
        return None
    body = term[1:term.rindex('"')]
    return ESCAPE.sub(lambda m: chr(int(m.group(1)[1:], 16)) if len(m.group(1)) > 1 else SIMPLE_ESCAPES.get(m.group(1), m.group(1)), body)


def nt_literal(value, datatype=None):
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\r", "")
    return f'"{escaped}"' + (f"^^<{datatype}>" if datatype else "")


def match_name(name):
    """Lowercase name without a trailing qualifier: "Zeeland (provincie)" -> "zeeland"."""
    return re.sub(r"\s*\(.*\)\s*$", "", name).strip().lower()


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--force", action="store_true", help="rebuild even if the output is up to date")
    args = parser.parse_args()
    if OUT.exists() and OUT.stat().st_mtime >= IN.stat().st_mtime and not args.force:
        print(f"{OUT} is up to date, skipping (use --force to rebuild)")
        return

    g = load()
    ref = lambda s: f"<{s}>"

    def objs(s, p):
        return g.get(s, {}).get(p, [])

    def is_a(s, cls):
        return f"<{CRM}{cls}>" in objs(s, RDF_TYPE)

    def names(s):
        found = []
        for n in objs(s, CRM + "P1_is_identified_by"):
            if f"<{CRM}E42_Identifier>" in objs(n, RDF_TYPE):
                continue
            found += [literal(v) for v in objs(n, CRM + "P190_has_symbolic_content")]
        return list(dict.fromkeys(v for v in found if v))

    triples = []
    add = lambda s, p, o: triples.append(f"{s} <{p}> {o} .")
    places, events, iconclass = set(), set(), {}
    kept = 0

    for s in [s for s in g if HARVEST in g[s]]:
        title = number = None
        for n in objs(s, CRM + "P1_is_identified_by"):
            types = objs(n, CRM + "P2_has_type")
            text = next(map(literal, objs(n, CRM + "P190_has_symbolic_content")), None)
            if f"<{PREFERRED}>" in types and f"<{DUTCH}>" in objs(n, CRM + "P72_has_language"):
                title = title or text
            if f"<{ACCESSION}>" in types:
                number = number or text

        image = page = None
        for x in objs(s, CRM + "P129i_is_subject_of"):
            for d in objs(x, LA + "digitally_carried_by"):
                for ap in map(iri, objs(d, LA + "access_point")):
                    if ap and ap.startswith("https://iiif.micr.io/"):
                        image = ap.split("/full/")[0]
                    elif ap and ap.startswith("https://www.rijksmuseum.nl/"):
                        page = ap

        year = None
        for prod in objs(s, CRM + "P108i_was_produced_by"):
            for ts in objs(prod, CRM + "P4_has_time-span"):
                for b in map(literal, objs(ts, CRM + "P82a_begin_of_the_begin")):
                    if b and re.match(r"^\d{4}", b):
                        year = min(year or 9999, int(b[:4]))

        depicted, about, rights = [], [], None
        for vi in objs(s, CRM + "P65_shows_visual_item"):
            for r in objs(vi, CRM + "P104_is_subject_to"):
                rights = rights or next(iter(objs(r, CRM + "P2_has_type")), None)
            for t in objs(vi, CRM + "P138_represents"):
                if is_a(t, "E53_Place"):
                    depicted.append(t)
                elif is_a(t, "E7_Activity"):
                    about.append(t)
                    events.add(t)
            for t in objs(vi, CRM + "P199_represents_instance_of_type"):
                for eq in objs(t, LA + "equivalent"):
                    if eq.startswith("<https://iconclass.org/"):
                        about.append(eq)
                        label = [n for n in names(t) if not re.match(r"^\d", n)]
                        iconclass.setdefault(eq, label[0] if label else None)

        if not (image and depicted and title):
            continue
        kept += 1
        add(s, RDF_TYPE, ref(SCHEMA + "VisualArtwork"))
        add(s, SCHEMA + "name", nt_literal(title))
        if number:
            add(s, SCHEMA + "identifier", nt_literal(number))
        if year:
            add(s, DV + "year", nt_literal(str(year), XSD + "integer"))
        add(s, SCHEMA + "image", ref(image))
        if page:
            add(s, SCHEMA + "url", ref(page))
        if rights:
            add(s, SCHEMA + "license", rights)
        for p in dict.fromkeys(depicted):
            add(s, SCHEMA + "contentLocation", p)
            places.add(p)
        for a in dict.fromkeys(about):
            add(s, SCHEMA + "about", a)

    # Places and all their ancestors
    def ancestors(p, seen=()):
        for parent in objs(p, CRM + "P89_falls_within"):
            if parent not in seen:
                yield parent
                yield from ancestors(parent, seen + (parent,))

    all_places = set(places)
    for p in places:
        all_places.update(ancestors(p))
    for p in sorted(all_places):
        add(p, RDF_TYPE, ref(SCHEMA + "Place"))
        # Regions get their own name property, so "Utrecht" the city never matches the province
        region = f"<{NEDERLAND}>" in objs(p, CRM + "P89_falls_within")
        if region:
            add(p, RDF_TYPE, ref(DV + "Region"))
        for n in names(p):
            add(p, SCHEMA + "name", nt_literal(n))
        for m in dict.fromkeys(match_name(n) for n in names(p)):
            add(p, DV + ("regionName" if region else "matchName"), nt_literal(m))
        for wkt in map(literal, objs(p, CRM + "P168_place_is_defined_by")):
            pt = POINT.match(wkt or "")
            if pt:
                add(p, SCHEMA + "longitude", nt_literal(pt.group(1), XSD + "double"))
                add(p, SCHEMA + "latitude", nt_literal(pt.group(2), XSD + "double"))
                break
        for a in dict.fromkeys(ancestors(p)):
            add(p, SCHEMA + "containedInPlace", a)
        for eq in objs(p, LA + "equivalent"):
            if not eq.startswith("<https://id.rijksmuseum.nl/"):
                add(p, SCHEMA + "sameAs", eq)

    for e in sorted(events):
        add(e, RDF_TYPE, ref(SCHEMA + "Event"))
        for n in names(e):
            add(e, SCHEMA + "name", nt_literal(n))
    for c, label in sorted(iconclass.items()):
        if label:
            add(c, SCHEMA + "name", nt_literal(label))
        # Iconclass is hierarchical by prefix: 25H1991 lies under 25H199, 25H19, ... 2.
        # Listing every level makes "everything under 25H199" an exact match.
        code = urllib.parse.unquote(iri(c)[len("https://iconclass.org/"):]).split("(")[0]
        for i in range(1, len(code) + 1):
            add(c, DV + "iconclassCode", nt_literal(code[:i]))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    unique = list(dict.fromkeys(triples))
    tmp = OUT.with_name(OUT.name + ".tmp")
    tmp.write_text("\n".join(unique) + "\n", encoding="utf-8")
    os.replace(tmp, OUT)
    print(f"{kept} objects, {len(all_places)} places, {len(events)} events, {len(iconclass)} Iconclass terms")
    print(f"wrote {len(unique)} triples to {OUT}")


if __name__ == "__main__":
    main()
