/* ============================================================
   আমার খাতা — Dashboard Logic v2
   ============================================================ */

let editingBookId = null;

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(getTheme());
  
  // 👇 নতুন লজিক: sessionStorage ব্যবহার করে স্প্ল্যাশ কন্ট্রোল
  const splash = document.getElementById('splashScreen');
  // যদি এই সেশনে (অ্যাপ ওপেন করার পর) একবার স্প্ল্যাশ দেখা হয়ে থাকে
  if (sessionStorage.getItem('amar_khata_splash_shown') === 'true') {
    if (splash) splash.classList.add('hidden');
  } else {
    // প্রথমবার অ্যাপ ওপেন হলে স্প্ল্যাশ দেখাবে
    sessionStorage.setItem('amar_khata_splash_shown', 'true');
    
    // যদি ইউজার আগেই গুগল ড্রাইভে লগইন থাকে, তবে স্প্ল্যাশে ২ সেকেন্ড পর হোমে চলে যাবে
    if (localStorage.getItem('likhipata_drive_connected') === 'true') {
      setTimeout(() => {
        if (splash && !splash.classList.contains('hidden')) {
          splash.classList.add('hidden');
        }
      }, 2000); // ২ সেকেন্ড পর অটোমেটিক হোম স্ক্রিন
    }
  }

  renderBooks();
  attachEvents();
  showFirstTimeTip();
});

function hideSplash() {
  const splash = document.getElementById('splashScreen');
  if (splash) splash.classList.add('hidden');
}

function skipSplash() {
  hideSplash();
}

function showFirstTimeTip() {
  if (typeof showOnboardingTip !== 'function') return;
  const KEY = 'likhipata_onboarding_tip_v1'; // 👈
  if (localStorage.getItem(KEY) === 'shown') return;
  // স্প্ল্যাশ শেষ হলে দেখাও
  const check = setInterval(() => {
    const splash = document.getElementById('splashScreen');
    if (splash && splash.classList.contains('hidden')) {
      clearInterval(check);
      setTimeout(() => {
        showOnboardingTip('🎉', 'স্বাগতম!', 'নতুন বুক তৈরি করে শুরু করুন — ডান পাশের + বাটনে ক্লিক করুন', KEY);
      }, 600);
    }
  }, 500);
}

/* ============ Render ============ */
function renderBooks() {
  const books = getBooks();
  const list = document.getElementById('booksList');
  const empty = document.getElementById('emptyState');
  const countBadge = document.getElementById('bookCount');
  const statBooks = document.getElementById('statBooks');
  const statEntries = document.getElementById('statEntries');

  let totalEntries = 0;
  books.forEach(b => { totalEntries += getEntries(b.id).length; });
  if (statBooks) statBooks.textContent = toBn(books.length);
  if (statEntries) statEntries.textContent = toBn(totalEntries);
  if (countBadge) countBadge.textContent = toBn(books.length) + 'টি';

  if (books.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = books.map(book => {
    const entryCount = getEntries(book.id).length;
    return `
      <div class="book-card" onclick="openBook('${book.id}')">
        <div class="book-icon" style="background:${book.color || 'linear-gradient(135deg,#DBEAFE,#BFDBFE)'}">
          ${book.icon || '📘'}
        </div>
        <div class="book-info">
          <h3>${escapeHtml(book.name)}</h3>
          <p>${toBn(entryCount)}টি এন্ট্রি • ${book.fields ? toBn(book.fields.length) + 'টি ফিল্ড' : 'শূন্য ফিল্ড'}</p>
        </div>
        <div class="book-actions" onclick="event.stopPropagation()">
          <button class="book-action-btn" onclick="openEditBookModal('${book.id}')" title="এডিট">✏️</button>
          <button class="book-action-btn del" onclick="deleteBookConfirm('${book.id}')" title="ডিলিট">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

/* ============ Navigation ============ */
function openBook(bookId) { window.location.href = 'view.html?book=' + bookId; }
function openBuilder(bookId) { window.location.href = 'builder.html?book=' + bookId; }

/* ============ Book Create / Edit ============ */
function openCreateBookModal() {
  editingBookId = null;
  document.getElementById('bookModalTitle').textContent = 'নতুন বুক তৈরি করুন';
  document.getElementById('bookNameInput').value = '';
  document.getElementById('bookIconInput').value = '📘';
  selectColor('linear-gradient(135deg,#DBEAFE,#BFDBFE)');
  document.getElementById('bookModal').classList.add('open');
  setTimeout(() => document.getElementById('bookNameInput').focus(), 200);
}

function openEditBookModal(bookId) {
  const book = getBook(bookId);
  if (!book) return;
  editingBookId = bookId;
  document.getElementById('bookModalTitle').textContent = 'বুক এডিট করুন';
  document.getElementById('bookNameInput').value = book.name;
  document.getElementById('bookIconInput').value = book.icon || '📘';
  selectColor(book.color || 'linear-gradient(135deg,#DBEAFE,#BFDBFE)');
  document.getElementById('bookModal').classList.add('open');
}

function closeBookModal() {
  document.getElementById('bookModal').classList.remove('open');
  editingBookId = null;
}

function selectColor(color) {
  // ১. হিডেন ইনপুটে কালার সেভ
  document.getElementById('bookColorInput').value = color;
  
  // ২. কন্টেইনারে সিলেক্টেড কালার হাইলাইট (.active ক্লাস)
  document.querySelectorAll('.color-option').forEach(el => {
    el.classList.toggle('active', el.dataset.color === color);
  });

  // ৩. 👇 নতুন যোগ করা হয়েছে: আইকন বক্সের ব্যাকগ্রাউন্ড লাইভ আপডেট
  const iconInput = document.getElementById('bookIconInput');
  if (iconInput) {
    // আইকন ইনপুট ফিল্ডের ব্যাকগ্রাউন্ড চেঞ্জ
    iconInput.style.background = color;
    iconInput.style.borderColor = 'transparent'; // বর্ডার হাইড করতে চাইলে
    
    // যদি আপনি চান আইকন ইনপুটের ভেতরে ইমোজি টেক্সট কালার সাদা হোক
    // (সব রঙের জন্য নাও মানতে পারে, তবে সুন্দর দেখাবে)
    iconInput.style.textShadow = '0 2px 4px rgba(0,0,0,0.2)';
  }
}

function saveBook() {
  const name = document.getElementById('bookNameInput').value.trim();
  const icon = document.getElementById('bookIconInput').value.trim() || '📘';
  const color = document.getElementById('bookColorInput').value;

  if (!name) {
    showToast('বুকের নাম লিখুন', 'error');
    return;
  }

  if (editingBookId) {
    const ok = updateBook(editingBookId, { name, icon, color });
    if (!ok) { showToast('আপডেট ব্যর্থ', 'error'); return; }
    showToast('বুক আপডেট হয়েছে', 'success');
  } else {
    const newBook = {
      id: generateId('book'),
      name,
      icon,
      color,
      fields: [],
      summaryCards: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const ok = addBook(newBook);
    if (!ok) { showToast('তৈরি ব্যর্থ', 'error'); return; }
    showToast('নতুন বুক তৈরি হয়েছে', 'success');
  }

  closeBookModal();
  renderBooks();
}

async function deleteBookConfirm(bookId) {
  const book = getBook(bookId);
  if (!book) return;
  const entries = getEntries(bookId);
  let msg = `"${book.name}" বুকটি রিসাইকেল বিনে পাঠাবেন?`;
  if (entries.length > 0) {
    msg += ` এই বুকের ${toBn(entries.length)}টি এন্ট্রিও একসাথে যাবে!`;
  }
  const ok = await askConfirm(msg, {
    title: 'বুক ডিলিট',
    icon: '🗑️',
    confirmLabel: 'হ্যাঁ, ডিলিট',
    danger: true
  });
  if (!ok) return;

  const deleted = deleteBook(bookId);
  if (deleted) {
    showToast('বুক রিসাইকেল বিনে পাঠানো হয়েছে', 'success');
    renderBooks();
  } else {
    showToast('ডিলিট ব্যর্থ', 'error');
  }
}

/* ============ Menu ============ */
function openMenu() {
  document.getElementById('menuOverlay').classList.add('open');
  document.getElementById('menuPanel').classList.add('open');
}
function closeMenu() {
  document.getElementById('menuOverlay').classList.remove('open');
  document.getElementById('menuPanel').classList.remove('open');
}

function openThemeModal() {
  closeMenu();
  document.getElementById('themeModal').classList.add('open');
  const current = getTheme();
  document.querySelectorAll('.theme-choice').forEach(el => {
    el.classList.toggle('active', el.dataset.theme === current);
  });
}
function closeThemeModal() { document.getElementById('themeModal').classList.remove('open'); }
function setThemeAndClose(theme) {
  saveTheme(theme);
  closeThemeModal();
  showToast('থিম পরিবর্তন হয়েছে', 'success');
}

/* ============ Backup ============ */
function downloadBackup() {
  const data = exportAllData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'amar-khata-backup-' + todayISO() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('ব্যাকআপ ডাউনলোড হয়েছে', 'success');
  closeMenu();
}

async function triggerRestore() {
  closeMenu();
  const ok = await askConfirm('বর্তমান সব ডেটা মুছে যাবে এবং ব্যাকআপ থেকে নতুন ডেটা আসবে।', {
    title: 'ব্যাকআপ রিস্টোর',
    icon: '📂',
    confirmLabel: 'হ্যাঁ, রিস্টোর',
    danger: true
  });
  if (!ok) return;
  const input = document.getElementById('restoreFileInput');
  input.value = '';
  input.click();
}

function handleRestoreFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      importAllData(data);
      showToast('সফলভাবে রিস্টোর হয়েছে', 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      console.error(err);
      showToast('ফাইল পড়া যায়নি: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

/* ============ Events ============ */
function attachEvents() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeBookModal();
      closeMenu();
      closeThemeModal();
    }
  });
}