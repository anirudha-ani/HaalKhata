#!/bin/sh
# Pulls and starts a specific image tag. Lives at /srv/haalkhata/deploy.sh.
#
# Invoked ONLY as an SSH forced command:
#
#   command="/srv/haalkhata/deploy.sh",no-agent-forwarding,no-port-forwarding,\
#   no-pty,no-user-rc,no-X11-forwarding ssh-ed25519 AAAA... github-deploy
#
# The client therefore cannot choose what runs — it can only supply an
# argument, which arrives as SSH_ORIGINAL_COMMAND and is validated below. Even
# a leaked deploy key cannot open a shell or run an arbitrary command.
#
# Rollback is the same command with an older SHA:
#   ssh -i ~/.ssh/haalkhata_deploy deploy@haalkhata.app <previous-sha>
set -eu

TAG="${SSH_ORIGINAL_COMMAND:-}"
printf '%s' "$TAG" | grep -Eq '^[0-9a-f]{40}$' || {
  echo "refusing: expected a 40-char commit sha, got '$TAG'" >&2
  exit 1
}

cd /srv/haalkhata

# IMAGE_TAG is read by docker-compose.prod.yml via compose's automatic .env
# lookup, which is why every command here runs from this directory.
if grep -q '^IMAGE_TAG=' .env; then
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${TAG}|" .env
else
  printf '\nIMAGE_TAG=%s\n' "$TAG" >> .env
fi
grep -qx "IMAGE_TAG=${TAG}" .env || {
  echo "refusing: failed to persist IMAGE_TAG" >&2
  exit 1
}

docker compose -f docker-compose.prod.yml pull web
# --wait blocks on the healthcheck, so a release that boots but cannot serve
# fails the CI job instead of quietly replacing a working one.
docker compose -f docker-compose.prod.yml up -d --wait
docker image prune -f

echo "deployed ${TAG}"
