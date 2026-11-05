#!/usr/bin/env bash
# Packs the Unity living room builds (not in git) and uploads them as release
# assets, so the Pages workflow can deploy them:
#   public/woonkamer-desktop/  -> woonkamer-desktop.tar.gz  (desktop build)
#   public/woonkamer-mobile/   -> woonkamer-mobile.tar.gz   (mobile build)
# Build both from Unity with the menu Droge Voeten > Build web players.
#
#   app/scripts/upload-woonkamer.sh [tag] [desktop|mobile|both]
#   (defaults: tag v0.1.0, both)
#
# Needs the GitHub CLI, logged in: gh auth login
# Existing assets with the same name on the release are replaced.
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

# check every build first, so nothing is uploaded when one is missing
for folder in "${folders[@]}"; do
  if [[ ! -f "$app_dir/public/$folder/unity-embed.js" ]]; then
    echo "No Unity build in $app_dir/public/$folder (unity-embed.js missing)." >&2
    echo "Build it from Unity (Droge Voeten > Build web players), or upload only the other one." >&2
    exit 1
  fi
done

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for folder in "${folders[@]}"; do
  asset="$folder.tar.gz"
  # archive the folder contents, so it unpacks straight into public/<folder>/
  tar -czf "$tmp/$asset" -C "$app_dir/public/$folder" .
  echo "Packed $(du -h "$tmp/$asset" | cut -f1) into $asset"
  gh release upload "$tag" "$tmp/$asset" --repo "$repo" --clobber
done

echo "Uploaded to https://github.com/$repo/releases/tag/$tag"
