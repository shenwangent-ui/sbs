const { app, BrowserWindow, Menu, shell, ipcMain, session } = require('electron');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
const path = require('path');
const fs = require('fs');
const http = require('http');

const ARGS = new Set(process.argv.slice(1));
const OS_SHELL_MODE = ARGS.has('--os-shell') || ARGS.has('--kiosk') || process.env.SBS_OS_EMBEDDED === '1';
const KIOSK_MODE = ARGS.has('--kiosk');
const FULLSCREEN_MODE = ARGS.has('--fullscreen');
const SYNC_BACKEND = (process.env.SBS_SYNC_SERVER || 'http://127.0.0.1:3000').replace(/\/+$/, '');

let localPort = 0;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function startEmbeddedWebServer() {
  const possibleDist = [
    path.join(__dirname, '..', 'dist'),
    path.join(app.getAppPath(), 'dist'),
    path.join(process.resourcesPath || '', 'app.asar', 'dist'),
    path.join(process.resourcesPath || '', 'app', 'dist'),
    path.join(process.resourcesPath || '', 'dist')
  ];
  const distDir = possibleDist.find(p => fs.existsSync(path.join(p, 'index.html'))) || possibleDist[0];
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const reqUrl = req.url || '/';

      // เชื่อมต่อ /api/* เข้ากับ Backend Server กลางเพื่อซิงค์ Shenwang Account
      if (reqUrl.startsWith('/api/')) {
        const target = new URL(reqUrl, SYNC_BACKEND);
        const proxyReq = http.request(
          {
            hostname: target.hostname,
            port: target.port || 80,
            path: target.pathname + target.search,
            method: req.method,
            headers: { ...req.headers, host: target.host },
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.pipe(res);
          }
        );
        proxyReq.on('error', () => {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ซิงค์ข้อมูลได้' }));
        });
        req.pipe(proxyReq);
        return;
      }

      let cleanPath = reqUrl.split('?')[0];
      if (cleanPath === '/' || cleanPath === '') cleanPath = '/index.html';
      let filePath = path.join(distDir, cleanPath);

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }

      if (!fs.existsSync(filePath)) {
        res.writeHead(302, { Location: 'https://sbs.swplayer.online' + reqUrl });
        res.end();
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      localPort = server.address().port;
      resolve(localPort);
    });
  });
}

function injectFindInPageOverlay(win) {
  const script = `
    (function() {
      if (window.__sbsFindInstalled) return;
      window.__sbsFindInstalled = true;
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
          e.preventDefault();
          let box = document.getElementById('sbs-find-bar');
          if (!box) {
            box = document.createElement('div');
            box.id = 'sbs-find-bar';
            box.style.cssText = 'position:fixed;top:12px;right:16px;z-index:999999;background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:6px 10px;box-shadow:0 8px 24px rgba(0,0,0,0.15);display:flex;align-items:center;gap:6px;font-family:sans-serif;';
            box.innerHTML = '<input id="sbs-find-input" placeholder="ค้นหาในหน้าเว็บ..." style="border:none;outline:none;font-size:13px;width:180px;color:#0f172a;" /><button id="sbs-find-next" style="background:#154EC1;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:12px;cursor:pointer;">ถัดไป</button><button id="sbs-find-close" style="background:transparent;border:none;font-size:14px;cursor:pointer;color:#64748b;">✕</button>';
            document.body.appendChild(box);
            const inp = document.getElementById('sbs-find-input');
            inp.addEventListener('keydown', (ev) => {
              if (ev.key === 'Enter') window.find(inp.value, false, ev.shiftKey, true);
              if (ev.key === 'Escape') box.remove();
            });
            document.getElementById('sbs-find-next').onclick = () => window.find(inp.value, false, false, true);
            document.getElementById('sbs-find-close').onclick = () => box.remove();
          }
          document.getElementById('sbs-find-input').focus();
        }
      });
    })();
  `;
  win.webContents.executeJavaScript(script).catch(() => {});
}

function createAppWindow(targetUrl, options = {}) {
  const { isChild = false, isIncognito = false } = options;
  const partition = isIncognito
    ? `incognito-${Date.now()}-${Math.random()}`
    : 'persist:shenwang-desktop';

  const win = new BrowserWindow({
    width: isChild ? 1180 : 1320,
    height: isChild ? 780 : 840,
    minWidth: 420,
    minHeight: 600,
    fullscreen: !isChild && FULLSCREEN_MODE,
    kiosk: !isChild && KIOSK_MODE,
    title: isIncognito
      ? 'SBS Search (โหมดไม่ระบุตัวตน)'
      : 'SBS Search — Shenwang Desktop Browser',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition,
    },
  });

  win.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 SBSDesktop/2.2'
  );

  win.webContents.on('did-finish-load', () => {
    injectFindInPageOverlay(win);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      createAppWindow(url, { isChild: true, isIncognito });
    }
    return { action: 'deny' };
  });

  const homeUrl = targetUrl || `http://127.0.0.1:${localPort}/`;
  win.loadURL(homeUrl).catch(() => {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  });

  return win;
}

function setupDesktopMenu() {
  const template = [
    {
      label: 'ไฟล์และแท็บ (Tabs)',
      submenu: [
        {
          label: 'หน้าแรก SBS Search',
          accelerator: 'Alt+Home',
          click: (_, win) => win && win.loadURL(`http://127.0.0.1:${localPort}/`),
        },
        {
          label: 'เปิดหน้าต่างใหม่',
          accelerator: 'CmdOrCtrl+T',
          click: () => createAppWindow(`http://127.0.0.1:${localPort}/`, { isChild: true }),
        },
        {
          label: 'เปิดหน้าต่างไม่ระบุตัวตน (Incognito)',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () =>
            createAppWindow(`http://127.0.0.1:${localPort}/`, {
              isChild: true,
              isIncognito: true,
            }),
        },
        { type: 'separator' },
        { label: 'ปิดหน้าต่าง', accelerator: 'CmdOrCtrl+W', role: 'close' },
        { label: 'ออกจากโปรแกรม', accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: 'การนำทาง (Navigation)',
      submenu: [
        {
          label: 'ย้อนกลับ',
          accelerator: 'Alt+Left',
          click: (_, win) => win && win.webContents.canGoBack() && win.webContents.goBack(),
        },
        {
          label: 'ไปข้างหน้า',
          accelerator: 'Alt+Right',
          click: (_, win) => win && win.webContents.canGoForward() && win.webContents.goForward(),
        },
        {
          label: 'โหลดหน้าซ้ำ',
          accelerator: 'CmdOrCtrl+R',
          click: (_, win) => win && win.webContents.reload(),
        },
      ],
    },
    {
      label: 'เครื่องมือ (Tools)',
      submenu: [
        {
          label: 'ลบข้อมูลการท่องเว็บ (แคชและคุกกี้)',
          accelerator: 'CmdOrCtrl+Shift+Delete',
          click: async (_, win) => {
            if (!win) return;
            await win.webContents.session.clearCache();
            await win.webContents.session.clearStorageData();
            win.webContents.reload();
          },
        },
        { type: 'separator' },
        { label: 'ซูมเข้า', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: 'ซูมออก', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: 'ขนาดปกติ', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'โหมดเต็มจอ (Fullscreen)', accelerator: 'F11', role: 'togglefullscreen' },
        {
          label: 'เครื่องมือนักพัฒนา (DevTools)',
          accelerator: 'F12',
          click: (_, win) => win && win.webContents.toggleDevTools(),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  await startEmbeddedWebServer();
  setupDesktopMenu();
  createAppWindow("https://sbs.swplayer.online/");

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createAppWindow("https://sbs.swplayer.online/");
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
