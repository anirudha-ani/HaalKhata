#!/bin/sh
# Launches a deploy of a specific image tag. Lives at /srv/haalkhata/deploy.sh.
#
# Invoked ONLY as an SSH forced command:
#
#   command="/srv/haalkhata/deploy.sh",no-agent-forwarding,no-port-forwarding,\
#   no-pty,no-user-rc,no-X11-forwarding ssh-ed25519 AAAA... github-deploy
#
# The client cannot choose what runs: it supplies one argument (the commit
# SHA, via SSH_ORIGINAL_COMMAND) and, on stdin, KEY=VALUE config lines. Even a
# leaked deploy key cannot open a shell or run an arbitrary command.
#
# This file is meant never to change. The key cannot update it, so every
# change costs a manual copy to the server. All it does is pull the image for
# that SHA and run the deploy steps the image carries (ops/deploy-release.sh,
# baked in at /opt/release/), so how a release is deployed (which config keys
# are accepted, which secret files they become, adopting the compose file and
# Caddyfile) ships with the release and rolls back with it. See ops/README.md.
#
# Running a script from the image adds no trust the image did not already
# have: the deploy steps have always adopted the image's compose file, which
# runs with this user's Docker access. A leaked key still reaches only the
# images CI built and pushed.
#
# The contract every release's deploy-release.sh keeps:
#
#   sh deploy-release.sh <40-char sha> <dir holding the image's /opt/release>
#
# run from /srv/haalkhata with the image already pulled and the client's
# stdin untouched; its exit status is the deploy's result.
#
# Rollback is the same command with an older SHA (of a release built since
# the launcher) and nothing on stdin:
#   ssh -i ~/.ssh/haalkhata_deploy deploy@haalkhata.app <previous-sha> </dev/null
set -eu
# The session's locale comes from whoever connects; character ranges mean
# byte ranges only in the C locale.
export LC_ALL=C

TAG="${SSH_ORIGINAL_COMMAND:-}"
printf '%s' "$TAG" | grep -Eq '^[0-9a-f]{40}$' || {
  echo "refusing: expected a 40-char commit sha, got '$TAG'" >&2
  exit 1
}

cd /srv/haalkhata
IMAGE="ghcr.io/anirudha-ani/haalkhata:${TAG}"

# Every docker call reads /dev/null: stdin carries the config, and it belongs
# to the deploy steps, which read it themselves.
docker pull "$IMAGE" </dev/null

STAGE="$(mktemp -d)"
EXTRACT="haalkhata-release-extract"
trap 'rm -rf "$STAGE"; docker rm -f "$EXTRACT" >/dev/null 2>&1 </dev/null || true' EXIT
docker rm -f "$EXTRACT" >/dev/null 2>&1 </dev/null || true
docker create --name "$EXTRACT" "$IMAGE" >/dev/null </dev/null
mkdir "$STAGE/release"
docker cp "$EXTRACT:/opt/release/." "$STAGE/release" >/dev/null </dev/null

# Images built before the launcher carry no deploy steps; they are not
# deployable through this key (a rollback reaches the launcher's releases).
STEPS="$STAGE/release/deploy-release.sh"
[ -f "$STEPS" ] || {
  echo "refusing: $IMAGE carries no /opt/release/deploy-release.sh (built before the launcher)" >&2
  exit 1
}

# sh runs a script as it reads it, so without this a syntax error near the
# end would surface only after the config writes above it had run.
sh -n "$STEPS" || {
  echo "refusing: $STEPS does not parse" >&2
  exit 1
}

sh "$STEPS" "$TAG" "$STAGE/release"
