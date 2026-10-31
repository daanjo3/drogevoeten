"""Building blocks following SCHEMA-AP-NDE (https://docs.nde.nl/schema-profile/) and the NDE
Requirements for Datasets (https://docs.nde.nl/requirements-datasets/)."""
import datetime
import re
import urllib.parse

import config
from lib.rdf import GEO, IRI, PROV, RDF, RDFS, SCHEMA, XSD, Lit, iri, rel, url

A = IRI(RDF + "type")


def s(local):
    return IRI(SCHEMA + local)


def dv(local):
    return iri(config.DV + local)


def prov(local):
    return IRI(PROV + local)


def mint(kind, key):
    """Our IRI for a record: BASE + 'id:<kind>:<key>'. The key comes from a stable source field."""
    return iri(f"{config.BASE}id:{kind}:{urllib.parse.quote(str(key).strip(), safe='-_.~')}")


def part(owner, name):
    """IRI of a nested node that belongs to one record (no blank nodes): '<owner>#<name>'."""
    if "#" in owner:  # nested part of a part: '<record>#locatie-geo' (an IRI has at most one fragment)
        return iri(f"{owner}-{name}")
    return iri(f"{owner}#{name}")


# ---------------------------------------------------------------- literals
def nl(text):
    if text is None:
        return None
    text = re.sub(r"\s+", " ", str(text)).strip()
    return Lit(text, "nl") if text else None


def plain(text):
    return None if text is None or not str(text).strip() else Lit(str(text).strip())


def gyear(y):
    """A year as xsd:gYear (four digits, profile 'dates'). Never xsd:date for a partial date."""
    if y is None:
        return None
    y = int(y)
    return Lit(f"{y:04d}" if y >= 0 else f"-{-y:04d}", dtype=XSD + "gYear")


def xdate(d):
    datetime.date.fromisoformat(d)  # raises on anything that is not a full date
    return Lit(d, dtype=XSD + "date")


def xdatetime(d):
    return Lit(d, dtype=XSD + "dateTime")


def decimal(x, nd=6):
    if x is None:
        return None
    v = f"{round(float(x), nd):.{nd}f}".rstrip("0").rstrip(".")
    return Lit(v if "." in v else v + ".0", dtype=XSD + "decimal")


def integer(x):
    return None if x is None else Lit(str(int(x)), dtype=XSD + "integer")


# ---------------------------------------------------------------- nodes
def record(g, subject, types, dataset, derived_from, name):
    """The part every record has: type(s), name@nl, isPartOf, sdDatePublished, prov:wasDerivedFrom."""
    for t in types:
        g.add(subject, A, s(t))
    g.add(subject, s("name"), nl(name))
    g.add(subject, s("isPartOf"), dataset)
    g.add(subject, s("sdDatePublished"), xdate(config.TODAY))
    g.add(subject, prov("wasDerivedFrom"), url(derived_from))
    return subject


def geo_point(g, owner, lon, lat):
    if lon is None or lat is None:
        return None
    n = part(owner, "geo")
    g.add(n, A, s("GeoCoordinates"))
    g.add(n, s("latitude"), decimal(lat))
    g.add(n, s("longitude"), decimal(lon))
    return n


def _ring(coords):
    return "(" + ", ".join(f"{x:.6f} {y:.6f}" for x, y, *_ in coords) + ")"


def wkt(geom):
    """GeoJSON geometry (WGS84 lon/lat) -> WKT (GeoSPARQL default CRS84 axis order)."""
    t, c = geom["type"], geom["coordinates"]
    if t == "Point":
        return f"POINT ({c[0]:.6f} {c[1]:.6f})"
    if t == "LineString":
        return "LINESTRING " + _ring(c)
    if t == "MultiLineString":
        return "MULTILINESTRING (" + ", ".join(_ring(r) for r in c) + ")"
    if t == "Polygon":
        return "POLYGON (" + ", ".join(_ring(r) for r in c) + ")"
    if t == "MultiPolygon":
        return "MULTIPOLYGON (" + ", ".join("(" + ", ".join(_ring(r) for r in p) + ")" for p in c) + ")"
    raise ValueError(f"unsupported geometry {t}")


def geometry(g, owner, geom):
    """GeoSPARQL geometry next to schema.org (profile 3.2, 'combined' method)."""
    if not geom:
        return None
    n = part(owner, "geometry")
    g.add(owner, IRI(GEO + "hasGeometry"), n)
    g.add(n, A, IRI(GEO + "Geometry"))
    g.add(n, IRI(GEO + "asWKT"), Lit(wkt(geom), dtype=GEO + "wktLiteral"))
    return n


def place(g, subject, name=None, lon=None, lat=None, locality=None, region=None, country=None, street=None,
          postal_code=None):
    g.add(subject, A, s("Place"))
    g.add(subject, s("name"), nl(name))
    g.add(subject, s("geo"), geo_point(g, subject, lon, lat))
    address(g, subject, street, postal_code, locality, region, country)
    return subject


def address(g, owner, street=None, postal_code=None, locality=None, region=None, country=None):
    """Address text as given by the source (R10): schema:address -> PostalAddress '<owner>#address'."""
    if not (street or postal_code or locality or region or country):
        return None
    a = part(owner, "address")
    g.add(a, A, s("PostalAddress"))
    g.add(a, s("streetAddress"), plain(street))
    g.add(a, s("postalCode"), plain(postal_code))
    g.add(a, s("addressLocality"), plain(locality))
    g.add(a, s("addressRegion"), plain(region))
    g.add(a, s("addressCountry"), plain(country))
    g.add(owner, s("address"), a)
    return a


def position(g, terms, record, name, lon=None, lat=None, locality=None, province=None, municipality=None,
             street=None, postal_code=None, geom=None, address_locality=None):
    """Where a built object stands (DECISIONS.md section 7, R7): the record's own '#location' Place with its
    coordinates and address (per record, because only this object stands there), contained in the shared locality,
    which is contained in the shared municipality and/or province (shared, because many records use them).
    Only links the source gives; nothing is derived from the coordinates.
    geom: a line or polygon (dikes, Delta Works) goes on '#location' as GeoSPARQL WKT.
    address_locality: a place name that is only address text, not a shared locality (Zeeland CHS layers, R10)."""
    loc = part(record, "location")
    town_text = locality or address_locality
    place(g, loc, name=f"Locatie van {name}", lon=lon, lat=lat, locality=town_text, region=province,
          country="NL" if (town_text or province or street) else None, street=street, postal_code=postal_code)
    if geom and geom["type"] != "Point":
        geometry(g, loc, geom)
    elif geom and lon is None:
        g.add(loc, s("geo"), geo_point(g, loc, *geom["coordinates"][:2]))
    provs = terms.places(g, "province", province, scoped=False)
    munis = terms.places(g, "municipality", municipality, scoped=False)
    towns = terms.places(g, "locality", locality, province)
    for p in towns or munis or provs:
        g.add(loc, s("containedInPlace"), p)
    for t in towns:
        for p in munis or provs:
            g.add(t, s("containedInPlace"), p)
    for mu in munis:
        for p in provs:
            g.add(mu, s("containedInPlace"), p)
    return loc


def point_on_record(g, record, geom):
    """Geometry of an area record (R8): schema:geo for a point, GeoSPARQL WKT for lines and polygons."""
    if not geom:
        return
    if geom["type"] == "Point":
        lon, lat = geom["coordinates"][:2]
        g.add(record, s("geo"), geo_point(g, record, lon, lat))
    else:
        geometry(g, record, geom)


def identifier(g, owner, local, property_id, value):
    """schema:identifier as PropertyValue (profile 4.2: string or PropertyValue)."""
    if value is None or not str(value).strip():
        return None
    n = part(owner, local)
    g.add(n, A, s("PropertyValue"))
    g.add(n, s("propertyID"), plain(property_id))
    g.add(n, s("value"), plain(value))
    g.add(owner, s("identifier"), n)
    return n


def image(g, owner, content_url, thumbnail_url=None, notice=None, local="image"):
    """Linked photo, not copied (R20). The licence is unknown, so 'Copyright Not Evaluated' (profile 4.7.1).
    Several photos: local='image-1', 'image-2', ... Without a separate thumbnail in the source, the image itself is
    the thumbnail (the profile requires thumbnailUrl next to contentUrl)."""
    cu = url(content_url)
    if cu is None:
        return None
    n = part(owner, local)
    g.add(n, A, s("ImageObject"))
    g.add(n, s("contentUrl"), cu)
    g.add(n, s("thumbnailUrl"), url(thumbnail_url) or cu)
    g.add(n, s("license"), iri(config.RIGHTS_NOT_EVALUATED))
    g.add(n, s("copyrightNotice"), nl(notice))
    g.add(owner, s("associatedMedia"), n)
    return n


def describe(g, owner, parts):
    """One schema:description@nl from several source text fields, each with its label (R19, DECISIONS.md 24).
    parts: [(label or None, text), ...]; empty texts are skipped."""
    pieces = []
    for label, text in parts:
        text = re.sub(r"\s+", " ", str(text)).strip() if text is not None else ""
        if text:
            text = text if text.endswith((".", "!", "?")) else text + "."
            pieces.append(f"{label}: {text}" if label else text)
    g.add(owner, s("description"), nl(" ".join(pieces)) if pieces else None)


def report_document(g, owner, report_url, name):
    """A document that describes the object (R17): schema:subjectOf -> DigitalDocument '<owner>#report'.
    Not typed CreativeWork: it is not a record, so the profile's record rules do not apply to it."""
    u = url(report_url)
    if u is None:
        return None
    n = part(owner, "report")
    g.add(n, A, s("DigitalDocument"))
    g.add(n, s("name"), nl(name))
    g.add(n, s("url"), u)
    g.add(owner, s("subjectOf"), n)
    return n


# Our own term sets (DECISIONS.md sections 4, 10, 22): English slug -> (Dutch name, English name).
OBJECT_TYPES = {
    "pumping-station": ("gemaal", "pumping station"),
    "windmill": ("molen", "windmill"),
    "drained-lake": ("droogmakerij", "drained lake"),
    "drained-lake-structure": ("maalinrichting van een droogmakerij", "drainage installation of a drained lake"),
    "land-consolidation-project": ("landinrichtingsproject", "land consolidation project"),
    "breach-pool": ("wiel", "dike breach pool"),
    "dike": ("dijk", "dike"),
    "polder": ("polder", "polder"),
    "gift-house": ("geschenkwoning", "gift house"),
    "drowned-village": ("verdronken dorp", "drowned village"),
    "delta-work": ("Deltawerk", "Delta Works structure"),
    "lock": ("sluis", "lock"),
    "weir": ("stuw", "weir"),
}
EVENT_TYPES = {
    "construction": ("aanleg of bouw", "construction"),
    "disappearance": ("verdwijning", "disappearance"),
    "embankment": ("indijking", "embankment"),
    "reclamation": ("droogmaking", "land reclamation"),
    "dike-breach": ("dijkdoorbraak", "dike breach"),
    "drowning": ("verdrinking", "drowning"),
    "preparation": ("voorbereiding", "preparation"),
    "approval": ("goedkeuring", "approval"),
    "execution": ("uitvoering", "execution"),
    "deed": ("akte", "deed"),
    "completion": ("afsluiting", "completion"),
}


def object_type(g, terms, record, slug):
    """additionalType -> our own term object-type:<slug> (R3)."""
    nl_name, en_name = OBJECT_TYPES[slug]
    g.add(record, s("additionalType"), terms.own_term(g, "object-type", slug, nl_name, en_name))


def dating(text):
    """Source dating text -> (start, end, precision, text), using the prototype's parse_period (never invents a
    year). end is set when the text names a second year ('1953-1954', '1965 – 1972') or a later century; for
    'voor'/'vóór' the year is the end (latest possible year) and there is no start."""
    from lib.source import parse_period
    if text is None or not str(text).strip():
        return None, None, None, None
    text = re.sub(r"\s+", " ", str(text)).strip()
    p = parse_period(text)
    if p["year"] is None:
        return None, None, "onbekend", text
    end = None
    if p["precision"] == "voor":  # 'Vóór 1200': 1200 is the latest possible year, not the start
        return None, p["year"], "voor", text
    if p["precision"] == "eeuw":  # first century named = start, last one = end ('15e tot 17e eeuw': 1400-1700)
        cs = [int(c) for c in re.findall(r"(\d{1,2})e\b", text)]
        if cs:
            start = (cs[0] - 1) * 100 + (50 if re.search(r"tweede helft", text, re.I) and len(cs) == 1 else 0)
            return start, (cs[-1] * 100 if len(cs) > 1 else None), "eeuw", text
    m = re.fullmatch(r"(?:ca\.?\s*)?(\d{3,4})\s*[-–/]\s*(\d{2,4})", text, re.I)
    if m:
        a, b = m.group(1), m.group(2)
        end = int(a[: len(a) - len(b)] + b) if len(b) < len(a) else int(b)  # '1530/32' -> 1532
        if end < int(a):
            end = None
    return p["year"], end, p["precision"], text


def add_event(g, terms, record, kind, record_name, start=None, end=None, text=None, precision=None,
              derived_from=None, description=None):
    """A dated event of one record (R6, DECISIONS.md 10): IRI '<record>#<kind>', type event-type:<kind>.
    Nothing is written without a year or a text."""
    if start is None and end is None and not text:
        return None
    nl_name, en_name = EVENT_TYPES[kind]
    kind_term = terms.own_term(g, "event-type", kind, nl_name, en_name)
    e = event(g, part(record, kind), kind_term, record, f"{nl_name[:1].upper()}{nl_name[1:]}: {record_name}",
              start=start, end=end, text=text, precision=precision, derived_from=derived_from)
    g.add(e, s("description"), nl(description))
    return e


def dated(g, terms, record, kind, record_name, text, derived_from=None):
    """R5/R6: one certain year -> dateCreated (only for kind 'construction'); anything else -> an event."""
    start, end, precision, text = dating(text)
    if start is None and not text:
        return None
    if kind == "construction" and precision == "jaar" and end is None:
        g.add(record, s("dateCreated"), gyear(start))
        return start
    add_event(g, terms, record, kind, record_name, start, end, text, precision, derived_from)
    return start


def event(g, subject, kind_term, about, name, start=None, end=None, text=None, precision=None, derived_from=None,
          location=None):
    """A dated event (outside the profile, as in events.ttl): original year text and precision are kept."""
    g.add(subject, A, s("Event"))
    g.add(subject, s("additionalType"), kind_term)
    g.add(subject, s("name"), nl(name))
    g.add(subject, s("about"), about)
    g.add(subject, s("location"), location)
    g.add(subject, s("startDate"), gyear(start))
    g.add(subject, s("endDate"), gyear(end))
    g.add(subject, dv("dateText"), nl(text))
    g.add(subject, dv("datePrecision"), plain(precision))
    g.add(subject, prov("wasDerivedFrom"), url(derived_from))
    return subject


# ---------------------------------------------------------------- organisations, datasets, catalog
def organization(g, o_iri, name, email=None, contact_name=None):
    o = iri(o_iri)
    g.add(o, A, s("Organization"))
    g.add(o, s("name"), nl(name))
    if email:
        c = part(o, "contact")
        g.add(c, A, s("ContactPoint"))
        g.add(c, s("name"), nl(contact_name or name))
        g.add(c, s("email"), plain(email))
        g.add(o, s("contactPoint"), c)
    return o


def team(g):
    t = config.TEAM
    return organization(g, t["iri"], t["name"], t["contact_email"], t["contact_name"])


def source_dataset(g, src):
    """The source layer we derive from, described just enough to cite it (isBasedOn / prov:used)."""
    d = iri(src["iri"])
    g.add(d, A, s("Dataset"))
    g.add(d, s("name"), nl(src["name"]))
    g.add(d, s("description"), nl(src.get("description")))
    org_iri, org_name = config.ORGS[src["publisher"]]
    g.add(d, s("publisher"), organization(g, org_iri, org_name))
    g.add(d, s("creator"), iri(org_iri))
    g.add(d, s("license"), iri(src["license"]))
    g.add(d, s("url"), url(src.get("service")))
    downloads = src.get("downloads") or ([src["download"]] if src.get("download") else [])
    for n, link in enumerate(downloads, 1):
        dl = part(d, "download" if n == 1 else f"download-{n}")
        g.add(dl, A, s("DataDownload"))
        g.add(dl, s("contentUrl"), url(link))
        g.add(dl, s("encodingFormat"), plain("application/json"))
        g.add(d, s("distribution"), dl)
    return d


def dataset(g, meta, stats):
    """Dataset description (requirements-datasets 5.6). Distributions are added by the catalog."""
    d = iri(f"{config.BASE}dataset:{meta['slug']}")
    g.add(d, A, s("Dataset"))
    g.add(d, s("name"), nl(meta["name"]))
    g.add(d, s("description"), nl(meta["description"]))
    g.add(d, s("license"), iri(meta["license"]))
    me = team(g)
    g.add(d, s("creator"), me)
    g.add(d, s("publisher"), me)
    g.add(d, s("dateCreated"), xdate(config.FIRST_CREATED))
    g.add(d, s("dateModified"), xdate(config.TODAY))
    g.add(d, s("version"), plain(config.VERSION))
    g.add(d, s("inLanguage"), plain("nl"))
    for sp in meta["spatial"] if isinstance(meta["spatial"], list) else [meta["spatial"]]:
        g.add(d, s("spatialCoverage"), iri(sp))
    if stats.get("years"):
        g.add(d, s("temporalCoverage"), plain(f"{min(stats['years']):04d}/{max(stats['years']):04d}"))
    for a in meta.get("about", []):
        g.add(d, s("about"), iri(a))
    for kw in meta.get("keywords", []):
        g.add(d, s("keywords"), nl(kw))
    g.add(d, s("includedInDataCatalog"), iri(config.BASE + "catalog"))
    act = iri(f"{config.BASE}activity:{meta['slug']}-{config.TODAY}")
    for src in meta["sources"]:
        sd = source_dataset(g, src)
        g.add(d, s("isBasedOn"), sd)
        g.add(act, prov("used"), sd)
    g.add(act, A, prov("Activity"))
    g.add(act, IRI(RDFS + "label"), nl(f"Omzetting naar linked data: {meta['name']}"))
    g.add(act, IRI(RDFS + "comment"), nl(f"linkeddata/datasets/{meta['module']}.py, versie {config.VERSION}"))
    g.add(act, prov("wasAssociatedWith"), me)
    g.add(act, prov("endedAtTime"), xdatetime(datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")))
    g.add(d, prov("wasGeneratedBy"), act)
    return d


DOWNLOADS = [("ttl", "text/turtle"), ("nt", "application/n-triples")]


def distributions(g, d, slug):
    """Downloads as relative IRIs: they resolve next to catalog.ttl, locally and once hosted."""
    for ext, mime in DOWNLOADS:
        n = part(d, ext)
        g.add(n, A, s("DataDownload"))
        g.add(n, s("contentUrl"), rel(f"{slug}.{ext}"))
        g.add(n, s("encodingFormat"), plain(mime))
        g.add(n, s("usageInfo"), iri(config.PROFILE))
        g.add(n, s("dateModified"), xdate(config.TODAY))
        g.add(d, s("distribution"), n)


def catalog(g, datasets):
    c = iri(config.BASE + "catalog")
    g.add(c, A, s("DataCatalog"))
    g.add(c, s("name"), nl("Droge Voeten: waterstaatserfgoed als linked data"))
    g.add(c, s("description"), nl(
        "Linked-data-versies van open bronlagen over molens, gemalen, polders, dijken en andere waterstaatsobjecten, "
        "omgezet volgens het NDE-Schema.org-toepassingsprofiel. Elk record verwijst met prov:wasDerivedFrom naar het bronobject."))
    g.add(c, s("publisher"), team(g))
    g.add(c, s("inLanguage"), plain("nl"))
    for d in datasets:
        g.add(c, s("dataset"), d)
    return c
