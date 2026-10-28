/* ============================================================
   আমার খাতা — UI Helpers (Toast, Confirm, Undo, Skeleton)
   ============================================================ */

/* ============ Toast with Action ============ */
let _toastTimer = null;
function showToast(msg, type = '', action = null) {
  const t = document.getElementById('toast');
  if (!t) { console.log('Toast:', msg); return; }

  if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }

  t.innerHTML = '';
  const textSpan = document.createElement('span');
  textSpan.textContent = msg;
  t.appendChild(textSpan);

  if (action && action.label && typeof action.onClick === 'function') {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.onclick = () => {
      action.onClick();
      t.classList.remove('show');
      if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
    };
    t.appendChild(btn);
  }

  t.classList.remove('show');
  t.className = 'toast' + (type ? ' ' + type : '');
  void t.offsetWidth;
  t.classList.add('show');

  const duration = action ? 5000 : 2400;
  _toastTimer = setTimeout(() => {
    t.classList.remove('show');
    _toastTimer = null;
  }, duration);
}

/* ============ Custom Confirm Modal ============ */
function askConfirm(msg, options = {}) {
  return new Promise((resolve) => {
    const {
      title = 'নিশ্চিত করুন',
      confirmLabel = 'হ্যাঁ',
      cancelLabel = 'বাতিল',
      icon = '⚠️',
      danger = false
    } = options;

    // পুরোনো মোডাল থাকলে সরিয়ে দিই
    const existing = document.getElementById('__customConfirm');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = '__customConfirm';
    overlay.className = 'modal-overlay open confirm-modal';
    overlay.innerHTML = `
      <div class="modal-content">
        <span class="confirm-icon">${icon}</span>
        <h3 class="confirm-title">${escapeHtml(title)}</h3>
        <p class="confirm-message">${escapeHtml(msg)}</p>
        <div class="modal-actions">
          <button class="btn btn-cancel" id="__confirmCancel">${escapeHtml(cancelLabel)}</button>
          <button class="btn ${danger ? 'btn-delete' : 'btn-primary'}" id="__confirmOk">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector('#__confirmOk').onclick = () => cleanup(true);
    overlay.querySelector('#__confirmCancel').onclick = () => cleanup(false);
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(false);
    };

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        cleanup(false);
      }
    };
    document.addEventListener('keydown', escHandler);
  });
}

/* ============ Skeleton Loader ============ */
function showSkeleton(containerId, count = 3) {
  const container = document.getElementById(containerId);
  if (!container) return;
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div style="background:var(--bg-card); border-radius:14px; padding:18px; margin-bottom:12px; display:flex; gap:14px; align-items:center;">
        <div style="width:54px; height:54px; border-radius:14px; background:var(--bg-subtle); animation:pulse 1.5s ease-in-out infinite;"></div>
        <div style="flex:1;">
          <div style="height:14px; width:60%; background:var(--bg-subtle); border-radius:6px; margin-bottom:8px; animation:pulse 1.5s ease-in-out infinite;"></div>
          <div style="height:11px; width:40%; background:var(--bg-subtle); border-radius:6px; animation:pulse 1.5s ease-in-out infinite;"></div>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

// pulse keyframes (একবার inject)
if (!document.getElementById('__pulseStyle')) {
  const style = document.createElement('style');
  style.id = '__pulseStyle';
  style.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;
  document.head.appendChild(style);
}

/* ============ Onboarding Tip ============ */
function showOnboardingTip(icon, title, message, storageKey = null) {
  if (storageKey && localStorage.getItem(storageKey) === 'shown') return;

  const existing = document.getElementById('__onboardingTip');
  if (existing) existing.remove();

  const tip = document.createElement('div');
  tip.id = '__onboardingTip';
  tip.className = 'onboarding-tip';
  tip.innerHTML = `
    <div class="tip-icon">${icon}</div>
    <div class="tip-body">
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(message)}</p>
    </div>
    <button class="tip-close" aria-label="বন্ধ করুন">✕</button>
  `;
  document.body.appendChild(tip);

  const close = () => {
    tip.style.opacity = '0';
    tip.style.transform = 'translateX(-50%) translateY(40px)';
    setTimeout(() => tip.remove(), 300);
    if (storageKey) localStorage.setItem(storageKey, 'shown');
  };
  tip.querySelector('.tip-close').onclick = close;
  setTimeout(close, 8000);
}

/* ============ Loading Overlay ============ */
function showLoading(msg = 'প্রসেসিং...') {
  const existing = document.getElementById('__loadingOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = '__loadingOverlay';
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(15,23,42,0.55);
    backdrop-filter: blur(4px);
    z-index: 3000;
    display: flex; align-items: center; justify-content: center;
  `;
  overlay.innerHTML = `
    <div style="background: white; padding: 24px 32px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; gap: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.25);">
      <div style="width: 36px; height: 36px; border: 3px solid #E2E8F0; border-top-color: #3B82F6; border-radius: 50%; animation: spin 0.7s linear infinite;"></div>
      <p style="font-size: 14px; font-weight: 600; color: #1E293B; margin: 0;">${escapeHtml(msg)}</p>
    </div>
  `;
  document.body.appendChild(overlay);
}

function hideLoading() {
  const overlay = document.getElementById('__loadingOverlay');
  if (overlay) overlay.remove();
}

/* ============ Keyboard Shortcuts ============ */
function registerShortcut(key, handler) {
  document.addEventListener('keydown', (e) => {
    if (e.key === key && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      handler(e);
    }
  });
}