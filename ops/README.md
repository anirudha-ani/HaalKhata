# ops/ — production server files

Everything here runs **on the server**, except `docker-entrypoint.sh`, which is
baked into the image. They live in git so they are versioned and reviewable
rather than typed into a terminal and forgotten.

Only `deploy.sh` (and the systemd/backup files below) need copying by hand,
and only once — the compose file and Caddyfile are **not** maintained on the
server: every image carries the pair it was built with under `/opt/release/`,
and `deploy.sh` adopts them on each deploy after a dry-run validates them.
Bootstrap (also after changing `deploy.sh` itself, which cannot update itself
through the forced command):

```sh
scp -r ops docker-compose.prod.yml Caddyfile deploy@haalkhata.app:/srv/haalkhata/
scp ops/deploy.sh deploy@haalkhata.app:/srv/haalkhata/deploy.sh
```

| File | Goes to | Purpose |
|---|---|---|
| `docker-entrypoint.sh` | *in the image* | Exec-only; the app reads `/run/secrets/` itself through `*_FILE` variables |
| `deploy.sh` | `/srv/haalkhata/deploy.sh` | SSH forced command: apply pipeline config, adopt the image's compose/Caddyfile, pull, restart, prune |
| `backup.sh` | `/srv/haalkhata/backup.sh` | Nightly encrypted database **and secrets** backup |
| `backup-failure.sh` | `/srv/haalkhata/backup-failure.sh` | Sends a critical backup-failure alert |
| `daemon.json` | `/etc/docker/daemon.json` | Caps log size; enables live-restore |
| `haalkhata-backup*.service`, `haalkhata-backup.timer` | `/etc/systemd/system/` | Runs and monitors `backup.sh` at 03:17 UTC |

## Install

```sh
# Docker logging — do this BEFORE the stack first starts, or the logs it has
# already written stay unrotated.
sudo install -m 644 /srv/haalkhata/ops/daemon.json /etc/docker/daemon.json
sudo systemctl restart docker

# Backups
sudo install -m 700 /srv/haalkhata/ops/backup.sh /srv/haalkhata/backup.sh
sudo install -m 700 /srv/haalkhata/ops/backup-failure.sh /srv/haalkhata/backup-failure.sh
sudo install -m 644 /srv/haalkhata/ops/haalkhata-backup.service /etc/systemd/system/
sudo install -m 644 /srv/haalkhata/ops/haalkhata-backup-failure.service /etc/systemd/system/
sudo install -m 644 /srv/haalkhata/ops/haalkhata-backup.timer   /etc/systemd/system/

# Required: use a monitored HTTPS endpoint where an empty POST means failure.
# Healthchecks.io users should put the check's /fail URL here.
printf '%s\n' 'https://replace-with-your-monitored-failure-endpoint' \
  | sudo tee /srv/haalkhata/backup-alert-url.txt >/dev/null
sudo chmod 600 /srv/haalkhata/backup-alert-url.txt

sudo systemctl daemon-reload
sudo systemctl enable --now haalkhata-backup.timer
# Send one test alert now; success is silent, failure is visible in the journal.
sudo systemctl start haalkhata-backup-failure.service
```

## Secrets

Five files, referenced by `docker-compose.prod.yml`. The app reads them
itself through `*_FILE` variables (the Docker `_FILE` convention); nothing
copies them into the environment.

```
/srv/haalkhata/secrets/session_secret          openssl rand -hex 32
/srv/haalkhata/secrets/session_secret_previous empty (`: > file`) until a planned rotation
/srv/haalkhata/secrets/postgres_password       openssl rand -hex 24
/srv/haalkhata/secrets/openrouter_api_key      from openrouter.ai
/srv/haalkhata/secrets/twilio_api_key_secret   from a restricted Twilio Verify API key
```

Each of these (except `session_secret_previous`, which only exists for
planned rotations) can be **GitHub-managed**: set the matching GitHub secret
(`SESSION_SECRET`, `POSTGRES_PASSWORD`, `COMPATIBLE_AI_API_KEY`,
`TWILIO_API_KEY_SECRET`) and every deploy writes the file over the same
forced-command channel as the `.env` config. Left unset in GitHub, the
value pipes as empty and `deploy.sh` leaves the server's file untouched, so
any secret can stay server-only instead. `deploy.sh` runs as the `deploy`
user, so GitHub-managed secrets need the directory handed over once:

```sh
sudo chown -R deploy:deploy /srv/haalkhata/secrets
sudo chmod 700 /srv/haalkhata/secrets
```

The trade this makes is explicit: anything in GitHub is readable by
whoever can edit workflows in the repo — which is the same set of people
who can already deploy arbitrary code to this server, so the marginal
exposure is small, and registered secrets are masked in workflow logs.
Choose per secret; the mechanism supports both answers.

## Pipeline-managed `.env`

`/srv/haalkhata/.env` is written by `deploy.sh`, never by hand. On every
deploy the workflow pipes these keys over the forced-command channel, sourced
from GitHub repository variables/secrets, and `deploy.sh` validates each one
against its allowlist before touching the file:

| `.env` key | GitHub source | Notes |
|---|---|---|
| `IMAGE_TAG` | the release's commit SHA | Written from the SSH argument |
| `ACME_EMAIL` | Secret `ACME_EMAIL` | Required — the deploy job refuses to run without it; Caddy registers it with the CA for expiry/problem notices. A secret only so the address stays out of public workflow logs; it is not authenticating material |
| `GOOGLE_CLIENT_ID` | Variable `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Same id the browser bundle is built with, by contract |
| `GOOGLE_MOBILE_CLIENT_IDS` | Variable `GOOGLE_MOBILE_CLIENT_IDS` | Optional |
| `TWILIO_API_KEY_SID` | Secret `TWILIO_API_KEY_SID` | Optional; identifies but does not authenticate |
| `TWILIO_VERIFY_SERVICE_SID` | Secret `TWILIO_VERIFY_SERVICE_SID` | Optional |

Authenticating material never lands in `.env`. The same channel also
carries these keys, which `deploy.sh` writes as secret *files* instead
(empty value = file untouched):

| Secret file | GitHub source | Notes |
|---|---|---|
| `secrets/twilio_api_key_secret` | Secret `TWILIO_API_KEY_SECRET` | The authenticating half of the Twilio API key |
| `secrets/openrouter_api_key` | Secret `COMPATIBLE_AI_API_KEY` | Receipt parsing |
| `secrets/session_secret` | Secret `SESSION_SECRET` | Changing it ends every session unless `session_secret_previous` covers the rotation |
| `secrets/postgres_password` | Secret `POSTGRES_PASSWORD` | Rotates the FILE only — see the rotation order below before ever changing it |

The directory is `0700` (owned by `deploy` once GitHub-managed secrets are
in use; `root` on a server provisioned entirely by hand); the files are
`0444`. That looks backwards until you remember the containers run as
non-root (`node` is 1000, `postgres` is 999) and Compose bind-mounts these
with their host permissions — `0400 root:root` would be unreadable and the
stack would refuse to boot. The directory mode is what actually protects
them.

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

The API keys have no second copy anywhere, so they are simpler: write the new
value, `up -d --force-recreate --wait web`, then revoke the old one upstream.

### Rotating `session_secret` — two ways

*Planned* (nobody gets signed out): copy the current key into
`session_secret_previous`, write the new key into `session_secret`,
`up -d --force-recreate --wait web`. Sessions signed under the old key stay
valid until they expire on their own (the session lifetime), and everything
issued from now on uses the new key. Once that lifetime has passed, empty
`session_secret_previous` again (`: > secrets/session_secret_previous`) and
recreate `web` — the old key must not stay accepted indefinitely.

*Break-glass* (suspected token theft): write the new key, make sure
`session_secret_previous` is empty, recreate `web`. Every session ends at
once, including the attacker's.

### Offsite backup retention

`backup.sh` never deletes remote objects. Local archives rotate after 30 days,
but mirroring those deletions would make the offsite copy unable to recover an
older good backup after local corruption or delayed discovery. Configure the
bucket itself with versioning/object lock when available and a lifecycle rule
appropriate to your retention policy (for example, archive after 90 days and
expire after one year). Filesystem/rsync targets need their own snapshot or
retention policy for the same reason.

### Backup failure alerts

`haalkhata-backup.service` invokes `haalkhata-backup-failure.service` whenever
the backup exits unsuccessfully. The handler writes an `auth.crit` journal
event and POSTs to the HTTPS URL in `/srv/haalkhata/backup-alert-url.txt`.
Treat that URL as a secret: it is installed `0600`, is never copied into a
container, and must point to an endpoint someone actually monitors. Re-run
the manual alert command above after changing providers or rotating the URL.

## Restore drill

An untested backup is a hypothesis. Run this once now, and quarterly after.
`backups/` is `0700 root`, so run the drill as root from `/srv/haalkhata`
(`sudo -i`, then `cd /srv/haalkhata`):

```sh
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U haalkhata -d postgres -c 'CREATE DATABASE drill'
age -d -i ~/.age-key.txt backups/haalkhata-<stamp>.dump.age \
  | docker compose -f docker-compose.prod.yml exec -T db \
      pg_restore -U haalkhata -d drill --no-owner

# Row counts should match production.
docker compose -f docker-compose.prod.yml exec -T db psql -U haalkhata -d drill \
  -c 'select count(*) from users' -c 'select count(*) from expenses'

docker compose -f docker-compose.prod.yml exec -T db \
  psql -U haalkhata -d postgres -c 'DROP DATABASE drill'
```

The decrypted dump is streamed directly into `pg_restore`; it is never written
to a predictable path—or to disk at all. The backup service independently uses
a `0077` umask and enforces a root-owned `0700` archive directory, so encrypted
archives and partial files are created as `0600`.

## Rollback

`deploy.sh` accepts any valid commit SHA, so rolling back is one line:

```sh
ssh -i ~/.ssh/haalkhata_deploy deploy@haalkhata.app <previous-sha> </dev/null
```

(`</dev/null` skips the stdin config read — a manual rollback changes code,
not config. An image from before `/opt/release/` existed keeps the server's
current compose/Caddyfile.)

This rolls back **code, not schema**. Migrations apply on boot and are never
reverted, so an older image can find itself talking to a newer schema —
additive migrations are safe, destructive ones are not. One more reason never
to edit an applied migration.
