#!/usr/bin/env python3
"""Write proofs/v2_link_proofs.txt from the built koppelvlak: status counts per deciding source,
worked examples with real URIs, and a reproducible random sample for manual review.

Run:  python3 -I datalayer/proofs_v2.py
"""
import collections, json, os, random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
doc = json.load(open(os.path.join(ROOT, "data", "build", "droge-voeten.jsonld"), encoding="utf-8"))
M = {m["monumentNumber"]: m for m in doc["monuments"]}
out = ["Droge Voeten v2 - bewijs van linkbaarheid en statusafleiding",
       f"Gegenereerd uit data/build/droge-voeten.jsonld (dateModified {doc['dateModified']})", ""]


def decider(m):
    ev = [e for e in m["status"]["evidence"] if e["status"] == m["status"]["status"]]
    return ev[0]["source"] if ev else "(regel: type/geen bron)"


table = collections.Counter((m["status"]["status"], decider(m)) for m in doc["monuments"])
out.append("== Status x beslissende bron")
for (st, src), n in sorted(table.items()):
    out.append(f"{st:9} {n:4}  {src}")
out.append("")
sub = collections.Counter((m["status"]["status"], m["status"]["label"].split(" (")[0] if "register van" in m["status"]["label"] else m["status"]["label"]) for m in doc["monuments"])
out.append("== Status x toelichting (register-labels samengevoegd)")
for (st, lab), n in sorted(sub.items(), key=lambda x: (x[0][0], -x[1])):
    out.append(f"{st:9} {n:4}  {lab}")
out.append("")


def show(m):
    out.append(f"-- {m['name']} ({m.get('place') or ''})")
    out.append(f"   RCE        {m['@id']}  (monumentnummer {m['monumentNumber']})")
    out.append(f"   register   {m['register']}")
    out.append(f"   Wikidata   {m['wikidata']}")
    if m.get("molendatabase"):
        out.append(f"   Molendb    {m['molendatabase']}")
    if m.get("inServiceAs"):
        out.append(f"   IMWA       {m['inServiceAs']['@id']}  ({m['inServiceAs']['imwaId']}, {m['inServiceAs']['distance_m']} m)")
    out.append(f"   STATUS     {m['status']['status']}: {m['status']['label']}")
    for e in m["status"]["evidence"]:
        out.append(f"     [{e['status']}] {e['source']}{' ('+e['date']+')' if e.get('date') else ''}: \"{e['quote']}\"  {e.get('uri') or ''}")
    out.append("")


out.append("== Uitgewerkte voorbeelden")
for nr in ("25772", "19918", "508334", "19917"):
    if nr in M:
        show(M[nr])
examples = collections.OrderedDict()
for m in doc["monuments"]:
    k = (m["status"]["status"], m["status"]["label"][:40])
    if m.get("molendatabase") and k not in examples:
        examples[k] = m
for m in list(examples.values())[:8]:
    show(m)

out.append("== Willekeurige steekproef (seed 2026) voor handmatige controle")
rnd = random.Random(2026)
for m in rnd.sample([m for m in doc["monuments"] if m["status"]["status"] in ("nu", "vroeger")], 15):
    show(m)
open(os.path.join(ROOT, "proofs", "v2_link_proofs.txt"), "w", encoding="utf-8").write("\n".join(out) + "\n")
print("\n".join(out[:40]))
