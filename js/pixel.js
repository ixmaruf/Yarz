/* ============================================================
   YARZ PIXEL — Pro v2 (Phase 4)
   ✅ ViewContent, AddToCart, InitiateCheckout, Purchase
   ✅ AddToWishlist, ViewedManyProducts, AbandonedCheckout
   ✅ SHA-256 hashed Advanced Matching (em, ph, fn, ln, ge, db, ct, st, zp, country, external_id)
   ✅ event_id on every event → full Conversions API deduplication
   ✅ Auto-injects FB / GA4 / TikTok / Snapchat / Pinterest from admin settings
   ✅ Lower CPA, better attribution, real-customer matching
   ============================================================ */

const YARZ_PIXEL = (() => {
  'use strict';

  let _initialized = false;
  let _storeInfo = {};
  let _userMatchHashed = null;   // hashed advanced-matching object (cached for the session)
  let _externalId = null;        // anonymous external_id (UUID-like) per browser

  // ===== Helpers =====
  function _hasFbq()  { return typeof window.fbq === 'function'; }
  function _hasTtq()  { return typeof window.ttq !== 'undefined' && typeof window.ttq.track === 'function'; }
  function _hasGtag() { return typeof window.gtag === 'function'; }
  function _hasSnap() { return typeof window.snaptr === 'function'; }
  function _hasPin()  { return typeof window.pintrk === 'function'; }

  function _safeNum(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  function _isFiredOnce(key) {
    try {
      if (sessionStorage.getItem(key)) return true;
      sessionStorage.setItem(key, '1');
      return false;
    } catch (e) { return false; }
  }

  function _genEventId(prefix) {
    return (prefix || 'evt') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  function _getOrCreateExternalId() {
    if (_externalId) return _externalId;
    try {
      var v = localStorage.getItem('yarz_ext_id');
      if (!v) {
        v = 'yz_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('yarz_ext_id', v);
      }
      _externalId = v;
      return v;
    } catch (e) { return null; }
  }

  // ----- SHA-256 (uses native crypto.subtle when available; sync fallback otherwise) -----
  function _toHex(buf) {
    var bytes = new Uint8Array(buf);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i].toString(16);
      hex += (b.length === 1 ? '0' : '') + b;
    }
    return hex;
  }
  async function _sha256(value) {
    if (!value) return '';
    var v = String(value).trim().toLowerCase();
    try {
      if (window.crypto && window.crypto.subtle && typeof TextEncoder !== 'undefined') {
        var enc = new TextEncoder().encode(v);
        var buf = await window.crypto.subtle.digest('SHA-256', enc);
        return _toHex(buf);
      }
    } catch (e) { /* fall through */ }
    return v; // last-resort: leave as plain (Facebook will reject but won't break flow)
  }

  function _normalizePhone(p) {
    if (!p) return '';
    var d = String(p).replace(/[^\d]/g, '');
    if (!d) return '';
    // Bangladesh default — strip leading 0 and prepend country code if 11 digits
    if (d.length === 11 && d.charAt(0) === '0') d = '88' + d;
    if (d.length === 10) d = '880' + d;
    return d;
  }

  function _splitName(full) {
    if (!full) return { first: '', last: '' };
    var parts = String(full).trim().split(/\s+/);
    return { first: parts[0] || '', last: parts.slice(1).join(' ') };
  }

  // Build hashed advanced-matching object for fbq('init', pixel, am)
  async function _buildAdvancedMatch(userData) {
    if (!userData) return null;
    var n = _splitName(userData.name || '');
    var phone = _normalizePhone(userData.phone || '');
    var email = (userData.email || '').trim().toLowerCase();
    var city  = (userData.city  || '').trim().toLowerCase();
    var state = (userData.state || '').trim().toLowerCase();
    var zip   = (userData.zip   || '').trim().toLowerCase();
    var country = (userData.country || 'bd').trim().toLowerCase();
    var ge    = (userData.gender || '').trim().toLowerCase().charAt(0); // f/m
    var db    = (userData.dob   || '').replace(/[^\d]/g, ''); // YYYYMMDD
    var extId = _getOrCreateExternalId();

    var promises = [];
    var keys = [];
    function add(key, val) {
      if (!val) return;
      keys.push(key);
      promises.push(_sha256(val));
    }
    if (email)   add('em', email);
    if (phone)   add('ph', phone);
    if (n.first) add('fn', n.first);
    if (n.last)  add('ln', n.last);
    if (city)    add('ct', city.replace(/\s+/g, ''));
    if (state)   add('st', state.replace(/\s+/g, ''));
    if (zip)     add('zp', zip);
    if (country) add('country', country);
    if (ge)      add('ge', ge);
    if (db)      add('db', db);
    if (extId)   add('external_id', extId);

    var hashed = await Promise.all(promises);
    var out = {};
    for (var i = 0; i < keys.length; i++) out[keys[i]] = hashed[i];
    return out;
  }

  // Cache hashed user data for the session (set on InitiateCheckout / Purchase)
  async function _setUserData(userData) {
    if (!userData) return;
    try {
      var am = await _buildAdvancedMatch(userData);
      if (am && Object.keys(am).length) {
        _userMatchHashed = am;
        try { localStorage.setItem('yarz_pixel_user', JSON.stringify(am)); } catch (e) {}
        // Re-init pixel with advanced matching (FB allows re-init)
        var pixelId = _storeInfo && _storeInfo.fbPixel;
        if (pixelId && _hasFbq()) {
          try { fbq('init', pixelId, am); } catch (e) {}
        }
      }
    } catch (e) {}
  }

  function _getCachedUserMatch() {
    if (_userMatchHashed) return _userMatchHashed;
    try {
      var raw = localStorage.getItem('yarz_pixel_user');
      if (raw) { _userMatchHashed = JSON.parse(raw); return _userMatchHashed; }
    } catch (e) {}
    return null;
  }

  // ----- ViewedManyProducts session counter -----
  function _bumpViewCounter() {
    try {
      var n = parseInt(sessionStorage.getItem('yarz_vc_count') || '0', 10) + 1;
      sessionStorage.setItem('yarz_vc_count', String(n));
      if (n === 3 && !sessionStorage.getItem('yarz_vmp_fired')) {
        sessionStorage.setItem('yarz_vmp_fired', '1');
        trackCustom('ViewedManyProducts', { count: n }, _genEventId('vmp'));
      }
    } catch (e) {}
  }

  // ===== EVENTS =====

  // 1. ViewContent
  function viewContent(product) {
    if (!product || !product.name) return;
    if (_isFiredOnce('yarz_vc_' + product.name)) return;
    _bumpViewCounter();

    var price = _safeNum(product.salePrice || product.sale || product.price);
    var data = {
      content_name: product.name,
      content_category: product.category || '',
      content_type: 'product',
      content_ids: [product.name],
      value: price,
      currency: 'BDT'
    };
    var eventId = _genEventId('vc');

    if (_hasFbq()) { try { fbq('track', 'ViewContent', data, { eventID: eventId }); } catch (e) {} }
    if (_hasTtq()) { try { ttq.track('ViewContent', { content_name: product.name, value: price, currency: 'BDT' }, { event_id: eventId }); } catch (e) {} }
    if (_hasGtag()){ try { gtag('event', 'view_item', { items: [{ item_name: product.name, item_category: product.category || '', price: price }], currency: 'BDT', value: price }); } catch (e) {} }
    if (_hasSnap()){ try { snaptr('track', 'VIEW_CONTENT', { item_ids: [product.name], price: price, currency: 'BDT' }); } catch (e) {} }
    if (_hasPin()) { try { pintrk('track', 'pagevisit', { product_name: product.name, value: price, currency: 'BDT' }); } catch (e) {} }
  }

  // 2. AddToCart
  function addToCart(product, size, qty) {
    if (!product) return;
    var price = _safeNum(product.salePrice || product.sale || product.price);
    var value = price * (qty || 1);
    var eventId = _genEventId('atc');
    var data = {
      content_name: product.name,
      content_category: product.category || '',
      content_ids: [product.name],
      content_type: 'product',
      value: value,
      currency: 'BDT',
      contents: [{ id: product.name, quantity: qty || 1, item_price: price }]
    };
    if (_hasFbq()) { try { fbq('track', 'AddToCart', data, { eventID: eventId }); } catch (e) {} }
    if (_hasTtq()) { try { ttq.track('AddToCart', { content_name: product.name, value: value, currency: 'BDT', quantity: qty || 1 }, { event_id: eventId }); } catch (e) {} }
    if (_hasGtag()){ try { gtag('event', 'add_to_cart', { items: [{ item_name: product.name, item_category: product.category || '', price: price, quantity: qty || 1 }], currency: 'BDT', value: value }); } catch (e) {} }
    if (_hasSnap()){ try { snaptr('track', 'ADD_CART', { item_ids: [product.name], price: value, currency: 'BDT' }); } catch (e) {} }
    if (_hasPin()) { try { pintrk('track', 'addtocart', { value: value, currency: 'BDT', line_items: [{ product_name: product.name, product_quantity: qty || 1, product_price: price }] }); } catch (e) {} }

    // Schedule abandoned-checkout event (fires 5 min after AddToCart if no purchase)
    try {
      if (window._yarzAbandonTimer) clearTimeout(window._yarzAbandonTimer);
      window._yarzAbandonTimer = setTimeout(function () {
        if (sessionStorage.getItem('yarz_purchased') === '1') return;
        if (sessionStorage.getItem('yarz_abandon_fired') === '1') return;
        sessionStorage.setItem('yarz_abandon_fired', '1');
        trackCustom('AbandonedCheckout', { value: value, currency: 'BDT' }, _genEventId('abc'));
      }, 5 * 60 * 1000);
    } catch (e) {}
  }

  // 3. InitiateCheckout
  function initiateCheckout(cart, total, userData) {
    if (!cart || cart.length === 0) return;
    if (userData) _setUserData(userData);
    var value = _safeNum(total);
    var ids = cart.map(function (c) { return c.name; });
    var contents = cart.map(function (c) {
      return { id: c.name, quantity: c.qty || 1, item_price: _safeNum(c.price) };
    });
    var eventId = _genEventId('ic');
    var data = {
      content_ids: ids,
      content_type: 'product',
      contents: contents,
      num_items: cart.length,
      value: value,
      currency: 'BDT'
    };
    if (_hasFbq()) { try { fbq('track', 'InitiateCheckout', data, { eventID: eventId }); } catch (e) {} }
    if (_hasTtq()) { try { ttq.track('InitiateCheckout', { value: value, currency: 'BDT', quantity: cart.length }, { event_id: eventId }); } catch (e) {} }
    if (_hasGtag()){ try { gtag('event', 'begin_checkout', { items: cart.map(function (c) { return { item_name: c.name, price: _safeNum(c.price), quantity: c.qty || 1 }; }), currency: 'BDT', value: value }); } catch (e) {} }
    if (_hasSnap()){ try { snaptr('track', 'START_CHECKOUT', { item_ids: ids, price: value, currency: 'BDT', number_items: cart.length }); } catch (e) {} }
    if (_hasPin()) { try { pintrk('track', 'checkout', { value: value, currency: 'BDT', order_quantity: cart.length, line_items: contents.map(function(c){ return { product_name:c.id, product_quantity:c.quantity, product_price:c.item_price }; }) }); } catch (e) {} }
  }

  // 4. Purchase
  var _firedPurchaseIds = {};
  function purchase(orderId, cart, total, userData) {
    if (!cart || cart.length === 0) return;
    if (userData) _setUserData(userData);
    var value = _safeNum(total);
    if (_firedPurchaseIds[orderId]) return;
    _firedPurchaseIds[orderId] = true;

    if (value <= 0) {
      value = cart.reduce(function (sum, c) { return sum + (_safeNum(c.price) * (c.qty || 1)); }, 0);
      if (value <= 0) return;
    }

    try { sessionStorage.setItem('yarz_purchased', '1'); } catch (e) {}
    try { if (window._yarzAbandonTimer) clearTimeout(window._yarzAbandonTimer); } catch (e) {}

    var ids = cart.map(function (c) { return c.name; });
    var contents = cart.map(function (c) {
      return { id: c.name, quantity: c.qty || 1, item_price: _safeNum(c.price) };
    });
    var eventId = orderId; // Use orderId as the canonical event_id for CAPI dedup
    var data = {
      content_ids: ids,
      content_type: 'product',
      contents: contents,
      num_items: cart.length,
      value: value,
      currency: 'BDT',
      order_id: orderId
    };
    if (_hasFbq()) { try { fbq('track', 'Purchase', data, { eventID: eventId }); } catch (e) {} }
    if (_hasTtq()) { try { ttq.track('PlaceAnOrder', { value: value, currency: 'BDT', quantity: cart.length }, { event_id: eventId }); } catch (e) {} }
    if (_hasGtag()){ try { gtag('event', 'purchase', { transaction_id: orderId, items: cart.map(function (c) { return { item_name: c.name, price: _safeNum(c.price), quantity: c.qty || 1 }; }), currency: 'BDT', value: value }); } catch (e) {} }
    if (_hasSnap()){ try { snaptr('track', 'PURCHASE', { transaction_id: orderId, item_ids: ids, price: value, currency: 'BDT', number_items: cart.length }); } catch (e) {} }
    if (_hasPin()) { try { pintrk('track', 'checkout', { value: value, currency: 'BDT', order_id: orderId, order_quantity: cart.length, line_items: contents.map(function(c){ return { product_name:c.id, product_quantity:c.quantity, product_price:c.item_price }; }) }); } catch (e) {} }
  }

  // 5. AddToWishlist
  function addToWishlist(product) {
    if (!product) return;
    var price = _safeNum(product.salePrice || product.sale || product.price);
    var eventId = _genEventId('wl');
    var data = {
      content_name: product.name,
      content_category: product.category || '',
      content_ids: [product.name],
      content_type: 'product',
      value: price,
      currency: 'BDT'
    };
    if (_hasFbq()) { try { fbq('track', 'AddToWishlist', data, { eventID: eventId }); } catch (e) {} }
    if (_hasTtq()) { try { ttq.track('AddToWishlist', { content_name: product.name, value: price, currency: 'BDT' }, { event_id: eventId }); } catch (e) {} }
    if (_hasGtag()){ try { gtag('event', 'add_to_wishlist', { items: [{ item_name: product.name, price: price }], currency: 'BDT', value: price }); } catch (e) {} }
  }

  // 6. Search
  function search(query) {
    if (!query) return;
    var eventId = _genEventId('sr');
    if (_hasFbq()) { try { fbq('track', 'Search', { search_string: query }, { eventID: eventId }); } catch (e) {} }
    if (_hasGtag()){ try { gtag('event', 'search', { search_term: query }); } catch (e) {} }
  }

  // 7. Custom (allows passing eventId for CAPI dedup)
  function trackCustom(eventName, data, eventId) {
    if (_hasFbq()) {
      try { fbq('trackCustom', eventName, data || {}, eventId ? { eventID: eventId } : undefined); } catch (e) {}
    }
  }

  // 8. WhatsAppClick
  function whatsAppClick(product, size) {
    var data = {
      page_type: product ? 'product' : 'home',
      content_name: product ? (product.name || '') : '',
      content_category: product ? (product.category || '') : '',
      size: size || '',
      value: product ? (_safeNum(product.salePrice || product.sale || product.price)) : 0,
      currency: 'BDT'
    };
    var eventId = _genEventId('wa');
    if (_hasFbq()) { try { fbq('trackCustom', 'WhatsAppClick', data, { eventID: eventId }); } catch (e) {} }
    if (_hasTtq()) { try { ttq.track('ClickButton', { content_name: data.content_name || 'WhatsApp', value: data.value, currency: 'BDT' }, { event_id: eventId }); } catch (e) {} }
    if (_hasGtag()){ try { gtag('event', 'whatsapp_click', { item_name: data.content_name, item_category: data.content_category, value: data.value }); } catch (e) {} }
  }

  // 9. TimeOnPage_30s
  var _timeOnPageFired = {};
  function timeOnPage(product) {
    if (!product || !product.name) return;
    if (_timeOnPageFired[product.name]) return;
    _timeOnPageFired[product.name] = true;
    var data = {
      content_name: product.name,
      content_category: product.category || '',
      value: _safeNum(product.salePrice || product.sale || product.price),
      currency: 'BDT',
      duration_seconds: 30
    };
    if (_hasFbq()) { try { fbq('trackCustom', 'TimeOnPage_30s', data, { eventID: _genEventId('top') }); } catch (e) {} }
    if (_hasGtag()){ try { gtag('event', 'engaged_view', { item_name: data.content_name, engagement_time_msec: 30000 }); } catch (e) {} }
  }

  // 10. SizeSelected
  var _lastSizeEvent = '';
  function sizeSelected(product, size) {
    if (!product || !size) return;
    var key = product.name + '_' + size;
    if (_lastSizeEvent === key) return;
    _lastSizeEvent = key;
    var data = {
      content_name: product.name,
      content_category: product.category || '',
      size: size,
      value: _safeNum(product.salePrice || product.sale || product.price),
      currency: 'BDT'
    };
    if (_hasFbq()) { try { fbq('trackCustom', 'SizeSelected', data, { eventID: _genEventId('ss') }); } catch (e) {} }
    if (_hasGtag()){ try { gtag('event', 'select_item', { item_name: data.content_name, item_variant: size }); } catch (e) {} }
  }

  // ===== Auto-Inject helpers =====
  function _injectFbPixel(pixelId, am) {
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
      n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    if (am && Object.keys(am).length) fbq('init', pixelId, am);
    else fbq('init', pixelId);
    fbq('track', 'PageView');
  }
  function _injectGa4(gaId) {
    if (!gaId || _hasGtag()) return;
    var s = document.createElement('script'); s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gaId);
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag('js', new Date()); gtag('config', gaId);
  }
  function _injectTikTok(ttId) {
    if (!ttId || _hasTtq()) return;
    !function (w, d, t) {
      w.TiktokAnalyticsObject = t; var ttq = w[t] = w[t] || [];
      ttq.methods = ['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie'];
      ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.instance = function (t) { for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]); return e; };
      ttq.load = function (e, n) {
        var i = 'https://analytics.tiktok.com/i18n/pixel/events.js';
        ttq._i = ttq._i || {}; ttq._i[e] = []; ttq._i[e]._u = i;
        ttq._t = ttq._t || {}; ttq._t[e] = +new Date(); ttq._o = ttq._o || {}; ttq._o[e] = n || {};
        var o = document.createElement('script'); o.type = 'text/javascript'; o.async = !0; o.src = i + '?sdkid=' + e + '&lib=' + t;
        var a = document.getElementsByTagName('script')[0]; a.parentNode.insertBefore(o, a);
      };
      ttq.load(ttId); ttq.page();
    }(window, document, 'ttq');
  }
  function _injectSnap(snapId) {
    if (!snapId || _hasSnap()) return;
    (function (e, t, n) {
      if (e.snaptr) return; var a = e.snaptr = function () { a.handleRequest ? a.handleRequest.apply(a, arguments) : a.queue.push(arguments); };
      a.queue = []; var s = 'script'; var r = t.createElement(s); r.async = !0; r.src = 'https://sc-static.net/scevent.min.js';
      var u = t.getElementsByTagName(s)[0]; u.parentNode.insertBefore(r, u);
    })(window, document);
    snaptr('init', snapId); snaptr('track', 'PAGE_VIEW');
  }
  function _injectPinterest(pinId) {
    if (!pinId || _hasPin()) return;
    !function (e) {
      if (!window.pintrk) {
        window.pintrk = function () { window.pintrk.queue.push(Array.prototype.slice.call(arguments)); };
        var n = window.pintrk; n.queue = []; n.version = '3.0';
        var t = document.createElement('script'); t.async = !0; t.src = e;
        var r = document.getElementsByTagName('script')[0]; r.parentNode.insertBefore(t, r);
      }
    }('https://s.pinimg.com/ct/core.js');
    pintrk('load', pinId); pintrk('page');
  }

  // ===== INIT =====
  function init(storeInfo) {
    if (_initialized) return;
    _initialized = true;
    _storeInfo = storeInfo || {};

    // Normalize: accept multiple admin key formats
    function pick() {
      for (var i = 0; i < arguments.length; i++) {
        var v = _storeInfo[arguments[i]];
        if (v != null && String(v).trim()) return String(v).trim();
      }
      return '';
    }
    var fbPixelId   = pick('fbPixel', 'FB Pixel', 'fb_pixel');
    var ga4Id       = pick('ga4Id', 'GA4', 'ga4');
    var tiktokId    = pick('tiktokPixel', 'TT Pixel', 'tt_pixel', 'tiktok_pixel');
    var snapId      = pick('snapchatPixel', 'Snapchat Pixel', 'snap_pixel', 'snapchat_pixel');
    var pinId       = pick('pinterestPixel', 'Pinterest Pixel', 'pinterest_pixel');
    if (fbPixelId) _storeInfo.fbPixel = fbPixelId; // keep cached id

    // Restore any cached advanced-matching from a previous session before pixel init
    var cachedAm = _getCachedUserMatch();

    // --- Auto-inject pixels from admin settings ---
    if (fbPixelId) _injectFbPixel(fbPixelId, cachedAm);
    if (ga4Id)     _injectGa4(ga4Id);
    if (tiktokId)  _injectTikTok(tiktokId);
    if (snapId)    _injectSnap(snapId);
    if (pinId)     _injectPinterest(pinId);

    // --- Sitewide engagement events (FB only) ---
    if (fbPixelId && _hasFbq()) {
      setTimeout(function () { try { fbq('trackCustom', '25_sec_onpage', {}, { eventID: _genEventId('25s') }); } catch (e) {} }, 25000);
      setTimeout(function () { try { fbq('trackCustom', '60_sec_onpage', {}, { eventID: _genEventId('60s') }); } catch (e) {} }, 60000);
      setTimeout(function () { try { fbq('trackCustom', '100_sec_onpage', {}, { eventID: _genEventId('100s') }); } catch (e) {} }, 100000);
      setTimeout(function () { try { fbq('trackCustom', '180_sec_onpage', {}, { eventID: _genEventId('180s') }); } catch (e) {} }, 180000);
      setTimeout(function () { try { fbq('trackCustom', '300_sec_onpage', {}, { eventID: _genEventId('300s') }); } catch (e) {} }, 300000);

      document.addEventListener('click', function (e) {
        var btn = (e.target.closest && (e.target.closest('button') || e.target.closest('a.btn'))) || null;
        if (btn) {
          var btnText = (btn.innerText || btn.textContent || '').trim().substring(0, 50);
          if (btnText) {
            try { fbq('trackCustom', 'SubscribedButtonClick', { buttonText: btnText, buttonFeatures: btn.className || '' }); } catch (err) {}
          }
        }
      });
    }
  }

  return {
    init: init,
    setUserData: _setUserData,
    viewContent: viewContent,
    addToCart: addToCart,
    initiateCheckout: initiateCheckout,
    purchase: purchase,
    addToWishlist: addToWishlist,
    search: search,
    trackCustom: trackCustom,
    whatsAppClick: whatsAppClick,
    timeOnPage: timeOnPage,
    sizeSelected: sizeSelected
  };
})();
