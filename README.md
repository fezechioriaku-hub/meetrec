# 🔴 MeetRec — Meeting Recorder

**Record meetings, share links, auto-start on boot.**

---

## ✅ Requirements

Install **Node.js LTS** from: **https://nodejs.org**

> After installing, open a new terminal and verify: `node --version`

---

## 🚀 Quick Start (Web Demo)

```powershell
# In this folder:
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

---

## 📡 Two-Device Testing

When the server starts, it prints your local network IP:

```
  Local:   http://localhost:3000
  Network: http://192.168.1.45:3000  ← open this on any device on same WiFi
```

**Device 1 (your PC):**
1. Open `http://localhost:3000/record`
2. Click "Start Recording" → grant screen permission
3. Record something → click "Stop & Save"

**Device 2 (phone/tablet/another PC on same WiFi):**
1. Open `http://192.168.1.XX:3000` (your network IP from above)
2. See the recording appear in the dashboard
3. Click "Share" → copy the link → open on any device

---

## 🎯 Features

### Recording
- Click **"⏺ New Recording"** from the dashboard
- Grant screen permission (only once needed)
- Enable **"Auto-record on startup"** toggle → future visits auto-start
- Pause / Resume / Stop controls
- Live preview while recording
- Automatically uploads when stopped

### Dashboard
- All recordings visible in a grid with thumbnail preview
- Search by title
- Stats: total count, total duration, storage used
- Auto-refreshes every 5s (picks up recordings from other devices instantly)

### Sharing
- Every recording gets a **unique share link**
- Click **"📤 Share"** → copy link → send to participants
- Participants can watch in any browser — **no login required**
- Download button on the watch page
- Web Share API on mobile (share via WhatsApp, email, etc.)

### Auto-Record
- Enable the "Auto-record on startup" toggle on the record page
- Next time you open `/record`, recording starts automatically
- For full desktop auto-start: use the Electron version (below)

---

## 🖥️ Desktop App (Electron)

Wraps the web app in a desktop app with system tray + Windows auto-start:

```powershell
npm run electron
```

The app will:
- Launch silently in the background
- Show a tray icon (bottom-right in Windows)
- Auto-open the recorder window
- Register to start with Windows

**Build installer:**
```powershell
npm run build:win   # → dist/MeetRec Setup.exe
```

---

## 📁 Where Are Files Stored?

| What | Location |
|---|---|
| Recording videos | `./recordings/*.webm` |
| Recording metadata | `./data/recordings.json` |
| Server port | 3000 (change with `PORT=3001 npm start`) |

---

## 🎥 Video Format

Recordings are saved as `.webm` — plays in Chrome, Firefox, Edge, VLC.

**Convert to MP4** (if needed):
```bash
# Install ffmpeg from https://ffmpeg.org
ffmpeg -i recording.webm -c:v libx264 recording.mp4
```

---

## 🔧 Troubleshooting

| Problem | Solution |
|---|---|
| `npm` not recognized | Install Node.js from nodejs.org, restart terminal |
| Can't see from other device | Make sure both on same WiFi; check Windows Firewall allows port 3000 |
| Recording stops unexpectedly | User dismissed the screen share dialog — click Start again |
| "No recordings yet" after recording | Check if upload succeeded (watch for redirect after Stop) |

---

## 🏗️ File Structure

```
meetingrecorder/
├── server.js           ← Express API + file server
├── electron.js         ← Desktop wrapper (optional)
├── package.json
├── data/
│   └── recordings.json ← Recording metadata
├── recordings/         ← Video files
└── public/
    ├── index.html      ← Dashboard
    ├── record.html     ← Recorder
    ├── watch.html      ← Shareable player
    ├── css/main.css
    └── js/
        ├── dashboard.js
        ├── recorder.js
        └── player.js
```
