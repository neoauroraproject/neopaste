#!/usr/bin/env bash
set -euo pipefail

# NeoPaste one-line online installer.
# Downloads the latest release asset, then runs the offline install.sh.
# Usage: curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neopaste/main/scripts/install-online.sh | sudo bash

REPO="neoauroraproject/neopaste"
ASSET="neopaste-linux-amd64.tar.gz"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

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
API="https://api.github.com/repos/${REPO}/releases/latest"
if command -v curl >/dev/null 2>&1; then
  URL="$(curl -fsSL "$API" | sed -n "s/.*\"browser_download_url\": \"\\([^\"]*${ASSET}\\)\".*/\\1/p" | head -n1)"
  if [[ -z "$URL" ]]; then
    URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
  fi
  curl -fsSL -o "${TMP_DIR}/${ASSET}" "$URL"
elif command -v wget >/dev/null 2>&1; then
  URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"
  wget -q -O "${TMP_DIR}/${ASSET}" "$URL"
else
  echo "curl or wget required" >&2
  exit 1
fi

tar -xzf "${TMP_DIR}/${ASSET}" -C "$TMP_DIR"
cd "$TMP_DIR"
# tarball may contain a top-level neopaste/ directory
if [[ -d neopaste ]]; then
  cd neopaste
elif [[ -x ./install.sh ]]; then
  :
else
  echo "Unexpected archive layout" >&2
  exit 1
fi

exec bash ./install.sh
