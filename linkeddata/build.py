#!/usr/bin/env python3
"""Convert the harvested source layers into separate linked datasets plus a catalog.

Reads prototype/data/raw/ (the prototype's harvest) and terms/*.csv; writes to build/:
  <slug>.ttl, <slug>.nt   one dataset each: its dataset description + all records (+ the terms they use)
  catalog.ttl/.jsonld     DataCatalog with every dataset description and its downloads
  report.json             counts, skipped values, term review status, self-checks
  term-values.json        every source value per term field (input for terms_lookup.py)

Run:  python3 -I linkeddata/build.py [slug ...]
"""
import collections
import datetime
import importlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402
from lib import merge  # noqa: E402
from lib import model as m  # noqa: E402
from lib.rdf import IRI, RDF, SCHEMA, XSD, Graph, Lit, to_jsonld, to_ntriples, to_turtle  # noqa: E402
from lib.terms import Terms  # noqa: E402

# Phase 1 datasets (module names in datasets/), in build order. Each has META and convert(g, terms, dataset) -> stats.
DATASETS = ["pumping_stations", "windmills", "lost_windmills", "drained_lakes", "land_consolidation", "breach_pools",
            "zeeland_dikes", "zeeland_polders", "gift_houses", "drowned_villages", "delta_works",
            "imwa_pumping_stations", "imwa_locks", "imwa_weirs"]

RECORD_TYPES = {IRI(SCHEMA + "CreativeWork"), IRI(SCHEMA + "Place")}


def check(g, dataset):
    """Self-checks on top of SHACL: what the profile requires of every record, and date typing."""
    problems = []
    a, ispart = IRI(RDF + "type"), IRI(SCHEMA + "isPartOf")
    for subj in g.subjects():
        types = set(g.objects(subj, a))
        if types & RECORD_TYPES and g.objects(subj, ispart):
            names = g.objects(subj, IRI(SCHEMA + "name"))
            if not names:
                problems.append(f"{subj}: geen schema:name")
            if any(isinstance(n, Lit) and not n.lang for n in names):
                problems.append(f"{subj}: schema:name zonder taaltag")
            if g.objects(subj, ispart) != [dataset]:
                problems.append(f"{subj}: isPartOf wijst niet (alleen) naar {dataset}")
            if len(g.objects(subj, IRI(SCHEMA + "sdDatePublished"))) != 1:
                problems.append(f"{subj}: niet precies één sdDatePublished")
            if not g.objects(subj, IRI("http://www.w3.org/ns/prov#wasDerivedFrom")):
                problems.append(f"{subj}: geen prov:wasDerivedFrom")
            if len(g.objects(subj, IRI(SCHEMA + "dateCreated"))) > 1:
                problems.append(f"{subj}: meer dan één dateCreated")
    for subj, p, o in g.triples():
        if isinstance(o, Lit) and o.dtype == XSD + "date" and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", o.value):
            problems.append(f"{subj} {p}: onvolledige datum als xsd:date ({o.value})")
        if isinstance(o, Lit) and o.dtype == XSD + "gYear" and not re.fullmatch(r"-?\d{4,}", o.value):
            problems.append(f"{subj} {p}: ongeldig xsd:gYear ({o.value})")
    return problems


COMBINED = {
    "slug": "droge-voeten", "module": "build",
    "name": "Droge Voeten: waterstaatserfgoed in Nederland als linked data (alle datasets samen)",
    "description": (
        "Alle Droge Voeten-datasets in één bestand: gemalen, molens, verdwenen molens, droogmakerijen, landinrichting, "
        "wielen, Zeeuwse dijken, polders, geschenkwoningen, verdronken dorpen, Deltawerken en de kunstwerken van de "
        "waterschappen. Termen, plaatsen en organisaties die in meer dan één dataset voorkomen, zijn één knoop; welke "
        "knopen zijn samengevoegd en waarom, staat in de dataset concept-merges."),
    "license": config.CC_BY_SA,  # contains IMWA data (CC BY-SA 4.0), so share-alike for the whole
    "spatial": config.GEONAMES_NL, "about": [], "keywords": ["waterstaat", "erfgoed", "polder", "molen", "gemaal"],
    "sources": [],
}
MERGES = {
    "slug": "concept-merges", "module": "build",
    "name": "Droge Voeten: samengevoegde termen en plaatsen",
    "description": (
        "Welke termen en plaatsen uit verschillende Droge Voeten-datasets tot één knoop zijn samengevoegd (dct:replaces), "
        "en volgens welke regel: dezelfde externe term, hetzelfde label binnen één betekenisdomein, dezelfde woonplaats "
        "met en zonder provincie binnen 10 km, of een polder bij een dijk die het polderrecord is."),
    "license": config.CC0, "spatial": config.GEONAMES_NL, "about": [], "keywords": ["linkset", "termen", "plaatsen"],
    "sources": [],
}
DCT_REPLACES = IRI("http://purl.org/dc/terms/replaces")
RDFS_COMMENT = IRI("http://www.w3.org/2000/01/rdf-schema#comment")


def check_combined(path):
    """After merging: every node in the combined N-Triples has at most one schema:name per language."""
    langs = collections.defaultdict(set)
    problems = []
    name = "<https://schema.org/name> "
    for line in open(path, encoding="utf-8"):
        if name in line:
            s, rest = line.split(" ", 1)
            lit = rest[len(name):].rsplit(" .", 1)[0]
            lang = lit.rsplit("@", 1)[1] if lit.endswith(("@nl", "@en")) else ""
            val = lit.rsplit("@", 1)[0]
            key = (s, lang)
            langs[key].add(val)
            if len(langs[key]) == 2:
                problems.append(f"{s}: meer dan één naam in taal '{lang}'")
    return problems


def build_one(name, terms):
    mod = importlib.import_module(f"datasets.{name}")
    meta = mod.META
    g = Graph()
    d = m.iri(f"{config.BASE}dataset:{meta['slug']}")
    stats = mod.convert(g, terms, d)
    desc = Graph()
    m.dataset(desc, meta, stats)
    full = Graph()
    full.update(desc)
    full.update(g)
    return meta, d, stats, desc, full


def own_description(cat, meta, parts):
    """Description of a dataset made from our own datasets (combined, merges): isBasedOn/hasPart them."""
    desc = Graph()
    d = m.dataset(desc, meta, {"years": []})
    for p in parts:
        desc.add(d, m.s("isBasedOn"), p)
        desc.add(m.iri(f"{config.BASE}activity:{meta['slug']}-{config.TODAY}"), m.prov("used"), p)
    cat.update(desc)
    return d, desc


def main(only):
    os.makedirs(config.OUT, exist_ok=True)
    names = [n for n in DATASETS if not only or n in only
             or importlib.import_module(f"datasets.{n}").META["slug"] in only]
    combine = not only
    mapping, canon, alts, members = {}, {}, {}, {}
    if combine:  # pass 1: facts for merging shared concepts across datasets (lib/merge.py)
        facts = merge.Facts()
        t1 = Terms()
        for name in names:
            _, _, _, _, full = build_one(name, t1)
            merge.collect(full, facts)
            del full
        mapping, canon, alts, members = merge.compute(facts)
        print(f"samenvoegen: {len(mapping)} knopen opgaan in {len(members)} gedeelde knopen")

    terms = Terms()
    cat = Graph()
    report = {"gebouwd": datetime.datetime.now().isoformat(timespec="seconds"), "base": config.BASE, "datasets": {}}
    dataset_iris = []
    failed = False
    if combine:
        comb_nt = open(os.path.join(config.OUT, "droge-voeten.nt"), "w", encoding="utf-8")
        comb_ttl = open(os.path.join(config.OUT, "droge-voeten.ttl"), "w", encoding="utf-8")
        comb_ttl.write(to_turtle(Graph(), config.PREFIXES, f"{COMBINED['name']}\nGegenereerd op {config.TODAY}; "
                                 f"licentie {COMBINED['license']}."))
        shared_lines = set()
    for name in names:
        meta, d, stats, desc, full = build_one(name, terms)
        slug = meta["slug"]
        tr = merge.remapper(mapping, canon, alts) if combine else None
        header = (f"{meta['name']}\nGegenereerd door linkeddata/build.py op {config.TODAY} (versie {config.VERSION}).\n"
                  f"Licentie: {meta['license']}. Profiel: {config.PROFILE}")
        open(os.path.join(config.OUT, f"{slug}.ttl"), "w", encoding="utf-8").write(
            to_turtle(full, config.PREFIXES, header, transform=tr))
        open(os.path.join(config.OUT, f"{slug}.nt"), "w", encoding="utf-8").write(to_ntriples(full, transform=tr))
        if combine:
            comb_nt.write(to_ntriples(full, transform=merge.remapper(mapping, canon, alts), skip=shared_lines))
            comb_ttl.write(to_turtle(full, config.PREFIXES, f"--- {slug} ---", transform=merge.remapper(mapping, canon, alts),
                                     with_prefixes=False))
        cat.update(desc)
        m.distributions(cat, d, slug)
        dataset_iris.append(d)
        problems = check(full, d)
        failed |= bool(problems)
        report["datasets"][slug] = {
            "dataset": str(d), "bronobjecten": stats["bron"], "records": stats["records"], "triples": len(full),
            "overgeslagen": dict(stats["overgeslagen"]), "problemen": problems[:50], "aantal_problemen": len(problems)}
        print(f"{slug}: {stats['records']}/{stats['bron']} records, {len(full)} triples, {len(problems)} problemen")
        del full

    if combine:
        # the merges as their own small dataset (a linkset with the rule per merged node)
        mg = Graph()
        md, mdesc = own_description(cat, MERGES, dataset_iris)
        mg.update(mdesc)
        rules = collections.Counter()
        for target, olds in sorted(members.items()):
            for old, rs in olds:
                mg.add(target, DCT_REPLACES, old)
                for r in rs:
                    rules[r.split(" (")[0]] += 1
            note = "; ".join(f"{o.rsplit(':', 2)[-2]}:{o.rsplit(':', 1)[-1]} ({', '.join(rs)})" for o, rs in olds)
            mg.add(target, RDFS_COMMENT, m.nl(f"Samengevoegd: {note}"))
            mg.add(target, m.s("name"), m.nl(canon[target]))
        open(os.path.join(config.OUT, "concept-merges.ttl"), "w", encoding="utf-8").write(to_turtle(
            mg, dict(config.PREFIXES, dct="http://purl.org/dc/terms/"), f"{MERGES['name']}, {config.TODAY}"))
        open(os.path.join(config.OUT, "concept-merges.nt"), "w", encoding="utf-8").write(to_ntriples(mg))
        m.distributions(cat, md, "concept-merges")
        # the combined dataset: its description, plus the merges, in the combined files
        cd, cdesc = own_description(cat, COMBINED, dataset_iris + [md])
        for p in dataset_iris + [md]:
            cdesc.add(cd, m.s("hasPart"), p)
            cat.add(cd, m.s("hasPart"), p)
        comb_nt.write(to_ntriples(cdesc, skip=shared_lines) + to_ntriples(mg, skip=shared_lines))
        comb_ttl.write(to_turtle(cdesc, config.PREFIXES, "--- beschrijving en samenvoegingen ---", with_prefixes=False)
                       + to_turtle(mg, config.PREFIXES, "", with_prefixes=False))
        comb_nt.close()
        comb_ttl.close()
        m.distributions(cat, cd, "droge-voeten")
        dataset_iris += [md, cd]
        comb_problems = check_combined(os.path.join(config.OUT, "droge-voeten.nt"))
        failed |= bool(comb_problems)
        report["samenvoegen"] = {"knopen_opgegaan": len(mapping), "gedeelde_knopen": len(members),
                                 "per_regel": dict(rules), "problemen_gecombineerd": comb_problems[:50]}
        print(f"droge-voeten (samen): {len(comb_problems)} problemen")
    m.catalog(cat, dataset_iris)
    header = f"Catalogus Droge Voeten, gegenereerd op {config.TODAY}. Downloads zijn relatief aan dit bestand."
    open(os.path.join(config.OUT, "catalog.ttl"), "w", encoding="utf-8").write(to_turtle(cat, config.PREFIXES, header))
    open(os.path.join(config.OUT, "catalog.jsonld"), "w", encoding="utf-8").write(to_jsonld(cat, config.PREFIXES))
    report["termen"] = terms.report()
    json.dump(report, open(os.path.join(config.OUT, "report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(terms.used_values(), open(os.path.join(config.OUT, "term-values.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    if failed:
        sys.exit("zelfcontrole vond problemen: zie build/report.json")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
