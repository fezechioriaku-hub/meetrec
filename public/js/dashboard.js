// ─── Utils ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  const icons = { info: 'ℹ️', success: '✅', error: '❌' };
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function fetchRecordings() {
  const res = await fetch('/api/recordings');
  return res.json();
}

async function deleteRecording(id) {
  await fetch(`/api/recordings/${id}`, { method: 'DELETE' });
}

async function renameRecording(id, title) {
  await fetch(`/api/recordings/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

// ─── State ────────────────────────────────────────────────────────────────────
let allRecordings = [];
let activeDeleteId = null;
let activeRenameId = null;

// ─── Render ───────────────────────────────────────────────────────────────────
function renderRecordings(recordings) {
  const grid = document.getElementById('recordingsGrid');

  if (recordings.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="icon">🎬</div>
        <h3>No recordings yet</h3>
        <p>Start your first meeting recording.<br/>It will appear here automatically.</p>
        <a href="/record" class="btn btn-primary btn-lg">⏺ Start Recording</a>
      </div>`;
    return;
  }

  grid.innerHTML = recordings.map(r => {
    const shareUrl = `${location.origin}/watch?id=${r.shareId}`;
    const isReady  = r.status === 'ready';

    return `
    <div class="card rec-card" data-id="${r.id}" data-share="${r.shareId}">
      <div class="thumb">
        ${isReady
          ? `<video src="/recordings/${r.filename}#t=2" preload="metadata" muted></video>
             <div class="play-overlay"><div class="play-circle">▶</div></div>
             <div class="duration-badge">${formatDuration(r.duration)}</div>`
          : `<div class="thumb-placeholder">
               <div class="icon">🔴</div>
               <span>Recording in progress</span>
             </div>`
        }
      </div>
      <div class="rec-card-body">
        <div class="rec-title" title="${r.title}">${r.title}</div>
        <div class="rec-meta">
          <span>📅 ${formatDate(r.createdAt)}</span>
          <span>💾 ${formatBytes(r.size)}</span>
          ${r.status === 'recording'
            ? '<span><span class="badge badge-recording"><span class="badge-dot"></span> Recording</span></span>'
            : ''
          }
        </div>
      </div>
      <div class="rec-actions">
        ${isReady ? `
          <button class="btn btn-primary btn-sm play-btn" data-id="${r.id}" data-share="${r.shareId}">
            ▶ Watch
          </button>
          <button class="btn btn-ghost btn-sm share-btn" data-url="${shareUrl}" data-id="${r.id}">
            📤 Share
          </button>
        ` : ''}
        <button class="btn btn-ghost btn-sm rename-btn" data-id="${r.id}" data-title="${r.title}" style="margin-left:auto">
          ✏️
        </button>
        <button class="btn btn-ghost btn-sm delete-btn" data-id="${r.id}" style="color:var(--red)">
          🗑️
        </button>
      </div>
    </div>`;
  }).join('');

  // Attach events
  grid.querySelectorAll('.play-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(`/watch?id=${btn.dataset.share}`, '_blank');
    });
  });
  grid.querySelectorAll('.rec-card .thumb').forEach(thumb => {
    const card = thumb.closest('.rec-card');
    const shareId = card.dataset.share;
    if (card.querySelector('.play-overlay')) {
      thumb.addEventListener('click', () => window.open(`/watch?id=${shareId}`, '_blank'));
    }
  });
  grid.querySelectorAll('.share-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openShareModal(btn.dataset.url);
    });
  });
  grid.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteModal(btn.dataset.id);
    });
  });
  grid.querySelectorAll('.rename-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openRenameModal(btn.dataset.id, btn.dataset.title);
    });
  });
}

function updateStats(recordings) {
  const ready = recordings.filter(r => r.status === 'ready');
  const totalDuration = ready.reduce((s, r) => s + (r.duration || 0), 0);
  const totalSize     = ready.reduce((s, r) => s + (r.size || 0), 0);
  const shared        = ready.length; // all ready recordings have share URLs

  document.getElementById('statTotal').textContent    = recordings.length;
  document.getElementById('statDuration').textContent = formatDuration(totalDuration);
  document.getElementById('statSize').textContent     = formatBytes(totalSize);
  document.getElementById('statShared').textContent   = shared;
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function openShareModal(url) {
  document.getElementById('shareLinkInput').value = url;
  document.getElementById('shareModal').classList.add('open');
}
document.getElementById('closeShareModal').addEventListener('click', () => {
  document.getElementById('shareModal').classList.remove('open');
});
document.getElementById('copyLinkBtn').addEventListener('click', () => {
  const input = document.getElementById('shareLinkInput');
  navigator.clipboard.writeText(input.value);
  toast('Link copied to clipboard!', 'success');
  document.getElementById('shareModal').classList.remove('open');
});

function openDeleteModal(id) {
  activeDeleteId = id;
  document.getElementById('deleteModal').classList.add('open');
}
document.getElementById('closeDeleteModal').addEventListener('click', () => {
  document.getElementById('deleteModal').classList.remove('open');
  activeDeleteId = null;
});
document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
  if (!activeDeleteId) return;
  await deleteRecording(activeDeleteId);
  document.getElementById('deleteModal').classList.remove('open');
  toast('Recording deleted', 'info');
  loadRecordings();
  activeDeleteId = null;
});

function openRenameModal(id, currentTitle) {
  activeRenameId = id;
  document.getElementById('renameInput').value = currentTitle;
  document.getElementById('renameModal').classList.add('open');
  setTimeout(() => document.getElementById('renameInput').focus(), 100);
}
document.getElementById('closeRenameModal').addEventListener('click', () => {
  document.getElementById('renameModal').classList.remove('open');
  activeRenameId = null;
});
document.getElementById('saveRenameBtn').addEventListener('click', async () => {
  const title = document.getElementById('renameInput').value.trim();
  if (!title || !activeRenameId) return;
  await renameRecording(activeRenameId, title);
  document.getElementById('renameModal').classList.remove('open');
  toast('Recording renamed', 'success');
  loadRecordings();
  activeRenameId = null;
});
document.getElementById('renameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('saveRenameBtn').click();
});

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ─── Search ───────────────────────────────────────────────────────────────────
document.getElementById('searchInput').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = allRecordings.filter(r => r.title.toLowerCase().includes(q));
  renderRecordings(filtered);
});

// ─── Load & poll ──────────────────────────────────────────────────────────────
async function loadRecordings() {
  allRecordings = await fetchRecordings();
  const q = document.getElementById('searchInput').value.toLowerCase();
  const filtered = q ? allRecordings.filter(r => r.title.toLowerCase().includes(q)) : allRecordings;
  renderRecordings(filtered);
  updateStats(allRecordings);
}

// Auto-refresh every 5 seconds (picks up new recordings from other devices)
loadRecordings();
setInterval(loadRecordings, 5000);
