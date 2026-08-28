#!/usr/bin/env bash
# Emits a critical local event and calls the operator's HTTPS failure endpoint.
# Invoked by haalkhata-backup.service through systemd's OnFailure hook.
set -euo pipefail
umask 077

BASE=/srv/haalkhata
ALERT_URL_FILE="$BASE/backup-alert-url.txt"
MESSAGE="HaalKhata nightly backup failed; inspect journalctl -u haalkhata-backup.service"

# The journal entry remains available even when DNS or the alert provider is
# unavailable. auth.crit also reaches any host-level log forwarding facility.
logger --priority auth.crit --tag haalkhata-backup -- "$MESSAGE"

if [ ! -f "$ALERT_URL_FILE" ] || [ -L "$ALERT_URL_FILE" ]; then
  echo "backup alert URL is missing or unsafe: $ALERT_URL_FILE" >&2
  exit 1
fi
if [ "$(stat -c %u "$ALERT_URL_FILE")" -ne 0 ]; then
  echo "backup alert URL must be owned by root" >&2
  exit 1
fi
case "$(stat -c %a "$ALERT_URL_FILE")" in
  400|600) ;;
  *)
    echo "backup alert URL permissions must be 0400 or 0600" >&2
    exit 1
    ;;
esac

IFS= read -r ALERT_URL < "$ALERT_URL_FILE"
if [[ ! "$ALERT_URL" =~ ^https://[^[:space:]\"\\]+$ ]]; then
  echo "backup alert URL must be a non-empty HTTPS URL without whitespace" >&2
  exit 1
fi

# A bare POST works with dead-man/failure endpoints such as Healthchecks.io's
# /fail URL and keeps provider credentials out of process arguments and logs.
printf 'url = "%s"\n' "$ALERT_URL" \
  | curl --disable --config - --fail --silent --show-error --output /dev/null \
      --proto '=https' --proto-redir '=https' --max-redirs 0 \
      --connect-timeout 5 --max-time 15 --retry 2 --request POST
