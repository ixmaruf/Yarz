/* ============================================================
   YARZ — Main Application v3.1 (2026-05-03)
   State Management, Cart, User, UI Components, Navigation
   Global Control Sync: Maintenance Mode, Announcement
   Payment Info: bKash, Nagad, COD

   ✅ v3.1 changes (CRITICAL — fixes order total bugs):
     • submitOrder() now sends explicit `total` and `coupon` fields
       to the Apps Script so the sheet stores correct values even
       when the server-side recalculation fails.
     • showOrderSuccess() now uses defensive total calculation —
       falls back to client-computed total (`_clientTotal`) and
       to `localStorage.yarz_my_orders` when the server response
       is opaque/CORS-blocked. Fixes the "সর্বমোট ৳0" bug.
     • catch() fallback total now applies coupon discount correctly.
   ============================================================ */

const YARZ = (() => {
  // Dev-mode guard — set `__YARZ_DEV__ = true` in console for verbose logging.
  // Production deployments keep this false so internal implementation details
  // (stock fetch outcomes, SWR lifecycle, promise rejections) don't clutter
  // browser consoles in front of customers.
  var __YARZ_DEV__ = false;
  function _log() {
    if (!__YARZ_DEV__) return;
    try { Function.prototype.apply.call(console.log, console, arguments); } catch(e) {}
  }
  function _warn() {
    if (!__YARZ_DEV__) return;
    try { Function.prototype.apply.call(console.warn, console, arguments); } catch(e) {}
  }

  // ✅ v17.5 PHASE 8: Global error handlers. Without these, a silent
  // exception in a Promise / async callback just disappears — the
  // customer sees a broken button and the owner has no idea why. These
  // log to console (which the anti-debug scripts in armor.js neutralise
  // for the customer) and keep a small in-memory ring buffer that can
  // be inspected via `YARZ._getRecentErrors()` for triage.
  if (typeof window !== 'undefined') {
    window.__yarzErrBuf = [];
    window.addEventListener('error', function(e) {
      try {
        var entry = {
          ts: Date.now(),
          msg: (e && e.message) || 'unknown',
          src: (e && e.filename) || '',
          line: (e && e.lineno) || 0,
          col: (e && e.colno) || 0,
          stack: (e && e.error && e.error.stack) || ''
        };
        window.__yarzErrBuf.push(entry);
        if (window.__yarzErrBuf.length > 50) window.__yarzErrBuf.shift();
        if (window.console && console.error) console.error('[YARZ error]', entry);
      } catch (_) { /* never let the handler itself throw */ }
    });
    window.addEventListener('unhandledrejection', function(e) {
      try {
        var reason = (e && e.reason) || {};
        var entry = {
          ts: Date.now(),
          msg: (reason && reason.message) || String(reason),
          stack: (reason && reason.stack) || '',
          unhandled: true
        };
        window.__yarzErrBuf.push(entry);
        if (window.__yarzErrBuf.length > 50) window.__yarzErrBuf.shift();
        if (window.console && console.error) console.error('[YARZ unhandledrejection]', entry);
      } catch (_) { /* same */ }
    });
  }

  // ✅ v17.5 PHASE 9: Focus trap helper. Installed on the checkout
  // modal by openCheckout(). Returns a teardown function that removes
  // the keydown listener. WCAG 2.1.1 (Keyboard) — without it, a Tab
  // on the last focusable element jumps to a button in the page
  // behind the overlay, which is confusing for keyboard / screen-
  // reader users. Also handles Esc-to-close.
  var _checkoutModalTeardown = null;
  function _trapFocusInModal_(modalEl) {
    if (!modalEl) return function() {};
    var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    function getFocusable() {
      return Array.prototype.slice.call(modalEl.querySelectorAll(FOCUSABLE))
        .filter(function(el) {
          return el.offsetParent !== null || el === document.activeElement;
        });
    }
    function onKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        try { closeCheckout(); } catch (_) {}
        return;
      }
      if (e.key !== 'Tab') return;
      var focusable = getFocusable();
      if (focusable.length === 0) { e.preventDefault(); return; }
      var first = focusable[0];
      var last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    modalEl.addEventListener('keydown', onKeydown);
    // Focus the first input (or close button) on open. 50ms delay
    // lets the modal's CSS transition start so the focus indicator
    // is visible.
    setTimeout(function() {
      try {
        var focusable = getFocusable();
        if (focusable.length) {
          var firstInput = focusable.find(function(el) {
            return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
          });
          (firstInput || focusable[0]).focus();
        }
      } catch (_) {}
    }, 50);
    return function teardown() {
      modalEl.removeEventListener('keydown', onKeydown);
    };
  }

  // ===== STATE =====
  // ✅ v11.7: Safe localStorage reads — Safari iOS private mode can throw on script load
  function _safeReadLS(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  // ✅ v17.5: TTL-aware variant. The stored value is wrapped in {v: data, t: ts}
  // so we can return the fallback if the entry is older than `maxAgeMs`. Used
  // for PII keys (yarz_user, yarz_my_orders) — keeps the customer's name,
  // address, phone, order history on-device for 90 days, then auto-expires.
  function _safeReadLSWithTTL(key, fallback, maxAgeMs) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      var parsed = JSON.parse(raw);
      // Backward-compat: pre-v17.5 stored raw data (no envelope). Treat those
      // as fresh, but re-write them in the new envelope so next read works.
      if (parsed && typeof parsed === 'object' && 'v' in parsed && 't' in parsed) {
        if ((Date.now() - parsed.t) > maxAgeMs) {
          try { localStorage.removeItem(key); } catch (e) {}
          return fallback;
        }
        return parsed.v;
      }
      return parsed;
    } catch (e) { return fallback; }
  }
  function _safeWriteLSWithTTL(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify({ v: value, t: Date.now() }));
    } catch (e) {}
  }
  // ✅ v17.5 PHASE 6: Shape-validating reader. The plain _safeReadLS just
  // JSON.parses whatever's there — but a corrupt entry (truncated write,
  // a future migration that changes the shape, an old browser that wrote
  // a string instead of an array) would surface as a runtime crash at the
  // call site. This helper returns the fallback if the parsed value
  // doesn't match `validator` (a function returning boolean).
  function _safeReadLSValidate(key, fallback, validator) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      var parsed = JSON.parse(raw);
      if (validator && !validator(parsed)) return fallback;
      return parsed;
    } catch (e) { return fallback; }
  }
  // ✅ v17.5 PHASE 6: Cap a list at `max` entries, keeping the FIRST `max`.
  // Returns the original reference if already small enough (no-op).
  // Used by wishlist + pending_sync so heavy use on a phone with a tiny
  // localStorage quota doesn't crash the app.
  function _capList_(arr, max) {
    if (!Array.isArray(arr)) return [];
    if (arr.length <= max) return arr;
    return arr.slice(0, max);
  }
  // ✅ v17.5: Typed helpers for the PII keys so call sites stay short and the
  // TTL logic is in one place. 90 days per owner's spec (was 30 days in
  // v17.5; bumped to 90 days in v17.15 to keep the checkout form pre-filled
  // across the typical 30-day repurchase cycle of FB/IG-driven buyers).
  const _PII_TTL_MS = 90 * 86400 * 1000;
  function _getMyOrders() {
    return _safeReadLSWithTTL('yarz_my_orders', [], _PII_TTL_MS);
  }
  function _setMyOrders(arr) {
    _safeWriteLSWithTTL('yarz_my_orders', Array.isArray(arr) ? arr : []);
  }
  function _getSavedUser() {
    return _safeReadLSWithTTL('yarz_user', null, _PII_TTL_MS);
  }
  function _setSavedUser(u) {
    if (u) _safeWriteLSWithTTL('yarz_user', u);
    else { try { localStorage.removeItem('yarz_user'); } catch (e) {} }
  }
  // ✅ v17.15: "Forget me on this device" button removed per owner direction.
  // PII auto-expires after 90 days via the TTL envelope on yarz_user /
  // yarz_my_orders, which is enough for the typical FB/IG-driven return cycle
  // and avoids the customer accidentally clearing their cart mid-shop.
  const state = {
    products: [],
    categories: [],
    storeInfo: {},
    currentCategory: '',
    currentProduct: null,
    currentView: 'home', // home | product | tracking | profile | success
    currentSizeFilter: '',
    currentSort: 'default',
    cart: _safeReadLS('yarz_cart', []),
    // ✅ v17.5: PII keys auto-expire after 90 days so a shared / kiosk device
    // doesn't keep the previous user's name, address, phone, order history
    // forever. Owner-chosen TTL (bumped from 30 → 90 days in v17.15).
    user: _safeReadLSWithTTL('yarz_user', null, _PII_TTL_MS),
    loading: false,
    heroSlideIndex: 0,
    heroTimer: null,
  };
  // Lazily-initialised when the first order is saved.
  state.myOrders = [];

  // ===== SVG ICONS (No emoji, pure SVG) =====
  const ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h15v13H1z"/><path d="m16 8 4 0 3 4v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16.5 9.4-9-5.19"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  };

  // ===== UTILITY =====
  function formatPrice(n) {
    const num = parseFloat(n) || 0;
    var sym = (state.currencySymbol || '\u09F3');
    return sym + num.toLocaleString('en-IN');
  }

  // ✅ v17.5: Full 5-char HTML escape. The previous textContent→innerHTML trick
  // only escaped <, >, & in modern browsers — it left ' and " unescaped, which
  // is FINE inside element text but BREAKS OUT when the result is interpolated
  // into an HTML attribute like `onclick="YARZ.openProduct('...')"`. This
  // explicit replacer is safe for BOTH element text and attribute contexts.
  var _HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, function (c) { return _HTML_ESC[c]; });
  }
  // Alias for clarity in code — use this when interpolating into an attribute.
  var escAttr = escHtml;

  // ✅ v17.5: Defense-in-depth cleaner for product names that get interpolated
  // into inline `onclick="YARZ.openProduct('${name}')"` strings. escHtml is
  // enough for XSS, but a literal apostrophe in a product name (e.g. "O'Reilly")
  // survives the entity-decode round-trip and breaks the JS string. We strip /
  // replace ALL chars that could be ambiguous in either an HTML attribute or a
  // JS string literal. The name will display slightly differently (apostrophe →
  // hyphen) but the XSS surface AND the broken-attribute surface both close.
  function _cleanInlineName(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      // Replace HTML-attribute-breaking chars
      .replace(/[<>&"'`]/g, '-')
      // Replace JS-string-breaking chars
      .replace(/[\\\n\r\t\0\f\v\b]/g, '-')
      // Replace Unicode line/paragraph separators that some engines treat as \n
      .replace(/[\u2028\u2029]/g, ' ')
      // Collapse multiple dashes from the above replacements
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .trim();
  }

  // ✅ v17.5: Cryptographically-random hex suffix for things like order IDs
  // that the customer can quote in support flows. Math.random() is predictable
  // (V8 uses xorshift128+ — fast but seedable from the time); an attacker
  // who guesses a recent order ID could impersonate that customer to support.
  // crypto.getRandomValues is in every browser since 2014 and IE11 polyfilled.
  function _randHex(len) {
    var n = Math.max(1, Math.min(64, len | 0 || 4));
    var bytes = new Uint8Array(Math.ceil(n / 2));
    try { crypto.getRandomValues(bytes); } catch (e) { /* SSR / old browser — fall back */ for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); }
    var s = '';
    for (var j = 0; j < bytes.length; j++) s += (bytes[j] < 16 ? '0' : '') + bytes[j].toString(16);
    return s.slice(0, n).toUpperCase();
  }

  // ✅ v17.5: URL-context sanitizer. `escHtml` alone is NOT enough for href / src
  // because `javascript:alert(1)` and `data:text/html,<script>...` would survive
  // HTML-entity escaping and still execute. Only allow safe schemes.
  function safeUrl(url) {
    if (!url) return '';
    var s = String(url).trim();
    if (!s) return '';
    if (/^[\s\x00-\x1f]*(javascript|vbscript|data):/i.test(s)) return '#';
    // Allow same-origin / data: for image, blob: for in-memory, https/http for normal URLs
    if (/^(https?:|data:image\/|blob:|\/\/|\/)/i.test(s)) return escHtml(s);
    // Anything else (javascript:, vbscript:, data:text/html, file:, …) is rejected.
    return '';
  }

  // ===== ICON LIBRARY — v14.8 =====
  // Tiny inline SVG icons for premium UI accents (replacing emojis).
  // Each icon ≈150-300 bytes. stroke="currentColor" → tints to text color.
  // Using a shared template + path-only data keeps the bundle ultra-light.
  // No external requests, no extra parsing, no animation = zero perf cost
  // even on budget Android phones (this was the user's main concern).
  var _ICON_PATHS = {
    // Order status — outline-only paths, 24x24 viewBox
    check:   '<path d="M20 6L9 17l-5-5"/>',
    cog:     '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    box:     '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    truck:   '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    pkgIn:   '<path d="M16 16h6v-2"/><path d="M22 12V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0L16 19"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    rotate:  '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    xCircle: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    // Other
    shipBar: '<path d="M16 3h5v5"/><path d="M21 3l-9 9"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
    spark:   '<path d="M12 2L9 9l-7 1 5 5-1 7 6-3 6 3-1-7 5-5-7-1z"/>',
    heart:   '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>'
  };
  // Build a complete <svg> element. Inline so it works even before stylesheets.
  function _icon(name, size) {
    var p = _ICON_PATHS[name];
    if (!p) return '';
    var s = size || 12;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;vertical-align:middle;display:inline-block;" aria-hidden="true">' + p + '</svg>';
  }


  // ===== IMAGE URL PROCESSOR v13.0 — Responsive sizing =====
  // ✅ Returns CDN URL with the requested size (default 1600px for hero/banner).
  //    Pass size=800 for product cards, size=400 for thumbnails, etc. — drastically
  //    reduces mobile data usage. WebP via -rw suffix, ~50% smaller than JPEG.
  function getImgSrc(url, size) {
    if (!url) return '';
    url = String(url).trim();
    if (!url) return '';
    size = parseInt(size, 10) || 1600;

    // Auto-prepend https:// if missing
    if (!url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('//')) {
      url = 'https://' + url;
    }

    // ── Direct image link (any common extension) → return as-is, FULL quality ──
    if (/\.(jpe?g|png|webp|avif|gif|bmp|svg)(\?.*)?$/i.test(url)) {
      return url;
    }

    // ── Google Drive → SIZED CDN URL (per-call optimal size) ──
    if (url.indexOf('drive.google.com') !== -1) {
      var m = url.match(/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
      // ✅ v17.7: Google deprecated lh3.googleusercontent.com/d/ for 3rd party hosting.
      // Use the standard uc endpoint instead.
      if (m) return 'https://drive.google.com/uc?export=view&id=' + m[1];
    }
    // Already a lh3.googleusercontent.com URL — replace size param if present
    if (url.indexOf('lh3.googleusercontent.com') !== -1) {
      // Strip any existing =s..., =w..., =h... and append our requested size
      url = url.replace(/=[swh]\d+(-[a-z0-9]+)*/i, '');
      var parts = url.split(/(\?|#)/);
      parts[0] = parts[0] + '=s' + size + '-rw';
      return parts.join('');
    }



    // ── ibb.co SHARE page (no extension) → direct i.ibb.co image ──
    // We can only guess the extension; webp users should paste the i.ibb.co
    // direct link instead. Falls back to .jpg which works for most uploads.
    var ibbMatch = url.match(/^https?:\/\/(?:www\.)?ibb\.co\/([a-zA-Z0-9]+)\/?$/i);
    if (ibbMatch) {
      return 'https://i.ibb.co/' + ibbMatch[1] + '/' + ibbMatch[1] + '.jpg';
    }

    // ── postimg.cc share page → direct image ──
    var postimgMatch = url.match(/^https?:\/\/postimg\.cc\/([a-zA-Z0-9]+)\/?$/i);
    if (postimgMatch) {
      return 'https://i.postimg.cc/' + postimgMatch[1] + '/image.jpg';
    }

    // ── imgur share page → direct image ──
    var imgurMatch = url.match(/^https?:\/\/(?:www\.)?imgur\.com\/([a-zA-Z0-9]+)\/?$/i);
    if (imgurMatch) {
      return 'https://i.imgur.com/' + imgurMatch[1] + '.jpg';
    }

    // ── Unknown URL → return untouched (let the browser try) ──
    return url;
  }

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  // ===== DYNAMIC DELIVERY LOCATIONS =====
  // Values are controlled from Admin Panel → Cart & Checkout and stored in the
  // Google Sheet DELIVERY_CHARGES tab. Fallback preserves the old Dhaka/Outside flow.
  function _truthyActive(v) {
    if (v === undefined || v === null || v === '') return true;
    var s = String(v).toLowerCase().trim();
    return !(s === 'false' || s === 'no' || s === '0' || s === 'off' || s === 'inactive');
  }

  function getDeliveryLocations() {
    var info = state.storeInfo || {};
    var locations = [];
    if (Array.isArray(info.deliveryLocations)) {
      locations = info.deliveryLocations;
    } else if (info.delivery_locations) {
      try { locations = JSON.parse(String(info.delivery_locations)); } catch (e) { locations = []; }
    }

    locations = (locations || []).map(function (loc, idx) {
      return {
        id: String(loc.id || loc.key || ('zone_' + (idx + 1))).trim(),
        name: String(loc.name || loc.location || '').trim(),
        charge: parseFloat(loc.charge || loc.fee || loc.deliveryCharge || 0) || 0,
        active: _truthyActive(loc.active)
      };
    }).filter(function (loc) { return loc.name && loc.active; });

    if (!locations.length) {
      // ✅ v3.8: Default zones → Narayanganj (Inside ৳70 / Outside ৳140)
      var z1Name = info.zone1Name || info.zone_1_name || 'Inside Narayanganj';
      var z2Name = info.zone2Name || info.zone_2_name || 'Outside Narayanganj';
      var z1Charge = parseFloat(info.zone1Charge || info.zone_1_charge || 70) || 70;
      var z2Charge = parseFloat(info.zone2Charge || info.zone_2_charge || 140) || 140;
      locations = [
        { id: 'inside_narayanganj',  name: z1Name, charge: z1Charge, active: true },
        { id: 'outside_narayanganj', name: z2Name, charge: z2Charge, active: true }
      ];
    }
    return locations;
  }

  function getDeliveryLocationById(id) {
    var locations = getDeliveryLocations();
    var wanted = String(id || '').trim();
    return locations.find(function (loc) { return String(loc.id) === wanted; }) || locations[0];
  }

  function getDeliveryCharge(locationId) {
    var loc = getDeliveryLocationById(locationId);
    return loc ? (parseFloat(loc.charge) || 0) : 0;
  }

  function calculateCartDeliveryCharge(locationId) {
    if (state.cart.length === 0) {
      // ✅ v15.42: Clear stale free-ship info on empty-cart early exit.
      // Without this, a previously-applied state could leak to any code
      // that reads state._lastFreeShipInfo without first calling this
      // function (defensive — currently no such reader exists).
      state._lastFreeShipInfo = { applied: false, threshold: 0, savings: 0, subtotal: 0 };
      return 0;
    }
    var locs = getDeliveryLocations();
    var locIndex = locs.findIndex(function(l) { return String(l.id) === String(locationId); });
    var defaultCharge = getDeliveryCharge(locationId);
    
    var baseCharge = state.cart.reduce(function(max, item) {
      var c = defaultCharge;
      if (locIndex === 0 && item.deliveryDhaka !== undefined && item.deliveryDhaka !== '') c = parseFloat(item.deliveryDhaka);
      else if (locIndex === 1 && item.deliveryOutside !== undefined && item.deliveryOutside !== '') c = parseFloat(item.deliveryOutside);
      return Math.max(max, c);
    }, 0);

    var totalQty = state.cart.reduce(function(sum, item) { return sum + item.qty; }, 0);
    var extraCharge = totalQty > 1 ? (totalQty - 1) * 5 : 0;
    var deliveryCharge = baseCharge + extraCharge;

    var subtotal = state.cart.reduce(function (sum, item) {
      return sum + (item.price * item.qty);
    }, 0);

    var freeShipAmt = 0;
    if (state.storeInfo) {
      // ✅ v15.42: Strip commas/spaces before parsing. Bangladeshi admins
      // commonly type "5,000" in spreadsheet cells; parseFloat("5,000") = 5
      // which would silently make EVERY order qualify for free shipping.
      var _fsRaw = String(state.storeInfo.freeShipAmt || state.storeInfo.free_ship_amt || '').replace(/[,\s]/g, '');
      freeShipAmt = parseFloat(_fsRaw) || 0;
    }
    // ✅ v15.41 FREE-SHIP MILESTONE: Track whether the cart unlocked free
    // delivery so the cart drawer / checkout summary / confirm modal can
    // show the celebratory "FREE" badge and the order payload can carry
    // the marker through to GAS / Telegram / admin Orders sheet.
    var originalCharge = deliveryCharge;
    var freeShipApplied = false;
    if (freeShipAmt > 0 && subtotal >= freeShipAmt) {
      deliveryCharge = 0;
      freeShipApplied = true;
    }
    state._lastFreeShipInfo = {
      applied:   freeShipApplied,
      threshold: freeShipAmt,
      savings:   freeShipApplied ? originalCharge : 0,
      subtotal:  subtotal
    };

    // ✅ v16.8 FREE-SHIP ADVANCE (owner's policy, simplified):
    // When the cart unlocks free shipping (subtotal >= threshold), delivery is
    // FREE but we collect a small ৳10