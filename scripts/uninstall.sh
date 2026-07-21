#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="neopaste"
INSTALL_DIR="/opt/neopaste"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root: sudo bash uninstall.sh" >&2
  exit 1
fi

systemctl stop "${SERVICE_NAME}.service" 2>/dev/null || true
systemctl disable "${SERVICE_NAME}.service" 2>/dev/null || true
rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload

ANS=""
if [[ -r /dev/tty ]]; then
  printf "Delete all data in %s? [y/N]: " "${INSTALL_DIR}" > /dev/tty
  IFS= read -r ANS < /dev/tty || true
fi

if [[ "${ANS}" =~ ^[Yy]$ ]]; then
  rm -rf "${INSTALL_DIR}"
  userdel neopaste 2>/dev/null || true
  echo "Fully removed."
else
  echo "Service stopped. Data left in ${INSTALL_DIR}."
fi
