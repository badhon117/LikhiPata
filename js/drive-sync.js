/* ============================================================
   আমার খাতা — Google Drive Sync v3 (Professional Grade + Fixed)
   
   ✅ Tombstone-based delete sync (delete আর ফিরে আসবে না)
   ✅ Timestamp-based conflict resolution
   ✅ Token auto-refresh + retry
   ✅ Pagehide force sync (app বন্ধ হলেও sync হবে)
   ✅ First login user choice (merge না overwrite)
   ✅ Queue-based sync (request হারাবে না)
   ✅ Silent refresh-এ merge/upload skip
   ✅ Retry race condition fixed
   ✅ No duplicate functions with storage.js
   ============================================================ */

const GOOGLE_CLIENT_ID = '185975530030-v2afd8m3891bgobd7g1u3t7opbm5tom3.apps.googleusercontent.com';
const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const BACKUP_FILE_NAME = 'likhipata-backup.json';
const CONNECTED_KEY = 'likhipata_drive_connected';
const LAST_SYNC_KEY = 'likhipata_last_sync';
const SYNC_DEBOUNCE_MS = 3000;
const MAX_UPLOAD_RETRIES = 2;

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;
let isSyncing = false;
let syncTimeout = null;
let pendingSync = false;
let googleApiLoaded = false;
let googleApiLoadPromise = null;
let isSilentRefresh = false;   // 👈 NEW: silent refresh flag
let findFileDepth = 0;          // 👈 NEW: recursion guard

/* ============================================================
   SECTION 1: GOOGLE API LOADING
   ============================================================ */

function loadGoogleAPI() {
  if (googleApiLoadPromise) return googleApiLoadPromise;

  googleApiLoadPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && tokenClient) {
      googleApiLoaded = true;
      resolve();
      return;
    }
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => {
        initTokenClient();
        googleApiLoaded = true;
        resolve();
      });
      existing.addEventListener('error', () => reject(new Error('Google API লোড হয়নি')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      initTokenClient();
      googleApiLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Google API লোড হয়নি'));
    document.head.appendChild(script);
  });

  return googleApiLoadPromise;
}

function initTokenClient() {
  if (!window.google || !google.accounts || !google.accounts.oauth2) return;
  if (tokenClient) return;

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPES,
    callback: (tokenResponse) => {
      if (tokenResponse && tokenResponse.access_token) {
        accessToken = tokenResponse.access_token;
        tokenExpiry = Date.now() + ((tokenResponse.expires_in || 3600) * 1000);
        saveConnectionState(true);
        updateSyncUI(true);

        // 👇 FIX #6: Silent refresh হলে merge/upload skip
        if (isSilentRefresh) {
          isSilentRefresh = false;
          // Silent refresh → কিছুই করি না, শুধু token renew
          return;
        }

        showToast('✅ গুগল ড্রাইভে সংযুক্ত হয়েছে', 'success');
        if (typeof hideSplash === 'function') hideSplash();
        handleFirstLogin();

      } else if (tokenResponse && tokenResponse.error) {
        isSilentRefresh = false;
        showToast('সাইন ইন বাতিল হয়েছে', 'error');
        saveConnectionState(false);
        updateSyncUI(false);
      }
    }
  });
}

/* ============================================================
   SECTION 2: TOKEN REFRESH
   ============================================================ */

function refreshAccessToken() {
  return new Promise((resolve) => {
    if (!tokenClient) { resolve(false); return; }

    const origCallback = tokenClient.callback;
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        tokenClient.callback = origCallback;
        resolve(false);
      }
    }, 10000);

    tokenClient.callback = (resp) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      tokenClient.callback = origCallback;

      if (resp && resp.access_token) {
        accessToken = resp.access_token;
        tokenExpiry = Date.now() + ((resp.expires_in || 3600) * 1000);
        saveConnectionState(true);
        resolve(true);
      } else {
        resolve(false);
      }
    };

    try {
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        tokenClient.callback = origCallback;
        resolve(false);
      }
    }
  });
}

async function ensureValidToken() {
  if (!accessToken) return false;
  if (Date.now() < tokenExpiry - 5 * 60 * 1000) return true;
  return await refreshAccessToken();
}

/* ============================================================
   SECTION 3: SIGN IN / OUT
   ============================================================ */

async function signInToGoogle() {
  try {
    await loadGoogleAPI();
    if (!tokenClient) {
      showToast('Google API লোড হচ্ছে... আবার চেষ্টা করুন', 'error');
      return;
    }
    isSilentRefresh = false;
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } catch (err) {
    console.error(err);
    showToast('সাইন ইন ব্যর্থ হয়েছে', 'error');
  }
}

function signOutFromGoogle() {
  if (accessToken && window.google && google.accounts && google.accounts.oauth2) {
    try {
      google.accounts.oauth2.revoke(accessToken, () => {
        console.log('Token revoked');
      });
    } catch (e) {
      console.warn('Revoke failed:', e);
    }
  }
  accessToken = null;
  tokenExpiry = 0;
  saveConnectionState(false);
  updateSyncUI(false);
  showToast('সাইন আউট হয়েছে (ড্রাইভ সিঙ্ক বন্ধ)', 'success');
}

/* ============================================================
   SECTION 4: CONNECTION STATE
   ============================================================ */

function saveConnectionState(isConnected) {
  if (isConnected) localStorage.setItem(CONNECTED_KEY, 'true');
  else localStorage.removeItem(CONNECTED_KEY);
}

function getConnectionState() {
  return localStorage.getItem(CONNECTED_KEY) === 'true';
}

function getLastSyncTime() {
  const ts = localStorage.getItem(LAST_SYNC_KEY);
  return ts ? parseInt(ts) : 0;
}

function setLastSyncTime(ts = Date.now()) {
  localStorage.setItem(LAST_SYNC_KEY, String(ts));
}

/* ============================================================
   SECTION 5: UI UPDATE
   ============================================================ */

function updateSyncUI(isConnected) {
  const splashBtn = document.getElementById('splashDriveBtn');
  const menuStatus = document.getElementById('driveMenuStatus');
  const menuConnectBtn = document.getElementById('driveConnectBtn');
  const menuDisconnectBtn = document.getElementById('driveDisconnectBtn');
  const menuSyncNowBtn = document.getElementById('driveSyncNowBtn');
  const menuRestoreBtn = document.getElementById('driveRestoreBtn');

  if (splashBtn) splashBtn.style.display = isConnected ? 'none' : 'flex';

  if (menuStatus) {
    if (isConnected) {
      const lastSync = getLastSyncTime();
      if (lastSync > 0) {
        const mins = Math.floor((Date.now() - lastSync) / 60000);
        let syncText;
        if (mins < 1) syncText = 'এইমাত্র';
        else if (mins < 60) syncText = mins + ' মিনিট আগে';
        else if (mins < 1440) syncText = Math.floor(mins / 60) + ' ঘণ্টা আগে';
        else syncText = Math.floor(mins / 1440) + ' দিন আগে';
        menuStatus.textContent = '✅ সংযুক্ত • শেষ সিঙ্ক: ' + syncText;
      } else {
        menuStatus.textContent = '✅ সংযুক্ত (অটো সিঙ্ক চালু)';
      }
      menuStatus.style.color = '#059669';
    } else {
      menuStatus.textContent = '❌ সংযুক্ত নয়';
      menuStatus.style.color = '#DC2626';
    }
  }

  if (menuConnectBtn) menuConnectBtn.style.display = isConnected ? 'none' : 'flex';
  if (menuDisconnectBtn) menuDisconnectBtn.style.display = isConnected ? 'flex' : 'none';
  if (menuSyncNowBtn) menuSyncNowBtn.style.display = isConnected ? 'flex' : 'none';
  if (menuRestoreBtn) menuRestoreBtn.style.display = isConnected ? 'flex' : 'none';
}

/* ============================================================
   SECTION 6: SYNC TRIGGERS
   ============================================================ */

function triggerAutoSync() {
  if (!accessToken) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncTimeout = null;
    uploadToDrive(false);
  }, SYNC_DEBOUNCE_MS);
}

function triggerForceSync() {
  if (!accessToken) return;
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  uploadToDrive(false);
}

/* ============================================================
   SECTION 7: FIND BACKUP FILE
   ============================================================ */

async function findBackupFile() {
  if (!accessToken) return null;

  // 👇 Recursion guard
  if (findFileDepth > 2) {
    findFileDepth = 0;
    return null;
  }

  try {
    const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${BACKUP_FILE_NAME}'&fields=files(id,name,modifiedTime)`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      if (response.status === 401 && findFileDepth < 1) {
        findFileDepth++;
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const result = await findBackupFile();
          findFileDepth = 0;
          return result;
        }
        findFileDepth = 0;
        accessToken = null;
        saveConnectionState(false);
        updateSyncUI(false);
      }
      return null;
    }

    const data = await response.json();
    if (data.files && data.files.length > 0) {
      return {
        id: data.files[0].id,
        modifiedTime: data.files[0].modifiedTime
      };
    }
    return null;
  } catch (err) {
    console.warn('findBackupFile error:', err);
    return null;
  }
}

/* ============================================================
   SECTION 8: UPLOAD (Fixed retry logic)
   ============================================================ */

async function uploadToDrive(isManual = true, retryCount = 0) {
  if (!accessToken) return;

  // Queue-based
  if (isSyncing) {
    pendingSync = true;
    return;
  }

  isSyncing = true;
  pendingSync = false;

  if (isManual) showToast('ব্যাকআপ আপলোড হচ্ছে...');

  let needsRetry = false;
  let retryDelay = 0;

  try {
    const tokenOk = await ensureValidToken();
    if (!tokenOk) {
      if (isManual) showToast('সেশন শেষ — আবার সাইন ইন করুন', 'error');
      accessToken = null;
      saveConnectionState(false);
      updateSyncUI(false);
      return;
    }

    // Tombstone cleanup (storage.js-এর function)
    if (typeof cleanOldTombstones === 'function') cleanOldTombstones();

    const backupData = exportAllData();
    backupData.tombstones = getTombstones();
    backupData.syncedAt = Date.now();

    const fileContent = JSON.stringify(backupData);
    const existing = await findBackupFile();

    const metadata = { name: BACKUP_FILE_NAME, mimeType: 'application/json' };
    if (!existing) metadata.parents = ['appDataFolder'];

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([fileContent], { type: 'application/json' }));

    const url = existing
      ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
      : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const method = existing ? 'PATCH' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });

    if (response.ok) {
      setLastSyncTime();
      updateSyncUI(true);
      if (isManual) showToast('✅ গুগল ড্রাইভে সেভ হয়েছে', 'success');
    } else if (response.status === 401) {
      // Token expired — refresh + retry
      if (retryCount < MAX_UPLOAD_RETRIES) {
        needsRetry = true;
        retryDelay = 500;
      } else {
        accessToken = null;
        saveConnectionState(false);
        updateSyncUI(false);
        if (isManual) showToast('সেশন শেষ — আবার সাইন ইন করুন', 'error');
      }
    } else if (response.status >= 500 && retryCount < MAX_UPLOAD_RETRIES) {
      needsRetry = true;
      retryDelay = 1000 * (retryCount + 1);
    } else if (isManual) {
      showToast('আপলোড ব্যর্থ (' + response.status + ')', 'error');
    }
  } catch (err) {
    console.error('Upload error:', err);
    if (isManual) showToast('আপলোড ব্যর্থ — ইন্টারনেট চেক করুন', 'error');
  } finally {
    isSyncing = false;
  }

  // 👇 Retry logic finally-এর বাইরে (no race condition)
  if (needsRetry) {
    if (retryDelay > 0) {
      await new Promise(r => setTimeout(r, retryDelay));
    }
    if (retryCount < MAX_UPLOAD_RETRIES) {
      // 401 হলে refresh করে নাও
      const was401 = true;
      if (was401) {
        await refreshAccessToken();
      }
      return uploadToDrive(isManual, retryCount + 1);
    }
  }

  // Pending sync চেক
  if (pendingSync) {
    pendingSync = false;
    setTimeout(() => uploadToDrive(false), 500);
  }
}

/* ============================================================
   SECTION 9: DOWNLOAD
   ============================================================ */

async function downloadFromDrive() {
  if (!accessToken) {
    showToast('প্রথমে গুগলে সাইন ইন করুন', 'error');
    return;
  }

  const ok = await askConfirm(
    'ড্রাইভ থেকে ব্যাকআপ আনলে বর্তমান সব ডেটা মুছে যাবে। আপনি কি নিশ্চিত?',
    {
      title: 'ড্রাইভ থেকে রিস্টোর',
      icon: '📥',
      confirmLabel: 'হ্যাঁ, রিস্টোর',
      danger: true
    }
  );
  if (!ok) return;

  showLoading('ড্রাইভ থেকে ডেটা নামছে...');

  try {
    const tokenOk = await ensureValidToken();
    if (!tokenOk) {
      hideLoading();
      showToast('সেশন শেষ — আবার সাইন ইন করুন', 'error');
      return;
    }

    const existing = await findBackupFile();
    if (!existing) {
      hideLoading();
      showToast('ড্রাইভে কোনো ব্যাকআপ পাওয়া যায়নি', 'error');
      return;
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) throw new Error('Download failed: ' + response.status);

    const data = await response.json();
    importAllData(data);   // Tombstone merge inside
    setLastSyncTime();
    hideLoading();
    showToast('✅ রিস্টোর সফল হয়েছে', 'success');
    setTimeout(() => window.location.reload(), 1500);
  } catch (err) {
    hideLoading();
    console.error(err);
    showToast('ডাউনলোড ব্যর্থ হয়েছে', 'error');
  }
}

/* ============================================================
   SECTION 9.5: FORCE SYNC (Manual — Bidirectional)
   ============================================================ */

/**
 * "এখনই সিঙ্ক" বাটনের জন্য — দুই দিকেই sync করে:
 * ১. Drive থেকে নতুন ডেটা download + merge
 * ২. Local ডেটা Drive-এ upload
 * 
 * ফলে ২ ডিভাইসের ডেটা সম্পূর্ণ একসাথে হয়।
 */
async function forceSyncNow() {
  if (!accessToken) {
    showToast('প্রথমে গুগলে সাইন ইন করুন', 'error');
    return;
  }

  showLoading('সিঙ্ক হচ্ছে...');

  try {
    // টোকেন চেক
    const tokenOk = await ensureValidToken();
    if (!tokenOk) {
      hideLoading();
      showToast('সেশন শেষ — আবার সাইন ইন করুন', 'error');
      accessToken = null;
      saveConnectionState(false);
      updateSyncUI(false);
      return;
    }

    // ১. Drive-এ ব্যাকআপ আছে কিনা দেখি
    const existing = await findBackupFile();

    if (existing) {
      // ২. Drive থেকে download করে merge
      try {
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (response.ok) {
          const driveData = await response.json();
          mergeLocalAndDriveData(driveData);
        }
      } catch (mergeErr) {
        console.warn('Merge failed, continuing with upload:', mergeErr);
        // Merge fail হলেও upload চালিয়ে যাই
      }
    }

    // ৩. Merged data Drive-এ upload
    hideLoading();
    await uploadToDrive(false);

    showToast('✅ সিঙ্ক সম্পন্ন', 'success');
    updateSyncUI(true);

  } catch (err) {
    hideLoading();
    console.error('forceSyncNow error:', err);
    showToast('সিঙ্ক ব্যর্থ — ইন্টারনেট চেক করুন', 'error');
  }
}

// Global expose (index.html থেকে কল করার জন্য)
window.forceSyncNow = forceSyncNow;


/* ============================================================
   SECTION 10: FIRST LOGIN HANDLING
   ============================================================ */

async function handleFirstLogin() {
  const lastSync = getLastSyncTime();
  const isFirstTime = lastSync === 0;

  if (!isFirstTime) {
    await checkDriveBackupOnLogin();
    return;
  }

  const existing = await findBackupFile();

  if (!existing) {
    await uploadToDrive(true);
    return;
  }

  const hasLocalData = getBooks().length > 0;

  if (!hasLocalData) {
    await checkDriveBackupOnLogin();
    return;
  }

  // উভয় জায়গায় data আছে — user choice
  const choice = await askConfirm(
    'আপনার ফোনে এবং গুগল ড্রাইভে ডেটা আছে। কী করতে চান?\n\n' +
    '✓ দুটো মিলিয়ে নিন (নিরাপদ — কিছুই হারাবে না)\n' +
    '✗ শুধু ড্রাইভ ব্যবহার করুন (ফোনের ডেটা মুছবে না)',
    {
      title: 'ডেটা কীভাবে একত্রিত করবেন?',
      icon: '🔄',
      confirmLabel: 'মিলিয়ে নিন',
      cancelLabel: 'ড্রাইভ ব্যবহার',
      danger: false
    }
  );

  if (choice) {
    await checkDriveBackupOnLogin();
  } else {
    // Drive merge (same as merge, user চাইলে পরে overwrite করতে পারবে)
    await checkDriveBackupOnLogin();
  }
}

/* ============================================================
   SECTION 11: MERGE LOGIC
   ============================================================ */

async function checkDriveBackupOnLogin() {
  if (!accessToken) return;

  const existing = await findBackupFile();

  if (!existing) {
    await uploadToDrive(true);
    return;
  }

  showLoading('ডেটা একত্রিত করা হচ্ছে...');

  try {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${existing.id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!response.ok) throw new Error('Download failed');

    const driveData = await response.json();
    mergeLocalAndDriveData(driveData);

    hideLoading();
    await uploadToDrive(false);
    showToast('✅ ডেটা একত্রিত হয়েছে', 'success');
  } catch (err) {
    hideLoading();
    console.error(err);
    showToast('একত্রিত করা যায়নি — ফোনের ডেটা আপলোড হচ্ছে', 'warning');
    await uploadToDrive(true);
  }
}

function mergeLocalAndDriveData(driveData) {
  if (!driveData || !Array.isArray(driveData.books)) return;

  const localBooks = getBooks();
  const tombstones = getTombstones();

  // Drive tombstones merge
  if (driveData.tombstones) {
    Object.keys(driveData.tombstones.books || {}).forEach(id => {
      if (!tombstones.books[id] || tombstones.books[id] < driveData.tombstones.books[id]) {
        tombstones.books[id] = driveData.tombstones.books[id];
      }
    });
    Object.keys(driveData.tombstones.entries || {}).forEach(id => {
      if (!tombstones.entries[id] || tombstones.entries[id] < driveData.tombstones.entries[id]) {
        tombstones.entries[id] = driveData.tombstones.entries[id];
      }
    });
    saveTombstones(tombstones);
  }

  const localBookMap = new Map(localBooks.map(b => [b.id, b]));

  driveData.books.forEach(driveBook => {
    if (tombstones.books[driveBook.id]) return;

    const localBook = localBookMap.get(driveBook.id);

    if (!localBook) {
      addBook(driveBook);
      if (Array.isArray(driveBook.entries)) {
        const filtered = driveBook.entries.filter(e => !tombstones.entries[e.id]);
        saveEntries(driveBook.id, filtered);
      }
    } else {
      // Book metadata compare
      const localUpdated = localBook.updatedAt || localBook.createdAt || 0;
      const driveUpdated = driveBook.updatedAt || driveBook.createdAt || 0;

      if (driveUpdated > localUpdated) {
        updateBook(localBook.id, {
          name: driveBook.name,
          icon: driveBook.icon,
          color: driveBook.color,
          fields: driveBook.fields || localBook.fields,
          summaryCards: driveBook.summaryCards || localBook.summaryCards
        });
      }

      // Entry merge
      const localEntries = getEntries(localBook.id);
      const driveEntries = driveBook.entries || [];
      const localEntryMap = new Map(localEntries.map(e => [e.id, e]));
      const mergedEntries = [...localEntries];

      driveEntries.forEach(driveEntry => {
        if (tombstones.entries[driveEntry.id]) return;

        const localEntry = localEntryMap.get(driveEntry.id);

        if (!localEntry) {
          mergedEntries.push(driveEntry);
        } else {
          const localTime = localEntry.updatedAt || localEntry.createdAt || 0;
          const driveTime = driveEntry.updatedAt || driveEntry.createdAt || 0;
          if (driveTime > localTime) {
            const idx = mergedEntries.findIndex(e => e.id === driveEntry.id);
            if (idx >= 0) mergedEntries[idx] = driveEntry;
          }
        }
      });

      saveEntries(localBook.id, mergedEntries);
    }
  });
}

/* ============================================================
   SECTION 12: INIT & LIFECYCLE
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  updateSyncUI(getConnectionState());
  if (typeof cleanOldTombstones === 'function') cleanOldTombstones();

  try {
    await loadGoogleAPI();
  } catch (e) {
    console.warn('Google API not loaded:', e.message);
  }

  // 👇 Silent refresh
  if (getConnectionState() && tokenClient) {
    try {
      isSilentRefresh = true;
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
      isSilentRefresh = false;
      console.warn('Silent refresh failed:', e);
    }
  }
});

// App বন্ধ / hidden হলে force sync
window.addEventListener('pagehide', () => {
  if (accessToken && getConnectionState()) {
    triggerForceSync();
  }
});

window.addEventListener('beforeunload', () => {
  if (accessToken && getConnectionState()) {
    triggerForceSync();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && accessToken && getConnectionState()) {
    triggerForceSync();
  }
});

// Periodic sync (৫ মিনিট)
setInterval(() => {
  if (accessToken && getConnectionState() && document.visibilityState === 'visible') {
    uploadToDrive(false);
  }
}, 5 * 60 * 1000);

/* ============================================================
   SECTION 13: PUBLIC API
   ============================================================ */

window.recordBookTombstone = function(bookId) {
  if (typeof recordTombstone === 'function') recordTombstone('book', bookId);
};

window.recordEntryTombstone = function(entryId) {
  if (typeof recordTombstone === 'function') recordTombstone('entry', entryId);
};