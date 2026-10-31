# Droge Voeten: bronlagen als linked data (NDE-Schema.org-toepassingsprofiel).
# Invoer: de oogst van het prototype in ../prototype/data/raw/ (make restore of make harvest daar).
#   make            datasets + catalogus + rapport -> build/   (offline, standaardbibliotheek)
#   make terms      termvoorstellen uit het Termennetwerk -> terms/*.csv   (netwerk)
#   make shapes     NDE-SHACL-shapes ophalen (vastgepinde versie) -> shapes/
#   make validate   SHACL-controle met pyshacl via uv (losse ontwikkelstap)
#   make notebook   pumping-stations.sparqlbook opnieuw maken en elke query testen (pyoxigraph via uv)
PY = python3 -I
# SCHEMA-AP-NDE shapes, commit of 2026-10-29 (see shapes/README.md)
PROFILE_REV = 8949539a8afd0c7702b02412b26eb119f64be7b1

all: build

build:
	$(PY) build.py

terms: build
	$(PY) terms_lookup.py $(ARGS)
	$(PY) build.py

shapes:
	curl -sSfL -o shapes/schema-profile-shacl.ttl https://raw.githubusercontent.com/netwerk-digitaal-erfgoed/schema-profile/$(PROFILE_REV)/shacl.ttl
	curl -sSfL -H 'Accept: text/turtle' -o shapes/datasetregister-shacl.ttl https://datasetregister.netwerkdigitaalerfgoed.nl/api/shacl

validate:
	@test -f shapes/schema-profile-shacl.ttl || $(MAKE) shapes
	uv run --no-project --with pyshacl python -I validate.py

notebook: build
	uv run --no-project --with pyoxigraph python -I make_sparqlbook.py

clean:
	rm -rf build

.PHONY: all build terms shapes validate notebook clean
