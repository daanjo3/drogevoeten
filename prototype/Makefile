# Droge Voeten v3: data layer (Python 3 stdlib only). data/raw/ and data/build/ are not in git.
#   make restore SNAPSHOT=<file|URL>  exact data of the demo back (recommended)
#   make harvest                      fresh harvest from the sources, then build (~25 min, network)
#   make build                        data/build/ from the cache in data/raw/ (offline, a few seconds)
PY = python3 -I

all: build

check-raw:
	@test -d data/raw/v3 || { echo "data/raw/ ontbreekt: draai eerst 'make restore SNAPSHOT=...' of 'make harvest'" >&2; exit 1; }

build: check-raw                  ## koppelvlak + linksets -> data/build/ (build.py first, build_v3.py reads its output)
	$(PY) datalayer/build.py
	$(PY) datalayer/build_v3.py

# fetch_status.py reads the monument list from data/build/droge-voeten.jsonld, so build.py runs in between.
harvest:                          ## all sources again -> data/raw/, then build
	$(PY) datalayer/fetch.py
	$(PY) datalayer/build.py
	$(PY) datalayer/fetch_status.py
	$(PY) datalayer/fetch_v3.py
	$(MAKE) build

proofs:                           ## proofs/*_link_proofs.txt from data/build/ and data/raw/
	$(PY) datalayer/proofs_v2.py
	$(PY) datalayer/proofs_v3.py

snapshot:                         ## pack data/raw/ + data/build/ -> snapshots/*.tar.zst
	bash datalayer/snapshot.sh pack

restore:                          ## unpack a snapshot: make restore SNAPSHOT=<file|URL>
	@test -n "$(SNAPSHOT)" || { echo "gebruik: make restore SNAPSHOT=<bestand.tar.zst|URL>" >&2; exit 1; }
	bash datalayer/snapshot.sh restore "$(SNAPSHOT)"

serve:
	@echo "open http://127.0.0.1:8000/app/"; python3 -m http.server 8000 --bind 127.0.0.1

docker:
	@test -f data/build/droge-voeten.jsonld || $(MAKE) build
	docker build -t droge-voeten-v3 .

clean:                            ## remove generated output (keeps the raw cache)
	rm -rf data/build

.PHONY: all check-raw build harvest proofs snapshot restore serve docker clean
