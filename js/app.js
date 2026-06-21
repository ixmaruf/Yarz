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
      } catch (e) {}
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
