"""Harvest a water-themed subset of the Rijksmuseum collection as N-Triples.

The Rijksmuseum has no public SPARQL endpoint. This script uses the Search API
(https://data.rijksmuseum.nl/docs/search) to find objects about floods and
water infrastructure (pumping stations, dikes, sluices, polders), then
dereferences every object, its visual item, and the places, events and
Iconclass concepts those refer to (Linked Art profile, N-Triples). Places are
followed up their P89_falls_within chain, so queries can filter on city or
province.

Idempotent: does nothing if the output already exists (pass --force to harvest
again). The output is written to a temporary file first, so an interrupted run
leaves no half-written harvest behind.

Run with: python3 -I qlever/rijksmuseum/harvest.py [--force]
          (or as the `data` service in qlever/docker-compose.yml)
Output:   qlever/data/rijksmuseum-linked-art.nt (served by qlever/, see its Qleverfile)
"""

import argparse
import concurrent.futures
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

SEARCH = "https://data.rijksmuseum.nl/search/collection"
RESOLVE = "https://data.rijksmuseum.nl/{}?_profile=la&_mediatype=application/n-triples"
ID_PREFIX = "https://id.rijksmuseum.nl/"
HARVEST = "https://w3id.org/drogevoeten/harvest#"

# (search field, term). Terms are partial keyword matches in the Search API.
QUERIES = [
    (field, term)
    for field in ("title", "description")
    for term in (
        # floods
        "watersnood",
        "overstroming",
        "dijkdoorbraak",
        "doorbraak",
        "inundatie",
        "stormvloed",
        "watervloed",
        # water infrastructure; terms match whole words only, so plurals are separate
        "gemaal",
        "stoomgemaal",
        "bemaling",
        "dijk",
        "dijken",
        "zeedijk",
        "dijkwerkers",
        "dijkherstel",
        "waterkering",
        "sluis",
        "sluizen",
        "polder",
        "droogmaking",
    )
]

OUT = Path(__file__).resolve().parents[1] / "data" / "rijksmuseum-linked-art.nt"
CRM = "http://www.cidoc-crm.org/cidoc-crm/"
TRIPLE_IRI = re.compile(r"^<([^>]+)> <([^>]+)> <([^>]+)> \.$")
BNODE = re.compile(r"_:([A-Za-z0-9]+)")


def get(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "drogevoeten-hackalod/0.1"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8")
        except Exception as exc:  # network errors and 5xx: back off and retry
            if attempt == retries - 1:
                print(f"  failed {url}: {exc}", file=sys.stderr)
                return None
            time.sleep(2 * (attempt + 1))


def search(field, term):
    """Return all object IRIs for one search, following pagination."""
    url = f"{SEARCH}?{urllib.parse.urlencode({field: term})}"
    ids = []
    while url:
        body = get(url)
        if body is None:
            break
        page = json.loads(body)
        ids += [item["id"] for item in page.get("orderedItems", [])]
        url = page.get("next", {}).get("id")
    return ids


def fetch(iri):
    """Fetch one resource as N-Triples, with blank nodes made unique per resource."""
    local = iri[len(ID_PREFIX):]
    body = get(RESOLVE.format(local))
    if body is None:
        return iri, []
    lines = [BNODE.sub(lambda m: f"_:r{local}{m.group(1)}", line) for line in body.splitlines() if line.strip()]
    return iri, lines


def referenced(lines, predicates):
    """IRIs in the rijksmuseum namespace that are objects of the given CRM predicates."""
    found = set()
    for line in lines:
        m = TRIPLE_IRI.match(line)
        if m and m.group(2) in predicates and m.group(3).startswith(ID_PREFIX):
            found.add(m.group(3))
    return found


def fetch_all(iris, pool):
    return dict(pool.map(fetch, sorted(iris)))


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--force", action="store_true", help="harvest again even if the output exists")
    args = parser.parse_args()
    if OUT.exists() and not args.force:
        print(f"{OUT} exists, skipping harvest (use --force to redo)")
        return

    matches = {}  # object IRI -> set of "field:term"
    for field, term in QUERIES:
        ids = search(field, term)
        print(f"search {field}={term}: {len(ids)}")
        for iri in ids:
            matches.setdefault(iri, set()).add(f"{field}:{term}")
    print(f"{len(matches)} unique objects")

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        objects = fetch_all(matches, pool)
        visual = fetch_all(
            set().union(*(referenced(l, {CRM + "P65_shows_visual_item"}) for l in objects.values())), pool
        )
        print(f"{len(visual)} visual items")

        # Places, events and concepts depicted or referred to, plus production places
        depicted = set().union(
            *(
                referenced(l, {CRM + "P138_represents", CRM + "P199_represents_instance_of_type", CRM + "P129_is_about"})
                for l in visual.values()
            ),
            *(referenced(l, {CRM + "P7_took_place_at"}) for l in objects.values()),
        )
        related = fetch_all(depicted, pool)
        print(f"{len(related)} depicted/related resources")

        # Walk places up to the country so city/province filters work
        frontier = set().union(*(referenced(l, {CRM + "P89_falls_within"}) for l in related.values())) - set(related)
        while frontier:
            batch = fetch_all(frontier, pool)
            related.update(batch)
            frontier = set().union(*(referenced(l, {CRM + "P89_falls_within"}) for l in batch.values())) - set(related)
        print(f"{len(related)} resources after walking the place hierarchy")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_name(OUT.name + ".tmp")
    seen = set()
    with tmp.open("w", encoding="utf-8") as out:
        for group in (objects, visual, related):
            for lines in group.values():
                for line in lines:
                    if line not in seen:
                        seen.add(line)
                        out.write(line + "\n")
        # Provenance: which search found each object
        for iri, hits in sorted(matches.items()):
            for hit in sorted(hits):
                out.write(f'<{iri}> <{HARVEST}matchedSearch> "{hit}" .\n')
    os.replace(tmp, OUT)
    print(f"wrote {len(seen)} triples to {OUT}")


if __name__ == "__main__":
    main()
