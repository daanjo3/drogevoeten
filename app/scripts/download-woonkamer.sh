#!/usr/bin/env bash
# Downloads the Unity living room builds from a GitHub release (the assets
# that upload-woonkamer.sh puts there) and unpacks them for the local app:
#   woonkamer-desktop.tar.gz  -> public/woonkamer-desktop/  (desktop build)
#   woonkamer-mobile.tar.gz   -> public/woonkamer-mobile/   (mobile build)
#
#   app/scripts/download-woonkamer.sh [tag] [desktop|mobile|both]
#   (defaults: tag v0.1.0, both)
#
# Needs the GitHub CLI, logged in: gh auth login
# Each folder is replaced only after its download succeeded.
set -euo pipefail

tag="${1:-v0.1.0}"
which="${2:-both}"
repo="daanjo3/drogevoeten"

case "$which" in
  desktop) folders=(woonkamer-desktop) ;;
  mobile) folders=(woonkamer-mobile) ;;
  both) folders=(woonkamer-desktop woonkamer-mobile) ;;
  *) echo "Unknown build '$which': use desktop, mobile or both" >&2; exit 2 ;;
esac

app_dir="$(cd "$(dirname "$0")/.." && pwd)"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for folder in "${folders[@]}"; do
  asset="$folder.tar.gz"
  gh release download "$tag" --repo "$repo" --pattern "$asset" --dir "$tmp"
  mkdir -p "$tmp/$folder"
  tar -xzf "$tmp/$asset" -C "$tmp/$folder"
  rm -rf "$app_dir/public/$folder"
  mv "$tmp/$folder" "$app_dir/public/$folder"
  echo "Unpacked $asset into public/$folder"
done
