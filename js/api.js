/* YARZ API v5.2 */

const YARZ_API = (() => {
  // ===== CONFIGURATION (Secured) =====
  // Runtime decode — not readable as plain text in source
  var _0x = function(s) { try { return atob(s); } catch(e) { return ''; } };
  const APPS_SCRIPT_URL = _0x('aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J4MU1MOEhNUnRlZTU2cGlCRUdPYlhzOFRadjBoaFBzd3RtMmIwZVZ6X1VIQ0pScHRIM3ZhZkZ4Z0F6UWtzSDY1TngvZXhlYw==');
  const GOOGLE_API_KEY = _0x('QUl6YVN5QXBNdGpqMmJhTzZ1MTlBdnBwakx0SjFHVDFHNjFxbzlr');
  const SHEET_ID = _0x('MXdRejVPUVpBdElTVEQxRmRTRXNfajktcDBlLUJId1lqbWpON1BSOWhBLVE=');

  // Deployment version — when this changes, ALL caches are force-cleared
  const DEPLOY_VERSION = '2026-05-19-v10.0-deploy';

  const CONFIG = {
    API_KEY: GOOGLE_API_KEY,
    BASE_URL: APPS_SCRIPT_URL,
    // ✅ v4.5: Reduced stale times so admin changes reflect quickly
    //   - products / categories → 2min fresh, 3min stale
    //   - store_info            → 30s fresh, 2min stale
    //   - orders_by_phone       → NO CACHE (always real-time status)
    //   - default               → 10s fresh, 1min stale
    CACHE_TTL: 5 * 1000,
    STALE_TTL: 20 * 1000,
    PRODUCT_CACHE_TTL: 10 * 1000,             // 10 seconds fresh (Backend uses CacheService now)
    PRODUCT_STALE_TTL: 30 * 1000,             // 30 seconds stale
    SETTINGS_CACHE_TTL: 10 * 1000,            // 10 seconds fresh
    SETTINGS_STALE_TTL: 30 * 1000,            // 30 seconds stale
  };

  // ✅ v4.1: Action types that should NEVER be cached (real-time required)
  const NO_CACHE_ACTIONS = ['orders_by_phone', 'place_order', 'updatewebsiteorderstatus', 'deletewebsiteorder', 'health'];

  // ✅ v3.9: Tier resolver — picks the right TTL per action
  function _ttlFor(action) {
    if (action === 'products' || action === 'product' || action === 'categories') {
      return { fresh: CONFIG.PRODUCT_CACHE_TTL, stale: CONFIG.PRODUCT_STALE_TTL };
    }
    if (action === 'store_info') {
      return { fresh: CONFIG.SETTINGS_CACHE_TTL, stale: CONFIG.SETTINGS_STALE_TTL };
    }
    return { fresh: CONFIG.CACHE_TTL, stale: CONFIG.STALE_TTL };
  }

  // ✅ v3.9: In-memory cache (faster than localStorage — no JSON parse on every hit)
  const memCache = {};

  const DEFAULT_SOCIAL_LINKS = {
    facebook: 'https://www.facebook.com/Yarzbd',
    instagram: 'https://www.instagram.com/yarzclothing',
    whatsapp: 'https://wa.me/8801601743670',
    tiktok: 'https://tiktok.com/@yarzbd',
    messenger: 'https://m.me/Yarzbd',
    youtube: '',
    twitter: ''
  };

  const cache = {};

  // ✅ v3.9: URL version enforcement — যদি localStorage এ পুরানো URL থাকে, reset করো
  const API_ENDPOINTS = [
    'https://script.google.com/macros/s/AKfycbx1ML8HMRtee56piBEGObXs8TZv0hhPswtm2b0eVz_UHCJRptH3vafFxgAzQksH65Nx/exec'
  ];
  // ✅ v4.5: DEPLOYMENT VERSION CHECK — force-clears ALL caches when new version detected
  // This is the MAIN fix for "incognito works but normal browser doesn't"
  (function _deployVersionCheck() {
    try {
      var lastDeploy = localStorage.getItem('yarz_deploy_version');
      if (lastDeploy !== DEPLOY_VERSION) {
        // 1. Clear localStorage caches
        Object.keys(localStorage).forEach(function(k) {
          if (k.startsWith('yarz_api_cache_') || k === 'yarz_api_url' ||
              k === 'yarz_storeinfo_cache' || k === 'yarz_prefetch_snapshot') {
            localStorage.removeItem(k);
          }
        });
        // 2. Force Service Worker to clear old caches
        if ('caches' in window) {
          caches.keys().then(function(keys) {
            keys.forEach(function(k) { caches.delete(k); });
          });
        }
        // 3. Unregister old service worker so new one installs fresh
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(function(regs) {
            regs.forEach(function(r) { r.unregister(); });
          });
        }
        // 4. Save new version
        localStorage.setItem('yarz_deploy_version', DEPLOY_VERSION);
      }
      // Ensure API URL points to the latest deployment
      var saved = localStorage.getItem('yarz_api_url');
      if (saved && saved !== APPS_SCRIPT_URL) {
        localStorage.removeItem('yarz_api_url');
      }
      // ✅ v9.7: Detect admin dirty flag — admin panel sets this after saving settings.
      // Clears prefetch snapshot so storefront fetches fresh data on next load.
      var dirty = localStorage.getItem('yarz_settings_dirty');
      if (dirty) {
        localStorage.removeItem('yarz_settings_dirty');
        localStorage.removeItem('yarz_prefetch_snapshot');
        Object.keys(localStorage).forEach(function(k) {
          if (k.startsWith('yarz_api_cache_') || k === 'yarz_storeinfo_cache') {
            localStorage.removeItem(k);
          }
        });
      }
    } catch(e) {}
  })();

  function getBaseUrl() {
    return localStorage.getItem('yarz_api_url') || APPS_SCRIPT_URL;
  }

  function setBaseUrl(url) {
    localStorage.setItem('yarz_api_url', url);
  }

  function isConfigured() {
    return !!getBaseUrl();
  }


  function getCached(key, allowStale, action) {
    const ttl = _ttlFor(action || '');
    // ✅ v3.9: Try in-memory first (instant — no JSON parse, no disk I/O)
    const memItem = memCache[key];
    if (memItem) {
      const age = Date.now() - memItem.time;
      if (age <= ttl.fresh) return { data: memItem.data, fresh: true };
      if (allowStale && age <= ttl.stale) return { data: memItem.data, fresh: false };
    }
    try {
      const lsKey = 'yarz_api_cache_' + key.split('action=')[1];
      const itemStr = localStorage.getItem(lsKey);
      if (itemStr) {
        const item = JSON.parse(itemStr);
        const age = Date.now() - item.time;
        if (age <= ttl.fresh) {
          memCache[key] = item; // promote to memory
          return { data: item.data, fresh: true };
        } else if (allowStale && age <= ttl.stale) {
          memCache[key] = item;
          return { data: item.data, fresh: false };
        } else {
          localStorage.removeItem(lsKey);
        }
      }
    } catch (e) { }
    return null;
  }

  function setCache(key, data) {
    const item = { data, time: Date.now() };
    memCache[key] = item; // ✅ v3.9: in-memory first for instant subsequent reads
    try {
      const lsKey = 'yarz_api_cache_' + key.split('action=')[1];
      localStorage.setItem(lsKey, JSON.stringify(item));
    } catch (e) { /* quota exceeded — memory cache still works */ }
  }

  function clearCache() {
    Object.keys(memCache).forEach(k => delete memCache[k]);
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('yarz_api_cache_')) localStorage.removeItem(k);
      });
    } catch (e) { }
  }

  // ✅ v9.7: Targeted invalidation for store_info — used after admin saves settings.
  // Clears only settings-related caches so next getStoreInfo() / getGlobalControls()
  // fetch fresh data from server instead of serving stale cached values.
  function invalidateStoreInfo() {
    Object.keys(memCache).forEach(k => {
      if (k.indexOf('store_info') !== -1 || k.indexOf('delivery_charges') !== -1) {
        delete memCache[k];
      }
    });
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.indexOf('store_info') !== -1 || k.indexOf('delivery_charges') !== -1 || k === 'yarz_storeinfo_cache') {
          localStorage.removeItem(k);
        }
      });
    } catch (e) { }
  }

  const _revalidating = {};

  // ===== RESPONSE NORMALIZER (CRITICAL FIX) =====
  // Apps Script returns: { success, ok, data: { products, categories, storeInfo } }
  // Old apps may return: { success, products, categories, store }
  // This unifies both formats so app.js can safely use data.products / data.categories
  function _normalizeResponse(action, data) {
    if (!data || typeof data !== 'object') return data;

    // Pass-through if already in expected format
    if (action === 'products') {
      // Promote nested data.data.products → data.products
      if (data.data && typeof data.data === 'object') {
        if (Array.isArray(data.data)) {
          data.products = data.data;
        } else if (Array.isArray(data.data.products)) {
          data.products = data.data.products;
        }
        if (Array.isArray(data.data.categories) && !data.categories) {
          data.categories = data.data.categories;
        }
        if (data.data.storeInfo && !data.storeInfo) {
          data.storeInfo = data.data.storeInfo;
        }
        if (data.data.timestamp) data.timestamp = data.data.timestamp;
      }

      // ✅ v3.9 CRITICAL FIX: Normalize each product's field names so app.js renders correctly
      // Apps Script sends: stockM/stockL/stockXL/stockXXL, regular, sale, discPct, image1-6
      // app.js expects:    sizes.M/L/XL/XXL, regularPrice, salePrice, discountPercent, image1-6
      if (Array.isArray(data.products)) {
        data.products = data.products.map(function(p) {
          if (!p || typeof p !== 'object') return p;

          // Map price fields
          if (p.regularPrice === undefined && p.regular !== undefined) p.regularPrice = p.regular;
          if (p.salePrice === undefined && p.sale !== undefined) p.salePrice = p.sale;
          if (p.discountPercent === undefined) {
            p.discountPercent = p.discPct !== undefined ? p.discPct :
              (p.regularPrice > 0 && p.salePrice >= 0 ?
                Math.round(((p.regularPrice - p.salePrice) / p.regularPrice) * 100) : 0);
          }

          // Map sizes → { M: qty, L: qty, XL: qty, XXL: qty }
          if (!p.sizes || typeof p.sizes !== 'object') {
            var sS = parseInt(p.stockS) || 0;
            var sM = parseInt(p.stockM) || 0;
            var sL = parseInt(p.stockL) || 0;
            var sXL = parseInt(p.stockXL) || 0;
            var sXXL = parseInt(p.stockXXL) || 0;
            var s3XL = parseInt(p.stock3XL) || 0;
            p.sizes = { S: sS, M: sM, L: sL, XL: sXL, XXL: sXXL, '3XL': s3XL };
          }

          // inStock = true if ANY size has stock > 0
          if (p.inStock === undefined) {
            p.inStock = (p.sizes.S > 0 || p.sizes.M > 0 || p.sizes.L > 0 || p.sizes.XL > 0 || p.sizes.XXL > 0 || p.sizes['3XL'] > 0);
          }

          // Ensure image field aliases (Apps Script uses image1, website also image1 - ensure consistency)
          if (!p.image1 && p.img1) p.image1 = p.img1;
          if (!p.image2 && p.img2) p.image2 = p.img2;
          if (!p.image3 && p.img3) p.image3 = p.img3;
          if (!p.image4 && p.img4) p.image4 = p.img4;
          if (!p.image5 && p.img5) p.image5 = p.img5;
          if (!p.image6 && p.img6) p.image6 = p.img6;

          // description alias
          if (!p.description && p.desc) p.description = p.desc;

          return p;
        });
      }
    }

    if (action === 'categories') {
      // Apps Script: { success, data: [...] } or { success, data: { products, categories } }
      if (Array.isArray(data.data)) {
        data.categories = data.data.map(function (c) {
          // If just a string array, convert to object form
          if (typeof c === 'string') return { name: c, count: 0 };
          return c;
        });
      } else if (data.data && Array.isArray(data.data.categories)) {
        data.categories = data.data.categories;
      }
      // Compute counts if missing — needs products list
      if (Array.isArray(data.categories)) {
        data.categories = data.categories.map(function (c) {
          if (typeof c === 'string') return { name: c, count: 0 };
          return c;
        });
      }
    }

    if (action === 'store_info') {
      if (data.data && typeof data.data === 'object' && !data.store) {
        data.store = data.data;
      }
    }

    if (action === 'orders_by_phone') {
      if (Array.isArray(data.data) && !data.orders) {
        data.orders = data.data;
      }
    }

    return data;
  }

  // ===== GET REQUEST (with stale-while-revalidate) =====
  async function apiGet(action, params = {}, opts = {}) {
    const base = getBaseUrl();
    if (!base) throw new Error('API URL not configured');

    const url = new URL(base);
    url.searchParams.set('key', CONFIG.API_KEY);
    url.searchParams.set('action', action);
    Object.keys(params).forEach(k => {
      if (params[k] !== undefined && params[k] !== '') {
        url.searchParams.set(k, params[k]);
      }
    });

    const cacheKey = url.toString();

    // ✅ v4.2: explicit skipCache option (used by stock checks)
    if (opts && opts.skipCache) {
      return _fetchFromNetwork(action, url.toString(), cacheKey, true);
    }

    // ✅ v4.1: Real-time actions (order tracking) bypass cache entirely
    if (NO_CACHE_ACTIONS.indexOf(action) !== -1) {
      return _fetchFromNetwork(action, url.toString(), cacheKey, true);
    }
    const cached = getCached(cacheKey, true, action);

    if (cached && cached.fresh) return cached.data;

    if (cached && !cached.fresh) {
      if (!_revalidating[cacheKey]) {
        _revalidating[cacheKey] = true;
        _fetchFromNetwork(action, url.toString(), cacheKey).finally(() => {
          delete _revalidating[cacheKey];
        });
      }
      return cached.data;
    }

    return _fetchFromNetwork(action, url.toString(), cacheKey);
  }

  async function _fetchFromNetwork(action, urlStr, cacheKey, skipCache) {
    const maxRetries = 4; // Increased for high concurrency
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const bustUrl = urlStr + (urlStr.includes('?') ? '&' : '?') + '_t=' + Date.now();
        const response = await fetch(bustUrl, {
          method: 'GET',
          redirect: 'follow',
          cache: 'no-store',
        });
        
        // If Google hits a rate limit, it might return 429 or 500
        if (!response.ok) {
           throw new Error(`HTTP Error: ${response.status}`);
        }
        
        let data = await response.json();

        // ✅ CRITICAL: Normalize response so app.js works regardless of API format
        data = _normalizeResponse(action, data);

        if (data.success && !skipCache) {
          setCache(cacheKey, data);
          _notifyRefresh(cacheKey, data);
        }
        return data;
      } catch (err) {
        attempt++;
        if (attempt >= maxRetries) {
          throw err;
        }
        // Exponential backoff: 1.5s, 3s, 4.5s
        const delay = (attempt * 1500) + Math.floor(Math.random() * 1000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  const _refreshListeners = [];

  function onDataRefresh(callback) {
    _refreshListeners.push(callback);
  }

  function _notifyRefresh(cacheKey, data) {
    _refreshListeners.forEach(fn => {
      try { fn(cacheKey, data); } catch (e) { }
    });
  }

  // ===== POST REQUEST =====
  async function apiPost(action, body = {}) {
    const base = getBaseUrl();
    if (!base) throw new Error('API URL not configured');

    const maxRetries = 4; // Increased for high concurrency
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await fetch(base, {
          method: 'POST',
          redirect: 'follow',
          keepalive: true, // v10.6: Guarantees delivery even if user closes tab instantly
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            key: CONFIG.API_KEY,
            action,
            ...body
          })
        });
        
        // If Google hits a rate limit, it might return 429 or 500
        if (!response.ok) {
           throw new Error(`HTTP Error: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
      } catch (err) {
        attempt++;
        if (attempt >= maxRetries) {
          throw err;
        }
        // Exponential backoff: 1.5s, 3s, 4.5s
        const delay = (attempt * 1500) + Math.floor(Math.random() * 1000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // ===== PUBLIC API METHODS =====
  async function getProducts(category, search) {
    return apiGet('products', { category, search });
  }

  async function getProduct(name) {
    return apiGet('product', { name });
  }

  // ✅ v4.2: Real-time stock check — fresh server data, never cached
  // Used silently in background while customer is on product page
  async function getProductStock(name) {
    try {
      const params = { name, _t: Date.now() };
      const res = await apiGet('product', params, { skipCache: true });
      if (res && (res.success || res.ok)) {
        const p = res.product || res.data || res;
        if (p && typeof p === 'object') {
          return {
            success: true,
            name: p.name || name,
            stock_S:   parseInt(p.stock_S   || p.stockS   || (p.sizes && p.sizes.S)   || 0) || 0,
            stock_M:   parseInt(p.stock_M   || p.stockM   || (p.sizes && p.sizes.M)   || 0) || 0,
            stock_L:   parseInt(p.stock_L   || p.stockL   || (p.sizes && p.sizes.L)   || 0) || 0,
            stock_XL:  parseInt(p.stock_XL  || p.stockXL  || (p.sizes && p.sizes.XL)  || 0) || 0,
            stock_XXL: parseInt(p.stock_XXL || p.stockXXL || (p.sizes && p.sizes.XXL) || 0) || 0,
            stock_3XL: parseInt(p.stock_3XL || p.stock3XL || (p.sizes && p.sizes['3XL']) || 0) || 0,
            inStock: !!(p.inStock !== false),
            updatedAt: Date.now()
          };
        }
      }
      return { success: false };
    } catch (err) {
      // Silent fail
      return { success: false, error: err.message };
    }
  }

  async function getCategories() {
    // ✅ Categories from products endpoint to get accurate counts
    // Falls back to the categories action if needed
    try {
      const productsRes = await apiGet('products');
      if (productsRes && productsRes.success && Array.isArray(productsRes.products)) {
        const counts = {};
        productsRes.products.forEach(function (p) {
          const c = p.category || '';
          if (!c) return;
          counts[c] = (counts[c] || 0) + 1;
        });
        // Use storeInfo categories if available, else from product list
        const cats = (productsRes.storeInfo && Array.isArray(productsRes.storeInfo.categories))
          ? productsRes.storeInfo.categories : Object.keys(counts);
        const finalList = cats.map(function (name) {
          if (typeof name === 'object' && name.name) {
            return { name: name.name, count: counts[name.name] || name.count || 0 };
          }
          return { name: name, count: counts[name] || 0 };
        }).filter(function (c) { return c.count > 0; });
        return { success: true, categories: finalList };
      }
    } catch (e) {
      // Fallback to categories endpoint
    }
    return apiGet('categories');
  }

  async function getStoreInfo() {
    return apiGet('store_info');
  }

  async function getDeliveryCharges() {
    return apiGet('delivery_charges', { _t: Date.now() }, { skipCache: true });
  }

  async function healthCheck() {
    return apiGet('health');
  }

  async function placeOrder(orderData) {
    clearCache();
    return apiPost('place_order', { order: orderData });
  }

  async function getOrdersByPhone(phone, forceFresh) {
    try {
      // ✅ v4.1 FIX: bypass cache for real-time status sync (admin -> customer)
      if (forceFresh) {
        clearCache();
        const params = { phone, _t: Date.now() };
        return await apiGet('orders_by_phone', params, { skipCache: true });
      }
      return await apiGet('orders_by_phone', { phone });
    } catch (err) {
      return {
        success: false,
        message: 'Order tracking is temporarily unavailable. Please contact customer support.',
        fallback: true,
        orders: []
      };
    }
  }

  // ✅ Delete order — uses POST primary, GET fallback (for CORS issues)
  async function deleteOrder(orderId) {
    clearCache();
    try {
      const res = await apiPost('deletewebsiteorder', { orderId });
      if (res && (res.success || res.ok)) return res;
      // Fallback: try GET
      return await apiGet('deletewebsiteorder', { orderId });
    } catch (err) {
      try {
        return await apiGet('deletewebsiteorder', { orderId });
      } catch (e2) {
        return { success: false, error: e2.message };
      }
    }
  }

  // ✅ Archive completed orders
  async function archiveCompletedOrders() {
    clearCache();
    try {
      return await apiPost('archivecompletedorders', {});
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ✅ Update order status — for admin panel sync
  async function updateOrderStatus(orderId, status, courier) {
    clearCache();
    return apiPost('updatewebsiteorderstatus', { orderId, status, courier: courier || '' });
  }

  // ===== GLOBAL CONTROLS =====
  async function getGlobalControls() {
    try {
      const result = await getStoreInfo();
      if (!result || !result.success) return null;

      const s = result.data || result.store || {};
      if (!s || typeof s !== 'object') return null;

      const dynamicSections = [];

      const get = (key) => {
        if (s[key] !== undefined) return s[key];
        
        // Prioritize admin panel's Title Case keys
        var titleCase = key.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        if (s[titleCase] !== undefined) return s[titleCase];
        
        // Fallback for case differences (e.g., 'Announcement Bg' vs 'Announcement BG')
        const targetTitle = titleCase.toLowerCase();
        for (let k in s) {
          if (k.toLowerCase() === targetTitle) return s[k];
        }

        // Legacy snake_case fallback
        const normalized = key.toLowerCase().replace(/[\s()]+/g, '_');
        if (s[normalized] !== undefined) return s[normalized];
        
        return '';
      };

      const parseBool = (val, defaultVal = false) => {
        if (val === '' || val === undefined || val === null) return defaultVal;
        if (typeof val === 'boolean') return val;
        const str = String(val).toLowerCase().trim();
        if (['true','yes','1','on','enabled','enable','chalu','চালু'].indexOf(str) !== -1) return true;
        if (['false','no','0','off','disabled','disable','bondho','bondh','বন্ধ'].indexOf(str) !== -1) return false;
        return defaultVal;
      };

      const storeStatus = String(get('store_status') || 'open').toLowerCase();
      const maintenanceMode = parseBool(get('maintenance_mode')) || storeStatus === 'maintenance';
      const announcementActive = parseBool(get('announcement_active'));
      const announcementText = String(get('announcement_text') || '');
      const paymentMethods = String(get('payment_methods') || 'COD, bKash, Nagad');
      
      const _codRaw = get('enable_cod') !== '' ? get('enable_cod')
                    : (s['Enable COD'] !== undefined ? s['Enable COD']
                    : (s['enable cod'] !== undefined ? s['enable cod'] : ''));
      let enableCOD = parseBool(_codRaw, true);

      // ✅ v3.8: Default zones → Narayanganj (Inside ৳70 / Outside ৳140)
      const zone1Name = String(get('zone_1_name') || 'Inside Narayanganj');
      const zone2Name = String(get('zone_2_name') || 'Outside Narayanganj');
      const zone1Charge = parseFloat(get('zone_1_charge')) || 70;
      const zone2Charge = parseFloat(get('zone_2_charge')) || 140;

      // ✅ Delivery locations — dynamic manager backed by the DELIVERY_CHARGES sheet tab.
      // Supports unlimited owner-defined locations while preserving legacy Zone 1/2 fields.
      let deliveryLocations = [];
      const rawDeliveryLocations = get('delivery_locations') || s.delivery_locations || s.deliveryLocations || '';
      if (Array.isArray(rawDeliveryLocations)) {
        deliveryLocations = rawDeliveryLocations;
      } else if (rawDeliveryLocations) {
        try { deliveryLocations = JSON.parse(String(rawDeliveryLocations)); } catch (e) { deliveryLocations = []; }
      }
      deliveryLocations = deliveryLocations
        .map((loc, idx) => ({
          id: String(loc.id || loc.key || ('zone_' + (idx + 1))).trim(),
          name: String(loc.name || loc.location || '').trim(),
          charge: parseFloat(loc.charge || loc.fee || loc.deliveryCharge || 0) || 0,
          active: loc.active === undefined ? true : parseBool(loc.active, true)
        }))
        .filter(loc => loc.name && loc.active);
      if (!deliveryLocations.length) {
        deliveryLocations = [
          { id: 'zone_1', name: zone1Name, charge: zone1Charge, active: true },
          { id: 'zone_2', name: zone2Name, charge: zone2Charge, active: true }
        ];
      }

      // ✅ Social Links — supports MULTIPLE key formats from sheet
      const socialLinks = {
        facebook: String(get('link_facebook') || get('facebook_page') || get('facebook') || s['facebook_url'] || DEFAULT_SOCIAL_LINKS.facebook),
        instagram: String(get('link_instagram') || get('instagram') || s['instagram_url'] || DEFAULT_SOCIAL_LINKS.instagram),
        whatsapp: String(get('link_whatsapp') || get('whatsapp') || s['whatsapp_url'] || DEFAULT_SOCIAL_LINKS.whatsapp),
        tiktok: String(get('link_tiktok') || get('tiktok') || s['tiktok_url'] || DEFAULT_SOCIAL_LINKS.tiktok),
        messenger: String(get('link_messenger') || get('messenger') || s['messenger_url'] || DEFAULT_SOCIAL_LINKS.messenger),
        youtube: String(get('link_youtube') || get('youtube') || s['youtube_url'] || DEFAULT_SOCIAL_LINKS.youtube),
        twitter: String(get('link_twitter') || get('twitter') || s['twitter_url'] || DEFAULT_SOCIAL_LINKS.twitter)
      };

      // ✅ Live Chat config
      const liveChat = {
        whatsappBtn: parseBool(get('whatsapp_chat_active') || get('whatsapp_chat')),
        whatsappNumber: String(get('whatsapp_chat_number') || get('whatsapp_number') || ''),
        whatsappMsg: String(get('whatsapp_chat_msg') || get('whatsapp_default_msg') || 'Hi, I am interested in your products.'),
        messengerBtn: parseBool(get('messenger_chat_active') || get('messenger_chat')),
        messengerUrl: String(get('messenger_chat_url') || get('messenger_url') || socialLinks.messenger || '')
      };

      const heroBanners = [];
      for (let i = 1; i <= 5; i++) {
        const img = s['hero_banner_' + i] || s['hero_banner ' + i] || '';
        if (img) {
          heroBanners.push({
            image: img,
            title: s['banner_title_' + i] || s['banner_title ' + i] || '',
            link: s['banner_link_' + i] || s['banner_link ' + i] || '',
            subtitle: ''
          });
        }
      }

      for (let i = 1; i <= 50; i++) {
        const title = String(get(`section_${i}_title`) || get(`section_${i}title`) || get(`Section ${i} Title`) || '');
        const active = parseBool(get(`section_${i}_active`) || get(`section_${i}active`) || get(`section_${i}_show`) || get(`Section ${i} Show`), true);
        if (title && active) {
          const rawLink = String(get(`section_${i}_link`) || get(`section_${i}link`) || get(`Section ${i} Link`) || '');
          let links = [];
          try {
            links = JSON.parse(rawLink);
            if (!Array.isArray(links)) links = rawLink ? [rawLink] : [];
          } catch(e) {
            links = rawLink ? [rawLink] : [];
          }
          dynamicSections.push({
            title: title,
            category: String(get(`section_${i}_category`) || get(`section_${i}category`) || get(`Section ${i} Category`) || ''),
            image: String(get(`section_${i}_image`) || get(`section_${i}image`) || get(`Section ${i} Image`) || ''),
            link: rawLink, // original string for backward compatibility
            links: links
          });
        }
      }

      const flashDate = String(get('flash_date') || '');
      const flashTitle = String(get('flash_title') || 'Flash Sale');
      const currency = String(get('currency') || '৳');
      const b2bMode = parseBool(get('b2b_mode'));
      const promoPopupActive = parseBool(get('promo_popup_active'));
      const promoPopupImage = String(get('promo_popup_image') || '');
      const promoPopupLink = String(get('promo_popup_link') || '');
      const freeShipAmt = parseFloat(get('free_ship_amt')) || 0;

      return {
        maintenanceMode,
        announcementActive,
        announcementText,
        announcementBg: String(get('announcement_bg') || '#634A8E'),
        announcementColor: String(get('announcement_text_color') || '#FFFFFF'),
        storeStatus,
        paymentMethods,
        enableCOD,
        zone1Name,
        zone2Name,
        zone1Charge,
        zone2Charge,
        deliveryLocations,
        heroBanners,
        dynamicSections,
        socialLinks,
        liveChat,
        flashDate,
        flashTitle,
        currency,
        b2bMode,
        promoPopupActive,
        promoPopupImage,
        promoPopupLink,
        freeShipAmt,
        // Product Page settings
        quickView: parseBool(get('quick_view')),
        stockBar: parseBool(get('stock_bar')),
        relatedProd: parseBool(get('related_prod'), true),
        liveSearch: parseBool(get('live_search'), true),
        hoverEffect: String(get('hover_effect') || 'zoom'),
        addCartText: String(get('add_cart_text') || ''),
        maxQty: parseInt(get('max_qty')) || 0,
        expDelivery: String(get('exp_delivery') || ''),
        // Cart & Checkout settings
        cartDrawer: parseBool(get('cart_drawer'), true),
        orderNotes: parseBool(get('order_notes')),
        checkoutMode: String(get('checkout_mode') || 'website'),
        customField: String(get('custom_field') || ''),
        minOrder: parseFloat(get('min_order')) || 0,
        // Marketing settings
        exitPopup: parseBool(get('exit_popup')),
        loyaltySystem: parseBool(get('loyalty_system')),
        trustBadges: parseBool(get('trust_badges')),
        abandonMsg: String(get('abandon_msg') || ''),
        // Branding settings
        websiteLogoUrl: String(get('website_logo_url') || ''),
        font: String(get('font') || ''),
        themeColor: String(get('theme_color') || ''),
        footerText: String(get('footer_text') || ''),
        // SEO settings
        metaTitle: String(get('meta_title') || ''),
        metaDesc: String(get('meta_desc') || ''),
        ogImage: String(get('og_image') || ''),
        raw: s
      };
    } catch (e) {
      // Load error
      return null;
    }
  }

  // ✅ v9.7: PREFETCH — Optimized from 3 API calls to 1.
  // The 'products' endpoint returns { products, categories, storeInfo } in one response.
  // We fire ONLY 'products', then cross-populate store_info + categories caches
  // from the same response — eliminates 2 network requests entirely.
  function prefetchAll() {
    try {
      // ✅ Phase 1: Immediate render from localStorage snapshot (returning visitors)
      // This gives <100ms first paint before ANY network request completes.
      try {
        var snapshot = localStorage.getItem('yarz_prefetch_snapshot');
        if (snapshot) {
          var snap = JSON.parse(snapshot);
          if (snap && snap.time && (Date.now() - snap.time) < 30 * 1000) { // 30 seconds max (Real-time updates)
            // Populate memory cache with snapshot data for instant reads
            if (snap.products) {
              var prodKey = getBaseUrl() + '?key=' + CONFIG.API_KEY + '&action=products';
              memCache[prodKey] = { data: snap.products, time: snap.time };
            }
            if (snap.store_info) {
              var siKey = getBaseUrl() + '?key=' + CONFIG.API_KEY + '&action=store_info';
              memCache[siKey] = { data: snap.store_info, time: snap.time };
            }
          }
        }
      } catch(e) {}

      // ✅ Phase 2: Fire single network request that returns everything
      apiGet('products').then(function(res) {
        if (!res || !res.success) return;
        // Cross-populate store_info cache from the products response
        if (res.storeInfo) {
          var storeInfoData = { success: true, ok: true, data: res.storeInfo, store: res.storeInfo };
          var siKey = getBaseUrl() + '?key=' + CONFIG.API_KEY + '&action=store_info';
          setCache(siKey, storeInfoData);
        }
        // Cross-populate categories cache from the products response
        if (res.categories || (res.products && Array.isArray(res.products))) {
          var cats = res.categories;
          if (!cats && Array.isArray(res.products)) {
            var counts = {};
            res.products.forEach(function(p) { var c = p.category || ''; if(c) counts[c] = (counts[c]||0)+1; });
            cats = Object.keys(counts).map(function(n) { return { name: n, count: counts[n] }; });
          }
          if (cats) {
            var catKey = getBaseUrl() + '?key=' + CONFIG.API_KEY + '&action=categories';
            setCache(catKey, { success: true, ok: true, categories: cats });
          }
        }
        // ✅ Save snapshot for instant next-visit paint
        try {
          localStorage.setItem('yarz_prefetch_snapshot', JSON.stringify({
            time: Date.now(),
            products: res,
            store_info: res.storeInfo ? { success:true, ok:true, data:res.storeInfo, store:res.storeInfo } : null
          }));
        } catch(e) {} // quota exceeded — fine, next visit just fetches fresh
      }).catch(function(){});
      // Also fire store_info as backup (in case products endpoint doesn't include it)
      apiGet('store_info').catch(function(){});
    } catch (e) { /* fail silently */ }
  }

  // ✅ v4.1: Fire prefetch IMMEDIATELY (don't wait for DOMContentLoaded)
  // This runs in parallel with HTML/CSS/font parsing — saves 200-500ms.
  if (typeof window !== 'undefined') {
    prefetchAll();
  }

  return {
    CONFIG,
    getBaseUrl,
    setBaseUrl,
    isConfigured,
    clearCache,
    invalidateStoreInfo,
    getProducts,
    getProduct,
    getProductStock,
    getCategories,
    getStoreInfo,
    getDeliveryCharges,
    getGlobalControls,
    healthCheck,
    placeOrder,
    getOrdersByPhone,
    deleteOrder,
    archiveCompletedOrders,
    updateOrderStatus,
    onDataRefresh,
    prefetchAll,
  };
})();
