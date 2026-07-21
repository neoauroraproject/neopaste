#!/usr/bin/env bash
set -euo pipefail

# NeoPaste one-line online installer / updater / uninstaller
#
# Install or interactive menu:
#   curl -fsSL https://raw.githubusercontent.com/neoauroraproject/neopaste/main/scripts/install-online.sh | sudo bash
#
# Update existing install:
#   curl -fsSL .../install-online.sh | sudo bash -s -- --update
#
# Uninstall:
#   curl -fsSL .../install-online.sh | sudo bash -s -- --uninstall
#
# Fresh install non-interactive:
#   curl -fsSL .../install-online.sh | sudo bash -s -- --install --yes

REPO="neoauroraproject/neopaste"
ASSET="neopaste-linux-amd64.tar.gz"
TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

PASS_ARGS=("$@")

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root, e.g.:" >&2
  echo "  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install-online.sh | sudo bash" >&2
  echo "  curl -fsSL ... | sudo bash -s -- --update" >&2
  echo "  curl -fsSL ... | sudo bash -s -- --uninstall" >&2
  exit 1
fi

# Uninstall does not need a download if local uninstall.sh exists — still download for consistent UX
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ASSET="neopaste-linux-amd64.tar.gz" ;;
  aarch64|arm64)
    echo "ARM64 release asset not published yet." >&2
    exit 1
    ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

echo "======================================"
echo "     NeoPaste — Online Setup"
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
chmod +x "${INSTALL_ROOT}/uninstall.sh" 2>/dev/null || true
chmod +x "${INSTALL_ROOT}/neopaste" 2>/dev/null || true

if [[ ! -f "${INSTALL_ROOT}/neopaste" && ! -f "${INSTALL_ROOT}/bin/neopaste" ]]; then
  # uninstall-only still needs install.sh which can uninstall without binary for --uninstall
  if [[ " ${PASS_ARGS[*]} " != *" --uninstall "* ]]; then
    echo "Binary missing from release archive." >&2
    ls -la "$INSTALL_ROOT" >&2 || true
    exit 1
  fi
fi

export NEOPASTE_INSTALL_LABEL="Online Install"
trap - EXIT
bash "${INSTALL_ROOT}/install.sh" "${PASS_ARGS[@]}"
STATUS=$?
cleanup
exit "$STATUS"
