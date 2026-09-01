#!/bin/sh
# Pulls and starts a specific image tag, applying pipeline-managed config.
# Lives at /srv/haalkhata/deploy.sh.
#
# Invoked ONLY as an SSH forced command:
#
#   command="/srv/haalkhata/deploy.sh",no-agent-forwarding,no-port-forwarding,\
#   no-pty,no-user-rc,no-X11-forwarding ssh-ed25519 AAAA... github-deploy
#
# The client cannot choose what runs — it supplies one argument (the commit
# SHA, via SSH_ORIGINAL_COMMAND) and, on stdin, KEY=VALUE lines that are
# validated against an allowlist before touching .env. Even a leaked deploy
# key cannot open a shell or run an arbitrary command.
#
# Nothing on this server is hand-edited: GitHub is the source of truth for
# code, for the compose file and Caddyfile (each image carries the pair it
# was built with under /opt/release/, adopted below only after a dry-run
# validates them), and for non-secret .env config (piped in by the deploy
# workflow from repository variables/secrets). Only the secret files under
# /srv/haalkhata/secrets/ live on the server alone — see ops/README.md.
#
# Rollback is the same command with an older SHA and nothing on stdin:
#   ssh -i ~/.ssh/haalkhata_deploy deploy@haalkhata.app <previous-sha> </dev/null
set -eu

TAG="${SSH_ORIGINAL_COMMAND:-}"
printf '%s' "$TAG" | grep -Eq '^[0-9a-f]{40}$' || {
  echo "refusing: expected a 40-char commit sha, got '$TAG'" >&2
  exit 1
}

cd /srv/haalkhata
IMAGE="ghcr.io/anirudha-ani/haalkhata:${TAG}"

# Writes KEY=VALUE into .env idempotently and verifies it landed.
set_env() {
  if grep -q "^$1=" .env; then
    sed -i "s|^$1=.*|$1=$2|" .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
  grep -qx "$1=$2" .env || {
    echo "refusing: failed to persist $1" >&2
    exit 1
  }
}

# --- config from stdin -------------------------------------------------------
# The workflow pipes KEY=VALUE lines from repository variables/secrets. A key
# outside the allowlist or a value with characters .env must not hold fails
# the deploy loudly — config the operator believes applied but silently
# wasn't is worse than a red X. The timeout keeps an interactive rollback
# (a terminal that never sends EOF) from hanging; `</dev/null` skips the wait.
CONFIG="$(timeout 5 head -c 8192 || true)"
printf '%s\n' "$CONFIG" | while IFS= read -r line; do
  [ -z "$line" ] && continue
  key="${line%%=*}"
  value="${line#*=}"
  case "$key" in
    ACME_EMAIL | GOOGLE_CLIENT_ID | GOOGLE_MOBILE_CLIENT_IDS | TWILIO_API_KEY_SID | TWILIO_VERIFY_SERVICE_SID) ;;
    *)
      echo "refusing: '$key' is not a pipeline-managed .env key" >&2
      exit 1
      ;;
  esac
  # %s\n, not %s: an empty value is zero bytes, and grep cannot match a line
  # that was never emitted. read -r means a value can never hold a newline,
  # so this is always exactly one line.
  printf '%s\n' "$value" | grep -Eq '^[A-Za-z0-9@._,+:-]*$' || {
    echo "refusing: $key value carries characters .env must not hold" >&2
    exit 1
  }
  set_env "$key" "$value"
done

# IMAGE_TAG is read by docker-compose.prod.yml via compose's automatic .env
# lookup, which is why every command here runs from this directory.
set_env IMAGE_TAG "$TAG"

docker pull "$IMAGE"

# --- infra files from the image ----------------------------------------------
# Adopt the compose file and Caddyfile this image was built with, but only
# after a dry-run proves this server's .env and secrets can satisfy them; a
# release the server is not provisioned for fails HERE, with the old stack
# still running, instead of half-recreating it.
STAGE="$(mktemp -d)"
EXTRACT="haalkhata-release-extract"
trap 'rm -rf "$STAGE"; docker rm -f "$EXTRACT" >/dev/null 2>&1 || true' EXIT
docker rm -f "$EXTRACT" >/dev/null 2>&1 || true
docker create --name "$EXTRACT" "$IMAGE" >/dev/null
CADDY_CHANGED=no
if docker cp "$EXTRACT:/opt/release/docker-compose.prod.yml" "$STAGE/docker-compose.prod.yml" 2>/dev/null &&
  docker cp "$EXTRACT:/opt/release/Caddyfile" "$STAGE/Caddyfile" 2>/dev/null; then
  docker compose --project-directory /srv/haalkhata -f "$STAGE/docker-compose.prod.yml" config -q || {
    echo "refusing: the release's compose file does not validate against this server's .env" >&2
    exit 1
  }
  grep -E '^\s+file: /srv/haalkhata/secrets/' "$STAGE/docker-compose.prod.yml" |
    awk '{print $2}' | while IFS= read -r secretFile; do
    [ -f "$secretFile" ] || {
      echo "refusing: the release needs $secretFile, which this server does not have (see ops/README.md)" >&2
      exit 1
    }
  done
  cmp -s "$STAGE/Caddyfile" Caddyfile || CADDY_CHANGED=yes
  mv "$STAGE/docker-compose.prod.yml" docker-compose.prod.yml
  mv "$STAGE/Caddyfile" Caddyfile
else
  # Older images predate /opt/release (rollback targets): keep current files.
  echo "note: image carries no /opt/release files; keeping the server's current compose/Caddyfile"
fi

# --wait blocks on the healthcheck, so a release that boots but cannot serve
# fails the CI job instead of quietly replacing a working one.
docker compose -f docker-compose.prod.yml up -d --wait
# Compose recreates caddy on env/image changes by itself, but it cannot see
# content changes inside a bind mount, so a changed Caddyfile needs the nudge.
if [ "$CADDY_CHANGED" = yes ]; then
  docker compose -f docker-compose.prod.yml up -d --force-recreate --wait caddy
fi
docker image prune -f

echo "deployed ${TAG}"
