/* ============================================================
   আমার খাতা — Storage Manager v3.1 (Tombstone-Integrated + Fixed)
   
   ✅ Tombstone tracking (delete sync হয়)
   ✅ Timestamp preservation (conflict resolution)
   ✅ Restore-এ tombstone সবসময় clear
   ✅ Export/Import-এ tombstone included
   ✅ Backward compatible
   ✅ Single source of truth for tombstones
   ============================================================ */

const STORAGE_PREFIX = 'likhipata_';
const TOMBSTONE_KEY = 'likhipata_tombstones';
const DATA_VERSION = 2;

/* ============================================================
   SECTION 1: BOOKS CRUD
   ============================================================ */

function getBooks() {
  return loadFromStorage(STORAGE_PREFIX + 'books', []);
}

function saveBooks(books) {
  const ok = saveToStorage(STORAGE_PREFIX + 'books', books);
  if (ok) notifyDataChanged();
  return ok;
}

function getBook(bookId) { return getBooks().find(b => b.id === bookId); }

function addBook(book) {
  const books = getBooks();
  if (!book.createdAt) book.createdAt = Date.now();
  if (!book.updatedAt) book.updatedAt = Date.now();
  books.push(book);
  return saveBooks(books);
}

function updateBook(bookId, updates) {
  const books = getBooks();
  const idx = books.findIndex(b => b.id === bookId);
  if (idx < 0) return false;
  books[idx] = { ...books[idx], ...updates, updatedAt: Date.now() };
  return saveBooks(books);
}

/* ============================================================
   SECTION 2: TOMBSTONE MANAGEMENT (Single Source of Truth)
   ============================================================ */

function getTombstones() {
  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY);
    if (!raw) return { books: {}, entries: {} };
    const parsed = JSON.parse(raw);
    return {
      books: parsed.books || {},
      entries: parsed.entries || {}
    };
  } catch (e) {
    return { books: {}, entries: {} };
  }
}

function saveTombstones(tombstones) {
  try {
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(tombstones));
    return true;
  } catch (e) {
    console.warn('Tombstone save failed:', e);
    return false;
  }
}

function recordTombstone(type, id) {
  if (!id) return;
  const ts = Date.now();
  const tombstones = getTombstones();
  if (type === 'book') {
    tombstones.books[id] = ts;
  } else if (type === 'entry') {
    tombstones.entries[id] = ts;
  } else {
    return;
  }
  saveTombstones(tombstones);
}

function clearTombstone(type, id) {
  if (!id) return;
  const tombstones = getTombstones();
  let changed = false;
  if (type === 'book' && tombstones.books[id]) {
    delete tombstones.books[id];
    changed = true;
  } else if (type === 'entry' && tombstones.entries[id]) {
    delete tombstones.entries[id];
    changed = true;
  }
  if (changed) saveTombstones(tombstones);
}

function cleanOldTombstones() {
  const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const tombstones = getTombstones();
  let changed = false;
  Object.keys(tombstones.books).forEach(id => {
    if (tombstones.books[id] < cutoff) {
      delete tombstones.books[id];
      changed = true;
    }
  });
  Object.keys(tombstones.entries).forEach(id => {
    if (tombstones.entries[id] < cutoff) {
      delete tombstones.entries[id];
      changed = true;
    }
  });
  if (changed) saveTombstones(tombstones);
}

/* ============================================================
   SECTION 3: RECYCLE BIN — BOOKS
   ============================================================ */

function deleteBook(bookId) {
  const books = getBooks();
  const bookToDelete = books.find(b => b.id === bookId);
  if (!bookToDelete) return false;

  // Tombstone record (sync-এর জন্য)
  recordTombstone('book', bookId);
  // Book-এর সব entry-রও tombstone record
  const entries = getEntries(bookId);
  entries.forEach(e => recordTombstone('entry', e.id));

  // Trash-এ সংরক্ষণ
  const trashedBooks = loadFromStorage(STORAGE_PREFIX + 'trash_books', []);
  trashedBooks.push({
    ...bookToDelete,
    entries: entries,
    deletedAt: Date.now()
  });
  saveToStorage(STORAGE_PREFIX + 'trash_books', trashedBooks);

  // Book মুছি
  const newBooks = books.filter(b => b.id !== bookId);
  localStorage.removeItem(STORAGE_PREFIX + 'entries_' + bookId);
  return saveBooks(newBooks);
}

function restoreBookFromTrash(bookId) {
  const trashed = loadFromStorage(STORAGE_PREFIX + 'trash_books', []);
  const idx = trashed.findIndex(b => b.id === bookId);
  if (idx < 0) return false;

  const book = { ...trashed[idx] };
  const entries = book.entries || [];
  delete book.entries;
  delete book.deletedAt;

  // 👇 FIX #4: tombstone সবসময় clear (ID conflict হলেও)
  clearTombstone('book', bookId);

  const books = getBooks();
  if (books.find(b => b.id === book.id)) {
    // Same ID already আছে → নতুন ID
    book.id = generateId('book');
  }

  books.push(book);
  saveBooks(books);
  saveEntries(book.id, entries);

  // Trash থেকে সরাই
  trashed.splice(idx, 1);
  saveToStorage(STORAGE_PREFIX + 'trash_books', trashed);

  // Entry-level tombstone clear
  entries.forEach(e => clearTombstone('entry', e.id));

  // Trashed entries-ও সরাই
  const trashedEntries = loadFromStorage(STORAGE_PREFIX + 'trash_entries', []);
  const newTrashedEntries = trashedEntries.filter(e => e.bookId !== bookId);
  if (newTrashedEntries.length !== trashedEntries.length) {
    saveToStorage(STORAGE_PREFIX + 'trash_entries', newTrashedEntries);
  }

  notifyDataChanged();
  return true;
}

function permanentlyDeleteBook(bookId) {
  const trashed = loadFromStorage(STORAGE_PREFIX + 'trash_books', []);
  const newTrash = trashed.filter(b => b.id !== bookId);
  return saveToStorage(STORAGE_PREFIX + 'trash_books', newTrash);
}

/* ============================================================
   SECTION 4: ENTRIES CRUD
   ============================================================ */

function getEntries(bookId) {
  return loadFromStorage(STORAGE_PREFIX + 'entries_' + bookId, []);
}

function saveEntries(bookId, entries) {
  const ok = saveToStorage(STORAGE_PREFIX + 'entries_' + bookId, entries);
  if (ok) notifyDataChanged();
  return ok;
}

/* ============================================================
   SECTION 5: RECYCLE BIN — ENTRIES
   ============================================================ */

function trashEntries(bookId, entryIds) {
  const entries = getEntries(bookId);
  const trashed = loadFromStorage(STORAGE_PREFIX + 'trash_entries', []);

  entryIds.forEach(id => recordTombstone('entry', id));

  const toTrash = entries.filter(e => entryIds.includes(e.id));
  toTrash.forEach(e => {
    trashed.push({ ...e, bookId: bookId, deletedAt: Date.now() });
  });
  saveToStorage(STORAGE_PREFIX + 'trash_entries', trashed);

  const remaining = entries.filter(e => !entryIds.includes(e.id));
  return saveEntries(bookId, remaining);
}

function restoreEntryFromTrash(entryId) {
  const trashed = loadFromStorage(STORAGE_PREFIX + 'trash_entries', []);
  const idx = trashed.findIndex(e => e.id === entryId);
  if (idx < 0) return false;

  const entry = { ...trashed[idx] };
  const bookId = entry.bookId;
  delete entry.bookId;
  delete entry.deletedAt;

  const parentBook = getBook(bookId);
  if (!parentBook) return false;

  // 👇 tombstone সবসময় clear
  clearTombstone('entry', entryId);

  const entries = getEntries(bookId);
  if (!entries.find(e => e.id === entry.id)) {
    entries.push(entry);
    saveEntries(bookId, entries);
  }

  trashed.splice(idx, 1);
  saveToStorage(STORAGE_PREFIX + 'trash_entries', trashed);
  return true;
}

function permanentlyDeleteEntry(entryId) {
  const trashed = loadFromStorage(STORAGE_PREFIX + 'trash_entries', []);
  const newTrash = trashed.filter(e => e.id !== entryId);
  return saveToStorage(STORAGE_PREFIX + 'trash_entries', newTrash);
}

function emptyRecycleBin() {
  saveToStorage(STORAGE_PREFIX + 'trash_books', []);
  saveToStorage(STORAGE_PREFIX + 'trash_entries', []);
  notifyDataChanged();
}

/* ============================================================
   SECTION 6: THEME
   ============================================================ */

function getTheme() {
  return localStorage.getItem(STORAGE_PREFIX + 'theme') || 'light';
}

function saveTheme(theme) {
  localStorage.setItem(STORAGE_PREFIX + 'theme', theme);
  applyTheme(theme);
}

function applyTheme(theme) {
  document.body.classList.remove('dark-mode', 'amoled-mode');
  if (theme === 'dark') document.body.classList.add('dark-mode');
  else if (theme === 'amoled') document.body.classList.add('amoled-mode');
}

/* ============================================================
   SECTION 7: DRAFT
   ============================================================ */

function saveDraft(bookId, data) {
  if (!bookId) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + 'draft_' + bookId, JSON.stringify(data));
  } catch (e) { /* ignore */ }
}

function loadDraft(bookId) {
  if (!bookId) return null;
  return loadFromStorage(STORAGE_PREFIX + 'draft_' + bookId, null);
}

function clearDraft(bookId) {
  if (!bookId) return;
  localStorage.removeItem(STORAGE_PREFIX + 'draft_' + bookId);
}

/* ============================================================
   SECTION 8: ID GENERATOR
   ============================================================ */

function generateId(prefix = 'id') {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/* ============================================================
   SECTION 9: EXPORT / IMPORT
   ============================================================ */

function exportAllData() {
  const books = getBooks();
  const tombstones = getTombstones();

  return {
    app: 'আমার খাতা',
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    theme: getTheme(),
    books: books.map(b => ({
      ...b,
      summaryCards: b.summaryCards || [],
      entries: getEntries(b.id)
    })),
    trashBooks: loadFromStorage(STORAGE_PREFIX + 'trash_books', []),
    trashEntries: loadFromStorage(STORAGE_PREFIX + 'trash_entries', []),
    tombstones: tombstones,
    lastSyncAt: parseInt(localStorage.getItem('likhipata_last_sync') || '0')
  };
}

function importAllData(data) {
  if (!data || !Array.isArray(data.books)) {
    throw new Error('ভুল ব্যাকআপ ফাইল — books অ্যারে নেই');
  }

  // পুরোনো ডেটা মুছি
  const oldBooks = getBooks();
  oldBooks.forEach(b => {
    localStorage.removeItem(STORAGE_PREFIX + 'entries_' + b.id);
  });
  localStorage.removeItem(STORAGE_PREFIX + 'trash_books');
  localStorage.removeItem(STORAGE_PREFIX + 'trash_entries');

  // নতুন books সেভ
  const newBooks = [];
  for (const b of data.books) {
    const { entries, ...bookMeta } = b;

    if (!bookMeta.summaryCards) bookMeta.summaryCards = [];
    if (!Array.isArray(bookMeta.fields)) bookMeta.fields = [];
    if (!bookMeta.createdAt) bookMeta.createdAt = Date.now();
    if (!bookMeta.updatedAt) bookMeta.updatedAt = bookMeta.createdAt;

    newBooks.push(bookMeta);

    if (Array.isArray(entries)) {
      const fixedEntries = entries.map(e => ({
        ...e,
        createdAt: e.createdAt || Date.now(),
        updatedAt: e.updatedAt || e.createdAt || Date.now()
      }));
      const ok = saveToStorage(STORAGE_PREFIX + 'entries_' + bookMeta.id, fixedEntries);
      if (!ok) throw new Error('এন্ট্রি সেভ ব্যর্থ: ' + bookMeta.id);
    }
  }

  const okBooks = saveToStorage(STORAGE_PREFIX + 'books', newBooks);
  if (!okBooks) throw new Error('বুক সেভ ব্যর্থ');

  // Trash
  if (Array.isArray(data.trashBooks)) {
    saveToStorage(STORAGE_PREFIX + 'trash_books', data.trashBooks);
  }
  if (Array.isArray(data.trashEntries)) {
    saveToStorage(STORAGE_PREFIX + 'trash_entries', data.trashEntries);
  }

  // 👇 FIX #5: Tombstones merge (drive data + local data)
  if (data.tombstones && typeof data.tombstones === 'object') {
    const existingTombs = getTombstones();
    Object.keys(data.tombstones.books || {}).forEach(id => {
      const driveTs = data.tombstones.books[id];
      if (!existingTombs.books[id] || existingTombs.books[id] < driveTs) {
        existingTombs.books[id] = driveTs;
      }
    });
    Object.keys(data.tombstones.entries || {}).forEach(id => {
      const driveTs = data.tombstones.entries[id];
      if (!existingTombs.entries[id] || existingTombs.entries[id] < driveTs) {
        existingTombs.entries[id] = driveTs;
      }
    });
    saveTombstones(existingTombs);
  }

  if (data.lastSyncAt) {
    localStorage.setItem('likhipata_last_sync', String(data.lastSyncAt));
  }

  if (data.theme) saveTheme(data.theme);

  return true;
}

/* ============================================================
   SECTION 10: PUBLIC API — drive-sync-এর জন্য
   ============================================================ */

window.recordBookTombstone = function(bookId) {
  recordTombstone('book', bookId);
};

window.recordEntryTombstone = function(entryId) {
  recordTombstone('entry', entryId);
};

window.__debugStorage = function() {
  const tombs = getTombstones();
  console.log('=== Storage Debug ===');
  console.log('Books:', getBooks().length);
  console.log('Trash books:', loadFromStorage(STORAGE_PREFIX + 'trash_books', []).length);
  console.log('Trash entries:', loadFromStorage(STORAGE_PREFIX + 'trash_entries', []).length);
  console.log('Tombstones (books):', Object.keys(tombs.books).length);
  console.log('Tombstones (entries):', Object.keys(tombs.entries).length);
  console.log('Last sync:', new Date(parseInt(localStorage.getItem('likhipata_last_sync') || '0')));
};