#!/usr/bin/env python3
"""Write proofs/v3_link_proofs.txt from the built v3 files: counts, worked examples with real URIs, and the
queries/requests behind them. Everything is read from data/build and data/raw/v3; nothing is typed in by hand.

Run:  python3 -I datalayer/proofs_v3.py
"""
import csv, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B, R = os.path.join(ROOT, "data", "build"), os.path.join(ROOT, "data", "raw", "v3")
st = json.load(open(os.path.join(B, "stats-v3.json"), encoding="utf-8"))
kv = json.load(open(os.path.join(B, "droge-voeten.jsonld"), encoding="utf-8"))
pts = json.load(open(os.path.join(B, "history-points.json"), encoding="utf-8"))
zl = json.load(open(os.path.join(B, "zeeland.json"), encoding="utf-8"))
ls = open(os.path.join(B, "linkset-v3.ttl"), encoding="utf-8").read().splitlines()
out = ["Droge Voeten v3 - bewijs van linkbaarheid (gegenereerd door datalayer/proofs_v3.py)", f"Build: {kv['dateModified']}", ""]
out.append("== Tellingen (data/build/stats-v3.json)")
out += [f"{k:42} {v}" for k, v in st.items() if k != "decades"]
out.append("")


def grep(pattern, n=3):
    return [l for l in ls if re.search(pattern, l)][:n]


out.append("== 1. Rijksmonument <-> gemaal (Gemalenstichting) via monumentnr in RCE-laag 'gemalen'")
w = next(p for p in pts["pumps"] if p["monument"] == "25772")
out.append(f"  RCE-laag gemalen: {w['name']} | stichtingsjaar {w['foundedText']} | aandrijving {w['driveOriginal']} -> {w['driveNow']} | {w['info']}")
out += ["  " + l for l in grep(r"rijksmonument/47128> schema:subjectOf", 4)]
out.append(f"  IMWA-link: {w.get('imwa')}")
out.append("")
out.append("== 2. Rijksmonument <-> molenrecord (Ten Bruggencate / allemolens.nl) via RMONNUMMER in RCE-laag 'Molens'")
m = pts["millsExisting"][0]
out.append(f"  {m['name']} ({m['place']}), RMONNUMMER {m['monument']}, TBGCNUMMER {m['tb']}, {m['info']}")
uris = {r["nr"]: r["mon"] for r in csv.DictReader(open(os.path.join(R, "rce_monument_uris.csv"), encoding="utf-8"))}
out += ["  " + l for l in grep(re.escape(uris.get(m["monument"], "-")) + "> schema:", 3)]
out.append("  Monumentnummer -> RCE-URI: SPARQL op https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/Rijksmonumenten-sdo/sparql")
out.append("  (SELECT ?nr ?mon WHERE { VALUES ?nr {...} ?mon schema:identifier ?nr }), uitkomst in data/raw/v3/rce_monument_uris.csv")
out.append("")
out.append("== 3. Verdwenen molen <-> Wikidata via P2903 (= molen_dbnr; formatter molendb.php?step=details&nummer=$1)")
out += ["  " + l for l in grep(r"skos:exactMatch .*verdwenenmolens", 3)]
qs = open(os.path.join(B, "wikidata_P571_P576_molens.qs"), encoding="utf-8").read().splitlines()
out += ["  QS: " + l for l in qs if l and not l.startswith("#")][:3]
out.append("  Wikidata-query: SELECT ?item ?id ... WHERE { ?item wdt:P2903 ?id . OPTIONAL P571/P576/P625 } (datalayer/fetch_v3.py)")
out.append("")
out.append("== 4. Zeeuwse polder <-> Wikidata (unieke naam + coordinaat in/bij de contour)")
out += ["  " + l for l in grep(r"geocmd_chspld.*closeMatch", 3)]
qs = open(os.path.join(B, "wikidata_P571_polders.qs"), encoding="utf-8").read().splitlines()
out += ["  QS: " + l for l in qs if l and not l.startswith("#")][:3]
out.append("")
out.append("== 5. Geschenkwoning 1953 <-> BAG (exacte straat + huisnummer + woonplaats via PDOK Locatieserver)")
g = next(x for x in zl["giftHouses"] if x["bag"] and x["street"] == "Koningin Maudplein" and x["number"] == "1")
out.append(f"  {g['street']} {g['number']}, {g['place']}: geschenk uit {g['country']}, datering {g['dated']} | bron {g['source']}")
out += ["  " + l for l in grep(re.escape(g["source"]) + ">", 2)]
out.append("")
out.append("== 6. Historisch gemaal <-> actueel gemaal in IMWA (naamwoord + <= 300 m, alleen status 'In bedrijf')")
out += ["  " + l for l in grep(r"gemalen&featureID=.*skos:closeMatch", 3)]
out.append("")
out.append("== 7. 1953")
f = kv["v3"]["flood1953"]
out.append("  " + f["note"])
out.append("  Gezocht: " + "; ".join(f["searched"]))
out.append(f"  Open inundatiekaart: {len(f['areas'])} vlakken (zout: {sum(a['salt'] == 'zout' for a in f['areas'])}), {f['areas'][0]['metadata']}")
for t in kv["v3"]["tideGauges1953"]:
    out.append(f"  Getijstation {t['name']:16} max gemeten NAP +{t['level_m']:.2f} m om {t['time']} ({t['status']}, elke {t['intervalMinutes']} min, {t['method']})")
out.append("  Verzoek: POST " + kv["v3"]["tideGauges1953"][0]["api"] + " " + json.dumps(kv["v3"]["tideGauges1953"][0]["request"]))
out.append("  Gebruik in de app: alleen in 'zout' overstroomd gebied, als expliciet benoemde vereenvoudiging.")
out.append("")
out.append("== 8. Opvallende jaartallen in de bron (verdwenen poldermolens)")
for y in ("1850", "1929"):
    n = sum(1 for i, x in enumerate(pts["millsGone"]["gone"]) if str(x) == y and pts["millsGone"]["cat"][i] == 0)
    out.append(f"  verdwenen in precies {y}: {n} poldermolens (getoond als waarschuwing bij de grafiek)")
open(os.path.join(ROOT, "proofs", "v3_link_proofs.txt"), "w", encoding="utf-8").write("\n".join(out) + "\n")
print("\n".join(out))
