"""Access to the prototype's harvest and reuse of its helpers (one harvest, one set of parsing rules)."""
import json
import os
import sys

import config

sys.path.insert(0, config.DATALAYER)
from build_v3 import (clean, feature_uri, int_year, norm, parse_period, rd_to_wgs84,  # noqa: E402,F401
                      zld_code_uri)


def load_layer(name, raw=None):
    """A harvested WFS layer: (features, metadata). Fails with a clear message if the harvest is missing."""
    path = os.path.join(raw or config.RAW, name)
    if not os.path.exists(path):
        sys.exit(f"ontbreekt: {path}\n  draai eerst in prototype/: make restore SNAPSHOT=... of make harvest")
    doc = json.load(open(path, encoding="utf-8"))
    meta = {k: v for k, v in doc.items() if k != "features"} if isinstance(doc, dict) else {}
    return (doc["features"] if isinstance(doc, dict) else doc), meta


UNKNOWN = {"", "*", "-", "onbekend", "none", "null"}


def value(v):
    """Source value or None. Blank strings and explicit 'unknown' markers become None: no statement."""
    v = clean(v)
    if v is None:
        return None
    if isinstance(v, str) and v.strip().lower() in UNKNOWN:
        return None
    return v
