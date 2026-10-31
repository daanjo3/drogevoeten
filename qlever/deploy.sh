#!/usr/bin/env bash
# Deploy the Rijksmuseum SPARQL endpoint to the VPS:
#   1. stop the containers there, if this folder was deployed before;
#   2. copy docker-compose.yml, compose.sh, the Qleverfile and the
#      rijksmuseum/ scripts, with a fresh random QLever access token, and the
#      Droge Voeten linked data (data/droge-voeten.nt.gz, ~20 MB; built here,
#      because the VPS has no linkeddata/ build);
#   3. start the containers (the first time this harvests, ~10 min, and
#      indexes; data and index stay on the VPS between deploys, and QLever
#      indexes again when an uploaded file is newer than the index).
#
#   qlever/deploy.sh
#
# The token is saved in .access-token here (not in git), and only goes to
# the VPS in its copy of the Qleverfile. The committed Qleverfile keeps the
# local development token.
set -euo pipefail

HOST="${DEPLOY_HOST:-jari@136.144.154.86}"
REMOTE_DIR="${DEPLOY_DIR:-sparql}"

cd "$(dirname "$0")"

# The linked data, gzipped from ../linkeddata/build/ when that is newer
./compose.sh prepare

# One ssh connection for all steps, so you log in (or unlock your key) once
control="$(mktemp -u "${TMPDIR:-/tmp}/deploy-ssh.XXXXXX")"
ssh_() { ssh -o ControlMaster=auto -o ControlPath="$control" -o ControlPersist=60 "$HOST" "$@"; }
staging="$(mktemp -d)"
trap 'rm -rf "$staging"; ssh -o ControlPath="$control" -O exit "$HOST" 2>/dev/null || true' EXIT

echo "Stopping containers on $HOST:$REMOTE_DIR (if any)"
ssh_ "cd '$REMOTE_DIR' 2>/dev/null && [ -x compose.sh ] && ./compose.sh down || true"

# ~60 random letters and digits (not tr </dev/urandom | head: with pipefail, tr's SIGPIPE aborts the script)
token="$(head -c 48 /dev/urandom | base64 -w0 | tr -d '+/=')"
mkdir -p "$staging/rijksmuseum" "$staging/data"
cp docker-compose.yml compose.sh "$staging/"
cp rijksmuseum/*.py "$staging/rijksmuseum/"
# -p keeps the time, so the VPS only indexes again when the data changed
cp -p data/droge-voeten.nt.gz "$staging/data/"
sed "s/^ACCESS_TOKEN .*/ACCESS_TOKEN       = $token/" Qleverfile >"$staging/Qleverfile"
grep -q "^ACCESS_TOKEN       = $token$" "$staging/Qleverfile" || { echo "ACCESS_TOKEN line not found in Qleverfile" >&2; exit 1; }

echo "Copying files"
tar -C "$staging" -cf - . | ssh_ "mkdir -p '$REMOTE_DIR' && tar -C '$REMOTE_DIR' -xf - && chmod 600 '$REMOTE_DIR/Qleverfile'"

# Saved only once the VPS has it, so the file always matches the running server
(umask 077 && printf '%s\n' "$token" >.access-token)

echo "Starting containers (the first deploy harvests and indexes first)"
ssh_ "cd '$REMOTE_DIR' && ./compose.sh up -d && ./compose.sh ps"

echo "Done. Access token in qlever/.access-token"
