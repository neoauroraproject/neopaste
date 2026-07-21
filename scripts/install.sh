#!/usr/bin/env bash
set -euo pipefail

# NeoPaste installer for Linux (Ubuntu/Debian/RHEL-like).
# Works both online (called from install-online.sh) and offline (local package).
# Safe with: curl ... | sudo bash  (prompts via /dev/tty)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/neopaste"
SERVICE_NAME="neopaste"
BINARY_SRC=""

prompt() {
  # usage: prompt "Label" "default" → sets REPLY
  local label="$1"
  local default="${2:-}"
  local input=""
  if [[ -r /dev/tty ]]; then
    if [[ -n "$default" ]]; then
      printf "%s [%s]: " "$label" "$default" > /dev/tty
    else
      printf "%s: " "$label" > /dev/tty
    fi
    # read from the real terminal even when stdin is a pipe
    IFS= read -r input < /dev/tty || true
  else
    input=""
  fi
  if [[ -z "$input" ]]; then
    REPLY="$default"
  else
    REPLY="$input"
  fi
}

if [[ -f "${SCRIPT_DIR}/neopaste" ]]; then
  BINARY_SRC="${SCRIPT_DIR}/neopaste"
elif [[ -f "${SCRIPT_DIR}/bin/neopaste" ]]; then
  BINARY_SRC="${SCRIPT_DIR}/bin/neopaste"
else
  echo "خطا: باینری neopaste در کنار اسکریپت پیدا نشد." >&2
  echo "مسیر بررسی‌شده: ${SCRIPT_DIR}" >&2
  ls -la "${SCRIPT_DIR}" >&2 || true
  exit 1
fi
chmod +x "$BINARY_SRC"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "لطفاً با دسترسی root اجرا کنید: sudo bash install.sh" >&2
  exit 1
fi

MODE_LABEL="${NEOPASTE_INSTALL_LABEL:-نصب}"
echo "======================================"
echo "     NeoPaste — ${MODE_LABEL}"
echo "======================================"
echo

DEFAULT_PORT="${NEOPASTE_PORT:-8080}"
DEFAULT_NAME="${NEOPASTE_SITE_NAME:-NeoPaste}"

if [[ -n "${NEOPASTE_NONINTERACTIVE:-}" ]] || [[ ! -r /dev/tty ]]; then
  PORT="${NEOPASTE_PORT:-8080}"
  SITE_NAME="${NEOPASTE_SITE_NAME:-NeoPaste}"
  echo "پورت: ${PORT}"
  echo "نام سایت: ${SITE_NAME}"
else
  if [[ -n "${NEOPASTE_PORT:-}" ]]; then
    PORT="$NEOPASTE_PORT"
    echo "پورت (از محیط): ${PORT}"
  else
    prompt "پورت" "8080"
    PORT="$REPLY"
  fi
  prompt "نام سایت" "${NEOPASTE_SITE_NAME:-NeoPaste}"
  SITE_NAME="$REPLY"
fi

SITE_NAME="${SITE_NAME:-NeoPaste}"

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [[ "$PORT" -lt 1 || "$PORT" -gt 65535 ]]; then
  echo "پورت نامعتبر است: ${PORT}" >&2
  exit 1
fi

ADMIN_USER="${NEOPASTE_ADMIN_USER:-admin}"
ADMIN_PASS="$(openssl rand -base64 18 2>/dev/null | tr -d '/+=' | head -c 20 || head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 20)"
SESSION_SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 64)"

echo
echo "در حال نصب…"

id -u neopaste >/dev/null 2>&1 || useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin neopaste

mkdir -p "$INSTALL_DIR/data"
install -m 755 "$BINARY_SRC" "$INSTALL_DIR/neopaste"
chown -R neopaste:neopaste "$INSTALL_DIR"

SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [[ -z "$SERVER_IP" ]]; then
  SERVER_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
fi
SERVER_IP="${SERVER_IP:-YOUR_SERVER_IP}"

cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=NeoPaste secure paste service
After=network.target

[Service]
Type=simple
User=neopaste
Group=neopaste
WorkingDirectory=${INSTALL_DIR}
Environment=NEOPASTE_LISTEN=:${PORT}
Environment=NEOPASTE_DATA=${INSTALL_DIR}/data
Environment=NEOPASTE_SITE_NAME=${SITE_NAME}
Environment=NEOPASTE_ADMIN_USER=${ADMIN_USER}
Environment=NEOPASTE_ADMIN_PASS=${ADMIN_PASS}
Environment=NEOPASTE_SESSION_SECRET=${SESSION_SECRET}
ExecStart=${INSTALL_DIR}/neopaste -data ${INSTALL_DIR}/data -listen :${PORT}
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${INSTALL_DIR}/data

[Install]
WantedBy=multi-user.target
EOF

CRED_FILE="${INSTALL_DIR}/data/INSTALL_CREDENTIALS.txt"
cat > "$CRED_FILE" <<EOF
NeoPaste install credentials — delete after saving somewhere safe
URL:      http://${SERVER_IP}:${PORT}
Admin:    http://${SERVER_IP}:${PORT}/admin
Username: ${ADMIN_USER}
Password: ${ADMIN_PASS}
Site:     ${SITE_NAME}
EOF
chmod 600 "$CRED_FILE"
chown neopaste:neopaste "$CRED_FILE"

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}.service"

sleep 1
if systemctl is-active --quiet "${SERVICE_NAME}.service"; then
  sed -i '/NEOPASTE_ADMIN_PASS=/d' /etc/systemd/system/${SERVICE_NAME}.service
  systemctl daemon-reload
  echo "سرویس فعال شد."
else
  echo "هشدار: سرویس بالا نیامد. لاگ:" >&2
  systemctl status "${SERVICE_NAME}.service" --no-pager >&2 || true
  journalctl -u "${SERVICE_NAME}.service" -n 30 --no-pager >&2 || true
fi

echo
echo "======================================"
echo "NeoPaste آماده است"
echo "آدرس:        http://${SERVER_IP}:${PORT}"
echo "ادمین:       http://${SERVER_IP}:${PORT}/admin"
echo "نام کاربری:  ${ADMIN_USER}"
echo "رمز عبور:    ${ADMIN_PASS}"
echo "نام سایت:    ${SITE_NAME}"
echo "======================================"
echo "این اطلاعات در ${CRED_FILE} هم ذخیره شد."
echo "پس از ذخیره، آن فایل را حذف کنید."
echo
