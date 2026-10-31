"""Local concepts for source values that are concepts: terms (DefinedTerm) and places (Place).

See DECISIONS.md sections 8, 9 and 22. In short:
- One shared node per distinct value for the whole dataset, never one per record:
    terms   urn:drogevoeten:term:<field>:<slug>                    (e.g. term:drive-type:stoom)
    places  urn:drogevoeten:place:<field>:<context-slug>:<slug>    (e.g. place:drained-area:friesland:friese-boezem)
            urn:drogevoeten:place:<field>:<slug>                   (closed sets, e.g. place:province:friesland)
  The context (e.g. the province) keeps equal names in different regions apart; merging happens in review.
- The node has its Dutch name (name@nl). schema:sameAs to an external term (CHT, AAT, Wikidata, GeoNames) is only
  written for rows a person marked 'gecontroleerd' in terms/<field>.csv; 'weglaten' gives no statement.
- Every source value is kept as it is, also 'Geen' (we cannot know whether it carries meaning). A value that
  clearly names several terms is split by an explicit table in the dataset module, not here (section 27).
- Proposals come from terms_lookup.py (NDE Termennetwerk).

Public API: terms(), places() return lists of node IRIs (empty for a blank value); link(), link_place() add the
relations directly; own_term() for terms we define ourselves.
"""
import collections
import csv
import os
import re

import config
from lib.rdf import IRI, RDF, SCHEMA, Lit, iri
from lib.source import norm

COLUMNS = ["brontekst", "context", "label_nl", "cht", "aat", "wikidata", "geonames", "status", "opmerking"]
SAME_AS_COLUMNS = ("cht", "aat", "wikidata", "geonames")
# Review statuses that put the URI columns into schema:sameAs: 'gecontroleerd' (a person checked it) and
# 'aangenomen' (an assumption by Claude, made because Jari chose not to review; DECISIONS.md section 28).
# 'afgewezen' keeps the term without sameAs; 'weglaten' gives no statement at all.
SAME_AS_STATUSES = {"gecontroleerd", "aangenomen"}
FIELDS = {}  # field (English IRI segment) -> (English name, Dutch name) of the term set
NO_CONTEXT = "no-context"


def slug(text):
    return re.sub(r"\s+", "-", norm(text)) or "empty"


def key(text, context=None):
    return f"{norm(context)}|{norm(text)}" if context else norm(text)


class Terms:
    def __init__(self, folder=config.TERMS):
        self.folder = folder
        self.tables = {}
        self.used = collections.defaultdict(collections.Counter)  # field -> Counter((text, context))
        self.labels = {}  # node IRI -> label (first spelling wins, so case variants share one name)
        self.kinds = {}  # field -> 'term' or 'place' (terms_lookup.py picks its sources by kind)

    def table(self, field):
        if field not in self.tables:
            rows = {}
            path = os.path.join(self.folder, field + ".csv")
            if os.path.exists(path):
                for r in csv.DictReader(open(path, encoding="utf-8")):
                    rows[key(r["brontekst"], r.get("context"))] = r
            self.tables[field] = rows
        return self.tables[field]

    @staticmethod
    def _expand(text):
        """Source value -> [text], or [] when blank."""
        if text is None or not str(text).strip():
            return []
        return [str(text).strip()]

    # ------------------------------------------------------------ nodes
    def _node(self, g, field, text, context, node_iri, types):
        """Types, Dutch name, reviewed sameAs. None when the row says 'weglaten'."""
        self.used[field][(text, context)] += 1
        row = self.table(field).get(key(text, context))
        if row and row.get("status") == "weglaten":
            return None
        for t in types:
            g.add(node_iri, IRI(RDF + "type"), IRI(SCHEMA + t))
        label = self.labels.setdefault(node_iri, (row or {}).get("label_nl") or text)
        g.add(node_iri, IRI(SCHEMA + "name"), Lit(label, "nl"))
        if row and row.get("status") in SAME_AS_STATUSES:
            for col in SAME_AS_COLUMNS:
                if (row.get(col) or "").strip():
                    g.add(node_iri, IRI(SCHEMA + "sameAs"), iri(row[col].strip()))
        return node_iri

    def _termset(self, g, t, field):
        termset = iri(f"{config.BASE}termset:{field}")
        g.add(t, IRI(SCHEMA + "inDefinedTermSet"), termset)
        g.add(termset, IRI(RDF + "type"), IRI(SCHEMA + "DefinedTermSet"))
        en, nl = FIELDS.get(field, (field, None))
        g.add(termset, IRI(SCHEMA + "name"), Lit(en, "en"))
        if nl:
            g.add(termset, IRI(SCHEMA + "name"), Lit(nl, "nl"))

    def terms(self, g, field, text, url_cotype=False):
        """DefinedTerm IRIs for a source value from field (0, 1 or more; adds the term nodes to g)."""
        self.kinds[field] = "term"
        types = ["DefinedTerm", "URL"] if url_cotype else ["DefinedTerm"]  # profile 3.6: co-type URL where needed
        out = []
        for part in self._expand(text):
            t = self._node(g, field, part, None, iri(f"{config.BASE}term:{field}:{slug(part)}"), types)
            if t is not None:
                self._termset(g, t, field)
                out.append(t)
        return out

    def own_term(self, g, field, slug_en, name_nl, name_en, url_cotype=True):
        """A term WE define (not from the source), e.g. object-type:pumping-station or event-type:disappearance:
        English slug, names in Dutch and English (DECISIONS.md sections 4 and 22). The review row is keyed by the slug."""
        self.kinds[field] = "term"
        types = ["DefinedTerm", "URL"] if url_cotype else ["DefinedTerm"]
        node = iri(f"{config.BASE}term:{field}:{slug_en}")
        row = self.table(field).get(key(slug_en)) or {}
        review_label = row.get("label_nl")
        if review_label == slug_en:  # a row added by terms_lookup.py carries the slug, not a Dutch name
            review_label = None
        self.labels.setdefault(node, review_label or name_nl)  # Dutch name, not the slug
        t = self._node(g, field, slug_en, None, node, types)
        if t is None:
            return None
        g.add(t, IRI(SCHEMA + "name"), Lit(name_en, "en"))
        self._termset(g, t, field)
        return t

    def places(self, g, field, text, context=None, scoped=True):
        """Shared local Place IRIs for a named area, water, locality or province (0, 1 or more; adds the nodes to g).
        scoped=True: the context (e.g. the province of the record) is part of the key and the IRI
          (place:<field>:<context>:<name>); None becomes 'no-context', so equal names are never merged across regions.
        scoped=False: for closed sets with unique names, e.g. provinces (place:<field>:<name>)."""
        self.kinds[field] = "place"
        ctx_key = context if scoped else None
        out = []
        for part in self._expand(text):
            if scoped:
                ctx = slug(context) if context else NO_CONTEXT
                node = iri(f"{config.BASE}place:{field}:{ctx}:{slug(part)}")
            else:
                node = iri(f"{config.BASE}place:{field}:{slug(part)}")
            p = self._node(g, field, part, ctx_key, node, ["Place"])
            if p is not None:
                out.append(p)
        return out

    def organization(self, g, field, text):
        """Shared Organization for a named organisation, e.g. a water board (urn:drogevoeten:org:<field>:<slug>).
        Closed sets get sameAs through the review table like terms and places (DECISIONS.md 26)."""
        self.kinds[field] = "organization"
        out = []
        for part in self._expand(text):
            o = self._node(g, field, part, None, iri(f"{config.BASE}org:{field}:{slug(part)}"), ["Organization"])
            if o is not None:
                out.append(o)
        return out

    def link(self, g, subject, predicate, field, text, url_cotype=False):
        """subject predicate <term> for every concept in the source value (none for a null flavour)."""
        out = self.terms(g, field, text, url_cotype)
        for t in out:
            g.add(subject, predicate, t)
        return out

    def link_place(self, g, subject, predicate, field, text, context=None, scoped=True):
        out = self.places(g, field, text, context, scoped)
        for p in out:
            g.add(subject, predicate, p)
        return out

    # ------------------------------------------------------------ reporting
    def report(self):
        out = {}
        for field in sorted(self.used):
            counter = self.used[field]
            table = self.table(field)
            rows = [table.get(key(t, c)) for t, c in counter]
            out[field] = {
                "waarden": len(counter),
                "gecontroleerd": sum(1 for r in rows if r and r.get("status") == "gecontroleerd"),
                "aangenomen": sum(1 for r in rows if r and r.get("status") == "aangenomen"),
                "afgewezen": sum(1 for r in rows if r and r.get("status") == "afgewezen"),
                "voorstel": sum(1 for r in rows if r and r.get("status") == "voorstel"),
                "weglaten": sum(1 for r in rows if r and r.get("status") == "weglaten"),
                "zonder_rij": len([1 for r in rows if not r]),
            }
        return out

    def used_values(self):
        """For terms_lookup.py: per field its kind and a list of {brontekst, context, aantal}."""
        return {f: {"soort": self.kinds[f],
                    "waarden": [{"brontekst": t, "context": c or "", "aantal": n} for (t, c), n in cnt.most_common()]}
                for f, cnt in self.used.items()}
