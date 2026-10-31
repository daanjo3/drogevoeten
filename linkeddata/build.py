#!/usr/bin/env python3
"""Convert the harvested source layers into separate linked datasets plus a catalog.

Reads prototype/data/raw/ (the prototype's harvest) and terms/*.csv; writes to build/:
  <slug>.ttl, <slug>.nt   one dataset each: its dataset description + all records (+ the terms they use)
  catalog.ttl/.jsonld     DataCatalog with every dataset description and its downloads
  report.json             counts, skipped values, term review status, self-checks
  term-values.json        every source value per term field (input for terms_lookup.py)

Run:  python3 -I linkeddata/build.py [slug ...]
"""
import datetime
import importlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402
from lib import model as m  # noqa: E402
from lib.rdf import IRI, RDF, SCHEMA, XSD, Graph, Lit, to_jsonld, to_ntriples, to_turtle  # noqa: E402
from lib.terms import Terms  # noqa: E402

# Phase 1 datasets (module names in datasets/), in build order. Each has META and convert(g, terms, dataset) -> stats.
DATASETS = ["pumping_stations"]

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


def main(only):
    os.makedirs(config.OUT, exist_ok=True)
    terms = Terms()
    cat = Graph()
    report = {"gebouwd": datetime.datetime.now().isoformat(timespec="seconds"), "base": config.BASE, "datasets": {}}
    dataset_iris = []
    failed = False
    for name in DATASETS:
        mod = importlib.import_module(f"datasets.{name}")
        meta = mod.META
        slug = meta["slug"]
        if only and slug not in only and name not in only:
            continue
        g = Graph()
        d = m.iri(f"{config.BASE}dataset:{meta['slug']}")
        stats = mod.convert(g, terms, d)
        desc = Graph()
        m.dataset(desc, meta, stats)
        full = Graph()
        full.update(desc)
        full.update(g)
        header = (f"{meta['name']}\nGegenereerd door linkeddata/build.py op {config.TODAY} (versie {config.VERSION}).\n"
                  f"Licentie: {meta['license']}. Profiel: {config.PROFILE}")
        open(os.path.join(config.OUT, f"{slug}.ttl"), "w", encoding="utf-8").write(to_turtle(full, config.PREFIXES, header))
        open(os.path.join(config.OUT, f"{slug}.nt"), "w", encoding="utf-8").write(to_ntriples(full))
        cat.update(desc)
        m.distributions(cat, d, slug)
        dataset_iris.append(d)
        problems = check(full, d)
        failed |= bool(problems)
        report["datasets"][slug] = {
            "dataset": str(d), "bronobjecten": stats["bron"], "records": stats["records"], "triples": len(full),
            "overgeslagen": dict(stats["overgeslagen"]), "problemen": problems[:50], "aantal_problemen": len(problems)}
        print(f"{slug}: {stats['records']}/{stats['bron']} records, {len(full)} triples, {len(problems)} problemen")
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
