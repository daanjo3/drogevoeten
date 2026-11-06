#!/usr/bin/env python3
"""Harvest the source layers of the linked datasets into raw/ (one JSON file per layer).

Sources:
  RCE Landschapsatlas WFS   mills, pumping stations, drained lakes, land consolidation, breach pools
  Provincie Zeeland WFS     dikes, polders per embankment period, drowned villages, gift houses, Delta Works
  PDOK / Het Waterschapshuis IMWA   pumping stations, locks and weirs of the water boards

Idempotent: a layer that is already in raw/ is skipped (pass --force to harvest again). Every file is written
to a temporary file first, so an interrupted run leaves no half-written layer behind.

Run:  python3 -I linkeddata/harvest.py [--force]   (or: make harvest)
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402

UA = "hackalod2026-droge-voeten/3.0 (HackaLOD 2026)"
IMWA = "https://api.pdok.nl/hwh/waterschappen-kunstwerken-imwa/ogc/v2/collections/{c}/items?f=json&limit=1000"
IMWA_COLLECTIONS = ["gemaal", "sluis", "stuw"]
RCE_LAYERS = ["gemalen", "verdwenenmolens", "Molens", "droogmakerijen", "drgmk_molens_gemalen",
              "LandinrichtingNL", "wielen"]
ZLD_LAYERS = ["chs:ext_chs_dykdamwalzld",
              "chs:geocmd_chspld_vr1300vvl", "chs:geocmd_chspld13001421vvl", "chs:geocmd_chspld14221532vvl",
              "chs:geocmd_chspld15331648vvl", "chs:geocmd_chspld16491808vvl", "chs:geocmd_chspld18091953vvl",
              "chs:geocmd_chspld_na1953vvl", "chs:geocmd_vrddrppnt", "chs:geocmd_gskwnn_53pnt",
              "chs:geocmd_chsdltwrkvln"]


def http(url, accept="application/json", tries=4, timeout=300):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"Accept": accept, "User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # noqa: BLE001
            print(f"  retry {i + 1} {url[:90]}: {e}", file=sys.stderr)
            time.sleep(10 * (i + 1))
    raise RuntimeError(f"failed: {url}")


def save(name, obj):
    path = os.path.join(config.RAW, name)
    with open(path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
    os.replace(path + ".tmp", path)
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


def imwa(collection):
    url, feats = IMWA.format(c=collection), []
    while url:
        d = json.loads(http(url, accept="application/geo+json"))
        feats.extend(d.get("features", []))
        url = next((l["href"] for l in d.get("links", []) if l.get("rel") == "next"), None)
        print(f"  {collection}: {len(feats)}", file=sys.stderr)
    return [{"uri": IMWA.split("?")[0].format(c=collection) + "/" + f["id"], "id": f["properties"].get("nen3610id"),
             "naam": f["properties"].get("naam"),
             "code": f["properties"].get("code"), "waterbeheerder": f["properties"].get("waterbeheerder"),
             "functie": f["properties"].get("functiegemaal"), "capaciteit": f["properties"].get("maximalecapaciteit"),
             "status": f["properties"].get("statusobject"),
             "lon": (f.get("geometry") or {}).get("coordinates", [None, None])[0],
             "lat": (f.get("geometry") or {}).get("coordinates", [None, None])[1]}
            for f in feats if (f.get("geometry") or {}).get("type") == "Point"]


def main():
    force = "--force" in sys.argv[1:]
    os.makedirs(config.RAW, exist_ok=True)
    layers = [(f"rce_{layer}.json", lambda layer=layer: wfs(config.RCE_WFS, "landschapsatlas:" + layer))
              for layer in RCE_LAYERS]
    layers += [("zld_" + layer.split(":")[1] + ".json", lambda layer=layer: wfs(config.ZLD_WFS, layer))
               for layer in ZLD_LAYERS]
    layers += [(f"imwa_{c}.json", lambda c=c: imwa(c)) for c in IMWA_COLLECTIONS]
    for name, fetch in layers:
        if os.path.exists(os.path.join(config.RAW, name)) and not force:
            print("skipped", name)
            continue
        save(name, fetch())
        time.sleep(1)


if __name__ == "__main__":
    main()
