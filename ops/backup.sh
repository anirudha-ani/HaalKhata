#!/bin/sh
# Nightly encrypted backup. Lives at /srv/haalkhata/backup.sh, run by
# haalkhata-backup.timer.
#
# Two things are backed up, because restoring one without the other is only
# half a recovery:
#
#   1. the database  — everyone's ledger
#   2. the secrets   — without session_secret a restored box signs every user
#                      out, and the OpenRouter key has to be reissued
#
# Both are age-encrypted before they leave the box: the dump contains people's
# financial history, and the secrets are the keys to it.
#
# Setup:
#   age-keygen -o ~/.age-key.txt          # keep the private half OFF this box
#   grep 'public key' ~/.age-key.txt      # the recipient string
#   echo 'age1...' > /srv/haalkhata/backup-recipient.txt
set -eu

BASE=/srv/haalkhata
OUT="$BASE/backups"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RECIPIENT=$(cat "$BASE/backup-recipient.txt")
COMPOSE="$BASE/docker-compose.prod.yml"

mkdir -p "$OUT"

# --- database ---------------------------------------------------------------
# Small by design: receipts are never persisted and money is integer cents, so
# a full dump is megabytes and long retention costs essentially nothing.
# --format=custom so pg_restore can pull out a single table if that is all
# that was lost.
docker compose -f "$COMPOSE" exec -T db \
  pg_dump -U haalkhata -d haalkhata --format=custom \
  | age -r "$RECIPIENT" > "$OUT/haalkhata-$STAMP.dump.age"

# --- secrets ----------------------------------------------------------------
# Cheap and tiny, so it rides along every night rather than depending on
# someone remembering to re-run it after a rotation.
tar -C "$BASE" -c secrets \
  | age -r "$RECIPIENT" > "$OUT/secrets-$STAMP.tar.age"

# --- offsite ----------------------------------------------------------------
# A backup on the same disk as the database is not a backup. Configure the
# Storage Box (or any rsync target) before enabling the timer.
if [ -f "$BASE/backup-target.txt" ]; then
  rsync -a --delete "$OUT/" "$(cat "$BASE/backup-target.txt")"
else
  echo "warning: no backup-target.txt — backups are still only on this disk" >&2
fi

find "$OUT" -name '*.age' -mtime +30 -delete

echo "backed up $STAMP"
