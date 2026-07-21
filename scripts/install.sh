#!/usr/bin/env bash
set -euo pipefail

# NeoPaste installer (English UI on server)
# Modes:
#   sudo bash install.sh              # interactive (install / update / uninstall)
#   sudo bash install.sh --install    # fresh install
#   sudo bash install.sh --update     # update binary, keep data
#   sudo bash install.sh --uninstall  # remove service (+ optional data)
#   sudo bash install.sh --yes        # non-interactive defaults with chosen mode

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/neopaste"
SERVICE_NAME="neopaste"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
BINARY_SRC=""
MODE="${NEOPASTE_MODE:-}"
ASSUME_YES=0

usage() {
  cat <<'EOF'
NeoPaste installer

Usage:
  sudo bash install.sh [--install|--update|--uninstall] [--yes]

  --install     Fresh install (creates admin password)
  --update      Replace binary, keep data & admin account
  --uninstall   Stop service and optionally delete data
  --yes         Non-interactive (use env defaults / no confirm prompts)
EOF
}

for arg in "$@"; do
  case "$arg" in
    --install) MODE=install ;;
    --update) MODE=update ;;
    --uninstall) MODE=uninstall ;;
    --yes|-y) ASSUME_YES=1 ;;
    --help|-h) usage; exit 0 ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 1
      ;;
  esac
done

prompt() {
  local label="$1"
  local default="${2:-}"
  local input=""
  if [[ "$ASSUME_YES" -eq 1 ]] || [[ ! -r /dev/tty ]]; then
    REPLY="$default"
    return 0
  fi
  if [[ -n "$default" ]]; then
    printf "%s [%s]: " "$label" "$default" > /dev/tty
  else
    printf "%s: " "$label" > /dev/tty
  fi
  IFS= read -r input < /dev/tty || true
  if [[ -z "$input" ]]; then
    REPLY="$default"
  else
    REPLY="$input"
  fi
}

confirm() {
  local label="$1"
  local default="${2:-N}"
  prompt "$label" "$default"
  [[ "${REPLY}" =~ ^[Yy]$ ]]
}

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    echo "Please run as root: sudo bash install.sh" >&2
    exit 1
  fi
}

resolve_binary() {
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
}

installed() {
  [[ -x "${INSTALL_DIR}/neopaste" ]] || [[ -f "$SERVICE_FILE" ]]
}

detect_port() {
  local p=""
  if [[ -f "$SERVICE_FILE" ]]; then
    p="$(grep -E '^Environment=NEOPASTE_LISTEN=' "$SERVICE_FILE" 2>/dev/null | head -n1 | sed 's/.*=://' || true)"
    if [[ -z "$p" ]]; then
      p="$(grep -E -- '-listen :[0-9]+' "$SERVICE_FILE" 2>/dev/null | head -n1 | sed -n 's/.*-listen :\([0-9][0-9]*\).*/\1/p' || true)"
    fi
  fi
  echo "${p:-8080}"
}

detect_site_name() {
  local n=""
  if [[ -f "$SERVICE_FILE" ]]; then
    n="$(grep -E '^Environment=NEOPASTE_SITE_NAME=' "$SERVICE_FILE" 2>/dev/null | head -n1 | cut -d= -f3- || true)"
  fi
  echo "${n:-NeoPaste}"
}

server_ip() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [[ -z "$ip" ]]; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
  fi
  echo "${ip:-YOUR_SERVER_IP}"
}

ensure_user() {
  id -u neopaste >/dev/null 2>&1 || useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin neopaste
}

write_unit() {
  local port="$1"
  local site_name="$2"
  local admin_user="$3"
  local admin_pass="$4"
  local session_secret="$5"
  local include_admin_pass="$6"

  {
    cat <<EOF
[Unit]
Description=NeoPaste secure paste service
After=network.target

[Service]
Type=simple
User=neopaste
Group=neopaste
WorkingDirectory=${INSTALL_DIR}
Environment=NEOPASTE_LISTEN=:${port}
Environment=NEOPASTE_DATA=${INSTALL_DIR}/data
Environment=NEOPASTE_SITE_NAME=${site_name}
Environment=NEOPASTE_ADMIN_USER=${admin_user}
EOF
    if [[ "$include_admin_pass" == "1" && -n "$admin_pass" ]]; then
      echo "Environment=NEOPASTE_ADMIN_PASS=${admin_pass}"
    fi
    cat <<EOF
Environment=NEOPASTE_SESSION_SECRET=${session_secret}
ExecStart=${INSTALL_DIR}/neopaste -data ${INSTALL_DIR}/data -listen :${port}
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
  } > "$SERVICE_FILE"
}

do_uninstall() {
  echo "======================================"
  echo "     NeoPaste — Uninstall"
  echo "======================================"
  echo
  systemctl stop "${SERVICE_NAME}.service" 2>/dev/null || true
  systemctl disable "${SERVICE_NAME}.service" 2>/dev/null || true
  rm -f "$SERVICE_FILE"
  systemctl daemon-reload || true

  local wipe=0
  if [[ "$ASSUME_YES" -eq 1 ]]; then
    if [[ "${NEOPASTE_WIPE_DATA:-0}" == "1" ]]; then wipe=1; fi
  else
    if confirm "Delete all data in ${INSTALL_DIR}?" "N"; then wipe=1; fi
  fi

  if [[ "$wipe" -eq 1 ]]; then
    rm -rf "$INSTALL_DIR"
    userdel neopaste 2>/dev/null || true
    echo "Fully removed (binary + data)."
  else
    echo "Service removed. Data left in ${INSTALL_DIR}."
  fi
}

do_update() {
  resolve_binary
  if ! installed; then
    echo "NeoPaste is not installed. Run with --install first." >&2
    exit 1
  fi

  echo "======================================"
  echo "     NeoPaste — Update"
  echo "======================================"
  echo

  local port site_name
  port="$(detect_port)"
  site_name="$(detect_site_name)"
  echo "Keeping existing data."
  echo "Port: ${port}"
  echo "Site name: ${site_name}"
  echo
  echo "Updating binary…"

  ensure_user
  mkdir -p "$INSTALL_DIR/data"
  systemctl stop "${SERVICE_NAME}.service" 2>/dev/null || true
  install -m 755 "$BINARY_SRC" "$INSTALL_DIR/neopaste"
  chown -R neopaste:neopaste "$INSTALL_DIR"

  # Refresh unit without resetting admin password
  local session_secret
  session_secret="$(grep -E '^Environment=NEOPASTE_SESSION_SECRET=' "$SERVICE_FILE" 2>/dev/null | head -n1 | cut -d= -f3- || true)"
  if [[ -z "$session_secret" ]]; then
    session_secret="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 64)"
  fi
  write_unit "$port" "$site_name" "admin" "" "$session_secret" "0"

  systemctl daemon-reload
  systemctl enable --now "${SERVICE_NAME}.service"
  systemctl restart "${SERVICE_NAME}.service"

  sleep 1
  local ip
  ip="$(server_ip)"
  if systemctl is-active --quiet "${SERVICE_NAME}.service"; then
    echo "Service restarted successfully."
  else
    echo "Warning: service did not start." >&2
    systemctl status "${SERVICE_NAME}.service" --no-pager >&2 || true
    journalctl -u "${SERVICE_NAME}.service" -n 40 --no-pager >&2 || true
    exit 1
  fi

  echo
  echo "======================================"
  echo "NeoPaste updated"
  echo "URL:    http://${ip}:${port}"
  echo "Admin:  http://${ip}:${port}/admin"
  echo "Data:   ${INSTALL_DIR}/data (preserved)"
  echo "Tip:    hard-refresh the browser (Ctrl+Shift+R)"
  echo "======================================"
  echo
}

do_install() {
  resolve_binary

  echo "======================================"
  echo "     NeoPaste — ${NEOPASTE_INSTALL_LABEL:-Install}"
  echo "======================================"
  echo

  if installed && [[ "$ASSUME_YES" -eq 0 ]]; then
    echo "Existing installation detected at ${INSTALL_DIR}"
    if ! confirm "Overwrite with a fresh install? (admin password will be reset)" "N"; then
      echo "Cancelled. Use --update to keep data."
      exit 0
    fi
  fi

  local port site_name
  if [[ -n "${NEOPASTE_NONINTERACTIVE:-}" ]] || [[ "$ASSUME_YES" -eq 1 ]] || [[ ! -r /dev/tty ]]; then
    port="${NEOPASTE_PORT:-8080}"
    site_name="${NEOPASTE_SITE_NAME:-NeoPaste}"
    echo "Port: ${port}"
    echo "Site name: ${site_name}"
  else
    if [[ -n "${NEOPASTE_PORT:-}" ]]; then
      port="$NEOPASTE_PORT"
      echo "Port (from env): ${port}"
    else
      prompt "Port" "8080"
      port="$REPLY"
    fi
    prompt "Site name" "${NEOPASTE_SITE_NAME:-NeoPaste}"
    site_name="$REPLY"
  fi
  site_name="${site_name:-NeoPaste}"

  if ! [[ "$port" =~ ^[0-9]+$ ]] || [[ "$port" -lt 1 || "$port" -gt 65535 ]]; then
    echo "Invalid port: ${port}" >&2
    exit 1
  fi

  local admin_user admin_pass session_secret
  admin_user="${NEOPASTE_ADMIN_USER:-admin}"
  admin_pass="$(openssl rand -base64 18 2>/dev/null | tr -d '/+=' | head -c 20 || head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 20)"
  session_secret="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 64)"

  echo
  echo "Installing…"

  # Fresh install: reset admin by removing db admin table via wiping db only if forced
  # Keep pastes? User chose fresh — warn and reset credentials by removing admin from env first-boot.
  # Safest fresh: stop, replace binary, rewrite unit WITH admin pass, delete only admin row is hard —
  # so for true fresh we remove DB if user confirms wipe, else keep data but set new admin only if none.

  ensure_user
  mkdir -p "$INSTALL_DIR/data"
  systemctl stop "${SERVICE_NAME}.service" 2>/dev/null || true

  if [[ -f "${INSTALL_DIR}/data/neopaste.db" ]]; then
    if [[ "$ASSUME_YES" -eq 1 ]]; then
      if [[ "${NEOPASTE_WIPE_DATA:-0}" == "1" ]]; then
        rm -f "${INSTALL_DIR}/data/neopaste.db" "${INSTALL_DIR}/data/neopaste.db"-*
      fi
    else
      if confirm "Wipe existing database (pastes + admin)?" "N"; then
        rm -f "${INSTALL_DIR}/data/neopaste.db" "${INSTALL_DIR}/data/neopaste.db"-*
      else
        echo "Keeping database. New admin password applies only if no admin exists yet."
        # Still write pass for first-boot case; existing admin ignores it
      fi
    fi
  fi

  install -m 755 "$BINARY_SRC" "$INSTALL_DIR/neopaste"
  chown -R neopaste:neopaste "$INSTALL_DIR"

  write_unit "$port" "$site_name" "$admin_user" "$admin_pass" "$session_secret" "1"

  local ip cred
  ip="$(server_ip)"
  cred="${INSTALL_DIR}/data/INSTALL_CREDENTIALS.txt"
  cat > "$cred" <<EOF
NeoPaste install credentials — delete after saving somewhere safe
URL:      http://${ip}:${port}
Admin:    http://${ip}:${port}/admin
Username: ${admin_user}
Password: ${admin_pass}
Site:     ${site_name}
EOF
  chmod 600 "$cred"
  chown neopaste:neopaste "$cred"

  systemctl daemon-reload
  systemctl enable --now "${SERVICE_NAME}.service"
  systemctl restart "${SERVICE_NAME}.service" 2>/dev/null || true

  sleep 1
  if systemctl is-active --quiet "${SERVICE_NAME}.service"; then
    sed -i '/NEOPASTE_ADMIN_PASS=/d' "$SERVICE_FILE"
    systemctl daemon-reload
    echo "Service is active."
  else
    echo "Warning: service did not start. Status:" >&2
    systemctl status "${SERVICE_NAME}.service" --no-pager >&2 || true
    journalctl -u "${SERVICE_NAME}.service" -n 40 --no-pager >&2 || true
  fi

  echo
  echo "======================================"
  echo "NeoPaste is ready"
  echo "URL:       http://${ip}:${port}"
  echo "Admin:     http://${ip}:${port}/admin"
  echo "Username:  ${admin_user}"
  echo "Password:  ${admin_pass}"
  echo "Site name: ${site_name}"
  echo "======================================"
  echo "Credentials also saved to: ${cred}"
  echo "Delete that file after you save the password."
  echo
}

choose_mode() {
  if [[ -n "$MODE" ]]; then
    return 0
  fi
  if ! installed; then
    MODE=install
    return 0
  fi
  if [[ "$ASSUME_YES" -eq 1 ]]; then
    MODE=update
    return 0
  fi
  if [[ ! -r /dev/tty ]]; then
    MODE=update
    return 0
  fi

  echo "NeoPaste is already installed at ${INSTALL_DIR}"
  echo
  echo "  1) Update   (replace binary, keep data & admin)"
  echo "  2) Install  (fresh setup, can reset admin)"
  echo "  3) Uninstall"
  echo "  4) Cancel"
  echo
  prompt "Choose" "1"
  case "$REPLY" in
    2) MODE=install ;;
    3) MODE=uninstall ;;
    4|q|Q) echo "Cancelled."; exit 0 ;;
    *) MODE=update ;;
  esac
}

require_root
choose_mode

case "$MODE" in
  uninstall) do_uninstall ;;
  update) do_update ;;
  install) do_install ;;
  *) echo "Unknown mode: $MODE" >&2; exit 1 ;;
esac
