/* ============================================================
   আমার খাতা — Service Worker (Fixed)
   - রিসাইকেল বিন, drive-sync সহ সব ফাইল ক্যাশ
   - নেটওয়ার্ক-ফার্স্ট HTML/JS এর জন্য
   - ভার্সন বাম্পিং
   ============================================================ */

const CACHE_VERSION = 'v1.0.1';
const CACHE_NAME = 'likhipata-' + CACHE_VERSION;

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './builder.html',
  './view.html',
  './about.html',
'./feedback.html',
'./changelog.html',
'./credits.html',
'./recycle-bin.html',
  './css/common.css',
  './css/dashboard.css',
  './css/builder.css',
  './css/view.css',
  './js/common.js',
  './js/storage.js',
  './js/dashboard.js',
  './js/builder.js',
  './js/view.js',
'./js/formula-engine.js',
'./js/drive-sync.js',
'./js/ui.js',
  './manifest.json',
  './logo-192.png',
  './logo-512.png'
];

// এই এক্সটেনশনগুলো নেটওয়ার্ক-ফার্স্ট
const NETWORK_FIRST_EXT = /\.(?:html|js|json|css)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // প্রতিটি ফাইল আলাদাভাবে ক্যাশ করি (একটা ফেল হলে বাকিগুলো ক্যাশ হবে)
      return Promise.all(
        ASSETS_TO_CACHE.map(url =>
          cache.add(url).catch(err => console.warn('Cache failed:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names.map(n => n !== CACHE_NAME ? caches.delete(n) : null)
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // GET ছাড়া অন্য মেথড SW হ্যান্ডেল করবে না
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // এক্সটার্নাল API (Google Drive ইত্যাদি) SW হ্যান্ডেল করবে না
  if (url.origin !== self.location.origin) return;

  const isAsset = NETWORK_FIRST_EXT.test(url.pathname);

  if (isAsset) {
    // নেটওয়ার্ক-ফার্স্ট
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, resClone));
        }
        return res;
      }).catch(() => {
        return caches.match(req).then(cached => {
          if (cached) return cached;
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
    );
  } else {
    // ক্যাশ-ফার্স্ট (ছবি ইত্যাদি)
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, resClone));
          }
          return res;
        }).catch(() => {
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
      })
    );
  }
});
