#!/usr/bin/env python3
"""Data layer, step 1b (v2): fetch the "is it still in service?" evidence and rainfall references.

Sources (all open, fetched politely with an honest user agent, cached in data/raw/):
  - Wikidata: state of use (P5817), has use (P366), mill IDs (P2866, P2863, P12772)
        query: queries/wd_use_state_by_p359.rq                    -> data/raw/wd_use_state.csv
  - Nederlandse Molendatabase (molendatabase.nl): ONLY the short factual fields
        'functie', 'bedrijfsvaardigheid', 'bestemming' and 'meest recente aanpassing'
        per mill, reached via the Wikidata P2863 formatter URL      -> data/raw/nmdb_status.json
        (1 request per 2 s; no photos or texts are copied, every value links back to its page)
  - KNMI daily rainfall (RH, etmaalsom in 0.1 mm) per automatic station, 1951-today
        https://www.daggegevens.knmi.nl/klimatologie/daggegevens   -> data/raw/knmi_rh_<stn>.csv

Run:  python3 -I datalayer/fetch_status.py      (stdlib only; ~15 min on first run, cached afterwards)
"""
import csv, html, io, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
UA = "HackaLOD2026-droge-voeten/0.2 (research prototype; non-commercial)"
WDQS = "https://query.wikidata.org/sparql"
NMDB = "https://molendatabase.nl/nederland/molen.php?nummer={}"  # Wikidata P1630 formatter of P2863
KNMI = "https://www.daggegevens.knmi.nl/klimatologie/daggegevens"
NMDB_FIELDS = ("functie", "bedrijfsvaardigheid", "bestemming")


def http(url, data=None, accept="*/*", timeout=180):
    req = urllib.request.Request(url, data=data, headers={"Accept": accept, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.geturl(), r.read().decode("utf-8", errors="replace")


def wikidata_use_state():
    path = os.path.join(RAW, "wd_use_state.csv")
    if os.path.exists(path):
        return path
    doc = json.load(open(os.path.join(ROOT, "data", "build", "droge-voeten.jsonld"), encoding="utf-8"))
    nums = sorted({m["monumentNumber"] for m in doc["monuments"]}, key=int)
    q = open(os.path.join(ROOT, "queries", "wd_use_state_by_p359.rq"), encoding="utf-8").read()
    q = q.replace("#VALUES#", " ".join(f'"{n}"' for n in nums))
    _, txt = http(WDQS, urllib.parse.urlencode({"query": q}).encode(), accept="text/csv")
    open(path, "w", encoding="utf-8").write(txt)
    return path


def parse_nmdb(page):
    """Return the 'korte karakteristiek' fields of a molendatabase.nl page as a dict."""
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", page, flags=re.S)
    lines = [html.unescape(s).strip() for s in re.sub(r"<[^>]+>", "\n", t).split("\n")]
    lines = [s for s in lines if s]
    out = {}
    for i, s in enumerate(lines[:-1]):
        key = s.lower()
        if key in NMDB_FIELDS and key not in out:
            out[key] = lines[i + 1]
        if key == "meest recente aanpassing" and "updated" not in out:
            out["updated"] = lines[i + 1]
    return out


def molendatabase(csv_path):
    path = os.path.join(RAW, "nmdb_status.json")
    cache = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    ids = sorted({r["nmdb"] for r in csv.DictReader(open(csv_path, encoding="utf-8")) if r["nmdb"]}, key=int)
    for n, nr in enumerate(ids):
        if nr in cache:
            continue
        try:
            final, page = http(NMDB.format(nr), timeout=60)
            cache[nr] = {"url": final, **parse_nmdb(page)}
        except Exception as e:  # noqa: BLE001
            cache[nr] = {"url": NMDB.format(nr), "error": str(e)}
        if n % 20 == 0:
            print(f"  molendatabase {n}/{len(ids)}", file=sys.stderr)
            json.dump(cache, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
        time.sleep(2)
    json.dump(cache, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)


def knmi():
    _, head = http(KNMI, urllib.parse.urlencode({"stns": "ALL", "vars": "RH", "start": "20260101", "end": "20260101"}).encode())
    stations = []
    for line in head.splitlines():
        m = re.match(r"#\s+(\d{3})\s+([\d.]+)\s+([\d.]+)\s+(-?[\d.]+)\s+(.+?)\s*$", line)
        if m:
            stations.append({"stn": m[1], "lon": float(m[2]), "lat": float(m[3]), "name": m[5]})
    json.dump(stations, open(os.path.join(RAW, "knmi_stations.json"), "w", encoding="utf-8"), ensure_ascii=False)
    today = time.strftime("%Y%m%d")
    for s in stations:
        path = os.path.join(RAW, f"knmi_rh_{s['stn']}.csv")
        if os.path.exists(path):
            continue
        _, txt = http(KNMI, urllib.parse.urlencode({"stns": s["stn"], "vars": "RH", "start": "19510101", "end": today}).encode())
        open(path, "w", encoding="utf-8").write(txt)
        print("  knmi", s["stn"], s["name"], len(txt), file=sys.stderr)
        time.sleep(1)


def main():
    os.makedirs(RAW, exist_ok=True)
    p = wikidata_use_state()
    knmi()
    molendatabase(p)


if __name__ == "__main__":
    main()
