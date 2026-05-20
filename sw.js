/* ════════════════════════════════════════════════════════════════════
   YARZ TURBO Service Worker v2.0
   ════════════════════════════════════════════════════════════════════
   Strategy matrix:
     • HTML pages              → Network-first, fallback cache (10s timeout)
     • CSS / JS / Fonts        → Stale-While-Revalidate (instant + update)
     • Images (product/banner) → Cache-First (1 year TTL)
     • Google Apps Script API  → Network-first with 6s timeout, fallback cache
     • Static assets / icons   → Cache-First

   Goals:
     1) Second visit: HTML + CSS + JS served from cache → <500ms paint
     2) API responses cached as a safety net (offline-friendly)
     3) Product images NEVER re-downloaded once cached
   ════════════════════════════════════════════════════════════════════ */

const VERSION       = 'yarz-turbo-v2.0.8';
const STATIC_CACHE  = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const IMAGE_CACHE   = `${VERSION}-images`;
const API_CACHE     = `${VERSION}-api`;

// Critical assets to pre-cache on install
const PRECACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/boot.js',
  '/js/turbo-core.js',
  '/js/image-turbo.js',
  '/js/api.js',
  '/js/api-turbo.js',
  '/js/app.js',
  '/js/pages-common.js',
  '/js/armor.js',
  '/js/shield.js',
  '/js/pixel.js',
  '/js/turbo.js',
  '/manifest.webmanifest',
  '/404.html'
];

// ──────────────────────────────────────────────────────────────────
// INSTALL — pre-cache critical shell
// ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      // Use Request objects with cache:'reload' to bypass HTTP cache during install
      return Promise.allSettled(
        PRECACHE.map(url =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ──────────────────────────────────────────────────────────────────
// ACTIVATE — purge old versions
// ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map(k => k.startsWith('yarz-') && !k.startsWith(VERSION) ? caches.delete(k) : null)
    )).then(() => self.clients.claim())
  );
});

// ──────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────
function isImage(req) {
  if (req.destination === 'image') return true;
  const url = req.url.toLowerCase();
  return /\.(png|jpg|jpeg|webp|gif|svg|avif|ico)(\?|$)/.test(url) ||
         url.includes('lh3.googleusercontent.com') ||
         url.includes('drive.google.com') ||
         url.includes('i.ibb.co') ||
         url.includes('googleusercontent.com');
}

function isAPI(req) {
  return req.url.includes('script.google.com') ||
         req.url.includes('/exec') ||
         req.url.includes('/macros/s/') ||
         req.url.includes('workers.dev');
}

function isStaticAsset(req) {
  const d = req.destination;
  return d === 'style' || d === 'script' || d === 'font' || d === 'manifest';
}

function isHTML(req) {
  return req.mode === 'navigate' ||
         (req.headers.get('accept') || '').includes('text/html');
}

// Fetch with timeout
function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then(r => { clearTimeout(t); resolve(r); })
              .catch(err => { clearTimeout(t); reject(err); });
  });
}

// ──────────────────────────────────────────────────────────────────
// STRATEGIES
// ──────────────────────────────────────────────────────────────────

// Cache-First (for images & static immutable assets)
// v10.7: Don't background-refresh on every hit — only refresh when cache miss
async function cacheFirst(req, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached; // ✅ instant return, no background refetch
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone()).catch(()=>{});
    return res;
  } catch (e) {
    return cached || new Response('', { status: 504 });
  }
}

// Stale-While-Revalidate (for CSS/JS — instant + background update)
async function staleWhileRevalidate(req, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone()).catch(()=>{});
    return res;
  }).catch(() => cached);
  return cached || network;
}

// Network-First with fast timeout (for HTML & API)
async function networkFirst(req, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetchWithTimeout(req.clone(), timeoutMs);
    if (res && res.ok && req.method === 'GET') {
      cache.put(req, res.clone()).catch(()=>{});
    }
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // Final fallback for HTML navigation
    if (isHTML(req)) {
      const fallback = await caches.match('/index.html') || await caches.match('/404.html');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503 });
  }
}

// ──────────────────────────────────────────────────────────────────
// MAIN FETCH HANDLER
// ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== 'GET') return;

  // Skip chrome-extension etc.
  if (!req.url.startsWith('http')) return;

  // Skip Google Fonts CSS (let browser handle — they have own caching)
  if (req.url.includes('fonts.googleapis.com/css')) return;

  // Google Fonts files — cache aggressively
  if (req.url.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Images
  if (isImage(req)) {
    event.respondWith(cacheFirst(req, IMAGE_CACHE));
    return;
  }

  // Google Apps Script API
  if (isAPI(req)) {
    event.respondWith(networkFirst(req, API_CACHE, 6000));
    return;
  }

  // Static assets (CSS, JS) — version-tagged URLs, safe to cache forever
  if (isStaticAsset(req)) {
    // Different URL = different cache entry, so cache-first is safe and fastest
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // HTML pages — network first with 3s timeout, fall back to cache
  if (isHTML(req)) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE, 3000));
    return;
  }

  // Everything else — SWR
  event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
});

// ──────────────────────────────────────────────────────────────────
// MESSAGE handler — allow page to force-refresh cache
// ──────────────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'SKIP_WAITING') self.skipWaiting();
  if (msg.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
  if (msg.type === 'CLEAR_API_CACHE') {
    caches.delete(API_CACHE);
  }
});
