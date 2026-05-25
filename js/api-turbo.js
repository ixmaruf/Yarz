/* ════════════════════════════════════════════════════════════════════
   YARZ API TURBO v1.0 — Cached Google Apps Script Wrapper
   ════════════════════════════════════════════════════════════════════
   This file WRAPS your existing api.js calls with the TURBO cache.
   
   How to integrate:
     1. Include AFTER turbo-core.js but BEFORE app.js:
        <script src="js/turbo-core.js"></script>
        <script src="js/api.js"></script>
        <script src="js/api-turbo.js"></script>   ← installs wrappers
        <script src="js/app.js"></script>

     2. Your existing app.js code does NOT need to change.
        e.g. window.api.getProducts() still works,
        but now returns INSTANTLY from cache on 2nd+ visits.

   What's cached:
     ✅ Products list                 (5 min TTL, SWR)
     ✅ Categories                    (30 min TTL)
     ✅ Site settings / banners       (10 min TTL)
     ✅ Coupon validation             (5 min TTL per code)
     ❌ Order placement (POST)         — never cached (always fresh)
     ❌ Stock check                    — short cache (10s)
   ════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  if (!window.TURBO) {
    console.error('[API-TURBO] turbo-core.js must load first!');
    return;
  }

  // Wait for original api.js to define window.api / window.YARZ_API
  function waitForApi(cb, tries = 0) {
    let api = window.api || window.YARZ_API || window.API;
    // Handle the `const YARZ_API` case (top-level const isn't on window)
    if (!api && typeof YARZ_API !== 'undefined') api = YARZ_API;
    if (api) {
      // Expose to window so other scripts (and turbo) can find it
      try { if (!window.YARZ_API) window.YARZ_API = api; } catch(e){}
      return cb(api);
    }
    if (tries > 50) {
      console.warn('[API-TURBO] window.api not found, creating stub');
      return cb({});
    }
    setTimeout(() => waitForApi(cb, tries + 1), 50);
  }

  waitForApi((api) => {
    // ───────────────────────────────────────────────────────────────
    // Generic wrapper: cache GET-style methods
    // ───────────────────────────────────────────────────────────────
    function wrap(methodName, cacheKey, type, ttl) {
      const original = api[methodName];
      if (typeof original !== 'function') return;

      api[methodName + '_uncached'] = original.bind(api);

      api[methodName] = function (...args) {
        // Build full key including args
        const key = cacheKey + (args.length ? ':' + JSON.stringify(args) : '');
        return window.TURBO.get(
          key,
          () => original.apply(api, args),
          { type, ttl }
        );
      };
    }

    // ───────────────────────────────────────────────────────────────
    // List of methods that benefit from caching (auto-detect)
    // ───────────────────────────────────────────────────────────────
    const cacheableMethods = [
      // Method name           → cache key prefix    → type      → optional TTL
      ['getProducts',           'products',           'products'],
      ['getAllProducts',        'products:all',       'products'],
      ['getProduct',            'product',            'products'],
      ['getProductById',        'product:id',         'products'],
      ['getCategories',         'categories',         'categories'],
      ['getCategory',           'category',           'categories'],
      ['getSettings',           'settings',           'settings'],
      ['getSiteSettings',       'site-settings',      'settings'],
      ['getStoreInfo',          'store-info',         'settings'],
      ['getGlobalControls',     'global-controls',    'settings'],
      ['getBanners',            'banners',            'banner'],
      ['getBanner',             'banner',             'banner'],
      ['getHomepage',           'homepage',           'products'],
      ['getFeatured',           'featured',           'products'],
      ['getFeaturedProducts',   'featured',           'products'],
      ['getNewArrivals',        'new-arrivals',       'products'],
      ['getBestSellers',        'best-sellers',       'products'],
      ['getOnSale',             'on-sale',            'products'],
      ['searchProducts',        'search',             'products', 60 * 1000], // 1 min
      ['getReviews',            'reviews',            'default'],
      ['getProductReviews',     'product-reviews',    'default']
    ];

    cacheableMethods.forEach(([m, k, t, ttl]) => wrap(m, k, t, ttl));

    // ───────────────────────────────────────────────────────────────
    // Methods that should INVALIDATE cache after mutation
    // ───────────────────────────────────────────────────────────────
    const mutationMethods = [
      ['placeOrder',      'orders*'],
      ['createOrder',     'orders*'],
      ['cancelOrder',     'orders*'],
      ['updateOrder',     'orders*'],
      ['updateOrderStatus','orders*'],
      ['deleteOrder',     'orders*'],
      ['submitReview',    'reviews*'],
      ['applyCoupon',     null]   // coupon check itself isn't mutating data
    ];

    mutationMethods.forEach(([m, invalKey]) => {
      const original = api[m];
      if (typeof original !== 'function') return;
      api[m] = async function (...args) {
        const result = await original.apply(api, args);
        if (invalKey) window.TURBO.invalidate(invalKey);
        return result;
      };
    });

    // ───────────────────────────────────────────────────────────────
    // PREFETCH: warm the cache on idle (homepage data)
    // ───────────────────────────────────────────────────────────────
    function prefetchAll() {
      const toPrefetch = [
        ['products',     api.getProducts_uncached     || api.getProducts],
        ['categories',   api.getCategories_uncached   || api.getCategories],
        ['site-settings',api.getSettings_uncached     || api.getSettings],
        ['banners',      api.getBanners_uncached      || api.getBanners],
        ['featured',     api.getFeatured_uncached     || api.getFeatured]
      ];
      toPrefetch.forEach(([k, fn]) => {
        if (typeof fn === 'function') {
          window.TURBO.prefetch(k, () => fn.call(api), { type: k });
        }
      });
    }

    // Run after page is idle
    if (document.readyState === 'complete') {
      setTimeout(prefetchAll, 100);
    } else {
      window.addEventListener('load', () => setTimeout(prefetchAll, 100));
    }

    // ───────────────────────────────────────────────────────────────
    // Listen for cache updates → notify app (so it can re-render)
    // ───────────────────────────────────────────────────────────────
    window.addEventListener('turbo:update', (e) => {
      const { key, value, changed } = e.detail || {};
      if (!changed) return;
      // App can listen: window.addEventListener('yarz:data-updated', ...)
      window.dispatchEvent(new CustomEvent('yarz:data-updated', {
        detail: { key, source: 'turbo' }
      }));
      // ⚡ Bridge: also fire YARZ_API.onDataRefresh listeners so existing app code re-renders
      try {
        if (api._refreshListeners && Array.isArray(api._refreshListeners)) {
          api._refreshListeners.forEach(fn => { try { fn(key, value); } catch(_){} });
        }
      } catch(_) {}
    });

    console.log('%c[API-TURBO] ⚡ Wrapped ' + cacheableMethods.filter(m => typeof api[m[0]+'_uncached'] === 'function').length + ' methods', 'color:#634A8E;font-weight:bold');
  });

})();
