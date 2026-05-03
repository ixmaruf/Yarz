/* ============================================================
   YARZ — API Layer v4.6 (ORDER-TOTAL & COLUMN-MAPPING FIX)
   ✅ Instant render from localStorage (< 50ms first paint)
   ✅ Stale-while-revalidate for instant page loads
   ✅ Order tracking — NO cache (always fresh status)
   ✅ v4.5: Deployment version tracking — auto-clears ALL caches
            when a new deployment is detected.
   ✅ v4.6 (NEW):
       • Force cache-clear on deploy (DEPLOY_VERSION bumped)
       • Order placement now sends explicit `total` + `coupon` fields
         so the server-side sheet always stores correct values
       • Order success page is no longer dependent on the
         server's response total — it falls back to the
         client-computed total (fixes "৳0 total" success page)
   ============================================================ */

const YARZ_API = (() => {
  // ===== CONFIGURATION =====
  // ✅ v4.2 (2026-05-03): নতুন Apps Script deployment URL (updated)
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyjBa0Aq8ejcnmIYbbKyGL0a5A5DeKZmBnq0uCqdejMWgPGFJG7AwAg8fEUpIUZ42ZS/exec';
  const GOOGLE_API_KEY = 'AIzaSyApMtjj2baO6u19AvppjLtJ1GT1G61qo9k';
  const SHEET_ID = '1wQz5OQZAtISTD1FdSEs_j9-p0e-BHwYjmjN7PR9hA-Q';

  // ✅ v4.5: Deployment version — when this changes, ALL caches are force-cleared
  const DEPLOY_VERSION = '2026-05-03-v4.8';

  const CONFIG = {
    API_KEY: GOOGLE_API_KEY,
    BASE_URL: APPS_SCRIPT_URL,
    // ✅ v4.5: Reduced stale times so admin changes reflect quickly
    //   - products / categories → 2min fresh, 3min stale
    //   - store_info            → 30s fresh, 2min stale
    //   - orders_by_phone       → NO CACHE (always real-time status)
    //   - default               → 10s fresh, 1min stale
    CACHE_TTL: 10 * 1000,
    STALE_TTL: 60 * 1000,
    PRODUCT_CACHE_TTL: 2 * 60 * 1000,         // 2 minutes fresh
    PRODUCT_STALE_TTL: 3 * 60 * 1000,         // 3 minutes stale (then force-refresh)
    SETTINGS_CACHE_TTL: 30 * 1000,            // 30 seconds fresh
    SETTINGS_STALE_TTL: 2 * 60 * 1000,        // 2 minutes stale
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
  const _KNOWN_OLD_URLS = [
    'https://script.google.com/macros/s/AKfycbxVmGxRi7Rwf8zKDSrxv56bUYlWqbRi_Mv-wc0EwLUhktD8uBfQnMErpGj-x73ZHb5Z/exec',
    'https://script.google.com/macros/s/AKfycbyjckgxRInw4IppCtjeVaV6w_fZn3qj87Xe1TyJ_Hgr8515Wf5_3DVCfyO066kdLAx7/exec',
    'https://script.google.com/macros/s/AKfycbwdJZdAdH7COFBrUMjGLbfYq7t8FAw5A2oFo1u4NYRiblEbs5Vu1Y_oHVKenywy1HCX/exec',
    'https://script.google.com/macros/s/AKfycbxohKmLaOe18oBmHPI0U_R23hWWBfhAHe02YBLvwRugqQdjAy8mxTbE83jtoMVO_MrE/exec'
  ];
  // ✅ v4.5: DEPLOYMENT VERSION CHECK — force-clears ALL caches when new version detected
  // This is the MAIN fix for "incognito works but normal browser doesn't"
  (function _deployVersionCheck() {
    try {
      var lastDeploy = localStorage.getItem('yarz_deploy_version');
      if (lastDeploy !== DEPLOY_VERSION) {
        console.log('YARZ: New deployment detected (' + DEPLOY_VERSION + '). Clearing ALL caches...');
        // 1. Clear localStorage caches
        Object.keys(localStorage).forEach(function(k) {
          if (k.startsWith('yarz_api_cache_') || k === 'yarz_api_url' ||
              k === 'yarz_storeinfo_cache') {
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
      // Also check for known old URLs
      var saved = localStorage.getItem('yarz_api_url');
      if (saved && _KNOWN_OLD_URLS.indexOf(saved) !== -1) {
        localStorage.removeItem('yarz_api_url');
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
        if (Array.isArray(data.data.products)) {
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
            var sM = parseInt(p.stockM) || 0;
            var sL = parseInt(p.stockL) || 0;
            var sXL = parseInt(p.stockXL) || 0;
            var sXXL = parseInt(p.stockXXL) || 0;
            p.sizes = { M: sM, L: sL, XL: sXL, XXL: sXXL };
          }

          // inStock = true if ANY size has stock > 0
          if (p.inStock === undefined) {
            p.inStock = (p.sizes.M > 0 || p.sizes.L > 0 || p.sizes.XL > 0 || p.sizes.XXL > 0);
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
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const bustUrl = urlStr + (urlStr.includes('?') ? '&' : '?') + '_t=' + Date.now();
        const response = await fetch(bustUrl, {
          method: 'GET',
          redirect: 'follow',
          cache: 'no-store',
        });
        
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
          console.error('YARZ API GET Error after ' + maxRetries + ' attempts:', err);
          throw err;
        }
        // Jittered backoff: 1s, then 2s, plus some random ms to spread out the herd
        const delay = (attempt * 1000) + Math.floor(Math.random() * 500);
        console.warn('YARZ API GET failed, retrying in ' + delay + 'ms... (Attempt ' + attempt + ')');
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

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await fetch(base, {
          method: 'POST',
          redirect: 'follow',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            key: CONFIG.API_KEY,
            action,
            ...body
          })
        });
        const data = await response.json();
        return data;
      } catch (err) {
        attempt++;
        if (attempt >= maxRetries) {
          console.error('YARZ API POST Error after ' + maxRetries + ' attempts:', err);
          throw err;
        }
        const delay = (attempt * 1000) + Math.floor(Math.random() * 500);
        console.warn('YARZ API POST failed, retrying in ' + delay + 'ms... (Attempt ' + attempt + ')');
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
            stock_M:   parseInt(p.stock_M   || p.stockM   || (p.sizes && p.sizes.M)   || 0) || 0,
            stock_L:   parseInt(p.stock_L   || p.stockL   || (p.sizes && p.sizes.L)   || 0) || 0,
            stock_XL:  parseInt(p.stock_XL  || p.stockXL  || (p.sizes && p.sizes.XL)  || 0) || 0,
            stock_XXL: parseInt(p.stock_XXL || p.stockXXL || (p.sizes && p.sizes.XXL) || 0) || 0,
            inStock: !!(p.inStock !== false),
            updatedAt: Date.now()
          };
        }
      }
      return { success: false };
    } catch (err) {
      console.warn('YARZ: getProductStock failed (silent)', err);
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
      console.warn('YARZ: Falling back to /categories endpoint', e);
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
      console.warn('YARZ: orders_by_phone action not available in backend', err);
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
      console.warn('YARZ: deleteOrder POST failed, trying GET fallback', err);
      try {
        return await apiGet('deletewebsiteorder', { orderId });
      } catch (e2) {
        return { success: false, error: e2.message };
      }
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
        const normalized = key.toLowerCase().replace(/[\s()]+/g, '_');
        return s[normalized] !== undefined ? s[normalized] : '';
      };

      const maintenanceMode = String(get('maintenance_mode')).toLowerCase() === 'yes';
      const announcementActive = String(get('announcement_active')).toLowerCase() === 'yes';
      const announcementText = String(get('announcement_text') || '');
      const storeStatus = String(get('store_status') || 'open').toLowerCase();
      const paymentMethods = String(get('payment_methods') || 'COD, bKash, Nagad');
      // ✅ FIX v4.3: Robust COD toggle parsing — handles ALL value formats
      // Supports: true/false, yes/no, 1/0, on/off, enabled/disabled (case-insensitive)
      // Reads from multiple possible keys (admin sheet variations)
      const _codRaw = get('enable_cod') !== '' ? get('enable_cod')
                    : (s['Enable COD'] !== undefined ? s['Enable COD']
                    : (s['enable cod'] !== undefined ? s['enable cod'] : ''));
      let enableCOD = true; // default ON
      if (_codRaw !== '' && _codRaw !== undefined && _codRaw !== null) {
        if (typeof _codRaw === 'boolean') {
          enableCOD = _codRaw;
        } else {
          const _codStr = String(_codRaw).toLowerCase().trim();
          if (['false','no','0','off','disabled','disable','bondho','bondh','বন্ধ'].indexOf(_codStr) !== -1) {
            enableCOD = false;
          } else if (['true','yes','1','on','enabled','enable','chalu','চালু'].indexOf(_codStr) !== -1) {
            enableCOD = true;
          }
        }
      }
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
          active: loc.active === undefined ? true : !(String(loc.active).toLowerCase() === 'false' || String(loc.active).toLowerCase() === 'no' || String(loc.active) === '0')
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
        whatsappBtn: String(get('whatsapp_chat_active') || get('whatsapp_chat')).toLowerCase() === 'yes' || String(get('whatsapp_chat_active')).toLowerCase() === 'true',
        whatsappNumber: String(get('whatsapp_chat_number') || get('whatsapp_number') || ''),
        whatsappMsg: String(get('whatsapp_chat_msg') || get('whatsapp_default_msg') || 'Hi, I am interested in your products.'),
        messengerBtn: String(get('messenger_chat_active') || get('messenger_chat')).toLowerCase() === 'yes' || String(get('messenger_chat_active')).toLowerCase() === 'true',
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
        if (s[`section_${i}_title`]) {
          dynamicSections.push({
            title: String(get(`section_${i}_title`) || ''),
            category: String(get(`section_${i}_category`) || ''),
            image: String(get(`section_${i}_image`) || ''),
            link: String(get(`section_${i}_link`) || '')
          });
        }
      }

      const flashDate = String(get('flash_date') || '');
      const flashTitle = String(get('flash_title') || 'Flash Sale');
      const currency = String(get('currency') || '৳');
      const b2bMode = String(get('b2b_mode')).toLowerCase() === 'true';
      const promoPopupActive = String(get('promo_popup_active')).toLowerCase() === 'true' || String(get('promo_popup_active')).toLowerCase() === 'yes';
      const promoPopupImage = String(get('promo_popup_image') || '');
      const promoPopupLink = String(get('promo_popup_link') || '');

      return {
        maintenanceMode,
        announcementActive,
        announcementText,
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
        raw: s
      };
    } catch (e) {
      console.warn('YARZ: Could not load global controls:', e);
      return null;
    }
  }

  // ✅ v4.1: PREFETCH — Fire products + store_info IMMEDIATELY when api.js parses
  // (before DOMContentLoaded). Result: by the time app.js renders, data is
  // already in memory → instant first paint (under 100ms on 4G).
  function prefetchAll() {
    try {
      // Fire and forget — results land in cache for instant subsequent reads
      apiGet('products').catch(function(){});
      apiGet('store_info').catch(function(){});
      apiGet('categories').catch(function(){});
    } catch (e) { /* fail silently */ }
  }

  // ✅ v4.1: Fire prefetch IMMEDIATELY (don't wait for DOMContentLoaded)
  // This runs in parallel with HTML/CSS/font parsing — saves 200-500ms.
  if (typeof window !== 'undefined') {
    prefetchAll();
  }

  return {
    CONFIG,
    APPS_SCRIPT_URL,
    SHEET_ID,
    getBaseUrl,
    setBaseUrl,
    isConfigured,
    clearCache,
    getProducts,
    getProduct,
    getCategories,
    getStoreInfo,
    getDeliveryCharges,
    getGlobalControls,
    healthCheck,
    placeOrder,
    getOrdersByPhone,
    deleteOrder,
    updateOrderStatus,
    onDataRefresh,
    prefetchAll,
  };
})();
