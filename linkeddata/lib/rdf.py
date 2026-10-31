"""Minimal RDF graph + Turtle / N-Triples / JSON-LD writers (Python standard library only).

Only what the conversion needs: IRIs, language-tagged and typed literals, no blank nodes
(every nested node gets its own IRI, usually '<record>#<part>'), insertion order kept.
"""
import json
import re
import urllib.parse

RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
RDFS = "http://www.w3.org/2000/01/rdf-schema#"
XSD = "http://www.w3.org/2001/XMLSchema#"
SCHEMA = "https://schema.org/"
PROV = "http://www.w3.org/ns/prov#"
GEO = "http://www.opengis.net/ont/geosparql#"

PREFIXES = {"rdf": RDF, "rdfs": RDFS, "xsd": XSD, "schema": SCHEMA, "prov": PROV, "geo": GEO}

_ABS_IRI = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:[^\s<>\"{}|\\^`]*$")
_REL_IRI = re.compile(r"^[^\s<>\"{}|\\^`:]+$")
_SIMPLE_LOCAL = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]*$")


class IRI(str):
    """An absolute IRI. Built with iri() (strict) or url() (lenient, percent-encodes)."""


class RelIRI(str):
    """A relative IRI reference (only used for download files next to the catalog)."""


class Lit:
    __slots__ = ("value", "lang", "dtype")

    def __init__(self, value, lang=None, dtype=None):
        self.value, self.lang, self.dtype = str(value), lang, dtype

    def key(self):
        return (self.value, self.lang, self.dtype)

    def __eq__(self, other):
        return isinstance(other, Lit) and self.key() == other.key()

    def __hash__(self):
        return hash(self.key())

    def __repr__(self):
        return f"Lit({self.value!r}, lang={self.lang!r}, dtype={self.dtype!r})"


def iri(s):
    """Strict: for IRIs we mint ourselves. Raises on anything that is not a valid absolute IRI."""
    s = str(s)
    if not _ABS_IRI.match(s):
        raise ValueError(f"not an absolute IRI: {s!r}")
    return IRI(s)


def url(s):
    """Lenient: for URLs taken from source data. Percent-encodes characters not allowed in an IRI."""
    if s is None:
        return None
    s = str(s).strip()
    if not s:
        return None
    s = urllib.parse.quote(s, safe=":/?#[]@!$&'()*+,;=%~-._")
    return IRI(s) if _ABS_IRI.match(s) else None


def rel(s):
    s = str(s)
    if not _REL_IRI.match(s):
        raise ValueError(f"not a simple relative IRI: {s!r}")
    return RelIRI(s)


class Graph:
    def __init__(self):
        self._subjects = {}  # subject -> list of (p, o), insertion order
        self._seen = set()

    def add(self, s, p, o):
        """Add one triple. A None or empty object is silently skipped (no statement for missing data)."""
        if o is None or (isinstance(o, Lit) and o.value.strip() == ""):
            return
        if not isinstance(s, (IRI, RelIRI)) or not isinstance(p, IRI) or not isinstance(o, (IRI, RelIRI, Lit)):
            raise TypeError(f"bad triple: {s!r} {p!r} {o!r}")
        t = (s, p, o)
        if t in self._seen:
            return
        self._seen.add(t)
        self._subjects.setdefault(s, []).append((p, o))

    def update(self, other):
        for s, p, o in other.triples():
            self.add(s, p, o)

    def triples(self):
        for s, po in self._subjects.items():
            for p, o in po:
                yield s, p, o

    def subjects(self):
        return list(self._subjects)

    def objects(self, s, p):
        return [o for pp, o in self._subjects.get(s, []) if pp == p]

    def __len__(self):
        return len(self._seen)


# ---------------------------------------------------------------- serialisation
def _esc(v):
    return v.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t")


def _qname(i, prefixes):
    for pfx, ns in prefixes.items():
        if i.startswith(ns) and _SIMPLE_LOCAL.match(i[len(ns):]):
            return f"{pfx}:{i[len(ns):]}"
    return None


def _term_ttl(t, prefixes):
    if isinstance(t, Lit):
        s = f'"{_esc(t.value)}"'
        if t.lang:
            return f"{s}@{t.lang}"
        if t.dtype:
            return f"{s}^^{_qname(t.dtype, prefixes) or '<' + t.dtype + '>'}"
        return s
    return _qname(t, prefixes) or f"<{t}>"


def _apply(s, po, transform):
    """Apply an optional triple transform (lib/merge.remapper) to one subject's triples -> (subject, [(p, o)])."""
    if transform is None:
        return s, po
    out, s2 = [], s
    seen = set()
    for p, o in po:
        for s2, p2, o2 in transform(s, p, o):
            if (p2, o2) not in seen:
                seen.add((p2, o2))
                out.append((p2, o2))
    return s2, out


def to_turtle(g, prefixes=None, header="", transform=None, with_prefixes=True):
    prefixes = dict(PREFIXES, **(prefixes or {}))
    out = [f"@prefix {p}: <{ns}> ." for p, ns in prefixes.items()] if with_prefixes else []
    if header:
        out += [""] + ["# " + line for line in header.splitlines()]
    a = IRI(RDF + "type")
    for s0 in g.subjects():
        s, po = _apply(s0, g._subjects[s0], transform)
        po = sorted(po, key=lambda x: 0 if x[0] == a else 1)  # rdf:type first, rest in insertion order
        lines, i = [], 0
        while i < len(po):
            p = po[i][0]
            objs = []
            while i < len(po) and po[i][0] == p:
                objs.append(po[i][1])
                i += 1
            pt = "a" if p == a else _term_ttl(p, prefixes)
            lines.append(f"{pt} " + ", ".join(_term_ttl(o, prefixes) for o in objs))
        out.append("")
        out.append(_term_ttl(s, prefixes) + " " + " ;\n    ".join(lines) + " .")
    return "\n".join(out) + "\n"


def to_ntriples(g, transform=None, skip=None):
    """skip: a set of already written lines (to write a union of graphs without repeating shared nodes)."""
    def term(t):
        if isinstance(t, Lit):
            s = f'"{_esc(t.value)}"'
            return s + (f"@{t.lang}" if t.lang else f"^^<{t.dtype}>" if t.dtype else "")
        if isinstance(t, RelIRI):
            raise ValueError("relative IRIs cannot be written as N-Triples")
        return f"<{t}>"
    lines = []
    for s0 in g.subjects():
        s, po = _apply(s0, g._subjects[s0], transform)
        for p, o in po:
            line = f"{term(s)} {term(p)} {term(o)} .\n"
            if skip is not None and not str(s).startswith("urn:drogevoeten:id:"):  # shared nodes: write once
                if line in skip:
                    continue
                skip.add(line)
            lines.append(line)
    return "".join(lines)


def to_jsonld(g, prefixes=None):
    """Flattened JSON-LD with prefixed keys and explicit value objects (no type coercion, so the
    schema.org-context pitfalls mentioned by the NDE do not apply)."""
    prefixes = dict(PREFIXES, **(prefixes or {}))
    a = IRI(RDF + "type")

    def key(p):
        return _qname(p, prefixes) or str(p)

    def val(o):
        if isinstance(o, Lit):
            v = {"@value": o.value}
            if o.lang:
                v["@language"] = o.lang
            elif o.dtype:
                v["@type"] = key(o.dtype)
            return v
        return {"@id": str(o)}

    nodes = []
    for s in g.subjects():
        node = {"@id": str(s)}
        for p, o in g._subjects[s]:
            if p == a:
                node.setdefault("@type", []).append(key(o))
            else:
                node.setdefault(key(p), []).append(val(o))
        nodes.append(node)
    return json.dumps({"@context": prefixes, "@graph": nodes}, ensure_ascii=False, indent=1) + "\n"
