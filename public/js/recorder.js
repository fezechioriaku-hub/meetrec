// ─── State ────────────────────────────────────────────────────────────────────
let mediaRecorder  = null;
let stream         = null;
let recordingId    = null;
let recordingStart = null;
let pausedAt       = null;
let totalPausedMs  = 0;
let timerInterval  = null;
let chunks         = [];
let isRecording    = false;
let isPaused       = false;

// ─── DOM ──────────────────────────────────────────────────────────────────────
const startBtn      = document.getElementById('startBtn');
const pauseBtn      = document.getElementById('pauseBtn');
const stopBtn       = document.getElementById('stopBtn');
const statusRing    = document.getElementById('statusRing');
const timerEl       = document.getElementById('timer');
const recLabelEl    = document.getElementById('recLabel');
const recIconEl     = document.getElementById('recIcon');
const previewBox    = document.getElementById('previewBox');
const previewVideo  = document.getElementById('previewVideo');
const uploadProg    = document.getElementById('uploadProgress');
const progressFill  = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const autoToggle    = document.getElementById('autoRecToggle');
const autoToggleLabel = document.getElementById('autoToggleLabel');
const audioToggle   = document.getElementById('audioToggle');

// ─── Settings (localStorage) ─────────────────────────────────────────────────
function getSetting(key, def) {
  const val = localStorage.getItem(`meetrec_${key}`);
  if (val === null) return def;
  try { return JSON.parse(val); } catch { return val; }
}
function setSetting(key, val) {
  localStorage.setItem(`meetrec_${key}`, JSON.stringify(val));
}

// ─── Init toggles ─────────────────────────────────────────────────────────────
const autoRecordOn = getSetting('autoRecord', false);
if (autoRecordOn) autoToggle.classList.add('on');
if (getSetting('audio', true)) audioToggle.classList.add('on');
updateAutoToggleLabel();

// ─── Auto-record toggle ───────────────────────────────────────────────────────
// Clicking this toggle:
//   ON  → saves setting + starts recording immediately right now
//   OFF → saves setting + stops recording (if running)
autoToggle.addEventListener('click', async () => {
  if (isRecording) {
    // Turning OFF while recording → stop
    autoToggle.classList.remove('on');
    setSetting('autoRecord', false);
    updateAutoToggleLabel();
    stopRecording();
    toast('Auto-record disabled. Recording stopped.', 'info');
  } else {
    // Turning ON → save + start recording now
    autoToggle.classList.add('on');
    setSetting('autoRecord', true);
    updateAutoToggleLabel();
    toast('Auto-record enabled — starting now…', 'info');
    await startRecording();
  }
});

function updateAutoToggleLabel() {
  if (!autoToggleLabel) return;
  const on = autoToggle.classList.contains('on');
  autoToggleLabel.textContent = on
    ? 'Recording will auto-start on every visit ✓'
    : 'Enable to auto-start recording on every visit';
}

audioToggle.addEventListener('click', () => {
  if (isRecording) {
    toast('Cannot change audio setting while recording', 'error');
    return;
  }
  audioToggle.classList.toggle('on');
  setSetting('audio', audioToggle.classList.contains('on'));
});

// ─── Timer ───────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

function getElapsedMs() {
  if (!recordingStart) return 0;
  const now = isPaused ? pausedAt : Date.now();
  return now - recordingStart - totalPausedMs;
}

function updateTimer() {
  const elapsed = Math.floor(getElapsedMs() / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  timerEl.textContent = `${h}:${pad(m)}:${pad(s)}`;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { info: 'ℹ️', success: '✅', error: '❌' };
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// ─── UI state ─────────────────────────────────────────────────────────────────
function setUIState(state) {
  statusRing.className = `rec-status-ring ${
    state === 'recording' ? 'recording' : state === 'paused' ? 'paused' : ''
  }`;

  if (state === 'idle') {
    recIconEl.textContent  = '⏺';
    recLabelEl.textContent = 'Ready to record';
    timerEl.textContent    = '0:00:00';
    startBtn.style.display = '';
    pauseBtn.style.display = 'none';
    stopBtn.style.display  = 'none';
    previewBox.classList.remove('visible');
  } else if (state === 'recording') {
    recIconEl.textContent  = '🔴';
    recLabelEl.textContent = 'Recording in progress…';
    startBtn.style.display = 'none';
    pauseBtn.style.display = '';
    stopBtn.style.display  = '';
    pauseBtn.innerHTML     = '⏸ Pause';
    previewBox.classList.add('visible');
  } else if (state === 'paused') {
    recIconEl.textContent  = '⏸';
    recLabelEl.textContent = 'Paused — click Resume to continue';
    startBtn.style.display = 'none';
    pauseBtn.style.display = '';
    stopBtn.style.display  = '';
    pauseBtn.innerHTML     = '▶ Resume';
  } else if (state === 'uploading') {
    recIconEl.textContent  = '⬆️';
    recLabelEl.textContent = 'Saving recording to server…';
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'none';
    stopBtn.style.display  = 'none';
    previewBox.classList.remove('visible');
  }
}

// ─── Start recording ──────────────────────────────────────────────────────────
async function startRecording() {
  if (isRecording) return;

  try {
    startBtn.disabled = true;
    startBtn.innerHTML = '⏳ Requesting permission…';

    const wantAudio = getSetting('audio', true);

    const constraints = { video: { cursor: 'always', frameRate: { ideal: 30, max: 60 } } };
    if (wantAudio) {
      constraints.audio = { echoCancellation: false, noiseSuppression: false, sampleRate: 44100 };
    }

    stream = await navigator.mediaDevices.getDisplayMedia(constraints);

    // Try to mix in microphone
    if (wantAudio) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        mic.getAudioTracks().forEach(t => stream.addTrack(t));
      } catch { /* microphone is optional */ }
    }

    // Show live preview
    previewVideo.srcObject = stream;

    // Register session with server
    const res = await fetch('/api/recordings/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: null }),
    });
    const session = await res.json();
    recordingId = session.id;

    // Pick best supported codec
    const mimeType = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ].find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';

    chunks = [];
    mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 3_000_000,
      audioBitsPerSecond: 128_000,
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data?.size > 0) chunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      clearInterval(timerInterval);
      await uploadRecording();
    };
    mediaRecorder.onerror = (e) => {
      toast(`Recorder error: ${e.error?.message || 'Unknown'}`, 'error');
      isRecording = false;
      setUIState('idle');
    };

    mediaRecorder.start(5000); // collect data every 5s
    isRecording = true;
    isPaused = false;
    recordingStart = Date.now();
    totalPausedMs = 0;

    timerInterval = setInterval(updateTimer, 500);
    setUIState('recording');

    // Mark that permission was successfully granted
    setSetting('permissionGranted', true);

    // If user kills the browser's screen-share toolbar → auto stop
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (isRecording) stopRecording();
    });

    toast('🔴 Recording started!', 'success');

  } catch (err) {
    startBtn.disabled = false;
    startBtn.innerHTML = '⏺ Start Recording';

    if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
      toast('Permission denied or screen-share cancelled.', 'error');
      // If auto-record was what triggered this, disable it so it doesn't loop
      if (autoToggle.classList.contains('on')) {
        autoToggle.classList.remove('on');
        setSetting('autoRecord', false);
        updateAutoToggleLabel();
      }
      setSetting('permissionGranted', false);
    } else {
      toast(`Failed to start: ${err.message}`, 'error');
    }
  }
}

// ─── Pause / Resume ───────────────────────────────────────────────────────────
function togglePause() {
  if (!mediaRecorder) return;

  if (!isPaused) {
    mediaRecorder.pause();
    isPaused = true;
    pausedAt = Date.now();
    setUIState('paused');
    toast('Recording paused', 'info');
  } else {
    totalPausedMs += Date.now() - pausedAt;
    pausedAt = null;
    mediaRecorder.resume();
    isPaused = false;
    setUIState('recording');
    toast('Recording resumed', 'success');
  }
}

// ─── Stop recording ───────────────────────────────────────────────────────────
function stopRecording() {
  if (!mediaRecorder || !isRecording) return;
  isRecording = false;

  if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  previewVideo.srcObject = null;
  setUIState('uploading');
}

// ─── Upload ───────────────────────────────────────────────────────────────────
async function uploadRecording() {
  if (!recordingId || chunks.length === 0) {
    setUIState('idle');
    return;
  }

  uploadProg.classList.add('visible');
  progressFill.style.width = '0%';
  progressLabel.textContent = 'Preparing upload…';

  const blob     = new Blob(chunks, { type: 'video/webm' });
  const duration = Math.floor(getElapsedMs() / 1000);
  const formData = new FormData();
  formData.append('video', blob, `${recordingId}.webm`);
  formData.append('duration', duration);

  try {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/recordings/${recordingId}/upload`);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          progressFill.style.width = `${pct}%`;
          progressLabel.textContent = `Uploading… ${pct}%`;
        }
      });
      xhr.addEventListener('load', () => {
        xhr.status >= 200 && xhr.status < 300
          ? resolve(JSON.parse(xhr.responseText))
          : reject(new Error(`HTTP ${xhr.status}`));
      });
      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.send(formData);
    });

    progressFill.style.width = '100%';
    progressLabel.textContent = '✅ Saved! Going to dashboard…';
    toast('Recording saved!', 'success');
    setTimeout(() => { window.location.href = '/'; }, 1800);

  } catch (err) {
    toast(`Upload failed: ${err.message}`, 'error');
    uploadProg.classList.remove('visible');
    setUIState('idle');
  }

  chunks = [];
  recordingId = null;
  recordingStart = null;
}

// ─── Button events ────────────────────────────────────────────────────────────
startBtn.addEventListener('click', startRecording);
pauseBtn.addEventListener('click', togglePause);
stopBtn.addEventListener('click', stopRecording);

// ─── Auto-record on page load ─────────────────────────────────────────────────
// Fires if the user previously enabled the toggle AND successfully granted permission.
// This is what makes "startup auto-record" work — every time the page opens, it goes.
window.addEventListener('load', () => {
  const shouldAutoRecord  = getSetting('autoRecord', false);
  const permissionGranted = getSetting('permissionGranted', false);

  if (shouldAutoRecord && permissionGranted) {
    recLabelEl.textContent = '⏳ Auto-record starting in 1s…';
    setTimeout(async () => {
      await startRecording();
    }, 1000);
  }
});
