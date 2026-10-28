/* ============================================================
   আমার খাতা — View Logic (Fully Fixed)
   ============================================================ */

let currentBook = null;
let currentEntries = [];
let currentEditId = null;
let isSelectMode = false;
let selectedIds = new Set();
let currentViewTab = 'form';
let pendingDeleteId = null;
let pendingDeleteBulk = false;

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
  currentEntries = getEntries(bookId);
  if (!Array.isArray(currentEntries)) currentEntries = [];

  document.getElementById('pageTitle').textContent = (currentBook.icon || '📘') + ' ' + currentBook.name;
  document.getElementById('printTitle').textContent = currentBook.name;
  document.getElementById('printDate').textContent = 'প্রিন্টের তারিখ: ' + formatDateLongBn(todayISO());

  renderForm();
  renderTable();
  renderSummary();
});



function goBack() {
  window.location.href = 'index.html';
}

function openBuilder() {
  if (!currentBook) return;
  window.location.href = 'builder.html?book=' + currentBook.id;
}

function switchViewTab(tab) {
  currentViewTab = tab;
  document.getElementById('tabForm').classList.toggle('active', tab === 'form');
  document.getElementById('tabTable').classList.toggle('active', tab === 'table');
  document.getElementById('formView').style.display = tab === 'form' ? 'block' : 'none';
  document.getElementById('tableView').style.display = tab === 'table' ? 'block' : 'none';

  const fab = document.getElementById('fabAddEntry');
  if (fab) fab.style.display = (tab === 'table') ? 'flex' : 'none';

  if (tab === 'table') {
    renderTable();
    renderSummary();
    if (isSelectMode) exitSelectMode();
  }
}

/* ============ Summary ============ */
function renderSummary() {
  const summaryStrip = document.getElementById('summaryStrip');
  if (!summaryStrip) return;

  if (!currentBook.summaryCards || currentBook.summaryCards.length === 0) {
    summaryStrip.innerHTML = '';
    return;
  }

  let entriesToSum = currentEntries;
  if (isSelectMode && selectedIds.size > 0) {
    entriesToSum = currentEntries.filter(e => selectedIds.has(e.id));
  }

  let html = '';

  currentBook.summaryCards.forEach(card => {
    // ফিল্ডটা এখনো আছে কিনা চেক
    const fieldExists = currentBook.fields.find(f => f.key === card.fieldKey);
    if (!fieldExists) {
      // ভাঙা রেফারেন্স — স্কিপ
      return;
    }

    let resultVal = 0;
    let displayVal = '০';

    if (card.calcType === 'count') {
      resultVal = entriesToSum.length;
      displayVal = toBn(resultVal) + 'টি';
    } else {
      let values = entriesToSum
        .map(e => Number(e[card.fieldKey]))
        .filter(v => !isNaN(v));

      if (card.calcType === 'sum') {
        resultVal = values.reduce((a, b) => a + b, 0);
      } else if (card.calcType === 'avg') {
        resultVal = values.length ? (values.reduce((a, b) => a + b, 0) / values.length) : 0;
      } else if (card.calcType === 'max') {
        resultVal = values.length ? Math.max(...values) : 0;
      } else if (card.calcType === 'min') {
        resultVal = values.length ? Math.min(...values) : 0;
      }
      displayVal = formatTaka(resultVal);
    }

    html += `
      <div class="summary-chip" style="background: ${card.color};">
        <div class="lbl">${escapeHtml(card.label)}</div>
        <div class="val">${displayVal}</div>
      </div>
    `;
  });

  summaryStrip.innerHTML = html;
}

/* ============ Render Form ============ */
function renderForm() {
  const container = document.getElementById('dynamicForm');
  const noFields = document.getElementById('noFieldsState');

  if (!currentBook.fields.length) {
    container.innerHTML = '';
    noFields.style.display = 'block';
    return;
  }
  noFields.style.display = 'none';

  container.innerHTML = currentBook.fields.map(f => renderFormField(f)).join('');

  // Event listeners
  currentBook.fields.forEach(f => {
    if (f.type === 'formula') return;

    const el = document.getElementById('field_' + f.key);
    if (!el) return;

    if (f.type === 'number') {
      el.addEventListener('keydown', (e) => {
        if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter'].includes(e.key)) return;
        if (e.ctrlKey || e.metaKey) return;
        const allowedChars = /[0-9+\-*/%().\s]/;
        const isBanglaDigit = /[\u09E6-\u09EF]/;
        if (e.key.length === 1 && !allowedChars.test(e.key) && !isBanglaDigit.test(e.key)) {
          e.preventDefault();
        }
      });

      el.addEventListener('input', () => {
        let val = el.value;
        val = bnToEn(val);
        val = val.replace(/[^0-9+\-*/%().\s]/g, '');
        el.value = val;
        recalcFormulas();
        saveDraftAuto();
      });

      el.addEventListener('change', () => {
        recalcFormulas();
        saveDraftAuto();
      });

      const eqBtn = el.parentElement.querySelector('.math-eq-btn');
      if (eqBtn) {
        eqBtn.addEventListener('click', (e) => {
          e.preventDefault();
          evaluateField(el);
        });
      }

    } else if (f.type === 'checkbox') {
      el.addEventListener('change', () => {
        recalcFormulas();
        saveDraftAuto();
      });
    } else {
      el.addEventListener('input', () => {
        recalcFormulas();
        saveDraftAuto();
      });
      el.addEventListener('change', () => {
        recalcFormulas();
        saveDraftAuto();
      });
    }
  });

  // Draft লোড (শুধু নতুন এন্ট্রি মোডে)
  if (!currentEditId) {
    const draft = loadDraft(currentBook.id);
    if (draft && draft.data) {
      // শুধু যদি ফর্ম খালি থাকে
      let isEmpty = true;
      currentBook.fields.forEach(f => {
        if (f.type === 'formula') return;
        const el = document.getElementById('field_' + f.key);
        if (el && el.value && el.value !== (f.default || '')) isEmpty = false;
      });
      if (isEmpty) {
        currentBook.fields.forEach(f => {
          if (f.type === 'formula') return;
          const el = document.getElementById('field_' + f.key);
          if (!el) return;
          const v = draft.data[f.key];
          if (v === undefined || v === null) return;
          if (f.type === 'checkbox') el.checked = !!v;
          else el.value = v;
        });
      }
    }
  }
	attachEnterNavigation();
  recalcFormulas();
}

function saveDraftAuto() {
  if (currentEditId) return;
  const data = {};
  currentBook.fields.forEach(f => {
    if (f.type === 'formula') return;
    const el = document.getElementById('field_' + f.key);
    if (!el) return;
    if (f.type === 'checkbox') data[f.key] = el.checked;
    else data[f.key] = el.value;
  });
  saveDraft(currentBook.id, { data, savedAt: Date.now() });
}

function renderFormField(f) {
  const id = 'field_' + f.key;
  let inputHtml = '';

  if (f.type === 'formula') {
    inputHtml = `<input type="text" id="${id}" class="formula-field" readonly placeholder="অটো হিসাব">`;
  } else if (f.type === 'text') {
    inputHtml = `<input type="text" id="${id}" placeholder="লিখুন..." value="${escapeHtml(f.default || '')}" autocomplete="off">`;
  } else if (f.type === 'number') {
    inputHtml = `
      <div class="math-wrapper">
        <input type="text" inputmode="text" id="${id}" placeholder="সংখ্যা বা হিসাব লিখুন" autocomplete="off" value="${escapeHtml(f.default || '')}">
        <button type="button" class="math-eq-btn" onclick="evaluateField(document.getElementById('${id}'))">=</button>
      </div>
    `;
  } else if (f.type === 'date') {
    inputHtml = `<input type="date" id="${id}" value="${f.default || todayISO()}">`;
  } else if (f.type === 'dropdown') {
    const options = f.options || [];
    let optHtml = `<option value="">-- নির্বাচন --</option>`;
    options.forEach(o => {
      const selected = (f.default && f.default === o) ? 'selected' : '';
      optHtml += `<option value="${escapeHtml(o)}" ${selected}>${escapeHtml(o)}</option>`;
    });
    inputHtml = `<select id="${id}">${optHtml}</select>`;
  } else if (f.type === 'checkbox') {
    const checked = (f.default === 'true' || f.default === '1' || f.default === true) ? 'checked' : '';
    inputHtml = `
      <label class="checkbox-field">
        <input type="checkbox" id="${id}" ${checked}>
        <span>হ্যাঁ</span>
      </label>
    `;
  }

  const labelBadge = f.type === 'formula' ? `<span class="formula-badge">অটো</span>` : '';
  const optMark = (f.type === 'formula' || f.type === 'checkbox') ? '' : '<span class="opt">(ঐচ্ছিক)</span>';

  return `
    <div class="form-field-group">
      <label for="${id}">${escapeHtml(f.label)} ${labelBadge} ${optMark}</label>
      ${inputHtml}
    </div>
  `;
}

/* ============ Auto-Calculation ============ */
function recalcFormulas() {
  const context = {};

  currentBook.fields.forEach(f => {
    if (f.type === 'formula') return;
    const el = document.getElementById('field_' + f.key);
    if (!el) return;

    if (f.type === 'checkbox') {
      context[f.key] = el.checked ? 1 : 0;
    } else if (f.type === 'number') {
      const raw = String(el.value || '').trim();
      if (!raw) {
        context[f.key] = 0;
      } else if (/[+\-*/%]/.test(raw)) {
        try {
          let expr = raw
            .replace(/(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)\s*%/g,
              (_, base, op, pct) => `${base}${op}${base}*${pct}/100`)
            .replace(/%/g, '/100');
          if (/^[0-9+\-*/%().\s]+$/.test(expr)) {
            const res = Function('"use strict";return(' + expr + ')')();
            context[f.key] = isFinite(res) ? res : 0;
          } else {
            context[f.key] = 0;
          }
        } catch (e) { context[f.key] = 0; }
      } else {
        const num = parseFloat(raw);
        context[f.key] = isNaN(num) ? 0 : num;
      }
    } else {
      context[f.key] = el.value || '';
    }
  });

  // ফর্মুলা ৫ পাস (নেস্টিং ঠিকভাবে কাজ করার জন্য)
  for (let pass = 0; pass < 5; pass++) {
    currentBook.fields.forEach(f => {
      if (f.type !== 'formula') return;
      if (!f.formula) return;
      const result = calcFormula(f.formula, context);
      context[f.key] = result;
      const el = document.getElementById('field_' + f.key);
      if (el) {
        el.value = isNaN(result) ? 'ভুল ফর্মুলা' : result;
      }
    });
  }
}

function evaluateField(input) {
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  if (!/[+\-*/%]/.test(val)) return;

  if (!/^[0-9+\-*/%().\s]+$/.test(val)) {
    showToast('শুধু সংখ্যা ও + - * / % ব্যবহার করুন', 'error');
    return;
  }

  try {
    let expr = val
      .replace(/(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)\s*%/g,
        (_, base, op, pct) => `${base}${op}${base}*${pct}/100`)
      .replace(/%/g, '/100');

    const result = Function('"use strict";return(' + expr + ')')();
    if (typeof result === 'number' && isFinite(result)) {
      input.value = Math.round(result * 100) / 100;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      recalcFormulas();
    } else {
      showToast('হিসাব সঠিক নয়', 'error');
    }
  } catch (e) {
    showToast('হিসাব সঠিক নয়', 'error');
  }
}

function cancelForm() {
  currentEditId = null;
  resetForm(true);
  showToast('ফর্ম খালি করা হয়েছে');
}

function resetForm(clearDraftToo = false) {
  currentEditId = null;
  document.getElementById('formTitle').textContent = 'নতুন এন্ট্রি';
  document.getElementById('editBadge').style.display = 'none';
  document.getElementById('deleteBtn').style.display = 'none';

  currentBook.fields.forEach(f => {
    if (f.type === 'formula') return;
    const el = document.getElementById('field_' + f.key);
    if (!el) return;
    if (f.type === 'checkbox') el.checked = (f.default === 'true' || f.default === '1');
    else if (f.type === 'date') el.value = f.default || todayISO();
    else el.value = f.default || '';
  });

  if (clearDraftToo) clearDraft(currentBook.id);

  recalcFormulas();
}

function saveEntry() {
  if (!currentBook.fields.length) {
    showToast('আগে ফিল্ড তৈরি করুন', 'error');
    return;
  }

  const data = {};

  currentBook.fields.forEach(f => {
    if (f.type === 'formula') return;
    const el = document.getElementById('field_' + f.key);
    if (!el) return;

    if (f.type === 'checkbox') {
      data[f.key] = el.checked;
    } else if (f.type === 'number') {
      const raw = String(el.value || '').trim();
      if (raw === '') {
        data[f.key] = 0;
      } else if (/[+\-*/%]/.test(raw)) {
        try {
          let expr = raw
            .replace(/(\d+(?:\.\d+)?)\s*([+\-])\s*(\d+(?:\.\d+)?)\s*%/g,
              (_, base, op, pct) => `${base}${op}${base}*${pct}/100`)
            .replace(/%/g, '/100');
          if (/^[0-9+\-*/%().\s]+$/.test(expr)) {
            const calc = Function('"use strict";return(' + expr + ')')();
            data[f.key] = isFinite(calc) ? calc : 0;
          } else {
            data[f.key] = 0;
          }
        } catch (e) { data[f.key] = 0; }
      } else {
        const num = parseFloat(raw);
        data[f.key] = isNaN(num) ? 0 : num;
      }
    } else {
      data[f.key] = el.value || '';
    }
  });

  // ফর্মুলা (৫ পাস)
const context = { ...data };
for (let pass = 0; pass < 5; pass++) {
  currentBook.fields.forEach(f => {
    if (f.type !== 'formula') return;
    const result = calcFormula(f.formula, context);
    const safe = isNaN(result) ? 0 : result;
    context[f.key] = safe;
    data[f.key] = safe;
  });
}

  if (currentEditId) {
    const idx = currentEntries.findIndex(e => e.id === currentEditId);
    if (idx >= 0) {
      currentEntries[idx] = { ...currentEntries[idx], ...data, updatedAt: Date.now() };
      showToast('আপডেট হয়েছে', 'success');
    }
  } else {
    currentEntries.push({
      id: generateId('entry'),
      ...data,
      createdAt: Date.now()
    });
    showToast('সেভ হয়েছে', 'success');
  }

  const ok = saveEntries(currentBook.id, currentEntries);
  if (ok) {
    clearDraft(currentBook.id);
    resetForm(false);
    renderTable();
    renderSummary();
  }
}

function deleteCurrent() {
  if (!currentEditId) return;
  pendingDeleteId = currentEditId;
  pendingDeleteBulk = false;
  document.getElementById('deleteMessage').textContent = 'এই এন্ট্রিটি ডিলিট করবেন? (রিসাইকেল বিনে যাবে)';
  document.getElementById('deleteModal').classList.add('open');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('open');
  pendingDeleteId = null;
  pendingDeleteBulk = false;
}

function confirmDelete() {
  if (pendingDeleteBulk) {
    const ids = Array.from(selectedIds);
    trashEntries(currentBook.id, ids);
    currentEntries = currentEntries.filter(e => !ids.includes(e.id));
    showToast(toBn(ids.length) + 'টি এন্ট্রি রিসাইকেল বিনে পাঠানো হয়েছে', 'success');
    exitSelectMode();
    renderTable();
    renderSummary();
  } else if (pendingDeleteId) {
    trashEntries(currentBook.id, [pendingDeleteId]);
    currentEntries = currentEntries.filter(e => e.id !== pendingDeleteId);
    showToast('এন্ট্রি রিসাইকেল বিনে পাঠানো হয়েছে', 'success');
    resetForm(true);
    renderTable();
    renderSummary();
  }
  closeDeleteModal();
}

/* ============ Table ============ */
function renderTable() {
  const thead = document.getElementById('tableHead');
  const tbody = document.getElementById('tableBody');
  const empty = document.getElementById('tableEmpty');

  if (!currentBook.fields.length) {
    thead.innerHTML = '';
    tbody.innerHTML = '';
    empty.style.display = 'block';
    empty.querySelector('p').textContent = 'কোনো ফিল্ড নেই — আগে ফিল্ড তৈরি করুন';
    return;
  }

  let headHtml = '';
  if (isSelectMode) headHtml += '<th style="width:40px;"></th>';
  currentBook.fields.forEach(f => {
    const cls = f.type === 'formula' ? 'formula-th' : '';
    headHtml += `<th class="${cls}">${escapeHtml(f.label)}</th>`;
  });
  if (!isSelectMode) headHtml += '<th style="width:50px;"></th>';
  thead.innerHTML = headHtml;

  const list = getFilteredEntries();

  if (list.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    empty.querySelector('p').textContent = currentEntries.length === 0
      ? 'এখনো কোনো ডেটা যোগ করা হয়নি'
      : 'কোনো ফলাফল পাওয়া যায়নি';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = list.map(e => {
    let rowHtml = `<tr onclick="${isSelectMode ? `toggleRowSelect('${e.id}')` : `editEntry('${e.id}')`}">`;

    if (isSelectMode) {
      const checked = selectedIds.has(e.id) ? 'checked' : '';
      rowHtml += `<td class="checkbox-td" onclick="event.stopPropagation();">
        <input type="checkbox" ${checked} onclick="event.stopPropagation(); toggleRowSelect('${e.id}')">
      </td>`;
    }

    currentBook.fields.forEach(f => {
      const val = e[f.key];
      const display = formatFieldValue(val, f);
      const cls = f.type === 'formula' ? 'formula-td' : '';
      rowHtml += `<td class="${cls}">${display}</td>`;
    });

    if (!isSelectMode) {
      rowHtml += `<td class="action-td" onclick="event.stopPropagation();">
        <button class="row-action-btn copy-btn" onclick="event.stopPropagation(); duplicateEntry('${e.id}')" title="কপি করুন">📋</button>
      </td>`;
    }
    rowHtml += '</tr>';
    return rowHtml;
  }).join('');

  updateSelCount();
}

function formatFieldValue(val, field) {
  if (val === null || val === undefined || val === '') return '—';
  if (field.type === 'number' || field.type === 'formula') {
    const num = Number(val);
    if (!isNaN(num)) return formatNumberBn(num);
    return escapeHtml(String(val));
  }
  if (field.type === 'date') {
    try { return formatDateBn(val); } catch (e) { return escapeHtml(String(val)); }
  }
  if (field.type === 'checkbox') {
    return val ? '✓' : '—';
  }
  return escapeHtml(String(val));
}

function getFilteredEntries() {
  let list = currentEntries.slice();

  // 👇 এই ৬টি নতুন লাইন
  const searchEl = document.getElementById('tableSearch');
  const filterDateEl = document.getElementById('filterDate');
  const sortByEl = document.getElementById('sortBy');
  const search = (searchEl?.value || '').toLowerCase().trim();
  const dateFilter = filterDateEl?.value || '';
  const sortBy = sortByEl?.value || 'newest';

  if (search) {
    list = list.filter(e => {
      return currentBook.fields.some(f => {
        const v = e[f.key];
        return v !== null && v !== undefined && String(v).toLowerCase().includes(search);
      });
    });
  }

  if (dateFilter) {
    // ডেট ফিল্ড খুঁজি
    const dateField = currentBook.fields.find(f => f.type === 'date');
    const today = new Date();
    let fromDate = null;
    let toDate = null;

    if (dateFilter === 'today') {
      const iso = todayISO();
      fromDate = new Date(iso + 'T00:00:00');
      toDate = new Date(iso + 'T23:59:59');
    } else if (dateFilter === 'week') {
      fromDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (dateFilter === 'month') {
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (dateFilter === 'year') {
      fromDate = new Date(today.getFullYear(), 0, 1);
    } else if (dateFilter === 'custom') {
      const startVal = document.getElementById('filterStartDate').value;
      const endVal = document.getElementById('filterEndDate').value;
      if (startVal) fromDate = new Date(startVal + 'T00:00:00');
      if (endVal) toDate = new Date(endVal + 'T23:59:59');
    }

    if (fromDate || toDate) {
      list = list.filter(e => {
        let ts;
        if (dateField && e[dateField.key]) {
          ts = new Date(e[dateField.key] + 'T00:00:00').getTime();
        } else {
          ts = e.createdAt || 0;
        }
        if (isNaN(ts)) return false;
        if (fromDate && ts < fromDate.getTime()) return false;
        if (toDate && ts > toDate.getTime()) return false;
        return true;
      });
    }
  }

  list.sort((a, b) => {
    if (sortBy === 'newest') return (b.createdAt || 0) - (a.createdAt || 0);
    if (sortBy === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0);
    return 0;
  });

  return list;
}

function toggleFilterPanel() {
  const p = document.getElementById('filterPanel');
  const s = document.getElementById('sortPanel');
  s.classList.remove('open');
  p.classList.toggle('open');
  document.getElementById('filterBtn').classList.toggle('active', p.classList.contains('open'));
  document.getElementById('sortBtn').classList.remove('active');
}

function toggleSortPanel() {
  const p = document.getElementById('sortPanel');
  const f = document.getElementById('filterPanel');
  f.classList.remove('open');
  p.classList.toggle('open');
  document.getElementById('sortBtn').classList.toggle('active', p.classList.contains('open'));
  document.getElementById('filterBtn').classList.remove('active');
}

/* ============ Edit Entry ============ */
function editEntry(id) {
  const e = currentEntries.find(x => x.id === id);
  if (!e) return;

  switchViewTab('form');
  currentEditId = id;

  currentBook.fields.forEach(f => {
    if (f.type === 'formula') return;
    const el = document.getElementById('field_' + f.key);
    if (!el) return;

    const val = e[f.key];
    if (f.type === 'checkbox') {
      el.checked = (val === true || val === 1 || val === 'true' || val === '1');
    } else if (f.type === 'dropdown') {
      el.value = (val === undefined || val === null) ? '' : String(val);
    } else if (f.type === 'number') {
      el.value = (val === undefined || val === null || val === '') ? '' : val;
    } else {
      el.value = (val === undefined || val === null) ? '' : val;
    }
  });

  document.getElementById('formTitle').textContent = 'এন্ট্রি এডিট';
  document.getElementById('editBadge').style.display = 'inline-block';
  document.getElementById('deleteBtn').style.display = 'block';

  recalcFormulas();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============ Selection ============ */
function enterSelectMode() {
  isSelectMode = true;
  selectedIds.clear();
  document.getElementById('selectionBar').classList.add('open');
  document.getElementById('selectModeBtn').classList.add('active');
  document.getElementById('selectModeBtn').textContent = '☑ সক্রিয়';
  renderTable();
  renderSummary();
}

function exitSelectMode() {
  isSelectMode = false;
  selectedIds.clear();
  document.getElementById('selectionBar').classList.remove('open');
  document.getElementById('selectModeBtn').classList.remove('active');
  document.getElementById('selectModeBtn').textContent = '☑ Select';
  renderTable();
  renderSummary();
}

function toggleRowSelect(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  renderTable();
  renderSummary();
}

function toggleSelectAll() {
  const list = getFilteredEntries();
  const allSel = list.length > 0 && list.every(e => selectedIds.has(e.id));
  if (allSel) list.forEach(e => selectedIds.delete(e.id));
  else list.forEach(e => selectedIds.add(e.id));
  renderTable();
  renderSummary();
}

function updateSelCount() {
  document.getElementById('selCount').textContent = toBn(selectedIds.size) + 'টি নির্বাচিত';
}

function deleteSelected() {
  if (selectedIds.size === 0) {
    showToast('কিছু নির্বাচন করুন', 'error');
    return;
  }
  pendingDeleteBulk = true;
  pendingDeleteId = null;
  document.getElementById('deleteMessage').textContent = toBn(selectedIds.size) + 'টি এন্ট্রি ডিলিট করবেন? (রিসাইকেল বিনে যাবে)';
  document.getElementById('deleteModal').classList.add('open');
}

/* ============ Export ============ */
function openExportSheet() {
  document.getElementById('exportOverlay').classList.add('open');
  document.getElementById('exportSheet').classList.add('open');
}

function closeExportSheet() {
  document.getElementById('exportOverlay').classList.remove('open');
  document.getElementById('exportSheet').classList.remove('open');
}

function exportCSV() {
  closeExportSheet();
  const list = getFilteredEntries();
  if (list.length === 0) {
    showToast('এক্সপোর্ট করার ডেটা নেই', 'error');
    return;
  }

  const header = currentBook.fields.map(f => f.label);
  const rows = [header];
  list.forEach(e => {
    rows.push(currentBook.fields.map(f => {
      const v = e[f.key];
      if (v === null || v === undefined) return '';
      if (f.type === 'checkbox') return v ? 'হ্যাঁ' : 'না';
      if (f.type === 'date') return formatDateBn(v) || String(v);
      return String(v);
    }));
  });

  const csv = '\uFEFF' + rows.map(r =>
    r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (currentBook.name || 'book') + '_' + todayISO() + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV ডাউনলোড হয়েছে', 'success');
}

function exportPDF() {
  closeExportSheet();
  window.print();
}

function toggleDateRange() {
  const filterDate = document.getElementById('filterDate').value;
  const rangeInputs = document.getElementById('dateRangeInputs');
  rangeInputs.style.display = (filterDate === 'custom') ? 'block' : 'none';
}

/* ============ Duplicate ============ */
function duplicateEntry(id) {
  const e = currentEntries.find(x => x.id === id);
  if (!e) return;

  switchViewTab('form');
  currentEditId = null;

  currentBook.fields.forEach(f => {
    if (f.type === 'formula') return;
    const el = document.getElementById('field_' + f.key);
    if (!el) return;
    const val = e[f.key];
    if (f.type === 'checkbox') {
      el.checked = (val === true || val === 1 || val === 'true' || val === '1');
    } else if (f.type === 'dropdown') {
      el.value = (val === undefined || val === null) ? '' : String(val);
    } else if (f.type === 'number') {
      el.value = (val === undefined || val === null || val === '') ? '' : val;
    } else {
      el.value = (val === undefined || val === null) ? '' : val;
    }
  });

  const dateField = currentBook.fields.find(f => f.type === 'date');
  if (dateField) {
    const dateEl = document.getElementById('field_' + dateField.key);
    if (dateEl) dateEl.value = todayISO();
  }

  document.getElementById('formTitle').textContent = 'নতুন এন্ট্রি (কপি)';
  document.getElementById('editBadge').style.display = 'none';
  document.getElementById('deleteBtn').style.display = 'none';

  recalcFormulas();
  saveDraftAuto();

  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('এন্ট্রি কপি হয়েছে — প্রয়োজনে এডিট করে সেভ করুন', 'success');
}

/* ============ Enter Navigation ============ */
function attachEnterNavigation() {
  const allInputs = Array.from(
    document.querySelectorAll('#dynamicForm input, #dynamicForm select, #dynamicForm textarea')
  ).filter(el => !el.readOnly && el.type !== 'hidden');

  allInputs.forEach((el, index) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const nextField = allInputs[index + 1];
        if (nextField) {
          nextField.focus();
          if (nextField.setSelectionRange && nextField.value) {
            const len = nextField.value.length;
            nextField.setSelectionRange(len, len);
          }
        } else {
          const saveBtn = document.querySelector('.btn-save');
          if (saveBtn) saveBtn.focus();
        }
      }
    });
  });
}