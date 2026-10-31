"""Merging shared concepts across datasets (DECISIONS.md 29).

Terms, places and organisations already have dataset-independent IRIs, so equal values in the same field are one
node everywhere. This module finds nodes that are the same concept but were minted in different fields or contexts,
and maps them onto one node. Rules, strongest first:
  1. same external term: nodes with a shared schema:sameAs (reviewed: 'aangenomen' or 'gecontroleerd');
  2. same label within one meaning domain (TERM_GROUPS), e.g. 'poldermolen' as windmill function, as main category
     and as type of drainage installation -> one term urn:drogevoeten:term:<group>:<slug> in all their term sets;
  3. a locality without province (no-context) -> the only locality with the same name and a province, when the
     records of both lie within MAX_KM of each other;
  4. a named area (the polder at a dike, the drained area of a pumping station) -> the area record with that name
     (a Zeeland polder or a drained lake), when a coordinate of a record that names it lies within the area's
     bounding box (plus a margin).
Pass 1 collects facts per dataset graph (collect); compute() returns the mapping; the serialisers apply it (remap).
"""
import collections
import math
import re

import config
from lib.rdf import IRI, RDF, SCHEMA, Lit, iri
from lib.source import norm

S = SCHEMA
NAME, ALT, SAME, TERMSET = IRI(S + "name"), IRI(S + "alternateName"), IRI(S + "sameAs"), IRI(S + "inDefinedTermSet")
CIP, GEO_, LAT, LON = IRI(S + "containedInPlace"), IRI(S + "geo"), IRI(S + "latitude"), IRI(S + "longitude")
LOC, ADDTYPE, PART = IRI(S + "locationCreated"), IRI(S + "additionalType"), IRI(S + "isPartOf")
HASGEOM, WKT = IRI("http://www.opengis.net/ont/geosparql#hasGeometry"), IRI("http://www.opengis.net/ont/geosparql#asWKT")
AREA_PREDICATES = (IRI(config.DV + "inPolder"), IRI(config.DV + "drainsArea"))
AREA_FIELDS = ("polder", "drained-area")
AREA_RECORDS = {"term:object-type:polder": "dataset:zeeland-polders", "term:object-type:drained-lake": "dataset:drained-lakes"}

# Fields whose term sets describe the same kind of thing; equal labels there are one concept (rule 2).
TERM_GROUPS = {
    "drainage-structure": ["windmill-type", "windmill-function", "windmill-main-category", "windmill-drive",
                           "drained-lake-structure-type", "pumping-station-function"],
    "dike-function": ["dike-original-function", "dike-later-function"],
    "status": ["windmill-status", "dike-status", "pumping-station-status", "imwa-status", "land-consolidation-status"],
    "protection": ["protection-status", "gift-house-protection"],
    "material": ["facade-material", "roofing"],
}
GROUP_OF = {f: g for g, fields in TERM_GROUPS.items() for f in fields}
MAX_KM = 10.0
BBOX_MARGIN = 0.01  # degrees (~1 km)
CONCEPT_PREFIXES = tuple(config.BASE + p for p in ("term:", "place:", "org:"))


def field_of(node):
    """'urn:drogevoeten:term:windmill-type:wipmolen' -> ('term', 'windmill-type', context or None)."""
    rest = node[len(config.BASE):]
    parts = rest.split(":")
    kind, field = parts[0], parts[1]
    ctx = parts[2] if kind == "place" and len(parts) > 3 else None
    return kind, field, ctx


class Facts:
    def __init__(self):
        self.names = collections.defaultdict(collections.Counter)  # concept -> Counter(nl label)
        self.same = collections.defaultdict(set)                   # concept -> external IRIs
        self.termsets = collections.defaultdict(set)
        self.coords = collections.defaultdict(list)                # concept -> [(lat, lon)] of records using it
        self.area_users = collections.defaultdict(list)            # named-area place -> [(lat, lon)] of its users
        self.area_records = collections.defaultdict(list)          # norm(name) -> [(iri, bbox)] of area records
        self.area_records_loose = collections.defaultdict(list)    # area_key(name) -> [(iri, bbox)]
        self.record_names = {}                                     # record IRI -> nl name (for rule 4 targets)


def _wkt_points(text):
    nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", text)]
    return [(nums[i + 1], nums[i]) for i in range(0, len(nums) - 1, 2)]  # (lat, lon)


def collect(g, facts):
    """Pass 1: remember what the merge rules need from one dataset graph."""
    sub = g._subjects
    def objs(s, p):
        return [o for pp, o in sub.get(s, []) if pp == p]

    def latlon(node):
        for gn in objs(node, GEO_):
            la, lo = objs(gn, LAT), objs(gn, LON)
            if la and lo:
                return float(la[0].value), float(lo[0].value)
        for gm in objs(node, HASGEOM):
            for w in objs(gm, WKT):
                pts = _wkt_points(w.value)
                if pts:
                    return pts[len(pts) // 2]
        return None

    def points(rec):
        """Coordinates of a record: its own geometry, or that of its '#location'."""
        pts = []
        for node in [rec] + objs(rec, LOC):
            for gn in objs(node, GEO_):
                la, lo = objs(gn, LAT), objs(gn, LON)
                if la and lo:
                    pts.append((float(la[0].value), float(lo[0].value)))
            for gm in objs(node, HASGEOM):
                for w in objs(gm, WKT):
                    pts += _wkt_points(w.value)
        return pts

    area_types = {iri(config.BASE + k): iri(config.BASE + v) for k, v in AREA_RECORDS.items()}
    for s, po in sub.items():
        if str(s).startswith(CONCEPT_PREFIXES):
            for p, o in po:
                if p == NAME and isinstance(o, Lit) and o.lang == "nl":
                    facts.names[s][o.value] += 1
                elif p == SAME:
                    facts.same[s].add(o)
                elif p == TERMSET:
                    facts.termsets[s].add(o)
        for p, o in po:
            if p == CIP and str(o).startswith(config.BASE + "place:locality:"):
                pt = latlon(s)
                if pt:
                    facts.coords[o].append(pt)
            elif p in AREA_PREDICATES:
                pts = points(s)
                facts.area_users[o] += pts[:: max(1, len(pts) // 20)]
        types, part = objs(s, ADDTYPE), objs(s, PART)
        if any(t in area_types and part == [area_types[t]] for t in types):
            pts = points(s)
            name = next((o.value for o in objs(s, NAME) if o.lang == "nl"), None)
            if pts and name:
                la, lo = [p[0] for p in pts], [p[1] for p in pts]
                facts.area_records[norm(name)].append((s, (min(la), min(lo), max(la), max(lo))))
                facts.area_records_loose[area_key(name, strip_suffix=False)].append((s, (min(la), min(lo), max(la), max(lo))))
                facts.record_names[s] = name


AREA_FILLER = {"polder", "de", "het", "t", "der", "den"}


def area_key(name, strip_suffix=True):
    """Looser key for area names (rule 4, second try): without words like 'polder'/'de', and for the referring name
    also without a trailing '(...)': 'Polder Vierbannen van Duiveland' and 'Vierbannen van Duiveland' -> 'vierbannen
    van duiveland'; 'De Beemster (Waterland)' -> 'beemster'. Record names keep their '(...)', because there it often
    means a part ('Slabbekoornpolder (oost)'), and a part is not the whole polder."""
    if strip_suffix:
        name = re.sub(r"\s*\([^)]*\)\s*$", "", name or "")
    return " ".join(w for w in norm(name).split() if w not in AREA_FILLER)


def _km(a, b):
    p = math.pi / 180
    return 6371.0 * math.hypot((b[1] - a[1]) * p * math.cos((a[0] + b[0]) * p / 2), (b[0] - a[0]) * p)


def _centroid(pts):
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)) if pts else None


class UnionFind:
    def __init__(self):
        self.parent, self.rule = {}, {}

    def find(self, x):
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a, b, rule):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[rb] = ra
        self.rule.setdefault(a, set()).add(rule)
        self.rule.setdefault(b, set()).add(rule)


def compute(facts):
    """-> (mapping old->new, canonical names new->label, alternate labels new->set, members new->[(old, rules)])."""
    uf = UnionFind()
    label = {n: c.most_common(1)[0][0] for n, c in facts.names.items()}
    # rule 1: shared external term
    by_ext = collections.defaultdict(list)
    for n, ext in facts.same.items():
        for e in ext:
            by_ext[e].append(n)
    for e, nodes in by_ext.items():
        for n in nodes[1:]:
            uf.union(nodes[0], n, f"zelfde externe term ({e})")
    # rule 2: same label within a meaning domain
    by_label = collections.defaultdict(list)
    for n in label:
        kind, field, _ = field_of(n)
        if kind == "term" and field in GROUP_OF:
            by_label[(GROUP_OF[field], norm(label[n]))].append(n)
    group_iri = {}
    for (group, key), nodes in by_label.items():
        if len({field_of(n)[1] for n in nodes}) > 1:
            for n in nodes[1:]:
                uf.union(nodes[0], n, f"zelfde label in het domein {group}")
            group_iri[uf.find(nodes[0])] = iri(f"{config.BASE}term:{group}:{re.sub(r'\s+', '-', key) or 'empty'}")
    # rule 3: locality without province -> the one locality with that name and a province, nearby
    with_ctx = collections.defaultdict(list)
    for n in label:
        kind, field, ctx = field_of(n)
        if kind == "place" and field == "locality" and ctx and ctx != "no-context":
            with_ctx[norm(label[n])].append(n)
    for n in label:
        kind, field, ctx = field_of(n)
        if kind == "place" and field == "locality" and ctx == "no-context":
            here = _centroid(facts.coords.get(n, []))
            if not here:
                continue
            near = [c for c in with_ctx.get(norm(label[n]), [])
                    if facts.coords.get(c) and _km(here, _centroid(facts.coords[c])) <= MAX_KM]
            if len(near) == 1:
                uf.union(near[0], n, f"zelfde woonplaatsnaam, records binnen {MAX_KM:g} km")
    # rule 4: named area -> area record (same name, a record that names it lies inside the area's bounding box)
    record_target = {}
    for n in list(label):
        if not str(n).startswith(CONCEPT_PREFIXES):
            continue
        kind, field, _ = field_of(n)
        if kind != "place" or field not in AREA_FIELDS:
            continue
        pts = facts.area_users.get(n, [])

        def near(cands):
            return [r for r, (a, b, c, d) in cands
                    if any(a - BBOX_MARGIN <= la <= c + BBOX_MARGIN and b - BBOX_MARGIN <= lo <= d + BBOX_MARGIN
                           for la, lo in pts)]
        hits, rule = near(facts.area_records.get(norm(label[n]), [])), "zelfde gebiedsnaam, record ligt in of bij het gebied"
        if not hits and area_key(label[n]):
            hits = near(facts.area_records_loose.get(area_key(label[n]), []))
            rule = "zelfde gebiedsnaam zonder 'polder'/'de'/toevoeging tussen haakjes, record ligt in of bij het gebied"
        if len(hits) == 1:
            uf.union(hits[0], n, rule)
            record_target[uf.find(n)] = hits[0]
            label.setdefault(hits[0], facts.record_names[hits[0]])

    # canonical node per set: a record > a node with context > an own term > the first; label merges -> group IRI
    sets = collections.defaultdict(list)
    for x in list(uf.parent):
        sets[uf.find(x)].append(x)
    mapping, names, alts, members = {}, {}, collections.defaultdict(set), {}
    for root, nodes in sets.items():
        if len(nodes) < 2:
            continue
        target = record_target.get(root) or group_iri.get(root)
        if not target:
            def rank(n):
                kind, field, ctx = field_of(n) if str(n).startswith(CONCEPT_PREFIXES) else ("record", None, None)
                return (kind != "record", ctx == "no-context", field not in ("object-type", "province", "municipality"), str(n))
            target = sorted(nodes, key=rank)[0]
        canon = label.get(target) or label.get(sorted(nodes, key=lambda n: -sum(facts.names[n].values()))[0])
        names[target] = canon
        for n in nodes:
            if norm(label.get(n, "")) != norm(canon) and label.get(n):
                alts[target].add(label[n])
            if n != target:
                mapping[n] = target
        members[target] = [(n, sorted(uf.rule.get(n, []))) for n in sorted(nodes) if n != target]
    return mapping, names, alts, members


def remapper(mapping, names, alts):
    """Triple transform for the serialisers: rewrite merged nodes; one canonical nl name per merged node."""
    done_alts = set()

    def t(s, p, o):
        s2 = mapping.get(s, s)
        o2 = mapping.get(o, o) if isinstance(o, (IRI,)) else o
        if s2 in names and p == NAME and isinstance(o, Lit) and o.lang == "nl":
            out = [(s2, p, Lit(names[s2], "nl"))]
            if s2 not in done_alts:
                done_alts.add(s2)
                out += [(s2, ALT, Lit(a, "nl")) for a in sorted(alts.get(s2, ()))]
            return out
        return [(s2, p, o2)]
    return t
