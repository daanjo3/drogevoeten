#!/usr/bin/env python3
"""SHACL validation of build/ against the NDE shapes (development step, needs pyshacl).

Run via the Makefile:  uv run --no-project --with pyshacl python -I linkeddata/validate.py
  - every <slug>.ttl against the SCHEMA-AP-NDE shapes (shapes/schema-profile-shacl.ttl)
  - catalog.ttl against the NDE Dataset Register shapes (shapes/datasetregister-shacl.ttl)
Writes build/validation.txt. Results we expect while our IRIs are URNs are listed separately and do not fail.
"""
import collections
import os
import sys

from pyshacl import validate
from rdflib import Graph, Namespace, URIRef

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD, SHAPES = os.path.join(HERE, "build"), os.path.join(HERE, "shapes")
SH = Namespace("http://www.w3.org/ns/shacl#")


LOCAL = ("urn:drogevoeten:", "file://")


def expected(focus, component, value):
    """The register's '^https?://' rules (dataset, organisation, catalog and download IRIs) fail by design
    while our IRIs are URNs and the downloads are local files. They do not count as failures."""
    if component != SH.PatternConstraintComponent:
        return False
    return str(value if value is not None else focus).startswith(LOCAL)


def run(data_file, shapes_file, label, out):
    data = Graph().parse(data_file, format="turtle", publicID="file://" + data_file)
    shapes = Graph().parse(shapes_file, format="turtle")
    # The register's 'probe' components (is a download reachable online, does its Content-Type match) are
    # run by the register itself and have no SHACL validator. Not applicable to local files, so dropped.
    for comp in list(shapes.subjects(None, SH.ConstraintComponent)):
        if str(comp).startswith("https://def.nde.nl/probe#"):
            shapes.remove((comp, None, None))
            out.append(f"   (lokaal niet gecontroleerd: {str(comp).split('#')[1]})")
    _, results, _ = validate(data, shacl_graph=shapes, inference="none", advanced=True, allow_warnings=True)
    groups = collections.Counter()
    examples = {}
    unexpected = 0
    for r in results.subjects(SH.resultSeverity, None):
        sev = results.value(r, SH.resultSeverity).split("#")[-1]
        comp = results.value(r, SH.sourceConstraintComponent)
        path = results.value(r, SH.resultPath)
        focus = results.value(r, SH.focusNode)
        msg = str(results.value(r, SH.resultMessage) or "")
        exp = expected(focus, comp, results.value(r, SH.value))
        shape = results.value(r, SH.sourceShape)
        k = ("verwacht" if exp else sev, str(path).replace("https://schema.org/", "schema:") if path else "-",
             str(comp).split("#")[-1], str(shape) if isinstance(shape, URIRef) else "")
        examples.setdefault(k, (str(focus), msg[:160]))
        groups[k] += 1
        if sev == "Violation" and not exp:
            unexpected += 1
    out.append(f"== {label}: {os.path.basename(data_file)} tegen {os.path.basename(shapes_file)}")
    if not groups:
        out.append("   geen meldingen")
    for k, n in sorted(groups.items(), key=lambda kv: (kv[0][0], -kv[1])):
        out.append(f"   {k[0]:9} {n:6}x  {k[1]}  [{k[2]}] {k[3]}\n             {examples[k][1]}\n             bv. {examples[k][0]}")
    return unexpected


def main():
    out, bad = [], 0
    profile = os.path.join(SHAPES, "schema-profile-shacl.ttl")
    register = os.path.join(SHAPES, "datasetregister-shacl.ttl")
    for shp in (profile, register):
        if not os.path.exists(shp):
            sys.exit(f"ontbreekt: {shp} (draai: make shapes)")
    for name in sorted(os.listdir(BUILD)):
        # droge-voeten.ttl is the union of the datasets validated here (too large for pyshacl); checked by
        # check_combined() in build.py instead (one nl name per node after merging).
        if name.endswith(".ttl") and name not in ("catalog.ttl", "droge-voeten.ttl"):
            bad += run(os.path.join(BUILD, name), profile, "records", out)
    bad += run(os.path.join(BUILD, "catalog.ttl"), register, "datasetbeschrijvingen", out)
    text = "\n".join(out) + f"\n\nOnverwachte overtredingen: {bad}\n"
    open(os.path.join(BUILD, "validation.txt"), "w", encoding="utf-8").write(text)
    print(text)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
