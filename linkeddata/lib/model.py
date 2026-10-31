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


def place(g, subject, name=None, lon=None, lat=None, locality=None, region=None, country=None):
    g.add(subject, A, s("Place"))
    g.add(subject, s("name"), nl(name))
    g.add(subject, s("geo"), geo_point(g, subject, lon, lat))
    if locality or region or country:
        a = part(subject, "address")
        g.add(a, A, s("PostalAddress"))
        g.add(a, s("addressLocality"), plain(locality))
        g.add(a, s("addressRegion"), plain(region))
        g.add(a, s("addressCountry"), plain(country))
        g.add(subject, s("address"), a)
    return subject


def position(g, terms, record, name, lon=None, lat=None, locality=None, province=None):
    """Where a built object stands (DECISIONS.md section 7): the record's own '#location' Place with its coordinates
    and address (per record, because only this object stands there), contained in the shared locality, which is
    contained in the shared province (shared, because many records use them; sameAs after review)."""
    loc = part(record, "location")
    place(g, loc, name=f"Locatie van {name}", lon=lon, lat=lat, locality=locality, region=province, country="NL")
    provs = terms.places(g, "province", province, scoped=False)
    towns = terms.places(g, "locality", locality, province)
    for p in towns or provs:
        g.add(loc, s("containedInPlace"), p)
    for t in towns:
        for p in provs:
            g.add(t, s("containedInPlace"), p)
    return loc


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


def image(g, owner, content_url, thumbnail_url=None, notice=None):
    """Linked photo, not copied. The licence is unknown, so 'Copyright Not Evaluated' (profile 4.7.1)."""
    cu = url(content_url)
    if cu is None:
        return None
    n = part(owner, "image")
    g.add(n, A, s("ImageObject"))
    g.add(n, s("contentUrl"), cu)
    g.add(n, s("thumbnailUrl"), url(thumbnail_url))
    g.add(n, s("license"), iri(config.RIGHTS_NOT_EVALUATED))
    g.add(n, s("copyrightNotice"), nl(notice))
    g.add(owner, s("associatedMedia"), n)
    return n


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
    if src.get("download"):
        dl = part(d, "wfs")
        g.add(dl, A, s("DataDownload"))
        g.add(dl, s("contentUrl"), url(src["download"]))
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
    g.add(d, s("spatialCoverage"), iri(meta["spatial"]))
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
