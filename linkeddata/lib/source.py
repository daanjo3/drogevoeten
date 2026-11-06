"""Access to the harvest (harvest.py) and the parsing rules for its values."""
import json
import os
import re
import sys
import unicodedata

import config


def load_layer(name, raw=None):
    """A harvested WFS layer: (features, metadata). Fails with a clear message if the harvest is missing."""
    path = os.path.join(raw or config.RAW, name)
    if not os.path.exists(path):
        sys.exit(f"ontbreekt: {path}\n  draai eerst: make harvest")
    doc = json.load(open(path, encoding="utf-8"))
    meta = {k: v for k, v in doc.items() if k != "features"} if isinstance(doc, dict) else {}
    return (doc["features"] if isinstance(doc, dict) else doc), meta


def feature_uri(base, layer, fid):
    """Dereferenceable URI of one WFS feature (GetFeature with featureID; checked for both servers)."""
    return f"{base}?service=WFS&version=2.0.0&request=GetFeature&typeNames={layer}&featureID={fid}&outputFormat=application/json"


def zld_code_uri(layer, code):
    """The CHS 'geocmd' layers only have auto-generated GeoServer fids (not stable). Their 'code' (e.g. GEO-1260)
    identifies the object, so the source URI selects on it; a polder in several parts returns all parts."""
    return (f"{config.ZLD_WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames={layer}"
            f"&CQL_FILTER=code%3D%27{code}%27&outputFormat=application/json")


def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def clean(s):
    s = (s or "").strip() if isinstance(s, str) else s
    return s or None


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


UNKNOWN = {"", "*", "-", "onbekend", "none", "null"}


def value(v):
    """Source value or None. Blank strings and explicit 'unknown' markers become None: no statement."""
    v = clean(v)
    if v is None:
        return None
    if isinstance(v, str) and v.strip().lower() in UNKNOWN:
        return None
    return v
