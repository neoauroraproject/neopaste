#!/usr/bin/env bash
set -euo pipefail

# NeoPaste installer for Linux (Ubuntu/Debian/RHEL-like).
# Works online (from install-online.sh) and offline (local package).
# Safe with: curl ... | sudo bash  (prompts via /dev/tty)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/neopaste"
SERVICE_NAME="neopaste"
BINARY_SRC=""

prompt() {
  local label="$1"
  local default="${2:-}"
  local input=""
  if [[ -r /dev/tty ]]; then
    if [[ -n "$default" ]]; then
      printf "%s [%s]: " "$label" "$default" > /dev/tty
    else
      printf "%s: " "$label" > /dev/tty
    fi
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
  echo "Error: neopaste binary not found next to this script." >&2
  echo "Looked in: ${SCRIPT_DIR}" >&2
  ls -la "${SCRIPT_DIR}" >&2 || true
  exit 1
fi
chmod +x "$BINARY_SRC"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root: sudo bash install.sh" >&2
  exit 1
fi

MODE_LABEL="${NEOPASTE_INSTALL_LABEL:-Install}"
echo "======================================"
echo "     NeoPaste — ${MODE_LABEL}"
echo "======================================"
echo

if [[ -n "${NEOPASTE_NONINTERACTIVE:-}" ]] || [[ ! -r /dev/tty ]]; then
  PORT="${NEOPASTE_PORT:-8080}"
  SITE_NAME="${NEOPASTE_SITE_NAME:-NeoPaste}"
  echo "Port: ${PORT}"
  echo "Site name: ${SITE_NAME}"
else
  if [[ -n "${NEOPASTE_PORT:-}" ]]; then
    PORT="$NEOPASTE_PORT"
    echo "Port (from env): ${PORT}"
  else
    prompt "Port" "8080"
    PORT="$REPLY"
  fi
  prompt "Site name" "${NEOPASTE_SITE_NAME:-NeoPaste}"
  SITE_NAME="$REPLY"
fi

SITE_NAME="${SITE_NAME:-NeoPaste}"

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [[ "$PORT" -lt 1 || "$PORT" -gt 65535 ]]; then
  echo "Invalid port: ${PORT}" >&2
  exit 1
fi

ADMIN_USER="${NEOPASTE_ADMIN_USER:-admin}"
ADMIN_PASS="$(openssl rand -base64 18 2>/dev/null | tr -d '/+=' | head -c 20 || head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 20)"
SESSION_SECRET="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 64)"

echo
echo "Installing…"

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
  echo "Service is active."
else
  echo "Warning: service did not start. Status:" >&2
  systemctl status "${SERVICE_NAME}.service" --no-pager >&2 || true
  journalctl -u "${SERVICE_NAME}.service" -n 30 --no-pager >&2 || true
fi

echo
echo "======================================"
echo "NeoPaste is ready"
echo "URL:       http://${SERVER_IP}:${PORT}"
echo "Admin:     http://${SERVER_IP}:${PORT}/admin"
echo "Username:  ${ADMIN_USER}"
echo "Password:  ${ADMIN_PASS}"
echo "Site name: ${SITE_NAME}"
echo "======================================"
echo "Credentials also saved to: ${CRED_FILE}"
echo "Delete that file after you save the password."
echo
