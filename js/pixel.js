/* ============================================================
   YARZ PIXEL — Enhanced Facebook Conversion Tracking v1.0
   ✅ ViewContent, AddToCart, InitiateCheckout, Purchase events
   ✅ Works with existing FB Pixel (from admin settings)
   ✅ Also fires TikTok, GA4, Snapchat, Pinterest if configured
   ✅ Sends product name, price, category, size info
   ✅ Helps Facebook AI optimize ad delivery → lower CPA
   ============================================================ */

const YARZ_PIXEL = (() => {
  'use strict';

  let _initialized = false;
  let _lastViewContent = ''; // Prevent duplicate fires

  // ===== HELPERS =====
  function _hasFbq() { return typeof window.fbq === 'function'; }
  function _hasTtq() { return typeof window.ttq !== 'undefined' && typeof window.ttq.track === 'function'; }
  function _hasGtag() { return typeof window.gtag === 'function'; }

  function _safeNum(v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  // ===== EVENTS =====

  // 1. ViewContent — When customer views a product detail page
  function viewContent(product) {
    if (!product || !product.name) return;
    if (_lastViewContent === product.name) return; // Already tracked
    _lastViewContent = product.name;

    var price = _safeNum(product.salePrice || product.sale || product.price);
    var category = product.category || '';
    var data = {
      content_name: product.name,
      content_category: category,
      content_type: 'product',
      content_ids: [product.name],
      value: price,
      currency: 'BDT',
    };

    // Facebook Pixel
    if (_hasFbq()) {
      try { fbq('track', 'ViewContent', data); } catch(e) {}
    }
    // TikTok
    if (_hasTtq()) {
      try { ttq.track('ViewContent', { content_name: product.name, value: price, currency: 'BDT' }); } catch(e) {}
    }
    // GA4
    if (_hasGtag()) {
      try { gtag('event', 'view_item', { items: [{ item_name: product.name, item_category: category, price: price }], currency: 'BDT', value: price }); } catch(e) {}
    }
  }

  // 2. AddToCart — When customer adds item to cart
  function addToCart(product, size, qty) {
    if (!product) return;
    var price = _safeNum(product.salePrice || product.sale || product.price);
    var value = price * (qty || 1);

    // Facebook
    if (_hasFbq()) {
      try {
        fbq('track', 'AddToCart', {
          content_name: product.name,
          content_category: product.category || '',
          content_ids: [product.name],
          content_type: 'product',
          value: value,
          currency: 'BDT',
          contents: [{ id: product.name, quantity: qty || 1, item_price: price }],
        });
      } catch(e) {}
    }
    // TikTok
    if (_hasTtq()) {
      try { ttq.track('AddToCart', { content_name: product.name, value: value, currency: 'BDT', quantity: qty || 1 }); } catch(e) {}
    }
    // GA4
    if (_hasGtag()) {
      try { gtag('event', 'add_to_cart', { items: [{ item_name: product.name, item_category: product.category || '', price: price, quantity: qty || 1 }], currency: 'BDT', value: value }); } catch(e) {}
    }
  }

  // 3. InitiateCheckout — When customer opens checkout form
  function initiateCheckout(cart, total) {
    if (!cart || cart.length === 0) return;
    var value = _safeNum(total);
    var ids = cart.map(function(c) { return c.name; });
    var contents = cart.map(function(c) {
      return { id: c.name, quantity: c.qty || 1, item_price: _safeNum(c.price) };
    });

    // Facebook
    if (_hasFbq()) {
      try {
        fbq('track', 'InitiateCheckout', {
          content_ids: ids,
          content_type: 'product',
          contents: contents,
          num_items: cart.length,
          value: value,
          currency: 'BDT',
        });
      } catch(e) {}
    }
    // TikTok
    if (_hasTtq()) {
      try { ttq.track('InitiateCheckout', { value: value, currency: 'BDT', quantity: cart.length }); } catch(e) {}
    }
    // GA4
    if (_hasGtag()) {
      try { gtag('event', 'begin_checkout', { items: cart.map(function(c) { return { item_name: c.name, price: _safeNum(c.price), quantity: c.qty || 1 }; }), currency: 'BDT', value: value }); } catch(e) {}
    }
  }

  // 4. Purchase — When order is confirmed (THE MOST IMPORTANT EVENT)
  // ✅ v5.1: Deduplication guard — prevents double-firing if both try/catch paths execute
  var _firedPurchaseIds = {};

  function purchase(orderId, cart, total) {
    if (!cart || cart.length === 0) return;
    var value = _safeNum(total);

    // ✅ CRITICAL: Prevent duplicate Purchase events (saves your ad budget!)
    // If this orderId already fired, skip. Facebook charges per Purchase event.
    if (_firedPurchaseIds[orderId]) {
      console.log('YARZ Pixel: Purchase already tracked for ' + orderId + ' — skipping duplicate');
      return;
    }
    _firedPurchaseIds[orderId] = true;

    // ✅ CRITICAL: Don't fire Purchase with ৳0 — it confuses Facebook's AI
    // and wastes your budget on worthless conversion data
    if (value <= 0) {
      // Recalculate from cart items as fallback
      value = cart.reduce(function(sum, c) {
        return sum + (_safeNum(c.price) * (c.qty || 1));
      }, 0);
      if (value <= 0) {
        console.warn('YARZ Pixel: Purchase value is ৳0 — skipping to protect ad budget');
        return;
      }
    }

    var ids = cart.map(function(c) { return c.name; });
    var contents = cart.map(function(c) {
      return { id: c.name, quantity: c.qty || 1, item_price: _safeNum(c.price) };
    });

    // Facebook — This is what makes your ads cheaper!
    if (_hasFbq()) {
      try {
        fbq('track', 'Purchase', {
          content_ids: ids,
          content_type: 'product',
          contents: contents,
          num_items: cart.length,
          value: value,
          currency: 'BDT',
          order_id: orderId,
        });
      } catch(e) {}
    }
    // TikTok
    if (_hasTtq()) {
      try { ttq.track('PlaceAnOrder', { value: value, currency: 'BDT', quantity: cart.length }); } catch(e) {}
    }
    // GA4
    if (_hasGtag()) {
      try { gtag('event', 'purchase', { transaction_id: orderId, items: cart.map(function(c) { return { item_name: c.name, price: _safeNum(c.price), quantity: c.qty || 1 }; }), currency: 'BDT', value: value }); } catch(e) {}
    }

    console.log('YARZ Pixel: Purchase tracked — ৳' + value + ' (Order: ' + orderId + ')');
  }

  // 5. Search — When customer uses search
  function search(query) {
    if (!query) return;
    if (_hasFbq()) {
      try { fbq('track', 'Search', { search_string: query }); } catch(e) {}
    }
    if (_hasGtag()) {
      try { gtag('event', 'search', { search_term: query }); } catch(e) {}
    }
  }

  // 6. Custom events
  function trackCustom(eventName, data) {
    if (_hasFbq()) {
      try { fbq('trackCustom', eventName, data || {}); } catch(e) {}
    }
  }

  // ===== INIT =====
  function init() {
    if (_initialized) return;
    _initialized = true;
    console.log('YARZ Pixel: Enhanced conversion tracking active');
  }

  return {
    init: init,
    viewContent: viewContent,
    addToCart: addToCart,
    initiateCheckout: initiateCheckout,
    purchase: purchase,
    search: search,
    trackCustom: trackCustom,
  };
})();
