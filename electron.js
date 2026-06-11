const { app, BrowserWindow, Tray, Menu, shell, nativeImage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');

const PORT = 3000;
let tray       = null;
let serverProc = null;
let mainWin    = null;
let recorderWin = null;
let serverReady = false;

// ─── Register at startup ──────────────────────────────────────────────────────
app.setLoginItemSettings({ openAtLogin: true });
if (process.platform === 'darwin') {
  try { app.dock.hide(); } catch {}
}

// ─── Start Express server ─────────────────────────────────────────────────────
function startServer() {
  const serverPath = path.join(__dirname, 'server.js');
  serverProc = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProc.stdout.on('data', (data) => {
    const msg = data.toString();
    console.log('[Server]', msg);
    if (msg.includes('MeetRec Server Running') && !serverReady) {
      serverReady = true;
      onServerReady();
    }
  });

  serverProc.stderr.on('data', (d) => console.error('[Server Error]', d.toString()));
  serverProc.on('exit', (code) => console.log('[Server] Exited with code:', code));
}

// ─── On server ready ──────────────────────────────────────────────────────────
function onServerReady() {
  createTray();
  // Auto-open recorder in background
  openRecorder();
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function createTray() {
  const iconData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAzklEQVRYR+2WMQ6DMAxFnydoD8AROEKPwFE5BEdgL3fgJkxIJBQgJFYEqKr6F7aSFSfPzx8nhpmZ3VprFwB+cM7dAXzWWneqiohkZi4AMIAGwMys1Fp3VQ0RyczeALB3AIiZExFJRISZuQDAFIAxgDGAMYAhgCGAIYCh9T8A7IAVsAJWwApYASvg+Q/YASdgB6yAFbACVsAKWAErYAWsgBVQBVQBVUAVUAVUAVVAFVAFVAFVQBVQBVQBVUAVUAVUAVVAFVAFVAFVQBVQBVQBVUAVUAVUAVVAFVAFVAHVD4MvNgBjAAAAAElFTkSuQmCC';
  const img = nativeImage.createFromDataURL(iconData);

  tray = new Tray(img);
  tray.setToolTip('MeetRec — Meeting Recorder');

  const menu = Menu.buildFromTemplate([
    { label: '🔴 MeetRec', enabled: false },
    { type: 'separator' },
    {
      label: '📊 Open Dashboard',
      click: () => openDashboard(),
    },
    {
      label: '⏺ New Recording',
      click: () => openRecorder(),
    },
    { type: 'separator' },
    {
      label: '🌐 Open in Browser',
      click: () => shell.openExternal(`http://localhost:${PORT}`),
    },
    { type: 'separator' },
    { label: '❌ Quit MeetRec', click: () => app.quit() },
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => tray.popUpContextMenu());
}

// ─── Windows ──────────────────────────────────────────────────────────────────
function openDashboard() {
  if (mainWin) { mainWin.show(); mainWin.focus(); return; }

  mainWin = new BrowserWindow({
    width: 1200, height: 800,
    title: 'MeetRec',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  mainWin.loadURL(`http://localhost:${PORT}`);
  mainWin.on('closed', () => { mainWin = null; });
}

function openRecorder() {
  if (recorderWin) { recorderWin.show(); recorderWin.focus(); return; }

  recorderWin = new BrowserWindow({
    width: 800, height: 700,
    title: 'MeetRec — Recording',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  recorderWin.loadURL(`http://localhost:${PORT}/record`);
  recorderWin.on('closed', () => { recorderWin = null; });
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startServer();
  // Show a startup notification after 3s
  setTimeout(() => {
    if (!serverReady) {
      console.warn('Server taking longer than expected to start…');
    }
  }, 3000);
});

app.on('window-all-closed', (e) => e.preventDefault()); // keep running in tray

app.on('before-quit', () => {
  if (serverProc) {
    serverProc.kill();
    serverProc = null;
  }
});
