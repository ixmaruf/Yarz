/* ============================================================
   YARZ — Service Worker v3.9 (2026-05-02)
   ✅ Aggressive cache for static assets (instant 2nd-load)
   ✅ Stale-while-revalidate for API responses
   ✅ Cache-first for images (high-quality, never re-download)
   ✅ Network-first for HTML (always get latest content)
   ============================================================ */

const CACHE_VERSION = 'yarz-v3.9.0';
const STATIC_CACHE  = CACHE_VERSION + '-static';
const IMAGE_CACHE   = CACHE_VERSION + '-images';
const API_CACHE     = CACHE_VERSION + '-api';

// Pre-cache critical assets on install
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/api.js',
  './js/app.js',
  './js/pages-common.js'
];

// ───── INSTALL: pre-cache critical files ─────
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(function (cache) { return cache.addAll(PRECACHE_URLS); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { /* fail silently */ })
  );
});

// ───── ACTIVATE: cleanup old caches ─────
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf(CACHE_VERSION) !== 0) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// ───── FETCH STRATEGIES ─────
self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Skip Apps Script API calls (they have their own cache layer)
  if (url.hostname.indexOf('script.google.com') !== -1) {
    event.respondWith(networkFirst(req, API_CACHE, 5000));
    return;
  }

  // Images → cache-first (never re-download once cached, full quality preserved)
  if (req.destination === 'image' ||
      /\.(jpe?g|png|webp|avif|gif|svg|bmp)(\?.*)?$/i.test(url.pathname) ||
      url.hostname.indexOf('lh3.googleusercontent.com') !== -1 ||
      url.hostname.indexOf('i.ibb.co') !== -1 ||
      url.hostname.indexOf('i.imgur.com') !== -1 ||
      url.hostname.indexOf('postimg.cc') !== -1) {
    event.respondWith(cacheFirst(req, IMAGE_CACHE));
    return;
  }

  // Fonts & CDN → cache-first
  if (url.hostname.indexOf('fonts.googleapis.com') !== -1 ||
      url.hostname.indexOf('fonts.gstatic.com') !== -1 ||
      url.hostname.indexOf('cdn.jsdelivr.net') !== -1) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // CSS / JS → stale-while-revalidate (instant + fresh)
  if (req.destination === 'style' || req.destination === 'script') {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }

  // HTML pages → network-first (always latest, fallback cache when offline)
  if (req.destination === 'document' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(req, STATIC_CACHE, 3000));
    return;
  }

  // Default → stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
});

// ───── STRATEGIES ─────
function cacheFirst(req, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (res) {
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }).catch(function () { return cached; });
    });
  });
}

function networkFirst(req, cacheName, timeoutMs) {
  return new Promise(function (resolve) {
    const timer = setTimeout(function () {
      caches.match(req).then(function (cached) { if (cached) resolve(cached); });
    }, timeoutMs || 4000);

    fetch(req).then(function (res) {
      clearTimeout(timer);
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(cacheName).then(function (c) { c.put(req, clone); });
      }
      resolve(res);
    }).catch(function () {
      clearTimeout(timer);
      caches.match(req).then(function (cached) {
        resolve(cached || new Response('Offline', { status: 503 }));
      });
    });
  });
}

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(req).then(function (cached) {
      const fetchPromise = fetch(req).then(function (res) {
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      }).catch(function () { return cached; });
      return cached || fetchPromise;
    });
  });
}
