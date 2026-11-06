#!/usr/bin/env bash
# Run docker compose for this folder as your own UID/GID, so index files are
# owned by you. Arguments go to docker compose; default is `up -d`.
#
#   ./compose.sh                  # index, then serve
#   ./compose.sh build            # only make the index (stops a running server)
#   ./compose.sh logs -f qlever
#   ./compose.sh down
#
# The index comes from linkeddata/build/: run `make` and `make rijksmuseum` there
# first. This script only runs on a development machine: ansible/site.yml copies
# its result to the server.
set -euo pipefail

cd "$(dirname "$0")"
[ $# -eq 0 ] && set -- up -d

INPUT=../linkeddata/build

# env, because UID is a read-only variable in bash
compose() { env UID="$(id -u)" GID="$(id -g)" docker compose "$@"; }

build() {
  for f in droge-voeten.nt rijksmuseum/rijksmuseum-linked-art.nt rijksmuseum/rijksmuseum-app.nt; do
    if [ ! -s "$INPUT/$f" ]; then
      echo "Missing or empty $INPUT/$f: run \`make\` and \`make rijksmuseum\` in linkeddata/ first" >&2
      exit 1
    fi
  done
  # A server keeps the old index open, so it must not run while the index changes
  compose stop qlever
  compose run --rm index
}

if [ "$1" = build ]; then
  build
  exit 0
fi
[ "$1" = up ] && build

compose "$@"
