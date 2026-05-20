/* ════════════════════════════════════════════════════════════════════
   YARZ BOOT v1.0 — Critical-Path Loader
   ════════════════════════════════════════════════════════════════════
   This is the FIRST JS to run. It:
     1) Registers Service Worker IMMEDIATELY
     2) Reads cached products/categories/banners from IndexedDB
     3) Renders a SKELETON UI right away (perceived speed: <300ms)
     4) Hydrates UI from cache the moment data is available
     5) Triggers prefetch of GAS API in parallel

   Must be loaded as a regular <script> at top of <body> (not deferred).
   ════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const T0 = performance.now();
  window.__YARZ_BOOT_T0 = T0;

  // ─── 1. REGISTER SERVICE WORKER (non-blocking) ─────────────────
  // ✅ v10.8: Universal compatibility
  //   - Skip in-app browsers (FB/IG/Telegram) — they often have buggy SW support
  //   - Use idle callback so SW registration never blocks first paint
  //   - Auto-update + auto-reload when new version detected
  if ('serviceWorker' in navigator) {
    var ua = (navigator.userAgent || '');
    var isInAppBrowser = /FBAN|FBAV|FBIOS|FB_IAB|Instagram|MessengerLite|Twitter|TelegramBot/i.test(ua);
    // In-app browsers: don't register SW (too many compatibility issues)
    // Everything else (Chrome, Edge, Firefox, Safari, Brave, Samsung Internet): full SW support
    if (!isInAppBrowser) {
      var registerSW = function() {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .then(function(reg) {
            try { reg.update(); } catch(e) {}
            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            reg.addEventListener('updatefound', function() {
              var nw = reg.installing;
              if (!nw) return;
              nw.addEventListener('statechange', function() {
                if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                  nw.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            });
            var _refreshed = false;
            navigator.serviceWorker.addEventListener('controllerchange', function() {
              if (_refreshed) return;
              _refreshed = true;
              setTimeout(function() { window.location.reload(); }, 50);
            });
          })
          .catch(function(err) { console.warn('[BOOT] SW register failed:', err); });
      };
      // Use requestIdleCallback if available (Chrome/Edge/Firefox), else setTimeout
      if ('requestIdleCallback' in window) {
        window.addEventListener('load', function() {
          requestIdleCallback(registerSW, { timeout: 2000 });
        });
      } else {
        window.addEventListener('load', function() {
          setTimeout(registerSW, 1000);
        });
      }
    }
  }

  // ─── 2. EARLY READ from IndexedDB (parallel to script loading) ──
  const DB_NAME = 'yarz_turbo';
  const STORE   = 'cache';

  function readCached(key) {
    return new Promise((resolve) => {
      if (!window.indexedDB) return resolve(null);
      try {
        const req = indexedDB.open(DB_NAME, 2);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
          if (!db.objectStoreNames.contains('meta'))  db.createObjectStore('meta',  { keyPath: 'key' });
        };
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) return resolve(null);
          const tx  = db.transaction(STORE, 'readonly');
          const gr  = tx.objectStore(STORE).get(key);
          gr.onsuccess = () => resolve(gr.result || null);
          gr.onerror   = () => resolve(null);
        };
        req.onerror = () => resolve(null);
        setTimeout(() => resolve(null), 800); // safety timeout
      } catch (e) { resolve(null); }
    });
  }

  // Expose for app to consume
  window.__YARZ_CACHE_PRELOAD = {
    products:   readCached('products'),
    categories: readCached('categories'),
    banners:    readCached('banners'),
    settings:   readCached('site-settings'),
    featured:   readCached('featured')
  };

  // ─── 3. SKELETON RENDER (instant feedback) ──────────────────────
  function showSkeleton() {
    // Only inject if container exists and is empty
    const target = document.getElementById('main-content') ||
                   document.getElementById('app') ||
                   document.querySelector('main');
    if (!target || target.children.length > 0) return;
    target.innerHTML = `
      <div class="yarz-skeleton-wrap" aria-hidden="true">
        <div class="yarz-skel-banner"></div>
        <div class="yarz-skel-grid">
          ${'<div class="yarz-skel-card"><div class="yarz-skel-img"></div><div class="yarz-skel-line"></div><div class="yarz-skel-line short"></div></div>'.repeat(8)}
        </div>
      </div>
    `;
  }

  // Inject skeleton CSS once
  function injectSkeletonCSS() {
    if (document.getElementById('yarz-skel-css')) return;
    const s = document.createElement('style');
    s.id = 'yarz-skel-css';
    s.textContent = `
      .yarz-skeleton-wrap{padding:16px;max-width:1200px;margin:0 auto}
      .yarz-skel-banner{height:240px;border-radius:14px;margin-bottom:24px;background:linear-gradient(90deg,#f0ebf7 0%,#e6dff3 50%,#f0ebf7 100%);background-size:200% 100%;animation:yarzShimmer 1.4s linear infinite}
      .yarz-skel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
      .yarz-skel-card{background:#fff;border-radius:12px;padding:8px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
      .yarz-skel-img{aspect-ratio:1;border-radius:8px;background:linear-gradient(90deg,#f0ebf7 0%,#e6dff3 50%,#f0ebf7 100%);background-size:200% 100%;animation:yarzShimmer 1.4s linear infinite}
      .yarz-skel-line{height:12px;margin-top:10px;border-radius:6px;background:linear-gradient(90deg,#f0ebf7 0%,#e6dff3 50%,#f0ebf7 100%);background-size:200% 100%;animation:yarzShimmer 1.4s linear infinite}
      .yarz-skel-line.short{width:60%;height:10px}
      @keyframes yarzShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
      @media(max-width:480px){
        .yarz-skel-banner{height:180px}
        .yarz-skel-grid{grid-template-columns:repeat(2,1fr);gap:10px}
      }
    `;
    document.head.appendChild(s);
  }

  // Run skeleton injection ASAP
  injectSkeletonCSS();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showSkeleton, { once: true });
  } else {
    showSkeleton();
  }

  // ─── 4. Performance reporting ───────────────────────────────────
  window.addEventListener('load', () => {
    setTimeout(() => {
      const T = performance.now() - T0;
      const nav = performance.getEntriesByType('navigation')[0];
      console.log(
        `%c[BOOT] ⚡ Total: ${T.toFixed(0)}ms | DCL: ${nav ? nav.domContentLoadedEventEnd.toFixed(0) : '?'}ms | Load: ${nav ? nav.loadEventEnd.toFixed(0) : '?'}ms`,
        'color:#634A8E;font-weight:bold;font-size:13px'
      );
    }, 100);
  });

})();
