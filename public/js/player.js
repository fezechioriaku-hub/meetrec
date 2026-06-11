// ─── Utils ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${{ info: 'ℹ️', success: '✅', error: '❌' }[type] || 'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function formatDuration(seconds) {
  if (!seconds) return 'Unknown duration';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatBytes(bytes) {
  if (!bytes) return 'Unknown size';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Load recording from URL ──────────────────────────────────────────────────
async function loadRecording() {
  const params  = new URLSearchParams(location.search);
  const shareId = params.get('id');

  if (!shareId) {
    showError();
    return;
  }

  try {
    const res = await fetch(`/api/share/${shareId}`);
    if (!res.ok) { showError(); return; }
    const recording = await res.json();
    renderPlayer(recording);
  } catch (err) {
    showError();
  }
}

function showError() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('errorState').style.display = '';
}

function renderPlayer(r) {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('playerWrap').style.display = '';
  document.title = `${r.title} — MeetRec`;

  document.getElementById('recordingTitle').textContent   = r.title;
  document.getElementById('recordingDate').textContent    = formatDate(r.createdAt);
  document.getElementById('recordingDuration').textContent = formatDuration(r.duration);
  document.getElementById('recordingSize').textContent    = formatBytes(r.size);

  const video = document.getElementById('videoPlayer');
  video.src = `/recordings/${r.filename}`;

  // Download button
  const downloadBtn = document.getElementById('downloadBtn');
  downloadBtn.href = `/recordings/${r.filename}`;
  downloadBtn.download = `${r.title}.webm`;

  // Share link
  const shareUrl = `${location.origin}/watch?id=${r.shareId}`;
  document.getElementById('shareLinkDisplay').value = shareUrl;

  // Copy buttons
  document.getElementById('copyShareBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(shareUrl);
    toast('Share link copied!', 'success');
  });
  document.getElementById('shareThisBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(shareUrl);
    toast('Share link copied to clipboard!', 'success');
  });

  // Web Share API (mobile)
  if (navigator.share) {
    const shareNativeBtn = document.createElement('button');
    shareNativeBtn.className = 'btn btn-ghost btn-lg';
    shareNativeBtn.innerHTML = '📱 Share…';
    shareNativeBtn.addEventListener('click', () => {
      navigator.share({ title: r.title, url: shareUrl });
    });
    document.querySelector('.player-actions').appendChild(shareNativeBtn);
  }
}

loadRecording();
