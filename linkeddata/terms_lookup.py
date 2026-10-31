#!/usr/bin/env python3
"""Fill the review tables terms/<field>.csv with every source value, plus proposals from the NDE Termennetwerk.

Reads build/term-values.json (written by build.py). For each value (and context) without a row it adds one:
  status 'voorstel'  a label in a terminology source matches the value exactly (prefLabel or altLabel, any case)
  status 'twijfel'   only a non-exact first hit, given as a hint in 'opmerking' (URI columns stay empty)
  status ''          nothing found, or --offline
Existing rows are never changed, so reviews ('gecontroleerd', 'weglaten') stay. build.py writes schema:sameAs
only for rows a person marked 'gecontroleerd'. See DECISIONS.md, 'Termen en plaatsen reviewen'.

Sources: terms -> Cultuurhistorische Thesaurus + AAT; places -> Wikidata (places NL/BE) + GeoNames (NL/BE/DE).

Run:  python3 -I linkeddata/terms_lookup.py [--offline] [field ...]
"""
import csv
import json
import os
import re
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402
from lib.terms import COLUMNS, key  # noqa: E402

API = "https://termennetwerk-api.netwerkdigitaalerfgoed.nl/graphql"
CHT = "https://data.cultureelerfgoed.nl/term/id/cht"
AAT = "http://vocab.getty.edu/aat"
WD_ALL = "https://www.wikidata.org#entities-all"
WD_PLACES = "https://www.wikidata.org#entities-places"
GEONAMES = "https://www.geonames.org#nl-be-de"
COLUMN_OF = {CHT: "cht", AAT: "aat", WD_ALL: "wikidata", WD_PLACES: "wikidata", GEONAMES: "geonames"}
SOURCES_BY_KIND = {"term": [CHT, AAT], "place": [WD_PLACES, GEONAMES], "organization": [WD_ALL]}
SOURCES_FOR = {"country": [WD_ALL]}  # per-field override, e.g. country of origin of a gift house
# GeoNames returns several features per name (e.g. 'Zeeland (NL)' as town and as province); prefer this kind.
PREFER_SCOPE = {"province": "Bestuurlijke eenheid", "locality": "Plaats"}

QUERY = """query($sources:[ID]!, $q:String!){ terms(sources:$sources, query:$q){
  source { uri } result { ... on Terms { terms { uri prefLabel altLabel scopeNote } } ... on Error { message } } } }"""


def label_key(label):
    """Compare labels without a trailing country code as GeoNames adds it: 'Lemmer (NL)' -> 'lemmer'."""
    return key(re.sub(r"\s*\([A-Z]{2}\)$", "", label))


def lookup(sources, text):
    body = json.dumps({"query": QUERY, "variables": {"sources": sources, "q": text}}).encode()
    req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json",
                                                          "User-Agent": "drogevoeten-linkeddata/0.1 (HackaLOD 2026)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["data"]["terms"]


def propose(field, sources, text, context, offline):
    row = dict.fromkeys(COLUMNS, "")
    row.update(brontekst=text, context=context, label_nl=text)
    if offline:
        return row
    notes, exact_any = [], False
    for res in lookup(sources, text):
        col = COLUMN_OF[res["source"]["uri"]]
        found = (res.get("result") or {}).get("terms") or []
        exact = [t for t in found if key(text) in {label_key(x) for x in t["prefLabel"] + t["altLabel"]}]
        scope = PREFER_SCOPE.get(field)
        if scope:
            exact.sort(key=lambda t: scope not in (t.get("scopeNote") or []))
        if exact:  # only exact label matches go into the URI column
            row[col] = exact[0]["uri"]
            notes.append(f"{col}: {'/'.join(exact[0]['prefLabel'])}")
            exact_any = True
        elif found:  # a hint only; a reviewer can copy the URI if it fits
            notes.append(f"{col}? {'/'.join(found[0]['prefLabel'])} <{found[0]['uri']}>")
    row["status"] = "voorstel" if exact_any else ("twijfel" if notes else "")
    row["opmerking"] = "; ".join(notes)
    return row


def main(args):
    offline = "--offline" in args
    only = {a for a in args if not a.startswith("--")}
    values = json.load(open(os.path.join(config.OUT, "term-values.json"), encoding="utf-8"))
    os.makedirs(config.TERMS, exist_ok=True)
    for field, info in sorted(values.items()):
        if only and field not in only:
            continue
        sources = SOURCES_FOR.get(field, SOURCES_BY_KIND[info["soort"]])
        path = os.path.join(config.TERMS, field + ".csv")
        rows = list(csv.DictReader(open(path, encoding="utf-8"))) if os.path.exists(path) else []
        have = {key(r["brontekst"], r.get("context")) for r in rows}
        new = 0
        for v in info["waarden"]:
            k = key(v["brontekst"], v["context"])
            if k in have:
                continue
            rows.append(propose(field, sources, v["brontekst"], v["context"], offline))
            have.add(k)
            new += 1
            if not offline:
                time.sleep(0.3)
        with open(path, "w", encoding="utf-8", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=COLUMNS, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)
        print(f"{field} ({info['soort']}): {new} nieuwe rijen, {len(rows)} totaal")


if __name__ == "__main__":
    main(sys.argv[1:])
