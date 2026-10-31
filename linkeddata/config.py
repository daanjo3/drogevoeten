"""Settings for the linked-data conversion. Change BASE once when the datasets get hosted."""
import datetime
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
RAW = os.path.join(REPO, "prototype", "data", "raw", "v3")    # harvest of prototype/datalayer/fetch_v3.py
RAW2 = os.path.join(REPO, "prototype", "data", "raw")         # older harvests (IMWA, ...)
DATALAYER = os.path.join(REPO, "prototype", "datalayer")      # helpers we reuse (build_v3.py)
OUT = os.path.join(HERE, "build")
TERMS = os.path.join(HERE, "terms")

# All our own IRIs start with BASE. For now local files only, so a URN; later e.g. "https://w3id.org/drogevoeten/".
BASE = "urn:drogevoeten:"
DV = BASE + "def:"            # our small extension vocabulary (vocab/droge-voeten.ttl)

TODAY = datetime.date.today().isoformat()
FIRST_CREATED = "2026-10-30"  # dateCreated of the datasets (first conversion)
VERSION = "0.1.0"

PREFIXES = {"dv": DV}

# Publisher and creator of every dataset (NDE requirements-datasets 5.3).
TEAM = {
    "iri": BASE + "org:team-de-band",
    "name": "Team De Band (HackaLOD 2026)",
    "contact_name": "Team De Band",
    "contact_email": None,    # TODO: team address; contactPoint (name + e-mail) becomes required in NDE v2.0
}

# Licences (canonical Creative Commons IRIs, trailing slash, http as stored by the NDE Dataset Register).
CC0 = "http://creativecommons.org/publicdomain/zero/1.0/"
PDM = "http://creativecommons.org/publicdomain/mark/1.0/"
CC_BY_SA = "http://creativecommons.org/licenses/by-sa/4.0/"
# Media whose rights we could not evaluate (RCE beeldbank photos linked from the Landschapsatlas).
RIGHTS_NOT_EVALUATED = "http://rightsstatements.org/vocab/CNE/1.0/"

# Source holders, identified by their Wikidata entity IRI (requirements-datasets 5.3.1).
ORGS = {
    "rce": ("http://www.wikidata.org/entity/Q1766396", "Rijksdienst voor het Cultureel Erfgoed"),
    "zld": ("http://www.wikidata.org/entity/Q705", "Provincie Zeeland"),
    "gemalenstichting": ("http://www.wikidata.org/entity/Q27188363", "Nederlandse Gemalen Stichting"),
}

# spatialCoverage: most specific GeoNames IRI (as returned by the Termennetwerk).
GEONAMES_NL = "https://sws.geonames.org/2750405/"
GEONAMES_ZEELAND = "https://sws.geonames.org/2744011/"

NGR = "https://nationaalgeoregister.nl/geonetwork/srv/api/records/"  # resolvable metadata record per source layer
RCE_WFS = "https://services.rce.geovoorziening.nl/landschapsatlas/wfs"
ZLD_WFS = "https://opengeodata.zeeland.nl/geoserver/wfs"

PROFILE = "https://docs.nde.nl/schema-profile/"
