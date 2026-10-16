#!/usr/bin/env bash
# dev.sh — start everything HaalKhata needs for local development.
#
# Assumes ./install-deps.sh has been run at least once (it installs Node,
# pnpm and Docker; buf comes from the workspace's devDependencies). This
# script prepares configuration and starts the local stack:
#   1. start the Docker daemon if it's not running (systemctl / Docker Desktop)
#   2. synchronize all workspace dependencies with the lockfile and regenerate API types
#      quietly prepare .env and require the local database password
#   3. start the Postgres db (docker compose up -d db) and wait for it to be healthy
#   4. apply pending migrations; report success or stop with the failure
#   5. start the Next.js dev server in the foreground (pnpm dev, http://127.0.0.1:3000)
#      (with --mobile-android / --mobile-ios, also: boot emulator/simulator,
#       rebuild the dev client if missing or incompatible, start Metro, launch the app)
#
# Usage:
#   ./dev.sh                   start db (if down) + web server in the foreground
#   ./dev.sh --lan             also listen on the LAN, for a phone on the same Wi-Fi
#   ./dev.sh --clean           tear down db + drop its volume, then start fresh
#   ./dev.sh --down            stop db (and any compose services)
#   ./dev.sh --mobile-android  ensure emulator + dev client, start Metro, launch app
#   ./dev.sh --mobile-ios      ensure simulator + dev client, start Metro, launch app
#   ./dev.sh --help            show this help
#
# Idempotent: re-running won't restart a healthy db. The db keeps running in
# the background after you Ctrl-C the server and is reused on the next run.
# Use --down to stop the db too. A web dev server this checkout already has
# running (another ./dev.sh in another terminal) is reused, not started twice;
# with --mobile-* Metro then holds the foreground. This is checked before
# anything slow, and a server that cannot serve the run (loopback-only for
# --mobile-android or --lan, or not on port 3000 for the app) stops it there.

set -euo pipefail

readonly PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$PROJECT_ROOT/scripts/macos-env.sh"

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
  if (( major < 24 )); then
    die "Node.js $(node --version) is too old (<24). Run './install-deps.sh' to upgrade."
  fi

  ok "system prerequisites present"
  ensure_docker_daemon
}

# --- self-heal project state ---------------------------------------------------

# Existing folders may contain a partial install or an older API contract after
# pulling code. Let pnpm reconcile every workspace and always regenerate types.
# @returns 0 when dependencies and generated APIs are ready; exits on failure.
ensure_project_state() {
  log "synchronizing workspace dependencies with pnpm-lock.yaml…"
  if ! pnpm install --frozen-lockfile; then
    die "workspace dependency installation failed; startup stopped. Fix the pnpm error above, then rerun ./dev.sh."
  fi
  ok "workspace dependencies ready"

  log "generating API types from the current protobuf contract…"
  if ! pnpm gen; then
    die "API type generation failed; startup stopped. Fix the generator error above, then rerun ./dev.sh."
  fi
  ok "generated API types ready"
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

# Apply migrations through the same environment and database path as the API.
# Stops startup before web/Metro/device work if the schema cannot be prepared.
prepare_db() {
  log "checking and applying database migrations…"
  if ! pnpm --filter @haalkhata/web exec node --import tsx scripts/prepare-database.mts; then
    die "database migrations failed; web and mobile startup stopped. Fix the error above, then rerun ./dev.sh."
  fi
  ok "database migrations passed"
}

# --- mobile lifecycle ----------------------------------------------------------
# The --mobile-android / --mobile-ios flags do the full end-to-end flow:
#   1. ensure an emulator/simulator is booted (start one if none)
#   2. verify native compatibility and rebuild a missing or outdated dev client
#   3. start Metro in the background
#   4. launch the app on the device
#   5. fall through to the web dev server in the foreground
# An EXIT trap kills Metro when the web server exits or you Ctrl-C.

MOBILE_PID=""
METRO_PORT=8081

# @param $1 Native platform; $2 identity of the currently installed binary.
# @returns 0 only for a successfully built, installed and compatible dev client.
native_build_matches() {
  [[ -n "$2" ]] || return 1
  local state
  state="$(node apps/mobile/scripts/native-build.mjs check "$1" "$2")" \
    || die "could not check native build compatibility; startup stopped. See the error above."
  [[ "$state" == "current" ]]
}

# Record compatibility only after compilation and installation both succeed.
# @param $1 Native platform; $2 installation identity; $3 pre-compilation fingerprint.
# @returns 0 after recording unchanged native inputs; exits if inputs changed during compilation.
record_native_build() {
  node apps/mobile/scripts/native-build.mjs record "$1" "$2" "$3" \
    || die "could not record the installed native build; startup stopped. See the error above."
}

# Capture native inputs after prebuild/package installation but before compilation.
# @param $1 Native platform. @returns The native compatibility hash.
native_build_snapshot() {
  node apps/mobile/scripts/native-build.mjs fingerprint "$1" \
    || die "could not snapshot native build inputs; startup stopped."
}

# Kill any process listening on the Metro port. This handles stale Metro
# instances from a previous run that was killed without the EXIT trap firing
# (e.g. kill -9, OOM, or a crashed parent shell).
kill_stale_metro() {
  local pids=""
  if have lsof; then
    pids="$(lsof -tiTCP:"$METRO_PORT" -sTCP:LISTEN 2>/dev/null || true)"
  elif have fuser; then
    pids="$(fuser "$METRO_PORT"/tcp 2>/dev/null || true)"
  elif have ss; then
    pids="$(ss -tlnp "sport = :$METRO_PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 || true)"
  fi
  if [[ -n "$pids" ]]; then
    warn "killing stale process(es) on port $METRO_PORT: $(echo $pids | tr '\n' ' ')"
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 1
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
}

cleanup_mobile() {
  if [[ -n "$MOBILE_PID" ]]; then
    warn "stopping Metro bundler (PID $MOBILE_PID)…"
    kill "$MOBILE_PID" 2>/dev/null || true
    pkill -P "$MOBILE_PID" 2>/dev/null || true
    wait "$MOBILE_PID" 2>/dev/null || true
    MOBILE_PID=""
    # Clean up listeners left by this script's background process tree.
    kill_stale_metro
  fi
}
trap cleanup_mobile EXIT

# --- Android helpers -----------------------------------------------------------

# Locate the adb binary. Checks ANDROID_HOME / ANDROID_SDK_ROOT, then common
# install paths, then PATH.
# @returns 0 and echoes the adb path, or returns 1 if not found.
find_adb() {
  local candidate
  for candidate in \
    "${ANDROID_HOME:-}/platform-tools/adb" \
    "${ANDROID_SDK_ROOT:-}/platform-tools/adb" \
    "$HOME/Android/Sdk/platform-tools/adb" \
    "$HOME/Library/Android/sdk/platform-tools/adb"; do
    [[ -n "$candidate" && -x "$candidate" ]] && { printf '%s' "$candidate"; return 0; }
  done
  if have adb; then printf 'adb'; return 0; fi
  return 1
}

# Locate the emulator binary. Same search order as find_adb.
# @returns 0 and echoes the emulator path, or returns 1 if not found.
find_emulator() {
  local candidate
  for candidate in \
    "${ANDROID_HOME:-}/emulator/emulator" \
    "${ANDROID_SDK_ROOT:-}/emulator/emulator" \
    "$HOME/Android/Sdk/emulator/emulator" \
    "$HOME/Library/Android/sdk/emulator/emulator"; do
    [[ -n "$candidate" && -x "$candidate" ]] && { printf '%s' "$candidate"; return 0; }
  done
  if have emulator; then printf 'emulator'; return 0; fi
  return 1
}

# Resolve JAVA_HOME for Gradle. Checks (in order): the env var, Android
# Studio's bundled JBR, common system paths, and finally derives it from
# `java -version`. Exports JAVA_HOME as a side effect.
# @returns 0 on success, dies with a clear message if no JDK 17+ is found.
ensure_java_home() {
  if [[ -n "${JAVA_HOME:-}" ]] && [[ -x "${JAVA_HOME}/bin/java" ]]; then
    return 0
  fi

  local candidate
  for candidate in \
    "/opt/android-studio/jbr" \
    "/opt/android-studio/jre" \
    "$HOME/.android-studio/jbr" \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "/usr/lib/jvm/java-17-openjdk-amd64" \
    "/usr/lib/jvm/java-17-openjdk-arm64" \
    "/usr/lib/jvm/java-21-openjdk-amd64" \
    "/usr/lib/jvm/java-21-openjdk-arm64" \
    "/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home" \
    "/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home" \
    "/Library/Java/JavaVirtualMachines/openjdk-17.jdk/Contents/Home" \
    "/Library/Java/JavaVirtualMachines/openjdk-21.jdk/Contents/Home"; do
    if [[ -x "$candidate/bin/java" ]]; then
      export JAVA_HOME="$candidate"
      return 0
    fi
  done

  if have java; then
    local java_directory
    java_directory="$(java -XshowSettings:properties -version 2>&1 \
      | sed -n 's/.*java.home = \(.*\)/\1/p' | head -1)"
    if [[ -n "$java_directory" ]] && [[ -x "$java_directory/bin/java" ]]; then
      export JAVA_HOME="$java_directory"
      return 0
    fi
  fi

  die "JDK 17+ not found. Run './install-deps.sh' to install it, or set JAVA_HOME manually."
}

# Resolve ANDROID_HOME for Gradle and the Android tools. Checks the env var
# first, then common install paths. Exports ANDROID_HOME and ANDROID_SDK_ROOT,
# and writes apps/mobile/android/local.properties (which the Android Gradle
# Plugin reads directly) so Gradle finds the SDK even without the env var.
# @returns 0 on success, dies with a clear message if the SDK is not found.
ensure_android_home() {
  if [[ -n "${ANDROID_HOME:-}" ]] && [[ -x "${ANDROID_HOME}/platform-tools/adb" ]]; then
    write_local_properties "$ANDROID_HOME"
    return 0
  fi

  local sdk_path
  for sdk_path in \
    "${ANDROID_SDK_ROOT:-}" \
    "$HOME/Android/Sdk" \
    "$HOME/Library/Android/sdk" \
    "/opt/android-sdk"; do
    if [[ -n "$sdk_path" ]] && [[ -x "$sdk_path/platform-tools/adb" ]]; then
      export ANDROID_HOME="$sdk_path"
      export ANDROID_SDK_ROOT="$sdk_path"
      write_local_properties "$sdk_path"
      return 0
    fi
  done

  die "Android SDK not found. Run './install-deps.sh' to verify, or set ANDROID_HOME manually."
}

# Write apps/mobile/android/local.properties with the SDK path. This file is
# gitignored. No-op if the android/ native folder doesn't exist yet (prebuild
# hasn't run); the file is created after prebuild instead.
# @param $1  the SDK directory path
write_local_properties() {
  local sdk_dir="$1"
  local props_file="apps/mobile/android/local.properties"
  if [[ ! -d apps/mobile/android ]]; then
    return 0
  fi
  if [[ ! -f "$props_file" ]] || ! grep -q "^sdk.dir=" "$props_file" 2>/dev/null; then
    printf 'sdk.dir=%s\n' "$sdk_dir" > "$props_file"
  fi
}

# Select one connected target, honoring adb's standard ANDROID_SERIAL override.
# @param $1 adb executable. @returns Sets ANDROID_SERIAL or exits before building.
select_android_device() {
  local devices
  devices="$("$1" devices | awk 'NR > 1 && $2 == "device" { print $1 }')"
  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    printf '%s\n' "$devices" | grep -Fxq "$ANDROID_SERIAL" \
      || die "Android target '$ANDROID_SERIAL' is not connected/authorized. Check adb devices."
  elif [[ -z "$devices" ]]; then
    die "no connected Android target. Boot an emulator or connect and authorize a device."
  elif [[ "$devices" == *$'\n'* ]]; then
    die "multiple Android targets connected: ${devices//$'\n'/, }. Select one with ANDROID_SERIAL=<serial> ./dev.sh --mobile-android."
  else
    export ANDROID_SERIAL="$devices"
  fi
}

# Ensure an Android emulator is running. If no device is connected, boots the
# first AVD found and waits for it to finish booting.
ensure_android_emulator() {
  local adb_bin emu_bin

  adb_bin="$(find_adb)" \
    || die "adb not found. Install Android Studio, ensure platform-tools is on PATH, or set ANDROID_HOME."

  if [[ -n "${ANDROID_SERIAL:-}" ]] || "$adb_bin" devices 2>/dev/null | grep -qw "device"; then
    select_android_device "$adb_bin"
    ok "android device/emulator already running"
    return 0
  fi

  emu_bin="$(find_emulator)" \
    || die "emulator binary not found. Install Android Studio or set ANDROID_HOME."

  local avd
  avd="$("$emu_bin" -list-avds 2>/dev/null | head -1)"
  [[ -z "$avd" ]] \
    && die "no AVD found. Create one via Android Studio → Device Manager → Create Virtual Device."

  log "booting emulator '$avd' (takes ~30-60s)…"
  "$emu_bin" -avd "$avd" -no-snapshot-load >/dev/null 2>&1 &

  "$adb_bin" -e wait-for-device 2>/dev/null \
    || die "adb wait-for-device timed out."

  select_android_device "$adb_bin"
  log "waiting for emulator to finish booting…"
  local attempts=0
  until "$adb_bin" -s "$ANDROID_SERIAL" shell getprop sys.boot_completed 2>/dev/null | grep -q 1; do
    attempts=$((attempts + 1))
    (( attempts > 90 )) \
      && die "emulator didn't finish booting in 180s. Check Android Studio AVD Manager."
    sleep 2
  done
  ok "emulator booted"
}

# @param $1 adb executable.
# @returns A device/package installation identity, or empty if the app is missing.
android_installation_identity() {
  local updated
  updated="$("$1" -s "$ANDROID_SERIAL" shell dumpsys package com.haalkhata.app 2>/dev/null \
    | sed -n 's/^[[:space:]]*lastUpdateTime=//p' | head -1)" || return 0
  [[ -n "$updated" ]] && printf '%s:%s' "$ANDROID_SERIAL" "$updated"
  return 0
}

# Rebuild when the installed binary is missing, unverified or incompatible.
# Prebuild refreshes existing generated projects after native dependency changes.
ensure_android_app() {
  local adb_bin installation fingerprint
  adb_bin="$(find_adb)"
  select_android_device "$adb_bin"
  installation="$(android_installation_identity "$adb_bin")"
  if native_build_matches android "$installation"; then
    ok "dev client matches current native dependencies on emulator"
    return 0
  fi

  log "dev client missing or native build changed — rebuilding Android…"
  (cd apps/mobile && pnpm run expo prebuild --platform android --no-install) \
    || die "expo prebuild failed; startup stopped."
  write_local_properties "$ANDROID_HOME"

  fingerprint="$(native_build_snapshot android)" || exit 1
  log "gradle build + install on ${ANDROID_SERIAL}…"
  (cd apps/mobile/android && ./gradlew assembleDebug) \
    || die "gradle build failed. See apps/mobile/android for details."
  "$adb_bin" -s "$ANDROID_SERIAL" install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk \
    || die "could not install the Android build on $ANDROID_SERIAL."
  installation="$(android_installation_identity "$adb_bin")"
  record_native_build android "$installation" "$fingerprint"
  ok "dev client built + installed"
}

# Launch the dev client app on the emulator via adb. Tries a direct activity
# start first, falls back to the monkey launcher.
launch_android_app() {
  local adb_bin
  adb_bin="$(find_adb)" \
    || die "adb not found. Run './install-deps.sh' or set ANDROID_HOME."
  "$adb_bin" -s "$ANDROID_SERIAL" shell am start -n com.haalkhata.app/.MainActivity 2>/dev/null \
    || "$adb_bin" -s "$ANDROID_SERIAL" shell monkey -p com.haalkhata.app \
       -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  ok "dev client launched on emulator"
}

# --- iOS helpers ---------------------------------------------------------------

# Read simctl's JSON independently of its whitespace and ignore non-iOS devices.
# @param $1  device filter accepted by simctl (booted or available).
# @returns the first matching iOS simulator UDID, or an empty string.
ios_simulator_udid() {
  xcrun simctl list devices "$1" -j | node -e '
    const payload = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
    const devices = Object.entries(payload.devices)
      .filter(([runtime]) => runtime.includes(".iOS-"))
      .flatMap(([, devices]) => devices);
    process.stdout.write(devices[0]?.udid ?? "");
  '
}

# Ensure an iOS simulator is booted. If none is booted, finds the first
# available simulator, boots it, and opens the Simulator app.
ensure_ios_simulator() {
  have xcrun \
    || die "xcrun not found. Install Xcode and its command-line tools."

  if [[ -n "$(ios_simulator_udid booted)" ]]; then
    ok "iOS simulator already booted"
    return 0
  fi

  local udid
  udid="$(ios_simulator_udid available)"
  [[ -z "$udid" ]] \
    && die "no iOS simulator available. Install Xcode and create one via Xcode → Window → Devices and Simulators."

  log "booting iOS simulator (udid: ${udid:0:8}…)…"
  xcrun simctl boot "$udid" 2>/dev/null || true
  open -a Simulator 2>/dev/null \
    || open -a "${DEVELOPER_DIR:-$(xcode-select -p)}/../Applications/DeviceHub.app" 2>/dev/null \
    || true

  local attempts=0
  until xcrun simctl list devices booted -j 2>/dev/null | grep -q "$udid"; do
    attempts=$((attempts + 1))
    (( attempts > 60 )) \
      && die "simulator didn't boot in 120s."
    sleep 2
  done
  ok "simulator booted"
}

# Ensure the dev client on the booted simulator matches the native project.
# Missing/unverified/changed installations rebuild and refresh CocoaPods first.
# Generic builds do not require an Apple signing certificate for the app's
# associated-domain entitlements; physical-device builds still use signing.
ensure_ios_app() {
  local udid installation fingerprint
  udid="$(ios_simulator_udid booted)"
  installation="$(xcrun simctl get_app_container "$udid" com.haalkhata.app app 2>/dev/null || true)"
  if native_build_matches ios "$installation"; then
    ok "dev client matches current native dependencies on simulator"
    return 0
  fi

  log "dev client missing or native build changed — rebuilding iOS (may take several minutes)…"
  have pod || die "CocoaPods is required to rebuild the dev client. Run ./install-deps.sh first."
  (cd apps/mobile && pnpm run expo prebuild --platform ios --no-install) \
    || die "expo prebuild failed; startup stopped."
  (cd apps/mobile/ios && pod install) \
    || die "CocoaPods installation failed; startup stopped."
  fingerprint="$(native_build_snapshot ios)" || exit 1
  (cd apps/mobile && pnpm run expo run:ios --device generic \
    --output .expo/ios-build --no-bundler) \
    || die "iOS build failed. See apps/mobile/ios for details."
  xcrun simctl install "$udid" "apps/mobile/.expo/ios-build/HaalKhata.app" \
    || die "could not install the iOS simulator build."
  installation="$(xcrun simctl get_app_container "$udid" com.haalkhata.app app)" \
    || die "could not verify the installed iOS simulator build."
  record_native_build ios "$installation" "$fingerprint"
  ok "dev client built + installed"
}

# Open the running Metro project in the dev client on the booted simulator.
launch_ios_app() {
  local manifest_url
  manifest_url="$(node -p 'encodeURIComponent(process.argv[1])' "http://127.0.0.1:$METRO_PORT")"
  xcrun simctl openurl booted "haalkhata://expo-development-client/?url=$manifest_url" \
    || die "could not open the Metro project on the iOS simulator."
  ok "dev client connected to Metro on simulator"
}

# --- LAN helpers ---------------------------------------------------------------

# Find this machine's address on the local network, for the URL to type into a
# phone. Only used to print a hint — binding to 0.0.0.0 is what actually makes
# the server reachable, so a failure here is not fatal.
# @returns 0 and echoes the first non-loopback IPv4 address, or 1 if none found.
lan_address() {
  local address=""
  case "$(uname -s)" in
    Darwin*)
      # en0 is Wi-Fi on laptops, en1 on some desktops; take whichever answers.
      local interface
      for interface in en0 en1 en2; do
        address="$(ipconfig getifaddr "$interface" 2>/dev/null || true)"
        [[ -n "$address" ]] && break
      done
      ;;
    *)
      if have ip; then
        # "scope global" drops loopback and link-local; docker0 and friends are
        # filtered out by name so the printed URL is the one a phone can use.
        address="$(ip -4 -o addr show scope global 2>/dev/null \
          | grep -vE '\b(docker|br-|veth|virbr)' \
          | awk '{print $4}' | cut -d/ -f1 | head -1)"
      elif have hostname; then
        address="$(hostname -I 2>/dev/null | awk '{print $1}')"
      fi
      ;;
  esac
  [[ -z "$address" ]] && return 1
  printf '%s' "$address"
}

# --- mobile orchestration ------------------------------------------------------

# Run the full mobile dev flow for the given platform:
#   1. ensure device is booted
#   2. ensure app is installed and matches the current native project
#   3. start Metro in the background
#   4. launch the app
# @param $1  "android" or "ios"
start_mobile() {
  local platform="$1"

  echo
  case "$platform" in
    android)
      ensure_java_home
      ensure_android_home
      ensure_android_emulator
      ensure_android_app
      ;;
    ios)
      ensure_ios_simulator
      ensure_ios_app
      ;;
  esac

  echo
  kill_stale_metro
  log "starting Metro bundler (expo start --dev-client)…"
  pnpm dev:mobile &
  MOBILE_PID=$!

  # The HTTP status endpoint works on macOS and Linux, including machines
  # without Linux's ss or macOS's lsof command.
  local attempts=0
  until curl --fail --silent --max-time 1 "http://127.0.0.1:$METRO_PORT/status" \
    | grep -q '^packager-status:running'; do
    attempts=$((attempts + 1))
    if (( attempts > 30 )); then
      die "Metro did not become ready on port $METRO_PORT. Check the output above."
    fi
    # Check if the background process died early.
    if ! kill -0 "$MOBILE_PID" 2>/dev/null; then
      die "Metro exited unexpectedly. Check the output above for errors."
    fi
    sleep 1
  done
  ok "Metro is running on port $METRO_PORT"

  case "$platform" in
    android) launch_android_app ;;
    ios)     launch_ios_app ;;
  esac
}

# --- web server ----------------------------------------------------------------

# Find a Next.js dev server already serving this checkout. Next records the
# one it allows per app in apps/web/.next/dev/lock and refuses to start a
# second, so this is the same test Next applies — made at the start instead
# of after the simulator, a native rebuild and Metro.
# The lock names the bind as Next prints it: "127.0.0.1" for a loopback-only
# server, "localhost" for one listening on every interface (-H 0.0.0.0).
# @returns 0 and echoes "<pid> <hostname> <port> <url>" for a live server, 1 otherwise.
running_web_server() {
  local lock="$PROJECT_ROOT/apps/web/.next/dev/lock" contents pid hostname port url
  [[ -f "$lock" ]] || return 1
  contents="$(cat "$lock" 2>/dev/null)" || return 1
  pid="$(sed -n 's/.*"pid":\([0-9][0-9]*\).*/\1/p' <<<"$contents")"
  hostname="$(sed -n 's/.*"hostname":"\([^"]*\)".*/\1/p' <<<"$contents")"
  port="$(sed -n 's/.*"port":\([0-9][0-9]*\).*/\1/p' <<<"$contents")"
  url="$(sed -n 's/.*"appUrl":"\([^"]*\)".*/\1/p' <<<"$contents")"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  # A lock left behind by a crash can name a PID since given to something else.
  ps -o command= -p "$pid" 2>/dev/null | grep -q next || return 1
  printf '%s %s %s %s' "$pid" "${hostname:-localhost}" "${port:-3000}" "${url:-http://localhost:${port:-3000}}"
}

# --- main ----------------------------------------------------------------------

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

main() {
  local mode="start"
  local mobile_platform=""
  local lan=0
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --clean)          mode="clean" ;;
      --down)           mode="down" ;;
      --lan)            lan=1 ;;
      --mobile-android) mobile_platform="android" ;;
      --mobile-ios)     mobile_platform="ios" ;;
      --help|-h)        usage ;;
      *) die "unknown argument '$1'. Try --help." ;;
    esac
    shift
  done

  cd "$PROJECT_ROOT"

  if [[ "$mobile_platform" == "ios" && "$(uname -s)" != "Darwin" ]]; then
    die "iOS simulators require macOS and Xcode. On Linux use --mobile-android or run the web app."
  fi

  if [[ "$mode" == "down" ]]; then
    log "stopping compose services…"
    docker compose down --remove-orphans
    ok "stopped. (The web dev server runs in the foreground — Ctrl-C it first if still running.)"
    exit 0
  fi

  # Another ./dev.sh (or `pnpm dev`) may already be serving this checkout.
  # Next refuses a second server for it, and used to say so only at the very
  # end, after the native build, taking Metro down with it. Decide now: reuse
  # it when it can serve this run, otherwise stop before the slow steps.
  local existing_web="" existing_pid existing_host existing_port existing_url
  if existing_web="$(running_web_server)"; then
    read -r existing_pid existing_host existing_port existing_url <<<"$existing_web"
    # The Android emulator and a phone on the LAN reach the host from
    # outside its loopback, so a server bound to 127.0.0.1 is no use to them.
    if [[ "$mobile_platform" == "android" || "$lan" -eq 1 ]]; then
      case "$existing_host" in
        127.*|"[::1]"|::1)
          die "a web dev server for this checkout is already running on $existing_url (PID $existing_pid), loopback only — $([[ "$lan" -eq 1 ]] && echo "--lan" || echo "the Android emulator") needs it on 0.0.0.0. Stop it (Ctrl-C in its terminal, or kill $existing_pid) and run this again."
          ;;
      esac
    fi
    # The app finds the API on Metro's host at port 3000, so a server Next
    # moved to another port would leave it talking to nothing.
    if [[ -n "$mobile_platform" && "$existing_port" != "3000" ]]; then
      die "a web dev server for this checkout is already running on $existing_url (PID $existing_pid), but the app expects port 3000. Stop it (Ctrl-C in its terminal, or kill $existing_pid) and run this again."
    fi
    ok "web dev server for this checkout already running — $existing_url (PID $existing_pid); reusing it"
  fi

  assert_system_ready
  ensure_project_state
  node scripts/setup-env.mjs --dev

  if [[ "$mode" == "clean" ]]; then
    clean_db
  fi
  start_db
  prepare_db

  if [[ -n "$mobile_platform" ]]; then
    start_mobile "$mobile_platform"
  fi

  if [[ -n "$existing_web" ]]; then
    echo
    if [[ -n "$MOBILE_PID" ]]; then
      # Metro takes the foreground the web server would have had: Ctrl-C
      # stops it through the EXIT trap, and the web server keeps running in
      # the terminal that started it.
      ok "using the web dev server at $existing_url — Metro stays in the foreground (Ctrl-C to stop it)"
      wait "$MOBILE_PID" || warn "Metro stopped (exit status $?)"
    else
      ok "using the web dev server at $existing_url — nothing else to start"
    fi
    return 0
  fi

  echo
  # The default 127.0.0.1 bind accepts connections from this machine and
  # nothing else, which is the right default for a dev server holding a real
  # session cookie. Two things need more: the Android emulator, which routes to
  # the host's 127.0.0.1 via 10.0.2.2 and so needs the server to accept
  # non-localhost connections (the iOS simulator shares the host's stack but is
  # no worse off), and --lan, for a real phone on the same Wi-Fi.
  local web_host="127.0.0.1"
  if [[ -n "$mobile_platform" || "$lan" -eq 1 ]]; then
    web_host="0.0.0.0"
  fi

  if [[ "$web_host" == "0.0.0.0" ]]; then
    log "starting web dev server — http://0.0.0.0:3000  (Ctrl-C to stop)"
    if [[ "$lan" -eq 1 ]]; then
      local address
      if address="$(lan_address)"; then
        ok "open http://${address}:3000 on a device on the same network"
      else
        warn "could not detect this machine's LAN address — find it with 'ip addr' or 'ifconfig'"
      fi
      # Said plainly because --lan exposes a logged-in session to the whole
      # network: anyone who can reach the port gets the app, and on a café or
      # office network that is not a small set of people.
      warn "the dev server is now reachable by anything on this network"
      # Two things behave differently off localhost, and both look like bugs if
      # you do not know to expect them.
      warn "http://<ip> is not a secure context: the service worker will not register (no PWA/offline)"
      warn "Next logs a cross-origin warning for /_next/* — set allowedDevOrigins in next.config.ts to silence it"
      # A bind is necessary but not sufficient; a host firewall drops the
      # connection with the same symptom as no server at all.
      if have ufw && ufw status 2>/dev/null | grep -q "Status: active"; then
        warn "ufw is active — 'sudo ufw allow 3000/tcp' if the phone still cannot connect"
      fi
    else
      warn "web server is on 0.0.0.0:3000 — reachable from the emulator/simulator"
    fi
  else
    log "starting web dev server — http://127.0.0.1:3000  (Ctrl-C to stop)"
  fi
  # Migrations have passed before reaching this point; ensureMigrated() also
  # protects API requests. The db keeps running after the server exits; use
  # ./dev.sh --down to stop it too. With --mobile-* the Metro bundler is
  # stopped by the EXIT trap; the db and emulator/simulator keep running.
  # `pnpm exec next dev` would run the Next binary directly and SKIP the
  # package's environment-loading launcher. The server then starts with none of .env set: no
  # OpenRouter key (receipt scanning silently falls back to the mock
  # provider), no SESSION_SECRET, and Postgres only by the built-in default.
  # Invoke the environment-loading launcher the same way the dev script does.
  #
  # The launcher reads the root .env through the shared environment loader. Next.js 16
  # forwards CLI flags to workers, where --env-file-if-exists is forbidden.
  #
  # --turbopack because the webpack dev server cannot hot-replace a server
  # module whose exports changed: delete a file, or rename/remove an export
  # under src/server, and it keeps serving the old module until you restart
  # ("X is not a function", "Attempted import error", and eventually a
  # half-written .next that 500s everything). Turbopack tracks the module
  # graph properly and survives those edits. `pnpm --filter @haalkhata/web
  # dev:webpack` is the fallback if Turbopack ever misbehaves.
  pnpm --filter @haalkhata/web exec \
    node scripts/next.mjs dev \
    --turbopack -H "$web_host"
}

# Allow the startup workflow to be exercised with isolated service adapters in tests.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
