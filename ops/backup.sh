#!/usr/bin/env bash
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
set -euo pipefail
umask 077

BASE=/srv/haalkhata
OUT="$BASE/backups"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RECIPIENT=$(cat "$BASE/backup-recipient.txt")
COMPOSE="$BASE/docker-compose.prod.yml"
DUMP="$OUT/haalkhata-$STAMP.dump.age"
DUMP_PARTIAL="$DUMP.partial"
SECRETS="$OUT/secrets-$STAMP.tar.age"
SECRETS_PARTIAL="$SECRETS.partial"

if [ -L "$OUT" ]; then
  echo "backup directory must not be a symbolic link" >&2
  exit 1
fi
install -d -o root -g root -m 700 "$OUT"
# Repair archives created before the restrictive umask was introduced.
find "$OUT" -maxdepth 1 -type f \( -name '*.age' -o -name '*.age.partial' \) \
  -exec chmod 600 -- {} +
trap 'rm -f "$DUMP_PARTIAL" "$SECRETS_PARTIAL"' EXIT

# --- database ---------------------------------------------------------------
# Small by design: receipts are never persisted and money is integer cents, so
# a full dump is megabytes and long retention costs essentially nothing.
# --format=custom so pg_restore can pull out a single table if that is all
# that was lost.
docker compose -f "$COMPOSE" exec -T db \
  pg_dump -U haalkhata -d haalkhata --format=custom \
  | age -r "$RECIPIENT" > "$DUMP_PARTIAL"

# A custom-format dump of even an empty schema is comfortably above 1 KiB.
# Refuse an implausibly small encrypted result rather than publishing a valid-
# looking file that contains no usable database backup.
if [ "$(stat -c %s "$DUMP_PARTIAL")" -le 1024 ]; then
  echo "database backup is implausibly small; refusing to publish it" >&2
  exit 1
fi
mv "$DUMP_PARTIAL" "$DUMP"

# --- secrets ----------------------------------------------------------------
# Cheap and tiny, so it rides along every night rather than depending on
# someone remembering to re-run it after a rotation.
tar -C "$BASE" -c secrets \
  | age -r "$RECIPIENT" > "$SECRETS_PARTIAL"
mv "$SECRETS_PARTIAL" "$SECRETS"

# --- offsite ----------------------------------------------------------------
# A backup on the same disk as the database is not a backup, and one in the
# same cloud account is only half of one. Point backup-target.txt at an
# S3-compatible bucket on a DIFFERENT provider and configure ~/.s3cfg first.
#
# Backblaze B2 (10 GB free) or Cloudflare R2 (10 GB free, no egress fees) both
# hold these dumps for nothing — they are megabytes. DigitalOcean Spaces also
# works but costs $5/mo minimum, which is most of a droplet.
#
# Offsite is mandatory. A run that only wrote to this disk is not a backup,
# and reporting it as one is how a disk loss takes the database and every
# copy of it together. No target ⇒ the run FAILS, which trips OnFailure and
# the alert. The only way to run local-only is to say so, in writing, with a
# backup-local-only.txt beside the target file — and even then it is a
# warning in the journal every night, not silence.
if [ ! -f "$BASE/backup-target.txt" ]; then
  if [ -f "$BASE/backup-local-only.txt" ]; then
    echo "warning: backup-local-only.txt is set — backups are ONLY on this disk" >&2
  else
    echo "no backup-target.txt: refusing to report a same-disk backup as a backup" >&2
    exit 1
  fi
else
  TARGET=$(cat "$BASE/backup-target.txt")
  case "$TARGET" in
    s3://*) s3cmd sync "$OUT/" "$TARGET" ;;
    *)      rsync -a "$OUT/" "$TARGET" ;;
  esac

  # Verify, don't trust: the upload tool's exit status says it ran, not that
  # tonight's two archives are actually at the remote. List each one back
  # and compare sizes; a missing or short object fails the run.
  for archive in "$DUMP" "$SECRETS"; do
    name=$(basename "$archive")
    local_size=$(stat -c %s "$archive")
    case "$TARGET" in
      s3://*) remote_size=$(s3cmd ls "$TARGET/$name" | awk '{print $3}' | head -n1) ;;
      *)      remote_size=$(rsync --list-only "$TARGET/$name" | awk '{print $2}' | tr -d , | head -n1) ;;
    esac
    if [ "${remote_size:-0}" != "$local_size" ]; then
      echo "offsite copy of $name is missing or short (local $local_size, remote ${remote_size:-none})" >&2
      exit 1
    fi
  done
fi

find "$OUT" -name '*.age' -mtime +30 -delete

echo "backed up $STAMP"
