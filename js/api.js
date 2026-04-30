/* ============================================================
   YARZ — API Layer v2.0
   Connects to Google Apps Script Web App
   API URL is hardcoded — no manual setup needed
   ============================================================ */

const YARZ_API = (() => {
  // ===== CONFIGURATION =====
  // Apps Script Web App URL — hardcoded for auto-connection
  const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw3XtZttsgmE_Vfm2pBWdGotKgFiI5684lm2b3Ew-mFOqxoNCRy6QzLmETER-mDEa2N/exec';
  const GOOGLE_API_KEY = 'AIzaSyC2WUoTmJ_nwxZ0gV8BkE0UGgZoEfwyQ5k';
  const SHEET_ID = '1wQz5OQZAtISTD1FdSEs_j9-p0e-BHwYjmjN7PR9hA-Q';

  const CONFIG = {
    API_KEY: GOOGLE_API_KEY,
    BASE_URL: APPS_SCRIPT_URL, // Always use hardcoded URL for auto-connection
    CACHE_TTL: 30 * 1000, // 30 seconds — fast refresh for admin changes
    STALE_TTL: 3 * 60 * 1000, // 3 minutes — serve stale while revalidating
  };

  // ===== CACHE =====
  const cache = {};

  function getBaseUrl() {
    return localStorage.getItem('yarz_api_url') || APPS_SCRIPT_URL;
  }

  function setBaseUrl(url) {
    // Keep for compatibility but doesn't affect actual API calls
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
          return { data: item.data, fresh: false }; // stale but usable
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

  // ===== Background revalidation queue (prevents duplicate fetches) =====
  const _revalidating = {};

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
    const cached = getCached(cacheKey, true); // allow stale

    // If fresh cache exists, return immediately
    if (cached && cached.fresh) return cached.data;

    // If stale cache exists, return it but revalidate in background
    if (cached && !cached.fresh) {
      // Background revalidate (fire-and-forget)
      if (!_revalidating[cacheKey]) {
        _revalidating[cacheKey] = true;
        _fetchFromNetwork(url.toString(), cacheKey).finally(() => {
          delete _revalidating[cacheKey];
        });
      }
      return cached.data;
    }

    // No cache at all — fetch from network
    return _fetchFromNetwork(url.toString(), cacheKey);
  }

  async function _fetchFromNetwork(urlStr, cacheKey) {
    try {
      // Add cache-buster to avoid browser HTTP cache
      const bustUrl = urlStr + (urlStr.includes('?') ? '&' : '?') + '_t=' + Date.now();
      const response = await fetch(bustUrl, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
      });
      const data = await response.json();
      if (data.success) {
        setCache(cacheKey, data);
        // Notify listeners that fresh data arrived (for UI refresh)
        _notifyRefresh(cacheKey, data);
      }
      return data;
    } catch (err) {
      console.error('YARZ API GET Error:', err);
      throw err;
    }
  }

  // ===== Refresh listeners for stale-while-revalidate =====
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
    return apiGet('categories');
  }

  async function getStoreInfo() {
    return apiGet('store_info');
  }

  async function healthCheck() {
    return apiGet('health');
  }

  async function placeOrder(orderData) {
    clearCache(); // Invalidate cache after order
    return apiPost('place_order', { order: orderData });
  }

  // Order tracking by phone number
  // NOTE: Apps Script must have 'orders_by_phone' action in doGet
  // See apps-script-additions.gs for the handler code
  async function getOrdersByPhone(phone) {
    try {
      return await apiGet('orders_by_phone', { phone });
    } catch (err) {
      console.warn('YARZ: orders_by_phone action not available in backend', err);
      // Fallback: return a user-friendly message
      return {
        success: false,
        message: 'Order tracking is temporarily unavailable. Please contact customer support.',
        fallback: true,
        orders: []
      };
    }
  }

  // Delete order
  async function deleteOrder(orderId) {
    clearCache();
    return await apiPost('deletewebsiteorder', { orderId });
  }

  // ===== GLOBAL CONTROLS (parsed from store_info) =====
  // Returns: { maintenanceMode, announcementActive, announcementText, storeStatus, paymentMethods }
  async function getGlobalControls() {
    try {
      const result = await getStoreInfo();
      if (!result.success || !result.store) return null;

      const s = result.store;

      // Helper: normalize key names from Apps Script format
      // Apps Script converts "Maintenance Mode" → "maintenance_mode"
      const get = (key) => {
        const normalized = key.toLowerCase().replace(/[\s()]+/g, '_');
        return s[normalized] !== undefined ? s[normalized] : '';
      };

      const maintenanceMode = String(get('maintenance_mode')).toLowerCase() === 'yes';
      const announcementActive = String(get('announcement_active')).toLowerCase() === 'yes';
      const announcementText = String(get('announcement_text') || '');
      const storeStatus = String(get('store_status') || 'open').toLowerCase();
      const paymentMethods = String(get('payment_methods') || 'COD, bKash, Nagad');
      const enableCOD = s['enable_cod'] !== 'false'; // defaults to true
      const zone1Name = String(get('zone_1_name') || 'Dhaka (Inside)');
      const zone2Name = String(get('zone_2_name') || 'Outside Dhaka');
      const zone1Charge = parseFloat(get('zone_1_charge')) || 60;
      const zone2Charge = parseFloat(get('zone_2_charge')) || 120;

      const socialLinks = {
        facebook: String(get('link_facebook') || get('facebook_page') || ''),
        instagram: String(get('link_instagram') || get('instagram') || ''),
        whatsapp: String(get('link_whatsapp') || get('whatsapp') || ''),
        tiktok: String(get('link_tiktok') || get('tiktok') || ''),
        messenger: String(get('link_messenger') || get('messenger') || '')
      };

      // Hero banners
      const heroBanners = [];
      for (let i = 1; i <= 5; i++) {
        // Try both formats: "hero_banner_1" and "hero_banner_ 1"
        const img = s['hero_banner_' + i] || s['hero_banner ' + i] || '';
        if (img) {
          heroBanners.push({
            image: img,
            title: s['banner_title_' + i] || s['banner_title ' + i] || '',
            link: s['banner_link_' + i] || s['banner_link ' + i] || '',
            subtitle: ''
          });
        }

        // Dynamic Sections
        if (s[`section_${i}_title`]) {
          dynamicSections.push({
            title: String(get(`section_${i}_title`) || ''),
            category: String(get(`section_${i}_category`) || ''),
            image: String(get(`section_${i}_image`) || ''),
            link: String(get(`section_${i}_link`) || '')
          });
        }
      }

      // Flash Sale
      const flashDate = String(get('flash_date') || '');
      const flashTitle = String(get('flash_title') || 'Flash Sale');

      // Currency
      const currency = String(get('currency') || '৳');

      // B2B Wholesale Mode
      const b2bMode = String(get('b2b_mode')).toLowerCase() === 'true';

      // Promotional Popup
      const promoPopupActive = String(get('promo_popup_active')).toLowerCase() === 'true';
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
        heroBanners,
        dynamicSections,
        socialLinks,
        flashDate,
        flashTitle,
        currency,
        b2bMode,
        promoPopupActive,
        promoPopupImage,
        promoPopupLink,
        raw: s  // full store object — used by injectSEOAndTracking
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
    onDataRefresh,
  };
})();
