#!/usr/bin/env python3
"""Data layer v3, step 2: turn the harvested history sources into koppelvlak files and contributions.

Reads data/raw/v3/* (fetch_v3.py) plus the v2 koppelvlak (build.py must have run first) and writes to data/build/:

  history-areas.json     simplified polygons for point-in-polygon in the browser: Zeeland polders per embankment
                         period, RCE droogmakerijen, ruilverkavelingen, Waterstaatskaart sheets (1st edition) and
                         the 1953 inundation area of Provincie Noord-Brabant
  history-points.json    mills that disappeared (17k, columnar), existing mills, historic pumping stations,
                         dike-breach pools; plus a per-decade summary (mills gone vs. pumping stations founded)
  zeeland.json           dikes with construction years, drowned villages, gift houses 1953 (+ BAG match), Delta Works
  droge-voeten.jsonld    the v2 koppelvlak, extended with 'v3' (file index, tide gauges 1953, vocabularies)
  linkset-v3.ttl         new links (see LINKS below)
  events.ttl             'how did this become dry' as a dataset: schema:Event + prov:wasDerivedFrom
  wikidata_P571_polders.qs, wikidata_P571_P576_molens.qs   QuickStatements, for human review before upload
  dataset-description.jsonld   schema.org/DCAT description of everything we publish
  stats-v3.json          numbers for the README

Uncertainty is kept explicit: every year carries its verbatim source text and a precision label
('jaar', 'circa', 'periode', 'eeuw', 'voor', 'onbekend'). Nothing is estimated.

Run:  python3 -I datalayer/build_v3.py
"""
import csv, collections, datetime, json, math, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW, RAW2, OUT = (os.path.join(ROOT, "data", "raw", "v3"), os.path.join(ROOT, "data", "raw"),
                  os.path.join(ROOT, "data", "build"))
TODAY = datetime.date.today().isoformat()

RCE_WFS = "https://services.rce.geovoorziening.nl/landschapsatlas/wfs"
ZLD_WFS = "https://opengeodata.zeeland.nl/geoserver/wfs"
NGR = "https://nationaalgeoregister.nl/geonetwork/srv/dut/catalog.search#/metadata/"
LICENSE_NOTE = {
    "rce": "RCE Landschapsatlas; Nationaal Georegister: 'Geen beperkingen' (o.a. c81e0dd2-3e91-44af-aaeb-4dcfed4b8b56 Gemalen, 7e41f6fa-936d-4fbe-b3b7-fb40dfe1283d Verdwenen molens, 291afe4b-4f4b-497c-8026-fb437c4e9c7e Molens, cd53d540-f499-4850-8053-e1172c97372e Droogmakerijen)",
    "zld": "Provincie Zeeland; Nationaal Georegister: 'Geen beperkingen' (o.a. e5c91c39-8cff-435f-a45d-3218e4584d5c Dijken, bfcfbdbf-0c42-4333-93eb-742ab69b9a75 Polders, 6eb9a0b2-b751-40a3-9a7d-5f3ed9d78a8b Verdronken dorpen, a04a860d-296d-45c2-8fc0-2e34750c5c90 Geschenkwoningen)",
    "brabant": "Provincie Noord-Brabant; Nationaal Georegister dc382a09-6677-48fd-975e-dee283cea4ad: 'Geen gebruiksbeperking, dit bestand kan onbeperkt uitgeleverd worden'",
    "rws": "Rijkswaterstaat WaterWebservices (open data)",
}


# ---------------------------------------------------------------- helpers
def load(name):
    return json.load(open(os.path.join(RAW, name), encoding="utf-8"))


def feature_uri(base, layer, fid):
    """Dereferenceable URI of one WFS feature (GetFeature with featureID; checked for both servers)."""
    return f"{base}?service=WFS&version=2.0.0&request=GetFeature&typeNames={layer}&featureID={fid}&outputFormat=application/json"


def zld_code_uri(layer, code):
    """The CHS 'geocmd' layers only have auto-generated GeoServer fids (not stable). Their 'code' (e.g. GEO-1260)
    identifies the object, so the source URI selects on it; a polder in several parts returns all parts."""
    return (f"{ZLD_WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames={layer}"
            f"&CQL_FILTER=code%3D%27{code}%27&outputFormat=application/json")


def rd_to_wgs84(x, y):
    """RD New (EPSG:28992) -> WGS84 lon/lat, polynomial approximation (Schreutelkamp & Strang van Hees), ~1 m."""
    dx, dy = (x - 155000) * 1e-5, (y - 463000) * 1e-5
    n = (3235.65389 * dy - 32.58297 * dx ** 2 - 0.2475 * dy ** 2 - 0.84978 * dx ** 2 * dy - 0.0655 * dy ** 3
         - 0.01709 * dx ** 2 * dy ** 2 - 0.00738 * dx + 0.0053 * dx ** 4 - 0.00039 * dx ** 2 * dy ** 3
         + 0.00033 * dx ** 4 * dy - 0.00012 * dx * dy)
    e = (5260.52916 * dx + 105.94684 * dx * dy + 2.45656 * dx * dy ** 2 - 0.81885 * dx ** 3 + 0.05594 * dx * dy ** 3
         - 0.05607 * dx ** 3 * dy + 0.01199 * dy - 0.00256 * dx ** 3 * dy ** 2 + 0.00128 * dx * dy ** 4
         + 0.00022 * dy ** 2 - 0.00022 * dx ** 2 + 0.00026 * dx ** 5)
    return 5.38720621 + e / 3600, 52.15517440 + n / 3600


def dp(pts, tol):
    """Douglas-Peucker simplification (iterative), planar in degrees; tol in degrees."""
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a][:2]
        bx, by = pts[b][:2]
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        best, idx = -1, None
        for i in range(a + 1, b):
            px, py = pts[i][:2]
            if l2 == 0:
                d = math.hypot(px - ax, py - ay)
            else:
                t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
                d = math.hypot(px - ax - t * dx, py - ay - t * dy)
            if d > best:
                best, idx = d, i
        if best > tol and idx is not None:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def rnd(p, nd=5):
    return [round(p[0], nd), round(p[1], nd)]


def simplify(geom, tol, nd=5):
    t = geom["type"]
    if t == "Polygon":
        polys = [geom["coordinates"]]
    elif t == "MultiPolygon":
        polys = geom["coordinates"]
    elif t == "LineString":
        return {"type": "LineString", "coordinates": [rnd(p, nd) for p in dp(geom["coordinates"], tol)]}
    elif t == "MultiLineString":
        return {"type": "MultiLineString", "coordinates": [[rnd(p, nd) for p in dp(l, tol)] for l in geom["coordinates"]]}
    else:
        return geom
    out = []
    for poly in polys:
        rings = []
        for i, ring in enumerate(poly):
            r = [rnd(p, nd) for p in dp(ring, tol)]
            if len(r) >= 4:
                rings.append(r)
            elif i == 0:
                break
        if rings:
            out.append(rings)
    return {"type": "MultiPolygon", "coordinates": out} if out else None


def bbox(geom):
    xs, ys = [], []

    def walk(c):
        if isinstance(c[0], (int, float)):
            xs.append(c[0]); ys.append(c[1])
        else:
            for k in c:
                walk(k)
    walk(geom["coordinates"])
    return [round(min(xs), 5), round(min(ys), 5), round(max(xs), 5), round(max(ys), 5)]


def in_ring(x, y, ring):
    c, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][:2]
        xj, yj = ring[j][:2]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def in_geom(x, y, geom):
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    return any(in_ring(x, y, p[0]) and not any(in_ring(x, y, h) for h in p[1:]) for p in polys)


def km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    return 6371.0 * math.hypot((lon2 - lon1) * p * math.cos((lat1 + lat2) * p / 2), (lat2 - lat1) * p)


def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


MEMORIX = "https://images.memorix.nl/rce/thumb/350x350/"


def photo_id(url):
    """Store only the image id; the app rebuilds MEMORIX + id (saves ~45 bytes per record)."""
    url = clean(url)
    return url[len(MEMORIX):] if url and url.startswith(MEMORIX) else url


def clean(s):
    s = (s or "").strip() if isinstance(s, str) else s
    return s or None


# ---------------------------------------------------------------- year parsing (verbatim text + precision)
CENT = re.compile(r"(\d{1,2})e\s*(?:/\s*(\d{1,2})e\s*)?eeuw", re.I)


def parse_period(text, fallback=None):
    """Zeeland 'periodevan' text -> {text, year (for sorting), precision}. Never invents a year."""
    t = (text or "").strip()
    if not t or t == "*":
        return {"text": None, "year": fallback, "precision": "onbekend" if fallback is None else "periode-van-laag"}
    if re.fullmatch(r"\d{3,4}", t):
        return {"text": t, "year": int(t), "precision": "jaar"}
    m = re.fullmatch(r"(?:ca\.?|circa|omstreeks)\s*(\d{3,4})", t, re.I)
    if m:
        return {"text": t, "year": int(m[1]), "precision": "circa"}
    m = re.match(r"(?:v[oó]{1,2}r|reeds voor)\s*(?:de\s*)?(\d{3,4})", t, re.I)
    if m:
        return {"text": t, "year": int(m[1]), "precision": "voor"}
    m = re.match(r"(?:tussen\s*(?:ca\.?\s*)?)?(\d{3,4})\s*(?:[/\-–]|en|tot)\s*(\d{2,4})", t, re.I)
    if m:
        return {"text": t, "year": int(m[1]), "precision": "periode"}
    m = CENT.search(t)
    if m:
        c = int(m[1])
        start = (c - 1) * 100
        if re.search(r"tweede helft", t, re.I):
            start += 50
        return {"text": t, "year": start, "precision": "eeuw"}
    m = re.search(r"(\d{4})", t)
    if m:
        return {"text": t, "year": int(m[1]), "precision": "periode"}
    return {"text": t, "year": fallback, "precision": "onbekend" if fallback is None else "periode-van-laag"}


def int_year(v):
    try:
        v = int(str(v).strip()[:4])
        return v if 500 < v < 2100 else None
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- AREAS
ZLD_POLDER_LAYERS = [  # layer, period label, period start (for sorting only when the text has no year)
    ("geocmd_chspld_vr1300vvl", "vóór 1300", 1000), ("geocmd_chspld13001421vvl", "1300-1421", 1300),
    ("geocmd_chspld14221532vvl", "1422-1532", 1422), ("geocmd_chspld15331648vvl", "1533-1648", 1533),
    ("geocmd_chspld16491808vvl", "1649-1808", 1649), ("geocmd_chspld18091953vvl", "1809-1953", 1809),
    ("geocmd_chspld_na1953vvl", "na 1953", 1953)]


def build_areas(stats):
    areas = []
    # Zeeland polders per embankment period
    for layer, label, start in ZLD_POLDER_LAYERS:
        d = load(f"zld_{layer}.json")
        for f in d["features"]:
            if not f["geometry"]:
                continue
            p = f["properties"]
            g = simplify(f["geometry"], 0.00008)
            if not g:
                continue
            per = parse_period(p.get("periodevan"))
            areas.append({"kind": "polder", "name": clean(p.get("naam")) if clean(p.get("naam")) != "*" else None,
                          "periodLayer": label, "year": per["year"] or start, "yearText": per["text"],
                          "precision": per["precision"] if per["year"] else "periode-van-laag",
                          "report": clean(p.get("reportlink")), "place": clean(p.get("plaats")),
                          "code": p.get("code"), "source": zld_code_uri("chs:" + layer, p.get("code")), "publisher": "Provincie Zeeland",
                          "bbox": bbox(g), "geometry": g})
            stats["areas:polder"] += 1
    # Zeeland polder names with embankment year (complement; used only when no period polder matches)
    for f in load("zld_geonam_pldvlk.json")["features"]:
        if not f["geometry"]:
            continue
        p = f["properties"]
        g = simplify(f["geometry"], 0.0001)
        if not g:
            continue
        y = int_year(p.get("indijking"))
        areas.append({"kind": "poldernaam", "name": clean(p.get("naam")), "year": y, "yearText": str(y) if y else None,
                      "precision": "jaar" if y else "onbekend",
                      "source": feature_uri(ZLD_WFS, "zeeland:geonam_pldvlk", f["id"]), "publisher": "Provincie Zeeland",
                      "bbox": bbox(g), "geometry": g})
        stats["areas:poldernaam"] += 1
    # RCE droogmakerijen
    for f in load("rce_droogmakerijen.json")["features"]:
        p = f["properties"]
        g = simplify(f["geometry"], 0.0001)
        if not g:
            continue
        y = int_year(p.get("datum_droo"))
        before = (p.get("periode") or "").startswith("1550 en eerder")
        areas.append({"kind": "droogmakerij", "name": clean(p.get("poldernaam")), "year": y,
                      "yearText": ("vóór 1550" if before else str(y)) if y else None,
                      "precision": "voor" if before else ("jaar" if y else "onbekend"),
                      "polderLevel": clean(p.get("polderpeil")), "periode": clean(p.get("periode")),
                      "literature": clean(p.get("bron_data")), "source": feature_uri(RCE_WFS, "landschapsatlas:droogmakerijen", f["id"]),
                      "rceId": p.get("id"), "publisher": "Rijksdienst voor het Cultureel Erfgoed", "bbox": bbox(g), "geometry": g})
        stats["areas:droogmakerij"] += 1
    # Land consolidation (ruilverkaveling etc.)
    for f in load("rce_LandinrichtingNL.json")["features"]:
        p = f["properties"]
        g = simplify(f["geometry"], 0.0008, 4)
        if not g:
            continue
        areas.append({"kind": "landinrichting", "name": clean(p.get("labelnaam")) or clean(p.get("projnaam")),
                      "form": clean(p.get("livorm_oms")), "year": int_year(p.get("jaaruitv")),
                      "yearText": str(int_year(p.get("jaaruitv"))) if int_year(p.get("jaaruitv")) else None,
                      "precision": "jaar" if int_year(p.get("jaaruitv")) else "onbekend",
                      "deedYear": int_year(p.get("jaarakte")), "closedYear": int_year(p.get("jaarafsl")),
                      "status": clean(p.get("status")),
                      "source": feature_uri(RCE_WFS, "landschapsatlas:LandinrichtingNL", f["id"]),
                      "publisher": "Rijksdienst voor het Cultureel Erfgoed", "bbox": bbox(g), "geometry": g})
        stats["areas:landinrichting"] += 1
    # Waterstaatskaart 1st edition sheets (link only; the JPGs are not georeferenced)
    for f in load("rce_waterstaatskaart1_bladwijzer.json")["features"]:
        p = f["properties"]
        g = simplify(f["geometry"], 0.002)
        if not g:
            continue
        areas.append({"kind": "waterstaatskaart", "name": clean(p.get("bladnaam")), "year": int_year(p.get("jaar_bewerking")),
                      "yearText": str(p.get("jaar_bewerking")), "precision": "jaar", "download": clean(p.get("url")),
                      "source": feature_uri(RCE_WFS, "landschapsatlas:waterstaatskaart1_bladwijzer", f["id"]),
                      "publisher": "Rijkswaterstaat / RCE", "bbox": bbox(g), "geometry": g})
        stats["areas:waterstaatskaart"] += 1
    # 1953 inundation area (Provincie Noord-Brabant, RD New)
    b = load("brabant_inundatie_1953.json")
    for f in b["features"]:
        geom = f["geometry"]
        conv = lambda ring: [list(rd_to_wgs84(x, y)) for x, y in (c[:2] for c in ring)]
        if geom["type"] == "Polygon":
            gg = {"type": "Polygon", "coordinates": [conv(r) for r in geom["coordinates"]]}
        else:
            gg = {"type": "MultiPolygon", "coordinates": [[conv(r) for r in poly] for poly in geom["coordinates"]]}
        g = simplify(gg, 0.00005)
        if not g:
            continue
        areas.append({"kind": "inundatie1953", "name": "Overstroomd gebied watersnoodramp 1953",
                      "salt": clean(f["properties"].get("SALIN")), "year": 1953, "yearText": "1953", "precision": "jaar",
                      "source": b["_source"], "metadata": b["_metadata"], "publisher": "Provincie Noord-Brabant",
                      "coverage": "alleen het grondgebied van Noord-Brabant (dataset 'Historische Inundatie Ramp 1953', WOP2000)",
                      "bbox": bbox(g), "geometry": g})
        stats["areas:inundatie1953"] += 1
    return areas


# ---------------------------------------------------------------- POINTS
def build_points(stats, imwa):
    # Mills that disappeared (columnar)
    vm = load("rce_verdwenenmolens.json")["features"]
    cols = {k: [] for k in ("lat", "lon", "built", "builtQ", "gone", "goneQ", "cat", "name", "tb", "dbnr", "fid", "type", "func")}
    cats = ["poldermolen", "industriemolen", "rosmolen", "watermolen"]
    for f in vm:
        p, (lon, lat) = f["properties"], f["geometry"]["coordinates"][:2]
        cols["lat"].append(round(lat, 5)); cols["lon"].append(round(lon, 5))
        b, g = int_year(p.get("bouwjaar_1")), int_year(p.get("verdwenen1"))
        cols["built"].append(b or 0); cols["builtQ"].append(clean(p.get("bouwjaar_2")) or "")
        cols["gone"].append(g or 0); cols["goneQ"].append(clean(p.get("verdwenen2")) or "")
        cols["cat"].append(cats.index(p["hoofdcat"]) if p.get("hoofdcat") in cats else -1)
        cols["name"].append(clean(p.get("molen_naam")) or ""); cols["tb"].append(clean(p.get("ten_brugge")) or "")
        cols["dbnr"].append(clean(p.get("molen_dbnr")) or ""); cols["fid"].append(int(f["id"].split(".")[1]))
        cols["type"].append(clean(p.get("type")) or ""); cols["func"].append(clean(p.get("functie")) or "")
        stats["mills_gone"] += 1
        stats["mills_gone:built_known"] += bool(b)
        stats["mills_gone:gone_known"] += bool(g)
        stats["mills_gone:poldermolen"] += p.get("hoofdcat") == "poldermolen"
    # Existing mills
    mills = []
    for f in load("rce_Molens.json")["features"]:
        p, (lon, lat) = f["properties"], f["geometry"]["coordinates"][:2]
        mills.append({"lat": round(lat, 5), "lon": round(lon, 5), "name": clean(p.get("NAAM")), "place": clean(p.get("PLAATS")),
                      "built": int_year(p.get("BOUWJAAR")), "builtText": clean(p.get("BOUWJAAR")), "func": clean(p.get("FUNCTIE")),
                      "mainFunc": clean(p.get("HFDFUNCTIE")), "state": clean(p.get("STAAT")), "type": clean(p.get("TYPE")),
                      "monument": clean(p.get("RMONNUMMER")), "tb": clean(p.get("TBGCNUMMER")), "info": clean(p.get("INFOLINK")),
                      "photo": photo_id(p.get("THUMBNAIL")), "photographer": clean(p.get("FOTOGRAAF")), "fid": f["id"]})
        stats["mills_existing"] += 1
    # Historic pumping stations (Nederlandse Gemalenstichting via RCE), linked to the current IMWA register
    pumps, imwa_links = [], []
    grid = collections.defaultdict(list)
    for a in imwa:
        if a["lat"] is not None:
            grid[(int(a["lat"] / .02), int(a["lon"] / .02))].append(a)
    stop = {"gemaal", "de", "het", "van", "en", "ir", "ing", "polder", "boezemgemaal", "poldergemaal", "stoomgemaal", "mr", "dr"}
    tok = lambda s: {t for t in re.findall(r"[a-z]{3,}", norm(s)) if t not in stop}
    for f in load("rce_gemalen.json")["features"]:
        p, (lon, lat) = f["properties"], f["geometry"]["coordinates"][:2]
        y = int_year(p.get("stichtingsjaar"))
        st = (p.get("stichtingsjaar") or "").strip()
        rec = {"lat": round(lat, 5), "lon": round(lon, 5), "name": clean(p.get("naam_gemaal")), "place": clean(p.get("plaats")),
               "founded": y, "foundedText": st or None, "foundedPrecision": "jaar" if re.fullmatch(r"\d{4}", st) else ("onzeker" if y else "onbekend"),
               "func": clean(p.get("functie")), "status": clean(p.get("status")),
               "driveOriginal": clean(p.get("aandrijving_oorspronkelijk")), "driveNow": clean(p.get("aandrijving_huidig")),
               "area": clean(p.get("bemalingsgebied")), "monument": clean(p.get("monumentnr")),
               "info": clean(p.get("infolink")), "photo": photo_id(p.get("foto_thumb")), "photographer": clean(p.get("fotograaf")), "fid": f["id"]}
        # IMWA link: same name token(s) within 300 m (only name-confirmed links count)
        best = None
        i, j = int(lat / .02), int(lon / .02)
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                for a in grid.get((i + di, j + dj), []):
                    d = km(lat, lon, a["lat"], a["lon"]) * 1000
                    ov = tok(rec["name"]) & tok(a["naam"])
                    if d <= 300 and ov and (best is None or d < best[0]):
                        best = (round(d), a, sorted(ov))
        if best and rec["status"] == "In bedrijf":
            rec["imwa"] = {"@id": best[1]["uri"], "name": best[1]["naam"], "distance_m": best[0], "operator": best[1]["waterbeheerder"]}
            imwa_links.append((rec, best))
            stats["pumps:imwa_name_confirmed"] += 1
        pumps.append(rec)
        stats["pumps"] += 1
        stats["pumps:founded_known"] += bool(y)
    # Dike-breach pools ('wielen')
    wielen = []
    for f in load("rce_wielen.json")["features"]:
        p, (lon, lat) = f["properties"], f["geometry"]["coordinates"][:2]
        y = p.get("ontstjaar") or 0
        wielen.append({"lat": round(lat, 5), "lon": round(lon, 5), "name": clean(p.get("naamwiel")), "place": clean(p.get("plaats")),
                       "year": y if y > 0 else None, "river": clean(p.get("hoofdstr")), "type": clean(p.get("type")),
                       "fid": f["id"]})
    stats["wielen"] = len(wielen)
    # Historic mills & pumping stations per droogmakerij
    dm = []
    for f in load("rce_drgmk_molens_gemalen.json")["features"]:
        p, (lon, lat) = f["properties"], f["geometry"]["coordinates"][:2]
        dm.append({"lat": round(lat, 5), "lon": round(lon, 5), "type": clean(p.get("type")), "name": clean(p.get("naam")),
                   "polderId": p.get("polderID"), "polder": clean(p.get("poldernaam")), "mapSource": clean(p.get("bron_geo")),
                   "monument": p.get("monument_n"), "fid": f["id"]})
    stats["droogmakerij_molens_gemalen"] = len(dm)

    # Per decade: water mills that disappeared vs. pumping stations founded (only records with a known year)
    dec = collections.defaultdict(lambda: [0, 0])
    for b, g, c in zip(cols["built"], cols["gone"], cols["cat"]):
        if c == 0 and g:
            dec[g // 10 * 10][0] += 1
    for r in pumps:
        if r["founded"]:
            dec[r["founded"] // 10 * 10][1] += 1
    decades = [{"decade": d, "poldermolensVerdwenen": v[0], "gemalenGesticht": v[1]} for d, v in sorted(dec.items()) if 1700 <= d <= 2020]
    return {"millsGone": cols, "millsGoneCategories": cats, "millsExisting": mills, "pumps": pumps, "wielen": wielen,
            "droogmakerijMolensGemalen": dm, "decades": decades}, imwa_links


# ---------------------------------------------------------------- ZEELAND
def build_zeeland(stats):
    dikes = []
    for f in load("zld_ext_chs_dykdamwalzld.json")["features"]:
        if not f["geometry"]:
            continue
        p = f["properties"]
        g = simplify(f["geometry"], 0.0001)
        b, e, ind = int_year(p.get("aanleg_beg")), int_year(p.get("aanleg_ein")), int_year(p.get("aanleg_ind"))
        dikes.append({"name": clean(p.get("naam")), "begin": b, "end": e, "indicative": ind, "status": clean(p.get("status")),
                      "originalFunction": clean(p.get("oorsprfunc")), "laterFunction": clean(p.get("naspfunc")),
                      "polder": clean(p.get("polder")), "gone": clean(p.get("verdwenen")),
                      "hasLiterature": bool(clean(p.get("bron_data_uitg"))), "source": feature_uri(ZLD_WFS, "chs:ext_chs_dykdamwalzld", f["id"]),
                      "geometry": g})
        stats["zld:dikes"] += 1
        stats["zld:dikes_with_year"] += bool(ind or b)
    villages = []
    for f in load("zld_geocmd_vrddrppnt.json")["features"]:
        p, (lon, lat) = f["properties"], f["geometry"]["coordinates"][:2]
        alt = [clean(p.get(k)) for k in ("naam2", "naam3", "naam4") if clean(p.get(k)) and clean(p.get(k)) != "-"]
        per = parse_period(p.get("periode"))
        villages.append({"lat": round(lat, 5), "lon": round(lon, 5), "name": clean(p.get("naam")), "altNames": alt,
                         "period": per["text"], "year": per["year"], "precision": per["precision"], "municipality": clean(p.get("gemeente")),
                         "source": feature_uri(ZLD_WFS, "chs:geocmd_vrddrppnt", f["id"])})
    stats["zld:drowned_villages"] = len(villages)
    delta = []
    for f in load("zld_geocmd_chsdltwrkvln.json")["features"]:
        p = f["properties"]
        delta.append({"name": clean(p.get("naam")), "period": clean(p.get("periodevan")), "report": clean(p.get("reportlink")),
                      "geometry": simplify(f["geometry"], 0.0001), "source": zld_code_uri("chs:geocmd_chsdltwrkvln", p.get("code"))})
    # Gift houses 1953 + exact BAG match (street, number and place must all agree)
    geo = load("pdok_giftaddresses.json") if os.path.exists(os.path.join(RAW, "pdok_giftaddresses.json")) else {}
    gifts = []
    for f in load("zld_geocmd_gskwnn_53pnt.json")["features"]:
        p, (lon, lat) = f["properties"], f["geometry"]["coordinates"][:2]
        rec = {"lat": round(lat, 5), "lon": round(lon, 5), "objectnummer": clean(p.get("objectnummer")), "street": clean(p.get("straat")),
               "number": clean(p.get("huisnummer")), "addition": clean(p.get("huisnummer_toevoeging")), "place": clean(p.get("plaats")),
               "municipality": clean(p.get("gemeente")), "province": clean(p.get("provincie")), "country": clean(p.get("land_van_herkomst")),
               "dated": clean(p.get("datering")), "form": clean(p.get("hoofdvorm")), "ensemble": clean(p.get("stedenbouwkundige_situatie")),
               "recognisable": clean(p.get("herkenbaarheid_woning")), "changes": clean(p.get("wijzigingen_object")),
               "photo": clean(p.get("fotoa")), "inventoried": clean(p.get("datum_inventarisatie")),
               "source": feature_uri(ZLD_WFS, "chs:geocmd_gskwnn_53pnt", f["id"]), "bag": None}
        g = geo.get(f["id"], {})
        want = (norm(rec["street"]), norm((rec["number"] or "") + (rec["addition"] or "")), norm(rec["place"]))
        for d in g.get("docs", []):
            have = (norm(d.get("straatnaam")), norm(f'{d.get("huisnummer") or ""}{d.get("huisletter") or ""}{d.get("huisnummertoevoeging") or ""}'),
                    norm(d.get("woonplaatsnaam")))
            if have == want:
                rec["bag"] = {"nummeraanduiding": d.get("nummeraanduiding_id"), "verblijfsobject": d.get("adresseerbaarobject_id"),
                              "label": d.get("weergavenaam")}
                break
        stats["zld:gift_houses"] += 1
        stats["zld:gift_houses_bag_exact"] += bool(rec["bag"])
        gifts.append(rec)
    return {"dikes": dikes, "drownedVillages": villages, "deltaWorks": delta, "giftHouses": gifts}


# ---------------------------------------------------------------- RWS 1953
def build_tide_gauges(stats):
    raw = load("rws_1953.json")
    out = []
    for code, r in raw.items():
        best, loc = None, None
        for w in r["response"].get("WaarnemingenLijst") or []:
            a = w["AquoMetadata"]
            loc = w["Locatie"]
            if a.get("ProcesType") != "meting":
                continue
            ms = [m for m in w["MetingenLijst"] if m["Meetwaarde"].get("Waarde_Numeriek") is not None and m["Meetwaarde"]["Waarde_Numeriek"] < 9000]
            if not ms:
                continue
            top = max(ms, key=lambda m: m["Meetwaarde"]["Waarde_Numeriek"])
            ts = sorted(m["Tijdstip"] for m in ms)
            step = None
            if len(ts) > 1:
                t0 = datetime.datetime.fromisoformat(ts[0]); t1 = datetime.datetime.fromisoformat(ts[1])
                step = round((t1 - t0).total_seconds() / 60)
            cand = {"level_m": top["Meetwaarde"]["Waarde_Numeriek"] / 100, "time": top["Tijdstip"],
                    "status": top["WaarnemingMetadata"].get("Statuswaarde"), "method": a["WaardeBepalingsMethode"]["Omschrijving"],
                    "instrument": (a.get("MeetApparaat") or {}).get("Omschrijving"), "intervalMinutes": step, "n": len(ms)}
            if best is None or cand["level_m"] > best["level_m"]:
                best = cand
        if best and loc:
            out.append({"code": code, "name": loc["Naam"], "lat": loc["Lat"], "lon": loc["Lon"], **best,
                        "reference": "NAP", "api": "https://ddapi20-waterwebservices.rijkswaterstaat.nl/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen",
                        "request": r["request"]})
    stats["tide_gauges_1953"] = len(out)
    return out


# ---------------------------------------------------------------- Wikidata
def wd_csv(name):
    p = os.path.join(RAW, name)
    if not os.path.exists(p):
        return []
    return list(csv.DictReader(open(p, encoding="utf-8")))


def point(wkt):
    m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", wkt or "")
    return (float(m[1]), float(m[2])) if m else None


def wikidata_mills(points, stats):
    """P2903 (Molendatabase verdwenen molens ID) = molen_dbnr in the RCE layer (formatter uses 'nummer=')."""
    rows = wd_csv("wd_p2903.csv")
    items = {}
    for r in rows:
        it = items.setdefault(r["item"], {"ids": set(), "label": r["itemLabel"], "inc": set(), "dis": set(), "coord": point(r["coord"])})
        it["ids"].add(r["id"]); it["inc"].add(r["inception"][:4] if r["inception"] else None); it["dis"].add(r["dissolved"][:4] if r["dissolved"] else None)
    cols = points["millsGone"]
    by_dbnr = collections.defaultdict(list)
    for i, d in enumerate(cols["dbnr"]):
        by_dbnr[d].append(i)
    links, qs, conflicts = [], [], []
    for item, it in items.items():
        for id_ in it["ids"]:
            cand = by_dbnr.get(id_)
            if not cand:
                stats["wd_p2903:no_rce_record"] += 1
                continue
            if it["coord"]:
                dist, i = min((km(cols["lat"][k], cols["lon"][k], it["coord"][1], it["coord"][0]), k) for k in cand)
            else:
                dist, i = (None, cand[0]) if len(cand) == 1 else (None, None)
            if i is None:
                stats["wd_p2903:ambiguous_no_coord"] += 1
                continue
            if dist is not None and dist > 5:
                stats["wd_p2903:far_apart_skipped"] += 1
                continue
            stats["wd_p2903:linked"] += 1
            links.append((item, i, dist))
            qid = item.rsplit("/", 1)[1]
            ref = f'S854\t"http://www.molendatabase.org/molendb.php?step=details&nummer={id_}"\tS813\t+{TODAY}T00:00:00Z/11'
            b, bq, g, gq = cols["built"][i], cols["builtQ"][i], cols["gone"][i], cols["goneQ"][i]
            inc = {x for x in it["inc"] if x}
            dis = {x for x in it["dis"] if x}
            if b and not bq:
                if not inc:
                    qs.append(f"{qid}\tP571\t+{b:04d}-00-00T00:00:00Z/9\t{ref}")
                    stats["qs:P571_mill"] += 1
                elif str(b) not in inc:
                    conflicts.append((qid, "P571", sorted(inc), b))
            if g and not gq:
                if not dis:
                    qs.append(f"{qid}\tP576\t+{g:04d}-00-00T00:00:00Z/9\t{ref}")
                    stats["qs:P576_mill"] += 1
                elif str(g) not in dis:
                    conflicts.append((qid, "P576", sorted(dis), g))
    stats["wd_p2903:items"] = len(items)
    stats["wd_p2903:date_conflicts"] = len(conflicts)
    return links, qs, conflicts


def wikidata_polders(areas, stats):
    """P571 for Zeeland polders: only a unique name match whose Wikidata coordinate lies inside (or within 1 km of)
    the polder polygon, only an exact or 'circa' year, and only when Wikidata has no P571 yet."""
    rows = wd_csv("wd_zeeland_polders.csv")
    items = {}
    for r in rows:
        it = items.setdefault(r["item"], {"label": r["itemLabel"], "names": set(), "inc": set(), "coord": point(r["coord"])})
        it["names"].add(norm(r["itemLabel"]))
        if r.get("alias"):
            it["names"].add(norm(r["alias"]))
        if r["inception"]:
            it["inc"].add(r["inception"][:4])
    stats["wd_zld_polders:items"] = len(items)
    stats["wd_zld_polders:with_P571"] = sum(1 for it in items.values() if it["inc"])

    def variants(name):
        out = set()
        for part in re.split(r"\s+of\s+|/", name or ""):
            n = norm(part)
            if n:
                out.add(n)
                out.add(re.sub(r"\s*polder$", "", n).strip())
                out.add(re.sub(r"^polder\s+", "", n).strip())
        return {v for v in out if len(v) > 2}

    polders = [a for a in areas if a["kind"] == "polder" and a["name"]]
    by_name = collections.defaultdict(list)
    for a in polders:
        for v in variants(a["name"]):
            by_name[v].append(a)
    item_names = collections.defaultdict(list)
    for q, it in items.items():
        for n in it["names"]:
            for v in variants(n):
                item_names[v].append(q)
    matches, qs = [], []
    for q, it in items.items():
        cands = {id(a): a for n in it["names"] for v in variants(n) for a in by_name.get(v, [])}
        if not it["coord"]:
            continue
        # parts of one polder share a source URI (layer + code): treat them as one candidate. The same code in
        # two period layers stays two candidates, so such a polder is skipped (its period is not unique).
        groups = collections.defaultdict(list)
        for a in cands.values():
            groups[a["source"]].append(a)
        ok = []
        x, y = it["coord"]
        for parts in groups.values():
            inside = any(in_geom(x, y, a["geometry"]) for a in parts)
            near = inside or any(a["bbox"][0] - 0.015 <= x <= a["bbox"][2] + 0.015 and a["bbox"][1] - 0.01 <= y <= a["bbox"][3] + 0.01 for a in parts)
            if near:
                ok.append((parts[0], inside))
        if len(ok) != 1:
            stats["wd_zld_polders:ambiguous_or_none"] += 1
            continue
        a, inside = ok[0]
        # the polygon must not match another item with the same name
        others = {o for v in variants(a["name"]) for o in item_names.get(v, []) if o != q}
        if others:
            stats["wd_zld_polders:name_shared_by_items"] += 1
            continue
        matches.append((q, it, a, inside))
        stats["wd_zld_polders:matched"] += 1
        if it["inc"] or a["precision"] not in ("jaar", "circa"):
            continue
        ref = f'S854\t"{a["report"] or a["source"]}"\tS813\t+{TODAY}T00:00:00Z/11'
        qual = "\tP1480\tQ5727902" if a["precision"] == "circa" else ""
        qs.append(f'{q.rsplit("/", 1)[1]}\tP571\t+{a["year"]:04d}-00-00T00:00:00Z/9{qual}\t{ref}')
        stats["qs:P571_polder"] += 1
    return matches, qs


# ---------------------------------------------------------------- RDF outputs
def ttl_str(s):
    return '"' + (str(s) or "").replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ") + '"'


def write_linkset(points, zld, mill_links, polder_matches, imwa_links, stats):
    uris = {r["nr"]: r["mon"] for r in csv.DictReader(open(os.path.join(RAW, "rce_monument_uris.csv"), encoding="utf-8"))}
    L = ["@prefix schema: <https://schema.org/> .", "@prefix skos: <http://www.w3.org/2004/02/skos/core#> .",
         "@prefix dct: <http://purl.org/dc/terms/> .", "@prefix void: <http://rdfs.org/ns/void#> .",
         "@prefix wd: <http://www.wikidata.org/entity/> .", "", "# Generated by datalayer/build_v3.py on " + TODAY, ""]

    def head(id_, title, pred, desc):
        L.extend([f"<urn:hackalod2026:linkset:{id_}> a void:Linkset ;", f"  dct:title {ttl_str(title)}@nl ;",
                  f"  dct:description {ttl_str(desc)}@nl ;", f"  void:linkPredicate {pred} ;", f"  dct:created \"{TODAY}\" .", ""])

    head("monument-molen", "Rijksmonument ↔ molenrecord (Ten Bruggencate-nummer, allemolens.nl, RCE Landschapsatlas)", "schema:subjectOf",
         "Via het monumentnummer (RMONNUMMER) in de RCE-laag Molens; het monumentnummer is opgezocht in de RCE Rijksmonumenten-SPARQL.")
    n = 0
    for m in points["millsExisting"]:
        u = uris.get(m["monument"] or "")
        if not u:
            continue
        if m["info"]:
            L.append(f"<{u}> schema:subjectOf <{m['info']}> .")
        L.append(f"<{u}> schema:subjectOf <{feature_uri(RCE_WFS, 'landschapsatlas:Molens', m['fid'])}> .")
        if m["tb"]:
            L.append(f"<{u}> schema:identifier [ schema:propertyID \"Ten Bruggencate-nummer\" ; schema:value {ttl_str(m['tb'])} ] .")
        n += 1
    stats["link:monument_molen"] = n
    L.append("")
    head("monument-gemaal", "Rijksmonument ↔ gemaal bij de Nederlandse Gemalenstichting (gemalen.nl)", "schema:subjectOf",
         "Via het monumentnummer in de RCE-laag Gemalen (bron: Nederlandse Gemalenstichting).")
    n = 0
    for p in points["pumps"]:
        u = uris.get(p["monument"] or "")
        if not u:
            continue
        if p["info"]:
            L.append(f"<{u}> schema:subjectOf <{p['info']}> .")
        L.append(f"<{u}> schema:subjectOf <{feature_uri(RCE_WFS, 'landschapsatlas:gemalen', p['fid'])}> .")
        n += 1
    stats["link:monument_gemaal"] = n
    L.append("")
    head("gemaal-imwa", "Historisch gemaal (Gemalenstichting/RCE) ↔ actueel gemaal in het waterschapsregister (IMWA)", "skos:closeMatch",
         "Zelfde naamwoord(en) en ten hoogste 300 m afstand; afstand en gedeelde woorden staan per link in het commentaar.")
    for rec, (d, a, ov) in imwa_links:
        L.append(f"<{feature_uri(RCE_WFS, 'landschapsatlas:gemalen', rec['fid'])}> skos:closeMatch <{a['uri']}> . # {d} m; {', '.join(ov)}")
    stats["link:gemaal_imwa"] = len(imwa_links)
    L.append("")
    head("verdwenenmolen-wikidata", "Verdwenen molen (RCE Landschapsatlas / molendatabase.org) ↔ Wikidata", "skos:exactMatch",
         "Via Wikidata P2903 (Molendatabase verdwenen molens-ID) = molen_dbnr; overgeslagen als de coördinaten meer dan 5 km verschillen.")
    cols = points["millsGone"]
    for item, i, dist in mill_links:
        L.append(f"<{item}> skos:exactMatch <{feature_uri(RCE_WFS, 'landschapsatlas:verdwenenmolens', 'verdwenenmolens.' + str(cols['fid'][i]))}> .")
    stats["link:verdwenenmolen_wikidata"] = len(mill_links)
    L.append("")
    head("polder-wikidata", "Zeeuwse polder (Provincie Zeeland, cultuurhistorie) ↔ Wikidata", "skos:closeMatch",
         "Unieke naamovereenkomst én de Wikidata-coördinaat ligt in (of vlak bij) de poldercontour.")
    for q, it, a, inside in {(m[0], m[2]["source"]): m for m in polder_matches}.values():
        L.append(f"<{a['source']}> skos:closeMatch <{q}> . # {a['name']}; coördinaat {'in' if inside else 'vlak bij'} de contour")
    stats["link:polder_wikidata"] = len(polder_matches)
    L.append("")
    head("geschenkwoning-bag", "Geschenkwoning watersnood 1953 (Provincie Zeeland) ↔ BAG", "schema:address / skos:closeMatch",
         "Adres uit de inventarisatie opgezocht in de PDOK Locatieserver; alleen exacte overeenkomst van straat, huisnummer en woonplaats.")
    n = 0
    for g in zld["giftHouses"]:
        if g["bag"]:
            L.append(f"<{g['source']}> schema:address <https://bag.basisregistraties.overheid.nl/bag/id/nummeraanduiding/{g['bag']['nummeraanduiding']}> .")
            if g["bag"]["verblijfsobject"]:
                L.append(f"<{g['source']}> skos:closeMatch <https://bag.basisregistraties.overheid.nl/bag/id/verblijfsobject/{g['bag']['verblijfsobject']}> .")
            n += 1
    stats["link:geschenkwoning_bag"] = n
    open(os.path.join(OUT, "linkset-v3.ttl"), "w", encoding="utf-8").write("\n".join(L) + "\n")


def write_events(areas, points, zld, stats):
    """The 'how did this become dry' timeline as a dataset: one schema:Event per dated fact, with its source."""
    T = ["@prefix schema: <https://schema.org/> .", "@prefix prov: <http://www.w3.org/ns/prov#> .",
         "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .", "",
         "<urn:hackalod2026:dataset:hoe-werd-dit-droog> a schema:Dataset ;",
         '  schema:name "Hoe werd dit droog? Gebeurtenissen in de waterstaatsgeschiedenis (Droge Voeten)"@nl ;',
         '  schema:description "Gedateerde gebeurtenissen (indijking, droogmaking, molen gebouwd/verdwenen, gemaal gesticht, ruilverkaveling, dijkaanleg) met de oorspronkelijke jaartekst, de nauwkeurigheid en de bron (prov:wasDerivedFrom)."@nl ;',
         f'  schema:dateCreated "{TODAY}"^^xsd:date ;', "  schema:license <https://creativecommons.org/licenses/by-sa/4.0/> .", ""]
    n = collections.Counter()

    def ev(key, kind, name, year, text, precision, src, place=None):
        if not year:
            return
        T.append(f"<urn:hackalod2026:event:{key}> a schema:Event ; schema:additionalType {ttl_str(kind)} ; schema:name {ttl_str(name)}@nl ;")
        T.append(f'  schema:startDate "{year:04d}"^^xsd:gYear ; schema:description {ttl_str((text or str(year)) + " (" + precision + ")")}@nl ;')
        T.append(f"  prov:wasDerivedFrom <{src}> .")
        n[kind] += 1

    seen = set()
    for a in areas:
        k = {"polder": "indijking", "poldernaam": "indijking", "droogmakerij": "droogmaking", "landinrichting": "landinrichting"}.get(a["kind"])
        if k and a["precision"] != "onbekend":
            key = a.get("code") or a["source"].split("featureID=")[-1].split("&")[0]
            key = re.sub(r"[^A-Za-z0-9.]+", "-", (a["kind"] + "-" + key) if a.get("code") else key)
            if key in seen:
                continue
            seen.add(key)
            ev(f"{k}:{key}", k, f"{k.capitalize()}: {a['name'] or 'naamloos'}", a["year"], a.get("yearText"), a["precision"], a["source"], a["source"])
    c = points["millsGone"]
    for i in range(len(c["fid"])):
        if c["cat"][i] != 0:
            continue  # only water mills (poldermolens) in the event dataset
        src = feature_uri(RCE_WFS, "landschapsatlas:verdwenenmolens", f"verdwenenmolens.{c['fid'][i]}")
        nm = c["name"][i] or f"poldermolen (Ten Bruggencate {c['tb'][i]})"
        ev(f"molen-gebouwd:{c['fid'][i]}", "molen gebouwd", nm, c["built"][i], (str(c["built"][i]) + " " + c["builtQ"][i]).strip(),
           "jaar" if not c["builtQ"][i] else "met kanttekening", src, src)
        ev(f"molen-verdwenen:{c['fid'][i]}", "molen verdwenen", nm, c["gone"][i], (str(c["gone"][i]) + " " + c["goneQ"][i]).strip(),
           "jaar" if not c["goneQ"][i] else "met kanttekening", src, src)
    for p in points["pumps"]:
        src = feature_uri(RCE_WFS, "landschapsatlas:gemalen", p["fid"])
        ev(f"gemaal-gesticht:{p['fid']}", "gemaal gesticht", p["name"] or "gemaal", p["founded"], p["foundedText"], p["foundedPrecision"], src, src)
    for d in zld["dikes"]:
        y = d["indicative"] or d["begin"]
        txt = f"{d['begin'] or '?'}–{d['end'] or '?'} (indicatief {d['indicative'] or '?'})"
        key = d["source"].split("featureID=")[-1].split("&")[0]
        ev(f"dijk-aangelegd:{key}", "dijk aangelegd", d["name"] or "dijk", y, txt, "periode", d["source"], d["source"])
    for g in zld["giftHouses"]:
        y = int_year(g["dated"])
        key = g["source"].split("featureID=")[-1].split("&")[0]
        ev(f"geschenkwoning:{key}", "geschenkwoning gebouwd", f"Geschenkwoning uit {g['country']} ({g['street']} {g['number']}, {g['place']})",
           y, g["dated"], "jaar" if g["dated"] and len(g["dated"]) == 4 else "periode", g["source"], g["source"])
    open(os.path.join(OUT, "events.ttl"), "w", encoding="utf-8").write("\n".join(T) + "\n")
    stats["events"] = sum(n.values())
    for k, v in n.items():
        stats["events:" + k] = v


def write_description(stats):
    base = "https://vps.maijenburg.dev/v3/droge-voeten/data/build/"
    common = {"license": "https://creativecommons.org/licenses/by-sa/4.0/", "inLanguage": "nl",
              "creator": {"@type": "Organization", "name": "Droge Voeten (HackaLOD 2026)"},
              "publisher": {"@type": "Organization", "name": "Droge Voeten (HackaLOD 2026)"}, "dateModified": TODAY}
    rce = ["https://services.rce.geovoorziening.nl/landschapsatlas/wfs", "https://linkeddata.cultureelerfgoed.nl/rce/datacatalog/id/dataset/51cf46fe-522b-390d-8620-ba777ccfc086"]
    zld = ["https://opengeodata.zeeland.nl/geoserver/wfs"]
    ds = [
        {"@id": base + "linkset.ttl#dataset", "name": "Droge Voeten-linkset (ronde 2): waterstaatsmonumenten ↔ waterschapsregister, waterschap en Molendatabase",
         "description": "RCE-rijksmonumenten gekoppeld aan IMWA (skos:closeMatch), het huidige waterschap (schema:containedInPlace) en de Nederlandse Molendatabase (schema:subjectOf).",
         "isBasedOn": rce[1:] + ["https://api.pdok.nl/hwh/waterschappen-kunstwerken-imwa/ogc/v2", "https://www.wikidata.org/", "https://www.molendatabase.nl/"],
         "distribution": [("text/turtle", "linkset.ttl")]},
        {"@id": "urn:hackalod2026:dataset:staat-van-gebruik", "name": "Staat van gebruik van waterstaatsmonumenten",
         "description": "Per rijksmonument: werkt het nu mee aan de afwatering, werkte het vroeger, onbekend of geen werktuig, met prov:wasDerivedFrom per uitspraak.",
         "isBasedOn": rce[1:] + ["https://www.molendatabase.nl/", "https://www.wikidata.org/"], "distribution": [("text/turtle", "status.ttl")]},
        {"@id": base + "linkset-v3.ttl#dataset", "name": "Droge Voeten-linkset (ronde 3): molens, gemalen, polders en geschenkwoningen",
         "description": (f"Rijksmonument ↔ molenrecord/Ten Bruggencate ({stats['link:monument_molen']}), rijksmonument ↔ gemalen.nl ({stats['link:monument_gemaal']}), "
                         f"historisch gemaal ↔ IMWA ({stats['link:gemaal_imwa']}), verdwenen molen ↔ Wikidata ({stats['link:verdwenenmolen_wikidata']}), "
                         f"Zeeuwse polder ↔ Wikidata ({stats['link:polder_wikidata']}), geschenkwoning 1953 ↔ BAG ({stats['link:geschenkwoning_bag']})."),
         "isBasedOn": rce + zld + ["https://www.wikidata.org/", "https://api.pdok.nl/bzk/locatieserver/search/v3_1/"],
         "distribution": [("text/turtle", "linkset-v3.ttl")]},
        {"@id": "urn:hackalod2026:dataset:hoe-werd-dit-droog", "name": "Hoe werd dit droog? Gebeurtenissen in de waterstaatsgeschiedenis",
         "description": f"{stats['events']} gedateerde gebeurtenissen als schema:Event, elk met de oorspronkelijke jaartekst, de nauwkeurigheid en prov:wasDerivedFrom naar het bronobject.",
         "isBasedOn": rce + zld, "distribution": [("text/turtle", "events.ttl")]},
        {"@id": base + "droge-voeten.jsonld#dataset", "name": "Droge Voeten-koppelvlak", "description": "Het document dat de presentatielagen lezen (JSON-LD en JSON), plus voorbereide geometrie voor punt-in-vlak in de browser.",
         "isBasedOn": rce + zld + ["https://www.wikidata.org/"],
         "distribution": [("application/ld+json", "droge-voeten.jsonld"), ("application/json", "history-areas.json"),
                          ("application/json", "history-points.json"), ("application/json", "zeeland.json")]},
        {"@id": base + "wikidata-suggestions#dataset", "name": "Wikidata-voorstellen (QuickStatements) voor review",
         "description": "P5817, P137 (ronde 2); P571/P576 voor verdwenen molens via P2903 en P571 voor Zeeuwse polders (ronde 3). Niet geüpload; bedoeld voor menselijke review.",
         "isBasedOn": rce + zld + ["https://www.wikidata.org/"],
         "distribution": [("text/plain", "wikidata_P5817_suggestions.qs"), ("text/plain", "wikidata_P137_suggestions.qs"),
                          ("text/plain", "wikidata_P571_P576_molens.qs"), ("text/plain", "wikidata_P571_polders.qs")]},
    ]
    graph = []
    for d in ds:
        dist = [{"@type": ["DataDownload", "dcat:Distribution"], "encodingFormat": f, "dcat:mediaType": f, "contentUrl": base + u, "dcat:downloadURL": {"@id": base + u}}
                for f, u in d.pop("distribution")]
        graph.append({"@type": ["Dataset", "dcat:Dataset"], **d, **common, "keywords": ["waterstaat", "polder", "molen", "gemaal", "linkset", "HackaLOD 2026"],
                      "distribution": dist})
    doc = {"@context": {"@vocab": "https://schema.org/", "dcat": "http://www.w3.org/ns/dcat#"}, "@graph": graph}
    json.dump(doc, open(os.path.join(OUT, "dataset-description.jsonld"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(doc, open(os.path.join(ROOT, "data", "dataset-description.jsonld"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def compact_points(points):
    """Columnar, dictionary-encoded output for the 17k vanished mills; sparse maps for rare fields."""
    c = points["millsGone"]
    types = sorted(set(c["type"]))
    funcs = sorted(set(c["func"]))
    out = {k: c[k] for k in ("lat", "lon", "built", "gone", "cat", "name", "tb", "fid")}
    out["type"] = [types.index(t) for t in c["type"]]
    out["func"] = [funcs.index(f) for f in c["func"]]
    out["builtQ"] = {i: q for i, q in enumerate(c["builtQ"]) if q}
    out["goneQ"] = {i: q for i, q in enumerate(c["goneQ"]) if q}
    out["wikidata"] = {i: q for i, q in enumerate(c.get("wikidata", [])) if q}
    res = {k: v for k, v in points.items() if k not in ("millsGone", "droogmakerijMolensGemalen")}
    res["millsGone"] = out
    res["millsGoneLookups"] = {"type": types, "func": funcs}
    res["photoBase"] = MEMORIX
    return res


# ---------------------------------------------------------------- main
def main():
    stats = collections.Counter()
    imwa = json.load(open(os.path.join(RAW2, "imwa_gemaal.json"), encoding="utf-8"))
    areas = build_areas(stats)
    points, imwa_links = build_points(stats, imwa)
    zld = build_zeeland(stats)
    gauges = build_tide_gauges(stats)
    mill_links, mill_qs, mill_conflicts = wikidata_mills(points, stats)
    polder_matches, polder_qs = wikidata_polders(areas, stats)
    # Wikidata QIDs on the mills, so the app can link them
    qid_by_index = {i: item for item, i, _ in mill_links}
    points["millsGone"]["wikidata"] = [qid_by_index.get(i, "").rsplit("/", 1)[-1] for i in range(len(points["millsGone"]["fid"]))]
    for q, it, a, inside in polder_matches:
        a["wikidata"] = q.rsplit("/", 1)[1]

    meta = {"generated": TODAY, "generator": "datalayer/build_v3.py", "licenses": LICENSE_NOTE,
            "featureUriTemplate": {"verdwenenmolens": feature_uri(RCE_WFS, "landschapsatlas:verdwenenmolens", "verdwenenmolens.{fid}"),
                                   "gemalen": feature_uri(RCE_WFS, "landschapsatlas:gemalen", "{fid}"),
                                   "Molens": feature_uri(RCE_WFS, "landschapsatlas:Molens", "{fid}")},
            "linkTemplates": {"molendatabaseOrg": "https://www.molendatabase.org/molendb.php?step=details&tbnummer={tb}",
                              "wikidata": "http://www.wikidata.org/entity/{qid}"}}
    json.dump({**meta, "areas": areas}, open(os.path.join(OUT, "history-areas.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump({**meta, **compact_points(points)}, open(os.path.join(OUT, "history-points.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump({**meta, **zld}, open(os.path.join(OUT, "zeeland.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    # extend the v2 koppelvlak
    kp = os.path.join(OUT, "droge-voeten.jsonld")
    doc = json.load(open(kp, encoding="utf-8"))
    doc["v3"] = {
        "files": {"historyAreas": "history-areas.json", "historyPoints": "history-points.json", "zeeland": "zeeland.json",
                  "events": "events.ttl", "linkset": "linkset-v3.ttl", "description": "dataset-description.jsonld"},
        "tideGauges1953": gauges,
        "flood1953": {"note": ("Open inundatiekaart van de watersnoodramp gevonden voor Noord-Brabant (Provincie Noord-Brabant). "
                               "Voor Zeeland en Zuid-Holland vonden we geen open, gedigitaliseerde inundatiekaart; daar tonen we geen 1953-waterlijn."),
                      "searched": ["Nationaal Georegister (zoektermen 1953, watersnoodramp, inundatie, stormvloed)",
                                   "opengeodata.zeeland.nl WFS/WMS capabilities ('Verdronken gebied' = één inlaag, geen 1953-kaart)",
                                   "Klimaateffectatlas WMS capabilities", "NDE Datasetregister"],
                      "areas": [{k: a[k] for k in ("kind", "name", "salt", "source", "metadata", "publisher", "coverage", "bbox", "geometry")}
                                for a in areas if a["kind"] == "inundatie1953"]},
        "precisionVocabulary": {"jaar": "jaartal zoals in de bron", "circa": "ongeveer (bron zegt 'ca.')", "voor": "uiterlijk dit jaar (bron zegt 'voor')",
                                "periode": "begin van een periode of reeks", "eeuw": "alleen de eeuw is bekend (jaar = begin van die eeuw, alleen voor sortering)",
                                "periode-van-laag": "alleen de periode van de kaartlaag is bekend", "met kanttekening": "de bron zet er een opmerking bij",
                                "onzeker": "jaartekst niet eenduidig", "onbekend": "geen jaartal in de bron"},
        "services": [s["id"] for s in doc["services"]],
    }
    doc["dateModified"] = TODAY
    doc["isBasedOn"] = sorted(set(doc["isBasedOn"]) | {RCE_WFS, ZLD_WFS, "https://atlas.brabant.nl/data_download/geojson/1515e932-56eb-4e6f-adb9-b3ef30af9bfe.zip",
                                                      "https://ddapi20-waterwebservices.rijkswaterstaat.nl/"})
    # services list in the koppelvlak comes from services.py (v3 adds historical maps)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from services import SERVICES  # noqa: E402
    doc["services"] = SERVICES
    json.dump(doc, open(kp, "w", encoding="utf-8"), ensure_ascii=False)

    write_linkset(points, zld, mill_links, polder_matches, imwa_links, stats)
    write_events(areas, points, zld, stats)
    hdr = "# QuickStatements v1 - FOR HUMAN REVIEW BEFORE UPLOAD - generated by datalayer/build_v3.py on " + TODAY
    open(os.path.join(OUT, "wikidata_P571_P576_molens.qs"), "w", encoding="utf-8").write(
        hdr + "\n# P571/P576 for vanished mills linked by P2903; source: RCE Landschapsatlas 'verdwenen molens' (molendatabase.org)\n"
        "# Only years without a qualifier in the source and only where Wikidata has no value yet.\n" + "\n".join(mill_qs) + "\n")
    open(os.path.join(OUT, "wikidata_P571_polders.qs"), "w", encoding="utf-8").write(
        hdr + "\n# P571 (inception = embankment year) for Zeeland polders; source: Provincie Zeeland cultuurhistorie report (S854)\n"
        "# Only unique name+location matches, only exact or circa years (P1480 Q5727902), only where Wikidata has no P571.\n" + "\n".join(polder_qs) + "\n")
    with open(os.path.join(ROOT, "proofs", "v3_wikidata_date_conflicts.tsv"), "w", encoding="utf-8") as f:
        f.write("qid\tproperty\twikidata\trce_landschapsatlas\n")
        for q, p, w, r in mill_conflicts:
            f.write(f"{q}\t{p}\t{','.join(w)}\t{r}\n")
    write_description(stats)
    stats = dict(sorted(stats.items()))
    stats["decades"] = points["decades"]
    json.dump(stats, open(os.path.join(OUT, "stats-v3.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print(json.dumps({k: v for k, v in stats.items() if k != "decades"}, indent=1, ensure_ascii=False))
    for fn in ("history-areas.json", "history-points.json", "zeeland.json", "droge-voeten.jsonld", "events.ttl", "linkset-v3.ttl"):
        print(fn, os.path.getsize(os.path.join(OUT, fn)))


if __name__ == "__main__":
    main()
