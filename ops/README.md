# ops/ — production server files

Everything here runs **on the server**, except `docker-entrypoint.sh`, which is
baked into the image. They live in git so they are versioned and reviewable
rather than typed into a terminal and forgotten.

Copy them into place once:

```sh
scp -r ops docker-compose.prod.yml Caddyfile deploy@haalkhata.app:/srv/haalkhata/
```

| File | Goes to | Purpose |
|---|---|---|
| `docker-entrypoint.sh` | *in the image* | Loads Docker secrets into the environment, assembles `DATABASE_URL` |
| `deploy.sh` | `/srv/haalkhata/deploy.sh` | SSH forced command: pull a tag, restart, prune |
| `backup.sh` | `/srv/haalkhata/backup.sh` | Nightly encrypted database **and secrets** backup |
| `daemon.json` | `/etc/docker/daemon.json` | Caps log size; enables live-restore |
| `haalkhata-backup.{service,timer}` | `/etc/systemd/system/` | Runs `backup.sh` at 03:17 UTC |

## Install

```sh
# Docker logging — do this BEFORE the stack first starts, or the logs it has
# already written stay unrotated.
sudo install -m 644 /srv/haalkhata/ops/daemon.json /etc/docker/daemon.json
sudo systemctl restart docker

# Backups
sudo install -m 644 /srv/haalkhata/ops/haalkhata-backup.service /etc/systemd/system/
sudo install -m 644 /srv/haalkhata/ops/haalkhata-backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now haalkhata-backup.timer
```

## Secrets

Four files, referenced by `docker-compose.prod.yml`:

```
/srv/haalkhata/secrets/session_secret        openssl rand -hex 32
/srv/haalkhata/secrets/postgres_password     openssl rand -hex 24
/srv/haalkhata/secrets/openrouter_api_key    from openrouter.ai
/srv/haalkhata/secrets/twilio_api_key_secret from a restricted Twilio Verify API key
```

Set `TWILIO_API_KEY_SID` and `TWILIO_VERIFY_SERVICE_SID` in `/srv/haalkhata/.env`.
They identify the restricted key and Verify service but do not authenticate a
request; only `twilio_api_key_secret` is mounted as a secret.

The directory is `0700 root:root`; the files are `0444`. That looks
backwards until you remember the containers run as non-root (`node` is 1000,
`postgres` is 999) and Compose bind-mounts these with their host permissions —
`0400 root:root` would be unreadable and the stack would refuse to boot. The
directory mode is what actually protects them.

### Rotating `postgres_password` — order matters

`POSTGRES_PASSWORD_FILE` is read **only at initdb**. Editing the file
afterwards changes what the app connects with while the database keeps the old
password, so `web` starts failing authentication and the healthcheck kills the
deploy. Change the database first:

```sh
cd /srv/haalkhata
NEW=$(openssl rand -hex 24)

docker compose -f docker-compose.prod.yml exec -T db \
  psql -U haalkhata -d haalkhata -c "ALTER USER haalkhata WITH PASSWORD '$NEW'"

printf '%s' "$NEW" | sudo tee secrets/postgres_password >/dev/null
sudo chmod 444 secrets/postgres_password

docker compose -f docker-compose.prod.yml up -d --force-recreate --wait web
unset NEW
```

The other two have no second copy anywhere, so they are simpler: write the new
value, `up -d --force-recreate --wait web`, then revoke the old one upstream.
Rotating `session_secret` invalidates every session immediately — that is the
break-glass control if you ever suspect token theft.

### Offsite backup retention

`backup.sh` never deletes remote objects. Local archives rotate after 30 days,
but mirroring those deletions would make the offsite copy unable to recover an
older good backup after local corruption or delayed discovery. Configure the
bucket itself with versioning/object lock when available and a lifecycle rule
appropriate to your retention policy (for example, archive after 90 days and
expire after one year). Filesystem/rsync targets need their own snapshot or
retention policy for the same reason.

## Restore drill

An untested backup is a hypothesis. Run this once now, and quarterly after:

```sh
age -d -i ~/.age-key.txt backups/haalkhata-<stamp>.dump.age > /tmp/drill.dump

docker compose -f docker-compose.prod.yml exec -T db \
  psql -U haalkhata -d postgres -c 'CREATE DATABASE drill'
docker compose -f docker-compose.prod.yml exec -T db \
  pg_restore -U haalkhata -d drill --no-owner < /tmp/drill.dump

# Row counts should match production.
docker compose -f docker-compose.prod.yml exec -T db psql -U haalkhata -d drill \
  -c 'select count(*) from users' -c 'select count(*) from expenses'

docker compose -f docker-compose.prod.yml exec -T db \
  psql -U haalkhata -d postgres -c 'DROP DATABASE drill'
rm -f /tmp/drill.dump
```

## Rollback

`deploy.sh` accepts any valid commit SHA, so rolling back is one line:

```sh
ssh -i ~/.ssh/haalkhata_deploy deploy@haalkhata.app <previous-sha>
```

This rolls back **code, not schema**. Migrations apply on boot and are never
reverted, so an older image can find itself talking to a newer schema —
additive migrations are safe, destructive ones are not. One more reason never
to edit an applied migration.
