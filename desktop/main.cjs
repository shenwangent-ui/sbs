const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const LIVE_URL =
  process.env.SBS_APP_URL ||
  'https://ais-pre-brb74sikfl77hnu7quzboq-74288553499.asia-southeast1.run.app';

const ARGS = new Set(process.argv.slice(1));
const OS_SHELL_MODE =
  ARGS.has('--os-shell') ||
  ARGS.has('--kiosk') ||
  process.env.SBS_OS_EMBEDDED === '1';
const KIOSK_MODE = ARGS.has('--kiosk');
const FULLSCREEN_MODE = ARGS.has('--fullscreen');

let mainWindow = null;

function createAppWindow(targetUrl, isChild = false) {
  const win = new BrowserWindow({
    width: isChild ? 1140 : 1280,
    height: isChild ? 760 : 820,
    minWidth: 390,
    minHeight: 640,
    fullscreen: !isChild && FULLSCREEN_MODE,
    kiosk: !isChild && KIOSK_MODE,
    title: 'SBS Engine | Shenwang Search',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: 'persist:shenwang-os',
    },
  });

  // In a custom OS without an external browser, keep all popups & links inside SBS Search windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      if (OS_SHELL_MODE || process.env.SBS_USE_EXTERNAL_BROWSER !== '1') {
        createAppWindow(url, true);
      } else {
        shell.openExternal(url).catch(() => {
          createAppWindow(url, true);
        });
      }
    }
    return { action: 'deny' };
  });

  win.loadURL(targetUrl).catch(() => {
    const fallbackFile = path.join(__dirname, '..', 'dist', 'index.html');
    win.loadFile(fallbackFile);
  });

  return win;
}

function createWindow() {
  Menu.setApplicationMenu(null);
  mainWindow = createAppWindow(LIVE_URL, false);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
