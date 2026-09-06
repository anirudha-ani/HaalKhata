#!/bin/sh
# Container entrypoint. Secrets are NOT loaded here any more.
#
# They arrive as files under /run/secrets/ (docker-compose.prod.yml), and
# the app reads them straight from those files through the `_FILE`
# convention: SESSION_SECRET_FILE, POSTGRES_PASSWORD_FILE,
# COMPATIBLE_AI_API_KEY_FILE and TWILIO_API_KEY_SECRET_FILE are set in the
# compose file and point at the mounts. No secret value is ever in the
# process environment, so nothing a child process inherits, nothing in
# /proc/<pid>/environ, and nothing an environment dump prints carries one.
# The database URL is assembled inside the app from the password file and
# the non-secret POSTGRES_* parts, URL-encoded.
#
# Kept as the entrypoint so the image's start command has one place to
# grow — and so an old compose file that still mounts the same secrets
# starts the same way.
set -eu

exec "$@"
