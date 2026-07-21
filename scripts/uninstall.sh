#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="neopaste"
INSTALL_DIR="/opt/neopaste"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "لطفاً با دسترسی root اجرا کنید: sudo bash uninstall.sh" >&2
  exit 1
fi

systemctl stop "${SERVICE_NAME}.service" 2>/dev/null || true
systemctl disable "${SERVICE_NAME}.service" 2>/dev/null || true
rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
systemctl daemon-reload

read -r -p "حذف کامل داده‌ها در ${INSTALL_DIR}؟ [y/N]: " ANS
if [[ "${ANS}" =~ ^[Yy]$ ]]; then
  rm -rf "${INSTALL_DIR}"
  userdel neopaste 2>/dev/null || true
  echo "حذف کامل انجام شد."
else
  echo "سرویس متوقف شد؛ داده‌ها در ${INSTALL_DIR} باقی ماند."
fi
