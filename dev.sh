#!/usr/bin/env bash
# dev.sh — start everything HaalKhata needs for local development.
#
# Assumes ./install-deps.sh has been run at least once (it installs Node,
# pnpm, Docker, buf). This script only STARTS things:
#   1. start the Docker daemon if it's not running (systemctl / Docker Desktop)
#   2. self-heal cheap project state (node_modules, protogen) if missing
#   3. start the Postgres db (docker compose up -d db) and wait for it to be healthy
#   4. start the Next.js dev server in the foreground (pnpm dev, http://127.0.0.1:3000)
#
# Usage:
#   ./dev.sh             start db (if down) + web server in the foreground
#   ./dev.sh --clean      tear down db + drop its volume, then start fresh
#   ./dev.sh --down       stop db (and any compose services)
#   ./dev.sh --help       show this help
#
# Idempotent: re-running won't restart a healthy db. The db keeps running in
# the background after you Ctrl-C the server, so a restart is instant. Use
# --down to stop the db too.

set -euo pipefail

# --- pretty printing -----------------------------------------------------------

readonly RESET=$'\033[0m'
readonly RED=$'\033[31m'
readonly GREEN=$'\033[32m'
readonly YELLOW=$'\033[33m'
readonly BLUE=$'\033[34m'

log()   { printf '%s▸ %s%s %s\n'  "$BLUE"   "$RESET" "$1"; }
ok()    { printf '%s✓ %s%s %s\n' "$GREEN"  "$RESET" "$1"; }
warn()  { printf '%s! %s%s %s\n' "$YELLOW" "$RESET" "$1"; }
die()   { printf '%s✗ %s%s %s\n' "$RED"    "$RESET" "$1" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

ensure_docker_daemon() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi
  log "Docker daemon is not running — starting it…"
  local started=1
  case "$(uname -s)" in
    Linux*)
      # Try non-interactive sudo (passwordless). If that needs a password we
      # bail with a clear message instead of hanging on a prompt or polling
      # for 60s against a daemon that never started.
      if have systemctl; then
        if sudo -n true 2>/dev/null; then
          sudo -n systemctl start docker && started=0 || true
        fi
      elif have service; then
        if sudo -n true 2>/dev/null; then
          sudo -n service docker start && started=0 || true
        fi
      fi
      ;;
    Darwin*)
      open -a Docker 2>/dev/null && started=0 || true
      ;;
  esac

  if [[ $started -ne 0 ]]; then
    cat >&2 <<EOF
${RED}✗${RESET} Could not start the Docker daemon automatically.
    On Linux run:  sudo systemctl start docker
    On macOS open Docker Desktop, then re-run ./dev.sh
EOF
    exit 1
  fi

  # Wait for the daemon to actually respond.
  local attempts=0
  until docker info >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if (( attempts > 24 )); then
      die "Docker daemon didn't come up in 60s. Check 'systemctl status docker' or Docker Desktop."
    fi
    sleep 5
  done
  ok "Docker daemon is running"
}

# --- sanity: system prerequisites present? -------------------------------------
# These are installed by ./install-deps.sh. If missing, point there instead of
# trying to install system packages from this script.

assert_system_ready() {
  local missing=()
  have node   || missing+=(node)
  have pnpm   || missing+=(pnpm)
  have docker || missing+=(docker)
  if (( ${#missing[@]} > 0 )); then
    die "missing system tools: ${missing[*]}.\n    Run './install-deps.sh' first to install them, then re-run './dev.sh'."
  fi

  local major
  major="$(node --version | sed 's/^v//' | cut -d. -f1)"
  if (( major < 20 )); then
    die "Node.js $(node --version) is too old (<20). Run './install-deps.sh' to upgrade."
  fi

  ok "system prerequisites present"
  ensure_docker_daemon
}

# --- self-heal project state ---------------------------------------------------

ensure_project_state() {
  if [[ ! -d node_modules ]] || [[ ! -d apps/web/node_modules ]]; then
    log "node_modules missing — running 'pnpm install'…"
    pnpm install
    ok "installed dependencies"
  fi
  if [[ ! -d packages/protogen/src ]] || [[ -z "$(ls -A packages/protogen/src 2>/dev/null)" ]]; then
    log "packages/protogen/src is empty — running 'pnpm gen'…"
    pnpm gen
    ok "generated protogen TypeScript"
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
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

main() {
  local mode="start"
  case "${1:-}" in
    --clean)  mode="clean" ;;
    --down)   mode="down" ;;
    --help|-h) usage ;;
    "")       mode="start" ;;
    *) die "unknown argument '$1'. Try --help." ;;
  esac

  cd "$(dirname "$0")"

  if [[ "$mode" == "down" ]]; then
    log "stopping compose services…"
    docker compose down --remove-orphans
    ok "stopped. (The web dev server runs in the foreground — Ctrl-C it first if still running.)"
    exit 0
  fi

  assert_system_ready
  ensure_project_state

  if [[ "$mode" == "clean" ]]; then
    clean_db
  fi
  start_db

  echo
  log "starting web dev server — http://127.0.0.1:3000  (Ctrl-C to stop)"
  # Migrations apply automatically on the first /api/connect request via
  # ensureMigrated(). The db keeps running after the server exits; use
  # ./dev.sh --down to stop it too.
  pnpm dev
}

main "$@"
