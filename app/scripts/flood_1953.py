"""Write the 1953 flood map of Provincie Noord-Brabant as a static GeoJSON file for the app.

Not linked data on purpose (linkeddata/DECISIONS.md §33): 19 anonymous polygons, only used for a
point-in-polygon test in the browser, like the prototype did.

Input:  prototype/data/build/history-areas.json (kind 'inundatie1953': already in WGS84 and simplified,
        see prototype/datalayer/build_v3.py)
Output: app/public/data/flood-1953-noord-brabant.geojson

Run from the repo root:  python3 -I app/scripts/flood_1953.py
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "prototype/data/build/history-areas.json"
OUT = ROOT / "app/public/data/flood-1953-noord-brabant.geojson"


def main():
    if not SRC.exists():
        sys.exit(f"missing {SRC}: run 'make restore' or 'make build' in prototype/ first")
    data = json.loads(SRC.read_text(encoding="utf-8"))
    areas = [a for a in data["areas"] if a.get("kind") == "inundatie1953"]
    if not areas:
        sys.exit("no 'inundatie1953' areas in history-areas.json")
    first = areas[0]
    out = {
        "type": "FeatureCollection",
        "name": "Historische Inundatie Ramp 1953 (Provincie Noord-Brabant)",
        "publisher": first["publisher"],
        "source": first["source"],
        "metadata": first["metadata"],
        "coverage": first["coverage"],
        "note": "Simplified (~5 m) and converted from RD New to WGS84 by prototype/datalayer/build_v3.py. No depths.",
        "features": [
            {"type": "Feature", "properties": {"salt": a.get("salt")}, "geometry": a["geometry"]}
            for a in areas
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(areas)} areas -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
