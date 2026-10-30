#!/usr/bin/env python3
"""Data layer, step 1: fetch raw source data into data/raw/.

Sources (all open):
  - RCE Rijksmonumenten (SPARQL, linked data)        -> rce_water_monuments.csv
  - Wikidata: monuments by Rijksmonument ID (P359)   -> wd_monuments.csv
  - Wikidata: Dutch water boards + genealogy (Q702081)-> wd_waterboards.csv
  - PDOK / Het Waterschapshuis IMWA kunstwerken       -> imwa_<collection>.json

Run:  python3 -I datalayer/fetch.py   (stdlib only)
"""
import csv, io, json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
QUERIES = os.path.join(ROOT, "queries")
UA = "HackaLOD2026-waterschappen-prototype/0.1 (research; contact via GitHub)"

RCE = "https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/Rijksmonumenten-sdo/sparql"
WDQS = "https://query.wikidata.org/sparql"
IMWA = "https://api.pdok.nl/hwh/waterschappen-kunstwerken-imwa/ogc/v2/collections/{c}/items?f=json&limit=1000"
IMWA_COLLECTIONS = ["gemaal", "sluis", "stuw"]


def http(url, data=None, accept="text/csv", tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={"Accept": accept, "User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # noqa: BLE001
            print(f"  retry {i+1} {url[:80]}: {e}", file=sys.stderr)
            time.sleep(5 * (i + 1))
    raise RuntimeError(f"failed: {url}")


def sparql_post(endpoint, query):
    return http(endpoint, data=urllib.parse.urlencode({"query": query}).encode())


def read_query(name):
    with open(os.path.join(QUERIES, name), encoding="utf-8") as f:
        return f.read()


def save(name, text):
    with open(os.path.join(RAW, name), "w", encoding="utf-8") as f:
        f.write(text)
    print("wrote", name, len(text), "bytes")


def main():
    os.makedirs(RAW, exist_ok=True)

    # 1. RCE water monuments
    rce = sparql_post(RCE, read_query("rce_water_monuments.rq"))
    save("rce_water_monuments.csv", rce)
    numbers = sorted({r["nr"] for r in csv.DictReader(io.StringIO(rce))}, key=int)

    # 2. Wikidata items for those monument numbers (batched VALUES)
    tmpl = read_query("wd_monuments_by_p359.rq")
    out, header = [], None
    for i in range(0, len(numbers), 250):
        vals = " ".join(f'"{n}"' for n in numbers[i:i + 250])
        txt = sparql_post(WDQS, tmpl.replace("#VALUES#", vals))
        lines = txt.splitlines()
        header = lines[0]
        out.extend(lines[1:])
        time.sleep(1)
    save("wd_monuments.csv", "\n".join([header] + out) + "\n")

    # 3. Wikidata water boards and their genealogy
    save("wd_waterboards.csv", sparql_post(WDQS, read_query("wd_waterboards.rq")))

    # 4. IMWA kunstwerken (current, operated assets of the water boards)
    for c in IMWA_COLLECTIONS:
        url, feats = IMWA.format(c=c), []
        while url:
            d = json.loads(http(url, accept="application/geo+json"))
            feats.extend(d.get("features", []))
            url = next((l["href"] for l in d.get("links", []) if l.get("rel") == "next"), None)
            print(f"  {c}: {len(feats)}", file=sys.stderr)
        slim = [{"uri": IMWA.split("?")[0].format(c=c) + "/" + f["id"], "id": f["properties"].get("nen3610id"), "naam": f["properties"].get("naam"),
                 "code": f["properties"].get("code"), "waterbeheerder": f["properties"].get("waterbeheerder"),
                 "functie": f["properties"].get("functiegemaal"), "capaciteit": f["properties"].get("maximalecapaciteit"),
                 "status": f["properties"].get("statusobject"),
                 "lon": (f.get("geometry") or {}).get("coordinates", [None, None])[0],
                 "lat": (f.get("geometry") or {}).get("coordinates", [None, None])[1]}
                for f in feats if (f.get("geometry") or {}).get("type") == "Point"]
        save(f"imwa_{c}.json", json.dumps(slim, ensure_ascii=False))


if __name__ == "__main__":
    main()
