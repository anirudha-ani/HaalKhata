#!/bin/sh
# Loads Docker secrets into the environment, then execs the app.
#
# Secrets arrive as files under /run/secrets/ (docker-compose.prod.yml), but
# the app reads process.env — this bridges the two. The payoff is that no
# secret value appears in a compose file, an image layer, `docker inspect`, or
# `docker compose config` output.
#
# Honest limit: the values do end up in this process's environment, because
# that is what the app reads. Closing that last gap means teaching
# auth.usecase.ts / receipt.constants.ts a *_FILE convention.
set -eu

# Exports $1 from the secret file named $2, if that file exists.
# A missing file is not an error here: the app's own production guardrails
# (assertSafeDatabaseUrl, the SESSION_SECRET check) fail closed and produce a
# far clearer message than anything this script could print.
load_secret() {
  secret_file="/run/secrets/$2"
  [ -f "$secret_file" ] || return 0
  export "$1=$(cat "$secret_file")"
}

load_secret SESSION_SECRET        session_secret
load_secret COMPATIBLE_AI_API_KEY openrouter_api_key
load_secret POSTGRES_PASSWORD     postgres_password

# Assembled here rather than written into docker-compose.prod.yml so the
# password stays out of the compose file and out of `docker inspect`.
if [ -n "${POSTGRES_PASSWORD:-}" ]; then
  export DATABASE_URL="postgres://haalkhata:${POSTGRES_PASSWORD}@db:5432/haalkhata"
fi
# The app never needs this on its own; DATABASE_URL carries it from here.
unset POSTGRES_PASSWORD

exec "$@"
