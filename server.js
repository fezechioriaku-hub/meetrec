const express = require('express');
const multer  = require('multer');
const cors    = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Directories ──────────────────────────────────────────────────────────────
const DATA_DIR       = path.join(__dirname, 'data');
const RECORDINGS_DIR = path.join(__dirname, 'recordings');
const META_FILE      = path.join(DATA_DIR, 'recordings.json');

[DATA_DIR, RECORDINGS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});
if (!fs.existsSync(META_FILE)) fs.writeFileSync(META_FILE, '[]');

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Multer — video upload ────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RECORDINGS_DIR),
  filename: (req, file, cb) => {
    const id = req.params.id;
    cb(null, `${id}.webm`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5 GB max
});

// ─── Metadata helpers ─────────────────────────────────────────────────────────
function readMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf8')); }
  catch { return []; }
}
function writeMeta(data) {
  fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2));
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// List all recordings
app.get('/api/recordings', (req, res) => {
  const recordings = readMeta().sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
  res.json(recordings);
});

// Create a new recording session (called when recording starts)
app.post('/api/recordings/start', (req, res) => {
  const { title } = req.body;
  const id      = uuidv4();
  const shareId = uuidv4().split('-')[0]; // short ID for sharing

  const record = {
    id,
    shareId,
    title: title || `Meeting — ${new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })}`,
    filename: null,   // set after upload
    duration: 0,
    size: 0,
    status: 'recording',
    createdAt: new Date().toISOString(),
    shareUrl: null,
  };

  const meta = readMeta();
  meta.push(record);
  writeMeta(meta);

  res.json(record);
});

// Upload video blob after recording stops
app.post('/api/recordings/:id/upload', upload.single('video'), (req, res) => {
  const { id } = req.params;
  const { duration } = req.body;

  const meta = readMeta();
  const idx  = meta.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded' });

  meta[idx].filename  = file.filename;
  meta[idx].size      = file.size;
  meta[idx].duration  = parseFloat(duration) || 0;
  meta[idx].status    = 'ready';
  meta[idx].shareUrl  = `/watch?id=${meta[idx].shareId}`;
  writeMeta(meta);

  res.json(meta[idx]);
});

// Update recording title
app.patch('/api/recordings/:id', (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  const meta = readMeta();
  const idx  = meta.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (title) meta[idx].title = title;
  writeMeta(meta);
  res.json(meta[idx]);
});

// Delete a recording
app.delete('/api/recordings/:id', (req, res) => {
  const { id } = req.params;
  let meta = readMeta();
  const record = meta.find(r => r.id === id);
  if (!record) return res.status(404).json({ error: 'Not found' });

  // Delete video file
  if (record.filename) {
    const filePath = path.join(RECORDINGS_DIR, record.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  meta = meta.filter(r => r.id !== id);
  writeMeta(meta);
  res.json({ success: true });
});

// Get recording by share ID (public — no auth required)
app.get('/api/share/:shareId', (req, res) => {
  const meta   = readMeta();
  const record = meta.find(r => r.shareId === req.params.shareId);
  if (!record || record.status !== 'ready') {
    return res.status(404).json({ error: 'Recording not found' });
  }
  res.json(record);
});

// Stream video file
app.get('/recordings/:filename', (req, res) => {
  const filePath = path.join(RECORDINGS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found');

  const stat = fs.statSync(filePath);
  const range = req.headers.range;

  if (range) {
    // Support range requests for video seeking
    const parts  = range.replace(/bytes=/, '').split('-');
    const start  = parseInt(parts[0], 10);
    const end    = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': chunkSize,
      'Content-Type':   'video/webm',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type':   'video/webm',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ─── SPA fallbacks ────────────────────────────────────────────────────────────
app.get('/watch', (req, res) => res.sendFile(path.join(__dirname, 'public', 'watch.html')));
app.get('/record', (req, res) => res.sendFile(path.join(__dirname, 'public', 'record.html')));

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  const ips = Object.values(interfaces)
    .flat()
    .filter(i => i.family === 'IPv4' && !i.internal)
    .map(i => i.address);

  console.log('\n🔴 MeetRec Server Running\n');
  console.log(`  Local:   http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  Network: http://${ip}:${PORT}  ← share this with other devices`));
  console.log('\n  Open the Local URL in your browser to start.\n');
});
