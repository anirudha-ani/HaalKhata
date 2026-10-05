# macos-env.sh — discover installed macOS tools for the setup and dev scripts.
# Only adjusts the calling process; shell profiles and xcode-select stay intact.

# Use Docker Desktop's CLI, a working Homebrew JDK, and the full Xcode install
# when macOS's default command-line tools do not provide them.
# @returns 0 after configuring tools that are already installed.
configure_macos_tools() {
  [[ "$(uname -s)" == "Darwin" ]] || return 0

  local candidate
  if ! command -v docker >/dev/null 2>&1; then
    for candidate in "$HOME/.docker/bin" "/Applications/Docker.app/Contents/Resources/bin"; do
      if [[ -x "$candidate/docker" ]]; then
        export PATH="$candidate:$PATH"
        break
      fi
    done
  fi

  if ! java -version >/dev/null 2>&1 && command -v brew >/dev/null 2>&1; then
    candidate="$(brew --prefix openjdk@17 2>/dev/null || true)/bin"
    if [[ -x "$candidate/java" ]]; then
      export PATH="$candidate:$PATH"
    fi
  fi

  if [[ -z "${DEVELOPER_DIR:-}" ]] && ! xcrun --find simctl >/dev/null 2>&1; then
    candidate="/Applications/Xcode.app/Contents/Developer"
    if [[ -d "$candidate" ]]; then
      export DEVELOPER_DIR="$candidate"
    fi
  fi
}

configure_macos_tools
