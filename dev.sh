#!/usr/bin/env bash
# dev.sh — one-command local dev: check prerequisites, start Postgres, start the web server.
#
# Usage:
#   ./dev.sh             start db (if down) + web server in the foreground
#   ./dev.sh --clean      tear down db + drop its volume, then start fresh
#   ./dev.sh --down       stop db + web server (web via Ctrl-C in the foreground)
#   ./dev.sh --help       show this help
#
# The script is idempotent: re-running it won't restart a healthy db. It uses
# the compose `db` service (postgres:17-alpine on 127.0.0.1:5432) and runs
# `pnpm dev` on the host so the app can hot-reload.

set -euo pipefail

# --- pretty printing -----------------------------------------------------------

readonly RESET=$'\033[0m'
readonly BOLD=$'\033[1m'
readonly RED=$'\033[31m'
readonly GREEN=$'\033[32m'
readonly YELLOW=$'\033[33m'
readonly BLUE=$'\033[34m'

log()   { printf '%s▸ %s%s %s\n'  "$BLUE"   "$RESET" "$1"; }
ok()    { printf '%s✓ %s%s %s\n' "$GREEN"  "$RESET" "$1"; }
warn()  { printf '%s! %s%s %s\n' "$YELLOW" "$RESET" "$1"; }
die()   { printf '%s✗ %s%s %s\n' "$RED"    "$RESET" "$1" >&2; exit 1; }

# --- prerequisite checks -------------------------------------------------------

check_command() {
  local cmd="$1"
  local hint="${2:-}"
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "found $cmd ($(command -v "$cmd"))"
    return 0
  fi
  if [[ -n "$hint" ]]; then
    die "missing dependency '$cmd'. $hint"
  fi
  die "missing dependency '$cmd'. Please install it and re-run."
}

# buf ships as a workspace devDependency (invoked via `pnpm exec buf`), so the
# raw `buf` binary may not be on PATH. Check the pnpm-exec path as a fallback.
check_buf() {
  if command -v buf >/dev/null 2>&1; then
    ok "found buf ($(command -v buf))"
    return 0
  fi
  if pnpm exec buf --version >/dev/null 2>&1; then
    ok "found buf (via 'pnpm exec buf', $(pnpm exec buf --version))"
    return 0
  fi
  die "missing dependency 'buf'. Install it: 'npm install -g @bufbuild/buf' or 'pnpm install' to get the workspace devDependency."
}

prereqs() {
  log "Checking prerequisites…"
  check_command pnpm "Install pnpm: 'npm install -g pnpm@11.9.0' (see package.json packageManager)."
  check_command node "Install Node.js 24 (the Dockerfile uses node:24-alpine)."
  check_command docker "Install Docker Desktop or the Docker engine + compose plugin."
  check_buf

  local node_version
  node_version="$(node --version | sed 's/^v//' | cut -d. -f1)"
  if (( node_version < 20 )); then
    die "Node.js $node_version is too old — use Node 20 or newer (24 recommended)."
  fi
  ok "Node.js $(node --version) is recent enough"

  if ! docker info >/dev/null 2>&1; then
    die "Docker daemon is not running. Start Docker Desktop or 'systemctl start docker' and re-run."
  fi
  ok "Docker daemon is running"

  if [[ ! -f pnpm-lock.yaml ]]; then
    die "pnpm-lock.yaml missing — run 'pnpm install' first to generate the lockfile."
  fi
  ok "pnpm-lock.yaml present"
}

# --- generated-code check ------------------------------------------------------

ensure_protogen() {
  if [[ ! -d packages/protogen/src ]] || [[ -z "$(ls -A packages/protogen/src 2>/dev/null)" ]]; then
    log "packages/protogen/src is empty — running 'pnpm gen'…"
    pnpm gen
    ok "generated protogen TypeScript"
  else
    ok "packages/protogen/src already generated"
  fi
}

# --- dependencies --------------------------------------------------------------

ensure_deps() {
  if [[ ! -d node_modules ]] || [[ ! -d apps/web/node_modules ]]; then
    log "node_modules missing — running 'pnpm install'…"
    pnpm install
    ok "installed dependencies"
  else
    ok "node_modules present"
  fi
}

# --- db lifecycle --------------------------------------------------------------

db_is_healthy() {
  docker compose ps db --format json 2>/dev/null \
    | grep -q '"Health":"healthy"' 2>/dev/null || return 1
}

start_db() {
  if db_is_healthy; then
    ok "db already healthy"
    return 0
  fi
  log "starting compose db service…"
  docker compose up -d db
  log "waiting for db to be healthy…"
  local attempts=0
  until db_is_healthy; do
    attempts=$((attempts + 1))
    if (( attempts > 30 )); then
      die "db did not become healthy in 150s. Check 'docker compose logs db'."
    fi
    sleep 5
  done
  ok "db is healthy (127.0.0.1:5432)"
}

clean_db() {
  warn "tearing down db and deleting its volume — all local data will be lost"
  docker compose down -v --remove-orphans
  ok "removed db container + db-data volume"
}

# --- main ----------------------------------------------------------------------

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

main() {
  local mode="start"
  case "${1:-}" in
    --clean) mode="clean" ;;
    --down)  mode="down" ;;
    --help|-h) usage ;;
    "")      mode="start" ;;
    *) die "unknown argument '$1'. Try --help." ;;
  esac

  cd "$(dirname "$0")"

  if [[ "$mode" == "down" ]]; then
    log "stopping compose services…"
    docker compose down --remove-orphans
    ok "stopped. (The web dev server was running in the foreground — Ctrl-C it if needed.)"
    exit 0
  fi

  prereqs
  ensure_deps
  ensure_protogen

  if [[ "$mode" == "clean" ]]; then
    clean_db
  fi
  start_db

  log "starting web dev server (pnpm dev) — Ctrl-C to stop"
  # `pnpm dev` runs next dev on 127.0.0.1:3000. Migrations apply automatically
  # on the first request to /api/connect/*. The db keeps running in the
  # background; this script does NOT stop it when the server exits, so a
  # restart is instant. Use ./dev.sh --down to stop the db too.
  pnpm dev
}

main "$@"
