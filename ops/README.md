# ops/ — production server files

Everything here runs **on the server**, except `docker-entrypoint.sh` and
`deploy-release.sh`, which are baked into the image. They live in git so they
are versioned and reviewable rather than typed into a terminal and forgotten.

Only `deploy.sh` (and the systemd/backup files below) need copying by hand,
and only once. `deploy.sh` is a small launcher: it pulls the image for the
commit it is handed and runs the deploy steps that image carries under
`/opt/release/` (`deploy-release.sh`), next to the compose file and Caddyfile
the image was built with. None of those three is maintained on the server, so
a change to how deploys work, including a new pipeline-managed secret, ships
in an ordinary release (see [Adding a pipeline-managed key](#adding-a-pipeline-managed-key)).

Bootstrap:

```sh
scp -r ops docker-compose.prod.yml Caddyfile deploy@haalkhata.app:/srv/haalkhata/
scp ops/deploy.sh deploy@haalkhata.app:/srv/haalkhata/deploy.sh
```

The second line is also the one manual step if `deploy.sh` itself ever
changes, which it is designed never to need: the forced command cannot update
the file it runs. Keep its contract with `deploy-release.sh` (the commit SHA,
the directory holding the image's `/opt/release`, the client's stdin)
unchanged: a release whose deploy steps expect a different launcher cannot
be deployed, or rolled back to, through the key.

| File | Goes to | Purpose |
|---|---|---|
| `docker-entrypoint.sh` | *in the image* | Exec-only; the app reads `/run/secrets/` itself through `*_FILE` variables |
| `deploy.sh` | `/srv/haalkhata/deploy.sh` | SSH forced command, a fixed launcher: check the SHA, pull the image, run that image's `deploy-release.sh` |
| `deploy-release.sh` | *in the image*, `/opt/release/` | The deploy steps: apply pipeline config, adopt the image's compose/Caddyfile, restart, prune |
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

Eight files, referenced by `docker-compose.prod.yml`. The app reads them
itself through `*_FILE` variables (the Docker `_FILE` convention); nothing
copies them into the environment.

```
/srv/haalkhata/secrets/session_secret          openssl rand -hex 32
/srv/haalkhata/secrets/session_secret_previous empty (`: > file`) until a planned rotation
/srv/haalkhata/secrets/postgres_password       openssl rand -hex 24
/srv/haalkhata/secrets/openrouter_api_key      from openrouter.ai
/srv/haalkhata/secrets/twilio_api_key_secret   from a restricted Twilio Verify API key
/srv/haalkhata/secrets/apple_private_key     original Sign in with Apple .p8
/srv/haalkhata/secrets/apple_token_encryption_key openssl rand -hex 32 (generate once)
/srv/haalkhata/secrets/expo_access_token       Expo access token for sending pushes
```

Each of these (except `session_secret_previous`, which only exists for
planned rotations) can be **GitHub-managed**: set the matching GitHub secret
(`SESSION_SECRET`, `POSTGRES_PASSWORD`, `COMPATIBLE_AI_API_KEY`,
`TWILIO_API_KEY_SECRET`, `APPLE_PRIVATE_KEY`, `APPLE_TOKEN_ENCRYPTION_KEY`,
`EXPO_ACCESS_TOKEN`)
and every deploy writes the file over the same
forced-command channel as the `.env` config. Left unset in GitHub, the
value pipes as empty and the deploy steps leave the server's file untouched,
so any secret can stay server-only instead. Deploys run as the `deploy`
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

`/srv/haalkhata/.env` is written by the deploy steps (`deploy-release.sh`),
never by hand. On every deploy the workflow pipes these keys over the
forced-command channel, sourced from GitHub repository variables/secrets, and
the deploy steps validate each one against their allowlist before touching
the file:

| `.env` key | GitHub source | Notes |
|---|---|---|
| `IMAGE_TAG` | the release's commit SHA | Written from the SSH argument |
| `ACME_EMAIL` | Secret `ACME_EMAIL` | Required — the deploy job refuses to run without it; Caddy registers it with the CA for expiry/problem notices. A secret only so the address stays out of public workflow logs; it is not authenticating material |
| `GOOGLE_CLIENT_ID` | Variable `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Same id the browser bundle is built with, by contract |
| `GOOGLE_MOBILE_CLIENT_IDS` | Variable `GOOGLE_MOBILE_CLIENT_IDS` | Optional |
| `APPLE_TEAM_ID` | Variable `APPLE_TEAM_ID` | Apple developer team identifier |
| `APPLE_KEY_ID` | Variable `APPLE_KEY_ID` | Sign in with Apple signing key identifier |
| `APPLE_SERVICE_ID` | Variable `APPLE_SERVICE_ID` | Grouped web Services ID |
| `APPLE_APP_ID_PREFIX` | Variable `APPLE_APP_ID_PREFIX` | Only when the App ID prefix differs from the Team ID |
| `SUPPORT_EMAIL` | Variable `SUPPORT_EMAIL` | Required monitored public support mailbox |
| `ANDROID_SHA256_CERTIFICATES` | Variable `ANDROID_SHA256_CERTIFICATES` | Android signing fingerprints, when releasing Android |
| `TWILIO_API_KEY_SID` | Secret `TWILIO_API_KEY_SID` | Optional; identifies but does not authenticate |
| `TWILIO_VERIFY_SERVICE_SID` | Secret `TWILIO_VERIFY_SERVICE_SID` | Optional |

Authenticating material never lands in `.env`. The same channel also
carries these keys, which the deploy steps write as secret *files* instead
(empty value = file untouched):

| Secret file | GitHub source | Notes |
|---|---|---|
| `secrets/twilio_api_key_secret` | Secret `TWILIO_API_KEY_SECRET` | The authenticating half of the Twilio API key |
| `secrets/openrouter_api_key` | Secret `COMPATIBLE_AI_API_KEY` | Receipt parsing |
| `secrets/session_secret` | Secret `SESSION_SECRET` | Changing it ends every session unless `session_secret_previous` covers the rotation |
| `secrets/postgres_password` | Secret `POSTGRES_PASSWORD` | Rotates the FILE only — see the rotation order below before ever changing it |
| `secrets/apple_private_key` | Secret `APPLE_PRIVATE_KEY` | Original multiline `.p8`; CI encodes it for transport, the server validates and decodes it |
| `secrets/apple_token_encryption_key` | Secret `APPLE_TOKEN_ENCRYPTION_KEY` | Generate once with `openssl rand -hex 32`; CI refuses to replace a different installed key |

The directory is `0700` (owned by `deploy` once GitHub-managed secrets are
in use; `root` on a server provisioned entirely by hand); the files are
`0444`. That looks backwards until you remember the containers run as
non-root (`node` is 1000, `postgres` is 999) and Compose bind-mounts these
with their host permissions — `0400 root:root` would be unreadable and the
stack would refuse to boot. The directory mode is what actually protects
them.

### Adding a pipeline-managed key

Everything that decides which keys a deploy accepts ships in the image, so a
new key is one pull request and one release, with nothing done on the server:

1. **Workflow** (`.github/workflows/deploy.yml`): an `env:` entry from the
   GitHub secret or variable, and a `printf` line that pipes it.
2. **Deploy steps** (`ops/deploy-release.sh`): add the key to the matching
   allowlist (`.env` values or secret files). A secret also gets a line naming
   its file under `secrets/`.
3. **Compose file** (`docker-compose.prod.yml`): for a secret, a top-level
   `secrets:` entry, the service's `secrets:` list and a `*_FILE` variable;
   for an `.env` key, the `${KEY}` it is read through.
4. **App**: read a secret through `readSecret()`.

The release's own deploy steps accept the key its own workflow sends. A
deploy refuses a key it does not know, and an older release (a rollback) is
deployed with nothing on stdin, so it never sees the new key. Set the GitHub
secret before publishing: until it is set the value pipes as empty, and if the
compose file needs a secret file the server does not have yet, the dry-run
refuses the release with the old stack still running.

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
matching the public privacy policy: expire every archive and old object version
within 31 days. Filesystem/rsync targets need an equivalent scheduled expiry.
Verify expiry before publishing the mobile app; a restored archive must also
reapply account deletions and moderation actions recorded since its creation.

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
not config. The older release brings its own deploy steps, compose file and
Caddyfile with it. Images built before the launcher carry no deploy steps, so
the launcher refuses them; rollback reaches the releases built since.)

This rolls back **code, not schema**. Migrations apply on boot and are never
reverted, so an older image can find itself talking to a newer schema —
additive migrations are safe, destructive ones are not. One more reason never
to edit an applied migration.

## Apple sign-in release configuration

Before deploying the mobile release, enable Sign in with Apple on the primary
App ID `com.haalkhata.app`. Group a web Services ID with this App ID, authorize
`haalkhata.app`, and register
`https://haalkhata.app/api/auth/apple/callback` as its return URL. Native iOS
uses the App ID; web and Android use the grouped Services ID.

Set repository variables `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_SERVICE_ID`.
In GitHub **Settings → Secrets and variables → Actions → Secrets**, add:

- `APPLE_PRIVATE_KEY`: the entire original multiline PKCS#8 `.p8` downloaded
  from Apple, including its BEGIN/END lines. Do not base64-encode it yourself.
- `APPLE_TOKEN_ENCRYPTION_KEY`: the output of `openssl rand -hex 32`, generated
  **once** and backed up securely. If the server already has this key, use that
  exact existing value. Do not generate a new one for each deploy.

The deploy job sends both over the existing restricted SSH connection. It
masks the base64 transport value as well as the original key; the server
validates the P-256 signing key and writes the two mounted secret files. A
different encryption key fails deployment before replacing that key, because
stored provider grants must stay decryptable for revocation. Session-key
rotations do not affect it. Intentional rotation needs a separate ciphertext
migration. Leaving either GitHub secret unset preserves its installed file.

On a server with the fixed launcher installed, no additional SSH step or
manual Apple-key upload is needed: the handlers live in the image's
`ops/deploy-release.sh`. Publishing a release or manually running Deploy
applies the GitHub secrets; simply saving them or pushing a commit does not
deploy. New hosts still need the initial launcher and secrets-directory
ownership described in the bootstrap instructions above.

Both secrets stay out of Git, Docker build arguments, EAS variables, and the
server `.env`. A server-only installation is still supported using the same
file ownership and permissions as the other secrets.

The production stack requires these values and readiness checks signing and
encryption. Browser redirects carry one-use state; the initiating client must
prove possession of its private verifier to receive a session. Local native
API calls continue to carry bearer sessions, and the web receives HttpOnly
cookies. No Apple private key or refresh token reaches a client bundle.

## Push notifications

The server sends pushes through the Expo Push Service; Expo holds the Apple
push key, so this server holds one secret, `expo_access_token`. Readiness
fails in production without it, and the compose dry-run refuses a release
whose secret file is missing — so set it up **before** publishing the
release that introduces it:

1. On expo.dev, in the HaalKhata project's settings, turn on **Enhanced
   Security for Push Notifications**. From then on Expo refuses a send
   without an access token, so a leaked phone token is useless to anyone
   else.
2. Create an access token (Account settings → Access tokens; a robot user
   keeps it independent of a person) and store it as the GitHub secret
   `EXPO_ACCESS_TOKEN`, or write it to
   `/srv/haalkhata/secrets/expo_access_token` by hand.
3. From `apps/mobile`, run `eas credentials -p ios`, choose production, and
   set up a push key (EAS creates the APNs `.p8` key in the Apple account and
   uploads it to Expo). Regenerate the App Store profile so it carries the
   Push Notifications capability, then build and submit a new binary.

To rotate the token: create a new one, update the GitHub secret, deploy, then
revoke the old token on expo.dev. A failed send logs `push credentials refused`
or `push batch failed` and is retried for up to an hour; the in-app bell is
unaffected. See `docs/local-push-notifications.md` for the local flow.

## Mobile public endpoints

Set repository variable `SUPPORT_EMAIL` to a monitored mailbox. Set
`APPLE_APP_ID_PREFIX` only when the registered App ID prefix differs from the
Team ID. For Android verified links, set `ANDROID_SHA256_CERTIFICATES` to the
comma-separated, colon-delimited SHA-256 fingerprints of the actual app signing
certificates (including Play App Signing when used).

After deployment verify `/privacy`, `/support`, `/api/mobile-release`, and
`/.well-known/apple-app-site-association` over HTTPS. Android additionally needs
`/.well-known/assetlinks.json`. These URLs are public and must not redirect to
login. Store EAS builds query `/api/mobile-release` before compilation and fail
when Apple configuration or the native Google audience is missing.

## Content moderation

Install `ops/moderate.sh` alongside the server ops scripts. Review the private
queue at least daily and respond to safety reports promptly (target: within 24
hours). The console reads the matching SQL from the deployed image; it uses the
internal Postgres connection and exposes no public moderator endpoint.

```sh
./ops/moderate.sh list
./ops/moderate.sh remove REPORT_UUID   # redact content; shared cents stay intact
./ops/moderate.sh dismiss REPORT_UUID  # close a reviewed, non-actionable report
./ops/moderate.sh suspend REPORT_UUID  # revoke sessions and refuse new authenticated requests
./ops/moderate.sh resume REPORT_UUID   # restore access after review; old sessions stay invalid
```

Keep queue output private. Block controls work despite outstanding balances and
do not remove financial history. A basic automatic text filter rejects known
slurs/threats before sharing; human moderation handles evasion, images, context,
and other reported content. Maintain the monitored support mailbox, review the
queue, and keep a private record of decisions so they can be reapplied after a
backup restore.
