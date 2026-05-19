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
  // ✅ v9.7: ViewContent dedup uses sessionStorage so it survives page refreshes.
  // Previously used a module-level variable that reset on every page load,
  // causing duplicate ViewContent fires when customers refresh product pages.
  function _isViewContentFired(name) {
    try {
      var key = 'yarz_vc_' + name;
      if (sessionStorage.getItem(key)) return true;
      sessionStorage.setItem(key, '1');
      return false;
    } catch(e) { return false; }
  }

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
    if (_isViewContentFired(product.name)) return; // Already tracked this session

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
  function initiateCheckout(cart, total, userData) {
    if (!cart || cart.length === 0) return;
    var value = _safeNum(total);
    var ids = cart.map(function(c) { return c.name; });
    var contents = cart.map(function(c) {
      return { id: c.name, quantity: c.qty || 1, item_price: _safeNum(c.price) };
    });

    var data = {
      content_ids: ids,
      content_type: 'product',
      contents: contents,
      num_items: cart.length,
      value: value,
      currency: 'BDT',
    };
    
    // Support Advanced Matching
    if(userData) {
      if(userData.email) data.em = userData.email;
      if(userData.phone) data.ph = userData.phone.replace(/[^\d]/g, "");
      if(userData.name) data.fn = userData.name;
    }

    // Facebook
    if (_hasFbq()) {
      try {
        fbq('track', 'InitiateCheckout', data);
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

  function purchase(orderId, cart, total, userData) {
    if (!cart || cart.length === 0) return;
    var value = _safeNum(total);

    // ✅ CRITICAL: Prevent duplicate Purchase events (saves your ad budget!)
    // If this orderId already fired, skip. Facebook charges per Purchase event.
    if (_firedPurchaseIds[orderId]) {
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
        return;
      }
    }

    var ids = cart.map(function(c) { return c.name; });
    var contents = cart.map(function(c) {
      return { id: c.name, quantity: c.qty || 1, item_price: _safeNum(c.price) };
    });

    var data = {
      content_ids: ids,
      content_type: 'product',
      contents: contents,
      num_items: cart.length,
      value: value,
      currency: 'BDT',
      order_id: orderId,
    };
    
    if(userData) {
      if(userData.email) data.em = userData.email;
      if(userData.phone) data.ph = userData.phone.replace(/[^\d]/g, "");
      if(userData.name) data.fn = userData.name;
    }

    // Facebook — This is what makes your ads cheaper!
    if (_hasFbq()) {
      try {
        fbq('track', 'Purchase', data, { eventID: orderId + '_browser' }); // ✅ CAPI deduplication key
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

    // Purchase tracked
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

  // ===== v5.3: NEW CUSTOM EVENTS FOR RETARGETING =====

  // 7. WhatsAppClick — When customer clicks WhatsApp button (highest intent signal!)
  // ✅ Helps build Custom Audience: "clicked WhatsApp" vs "didn't click"
  function whatsAppClick(product, size) {
    var data = {
      page_type: product ? 'product' : 'home',
      content_name: product ? (product.name || '') : '',
      content_category: product ? (product.category || '') : '',
      size: size || '',
      value: product ? (_safeNum(product.salePrice || product.sale || product.price)) : 0,
      currency: 'BDT',
    };

    if (_hasFbq()) {
      try { fbq('trackCustom', 'WhatsAppClick', data); } catch(e) {}
    }
    if (_hasTtq()) {
      try { ttq.track('ClickButton', { content_name: data.content_name || 'WhatsApp', value: data.value, currency: 'BDT' }); } catch(e) {}
    }
    if (_hasGtag()) {
      try { gtag('event', 'whatsapp_click', { item_name: data.content_name, item_category: data.content_category, value: data.value }); } catch(e) {}
    }
  }

  // 8. TimeOnPage_30s — Customer stayed 30+ seconds on product page (engaged!)
  // ✅ Retarget these users — they're interested but didn't buy
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
      duration_seconds: 30,
    };

    if (_hasFbq()) {
      try { fbq('trackCustom', 'TimeOnPage_30s', data); } catch(e) {}
    }
    if (_hasGtag()) {
      try { gtag('event', 'engaged_view', { item_name: data.content_name, engagement_time_msec: 30000 }); } catch(e) {}
    }
  }

  // 9. SizeSelected — Customer selected a size (purchase intent signal)
  var _lastSizeEvent = '';
  function sizeSelected(product, size) {
    if (!product || !size) return;
    var eventKey = product.name + '_' + size;
    if (_lastSizeEvent === eventKey) return;
    _lastSizeEvent = eventKey;

    var data = {
      content_name: product.name,
      content_category: product.category || '',
      size: size,
      value: _safeNum(product.salePrice || product.sale || product.price),
      currency: 'BDT',
    };

    if (_hasFbq()) {
      try { fbq('trackCustom', 'SizeSelected', data); } catch(e) {}
    }
    if (_hasGtag()) {
      try { gtag('event', 'select_item', { item_name: data.content_name, item_variant: size }); } catch(e) {}
    }
  }

  // ===== INIT =====
  function init(storeInfo) {
    if (_initialized) return;
    _initialized = true;
    
    // ✅ v10.12: Dynamically inject Facebook Pixel from Admin Panel
    if (storeInfo && storeInfo.fbPixel) {
      !function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window, document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      
      fbq('init', storeInfo.fbPixel);
      fbq('track', 'PageView');
      
      // ✅ v10.13: Global Time-on-Page Events (Competitor Parity)
      // Tracks user engagement sitewide at 25s, 60s, and 100s.
      setTimeout(function() { try { fbq('trackCustom', '25_sec_onpage'); } catch(e){} }, 25000);
      setTimeout(function() { try { fbq('trackCustom', '60_sec_onpage'); } catch(e){} }, 60000);
      setTimeout(function() { try { fbq('trackCustom', '100_sec_onpage'); } catch(e){} }, 100000);
      setTimeout(function() { try { fbq('trackCustom', '180_sec_onpage'); } catch(e){} }, 180000); // 3 mins
      setTimeout(function() { try { fbq('trackCustom', '300_sec_onpage'); } catch(e){} }, 300000); // 5 mins

      // ✅ v10.13: Button Click Tracker (Manual fallback for SubscribedButtonClick)
      document.addEventListener('click', function(e) {
        var btn = e.target.closest('button') || e.target.closest('a.btn');
        if (btn) {
          var btnText = (btn.innerText || btn.textContent || '').trim().substring(0, 50);
          if (btnText) {
            try {
              fbq('trackCustom', 'SubscribedButtonClick', {
                buttonText: btnText,
                buttonFeatures: btn.className || ''
              });
            } catch(err){}
          }
        }
      });
    }
  }

  return {
    init: init,
    viewContent: viewContent,
    addToCart: addToCart,
    initiateCheckout: initiateCheckout,
    purchase: purchase,
    search: search,
    trackCustom: trackCustom,
    whatsAppClick: whatsAppClick,
    timeOnPage: timeOnPage,
    sizeSelected: sizeSelected,
  };
})();
