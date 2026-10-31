#!/usr/bin/env bash
# Run docker compose for this folder as your own UID/GID, so data and index
# files are owned by you. Arguments go to docker compose; default is `up -d`.
#
#   ./compose.sh                  # harvest, index and serve
#   ./compose.sh logs -f qlever
#   ./compose.sh down
#   ./compose.sh prepare          # only update data/droge-voeten.nt.gz (used by deploy.sh)
#
# Before `up`, the Droge Voeten linked data (../linkeddata/build/droge-voeten.nt,
# from `make` in linkeddata/) is gzipped to data/droge-voeten.nt.gz when it is
# newer. On the VPS there is no ../linkeddata: there deploy.sh has uploaded the file.
set -euo pipefail

cd "$(dirname "$0")"
[ $# -eq 0 ] && set -- up -d

LINKED=../linkeddata/build/droge-voeten.nt
OUT=data/droge-voeten.nt.gz

prepare() {
  if [ -f "$LINKED" ] && { [ ! -f "$OUT" ] || [ "$LINKED" -nt "$OUT" ]; }; then
    echo "Gzipping $LINKED to $OUT"
    mkdir -p data
    # -n: no name or time in the header, so the same input gives the same file
    gzip -n -c "$LINKED" >"$OUT.tmp" && mv "$OUT.tmp" "$OUT"
  fi
  if [ ! -f "$OUT" ]; then
    echo "Missing $OUT: run \`make\` in linkeddata/ first (or deploy.sh, on the VPS)" >&2
    exit 1
  fi
}

if [ "$1" = prepare ]; then
  prepare
  exit 0
fi
[ "$1" = up ] && prepare

# env, because UID is a read-only variable in bash
exec env UID="$(id -u)" GID="$(id -g)" docker compose "$@"
