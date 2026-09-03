#!/usr/bin/env bash
# Restore a snapshot: scripts/restore.sh backups/lms-2026-09-03_141303.sql
#
# Replaces the schema rather than dropping the database, so the running API
# keeps its connection instead of erroring until it is restarted.
set -euo pipefail
FILE="${1:?usage: scripts/restore.sh <backup.sql>}"
[ -f "$FILE" ] || { echo "No such file: $FILE" >&2; exit 1; }

docker compose exec -T postgres psql -U lms -d lms_portal \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO lms;" >/dev/null
docker compose exec -T postgres psql -U lms -d lms_portal -q < "$FILE" >/dev/null

echo "Restored from $FILE"
echo "If the portal shows errors, restart it: Ctrl+C then npm run dev"
