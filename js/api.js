/* ============================================================
   YARZ — API Layer v3.2 (FIXED — All Loading Issues Resolved)
   ✅ Normalizes Apps Script response format (data.data → data)
   ✅ Stale-while-revalidate for instant page loads
   ✅ Order status update support
   ✅ Order delete via GET fallback
   ============================================================ */

const YARZ_API = (() => {
  // ===== CONFIGURATION =====
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxJCbvqQRZa9j-u_WOJzF6Iy_YMzhYb2EMXT8Z90LU8GZNs505-a7M5kTafb5OSzXDf/exec';
  const GOOGLE_API_KEY = 'AIzaSyApMtjj2baO6u19AvppjLtJ1GT1G61qo9k';
  const SHEET_ID = '1wQz5OQZAtISTD1FdSEs_j9-p0e-BHwYjmjN7PR9hA-Q';

  const CONFIG = {
    API_KEY: GOOGLE_API_KEY,
    BASE_URL: APPS_SCRIPT_URL,
    // Store/global settings must propagate quickly (delivery-charge manager target: ~10s)
    CACHE_TTL: 10 * 1000,
    STALE_TTL: 60 * 1000,
  };

  const DEFAULT_SOCIAL_LINKS = {
    facebook: 'https://www.facebook.com/Yarzbd',
    instagram: 'https://www.instagram.com/yarz_bd',
    whatsapp: 'https://wa.me/8801601743670',
    tiktok: 'https://tiktok.com/@yarzbd',
    messenger: 'https://m.me/Yarzbd',
    youtube: '',
    twitter: ''
  };

  const cache = {};

  function getBaseUrl() {
    return localStorage.getItem('yarz_api_url') || APPS_SCRIPT_URL;
  }

  function setBaseUrl(url) {
    localStorage.setItem('yarz_api_url', url);
  }

  function isConfigured() {
    return !!getBaseUrl();
  }

  function getCached(key, allowStale) {
    try {
      const lsKey = 'yarz_api_cache_' + key.split('action=')[1];
      const itemStr = localStorage.getItem(lsKey);
      if (itemStr) {
        const item = JSON.parse(itemStr);
        const age = Date.now() - item.time;
        if (age <= CONFIG.CACHE_TTL) {
          return { data: item.data, fresh: true };
        } else if (allowStale && age <= CONFIG.STALE_TTL) {
          return { data: item.data, fresh: false };
        } else {
          localStorage.removeItem(lsKey);
        }
      }
    } catch (e) { }
    return null;
  }

  function setCache(key, data) {
    try {
      const lsKey = 'yarz_api_cache_' + key.split('action=')[1];
      localStorage.setItem(lsKey, JSON.stringify({ data, time: Date.now() }));
    } catch (e) { }
  }

  function clearCache() {
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
  async function apiGet(action, params = {}) {
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
    const cached = getCached(cacheKey, true);

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

  async function _fetchFromNetwork(action, urlStr, cacheKey) {
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

      if (data.success) {
        setCache(cacheKey, data);
        _notifyRefresh(cacheKey, data);
      }
      return data;
    } catch (err) {
      console.error('YARZ API GET Error:', err);
      throw err;
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
      console.error('YARZ API POST Error:', err);
      throw err;
    }
  }

  // ===== PUBLIC API METHODS =====
  async function getProducts(category, search) {
    return apiGet('products', { category, search });
  }

  async function getProduct(name) {
    return apiGet('product', { name });
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

  async function healthCheck() {
    return apiGet('health');
  }

  async function placeOrder(orderData) {
    clearCache();
    return apiPost('place_order', { order: orderData });
  }

  async function getOrdersByPhone(phone) {
    try {
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
      const enableCOD = s['enable_cod'] !== 'false';
      const zone1Name = String(get('zone_1_name') || 'Dhaka (Inside)');
      const zone2Name = String(get('zone_2_name') || 'Outside Dhaka');
      const zone1Charge = parseFloat(get('zone_1_charge')) || 60;
      const zone2Charge = parseFloat(get('zone_2_charge')) || 120;

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
    getGlobalControls,
    healthCheck,
    placeOrder,
    getOrdersByPhone,
    deleteOrder,
    updateOrderStatus,
    onDataRefresh,
  };
})();
