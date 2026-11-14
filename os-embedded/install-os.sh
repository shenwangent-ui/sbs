#!/usr/bin/env bash
# ==============================================================================
# SBS Browser - Custom OS Embedded Installer
# Installs SBS Browser as a Core System Service & Default OS Web Browser
# (Similar to Google Chrome in ChromeOS/Android & Microsoft Edge in Windows)
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

INSTALL_PREFIX="/opt/sbs-browser"
CONFIG_DIR="/etc/sbs-browser"
BIN_DIR="/usr/local/bin"
DESKTOP_DIR="/usr/share/applications"
ICON_DIR="/usr/share/icons/hicolor/512x512/apps"

echo "=================================================================="
echo "    SBS Browser - Server-Side Web Browser & OS Daemon Installer   "
echo "=================================================================="

# Check for root privileges
if [ "$(id -u)" -ne 0 ]; then
  echo "Error: This installer must be run as root or with sudo." >&2
  echo "Usage: sudo ./install-os.sh" >&2
  exit 1
fi

echo "[1/7] Checking runtime prerequisites..."
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Installing Node.js LTS..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y nodejs
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache nodejs npm
  elif command -v pacman >/dev/null 2>&1; then
    pacman -Sy --noconfirm nodejs npm
  else
    echo "Warning: Could not automatically install Node.js. Please install Node.js v18+ manually."
  fi
fi

NODE_VERSION="$(node -v 2>/dev/null || echo 'unknown')"
echo "Found Node.js: ${NODE_VERSION}"

echo "[2/7] Preparing application directory at ${INSTALL_PREFIX}..."
mkdir -p "${INSTALL_PREFIX}"
mkdir -p "${CONFIG_DIR}"

# Copy application files
if [ -f "${PARENT_DIR}/server.js" ] && [ -d "${PARENT_DIR}/dist" ]; then
  cp -rf "${PARENT_DIR}/server.js" "${INSTALL_PREFIX}/"
  cp -rf "${PARENT_DIR}/package.json" "${INSTALL_PREFIX}/"
  cp -rf "${PARENT_DIR}/dist" "${INSTALL_PREFIX}/"
  if [ -d "${PARENT_DIR}/desktop" ]; then
    cp -rf "${PARENT_DIR}/desktop" "${INSTALL_PREFIX}/"
  fi
  if [ -d "${PARENT_DIR}/public" ]; then
    cp -rf "${PARENT_DIR}/public" "${INSTALL_PREFIX}/"
  fi
elif [ -f "${SCRIPT_DIR}/server.js" ]; then
  cp -rf "${SCRIPT_DIR}/"* "${INSTALL_PREFIX}/"
else
  echo "Compiling production build from source..."
  if command -v npm >/dev/null 2>&1; then
    (cd "${PARENT_DIR}" && npm run build)
    cp -rf "${PARENT_DIR}/server.js" "${INSTALL_PREFIX}/"
    cp -rf "${PARENT_DIR}/package.json" "${INSTALL_PREFIX}/"
    cp -rf "${PARENT_DIR}/dist" "${INSTALL_PREFIX}/"
    if [ -d "${PARENT_DIR}/desktop" ]; then cp -rf "${PARENT_DIR}/desktop" "${INSTALL_PREFIX}/"; fi
  fi
fi

echo "[3/7] Setting up environment configuration..."
if [ ! -f "${CONFIG_DIR}/sbs-browser.env" ]; then
  cat << 'EOF' > "${CONFIG_DIR}/sbs-browser.env"
# SBS Engine / Server-Side Browser OS Configuration
PORT=3000
HOST=127.0.0.1
NODE_ENV=production
SBS_OS_EMBEDDED=1

# Optional: Add your Google Gemini API Key for AI grounding
# GEMINI_API_KEY=""
EOF
fi
chmod 600 "${CONFIG_DIR}/sbs-browser.env"

echo "[4/7] Installing system CLI launcher to ${BIN_DIR}/sbs-browser..."
cp -f "${SCRIPT_DIR}/sbs-browser" "${BIN_DIR}/sbs-browser"
chmod 755 "${BIN_DIR}/sbs-browser"
# Symlink to /usr/bin if needed
if [ -d "/usr/bin" ] && [ ! -f "/usr/bin/sbs-browser" ]; then
  ln -sf "${BIN_DIR}/sbs-browser" "/usr/bin/sbs-browser" || true
fi

echo "[5/7] Installing Desktop Entry & Icons..."
mkdir -p "${DESKTOP_DIR}"
mkdir -p "${ICON_DIR}"
cp -f "${SCRIPT_DIR}/sbs-browser.desktop" "${DESKTOP_DIR}/sbs-browser.desktop"
chmod 644 "${DESKTOP_DIR}/sbs-browser.desktop"

# Install icon
if [ -f "${PARENT_DIR}/desktop/icon.png" ]; then
  cp -f "${PARENT_DIR}/desktop/icon.png" "${ICON_DIR}/sbs-browser.png"
elif [ -f "${PARENT_DIR}/public/pwa-512x512.png" ]; then
  cp -f "${PARENT_DIR}/public/pwa-512x512.png" "${ICON_DIR}/sbs-browser.png"
fi

# Update desktop databases if available
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${DESKTOP_DIR}" || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t /usr/share/icons/hicolor || true
fi

echo "[6/7] Registering SBS Browser as Default System Browser..."
if command -v xdg-settings >/dev/null 2>&1; then
  xdg-settings set default-web-browser sbs-browser.desktop 2>/dev/null || true
fi
if command -v xdg-mime >/dev/null 2>&1; then
  xdg-mime default sbs-browser.desktop x-scheme-handler/http 2>/dev/null || true
  xdg-mime default sbs-browser.desktop x-scheme-handler/https 2>/dev/null || true
  xdg-mime default sbs-browser.desktop text/html 2>/dev/null || true
  xdg-mime default sbs-browser.desktop application/xhtml+xml 2>/dev/null || true
fi

echo "[7/7] Configuring & starting systemd service (sbs-browser.service)..."
if [ -d "/etc/systemd/system" ] && command -v systemctl >/dev/null 2>&1; then
  cp -f "${SCRIPT_DIR}/sbs-browser.service" "/etc/systemd/system/sbs-browser.service"
  systemctl daemon-reload
  systemctl enable sbs-browser.service
  systemctl restart sbs-browser.service
  echo "Service sbs-browser.service enabled and started on boot."
else
  echo "Non-systemd environment detected. Starting daemon in background..."
  (cd "${INSTALL_PREFIX}" && NODE_ENV=production PORT=3000 nohup node server.js >/tmp/sbs-browser-daemon.log 2>&1 &)
fi

echo ""
echo "=================================================================="
echo " SBS Browser successfully embedded into your Operating System!   "
echo "=================================================================="
echo ""
echo "  * System Daemon:   Active on http://127.0.0.1:3000"
echo "  * CLI Launcher:    sbs-browser [URL or search query]"
echo "  * Service Control: systemctl status sbs-browser"
echo "  * Configuration:   ${CONFIG_DIR}/sbs-browser.env"
echo "  * Default Browser: Registered in XDG / mimeapps.list"
echo ""
echo "Try running:"
echo "  sbs-browser https://th.wikipedia.org"
echo "  sbs-browser --search 'ข่าววันนี้'"
echo ""
