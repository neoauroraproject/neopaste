#!/usr/bin/env bash
set -euo pipefail

# NeoPaste one-line online installer.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neopaste/main/scripts/install-online.sh | sudo bash
# Non-interactive:
#   curl -fsSL ... | sudo NEOPASTE_PORT=8080 NEOPASTE_SITE_NAME=MyPaste NEOPASTE_NONINTERACTIVE=1 bash

REPO="neoauroraproject/neopaste"
ASSET="neopaste-linux-amd64.tar.gz"
TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root, e.g.:" >&2
  echo "  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install-online.sh | sudo bash" >&2
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

echo "======================================"
echo "     NeoPaste — Online Install"
echo "======================================"
echo "Downloading latest release…"

URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
if command -v curl >/dev/null 2>&1; then
  curl -fL --progress-bar -o "${TMP_DIR}/${ASSET}" "$URL"
elif command -v wget >/dev/null 2>&1; then
  wget -O "${TMP_DIR}/${ASSET}" "$URL"
else
  echo "curl or wget required" >&2
  exit 1
fi

echo "Extracting…"
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

export NEOPASTE_INSTALL_LABEL="Online Install"
export NEOPASTE_PORT="${NEOPASTE_PORT:-}"
export NEOPASTE_SITE_NAME="${NEOPASTE_SITE_NAME:-}"
export NEOPASTE_NONINTERACTIVE="${NEOPASTE_NONINTERACTIVE:-}"

trap - EXIT
bash "${INSTALL_ROOT}/install.sh"
STATUS=$?
cleanup
exit "$STATUS"
