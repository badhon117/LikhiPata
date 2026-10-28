/* ============================================================
   আমার খাতা — Common Functions v2
   ============================================================ */

const BN_DIGITS = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
const BN_MONTHS = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];

function toBn(str) {
  return String(str).replace(/\d/g, d => BN_DIGITS[d]);
}

function bnToEn(str) {
  if (!str) return '';
  return String(str).split('').map(ch => {
    const idx = BN_DIGITS.indexOf(ch);
    return idx >= 0 ? idx : ch;
  }).join('');
}

function formatTaka(n) {
  const num = Number(n) || 0;
  const fixed = num % 1 === 0 ? num.toString() : num.toFixed(2);
  const parts = fixed.split('.');
  const isNegative = parts[0].startsWith('-');
  if (isNegative) parts[0] = parts[0].slice(1);
  if (parts[0].length > 3) {
    const last3 = parts[0].slice(-3);
    const rest = parts[0].slice(0, -3);
    parts[0] = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  const sign = isNegative ? '-' : '';
  return sign + '৳' + toBn(parts.join('.'));
}

function formatNumberBn(n) {
  const num = Number(n);
  if (isNaN(num)) return '০';
  const fixed = num % 1 === 0 ? num.toString() : num.toFixed(2);
  const parts = fixed.split('.');
  const isNegative = parts[0].startsWith('-');
  if (isNegative) parts[0] = parts[0].slice(1);
  if (parts[0].length > 3) {
    const last3 = parts[0].slice(-3);
    const rest = parts[0].slice(0, -3);
    parts[0] = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  if (isNegative) parts[0] = '-' + parts[0];
  return toBn(parts.join('.'));
}

function formatDateBn(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = String(isoDate).split('-');
  if (!y || !m || !d) return isoDate;
  return toBn(d) + '/' + toBn(m) + '/' + toBn(y);
}

function formatDateLongBn(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = String(isoDate).split('-');
  if (!y || !m || !d) return isoDate;
  return toBn(parseInt(d)) + ' ' + BN_MONTHS[parseInt(m) - 1] + ' ' + toBn(y);
}

function getBnMonth(m) { return BN_MONTHS[m - 1] || ''; }

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;'
  }[c]));
}

function escapeAttr(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/\n/g, ' ');
}

function loadFromStorage(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null ? fallback : parsed;
  } catch (e) {
    console.warn('Storage read failed:', key, e);
    return fallback;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('Storage save failed:', e);
    if (e.name === 'QuotaExceededError') {
      if (typeof showToast === 'function') showToast('স্টোরেজ পূর্ণ! কিছু পুরোনো ডেটা মুছুন', 'error');
    } else {
      if (typeof showToast === 'function') showToast('ডেটা সেভ করা যায়নি', 'error');
    }
    return false;
  }
}

// showToast যদি ui.js-এ থাকে, fallback এখানে রাখি
if (typeof showToast !== 'function') {
  window.showToast = function(msg, type) {
    const t = document.getElementById('toast');
    if (!t) { console.log('Toast:', msg); return; }
    t.textContent = msg;
    t.className = 'toast' + (type ? ' ' + type : '');
    void t.offsetWidth;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2400);
  };
}

// askConfirm fallback
if (typeof askConfirm !== 'function') {
  window.askConfirm = function(msg) {
    return Promise.resolve(confirm(msg));
  };
}

function navigateTo(page) { window.location.href = page; }

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
      .then(() => showToast('কপি হয়েছে', 'success'))
      .catch(() => showToast('কপি করা যায়নি', 'error'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('কপি হয়েছে', 'success');
    } catch (e) {
      showToast('কপি করা যায়নি', 'error');
    }
    document.body.removeChild(ta);
  }
}

/* ============ Auto-sync hook ============ */
function notifyDataChanged() {
  if (typeof triggerAutoSync === 'function') {
    try { triggerAutoSync(); } catch (e) { /* ignore */ }
  }
}

/* ============ PWA Service Worker ============ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        // নতুন SW পেলে auto-update
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('নতুন আপডেট পাওয়া গেছে', 'success', {
                label: 'রিলোড',
                onClick: () => window.location.reload()
              });
            }
          });
        });
      })
      .catch(err => console.error('SW failed:', err));
  });
}

/* ============ Global Error Handler ============ */
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});