#!/usr/bin/env python3
"""Review term proposals by rule instead of by hand (DECISIONS.md 28: Jari chose assumptions over manual review).

For every row in terms/<field>.csv with status 'voorstel' (an exact label match found by terms_lookup.py):
  - only the Cultuurhistorische Thesaurus (CHT) column is considered; AAT and Wikidata candidates for terms are
    dropped, because exact labels there were homonyms in practice (AAT 'gemalen' = royal consorts);
  - the CHT term is accepted ('aangenomen') when one of its broader terms (up to 3 levels) lies in the domain of the
    field (DOMAINS); otherwise it is rejected ('afgewezen') with the broader terms as the reason.
Rows with status 'twijfel' or '' become 'afgewezen' (no exact term). Rows already reviewed are left alone.
Network: NDE Termennetwerk (lookup by URI).

Run:  python3 -I linkeddata/assume_terms.py [field ...]
"""
import csv
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402
from lib.terms import COLUMNS  # noqa: E402

API = "https://termennetwerk-api.netwerkdigitaalerfgoed.nl/graphql"
WHO = "Claude 31-10-2026"
# field -> broader CHT labels that put a candidate in the right domain
MILLS = {"molens", "windmolens", "watermolens", "rosmolens", "industriemolens", "poldermolens", "korenmolens", "molenelementen"}
DOMAINS = {
    "windmill-drive": MILLS, "windmill-type": MILLS, "windmill-function": MILLS, "windmill-main-category": MILLS,
    "drained-lake-structure-type": MILLS | {"gemalen", "motorgemalen", "stoomgemalen"},
    "pumping-station-function": {"gemalen"},
    "drained-lake-type": {"polders", "droogmakerijen (landschapszone)"},
    "dike-original-function": {"dijken", "waterkeringen", "dammen"},
    "dike-later-function": {"dijken", "waterkeringen", "dammen"},
    "facade-material": {"materialen", "bouwmaterialen", "hout", "kunststoffen", "steen"},
    "roofing": {"materialen", "bouwmaterialen", "dakbedekkingen", "dakbedekkingsmaterialen"},
    "land-consolidation-form": {"landinrichting", "ruilverkaveling", "functionele activiteiten"},
    "breach-pool-type": {"waterpartijen", "landschapselementen", "poelen"},
}
DOMAINS["house-form"] = {"woonhuizen", "woningen"}
# Statuses and our own event types are not thesaurus concepts: never linked (rows become 'afgewezen').
NOT_LINKED = {"windmill-status", "dike-status", "land-consolidation-status", "imwa-status", "gift-house-protection",
              "pumping-station-status", "protection-status", "event-type", "imwa-function", "drive-type"}
# Our own object types (DECISIONS.md 22): CHT terms checked by hand on scopeNote and broader (31-10-2026).
CHT = "https://data.cultureelerfgoed.nl/term/id/cht/"
OBJECT_TYPES = {
    "pumping-station": ("63e3cea6-22d0-4d8a-b79b-2b8c3d049587", "gemalen"),
    "windmill": ("0198a25a-3469-469e-8103-a613e32fcdc6", "molens"),
    "drained-lake": ("ff8e83fe-8c42-450a-ad53-f71b399f00c5", "droogmakerijen (landschapszone)"),
    "dike": ("c615eaa4-85a7-4f2b-9a96-02aa766e8331", "dijken"),
    "polder": ("57fc851e-b0b1-45c5-8226-5e9cd60537a5", "polders"),
    "lock": ("88326f50-39d4-42c8-bec3-28a44ff3e472", "sluizen"),
    "weir": ("30a6488b-e695-48a0-b361-bd48fb4ae340", "stuwen"),
}
QUERY = "query($u:[ID]!){ lookup(uris:$u){ uri result { ... on Term { prefLabel broader { uri prefLabel } } } } }"
_cache = {}


def broader_labels(uri, depth=3):
    """Labels of the broader terms of a CHT term, up to depth levels."""
    out, frontier = set(), [uri]
    for _ in range(depth):
        nxt = []
        for u in frontier:
            if u not in _cache:
                body = json.dumps({"query": QUERY, "variables": {"u": [u]}}).encode()
                req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json"})
                res = json.load(urllib.request.urlopen(req, timeout=60))["data"]["lookup"][0].get("result") or {}
                _cache[u] = res.get("broader") or []
            for b in _cache[u]:
                out |= {x.lower() for x in b["prefLabel"]}
                nxt.append(b["uri"])
        frontier = nxt
    return out


def write(path, rows):
    with open(path, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def own_object_types():
    path = os.path.join(config.TERMS, "object-type.csv")
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    for r in rows:
        if r["status"] in ("gecontroleerd", "weglaten"):
            continue
        hit = OBJECT_TYPES.get(r["brontekst"])
        for col in ("cht", "aat", "wikidata", "geonames"):
            r[col] = ""
        if hit:
            r["cht"], r["status"] = CHT + hit[0], "aangenomen"
            r["opmerking"] = f"aangenomen ({WHO}): eigen term; CHT '{hit[1]}' gecontroleerd op scopeNote en broader"
        else:
            r["status"], r["opmerking"] = "afgewezen", f"afgewezen ({WHO}): eigen term; geen passende CHT-term gevonden"
    write(path, rows)
    print("object-type: eigen termen gekoppeld volgens OBJECT_TYPES")


def not_linked(field):
    path = os.path.join(config.TERMS, field + ".csv")
    if not os.path.exists(path):
        return
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    for r in rows:
        if r["status"] in ("gecontroleerd", "aangenomen", "afgewezen", "weglaten"):
            continue
        for col in ("cht", "aat", "wikidata", "geonames"):
            r[col] = ""
        r["status"], r["opmerking"] = "afgewezen", f"afgewezen ({WHO}): statussen en eigen gebeurtenissoorten worden niet gekoppeld"
    write(path, rows)
    print(f"{field}: niet gekoppeld")


def main(only):
    if not only or "object-type" in only:
        own_object_types()
    for field in sorted(NOT_LINKED):
        if not only or field in only:
            not_linked(field)
    for field, domain in sorted(DOMAINS.items()):
        if only and field not in only:
            continue
        path = os.path.join(config.TERMS, field + ".csv")
        if not os.path.exists(path):
            continue
        rows = list(csv.DictReader(open(path, encoding="utf-8")))
        n_acc = n_rej = 0
        for r in rows:
            if r["status"] in ("gecontroleerd", "aangenomen", "afgewezen", "weglaten"):
                continue
            hint = r["opmerking"]
            cht = r["cht"]
            for col in ("aat", "wikidata", "geonames"):
                r[col] = ""
            if r["status"] == "voorstel" and cht:
                labels = broader_labels(cht)
                if labels & domain:
                    r["status"], r["opmerking"] = "aangenomen", f"aangenomen ({WHO}): CHT-term onder {', '.join(sorted(labels & domain))}"
                    n_acc += 1
                    continue
                r["opmerking"] = f"afgewezen ({WHO}): CHT-kandidaat valt buiten het domein (breder: {', '.join(sorted(labels)[:4])})"
            else:
                r["opmerking"] = f"afgewezen ({WHO}): geen exacte passende term" + (f"; eerdere hint: {hint}" if hint else "")
            r["cht"], r["status"] = "", "afgewezen"
            n_rej += 1
        write(path, rows)
        print(f"{field}: {n_acc} aangenomen, {n_rej} afgewezen")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
