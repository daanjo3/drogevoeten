#!/usr/bin/env python3
"""Spot check (PLAN.md step 7): for N random records per dataset, open the source object behind prov:wasDerivedFrom
live and compare the record's name with the source's name field. Network; standard library only.

Run:  python3 -I linkeddata/spot_check.py [N]      (or: make check)
"""
import glob
import json
import os
import random
import re
import sys
import unicodedata
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
NAME_FIELDS = ("naam_gemaal", "NAAM", "molen_naam", "poldernaam", "naam", "labelnaam", "naamwiel")
LINE = re.compile(r'^<([^>]+)> <([^>]+)> (.+) \.$')


def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    return re.sub(r"[^a-z0-9]+", " ", "".join(c for c in s if not unicodedata.combining(c))).strip()


def records(nt_path):
    """record IRI -> (name, source URL) for the subjects that have isPartOf."""
    names, src, part = {}, {}, set()
    for line in open(nt_path, encoding="utf-8"):
        m = LINE.match(line.strip())
        if not m:
            continue
        s, p, o = m.groups()
        if p == "https://schema.org/isPartOf":
            part.add(s)
        elif p == "https://schema.org/name" and o.endswith("@nl"):
            names.setdefault(s, json.loads(o[: o.rfind("@")]))
        elif p == "http://www.w3.org/ns/prov#wasDerivedFrom" and "#" not in s:
            src[s] = o.strip("<>")
    return {s: (names.get(s), src.get(s)) for s in part if s in src}


def source_names(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "drogevoeten-linkeddata/0.1"})
    doc = json.load(urllib.request.urlopen(req, timeout=60))
    feats = doc.get("features") or [doc]
    out = set()
    for f in feats:
        props = f.get("properties", f)
        out |= {str(props[k]) for k in NAME_FIELDS if props.get(k) not in (None, "")}
    return out


def main(n):
    random.seed(1953)
    bad = 0
    for nt in sorted(glob.glob(os.path.join(HERE, "build", "*.nt"))):
        recs = records(nt)
        for s in random.sample(sorted(recs), min(n, len(recs))):
            name, url = recs[s]
            try:
                src = source_names(url)
            except Exception as e:  # noqa: BLE001
                print(f"FOUT   {os.path.basename(nt)}  {s}: {e}")
                bad += 1
                continue
            built = "(naam onbekend)" in (name or "")  # R2: built from other source fields (e.g. type + polder name)
            ok = norm(name) in {norm(x) for x in src} or (built and all(
                norm(x) in norm(name) or norm(x) in {"nvt", "null", "none", "onbekend"} for x in src))
            ok = ok or (name or "").startswith("Geschenkwoning ")  # gift houses have no source name (R2)
            bad += not ok
            print(f"{'OK  ' if ok else 'VERSCHIL'}  {os.path.basename(nt):34} {s.rsplit(':', 1)[-1]:>24}  ons: {name!r}  bron: {sorted(src)[:2]}")
    print(f"\n{bad} afwijking(en)")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 3)
