#!/usr/bin/env python3
"""A second presentation layer: same koppelvlak (droge-voeten.jsonld), plain terminal output.
Proves the data layer is reusable outside the web app.

  python3 -I datalayer/whokeeps.py "Abdij 1, Middelburg"
"""
import json, math, os, sys, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOC = os.path.join(ROOT, "data", "build", "droge-voeten.jsonld")


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "HackaLOD2026-prototype"}), timeout=60) as r:
        return json.load(r)


def km(a, b, c, d):
    p = math.pi / 180
    return 6371 * math.hypot((d - b) * p * math.cos((a + c) * p / 2), (c - a) * p)


def walk(t):
    for n in t:
        yield n["qid"]
        yield from walk(n["children"])


def main(q):
    db = json.load(open(DOC, encoding="utf-8"))
    g = get("https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?rows=1&fq=type:adres&q=" + urllib.parse.quote(q))["response"]["docs"][0]
    lon, lat = map(float, g["centroide_ll"][6:-1].split())
    print(f"{g['weergavenaam']}  ({g.get('rdf_seealso')})")
    a = get(f"https://service.pdok.nl/rws/ahn/wms/v1_0?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=dtm_05m&QUERY_LAYERS=dtm_05m&CRS=EPSG:4326&BBOX={lat-5e-5},{lon-5e-5},{lat+5e-5},{lon+5e-5}&WIDTH=3&HEIGHT=3&I=1&J=1&INFO_FORMAT=application/json")
    print("Hoogte maaiveld:", a["features"][0]["properties"]["value_list"] if a.get("features") else "?", "m NAP")
    p = get(f"https://api.pdok.nl/hwh/waterschappen-waterbeheergebieden-imwa/ogc/v1/collections/peilgebied/items?f=json&limit=1&bbox={lon-2e-4},{lat-2e-4},{lon+2e-4},{lat+2e-4}")
    label = p["features"][0]["properties"]["waterbeheerder"] if p.get("features") else None
    qid = db["waterBoardLabelToQid"].get(label)
    if qid:
        anc = list(walk(db["currentWaterBoards"][qid]["ancestry"]))
        print(f"Waterschap: {label} (wd:{qid}), {len(anc)} voorgangers op Wikidata")
    labels = {k: v["label"] for k, v in db["statusVocabulary"].items()}
    print("Waterstaatserfgoed het dichtstbij:")
    for m in sorted(db["monuments"], key=lambda m: km(lat, lon, m["lat"], m["lon"]))[:5]:
        st = m["status"]
        src = next((e for e in st["evidence"] if e["status"] == st["status"]), None)
        print(f"  {km(lat, lon, m['lat'], m['lon']):5.1f} km  {m['name']} ({', '.join(m['types'])})")
        print(f"           [{labels[st['status']]}] {st['label']}" + (f"  bron: {src['uri']}" if src and src.get("uri") else ""))
        print(f"           {m['@id']}  {m['wikidata']}")


if __name__ == "__main__":
    main(" ".join(sys.argv[1:]) or "Abdij 1, Middelburg")
