#!/usr/bin/env bash
# Snapshot the database to backups/. Run before anything that touches the schema.
set -euo pipefail
mkdir -p backups
STAMP=$(date +%Y-%m-%d_%H%M%S)
FILE="backups/lms-${STAMP}.sql"
docker compose exec -T postgres pg_dump -U lms -d lms_portal > "$FILE"
echo "Saved $FILE ($(wc -c < "$FILE") bytes)"
