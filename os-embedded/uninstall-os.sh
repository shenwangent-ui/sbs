#!/usr/bin/env bash
# ==============================================================================
# SBS Browser - Custom OS Embedded Uninstaller
# ==============================================================================

set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: This uninstaller must be run as root or with sudo." >&2
  exit 1
fi

echo "Stopping and disabling sbs-browser.service..."
if command -v systemctl >/dev/null 2>&1; then
  systemctl stop sbs-browser.service 2>/dev/null || true
  systemctl disable sbs-browser.service 2>/dev/null || true
  rm -f /etc/systemd/system/sbs-browser.service
  systemctl daemon-reload 2>/dev/null || true
fi

pkill -f "node.*server.js" 2>/dev/null || true

echo "Removing binary wrappers and desktop entries..."
rm -f /usr/local/bin/sbs-browser
rm -f /usr/bin/sbs-browser
rm -f /usr/share/applications/sbs-browser.desktop
rm -f /usr/share/icons/hicolor/512x512/apps/sbs-browser.png

echo "Removing /opt/sbs-browser..."
rm -rf /opt/sbs-browser

echo "SBS Browser has been cleanly uninstalled from the system."
