#!/usr/bin/env bash
# Run docker compose for this folder as your own UID/GID, so data and index
# files are owned by you. Arguments go to docker compose; default is `up -d`.
#
#   ./compose.sh                  # harvest, index and serve
#   ./compose.sh logs -f qlever
#   ./compose.sh down
set -euo pipefail

cd "$(dirname "$0")"
[ $# -eq 0 ] && set -- up -d

# env, because UID is a read-only variable in bash
exec env UID="$(id -u)" GID="$(id -g)" docker compose "$@"
