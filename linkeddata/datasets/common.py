"""Shared parts of the dataset modules: source descriptions, normalisation tables, keys and naming (PLAN.md R1-R24)."""
import collections

import config
from lib.source import feature_uri, value

# ---------------------------------------------------------------- sources (DECISIONS.md 13, 14)
def wfs_source(ngr_id, name, description, publisher, licence, service, layer):
    return {
        "iri": config.NGR + ngr_id,
        "name": name,
        "description": description,
        "publisher": publisher,
        "license": licence,
        "service": service,
        "download": f"{service}?service=WFS&version=2.0.0&request=GetFeature&typeNames={layer}&outputFormat=application/json",
    }


def rce(ngr_id, name, description, layer, licence=config.CC0):
    return wfs_source(ngr_id, name, description, "rce", licence, config.RCE_WFS, layer)


def zld(ngr_id, name, description, layer, licence=config.PDM):
    return wfs_source(ngr_id, name, description, "zld", licence, config.ZLD_WFS, layer)


def rce_uri(layer, fid):
    return feature_uri(config.RCE_WFS, "landschapsatlas:" + layer, fid)


def zld_uri(layer, fid):
    return feature_uri(config.ZLD_WFS, layer, fid)


# ---------------------------------------------------------------- normalisation (R22, DECISIONS.md 12)
PROVINCES = {"Groninger": "Groningen", "Drente": "Drenthe", "Noord-Braband": "Noord-Brabant", "Brabant": "Noord-Brabant"}

# Municipality spellings in the Zeeland layers -> official name. '-' and 'LEEG' are placeholders, not names.
MUNICIPALITIES = {
    "BORSELE": "Borsele", "GOES": "Goes", "HULST": "Hulst", "KAPELLE": "Kapelle", "MIDDELBURG": "Middelburg",
    "NOORD BEVELAND": "Noord-Beveland", "NOORD-BEVELAND": "Noord-Beveland", "REIMERSWAAL": "Reimerswaal",
    "Reimersaal": "Reimerswaal", "SCHOUWEN-DUIVELAND": "Schouwen-Duiveland", "SLUIS": "Sluis", "SLUIS Z": "Sluis",
    "TERNEUZEN": "Terneuzen", "THOLEN": "Tholen", "VEERE": "Veere", "VLISSINGEN": "Vlissingen", "LEEG": None,
}


def province(v):
    v = value(v)
    return PROVINCES.get(v, v)


def municipality(v):
    v = value(v)
    return MUNICIPALITIES.get(v, v) if v is not None else None


# ---------------------------------------------------------------- keys and stats (R1)
def new_stats(n):
    return {"bron": n, "records": 0, "overgeslagen": collections.Counter(), "years": []}


class Keys:
    """Checks that record keys are unique; build stops on a duplicate unless the module resolves it."""

    def __init__(self, slug):
        self.slug, self.seen = slug, set()

    def add(self, key):
        if key in self.seen:
            raise SystemExit(f"{self.slug}: dubbele sleutel {key!r}")
        self.seen.add(key)
        return key


def year(v):
    """A plain year (three or four digits, e.g. 840 for the Ringwalburg) from a source field, or None (0, blanks and
    shorter numbers such as '41' are unknown or unreadable, R6). Written as xsd:gYear with four digits ('0840')."""
    v = value(v)
    if v is None:
        return None
    s = str(v).strip()
    return int(s) if s.isdigit() and len(s) in (3, 4) and int(s) >= 100 else None


def missing_name(name, fallback, stats):
    """R2: a name built only from source fields, marked '(naam onbekend)'."""
    if name:
        return name
    stats["overgeslagen"]["naam onbekend, naam opgebouwd uit bronvelden"] += 1
    return f"{fallback} (naam onbekend)"


# ---------------------------------------------------------------- year + qualifier fields (molendatabase layers)
import re  # noqa: E402

PRECISION_BY_QUALIFIER = [  # first token of the qualifier field -> precision (DECISIONS.md 10)
    (r"^(voor|vóór|<|of eerder|of iets eerder)", "voor"),
    (r"^(na|>|of later|of iets later)", "na"),
    (r"^(ca\.?|circa)", "circa"),
]


def year_with_qualifier(y, qualifier, peak_years=(), peak_note=""):
    """(year, qualifier text) -> (start, end, precision, date_text, plain). plain=True when it is one certain year
    that may go into dateCreated. The qualifier text is kept verbatim in the date text; only its first token sets
    the precision ('voor 1850' -> end 1850). Peak years (collecting years in the source) are never 'plain'."""
    q = value(qualifier)
    if y is None:
        return None, None, None, None, False
    if q is None and y not in peak_years:
        return y, None, "jaar", None, True
    text = f"{y} {q}".strip() if q else str(y)
    precision, start, end = "jaar", y, None
    for pattern, prec in PRECISION_BY_QUALIFIER:
        if q and re.match(pattern, q, re.I):
            precision = prec
            break
    m = re.match(r"^-\s*(\d{4})\b", q or "")
    if m and int(m.group(1)) > y:
        precision, end = "periode", int(m.group(1))
    if precision == "voor":
        start, end = None, y
    if y in peak_years:
        precision = "onzeker"
        text += f" ({peak_note})"
    return start, end, precision, text, False


def zld_filter_uri(layer, field, val):
    """Zeeland CHS 'geocmd' layers have unstable GeoServer fids; select on a stable field instead (DECISIONS.md 13)."""
    import urllib.parse
    q = urllib.parse.quote(f"{field}='{val}'", safe="")
    return (f"{config.ZLD_WFS}?service=WFS&version=2.0.0&request=GetFeature&typeNames={layer}"
            f"&CQL_FILTER={q}&outputFormat=application/json")


def split(v, table):
    """R24: explicit split table for clear compound values in a small code list (DECISIONS.md 27)."""
    v = value(v)
    return table.get(v, [v]) if v is not None else []
