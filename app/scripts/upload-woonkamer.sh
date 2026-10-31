#!/usr/bin/env bash
# Packs the Unity living room build (public/woonkamer/, not in git) and
# uploads it as a release asset, so the Pages workflow can deploy it.
#
#   app/scripts/upload-woonkamer.sh [tag]   (default tag: v0.1.0)
#
# Needs the GitHub CLI, logged in: gh auth login
# An existing woonkamer.tar.gz on the release is replaced.
set -euo pipefail

tag="${1:-v0.1.0}"
repo="daanjo3/drogevoeten"
asset="woonkamer.tar.gz"

app_dir="$(cd "$(dirname "$0")/.." && pwd)"
build_dir="$app_dir/public/woonkamer"

if [[ ! -f "$build_dir/unity-embed.js" ]]; then
  echo "No Unity build in $build_dir (unity-embed.js missing)" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# archive the folder contents, so it unpacks straight into public/woonkamer/
tar -czf "$tmp/$asset" -C "$build_dir" .
echo "Packed $(du -h "$tmp/$asset" | cut -f1) into $asset"

gh release upload "$tag" "$tmp/$asset" --repo "$repo" --clobber
echo "Uploaded to https://github.com/$repo/releases/tag/$tag"
