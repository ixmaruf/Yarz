/* YARZ API TURBO v2.0 — Event Bridge + Mutation Invalidation */
(function () {
  'use strict';
  if (!window.TURBO) console.warn('[API-TURBO] turbo-core.js not loaded');
  function waitForApi(cb, tries) {
    tries = tries || 0;
    var api = window.api || window.YARZ_API || window.API;
    if (!api && typeof YARZ_API !== 'undefined') api = YARZ_API;
    if (api) { try { if (!window.YARZ_API) window.YARZ_API = api; } catch (e) {} return cb(api); }
    if (tries > 50) { console.warn('[API-TURBO] window.api not found'); return cb(null); }
    setTimeout(function () { waitForApi(cb, tries + 1); }, 50);
  }
  waitForApi(function (api) {
    if (!api) return;
    var mutationMethods = ['placeOrder','createOrder','cancelOrder','updateOrder','updateOrderStatus','deleteOrder','submitReview','applyCoupon'];
    function getInvalidationKey(methodName) {
      if (methodName === 'applyCoupon') return null;
      if (methodName.indexOf('Order') !== -1) return 'orders*';
      if (methodName.indexOf('Review') !== -1) return 'reviews*';
      return null;
    }
    mutationMethods.forEach(function (methodName) {
      var original = api[methodName];
      if (typeof original !== 'function') return;
      api[methodName] = function () {
        var args = arguments; var self = api;
        try {
          var result = original.apply(self, args);
          var invalKey = getInvalidationKey(methodName);
          if (result && typeof result.then === 'function') {
            return result.then(function (val) { if (invalKey && window.TURBO) window.TURBO.invalidate(invalKey); return val; });
          }
          if (invalKey && window.TURBO) window.TURBO.invalidate(invalKey);
          return result;
        } catch (e) { throw e; }
      };
    });
    if (window.TURBO && typeof window.TURBO.on === 'function') {
      window.TURBO.on('update', function (data) {
        window.dispatchEvent(new CustomEvent('yarz:data-updated', { detail: { key: data.key, source: 'turbo', value: data.value } }));
      });
    }
    console.log('[API-TURBO] bridge active');
  });
})();
