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

const VERSION       = 'yarz-turbo-v15.49-2025-05-26';
const STATIC_CACHE  = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const IMAGE_CACHE   = `${VERSION}-images`;
const API_CACHE     = `${VERSION}-api`;

// Critical assets to pre-cache on install
// v13.0: pixel.js, armor.js, shield.js are now lazy-loaded post-LCP, so they're
// fetched on-demand by the page (still cached via fetch handler).
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
        PRECACHE.map(url => {
          const cacheBustUrl = url.includes('?') ? url + '&_v=' + VERSION : url + '?_v=' + VERSION;
          return cache.add(new Request(cacheBustUrl, { cache: 'reload' })).catch(() => null);
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// ──────────────────────────────────────────────────────────────────
// ACTIVATE — purge old versions
// ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Purge old version caches
      caches.keys().then((keys) => Promise.all(
        keys.map(k => k.startsWith('yarz-') && !k.startsWith(VERSION) ? caches.delete(k) : null)
      )),
      // ✅ v15.33 PERF: Enable navigationPreload — when SW handles a navigation,
      // browser starts the network fetch in PARALLEL with SW startup time.
      // Saves 50-150ms on returning customers (typical SW startup is 50-200ms).
      // Compatible with Chrome/Edge/Firefox/Samsung Internet — Safari ignores.
      self.registration.navigationPreload && self.registration.navigationPreload.enable().catch(() => {})
    ]).then(() => self.clients.claim())
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
  // ✅ v15.37: After custom-domain migration, API calls go to same-origin
  // (yarzclothing.xyz/?action=...) instead of workers.dev. The SW must NOT
  // cache those — Worker already handles edge caching with admin purge,
  // and SW caching here would re-introduce the "stale data after publish"
  // bug we already fixed at the Worker layer.
  try {
    const u = new URL(req.url);
    if (u.origin === self.location.origin) {
      // Any same-origin request with ?action= is an API call → bypass SW
      if (u.searchParams.has('action')) return true;
      // Worker control endpoints (analytics, health, purge) → bypass SW
      if (u.pathname.startsWith('/__')) return true;
    }
  } catch (e) {}
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
    // ⚡ Force browser to bypass HTTP cache for HTML/API to prevent the "2 day old data" issue
    const fetchReq = new Request(req, { cache: 'no-cache' });
    const res = await fetchWithTimeout(fetchReq, timeoutMs);
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

  // Images - Bypassed per user request to avoid stale data
  if (isImage(req)) {
    return;
  }

  // Google Apps Script API - Bypassed for real-time FB ads data
  if (isAPI(req)) {
    return;
  }

  // Static assets (CSS, JS) — version-tagged URLs, safe to cache forever
  if (isStaticAsset(req)) {
    // Different URL = different cache entry, so cache-first is safe and fastest
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // HTML pages — Network Only for real-time Cloudflare SSR data
  // Bypassed local caching completely to prevent customers from seeing stale products
  if (isHTML(req)) {
    event.respondWith((async () => {
      try {
        // ✅ v15.33 PERF: Use navigationPreload response if available.
        // This is the parallel network request the browser fired while
        // the SW was starting up — saves 50-150ms vs `fetch()`.
        const preloadResponse = event.preloadResponse ? await event.preloadResponse : null;
        if (preloadResponse) return preloadResponse;
        // Fallback: regular fetch with cache:'no-cache' to force revalidation
        return await fetch(new Request(req, { cache: 'no-cache' }));
      } catch (e) {
        // Only if completely offline (no internet), show the offline page
        return (await caches.match('/404.html')) || new Response('Offline', { status: 503 });
      }
    })());
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
