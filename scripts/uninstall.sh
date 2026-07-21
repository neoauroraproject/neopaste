#!/usr/bin/env bash
set -euo pipefail
# Thin wrapper — prefer: sudo bash install.sh --uninstall
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/install.sh" --uninstall "$@"
