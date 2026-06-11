const express = require('express');
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

// Track the last time a chunk was appended for each recording to handle timeouts accurately
const appendTimes = new Map();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Removed Multer configuration (using express.raw for append)

// ─── Metadata helpers ─────────────────────────────────────────────────────────
function readMeta() {
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf8')); }
  catch { return []; }
}
function writeMeta(data) {
  fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2));
}
function finalizeInterruptedRecordings() {
  const meta = readMeta();
  let changed = false;
  const now = Date.now();
  
  meta.forEach(r => {
    if (r.status === 'recording') {
      const filePath = path.join(RECORDINGS_DIR, `${r.id}.webm`);
      if (fs.existsSync(filePath)) {
        const lastAppend = appendTimes.has(r.id) ? appendTimes.get(r.id) : new Date(r.createdAt).getTime();
        // If the file hasn't been updated for more than 15 seconds, assume recording stopped/interrupted
        if (now - lastAppend > 15000) {
          r.status = 'ready';
          const stats = fs.statSync(filePath);
          r.size = stats.size;
          const durationMs = lastAppend - new Date(r.createdAt).getTime();
          r.duration = Math.max(0, Math.floor(durationMs / 1000));
          r.filename = `${r.id}.webm`;
          r.shareUrl = `/watch?id=${r.shareId}`;
          changed = true;
          appendTimes.delete(r.id);
        }
      } else {
        // If it was created more than 15 seconds ago but no file exists, mark as failed
        const ageMs = now - new Date(r.createdAt).getTime();
        if (ageMs > 15000) {
          r.status = 'failed';
          changed = true;
        }
      }
    }
  });
  
  if (changed) {
    writeMeta(meta);
  }
}

// ─── API Routes ───────────────────────────────────────────────────────────────

// List all recordings
app.get('/api/recordings', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  finalizeInterruptedRecordings();
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

// Append video chunk
app.post('/api/recordings/:id/append', express.raw({ type: '*/*', limit: '50mb' }), (req, res) => {
  const { id } = req.params;

  const meta = readMeta();
  const record = meta.find(r => r.id === id);
  if (!record) return res.status(404).json({ error: 'Not found' });

  const filePath = path.join(RECORDINGS_DIR, `${id}.webm`);

  try {
    if (req.body && req.body.length > 0) {
      fs.appendFileSync(filePath, req.body);
      appendTimes.set(id, Date.now());
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Append error:', err);
    res.status(500).json({ error: 'Failed to append chunk' });
  }
});

// Finalize recording after it stops
app.post('/api/recordings/:id/finalize', express.text({ type: 'text/plain' }), (req, res) => {
  const { id } = req.params;
  
  let duration = 0;
  if (typeof req.body === 'string' && req.body.trim().length > 0) {
    try { duration = JSON.parse(req.body).duration; } catch (e) {}
  } else if (req.body && req.body.duration) {
    duration = req.body.duration;
  }

  const meta = readMeta();
  const idx  = meta.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const filePath = path.join(RECORDINGS_DIR, `${id}.webm`);
  if (!fs.existsSync(filePath)) return res.status(400).json({ error: 'No file found' });

  const stats = fs.statSync(filePath);

  meta[idx].filename  = `${id}.webm`;
  meta[idx].size      = stats.size;
  meta[idx].duration  = parseFloat(duration) || meta[idx].duration || 0;
  meta[idx].status    = 'ready';
  meta[idx].shareUrl  = `/watch?id=${meta[idx].shareId}`;
  writeMeta(meta);
  appendTimes.delete(id);

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
finalizeInterruptedRecordings();
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
