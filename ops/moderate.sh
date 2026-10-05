#!/usr/bin/env bash
# Private moderation console: deployed SQL is read from the matching web image.
# Usage: ./ops/moderate.sh list | remove|dismiss|suspend|resume REPORT_UUID
set -euo pipefail
cd /srv/haalkhata
moderation_action="${1:-list}"
moderation_report="${2:-}"
case "$moderation_action" in
  list) ;;
  remove|dismiss|suspend|resume)
    [[ "$moderation_report" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ ]] || { echo 'A report UUID is required.' >&2; exit 1; } ;;
  *) echo 'Use list, remove, dismiss, suspend, or resume.' >&2; exit 1 ;;
esac
docker compose -f docker-compose.prod.yml exec -T web cat /opt/release/moderation.sql \
  | docker compose -f docker-compose.prod.yml exec -T db psql -U haalkhata -d haalkhata \
      -v ON_ERROR_STOP=1 -v action="$moderation_action" -v report_id="$moderation_report"
