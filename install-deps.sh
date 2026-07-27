#!/usr/bin/env bash
# install-deps.sh — install everything needed to run HaalKhata on a fresh box.
#
# Installs (skipping anything already present):
#   1. Node.js 24 (via NodeSource apt repo on Linux, Homebrew on macOS)
#   2. pnpm 11.9.0 (the packageManager pinned in package.json)
#   3. Docker Engine + compose plugin (via the official get.docker.com script on Linux;
#      macOS prints instructions for Docker Desktop)
#   4. buf CLI (npm global — also available as a workspace devDependency)
#   5. JDK 17 (for Android Gradle builds — openjdk-17 on Linux, temurin@17 on macOS)
#   6. Android SDK (verified via ANDROID_HOME or common install paths; prints
#      instructions if missing — install Android Studio manually)
#   7. Workspace npm dependencies (pnpm install)
#   8. Generated protobuf TypeScript (pnpm gen → packages/protogen/src)
#   9. apps/mobile native modules verified against Expo SDK (expo install --check)
#   10. .env copied from .env.example (repo root) if absent
#
# Usage:
#   ./install-deps.sh           install everything that's missing
#   ./install-deps.sh --help    show this help
#
# System installs (Node, Docker) need sudo on Linux. The script will prompt for
# the sudo password when it actually needs to run a privileged command; it does
# NOT run an interactive shell as root.

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

# --- helpers -------------------------------------------------------------------

have() { command -v "$1" >/dev/null 2>&1; }

# Run a command with sudo. Tries passwordless sudo first; if that needs a
# password, prompts ONCE via `sudo` (which has a TTY when run from a shell).
# When there's no TTY at all (CI), the passwordless attempt fails and we print
# a clear error instead of hanging.
sudo_if_needed() {
  if [[ $EUID -eq 0 ]]; then
    "$@"
  elif sudo -n true 2>/dev/null; then
    sudo -n "$@"
  elif [[ -t 1 ]]; then
    sudo "$@"
  else
    die "this step needs sudo but there's no TTY for a password. Re-run ./install-deps.sh from an interactive shell, or pre-authenticate with 'sudo -v'."
  fi
}

os_name() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "macos" ;;
    *)       echo "unknown" ;;
  esac
}

# --- 1. Node.js ----------------------------------------------------------------

install_node() {
  local os
  os="$(os_name)"
  if have node; then
    local major
    major="$(node --version | sed 's/^v//' | cut -d. -f1)"
    if (( major >= 20 )); then
      ok "Node.js $(node --version) already installed"
      return 0
    fi
    warn "Node.js $(node --version) is too old (<20); installing Node 24"
  fi

  log "Installing Node.js 24…"
  case "$os" in
    linux)
      if have apt-get; then
        curl -fsSL https://deb.nodesource.com/setup_24.x | sudo_if_needed -E bash - >/dev/null
        sudo_if_needed apt-get install -y nodejs
      else
        die "Unsupported Linux distro (no apt-get). Install Node.js 24 manually: https://nodejs.org/en/download"
      fi
      ;;
    macos)
      have brew || die "Homebrew not found. Install it from https://brew.sh and re-run."
      brew install node@24
      brew link --overwrite --force node@24
      ;;
    *)
      die "Unsupported OS for Node.js install. Do it manually: https://nodejs.org/en/download"
      ;;
  esac
  ok "installed Node.js $(node --version)"
}

# --- 2. pnpm -------------------------------------------------------------------

install_pnpm() {
  # corepack ships with Node and can pin pnpm to the packageManager version.
  if have corepack; then
    log "Enabling pnpm via corepack…"
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@11.9.0 --activate >/dev/null 2>&1 || true
  fi
  if ! have pnpm; then
    log "corepack didn't put pnpm on PATH; installing globally via npm…"
    npm install -g pnpm@11.9.0
  fi
  ok "pnpm $(pnpm --version) ready"
}

# --- 3. Docker -----------------------------------------------------------------

install_docker() {
  if have docker && docker info >/dev/null 2>&1; then
    ok "Docker $(docker --version | awk '{print $3}' | tr -d ,) already installed and running"
    return 0
  fi

  local os
  os="$(os_name)"
  case "$os" in
    linux)
      if have docker; then
        warn "Docker is installed but the daemon isn't reachable. Starting it…"
        sudo_if_needed systemctl start docker 2>/dev/null || sudo_if_needed service docker start 2>/dev/null || true
        sudo_if_needed usermod -aG docker "$USER" 2>/dev/null || true
        if ! docker info >/dev/null 2>&1; then
          warn "Docker daemon still not reachable. Run 'newgrp docker' or re-open your shell, then re-run this script."
          return 0
        fi
        ok "Docker daemon started"
        return 0
      fi
      log "Installing Docker Engine via the official convenience script…"
      curl -fsSL https://get.docker.com | sudo_if_needed sh
      sudo_if_needed systemctl enable --now docker
      sudo_if_needed usermod -aG docker "$USER" 2>/dev/null || true
      warn "Added '$USER' to the docker group. Log out and back in (or run 'newgrp docker') if 'docker' still needs sudo."
      if ! docker info >/dev/null 2>&1; then
        warn "Docker installed but needs a group refresh. Run 'newgrp docker' or re-open your shell, then re-run this script."
      else
        ok "Docker installed and running"
      fi
      ;;
    macos)
      if have docker; then
        warn "Docker is installed but the daemon isn't reachable. Starting Docker Desktop…"
        open -a Docker 2>/dev/null || true
        local attempts=0
        until docker info >/dev/null 2>&1; do
          attempts=$((attempts + 1))
          if (( attempts > 24 )); then
            die "Docker Desktop didn't come up in 60s. Open it manually and re-run."
          fi
          sleep 5
        done
        ok "Docker Desktop is running"
        return 0
      fi
      die "Docker Desktop is not installed. Install it manually from https://www.docker.com/products/docker-desktop, start it, then re-run this script."
      ;;
    *)
      die "Unsupported OS for Docker install. Install Docker manually: https://docs.docker.com/engine/install/"
      ;;
  esac
}

# --- 4. buf --------------------------------------------------------------------

install_buf() {
  if have buf && buf --version >/dev/null 2>&1; then
    ok "buf $(buf --version) already installed"
    return 0
  fi
  log "Installing buf CLI globally via npm…"
  npm install -g @bufbuild/buf
  ok "buf $(buf --version) ready"
}

# --- 5. JDK 17 -----------------------------------------------------------------

# Resolve the major version from `java -version`. Handles both modern
# ("17.0.1") and legacy ("1.8.0") version strings.
# @param $1  the first line of `java -version` output
# @returns 0 and echoes the major version number
java_major_version() {
  local ver="$1"
  local major
  major="$(printf '%s' "$ver" | sed 's/.*"\([0-9]*\)\.\([0-9]*\)\..*/\1/')"
  if [[ "$major" == "1" ]]; then
    major="$(printf '%s' "$ver" | sed 's/.*"\([0-9]*\)\.\([0-9]*\)\..*/\2/')"
  fi
  printf '%s' "$major"
}

install_java() {
  local os
  os="$(os_name)"

  if have java; then
    local ver major
    ver="$(java -version 2>&1 | head -1)"
    major="$(java_major_version "$ver")"
    if (( major >= 17 )); then
      ok "JDK $major already installed ($(printf '%s' "$ver" | sed 's/^.*version "//; s/".*//'))"
      return 0
    fi
    warn "JDK $major is too old (<17, required by Android Gradle Plugin); installing JDK 17"
  fi

  log "Installing JDK 17…"
  case "$os" in
    linux)
      if have apt-get; then
        sudo_if_needed apt-get update -qq
        sudo_if_needed apt-get install -y openjdk-17-jdk
      else
        die "Unsupported Linux distro (no apt-get). Install OpenJDK 17 manually: https://adoptium.net/"
      fi
      ;;
    macos)
      have brew || die "Homebrew not found. Install it from https://brew.sh and re-run."
      brew install --cask temurin@17
      ;;
    *)
      die "Unsupported OS for JDK install. Install OpenJDK 17 manually: https://adoptium.net/"
      ;;
  esac

  ver="$(java -version 2>&1 | head -1)"
  ok "installed JDK ($(printf '%s' "$ver" | sed 's/^.*version "//; s/".*//'))"

  if [[ -z "${JAVA_HOME:-}" ]]; then
    warn "JAVA_HOME is not set. The dev.sh script resolves it automatically, but"
    warn "for other tooling add it to your shell profile (~/.bashrc / ~/.zshrc)."
  fi
}

# --- 6. Android SDK ------------------------------------------------------------

# Verify the Android SDK is installed. Checks ANDROID_HOME / ANDROID_SDK_ROOT
# env vars, then common install paths. This is warning-only (not fatal) —
# the SDK is too large to install silently and requires Android Studio.
check_android_sdk() {
  if [[ -n "${ANDROID_HOME:-}" ]] && [[ -x "${ANDROID_HOME}/platform-tools/adb" ]]; then
    ok "Android SDK found (ANDROID_HOME=${ANDROID_HOME})"
    return 0
  fi
  if [[ -n "${ANDROID_SDK_ROOT:-}" ]] && [[ -x "${ANDROID_SDK_ROOT}/platform-tools/adb" ]]; then
    ok "Android SDK found (ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT})"
    return 0
  fi

  local sdk_path
  for sdk_path in \
    "$HOME/Android/Sdk" \
    "$HOME/Library/Android/sdk" \
    "/opt/android-sdk"; do
    if [[ -x "$sdk_path/platform-tools/adb" ]]; then
      ok "Android SDK found at $sdk_path"
      warn "Set ANDROID_HOME=$sdk_path in your shell profile (~/.bashrc / ~/.zshrc) for best results."
      return 0
    fi
  done

  warn "Android SDK not found. To use --mobile-android, install Android Studio:"
  warn "    https://developer.android.com/studio"
  warn "Then re-run './install-deps.sh' to verify."
}

# --- 7 & 8. workspace deps + protogen ------------------------------------------

install_workspace() {
  cd "$(dirname "$0")"

  if [[ ! -f pnpm-lock.yaml ]]; then
    log "pnpm-lock.yaml missing — generating it with 'pnpm install'…"
  fi
  if [[ ! -d node_modules ]] || [[ ! -d apps/web/node_modules ]]; then
    log "Installing workspace dependencies (pnpm install)…"
    pnpm install
    ok "workspace dependencies installed"
  else
    ok "node_modules already present"
  fi

  if [[ ! -d packages/protogen/src ]] || [[ -z "$(ls -A packages/protogen/src 2>/dev/null)" ]]; then
    log "Generating protobuf TypeScript (pnpm gen)…"
    pnpm gen
    ok "generated packages/protogen/src"
  else
    ok "packages/protogen/src already generated"
  fi
}

# --- 9. mobile native module check ---------------------------------------------

check_mobile_deps() {
  cd "$(dirname "$0")"
  if [[ ! -d apps/mobile ]]; then
    return 0
  fi
  log "Verifying apps/mobile native modules against Expo SDK (expo install --check)…"
  if (cd apps/mobile && pnpm exec expo install --check); then
    ok "apps/mobile native modules are SDK-compatible"
  else
    warn "expo install --check reported an issue — run 'pnpm --filter @haalkhata/mobile exec expo install --check' to fix, then re-run ./install-deps.sh"
  fi
}

# --- 10. .env file -------------------------------------------------------------

# One .env at the repo root serves both runtimes: docker compose reads it
# directly, and `pnpm dev` loads it via node --env-file-if-exists.
setup_env_files() {
  cd "$(dirname "$0")"
  if [[ ! -f .env ]] && [[ -f .env.example ]]; then
    cp .env.example .env
    ok "created .env from .env.example (edit it to set POSTGRES_PASSWORD + SESSION_SECRET for prod)"
  elif [[ -f .env ]]; then
    ok ".env already exists"
  fi
}

# --- main ----------------------------------------------------------------------

usage() {
  sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

main() {
  case "${1:-}" in
    --help|-h) usage ;;
    "")        ;;
    *) die "unknown argument '$1'. Try --help." ;;
  esac

  log "Installing HaalKhata dependencies on $(os_name)…"
  install_node
  install_pnpm
  install_docker
  install_buf
  install_java
  check_android_sdk
  install_workspace
  check_mobile_deps
  setup_env_files

  echo
  ok "all set. Run './dev.sh' to start the database and web server."
  printf "       (add --mobile-android or --mobile-ios to also boot the emulator/simulator,\n"
  printf "        build+install the dev client, and start Metro alongside the web server)\n"
}

main "$@"
