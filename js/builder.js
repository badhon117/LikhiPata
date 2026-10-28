/* ============================================================
   আমার খাতা — Builder Logic (v5 Ultimate — Hybrid Input)
   - এডিট বাটন কার্ডের ভেতরে
   - ফর্মুলা ভ্যারিয়েবল সিলেক্ট করলে হাইড হবে
   - ব্যাকস্পেস (⌫) একবারে ১টি টোকেন মুছবে
   - ডিসপ্লেতে সরাসরি টাইপ করা যাবে (বাংলা কিবোর্ড সাপোর্ট)
   - ভ্যারিয়েবল হারাবে না (Hybrid Token Sync)
   ============================================================ */

let currentBook = null;
let editingFieldIndex = -1;
let selectedFieldType = 'text';
let formulaTokens = [];
let editingSummaryIndex = -1;
let hasUnsavedChanges = false;

const FIELD_TYPES = {
  text:     { icon: '📝', label: 'টেক্সট', cls: 'type-text' },
  number:   { icon: '🔢', label: 'নাম্বার', cls: 'type-number' },
  date:     { icon: '📅', label: 'তারিখ', cls: 'type-date' },
  dropdown: { icon: '📋', label: 'ড্রপডাউন', cls: 'type-dropdown' },
  checkbox: { icon: '☑️', label: 'চেকবক্স', cls: 'type-checkbox' },
  formula:  { icon: '🧮', label: 'ফর্মুলা', cls: 'type-formula' }
};

/* ============ Init ============ */
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(getTheme());
  const params = new URLSearchParams(window.location.search);
  const bookId = params.get('book');

  if (!bookId) {
    showToast('বুক পাওয়া যায়নি', 'error');
    setTimeout(() => goBack(), 1500);
    return;
  }

  currentBook = getBook(bookId);
  if (!currentBook) {
    showToast('বুক পাওয়া যায়নি', 'error');
    setTimeout(() => goBack(), 1500);
    return;
  }

  if (!Array.isArray(currentBook.fields)) currentBook.fields = [];
  if (!Array.isArray(currentBook.summaryCards)) currentBook.summaryCards = [];

  renderBookInfo();
  renderFields();
  renderSummaryCards();

  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
});

async function goBack() {
  if (hasUnsavedChanges) {
    const ok = await askConfirm('সেভ না করা পরিবর্তন হারিয়ে যাবে। আপনি কি বের হতে চান?', {
      title: 'সতর্কতা',
      icon: '⚠️',
      confirmLabel: 'হ্যাঁ, বের হন',
      danger: true
    });
    if (!ok) return;
  }
  window.location.href = 'index.html';
}

async function deleteField(idx) {
  const f = currentBook.fields[idx];
  const ok = await askConfirm(`"${f.label}" ফিল্ডটি ডিলিট করবেন?\n\n(এই ফিল্ডের সব ডেটাও মুছে যাবে এবং সংশ্লিষ্ট সামারি কার্ডও সরবে)`, {
    title: 'ফিল্ড ডিলিট',
    icon: '🗑️',
    confirmLabel: 'হ্যাঁ, ডিলিট',
    danger: true
  });
  if (!ok) return;

  const fieldKey = f.key;
  currentBook.fields.splice(idx, 1);

  currentBook.fields.forEach(other => {
    if (other.type === 'formula' && other.formula) {
      const esc = fieldKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp('\\b' + esc + '\\b', 'g');
      if (re.test(other.formula)) {
        other.formula = other.formula.replace(re, '0');
      }
    }
  });
  
  if (Array.isArray(currentBook.summaryCards)) {
    currentBook.summaryCards = currentBook.summaryCards.filter(c => c.fieldKey !== fieldKey);
    renderSummaryCards();
  }

  markDirty();
  renderFields();
  renderBookInfo();
  showToast('ফিল্ড ডিলিট হয়েছে', 'success');
}

async function deleteSummaryCard(idx) {
  const ok = await askConfirm('এই সামারি কার্ডটি ডিলিট করবেন?', {
    title: 'কার্ড ডিলিট',
    icon: '🗑️',
    confirmLabel: 'হ্যাঁ, ডিলিট',
    danger: true
  });
  if (!ok) return;
  currentBook.summaryCards.splice(idx, 1);
  markDirty();
  renderSummaryCards();
  showToast('কার্ড ডিলিট হয়েছে', 'success');
}

function markDirty() { hasUnsavedChanges = true; }

/* ============ Render Book Info ============ */
function renderBookInfo() {
  document.getElementById('bookIcon').textContent = currentBook.icon || '📘';
  document.getElementById('bookIcon').style.background = currentBook.color || 'linear-gradient(135deg,#DBEAFE,#BFDBFE)';
  document.getElementById('bookName').textContent = currentBook.name;
  document.getElementById('bookMeta').textContent = toBn(currentBook.fields.length) + 'টি ফিল্ড';
}

/* ============ Render Fields ============ */
function renderFields() {
  const list = document.getElementById('fieldsList');
  const empty = document.getElementById('fieldsEmpty');
  const badge = document.getElementById('fieldCount');

  if (!currentBook.fields.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    badge.textContent = '০টি';
    return;
  }
  empty.style.display = 'none';
  badge.textContent = toBn(currentBook.fields.length) + 'টি';

  list.innerHTML = currentBook.fields.map((f, i) => {
    const t = FIELD_TYPES[f.type] || FIELD_TYPES.text;
    let preview = '';
    if (f.type === 'formula' && f.formula) {
      preview = `<code>${escapeHtml(prettifyFormula(f.formula, currentBook.fields))}</code>`;
    } else if (f.type === 'dropdown' && f.options && f.options.length) {
      preview = toBn(f.options.length) + 'টি অপশন';
    } else if (f.type === 'checkbox') {
      preview = 'হ্যাঁ / না';
    } else {
      preview = t.label;
    }
    return `
      <div class="field-card">
        <div style="display:flex; align-items:center; gap:14px; flex:1; cursor:pointer; min-width:0;" onclick="editField(${i})">
          <div class="field-icon ${t.cls}">${t.icon}</div>
          <div class="field-info">
            <h4>${escapeHtml(f.label)}</h4>
            <p>${preview}</p>
          </div>
        </div>
        <div class="field-actions" onclick="event.stopPropagation()">
          <button class="field-action-btn" onclick="moveField(${i}, -1)" title="উপরে">↑</button>
          <button class="field-action-btn" onclick="moveField(${i}, 1)" title="নিচে">↓</button>
          <button class="field-action-btn del" onclick="deleteField(${i})" title="ডিলিট">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

/* ============ Field Modal ============ */
function openFieldModal(editIdx = -1) {
  editingFieldIndex = editIdx;
  const titleEl = document.getElementById('fieldModalTitle');
  const addBtn = document.querySelector('#fieldModal .btn-save');

  document.getElementById('fieldLabel').value = '';
  document.getElementById('fieldDefault').value = '';
  document.getElementById('dropdownOptions').value = '';
  formulaTokens = [];

  if (editIdx >= 0) {
    const f = currentBook.fields[editIdx];
    titleEl.textContent = 'ফিল্ড এডিট';
    addBtn.textContent = 'আপডেট করুন';
    document.getElementById('fieldLabel').value = f.label || '';
    document.getElementById('fieldDefault').value = f.default || '';
    if (f.type === 'dropdown') {
      document.getElementById('dropdownOptions').value = (f.options || []).join('\n');
    }
    if (f.type === 'formula' && f.formula) {
      formulaTokens = parseFormulaToTokens(f.formula);
    }
    selectFieldType(f.type);
  } else {
    titleEl.textContent = 'নতুন ফিল্ড';
    addBtn.textContent = 'যোগ করুন';
    selectFieldType('text');
  }

  document.getElementById('fieldModal').classList.add('open');
  setTimeout(() => document.getElementById('fieldLabel').focus(), 200);
}

function parseFormulaToTokens(formulaStr) {
  const tokens = [];
  let i = 0;
  const s = String(formulaStr);
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if ('+-*/%(),'.includes(c)) { tokens.push(c); i++; continue; }
    let name = '';
    while (i < s.length && /[a-zA-Z0-9_\u0980-\u09FF]/.test(s[i])) { name += s[i]; i++; }
    if (name) tokens.push(name);
    else i++;
  }
  return tokens;
}

function closeFieldModal() {
  document.getElementById('fieldModal').classList.remove('open');
  editingFieldIndex = -1;
  formulaTokens = [];
}

function selectFieldType(type) {
  selectedFieldType = type;
  document.querySelectorAll('.field-type-card').forEach(el => {
    el.classList.toggle('active', el.dataset.type === type);
  });

  document.getElementById('dropdownOptionsGroup').style.display = type === 'dropdown' ? 'block' : 'none';
  document.getElementById('formulaGroup').style.display = type === 'formula' ? 'block' : 'none';
  document.getElementById('defaultValueGroup').style.display =
    (type === 'formula' || type === 'checkbox') ? 'none' : 'block';

  if (type === 'formula') {
    renderFormulaBuilder();
    updateFormulaDisplay(true);
  }
}

/* ============ Formula Builder ============ */
function renderFormulaBuilder() {
  const varsContainer = document.getElementById('formulaVars');
  const usableFields = currentBook.fields.filter((f, i) => {
    if (i === editingFieldIndex) return false;
    return f.type === 'number' || f.type === 'formula';
  });

  if (usableFields.length === 0) {
    varsContainer.innerHTML = `<div style="font-size:12px; color:#94A3B8; padding:8px; text-align:center;">প্রথমে একটি নাম্বার ফিল্ড তৈরি করুন — তারপর ফর্মুলায় ব্যবহার করতে পারবেন</div>`;
    return;
  }

  varsContainer.innerHTML = usableFields.map(f => {
    const isUsed = formulaTokens.includes(f.key);
    return `
      <button 
        class="formula-var-btn" 
        data-key="${escapeAttr(f.key)}"
        style="${isUsed ? 'display:none;' : ''}"
        onclick="addFormulaVar('${escapeAttr(f.key)}')">
        ${escapeHtml(f.label)}
      </button>
    `;
  }).join('');
}

function refreshFormulaVarsVisibility() {
  document.querySelectorAll('#formulaVars .formula-var-btn').forEach(btn => {
    const k = btn.getAttribute('data-key');
    if (formulaTokens.includes(k)) {
      btn.style.display = 'none';
    } else {
      btn.style.display = '';
    }
  });
}

function addFormulaVar(fieldKey) {
  const last = formulaTokens[formulaTokens.length - 1];
  if (last && (last === ')' || /^[a-zA-Z0-9_\u0980-\u09FF]/.test(last))) {
    formulaTokens.push(' ');
  }
  formulaTokens.push(fieldKey);
  refreshFormulaVarsVisibility();
  updateFormulaDisplay(true);
}

function addFormulaToken(op) {
  formulaTokens.push(op);
  updateFormulaDisplay(true);
}

function removeLastFormulaToken() {
  if (formulaTokens.length === 0) return;
  
  let last = formulaTokens[formulaTokens.length - 1];
  formulaTokens.pop();
  if (last === ' ' && formulaTokens.length > 0) {
    formulaTokens.pop();
  }
  
  refreshFormulaVarsVisibility();
  updateFormulaDisplay(true);
}

function clearFormula() {
  const ok = confirm('সব ফর্মুলা মুছে ফেলবেন?');
  if (!ok) return;
  formulaTokens = [];
  refreshFormulaVarsVisibility();
  updateFormulaDisplay(true);
}

/* ============ Display Update ============ */
/* 
  forceRender = true মানে: কোড থেকে কল হচ্ছে — তাই ডিসপ্লের টেক্সট পুরোপুরি রি-রেন্ডার হবে।
  forceRender = false মানে: ইউজার টাইপ করছে — তাই শুধু প্রিভিউ আপডেট হবে, টেক্সট ছোঁব না।
*/
function updateFormulaDisplay(forceRender = true) {
  const display = document.getElementById('formulaDisplay');
  const preview = document.getElementById('formulaPreview');

  if (forceRender) {
    if (formulaTokens.length === 0) {
      display.classList.add('empty');
      display.textContent = 'এখানে ফর্মুলা দেখাবে...';
      preview.style.display = 'none';
      return;
    }

    display.classList.remove('empty');
    const raw = formulaTokens.join(' ');
    const pretty = prettifyFormula(raw, currentBook.fields);
    display.textContent = pretty;

    // কার্সর শেষে আনতে
    placeCaretAtEnd(display);
  }

  // প্রিভিউ আপডেট
  const raw = formulaTokens.join(' ');
  if (!raw || !raw.trim()) {
    preview.style.display = 'none';
    return;
  }

  const context = {};
  currentBook.fields.forEach(f => { context[f.key] = 10; });

  const knownVars = currentBook.fields.map(f => f.key);
  const validation = validateFormula(raw, knownVars);
  if (!validation.valid) {
    preview.style.display = 'block';
    preview.className = 'formula-preview error';
    preview.textContent = '⚠️ ' + validation.error;
    return;
  }

  const val = calcFormula(raw, context);
  preview.style.display = 'block';
  if (isNaN(val)) {
    preview.className = 'formula-preview error';
    preview.textContent = '⚠️ ফর্মুলা সঠিক নয় — চেক করুন';
  } else {
    preview.className = 'formula-preview ok';
    preview.textContent = `✓ পরীক্ষামূলক ফলাফল: ${formatTaka(val)} (সব ফিল্ড = ১০ ধরলে)`;
  }
}

/* ============ Direct Typing on Display (Hybrid) ============ */
/* 
  এই ফাংশনটি ইউজার ডিসপ্লেতে টাইপ করলে কল হবে।
  এখানে আমরা ডিসপ্লের টেক্সটকে সরাসরি বিশ্বাস করি না; বরং
  কী পরিবর্তন হয়েছে সেটা দেখে formulaTokens আপডেট করি।
*/
/* ============ Direct Typing on Display (Hybrid — Fixed) ============ */
function handleDisplayInput(event) {
  const display = document.getElementById('formulaDisplay');
  const currentText = display.textContent || '';

  // ১. বাংলা সংখ্যা (০-৯) -> ইংরেজি সংখ্যা (0-9)
  let processed = bnToEn(currentText);

  // ২. ফিল্ডের লেবেলগুলো একদম আগে খুঁজে বের করি (সেগুলো মুছব না)
  const labels = currentBook.fields
    .map(f => f.label ? f.label.trim() : '')
    .filter(Boolean);
  
  // লম্বা লেবেল আগে রাখি (যাতে "মোট ইনকাম" আর "মোট" এর মধ্যে কনফ্লিক্ট না হয়)
  labels.sort((a, b) => b.length - a.length);

  // লেবেলগুলোকে সাময়িকভাবে একটি নিরাপদ টোকেন দিয়ে রিপ্লেস করি
  const labelMap = {};
  labels.forEach((lbl, idx) => {
    const safe = `___LBL${idx}___`;
    labelMap[safe] = lbl;
    processed = processed.split(lbl).join(safe);
  });

  // ৩. এখন শুধু অনুমোদিত ক্যারেক্টার রাখি (সংখ্যা, অপারেটর, স্পেস, এবং আমাদের সেফ টোকেন)
  processed = processed.replace(/[^0-9+\-*/%().,\s_A-Za-z]/g, '');

  // ৪. সেফ টোকেনগুলো আবার আসল লেবেলে ফিরিয়ে আনি
  Object.keys(labelMap).forEach(safe => {
    processed = processed.split(safe).join(labelMap[safe]);
  });

  // ৫. ডিসপ্লে ফিক্স করি যদি কিছু পরিবর্তন হয়ে থাকে
  if (processed !== currentText) {
    display.textContent = processed;
    placeCaretAtEnd(display);
  }

  // ৬. টোকেন পুনর্গঠন করি
  formulaTokens = rebuildTokensFromDisplay(processed);

  // ৭. ভ্যারিয়েবল বাটন আপডেট
  refreshFormulaVarsVisibility();

  // ৮. প্রিভিউ আপডেট (টেক্সট ছোঁব না)
  updateFormulaDisplay(false);
}

function rebuildTokensFromDisplay(text) {
  const tokens = [];
  if (!text || !text.trim()) return tokens;

  // লেবেল -> key ম্যাপ
  const labelToKey = {};
  currentBook.fields.forEach(f => {
    if (f.label) labelToKey[f.label.trim()] = f.key;
  });

  const sortedLabels = Object.keys(labelToKey).sort((a, b) => b.length - a.length);

  let i = 0;
  const s = text;

  while (i < s.length) {
    const c = s[i];
    
    // স্পেস স্কিপ
    if (/\s/.test(c)) { i++; continue; }

    // অপারেটর
    if ('+-*/%(),'.includes(c)) {
      tokens.push(c);
      i++;
      continue;
    }

    // সংখ্যা (ইংরেজি - কারণ bnToEn আগেই হয়ে গেছে)
    if (/[0-9.]/.test(c)) {
      let num = '';
      while (i < s.length && /[0-9.]/.test(s[i])) { num += s[i]; i++; }
      tokens.push(num);
      continue;
    }

    // লেবেল ম্যাচ (ভ্যারিয়েবল) - লম্বা লেবেল আগে
    let matched = false;
    for (const label of sortedLabels) {
      if (s.substr(i, label.length) === label) {
        tokens.push(labelToKey[label]);
        i += label.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // অচেনা কিছু থাকলে স্কিপ
    i++;
  }

  return tokens;
}

function placeCaretAtEnd(el) {
  el.focus();
  if (typeof window.getSelection != "undefined" && typeof document.createRange != "undefined") {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

/* ============ Save Field ============ */
function saveField() {
  const label = document.getElementById('fieldLabel').value.trim();
  if (!label) {
    showToast('ফিল্ডের নাম লিখুন', 'error');
    document.getElementById('fieldLabel').focus();
    return;
  }

  const dup = currentBook.fields.findIndex((f, i) =>
    i !== editingFieldIndex && f.label.toLowerCase() === label.toLowerCase()
  );
  if (dup >= 0) {
    showToast('এই নামে আরেকটি ফিল্ড আছে', 'error');
    return;
  }

  const field = {
    key: '',
    label,
    type: selectedFieldType,
    default: document.getElementById('fieldDefault').value.trim() || ''
  };

  if (selectedFieldType === 'dropdown') {
    const opts = document.getElementById('dropdownOptions').value
      .split('\n').map(s => s.trim()).filter(s => s);
    if (opts.length === 0) {
      showToast('কমপক্ষে একটি অপশন দিন', 'error');
      return;
    }
    field.options = opts;
  }

  if (selectedFieldType === 'formula') {
    const formulaStr = formulaTokens.join(' ').trim();
    if (!formulaStr) {
      showToast('ফর্মুলা তৈরি করুন', 'error');
      return;
    }
    const knownVars = currentBook.fields
      .filter((f, i) => i !== editingFieldIndex)
      .map(f => f.key);
    const check = validateFormula(formulaStr, knownVars);
    if (!check.valid) {
      showToast('ফর্মুলা ভুল: ' + check.error, 'error');
      return;
    }
    field.formula = formulaStr;
  }

  if (editingFieldIndex >= 0) {
    field.key = currentBook.fields[editingFieldIndex].key;
    currentBook.fields[editingFieldIndex] = field;
    showToast('ফিল্ড আপডেট হয়েছে', 'success');
  } else {
    field.key = generateId('fld');
    currentBook.fields.push(field);
    showToast('ফিল্ড যোগ হয়েছে', 'success');
  }

  markDirty();
  closeFieldModal();
  renderFields();
  renderBookInfo();
}

/* ============ Edit / Move / Delete ============ */
function editField(idx) {
  openFieldModal(idx);
}

/* ============ Summary Cards ============ */
function renderSummaryCards() {
  const list = document.getElementById('summaryList');
  const badge = document.getElementById('summaryCount');

  if (!currentBook.summaryCards || !currentBook.summaryCards.length) {
    list.innerHTML = '';
    badge.textContent = '০টি';
    return;
  }
  badge.textContent = toBn(currentBook.summaryCards.length) + 'টি';

  list.innerHTML = currentBook.summaryCards.map((c, i) => {
    const targetField = currentBook.fields.find(f => f.key === c.fieldKey);
    const fieldLabel = targetField ? targetField.label : '⚠️ অজানা ফিল্ড';
    const calcMap = { sum: 'যোগফল', count: 'সংখ্যা', avg: 'গড়', max: 'সর্বোচ্চ', min: 'সর্বনিম্ন' };
    const calcLabel = calcMap[c.calcType] || c.calcType;
    const colorStr = c.color || '#1E3A8A';
    const iconBg = colorStr.includes('gradient') ? colorStr : `linear-gradient(135deg, ${colorStr}, ${colorStr})`;

    return `
      <div class="field-card">
        <div style="display:flex; align-items:center; gap:14px; flex:1; cursor:pointer; min-width:0;" onclick="editSummaryCard(${i})">
          <div class="field-icon" style="background: ${iconBg}; color: white;">📊</div>
          <div class="field-info">
            <h4>${escapeHtml(c.label)}</h4>
            <p>${escapeHtml(fieldLabel)} এর ${calcLabel}</p>
          </div>
        </div>
        <div class="field-actions" onclick="event.stopPropagation()">
          <button class="field-action-btn" onclick="moveSummary(${i}, -1)" title="উপরে">↑</button>
          <button class="field-action-btn" onclick="moveSummary(${i}, 1)" title="নিচে">↓</button>
          <button class="field-action-btn del" onclick="deleteSummaryCard(${i})" title="ডিলিট">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

function moveField(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= currentBook.fields.length) return;
  
  const temp = currentBook.fields[idx];
  currentBook.fields[idx] = currentBook.fields[newIdx];
  currentBook.fields[newIdx] = temp;
  
  markDirty();
  renderFields();
  
  const cards = document.querySelectorAll('#fieldsList .field-card');
  if (cards[newIdx]) {
    cards[newIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function moveSummary(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= currentBook.summaryCards.length) return;
  
  const temp = currentBook.summaryCards[idx];
  currentBook.summaryCards[idx] = currentBook.summaryCards[newIdx];
  currentBook.summaryCards[newIdx] = temp;
  
  markDirty();
  renderSummaryCards();
  
  const cards = document.querySelectorAll('#summaryList .field-card');
  if (cards[newIdx]) {
    cards[newIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function openSummaryModal(editIdx = -1) {
  editingSummaryIndex = editIdx;
  const titleEl = document.getElementById('summaryModalTitle');
  const addBtn = document.querySelector('#summaryModal .btn-save');

  const fieldSelect = document.getElementById('summaryTargetField');
  const numericFields = currentBook.fields.filter(f => f.type === 'number' || f.type === 'formula');

  if (numericFields.length === 0) {
    showToast('আগে অন্তত একটি নাম্বার বা ফর্মুলা ফিল্ড তৈরি করুন', 'error');
    return;
  }

  fieldSelect.innerHTML = numericFields.map(f =>
    `<option value="${escapeAttr(f.key)}">${escapeHtml(f.label)}</option>`
  ).join('');

  if (editIdx >= 0) {
    const c = currentBook.summaryCards[editIdx];
    titleEl.textContent = 'সামারি কার্ড এডিট';
    addBtn.textContent = 'আপডেট করুন';
    document.getElementById('summaryLabel').value = c.label;
    fieldSelect.value = c.fieldKey;
    document.getElementById('summaryCalcType').value = c.calcType;
    const colorMatch = c.color ? String(c.color).match(/#[0-9a-fA-F]{6}/) : null;
    document.getElementById('summaryColor').value = colorMatch ? colorMatch[0] : '#2563EB';
  } else {
    titleEl.textContent = 'নতুন সামারি কার্ড';
    addBtn.textContent = 'যোগ করুন';
    document.getElementById('summaryLabel').value = '';
    document.getElementById('summaryCalcType').value = 'sum';
    document.getElementById('summaryColor').value = '#2563EB';
  }

  document.getElementById('summaryModal').classList.add('open');
  setTimeout(() => document.getElementById('summaryLabel').focus(), 200);
}

function closeSummaryModal() {
  document.getElementById('summaryModal').classList.remove('open');
  editingSummaryIndex = -1;
}

function saveSummaryCard() {
  const label = document.getElementById('summaryLabel').value.trim();
  const fieldKey = document.getElementById('summaryTargetField').value;
  const calcType = document.getElementById('summaryCalcType').value;
  const color = document.getElementById('summaryColor').value;

  if (!label) {
    showToast('কার্ডের নাম লিখুন', 'error');
    return;
  }
  if (!fieldKey) {
    showToast('কোন ফিল্ডের হিসাব হবে তা সিলেক্ট করুন', 'error');
    return;
  }

  const finalColor = `linear-gradient(135deg, ${color}, ${adjustColor(color, -20)})`;

  const card = {
    id: generateId('card'),
    label,
    fieldKey,
    calcType,
    color: finalColor
  };

  if (editingSummaryIndex >= 0) {
    card.id = currentBook.summaryCards[editingSummaryIndex].id;
    currentBook.summaryCards[editingSummaryIndex] = card;
    showToast('কার্ড আপডেট হয়েছে', 'success');
  } else {
    currentBook.summaryCards.push(card);
    showToast('নতুন কার্ড যোগ হয়েছে', 'success');
  }

  markDirty();
  closeSummaryModal();
  renderSummaryCards();
}

function editSummaryCard(idx) {
  openSummaryModal(idx);
}

function adjustColor(hex, percent) {
  try {
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);
    R = Math.max(0, Math.min(255, parseInt(R * (100 + percent) / 100)));
    G = Math.max(0, Math.min(255, parseInt(G * (100 + percent) / 100)));
    B = Math.max(0, Math.min(255, parseInt(B * (100 + percent) / 100)));
    const RR = R.toString(16).padStart(2, '0');
    const GG = G.toString(16).padStart(2, '0');
    const BB = B.toString(16).padStart(2, '0');
    return '#' + RR + GG + BB;
  } catch (e) {
    return hex;
  }
}

/* ============ Save Book ============ */
function saveBookFields() {
  const ok = updateBook(currentBook.id, {
    fields: currentBook.fields,
    summaryCards: currentBook.summaryCards,
    updatedAt: Date.now()
  });

  if (!ok) {
    showToast('সেভ ব্যর্থ — আবার চেষ্টা করুন', 'error');
    return;
  }

  hasUnsavedChanges = false;
  showToast('সব পরিবর্তন সেভ হয়েছে ✅', 'success');

  setTimeout(() => {
    window.location.href = 'view.html?book=' + currentBook.id;
  }, 800);
}

/* ============ Preview ============ */
function openPreview() {
  const container = document.getElementById('previewContent');
  if (currentBook.fields.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:30px 20px; color:#94A3B8;">
      <div style="font-size:40px; margin-bottom:10px;">📋</div>
      <p>কোনো ফিল্ড নেই — আগে ফিল্ড যোগ করুন</p>
    </div>`;
  } else {
    container.innerHTML = `<div style="display:flex; flex-direction:column; gap:12px;">` +
      currentBook.fields.map(f => renderPreviewField(f)).join('') +
      `</div>`;
  }
  document.getElementById('previewModal').classList.add('open');
}

function renderPreviewField(f) {
  let input = '';
  const label = `<label style="display:block; font-size:13px; color:#475569; font-weight:600; margin-bottom:6px;">${escapeHtml(f.label)}</label>`;

  if (f.type === 'text') {
    input = `<input type="text" disabled placeholder="টেক্সট..." style="width:100%; padding:10px 12px; border:1.5px solid #CBD5E1; border-radius:8px; background:#F8FAFC; font-family:inherit;">`;
  } else if (f.type === 'number') {
    input = `<input type="text" disabled placeholder="0" style="width:100%; padding:10px 12px; border:1.5px solid #CBD5E1; border-radius:8px; background:#F8FAFC; font-family:inherit;">`;
  } else if (f.type === 'date') {
    input = `<input type="text" disabled placeholder="তারিখ..." style="width:100%; padding:10px 12px; border:1.5px solid #CBD5E1; border-radius:8px; background:#F8FAFC; font-family:inherit;">`;
  } else if (f.type === 'dropdown') {
    input = `<select disabled style="width:100%; padding:10px 12px; border:1.5px solid #CBD5E1; border-radius:8px; background:#F8FAFC; font-family:inherit;">
      <option>-- নির্বাচন --</option>
      ${(f.options || []).map(o => `<option>${escapeHtml(o)}</option>`).join('')}
    </select>`;
  } else if (f.type === 'checkbox') {
    input = `<label style="display:flex; align-items:center; gap:8px; padding:10px 0;">
      <input type="checkbox" disabled style="width:20px; height:20px;">
      <span style="font-size:14px; color:#334155;">হ্যাঁ</span>
    </label>`;
  } else if (f.type === 'formula') {
    const pretty = f.formula ? prettifyFormula(f.formula, currentBook.fields) : '';
    input = `<input type="text" disabled value="(${escapeHtml(pretty)})" style="width:100%; padding:10px 12px; border:1.5px solid #FDE68A; border-radius:8px; background:#FEF3C7; color:#92400E; font-family:inherit; font-weight:700;">`;
  }

  return `<div>${label}${input}</div>`;
}

function closePreview() {
  document.getElementById('previewModal').classList.remove('open');
}

/* ============ Escape ============ */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeFieldModal();
    closeSummaryModal();
    closePreview();
  }
});