#!/usr/bin/env python3
"""Data layer, step 2: link the raw sources and publish
  data/build/linkset.ttl          - NEW linkset, the contribution back to the network
  data/build/droge-voeten.jsonld  - the 'koppelvlak' document the presentation layer reads
  data/build/stats.json           - numbers for the README

Linking rules (all reproducible, no manual edits):
  L1  RCE monument  -> Wikidata item       : shared Rijksmonument number (Wikidata P359). Existing link, re-used.
  L2  RCE monument  -> IMWA kunstwerk      : same function (pumping station / lock / weir) AND distance <= 150 m.
                                            Name-token overlap raises confidence. This is the "still in service" link.
  L3  RCE monument  -> current water board : waterbeheerder of the nearest IMWA asset (<= 3 km), mapped to its
                                            Wikidata QID through the label table WATERBOARD_QID (checked by hand).
  L4  water board   -> ancestors           : Wikidata P1366 (replaced by) chain, inverted.

v2 additions:
  L5  RCE monument  -> Nederlandse Molendatabase page : via Wikidata P2863 (existing ID, new direct link)
  S   RCE monument  -> status 'nu' / 'vroeger' / 'onbekend' / 'nvt' with quoted evidence (datalayer/status.py)
  R   KNMI rainfall per station (wettest day on record, wettest day in the last 365 days)
  The koppelvlak also lists the open map services (datalayer/services.py) so other front ends can reuse them.

Run:  python3 -I datalayer/build.py
"""
import csv, json, math, os, re, sys, collections, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from status import classify  # noqa: E402
from services import SERVICES  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW, OUT = os.path.join(ROOT, "data", "raw"), os.path.join(ROOT, "data", "build")

# IMWA 'waterbeheerder' label -> Wikidata QID. Verified against wd_waterboards.csv (see README).
WATERBOARD_QID = {
    "Waterschap Noorderzijlvest": "Q2096098", "Waterschap Hunze en Aa's": "Q14941974",
    "Hoogheemraadschap van Rijnland": "Q2619632", "Hoogheemraadschap van Delfland": "Q3046110",
    "Wetterskip Fryslân": "Q1970347", "Waterschap Hollandse Delta": "Q3079910",
    "Waterschap Amstel, Gooi en Vecht": "Q2192659", "Waterschap Vallei en Veluwe": "Q2474783",
    "Waterschap Rivierenland": "Q2273075", "Waterschap Vechtstromen": "Q15883321",
    "Waterschap Drents Overijsselse Delta": "Q21921798", "Waterschap Limburg": "Q27895262",
    "Waterschap Rijn en IJssel": "Q2228586", "Hoogheemraadschap De Stichtse Rijnlanden": "Q2046915",
    "Hoogheemraadschap van Schieland en de Krimpenerwaard": "Q2304570",
    "Hoogheemraadschap Hollands Noorderkwartier": "Q4469762", "Waterschap Aa en Maas": "Q2553577",
    "Waterschap Scheldestromen": "Q2422832", "Waterschap Zuiderzeeland": "Q3086208",
    "Waterschap De Dommel": "Q2904296", "Waterschap Brabantse Delta": "Q3211339",
}

FUNCTION = {  # RCE additionalType -> IMWA collection it can correspond to
    "Gemaal": "gemaal", "Poldergemaal": "gemaal", "Boezemgemaal": "gemaal",
    "Schutsluis": "sluis", "Sluis": "sluis", "Spuisluis": "sluis", "Inlaatsluis": "sluis",
    "Keersluis": "sluis", "Inundatiesluis": "sluis", "Waterkering en -doorlaat": "sluis",
    "Stuw": "stuw", "Schuifstuw": "stuw",
}
WATER_MILL = re.compile(r"polder|bemal|vijzel|scheprad|boezem|wipmolen|tjasker|watermolen|spinnenkop", re.I)
STOP = {"gemaal", "sluis", "stuw", "de", "het", "van", "en", "ir", "ing", "molen", "schutsluis", "spuisluis"}


def centroid(wkt):
    """Point -> itself; (Multi)Polygon -> mean of the vertices of its first ring (good enough at 150 m scale)."""
    m = re.search(r"\(+([^()]+)\)", wkt or "")
    if not m:
        return None
    xy = [tuple(map(float, c.split())) for c in m[1].split(",") if c.strip()]
    return sum(x for x, _ in xy) / len(xy), sum(y for _, y in xy) / len(xy)


def km(a_lat, a_lon, b_lat, b_lon):
    p = math.pi / 180
    x = (b_lon - a_lon) * p * math.cos((a_lat + b_lat) * p / 2)
    return 6371.0 * math.hypot(x, (b_lat - a_lat) * p)


def tokens(s):
    return {t for t in re.findall(r"[a-zà-ÿ]{3,}", (s or "").lower()) if t not in STOP}


class Grid:  # tiny spatial index, 0.05 degree cells
    def __init__(self, pts):
        self.c = collections.defaultdict(list)
        for p in pts:
            if p["lat"] is not None:
                self.c[(int(p["lat"] / .05), int(p["lon"] / .05))].append(p)

    def near(self, lat, lon, r=1):
        i, j = int(lat / .05), int(lon / .05)
        for di in range(-r, r + 1):
            for dj in range(-r, r + 1):
                yield from self.c.get((i + di, j + dj), [])


def main():
    os.makedirs(OUT, exist_ok=True)

    # --- RCE monuments (dedupe multi-valued rows) ---
    mons = {}
    for r in csv.DictReader(open(os.path.join(RAW, "rce_water_monuments.csv"), encoding="utf-8", newline="")):
        pt = centroid(r["wkt"])
        if not pt:
            continue
        d = mons.setdefault(r["mon"], {"uri": r["mon"], "nr": r["nr"], "types": set(), "name": r["name"],
                                       "address": r["addr"], "place": r["place"], "lon": pt[0],
                                       "lat": pt[1], "desc": r["desc"]})
        d["types"].add(r["type"])
        d["name"] = d["name"] or r["name"]
    # Keep generic 'Molen' only if the description says it moved water.
    for k in list(mons):
        t = mons[k]["types"]
        if t <= {"Molen", "Weidemolen", "Getijmolen"} and not WATER_MILL.search(mons[k]["desc"] or ""):
            del mons[k]

    # --- Wikidata per monument number ---
    wd = {}
    for r in csv.DictReader(open(os.path.join(RAW, "wd_monuments.csv"), encoding="utf-8")):
        w = wd.setdefault(r["rm"], {"item": r["item"], "label": r["itemLabel"], "inception": r["inception"][:4] or None,
                                    "image": r["image"] or None, "article": r["article"] or None,
                                    "architects": {}, "owners": {}, "commissioners": {},
                                    "namedAfter": {}, "operators": {}})
        if r["architect"]: w["architects"][r["architect"]] = r["architectLabel"]
        if r["owner"]: w["owners"][r["owner"]] = r["ownerLabel"]
        if r["commissioner"]: w["commissioners"][r["commissioner"]] = r["commissionerLabel"]
        if r.get("namedAfter"): w["namedAfter"][r["namedAfter"]] = r["namedAfterLabel"]
        if r["operator"]: w["operators"][r["operator"]] = r["operatorLabel"]

    # --- IMWA assets ---
    imwa = {c: json.load(open(os.path.join(RAW, f"imwa_{c}.json"), encoding="utf-8")) for c in ("gemaal", "sluis", "stuw")}
    grids = {c: Grid(v) for c, v in imwa.items()}
    all_grid = Grid([p for v in imwa.values() for p in v])

    # --- v2: use/state signals (Wikidata), Molendatabase status, KNMI rainfall ---
    use = collections.defaultdict(lambda: {"inst": set(), "use": set(), "hm": None, "nmdb": None, "milldb": None})
    for r in csv.DictReader(open(os.path.join(RAW, "wd_use_state.csv"), encoding="utf-8")):
        u = use[r["rm"]]
        if r["instLabel"]: u["inst"].add(r["instLabel"])
        if r["useLabel"]: u["use"].add(r["useLabel"])
        u["hm"] = u["hm"] or r["hm"] or None
        u["nmdb"] = u["nmdb"] or r["nmdb"] or None
        u["milldb"] = u["milldb"] or r["milldb"] or None
    nmdb_path = os.path.join(RAW, "nmdb_status.json")
    nmdb = json.load(open(nmdb_path, encoding="utf-8")) if os.path.exists(nmdb_path) else {}
    rain = knmi_stats()

    # --- Water boards + genealogy ---
    boards, parents = {}, collections.defaultdict(set)
    for r in csv.DictReader(open(os.path.join(RAW, "wd_waterboards.csv"), encoding="utf-8")):
        q = r["ws"].rsplit("/", 1)[1]
        b = boards.setdefault(q, {"qid": q, "label": r["wsLabel"], "inception": r["inception"][:4] or None,
                                  "dissolved": r["dissolved"][:4] or None, "coord": None})
        m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", r["coord"] or "")
        if m: b["coord"] = [float(m[2]), float(m[1])]
        if r["replacedBy"]:
            parents[r["replacedBy"].rsplit("/", 1)[1]].add(q)  # child -> predecessors

    def ancestry(q, seen=None):
        seen = seen if seen is not None else set()
        out = []
        for p in sorted(parents.get(q, ())):
            if p in seen: continue
            seen.add(p)
            out.append({"qid": p, "children": ancestry(p, seen)})
        return out

    # --- Link ---
    out_mons, l2, l3, l5, status_rows, stats = [], [], [], [], [], collections.Counter()
    for mon in mons.values():
        stats["monuments"] += 1
        w = wd.get(mon["nr"])
        if w: stats["L1_wikidata"] += 1
        # L2 still in service
        match = None
        for t in mon["types"]:
            c = FUNCTION.get(t)
            if not c: continue
            for a in grids[c].near(mon["lat"], mon["lon"]):
                dist = km(mon["lat"], mon["lon"], a["lat"], a["lon"]) * 1000
                if dist <= 150:
                    overlap = tokens(mon["name"] or (w or {}).get("label")) & tokens(a["naam"])
                    score = (1 if overlap else 0, -dist)
                    if not match or score > match[0]:
                        match = (score, a, c, round(dist), sorted(overlap))
        if match:
            stats["L2_in_service"] += 1
            stats["L2_name_confirmed"] += bool(match[4])
            l2.append((mon, match))
        # L3 current water board
        best = None
        for a in all_grid.near(mon["lat"], mon["lon"], r=1):
            dist = km(mon["lat"], mon["lon"], a["lat"], a["lon"])
            if dist <= 3 and (best is None or dist < best[0]):
                best = (dist, a["waterbeheerder"])
        board = WATERBOARD_QID.get(best[1]) if best else None
        if best and not board: stats["unmapped:" + best[1]] += 1
        if board:
            stats["L3_waterboard"] += 1
            l3.append((mon, board))
        u = use.get(mon["nr"], {"inst": set(), "use": set(), "hm": None, "nmdb": None, "milldb": None})
        register = f"https://monumentenregister.cultureelerfgoed.nl/monumenten/{mon['nr']}"
        imwa_match = match and {"asset": match[1], "nameTokens": match[4], "distance": match[3], "harvested": IMWA_HARVESTED}
        st = classify(mon["types"], mon["desc"], register, nmdb.get(u["nmdb"]) if u["nmdb"] else None, imwa_match, u["inst"], w and w["item"])
        stats["status:" + st["status"]] += 1
        stats["status_conflicts"] += st["conflict"]
        if u["nmdb"]:
            l5.append((mon, nmdb.get(u["nmdb"], {}).get("url") or f"https://molendatabase.nl/nederland/molen.php?nummer={u['nmdb']}"))
        status_rows.append((mon, w, st))
        out_mons.append({
            "@id": mon["uri"], "monumentNumber": mon["nr"], "types": sorted(mon["types"]),
            "name": mon["name"] or (w or {}).get("label") or f'{sorted(mon["types"])[0]}, {mon["address"]}',
            "address": mon["address"], "place": mon["place"], "lat": mon["lat"], "lon": mon["lon"],
            "description": (mon["desc"] or "")[:600],
            "register": f"https://monumentenregister.cultureelerfgoed.nl/monumenten/{mon['nr']}",
            "wikidata": w and w["item"], "inception": w and w["inception"], "image": w and w["image"],
            "article": w and w["article"],
            "people": w and [{"@id": k, "name": v, "role": "architect"} for k, v in w["architects"].items()]
                          + [{"@id": k, "name": v, "role": "commissioned by"} for k, v in w["commissioners"].items()]
                          + [{"@id": k, "name": v, "role": "named after"} for k, v in w["namedAfter"].items()],
            "owners": w and [{"@id": k, "name": v} for k, v in w["owners"].items()],
            "inServiceAs": match and {"@id": match[1]["uri"], "imwaId": match[1]["id"], "name": match[1]["naam"],
                                      "kind": match[2], "distance_m": match[3], "nameTokens": match[4],
                                      "operator": match[1]["waterbeheerder"], "capacity": match[1]["capaciteit"],
                                      "function": match[1]["functie"]},
            "waterBoard": board and f"http://www.wikidata.org/entity/{board}",
            "status": st,
            "molendatabase": l5[-1][1] if u["nmdb"] else None,
            "hollandscheMolenId": u["hm"], "milldatabase": u["milldb"] and f"https://milldatabase.org/mills/{u['milldb']}",
            "originalUse": sorted(u["use"]),
        })

    current = sorted(set(WATERBOARD_QID.values()))
    doc = {
        "@context": {"@vocab": "https://schema.org/", "wd": "http://www.wikidata.org/entity/",
                     "monuments": {"@id": "hasPart", "@container": "@set"}},
        "@id": "urn:hackalod2026:droge-voeten",
        "name": "Wie houdt mijn voeten droog? - prepared data layer",
        "isBasedOn": ["https://linkeddata.cultureelerfgoed.nl/rce/datacatalog/id/dataset/51cf46fe-522b-390d-8620-ba777ccfc086",
                      "https://www.wikidata.org/", "https://api.pdok.nl/hwh/waterschappen-kunstwerken-imwa/ogc/v2",
                      "https://www.molendatabase.nl/", "https://www.daggegevens.knmi.nl/klimatologie/daggegevens"],
        "monuments": out_mons,
        "waterBoards": {q: boards.get(q, {"qid": q}) for q in boards},
        "currentWaterBoards": {q: {"label": boards.get(q, {}).get("label"), "inception": boards.get(q, {}).get("inception"),
                                   "ancestry": ancestry(q)} for q in current},
        "waterBoardLabelToQid": WATERBOARD_QID,
        "statusVocabulary": STATUS_VOCAB,
        "rainStations": rain,
        "services": SERVICES,
        "dateModified": datetime.date.today().isoformat(),
    }
    json.dump(doc, open(os.path.join(OUT, "droge-voeten.jsonld"), "w", encoding="utf-8"), ensure_ascii=False)

    # --- Linkset (Turtle) ---
    L = ["@prefix skos: <http://www.w3.org/2004/02/skos/core#> .",
         "@prefix schema: <https://schema.org/> .", "@prefix dct: <http://purl.org/dc/terms/> .",
         "@prefix void: <http://rdfs.org/ns/void#> .", "@prefix wd: <http://www.wikidata.org/entity/> .", "",
         "<urn:hackalod2026:linkset:rce-imwa> a void:Linkset ;",
         '  dct:title "Rijksmonumenten (RCE) still in service as water board assets (IMWA)"@en ;',
         '  dct:description "Generated by datalayer/build.py: same function and distance <= 150 m; name overlap noted."@en ;',
         "  void:linkPredicate skos:closeMatch ;",
         "  void:subjectsTarget <https://linkeddata.cultureelerfgoed.nl/rce/datacatalog/id/dataset/51cf46fe-522b-390d-8620-ba777ccfc086> ;",
         "  void:objectsTarget <https://api.pdok.nl/hwh/waterschappen-kunstwerken-imwa/ogc/v2> .", "",
         "<urn:hackalod2026:linkset:rce-waterboard> a void:Linkset ;",
         '  dct:title "Rijksmonumenten (RCE) located in the area of a current Dutch water board (Wikidata)"@en ;',
         "  void:linkPredicate schema:containedInPlace ;",
         "  void:objectsTarget <https://www.wikidata.org/> .", ""]
    for mon, m in l2:
        note = f"distance {m[3]} m" + (f"; shared name tokens: {', '.join(m[4])}" if m[4] else "; no name overlap")
        L.append(f"<{mon['uri']}> skos:closeMatch <{m[1]['uri']}> . # {m[1]['id']} - {note}")
    for mon, q in l3:
        L.append(f"<{mon['uri']}> schema:containedInPlace wd:{q} .")
    L += ["", "<urn:hackalod2026:linkset:rce-molendatabase> a void:Linkset ;",
          '  dct:title "Rijksmonumenten (RCE) described in the Nederlandse Molendatabase (via Wikidata P2863)"@en ;',
          "  void:linkPredicate schema:subjectOf ;",
          "  void:objectsTarget <https://www.molendatabase.nl/> .", ""]
    for mon, url in l5:
        L.append(f"<{mon['uri']}> schema:subjectOf <{url}> .")
    open(os.path.join(OUT, "linkset.ttl"), "w", encoding="utf-8").write("\n".join(L) + "\n")
    write_status(status_rows, stats)

    # --- Wikidata suggestions (QuickStatements v1), for HUMAN review before upload ---
    # P137 operator = current water board, only for name-confirmed in-service matches without an operator yet.
    qs = []
    for mon, m in l2:
        w = wd.get(mon["nr"])
        q = WATERBOARD_QID.get(m[1]["waterbeheerder"])
        if w and q and m[4] and not w["operators"]:
            qs.append(f'{w["item"].rsplit("/", 1)[1]}\tP137\t{q}\tS854\t"{m[1]["uri"]}"')
    open(os.path.join(OUT, "wikidata_P137_suggestions.qs"), "w", encoding="utf-8").write("\n".join(qs) + "\n")
    stats["wikidata_P137_suggestions"] = len(qs)

    stats["linkset_triples"] = len(l2) + len(l3) + len(l5)
    stats["L5_molendatabase"] = len(l5)
    stats["waterboards_on_wikidata"] = len(boards)
    stats["current_waterboards_ancestors"] = {q: sum(1 for _ in walk(doc["currentWaterBoards"][q]["ancestry"])) for q in current}
    json.dump(stats, open(os.path.join(OUT, "stats.json"), "w"), indent=1, ensure_ascii=False)
    print(json.dumps(stats, indent=1, ensure_ascii=False))


IMWA_HARVESTED = "2026-10-26"  # date of data/raw/imwa_*.json (datalayer/fetch.py)
STATUS_IRI = {"nu": "http://www.wikidata.org/entity/Q55654238", "vroeger": "http://www.wikidata.org/entity/Q56651571"}
STATUS_VOCAB = {
    "nu": {"label": "werkt nu mee aan je droge voeten", "sameAs": STATUS_IRI["nu"]},
    "vroeger": {"label": "werkte vroeger", "sameAs": STATUS_IRI["vroeger"]},
    "onbekend": {"label": "onbekend"},
    "nvt": {"label": "geen werktuig"},
}


def esc_ttl(s):
    return (s or "").replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")


def write_status(rows, stats):
    """status.ttl: one schema:PropertyValue per monument with its evidence (the new dataset we give back),
    plus QuickStatements for Wikidata P5817 (state of use) where the Molendatabase or IMWA says so."""
    T = ["@prefix schema: <https://schema.org/> .", "@prefix dct: <http://purl.org/dc/terms/> .",
         "@prefix prov: <http://www.w3.org/ns/prov#> .", "@prefix wd: <http://www.wikidata.org/entity/> .", "",
         "<urn:hackalod2026:dataset:staat-van-gebruik> a schema:Dataset ;",
         '  schema:name "Staat van gebruik van waterstaatsmonumenten (Droge Voeten)"@nl ;',
         '  schema:description "Per rijksmonument: werkt het nog mee aan de afwatering (nu), werkte het vroeger, of is het onbekend. Elke uitspraak verwijst naar haar bron."@nl ;',
         "  schema:license <https://creativecommons.org/licenses/by-sa/4.0/> .", ""]
    qs = []
    for mon, w, st in rows:
        node = f"<urn:hackalod2026:status:{mon['nr']}>"
        T.append(f"{node} a schema:PropertyValue ;")
        T.append(f"  schema:about <{mon['uri']}> ;")
        T.append('  schema:propertyID "staatVanGebruik" ;')
        if st["status"] in STATUS_IRI:
            T.append(f"  schema:value <{STATUS_IRI[st['status']]}> ;")
        T.append(f'  schema:valueReference "{st["status"]}" ;')
        T.append(f'  schema:description "{esc_ttl(st["label"])}"@nl ;')
        srcs = [e["uri"] for e in st["evidence"] if e.get("uri") and e["status"] != "hint"]
        for u in sorted(set(srcs)):
            T.append(f"  prov:wasDerivedFrom <{u}> ;")
        T[-1] = T[-1][:-2] + " ."
        # Wikidata suggestion only from a dated, curated source (Molendatabase) or the current register (IMWA)
        strong = [e for e in st["evidence"] if e["source"] != "Wikidata (P31 is een)" and not e["source"].startswith("Rijksmonumentenregister")
                  and e["status"] == st["status"]]
        if w and st["status"] in STATUS_IRI and strong and not st["conflict"]:
            qid = w["item"].rsplit("/", 1)[1]
            qs.append(f'{qid}\tP5817\t{STATUS_IRI[st["status"]].rsplit("/", 1)[1]}\tS854\t"{strong[0]["uri"]}"')
    open(os.path.join(OUT, "status.ttl"), "w", encoding="utf-8").write("\n".join(T) + "\n")
    open(os.path.join(OUT, "wikidata_P5817_suggestions.qs"), "w", encoding="utf-8").write("\n".join(qs) + "\n")
    stats["wikidata_P5817_suggestions"] = len(qs)


def knmi_stats():
    """Per KNMI station: wettest day on record and in the last 365 days (RH in 0.1 mm; -1 means < 0.05 mm)."""
    sp = os.path.join(RAW, "knmi_stations.json")
    if not os.path.exists(sp):
        return []
    out = []
    for s in json.load(open(sp, encoding="utf-8")):
        p = os.path.join(RAW, f"knmi_rh_{s['stn']}.csv")
        if not os.path.exists(p):
            continue
        days = []
        for line in open(p, encoding="utf-8"):
            if line.startswith("#"):
                continue
            parts = [x.strip() for x in line.split(",")]
            if len(parts) == 3 and parts[2] not in ("",):
                days.append((parts[1], max(0, int(parts[2])) / 10))
        if len(days) < 365 or days[-1][0] < (datetime.date.today() - datetime.timedelta(days=60)).strftime("%Y%m%d"):
            continue  # too short, or the station no longer reports
        last = days[-1][0]
        cutoff = (datetime.datetime.strptime(last, "%Y%m%d") - datetime.timedelta(days=365)).strftime("%Y%m%d")
        rec = max(days, key=lambda d: d[1])
        recent = max((d for d in days if d[0] > cutoff), key=lambda d: d[1])
        iso = lambda d: f"{d[:4]}-{d[4:6]}-{d[6:]}"
        out.append({"stn": s["stn"], "name": s["name"], "lat": s["lat"], "lon": s["lon"],
                    "since": iso(days[0][0]), "until": iso(last), "nDays": len(days),
                    "wettestDay": {"date": iso(rec[0]), "mm": rec[1]},
                    "wettestDayLastYear": {"date": iso(recent[0]), "mm": recent[1]},
                    "source": f"https://www.daggegevens.knmi.nl/klimatologie/daggegevens?stns={s['stn']}&vars=RH"})
    return out


def walk(tree):
    for n in tree:
        yield n
        yield from walk(n["children"])


if __name__ == "__main__":
    main()
