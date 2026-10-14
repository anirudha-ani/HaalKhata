#!/bin/sh
# The deploy steps for one release: apply pipeline-managed config, adopt the
# release's compose file and Caddyfile, restart, prune.
#
# Baked into every image at /opt/release/deploy-release.sh and run by the
# launcher at /srv/haalkhata/deploy.sh (ops/deploy.sh), which has already
# checked the commit SHA, pulled the image and copied its /opt/release out:
#
#   sh deploy-release.sh <40-char sha> <dir holding the image's /opt/release>
#
# from /srv/haalkhata, with the client's KEY=VALUE config lines on stdin. The
# exit status is the deploy's result. That contract is fixed: the launcher
# cannot be updated through the deploy key, so a change to it costs a manual
# copy to the server. Everything below can change freely: these steps ship
# inside the image, so a new pipeline-managed key or secret file goes out
# with an ordinary release and rolls back with it.
#
# Nothing on this server is hand-edited: GitHub is the source of truth for
# code, for these deploy steps, for the compose file and Caddyfile (adopted
# below only after a dry-run validates them), for non-secret .env config, and,
# when the corresponding GitHub secret is set, for the secret files under
# /srv/haalkhata/secrets/ too (an unset GitHub secret pipes an empty value,
# which leaves the server's file alone, so any secret may still live on the
# server only). See ops/README.md.
set -eu

TAG="${1:-}"
RELEASE="${2:-}"
# The launcher checked the SHA already; checking again keeps these steps safe
# to run without it.
printf '%s' "$TAG" | grep -Eq '^[0-9a-f]{40}$' || {
  echo "refusing: expected a 40-char commit sha, got '$TAG'" >&2
  exit 1
}
[ -d "$RELEASE" ] || {
  echo "refusing: expected the directory holding the release files, got '$RELEASE'" >&2
  exit 1
}

cd /srv/haalkhata

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

# Writes one secret file idempotently. Secrets land under secrets/, never
# in .env: the app reads them through the *_FILE convention, so they stay
# out of the process environment and out of compose interpolation. An empty
# value means "not managed from GitHub" and leaves the server's file alone,
# so a rollback with nothing on stdin clobbers nothing. 0444 looks backwards
# until you remember the containers run as non-root and read the bind-mounted
# file with its host permissions; the 0700 directory is what gates host-side
# readers (see ops/README.md).
set_secret() {
  [ -z "$2" ] && return 0
  install -d -m 700 secrets
  printf '%s' "$2" > "secrets/.$1.tmp"
  chmod 444 "secrets/.$1.tmp"
  mv -f "secrets/.$1.tmp" "secrets/$1"
}

# --- config from stdin -------------------------------------------------------
# The workflow pipes KEY=VALUE lines from repository variables/secrets. A key
# outside the allowlist or a value with characters .env must not hold fails
# the deploy loudly: config the operator believes applied but silently
# wasn't is worse than a red X. The timeout keeps an interactive rollback
# (a terminal that never sends EOF) from hanging; `</dev/null` skips the wait.
CONFIG="$(timeout 5 head -c 8192 || true)"
printf '%s\n' "$CONFIG" | while IFS= read -r line; do
  [ -z "$line" ] && continue
  key="${line%%=*}"
  value="${line#*=}"
  case "$key" in
    ACME_EMAIL | GOOGLE_CLIENT_ID | GOOGLE_MOBILE_CLIENT_IDS | TWILIO_API_KEY_SID | TWILIO_VERIFY_SERVICE_SID)
      # %s\n, not %s: an empty value is zero bytes, and grep cannot match a
      # line that was never emitted. read -r means a value can never hold a
      # newline, so this is always exactly one line.
      printf '%s\n' "$value" | grep -Eq '^[A-Za-z0-9@._,+:-]*$' || {
        echo "refusing: $key value carries characters .env must not hold" >&2
        exit 1
      }
      set_env "$key" "$value"
      ;;
    TWILIO_API_KEY_SECRET | COMPATIBLE_AI_API_KEY | SESSION_SECRET | POSTGRES_PASSWORD)
      # Any printable ASCII: secret material (base64, hex, vendor formats)
      # is wider than what .env may hold, and a file has no syntax to break.
      printf '%s\n' "$value" | grep -Eq '^[!-~]*$' || {
        echo "refusing: $key value carries non-printable characters" >&2
        exit 1
      }
      case "$key" in
        TWILIO_API_KEY_SECRET) set_secret twilio_api_key_secret "$value" ;;
        COMPATIBLE_AI_API_KEY) set_secret openrouter_api_key "$value" ;;
        SESSION_SECRET) set_secret session_secret "$value" ;;
        POSTGRES_PASSWORD) set_secret postgres_password "$value" ;;
      esac
      ;;
    *)
      echo "refusing: '$key' is not a pipeline-managed key" >&2
      exit 1
      ;;
  esac
done

# IMAGE_TAG is read by docker-compose.prod.yml via compose's automatic .env
# lookup, which is why every command here runs from this directory.
set_env IMAGE_TAG "$TAG"

# --- infra files from the release --------------------------------------------
# Adopt the compose file and Caddyfile this image was built with, but only
# after a dry-run proves this server's .env and secrets can satisfy them; a
# release the server is not provisioned for fails HERE, with the old stack
# still running, instead of half-recreating it.
for releaseFile in docker-compose.prod.yml Caddyfile; do
  [ -f "$RELEASE/$releaseFile" ] || {
    echo "refusing: the release carries no $releaseFile" >&2
    exit 1
  }
done
docker compose --project-directory /srv/haalkhata -f "$RELEASE/docker-compose.prod.yml" config -q || {
  echo "refusing: the release's compose file does not validate against this server's .env" >&2
  exit 1
}
grep -E '^\s+file: /srv/haalkhata/secrets/' "$RELEASE/docker-compose.prod.yml" |
  awk '{print $2}' | while IFS= read -r secretFile; do
  [ -f "$secretFile" ] || {
    echo "refusing: the release needs $secretFile, which this server does not have (see ops/README.md)" >&2
    exit 1
  }
done
CADDY_CHANGED=no
cmp -s "$RELEASE/Caddyfile" Caddyfile || CADDY_CHANGED=yes
mv "$RELEASE/docker-compose.prod.yml" docker-compose.prod.yml
mv "$RELEASE/Caddyfile" Caddyfile

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
