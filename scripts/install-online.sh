#!/usr/bin/env bash
set -euo pipefail

# NeoPaste one-line online installer.
# Downloads the latest release asset, then runs the offline install.sh.
# Usage: curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neopaste/main/scripts/install-online.sh | sudo bash

REPO="neoauroraproject/neopaste"
ASSET="neopaste-linux-amd64.tar.gz"
TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root: curl -fsSL ... | sudo bash" >&2
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ASSET="neopaste-linux-amd64.tar.gz" ;;
  aarch64|arm64)
    echo "ARM64 release asset not published yet. Use offline build: make build-linux-arm64" >&2
    exit 1
    ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

echo "Fetching latest NeoPaste release…"
URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
if command -v curl >/dev/null 2>&1; then
  curl -fsSL -o "${TMP_DIR}/${ASSET}" "$URL"
elif command -v wget >/dev/null 2>&1; then
  wget -q -O "${TMP_DIR}/${ASSET}" "$URL"
else
  echo "curl or wget required" >&2
  exit 1
fi

tar -xzf "${TMP_DIR}/${ASSET}" -C "$TMP_DIR"

INSTALL_ROOT=""
if [[ -d "${TMP_DIR}/neopaste" ]]; then
  INSTALL_ROOT="${TMP_DIR}/neopaste"
elif [[ -f "${TMP_DIR}/install.sh" ]]; then
  INSTALL_ROOT="$TMP_DIR"
else
  echo "Unexpected archive layout:" >&2
  find "$TMP_DIR" -maxdepth 2 -type f >&2 || true
  exit 1
fi

chmod +x "${INSTALL_ROOT}/install.sh" 2>/dev/null || true
chmod +x "${INSTALL_ROOT}/neopaste" 2>/dev/null || true
chmod +x "${INSTALL_ROOT}/bin/neopaste" 2>/dev/null || true

if [[ ! -f "${INSTALL_ROOT}/neopaste" && ! -f "${INSTALL_ROOT}/bin/neopaste" ]]; then
  echo "Binary missing from release archive." >&2
  ls -la "$INSTALL_ROOT" >&2 || true
  exit 1
fi

# Clear EXIT trap so temp files stay until install.sh finishes copying them
trap - EXIT
bash "${INSTALL_ROOT}/install.sh"
STATUS=$?
cleanup
exit "$STATUS"
