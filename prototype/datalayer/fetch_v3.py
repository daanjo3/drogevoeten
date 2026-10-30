#!/usr/bin/env python3
"""Data layer v3, step 1: harvest the new history sources into data/raw/v3/.

All requests use an honest User-Agent and a polite pace. Wikidata Query Service is called at most once
per 65 seconds (WDQS applied a 1 request/minute limit while this was built).

Sources (checked 2026-10-28):
  RCE Landschapsatlas WFS   https://services.rce.geovoorziening.nl/landschapsatlas/wfs
      gemalen, verdwenenmolens, Molens, droogmakerijen, drgmk_molens_gemalen, LandinrichtingNL, wielen,
      waterstaatskaart1_bladwijzer
  Provincie Zeeland WFS     https://opengeodata.zeeland.nl/geoserver/wfs
      dikes (chs:ext_chs_dykdamwalzld), polders per embankment period (7 layers), polder names,
      drowned villages, gift houses 1953, inlagen, Delta Works
  Provincie Noord-Brabant   'Historische Inundatie Ramp 1953' (NGR dc382a09-6677-48fd-975e-dee283cea4ad)
  Rijkswaterstaat WaterWebservices (DDL API 2.0): measured water levels 31 Jan - 2 Feb 1953
  PDOK Locatieserver        BAG address for every gift house (linkset gift house -> BAG)
  RCE Rijksmonumenten SPARQL monument number -> RCE URI for the mills and pumping stations
  Wikidata                  items with P2903 (Molendatabase verdwenen molens ID); polders in Zeeland

Run:  python3 -I datalayer/fetch_v3.py [--skip-wikidata] [--keep-p2903] [--only rce,zeeland,brabant,rws,rce_uris,gift,wikidata]
"""
import io, json, os, sys, time, urllib.parse, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw", "v3")
UA = "hackalod2026-droge-voeten/3.0 (HackaLOD 2026 prototype)"

RCE_WFS = "https://services.rce.geovoorziening.nl/landschapsatlas/wfs"
ZLD_WFS = "https://opengeodata.zeeland.nl/geoserver/wfs"
RCE_SPARQL = "https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/Rijksmonumenten-sdo/sparql"
WDQS = "https://query.wikidata.org/sparql"
RWS = "https://ddapi20-waterwebservices.rijkswaterstaat.nl/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen"
PDOK_FREE = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free"
BRABANT_1953 = "https://atlas.brabant.nl/data_download/geojson/1515e932-56eb-4e6f-adb9-b3ef30af9bfe.zip"

RCE_LAYERS = ["gemalen", "verdwenenmolens", "Molens", "droogmakerijen", "drgmk_molens_gemalen",
              "LandinrichtingNL", "wielen", "waterstaatskaart1_bladwijzer"]
ZLD_LAYERS = ["chs:ext_chs_dykdamwalzld",
              "chs:geocmd_chspld_vr1300vvl", "chs:geocmd_chspld13001421vvl", "chs:geocmd_chspld14221532vvl",
              "chs:geocmd_chspld15331648vvl", "chs:geocmd_chspld16491808vvl", "chs:geocmd_chspld18091953vvl",
              "chs:geocmd_chspld_na1953vvl", "zeeland:geonam_pldvlk", "chs:geocmd_vrddrppnt",
              "chs:geocmd_gskwnn_53pnt", "chs:geocmd_chsnlgvvl", "chs:geocmd_chsdltwrkvln"]
# Tide gauges with measured 1953 values in the DDL API (checked 2026-10-28)
RWS_STATIONS = ["vlissingen", "terneuzen", "hansweert", "zierikzee", "willemstad", "hoekvanholland"]

_last_wdqs = [0.0]


def http(url, data=None, headers=None, tries=4, timeout=300, binary=False):
    h = {"User-Agent": UA}
    h.update(headers or {})
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
                return b if binary else b.decode("utf-8")
        except Exception as e:  # noqa: BLE001
            print(f"  retry {i + 1} {url[:90]}: {e}", file=sys.stderr)
            time.sleep(10 * (i + 1))
    raise RuntimeError(f"failed: {url}")


def save(name, obj):
    path = os.path.join(RAW, name)
    with open(path, "w", encoding="utf-8") as f:
        if isinstance(obj, str):
            f.write(obj)
        else:
            json.dump(obj, f, ensure_ascii=False)
    print("wrote", name, os.path.getsize(path), "bytes")


def wfs(base, layer):
    q = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": layer,
         "outputFormat": "application/json", "srsName": "EPSG:4326", "count": "50000"}
    d = json.loads(http(base + "?" + urllib.parse.urlencode(q)))
    n = d.get("numberMatched") or d.get("totalFeatures")
    print(f"  {layer}: {len(d['features'])} / {n}")
    if n and int(n) != len(d["features"]):
        raise RuntimeError(f"{layer}: got {len(d['features'])} of {n}; paging needed")
    d["_harvested"] = time.strftime("%Y-%m-%d")
    d["_source"] = base
    d["_layer"] = layer
    return d


def wdqs(query, tries=3):
    """One WDQS request at a time, at least 65 s apart, also between retries (WDQS limit: 1 request/minute)."""
    for i in range(tries):
        wait = 65 - (time.time() - _last_wdqs[0])
        if wait > 0:
            print(f"  WDQS: waiting {wait:.0f} s (rate limit)", flush=True)
            time.sleep(wait)
        _last_wdqs[0] = time.time()
        try:
            req = urllib.request.Request(WDQS, data=urllib.parse.urlencode({"query": query}).encode(),
                                         headers={"User-Agent": UA, "Accept": "text/csv",
                                                  "Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req, timeout=120) as r:
                txt = r.read().decode("utf-8")
            if txt.lstrip().startswith("<"):
                raise RuntimeError("WDQS returned HTML")
            return txt
        except Exception as e:  # noqa: BLE001
            print(f"  WDQS attempt {i + 1} failed: {e}", flush=True)
    raise RuntimeError("WDQS failed")


def fetch_rce():
    for layer in RCE_LAYERS:
        save(f"rce_{layer}.json", wfs(RCE_WFS, "landschapsatlas:" + layer))
        time.sleep(1)


def fetch_zeeland():
    for layer in ZLD_LAYERS:
        save("zld_" + layer.split(":")[1] + ".json", wfs(ZLD_WFS, layer))
        time.sleep(1)


def fetch_brabant():
    z = zipfile.ZipFile(io.BytesIO(http(BRABANT_1953, binary=True)))
    names = [n for n in z.namelist() if n.endswith(".json")]
    d = json.loads(z.read(names[0]).decode("utf-8"))
    d["_source"] = BRABANT_1953
    d["_metadata"] = "https://nationaalgeoregister.nl/geonetwork/srv/dut/catalog.search#/metadata/dc382a09-6677-48fd-975e-dee283cea4ad"
    d["_harvested"] = time.strftime("%Y-%m-%d")
    save("brabant_inundatie_1953.json", d)


def fetch_rws():
    out = {}
    for loc in RWS_STATIONS:
        body = {"Locatie": {"Code": loc},
                "AquoPlusWaarnemingMetadata": {"AquoMetadata": {"Compartiment": {"Code": "OW"}, "Grootheid": {"Code": "WATHTE"}}},
                "Periode": {"Begindatumtijd": "1953-01-31T00:00:00.000+01:00", "Einddatumtijd": "1953-02-02T00:00:00.000+01:00"}}
        txt = http(RWS, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        out[loc] = {"request": body, "response": json.loads(txt)}
        time.sleep(2)
    save("rws_1953.json", out)


def fetch_giftaddresses():
    """Geocode every gift house (straat + huisnummer + plaats) with the PDOK Locatieserver.
    Only exact matches on street, house number and place are accepted later (build_v3.py)."""
    gh = json.load(open(os.path.join(RAW, "zld_geocmd_gskwnn_53pnt.json"), encoding="utf-8"))
    out = {}
    for f in gh["features"]:
        p = f["properties"]
        q = f'{p.get("straat") or ""} {p.get("huisnummer") or ""}{p.get("huisnummer_toevoeging") or ""} {p.get("plaats") or ""}'.strip()
        if not p.get("straat") or not p.get("huisnummer"):
            continue
        url = PDOK_FREE + "?" + urllib.parse.urlencode({"q": q, "fq": "type:adres", "rows": 3,
                                                       "fl": "id,weergavenaam,straatnaam,huisnummer,huisletter,huisnummertoevoeging,woonplaatsnaam,postcode,nummeraanduiding_id,adresseerbaarobject_id,centroide_ll,score"})
        try:
            out[f["id"]] = {"q": q, "docs": json.loads(http(url))["response"]["docs"]}
        except RuntimeError as e:
            out[f["id"]] = {"q": q, "error": str(e)}
        time.sleep(0.25)
    save("pdok_giftaddresses.json", out)


def fetch_rce_uris():
    """RCE linked-data URI for every monument number used by the Molens and gemalen layers."""
    nums = set()
    for name, field in (("rce_Molens.json", "RMONNUMMER"), ("rce_gemalen.json", "monumentnr")):
        for f in json.load(open(os.path.join(RAW, name), encoding="utf-8"))["features"]:
            v = (f["properties"].get(field) or "").strip()
            if v.isdigit():
                nums.add(v)
    rows = ["nr,mon"]
    nums = sorted(nums, key=int)
    for i in range(0, len(nums), 300):
        vals = " ".join(f'"{n}"' for n in nums[i:i + 300])
        q = ("PREFIX schema: <https://schema.org/>\nSELECT ?nr ?mon WHERE { VALUES ?nr { " + vals +
             " } ?mon schema:identifier ?nr . FILTER(STRSTARTS(STR(?mon), \"https://linkeddata.cultureelerfgoed.nl/cho-kennis/id/rijksmonument/\")) }")
        txt = http(RCE_SPARQL, data=urllib.parse.urlencode({"query": q}).encode(),
                   headers={"Accept": "text/csv", "Content-Type": "application/x-www-form-urlencoded"})
        rows.extend(txt.splitlines()[1:])
        time.sleep(1)
    save("rce_monument_uris.csv", "\n".join(rows) + "\n")


WD_P2903 = """SELECT ?item ?id ?itemLabel ?inception ?dissolved ?coord WHERE {
  ?item wdt:P2903 ?id .
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?item wdt:P576 ?dissolved }
  OPTIONAL { ?item wdt:P625 ?coord }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "nl,en". } }"""

# Polders (P31 = Q106259) with a coordinate inside a box around Zeeland. The box query is cheap; the earlier
# P131*/P279* variant timed out on WDQS. Items outside Zeeland inside the box are harmless: matching also
# requires the coordinate to fall in (or next to) a Zeeland polder outline.
WD_ZLD_POLDERS = """SELECT ?item ?itemLabel ?inception ?coord ?alias WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerSouthWest "Point(3.35 51.19)"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(4.30 51.78)"^^geo:wktLiteral . }
  ?item wdt:P31 wd:Q106259 .
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?item skos:altLabel ?alias FILTER(LANG(?alias) = "nl") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "nl,en". } }"""


def fetch_wikidata():
    if "--keep-p2903" not in sys.argv or not os.path.exists(os.path.join(RAW, "wd_p2903.csv")):
        save("wd_p2903.csv", wdqs(WD_P2903))
    save("wd_zeeland_polders.csv", wdqs(WD_ZLD_POLDERS))


STEPS = {"rce": fetch_rce, "zeeland": fetch_zeeland, "brabant": fetch_brabant, "rws": fetch_rws,
         "rce_uris": fetch_rce_uris, "gift": fetch_giftaddresses, "wikidata": fetch_wikidata}


def main():
    os.makedirs(RAW, exist_ok=True)
    args = sys.argv[1:]
    only = args[args.index("--only") + 1].split(",") if "--only" in args else list(STEPS)
    for name in only:
        if name == "wikidata" and "--skip-wikidata" in args:
            continue
        print("==", name)
        STEPS[name]()


if __name__ == "__main__":
    main()
