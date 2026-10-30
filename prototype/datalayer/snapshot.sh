#!/usr/bin/env bash
# Pack or restore the data that is not in git (data/raw/ + data/build/) as one .tar.zst snapshot.
#   datalayer/snapshot.sh pack [OUT.tar.zst]        default: snapshots/droge-voeten-v3-data-<date>.tar.zst
#   datalayer/snapshot.sh restore <FILE.tar.zst|URL>
set -euo pipefail
cd "$(dirname "$0")/.."

die() { printf 'fout: %b\n' "$*" >&2; exit 1; }
command -v zstd >/dev/null || die "zstd is nodig (bijv. 'pacman -S zstd' of 'apt install zstd')"

case "${1:-}" in
  pack)
    [ -d data/raw ] && [ -d data/build ] || die "data/raw/ of data/build/ ontbreekt; niets om in te pakken"
    out=${2:-snapshots/droge-voeten-v3-data-$(date +%F).tar.zst}
    mkdir -p "$(dirname "$out")"
    tar --exclude='__pycache__' --sort=name --owner=0 --group=0 --numeric-owner \
        -I 'zstd -T0 -15 --long=27' -cf "$out" data/raw data/build
    ( command -v sha256sum >/dev/null && cd "$(dirname "$out")" && sha256sum "$(basename "$out")" > "$(basename "$out").sha256" ) || true
    echo "klaar: $out ($(du -h "$out" | cut -f1))"
    ;;
  restore)
    src=${2:?gebruik: $0 restore <bestand.tar.zst|URL>}
    if [[ $src =~ ^https?:// ]]; then
      mkdir -p snapshots
      file=snapshots/$(basename "${src%%\?*}")
      curl -fL --retry 3 -o "$file" "$src"
    else
      file=$src
    fi
    [ -f "$file" ] || die "bestand niet gevonden: $file"
    # only data/raw/ and data/build/ may come out of a snapshot
    bad=$(tar -I 'zstd --long=27' -tf "$file" | grep -Ev '^data/(raw|build)(/|$)' || true)
    [ -z "$bad" ] || die "snapshot bevat onverwachte paden:\n$bad"
    tar -I 'zstd --long=27' --no-same-owner -xf "$file"
    echo "teruggezet: data/raw/ ($(du -sh data/raw | cut -f1)), data/build/ ($(du -sh data/build | cut -f1))"
    ;;
  *)
    sed -n '2,4p' "$0" | sed 's/^# //'
    exit 2
    ;;
esac
