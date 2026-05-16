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
  // ===== STATE =====
  const state = {
    products: [],
    categories: [],
    storeInfo: {},
    currentCategory: '',
    currentProduct: null,
    currentView: 'home', // home | product | tracking | profile | success
    currentSizeFilter: '',
    currentSort: 'default',
    cart: JSON.parse(localStorage.getItem('yarz_cart') || '[]'),
    user: JSON.parse(localStorage.getItem('yarz_user') || 'null'),
    loading: false,
    heroSlideIndex: 0,
    heroTimer: null,
  };

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

  function escHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ===== IMAGE URL PROCESSOR v5.3 — Full Resolution =====
  // ✅ Always returns ORIGINAL high-resolution image (no scaling, no compression)
  // ✅ Supports: imgbb, Google Drive, postimg, imgur, and ANY direct image link
  // ✅ Customer always sees crystal-clear product photos
  function getImgSrc(url) {
    if (!url) return '';
    url = String(url).trim();
    if (!url) return '';

    // Auto-prepend https:// if missing
    if (!url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('//')) {
      url = 'https://' + url;
    }

    // ── Direct image link (any common extension) → return as-is, FULL quality ──
    if (/\.(jpe?g|png|webp|avif|gif|bmp|svg)(\?.*)?$/i.test(url)) {
      return url;
    }

    // ── Google Drive → ORIGINAL-resolution direct image ──
    if (url.indexOf('drive.google.com') !== -1) {
      var m = url.match(/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
      if (m) return 'https://lh3.googleusercontent.com/d/' + m[1];
    }



    // ── ibb.co SHARE page (no extension) → direct i.ibb.co image ──
    // We can only guess the extension; webp users should paste the i.ibb.co
    // direct link instead. Falls back to .jpg which works for most uploads.
    var ibbMatch = url.match(/^https?:\/\/(?:www\.)?ibb\.co\/([a-zA-Z0-9]+)\/?$/i);
    if (ibbMatch) {
      return 'https://i.ibb.co/' + ibbMatch[1] + '/' + ibbMatch[1] + '.jpg';
    }

    // ── postimg.cc share page → direct image ──
    var postimgMatch = url.match(/^https?:\/\/postimg\.cc\/([a-zA-Z0-9]+)\/?$/i);
    if (postimgMatch) {
      return 'https://i.postimg.cc/' + postimgMatch[1] + '/image.jpg';
    }

    // ── imgur share page → direct image ──
    var imgurMatch = url.match(/^https?:\/\/(?:www\.)?imgur\.com\/([a-zA-Z0-9]+)\/?$/i);
    if (imgurMatch) {
      return 'https://i.imgur.com/' + imgurMatch[1] + '.jpg';
    }

    // ── Unknown URL → return untouched (let the browser try) ──
    return url;
  }

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  // ===== DYNAMIC DELIVERY LOCATIONS =====
  // Values are controlled from Admin Panel → Cart & Checkout and stored in the
  // Google Sheet DELIVERY_CHARGES tab. Fallback preserves the old Dhaka/Outside flow.
  function _truthyActive(v) {
    if (v === undefined || v === null || v === '') return true;
    var s = String(v).toLowerCase().trim();
    return !(s === 'false' || s === 'no' || s === '0' || s === 'off' || s === 'inactive');
  }

  function getDeliveryLocations() {
    var info = state.storeInfo || {};
    var locations = [];
    if (Array.isArray(info.deliveryLocations)) {
      locations = info.deliveryLocations;
    } else if (info.delivery_locations) {
      try { locations = JSON.parse(String(info.delivery_locations)); } catch (e) { locations = []; }
    }

    locations = (locations || []).map(function (loc, idx) {
      return {
        id: String(loc.id || loc.key || ('zone_' + (idx + 1))).trim(),
        name: String(loc.name || loc.location || '').trim(),
        charge: parseFloat(loc.charge || loc.fee || loc.deliveryCharge || 0) || 0,
        active: _truthyActive(loc.active)
      };
    }).filter(function (loc) { return loc.name && loc.active; });

    if (!locations.length) {
      // ✅ v3.8: Default zones → Narayanganj (Inside ৳70 / Outside ৳140)
      var z1Name = info.zone1Name || info.zone_1_name || 'Inside Narayanganj';
      var z2Name = info.zone2Name || info.zone_2_name || 'Outside Narayanganj';
      var z1Charge = parseFloat(info.zone1Charge || info.zone_1_charge || 70) || 70;
      var z2Charge = parseFloat(info.zone2Charge || info.zone_2_charge || 140) || 140;
      locations = [
        { id: 'inside_narayanganj',  name: z1Name, charge: z1Charge, active: true },
        { id: 'outside_narayanganj', name: z2Name, charge: z2Charge, active: true }
      ];
    }
    return locations;
  }

  function getDeliveryLocationById(id) {
    var locations = getDeliveryLocations();
    var wanted = String(id || '').trim();
    return locations.find(function (loc) { return String(loc.id) === wanted; }) || locations[0];
  }

  function getDeliveryCharge(locationId) {
    var loc = getDeliveryLocationById(locationId);
    return loc ? (parseFloat(loc.charge) || 0) : 0;
  }

  function calculateCartDeliveryCharge(locationId) {
    if (state.cart.length === 0) return 0;
    var locs = getDeliveryLocations();
    var locIndex = locs.findIndex(function(l) { return String(l.id) === String(locationId); });
    var defaultCharge = getDeliveryCharge(locationId);
    
    var deliveryCharge = state.cart.reduce(function(max, item) {
      var c = defaultCharge;
      if (locIndex === 0 && item.deliveryDhaka !== undefined && item.deliveryDhaka !== '') c = parseFloat(item.deliveryDhaka);
      else if (locIndex === 1 && item.deliveryOutside !== undefined && item.deliveryOutside !== '') c = parseFloat(item.deliveryOutside);
      return Math.max(max, c);
    }, 0);

    var subtotal = state.cart.reduce(function (sum, item) {
      return sum + (item.price * item.qty);
    }, 0);

    var freeShipAmt = 0;
    if (state.storeInfo) {
      freeShipAmt = parseFloat(state.storeInfo.freeShipAmt || state.storeInfo.free_ship_amt) || 0;
    }
    if (freeShipAmt > 0 && subtotal >= freeShipAmt) {
      deliveryCharge = 0;
    }
    
    return deliveryCharge;
  }

  function getDeliveryLocationName(locationId) {
    var loc = getDeliveryLocationById(locationId);
    // ✅ v3.8: Default → Inside Narayanganj
    return loc ? loc.name : 'Inside Narayanganj';
  }

  function saveCart() {
    try {
      localStorage.setItem('yarz_cart', JSON.stringify(state.cart));
    } catch(e) {
      console.warn('LocalStorage not available for cart', e);
    }
    updateCartCount();
  }

  function saveUser() {
    try {
      localStorage.setItem('yarz_user', JSON.stringify(state.user));
    } catch(e) {
      console.warn('LocalStorage not available for user', e);
    }
    updateUserUI();
  }

  function updateCartCount() {
    const count = state.cart.reduce((s, i) => s + i.qty, 0);
    const el = $('.cart-count');
    if (el) {
      el.textContent = count;
      el.classList.toggle('visible', count > 0);
    }
    // v5.1: Mobile Bottom Nav Badge
    const bnavBadge = $('#bnav-cart-badge');
    if (bnavBadge) {
      bnavBadge.textContent = count;
      bnavBadge.classList.toggle('has-items', count > 0);
    }
  }

  function updateUserUI() {
    const btn = $('#user-btn');
    if (!btn) return;
    if (state.user) {
      btn.title = state.user.name || state.user.phone || 'Profile';
    }
  }

  // ===== TOAST =====
  function showToast(msg, type) {
    type = type || 'success';
    const container = $('.toast-container');
    if (!container) return;
    const iconMap = {
      success: ICONS.check,
      error: ICONS.x,
      warning: ICONS.shield,
    };
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = '<span class="toast-icon">' + (iconMap[type] || iconMap.success) + '</span><span class="toast-msg">' + escHtml(msg) + '</span>';
    container.appendChild(toast);
    setTimeout(function () { toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; }, 2500);
    setTimeout(function () { toast.remove(); }, 3000);
  }

  // ======================================================================
  //  NAVIGATION — Show/Hide approach (fixes goHome destruction bug)
  // ======================================================================
  // #home-content is always in the DOM; when we switch views we
  // hide it and inject a dynamic view container (#dynamic-view).
  // goHome() simply hides #dynamic-view and shows #home-content.

  function ensureDynamicView() {
    var el = $('#dynamic-view');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dynamic-view';
      el.style.display = 'none';
      $('#main-content').appendChild(el);
    }
    return el;
  }

  function showView(viewName, html) {
    state.currentView = viewName;
    var home = $('#home-content');
    var dyn = ensureDynamicView();
    if (home) home.style.display = 'none';
    dyn.innerHTML = html;
    dyn.style.display = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // v5.1: Initialize sticky buy bar if viewing a product
    var stickyBar = $('#sticky-buy-bar');
    if (stickyBar) {
      if (viewName === 'product') {
        var p = state.currentProduct;
        var mainBtn = document.getElementById('add-to-cart-btn');
        if (p && mainBtn) {
          $('#sbb-name').textContent = p.name;
          $('#sbb-price').textContent = formatPrice(p.salePrice || p.sale || p.price);
          var oldPrice = $('#sbb-old-price');
          if (oldPrice) {
            oldPrice.textContent = (p.salePrice || p.sale) ? formatPrice(p.price) : '';
          }
          // Only enable buttons if in stock
          $$('.sbb-btn').forEach(btn => btn.disabled = !p.inStock);

          // Setup IntersectionObserver
          if (window._sbbObserver) window._sbbObserver.disconnect();
          window._sbbObserver = new IntersectionObserver(function(entries) {
            // Show sticky bar when main button is NOT intersecting (scrolled out of view)
            var isVis = !entries[0].isIntersecting;
            stickyBar.classList.toggle('visible', isVis);
            document.body.classList.toggle('has-sticky-bar', isVis);
          }, { threshold: 0 });
          window._sbbObserver.observe(mainBtn);
        }
      } else {
        // Hide and cleanup if not on product page
        stickyBar.classList.remove('visible');
        document.body.classList.remove('has-sticky-bar');
        if (window._sbbObserver) window._sbbObserver.disconnect();
      }
    }

    // v5.1: Update Bottom Nav Active State
    $$('.mobile-bottom-nav .bnav-item').forEach(el => el.classList.remove('active'));
    // We only have "Home" and "Category" as hashless navigation in bottom nav
    // Others are overlay (Cart) or external (Contact)
  }

  function goHome(e) {
    if (e) e.preventDefault();
    // v5.1: Update Bottom Nav Active State
    $$('.mobile-bottom-nav .bnav-item').forEach(el => el.classList.remove('active'));
    var homeBtn = $('.mobile-bottom-nav .bnav-item'); // First item is Home
    if (homeBtn) homeBtn.classList.add('active');

    // ✅ v4.1 CRITICAL FIX (BLANK SCREEN BUG):
    //   The previous version sometimes left #home-content hidden by inline style
    //   AND #dynamic-view hidden simultaneously → completely white page.
    //   This rewrite is wrapped in try/catch and uses "force-show" guarantees.
    try {
      // 1) Always clear the hash-route inline style first (hides home on hard reload)
      var hashStyle = document.getElementById('hash-route-style');
      if (hashStyle) hashStyle.textContent = '';

      // 2) Stop ANY background pollers / intervals that may belong to a previous view
      try { if (typeof _stopOrderPoll === 'function') _stopOrderPoll(); } catch (e) {}
      try { if (typeof _stopStockPoll === 'function') _stopStockPoll(); } catch (e) {}
      // ✅ v5.3: Clear 30s engagement timer
      if (window._timeOnPageTimer) { clearTimeout(window._timeOnPageTimer); window._timeOnPageTimer = null; }

      // 3) Reset state
      state.currentView = 'home';
      state.currentProduct = null;
      selectedSize = '';
      selectedQty = 1;

      // 4) Hide & empty dynamic view
      var dyn = document.getElementById('dynamic-view');
      if (dyn) {
        dyn.style.display = 'none';
        dyn.innerHTML = '';
      }

      // Cleanup sticky buy bar
      var stickyBar = $('#sticky-buy-bar');
      if (stickyBar) {
        stickyBar.classList.remove('visible');
        document.body.classList.remove('has-sticky-bar');
        if (window._sbbObserver) window._sbbObserver.disconnect();
      }

      // 5) FORCE-SHOW home content — use multiple methods to guarantee visibility
      var home = document.getElementById('home-content');
      if (home) {
        home.style.display = '';        // remove inline display:none
        home.style.visibility = 'visible';
        home.removeAttribute('hidden');
      } else {
        // Worst case: home-content was wiped — reload page so user sees something
        console.warn('YARZ: #home-content missing — reloading to recover.');
        window.location.reload();
        return;
      }

      // 6) Close mobile menu if open
      var mainNav = document.getElementById('main-nav');
      var hamburger = document.getElementById('hamburger');
      if (mainNav && mainNav.classList.contains('active')) {
        mainNav.classList.remove('active');
        if (hamburger) hamburger.classList.remove('active');
        document.body.style.overflow = '';
      }

      // 7) Reset category filter visually
      if (state.currentCategory !== '') {
        state.currentCategory = '';
        $$('.category-tab').forEach(function (t) { t.classList.remove('active'); });
        var allTab = $$('.category-tab')[0];
        if (allTab) allTab.classList.add('active');
      }

      // 8) Re-render products from state (NO API call — instant)
      var grid = document.getElementById('product-grid');
      if (state.products && state.products.length > 0) {
        updateFilterUI();
        applyFilters();
        if (state.storeInfo && Object.keys(state.storeInfo).length > 0) {
          var wrapper = document.getElementById('dynamic-sections-wrapper');
          if (wrapper) wrapper.style.display = '';
          var allSec = document.getElementById('all-products-section');
          if (allSec) allSec.style.display = '';
          renderDynamicSections(state.products, state.storeInfo);
        }
      } else if (!grid || !grid.children.length) {
        // No products yet — show skeleton + trigger reload from cache/network
        renderSkeletons('product-grid', 8);
        try {
          YARZ_API.getProducts().then(function (res) {
            if (res && res.success && res.products) {
              state.products = res.products;
              renderProducts(state.products);
              if (state.storeInfo && Object.keys(state.storeInfo).length > 0) {
                renderDynamicSections(state.products, state.storeInfo);
              }
            }
          }).catch(function () {});
        } catch (e) {}
      }

      // 9) Re-init hero slider (timer may have been lost)
      try { initHeroSlider(); } catch (e) {}

      // 10) Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // 11) Clean URL — drop any #product/... hash
      if (window.location.hash) {
        try { history.pushState(null, '', window.location.pathname + window.location.search); } catch (e) {}
      }
    } catch (err) {
      // Last-resort fallback: hard reload so customer never sees a white page
      console.error('YARZ goHome() error:', err);
      try {
        var h = document.getElementById('home-content');
        if (h) { h.style.display = ''; h.style.visibility = 'visible'; }
        var d = document.getElementById('dynamic-view');
        if (d) { d.style.display = 'none'; d.innerHTML = ''; }
      } catch (e2) {}
    }
  }

  // ===== MOBILE MENU TOGGLE =====
  function initMobileMenu() {
    var hamburger = $('#hamburger');
    var mainNav = $('#main-nav');

    if (!hamburger || !mainNav) return;

    function closeMenu() {
      hamburger.classList.remove('active');
      mainNav.classList.remove('active');
      document.body.style.overflow = '';
    }

    function toggleMenu() {
      hamburger.classList.toggle('active');
      mainNav.classList.toggle('active');
      document.body.style.overflow = mainNav.classList.contains('active') ? 'hidden' : '';
    }

    hamburger.onclick = toggleMenu;

    // Close menu when a nav link is clicked — use capture phase so it fires before link's own onclick
    mainNav.addEventListener('click', function (e) {
      var link = e.target.closest('a');
      if (link && !link.classList.contains('nav-dropdown-trigger')) {
        closeMenu();
      }
    }, true);

    // Mobile: toggle dropdown categories on tap
    var dropdownTrigger = $('.nav-dropdown-trigger');
    var dropdownDiv = $('#nav-categories-dropdown');
    if (dropdownTrigger && dropdownDiv) {
      dropdownTrigger.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (window.innerWidth <= 768) {
          dropdownDiv.classList.toggle('open');
        }
      });
    }

    // Close menu when clicking outside
    document.addEventListener('click', function (event) {
      if (!mainNav.classList.contains('active')) return;
      if (!hamburger.contains(event.target) && !mainNav.contains(event.target)) {
        closeMenu();    }
    });

    // Close menu on window resize (if resizing to larger screen)
    window.addEventListener('resize', function () {
      if (window.innerWidth > 768) {
        hamburger.classList.remove('active');
        mainNav.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }

  // ===== HERO SLIDER =====
  function initHeroSlider() {
    if (state.heroTimer) { clearInterval(state.heroTimer); state.heroTimer = null; }
    var slides = $$('.hero-slider .slide');
    var dots = $$('.slider-nav .slider-dot');
    if (!slides || slides.length <= 1) return;

    function showSlide(idx) {
      slides.forEach(function (s, i) { s.classList.toggle('active', i === idx); });
      dots.forEach(function (d, i) { d.classList.toggle('active', i === idx); });
      state.heroSlideIndex = idx;
    }

    function nextSlide() {
      showSlide((state.heroSlideIndex + 1) % slides.length);
    }

    function prevSlide() {
      showSlide((state.heroSlideIndex - 1 + slides.length) % slides.length);
    }

    state.heroTimer = setInterval(nextSlide, 2000);

    var prevBtn = $('.slider-arrow.prev');
    var nextBtn = $('.slider-arrow.next');
    if (prevBtn) prevBtn.onclick = function () { clearInterval(state.heroTimer); prevSlide(); state.heroTimer = setInterval(nextSlide, 2000); };
    if (nextBtn) nextBtn.onclick = function () { clearInterval(state.heroTimer); nextSlide(); state.heroTimer = setInterval(nextSlide, 2000); };

    dots.forEach(function (dot, i) {
      dot.onclick = function () { clearInterval(state.heroTimer); showSlide(i); state.heroTimer = setInterval(nextSlide, 2000); };
    });
  }

  function isPantCategory(cat) {
    if (!cat) return false;
    var c = cat.toLowerCase();
    return c.indexOf('pant') !== -1 || c.indexOf('jeans') !== -1 || c.indexOf('chinos') !== -1 || c.indexOf('trouser') !== -1 || c.indexOf('cargo') !== -1;
  }

  // ===== CLEAN URL SLUGIFY =====
  // Converts product name → clean URL slug
  // "Premium Panjabi - Royal Collection প্রিমিয়াম পাঞ্জাবি" → "premium-panjabi-royal-collection"
  function slugify(text) {
    if (!text) return '';
    return text
      .toString()
      .toLowerCase()
      .replace(/[\u0980-\u09FF]+/g, '')       // Remove Bengali characters
      .replace(/[\u0600-\u06FF]+/g, '')       // Remove Arabic characters
      .replace(/[^a-z0-9\s-]/g, '')           // Remove special chars
      .replace(/[\s_]+/g, '-')                // Spaces/underscores → hyphens
      .replace(/-+/g, '-')                    // Collapse multiple hyphens
      .replace(/^-+|-+$/g, '')                // Trim leading/trailing hyphens
      .substring(0, 80);                      // Max 80 chars for cleanliness
  }

  // Finds a product by slug OR by exact name (backward compatibility)
  function findProductBySlug(slugOrName) {
    if (!slugOrName || !state.products || !state.products.length) return null;
    // 1. Try exact name match first (backward compat with old encoded URLs)
    var decoded = '';
    try { decoded = decodeURIComponent(slugOrName); } catch(e) { decoded = slugOrName; }
    var exact = state.products.find(function(p) { return p.name === decoded; });
    if (exact) return exact;
    // 2. Try slug match
    var targetSlug = slugify(decoded) || decoded.toLowerCase();
    return state.products.find(function(p) { return slugify(p.name) === targetSlug; }) || null;
  }

  function getPantSizeLabel(size) {
    if (size === 'M') return '30';
    if (size === 'L') return '32';
    if (size === 'XL') return '34';
    if (size === 'XXL') return '36-38';
    return size;
  }

  // ===== BADGE CLASS =====
  function getBadgeClass(badge) {
    if (!badge) return '';
    var b = badge.toLowerCase();
    if (b.indexOf('new') >= 0) return 'new';
    if (b.indexOf('hot') >= 0) return 'hot';
    if (b.indexOf('best') >= 0) return 'best';
    if (b.indexOf('limited') >= 0) return 'limited';
    if (b.indexOf('trend') >= 0) return 'trending';
    if (b.indexOf('premium') >= 0) return 'premium';
    if (b.indexOf('sold out') >= 0) return 'soldout';
    if (b.indexOf('sale') >= 0 || b.indexOf('clearance') >= 0) return 'sale';
    return 'new';
  }

  // ===== RENDER PRODUCT CARD =====
  function renderProductCard(p) {
    var isOut = !p.inStock;
    var salePrice = parseFloat(p.salePrice) || 0;
    var regPrice = parseFloat(p.regularPrice) || 0;
    var hasDiscount = parseFloat(p.discountPercent) > 0 && regPrice > salePrice;
    var sizes = ['M', 'L', 'XL', 'XXL'];
    var safeName = escHtml(p.name).replace(/'/g, "\\'");

    var html = '<article class="product-card' + (isOut ? ' out-of-stock' : '') + '" onclick="YARZ.openProduct(\'' + safeName + '\')">';
    html += '<div class="card-image">';
    html += '<img src="' + escHtml(getImgSrc(p.image1)) + '" alt="' + escHtml(p.name) + '" loading="lazy" onerror="this.style.display=\'none\'">';
    if (p.badge) html += '<span class="product-badge ' + getBadgeClass(p.badge) + '">' + escHtml(p.badge) + '</span>';
    html += '</div>';
    html += '<div class="card-info">';
    html += '<div class="product-category">' + escHtml(p.category || '') + '</div>';
    html += '<div class="product-name">' + escHtml(p.name) + '</div>';
    html += '<div class="price-row">';
    html += '<span class="sale-price">' + formatPrice(salePrice) + '</span>';
    if (hasDiscount) html += '<span class="regular-price">' + formatPrice(regPrice) + '</span>';
    if (hasDiscount) html += '<span class="discount-tag">-' + Math.round(p.discountPercent) + '%</span>';
    html += '</div>';
    html += '<div class="card-sizes">';
    var isPant = isPantCategory(p.category);
    sizes.forEach(function (s) {
      var avail = p.sizes && p.sizes[s];
      var displaySize = isPant ? getPantSizeLabel(s) : s;
      html += '<span class="size-dot' + (avail ? ' available' : ' out') + '">' + displaySize + '</span>';
    });
    html += '</div></div></article>';
    return html;
  }

  // ===== RENDER PRODUCTS =====
  function renderProducts(products, containerId) {
    var container = document.getElementById(containerId || 'product-grid');
    if (!container) return;

    if (!products || products.length === 0) {
      container.innerHTML = '<div class="text-center text-muted" style="grid-column:1/-1;padding:48px 16px;">' +
        '<p style="font-size:14px;font-weight:500;">No products found</p>' +
        '<p style="font-size:12px;margin-top:4px;">কোনো প্রোডাক্ট পাওয়া যায়নি</p></div>';
      return;
    }
    container.innerHTML = products.map(renderProductCard).join('');
    // ✅ v5.0: Set animation delay index for staggered entrance
    var cards = container.querySelectorAll('.product-card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].style.setProperty('--card-index', i);
    }
  }

  // ✅ v5.0: Scroll progress indicator (thin purple line at top)
  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', function() {
      var scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
      var scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      var progress = scrollHeight > 0 ? (scrollTop / scrollHeight * 100) : 0;
      document.body.style.setProperty('--scroll-progress', progress + '%');
    }, { passive: true });
  }

  // ===== RENDER DYNAMIC SECTIONS =====
  // ✅ FIX v3.1: Zero-loading rendering for "আবার কালেকশন" / Featured Collection
  // - Caches the last rendered HTML hash to skip identical re-renders (prevents flicker)
  // - Uses requestAnimationFrame batching for smooth paint
  // - No skeleton flicker — only renders when data is actually different
  // - No skeleton flicker — only renders when data is actually different
  function renderDynamicSections(products, storeInfo) {
    var wrapper = $('#dynamic-sections-wrapper');
    var allProductsSec = $('#all-products-section');
    if (!wrapper || !storeInfo) return;

    var sections = [];
    for (var i = 1; i <= 50; i++) {
      var title = storeInfo['section_' + i + '_title'] || storeInfo['section_' + i + 'title'];
      var category = storeInfo['section_' + i + '_category'] || storeInfo['section_' + i + 'category'];
      var rawLink = storeInfo['section_' + i + '_link'] || storeInfo['section_' + i + 'link'];
      var linkArray = [];
      if (rawLink) {
        try { linkArray = JSON.parse(rawLink); if(!Array.isArray(linkArray)) linkArray = [rawLink]; }
        catch(e) { linkArray = [rawLink]; }
      }
      if (title) sections.push({ title: title, category: category, links: linkArray });
    }

    if (sections.length === 0) {
      wrapper.classList.add('is-empty');
      if (allProductsSec) allProductsSec.style.display = '';
      return;
    }
    wrapper.classList.remove('is-empty');

    var html = '';
    sections.forEach(function (sec, idx) {
      var secProducts = [];
      var validLinks = (sec.links || []).filter(function(l) { return l.trim() !== ''; });
      
      if (validLinks.length > 0) {
        var namesToMatch = validLinks.map(function(l) { return l.split('/').pop().replace(/-/g, ' ').toLowerCase().trim(); });
        secProducts = products.filter(function(p) {
          var pName = (p.name || '').toLowerCase().trim();
          return namesToMatch.some(function(n) { return pName === n || pName.indexOf(n) > -1; });
        });
      } else if (sec.category) {
        secProducts = products.filter(function(p) {
          return (p.category || '').trim().toLowerCase() === sec.category.trim().toLowerCase();
        });
      } else {
        secProducts = products.slice(0, 8);
      }

      if (secProducts.length === 0) return;

      html += '<section class="page-section" style="padding-top:32px;">';
      html += '<div class="container">';
      html += '<div class="section-heading">';
      html += '<h2>' + escHtml(sec.title) + '</h2>';
      if (sec.category) html += '<p>Explore ' + escHtml(sec.category) + '</p>';
      html += '<span class="line"></span>';
      html += '</div>';
      html += '<div class="product-grid">';
      html += secProducts.slice(0, 12).map(renderProductCard).join('');
      html += '</div></div></section>';
    });

    if (wrapper.innerHTML === html) {
      if (allProductsSec) allProductsSec.style.display = html ? 'none' : '';
      return;
    }

    if (window.requestAnimationFrame) {
      requestAnimationFrame(function () {
        wrapper.innerHTML = html;
        if (allProductsSec) allProductsSec.style.display = html ? 'none' : '';
      });
    } else {
      wrapper.innerHTML = html;
      if (allProductsSec) allProductsSec.style.display = html ? 'none' : '';
    }
  }

  // ✅ FIX v3.5: NO skeleton for builder/dynamic-sections by default.
  // Builder sections are admin-controlled — if admin hasn't added any sections,
  // showing a "loading" skeleton there confuses customers who think the site
  // is slow/hanging. Skeleton only renders if storeInfo already has section data
  // configured (so we know real content WILL appear).
  function renderDynamicSectionsSkeleton() {
    var wrapper = $('#dynamic-sections-wrapper');
    if (!wrapper) return;
    if (wrapper.innerHTML) return; // already populated, skip

    // Check if there are any builder sections configured in cached storeInfo
    var hasSections = false;
    try {
      var cachedInfo = state.storeInfo || {};
      // Also check localStorage cache for last-known storeInfo
      if (!cachedInfo || Object.keys(cachedInfo).length === 0) {
        var ls = localStorage.getItem('yarz_storeinfo_cache');
        if (ls) cachedInfo = JSON.parse(ls);
      }
      if (cachedInfo) {
        for (var i = 1; i <= 50; i++) {
          if (cachedInfo['section_' + i + '_title'] || cachedInfo['section_' + i + 'title']) {
            hasSections = true;
            break;
          }
        }
      }
    } catch (e) {}

    if (!hasSections) {
      // Mark wrapper as empty so CSS hides it completely (no loading flash)
      wrapper.classList.add('is-empty');
      wrapper.innerHTML = '';
      return;
    }

    // Builder sections ARE configured → render skeleton during data fetch
    wrapper.classList.remove('is-empty');
    var html = '<section class="page-section" style="padding-top:32px;">';
    html += '<div class="container">';
    html += '<div class="section-heading">';
    html += '<div class="skeleton" style="width:240px;height:28px;margin:0 auto 8px;"></div>';
    html += '<div class="skeleton" style="width:140px;height:14px;margin:0 auto;"></div>';
    html += '</div>';
    html += '<div class="product-grid">';
    for (var k = 0; k < 4; k++) {
      html += '<div class="product-card">' +
        '<div class="card-image"><div class="skeleton" style="width:100%;height:100%;position:absolute;inset:0"></div></div>' +
        '<div class="card-info">' +
        '<div class="skeleton" style="width:60px;height:10px;margin-bottom:6px"></div>' +
        '<div class="skeleton" style="width:100%;height:14px;margin-bottom:6px"></div>' +
        '<div class="skeleton" style="width:80px;height:16px"></div>' +
        '</div></div>';
    }
    html += '</div></div></section>';
    wrapper.innerHTML = html;
  }

  // ===== RENDER SKELETON =====
  function renderSkeletons(containerId, count) {
    count = count || 8;
    var container = document.getElementById(containerId || 'product-grid');
    if (!container) return;
    var html = '';
    for (var i = 0; i < count; i++) {
      html += '<div class="product-card">' +
        '<div class="card-image"><div class="skeleton" style="width:100%;height:100%;position:absolute;inset:0"></div></div>' +
        '<div class="card-info">' +
        '<div class="skeleton" style="width:60px;height:10px;margin-bottom:6px"></div>' +
        '<div class="skeleton" style="width:100%;height:14px;margin-bottom:6px"></div>' +
        '<div class="skeleton" style="width:80px;height:16px"></div>' +
        '</div></div>';
    }
    container.innerHTML = html;
  }

  // ===== RENDER CATEGORIES =====
  function renderCategories(categories) {
    var container = $('#category-tabs');
    if (!container) return;
    var html = '<button class="category-tab active" onclick="YARZ.filterCategory(\'\')">All</button>';
    categories.forEach(function (c) {
      html += '<button class="category-tab" onclick="YARZ.filterCategory(\'' + escHtml(c.name) + '\')">' + escHtml(c.name) + ' <span style="opacity:0.5;font-size:10px">(' + c.count + ')</span></button>';
    });
    container.innerHTML = html;

    // Also populate the header dropdown menu
    var dropdownMenu = $('#nav-categories-menu');
    if (dropdownMenu && categories.length > 0) {
      var dropHtml = '';
      categories.forEach(function (c) {
        var safeCat = escHtml(c.name).replace(/'/g, "\\'");
        dropHtml += '<a href="#" onclick="YARZ.filterCategory(\'' + safeCat + '\');return false;">' + escHtml(c.name) + '</a>';
      });
      dropdownMenu.innerHTML = dropHtml;
    }
  }

  function filterCategory(cat) {
    // Close mobile menu if open
    var mainNav = $('#main-nav');
    var hamburger = $('#hamburger');
    if (mainNav && mainNav.classList.contains('active')) {
      mainNav.classList.remove('active');
      hamburger.classList.remove('active');
      document.body.style.overflow = '';
    }

    // If not on home, go home first
    if (state.currentView !== 'home') {
      goHome();
    }
    
    // Update active tab
    $$('.category-tab').forEach(function (t) { t.classList.remove('active'); });
    $$('.category-tab').forEach(function (t) {
      var tabText = t.textContent.split('(')[0].trim();
      if ((cat === '' && tabText === 'All') || tabText === cat) t.classList.add('active');
    });

    var wrapper = $('#dynamic-sections-wrapper');
    var allProductsSec = $('#all-products-section');
    
    if (cat === '') {
      if (wrapper && wrapper.innerHTML) {
        wrapper.style.display = '';
        if (allProductsSec) allProductsSec.style.display = 'none';
      } else {
        if (allProductsSec) allProductsSec.style.display = '';
      }
      // Scroll to products area instead of top 0
      setTimeout(function() {
        var targetSec = (wrapper && wrapper.innerHTML && wrapper.style.display !== 'none') ? wrapper : allProductsSec;
        if (targetSec) {
          var headerOffset = 60;
          var elementPosition = targetSec.getBoundingClientRect().top;
          var offsetPosition = elementPosition + window.scrollY - headerOffset;
          window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
        }
      }, 50);
    } else {
      if (wrapper) wrapper.style.display = 'none';
      if (allProductsSec) allProductsSec.style.display = '';
      
      // Scroll to products section smoothly
      if (allProductsSec) {
        setTimeout(function() {
          var headerOffset = 60;
          var elementPosition = allProductsSec.getBoundingClientRect().top;
          var offsetPosition = elementPosition + window.scrollY - headerOffset;
          window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
        }, 50);
      }
    }

    updateFilterUI();
    applyFilters();
  }

  function updateFilterUI() {
    var cat = (state.currentCategory || '').trim().toLowerCase();
    
    var sizeContainer = document.querySelector('.size-filter-options');
    if (!sizeContainer) return;

    var html = '<label class="filter-radio" style="grid-column:1/-1;margin-bottom:8px;">' +
               '<input type="radio" name="filter_size" value="" checked onchange="YARZ.applyFilters()">' +
               '<span>All Sizes</span></label>';

    var showShirt = cat === '' || cat.indexOf('shirt') !== -1;
    var showPanjabi = cat === '' || cat.indexOf('panjabi') !== -1;
    var showPant = cat === '' || isPantCategory(cat);
    var showOther = cat !== '' && !showShirt && !showPanjabi && !showPant;

    if (showShirt) {
      html += '<div style="grid-column:1/-1;font-size:11px;font-weight:700;color:var(--brand);margin:16px 0 4px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #eee;padding-bottom:4px;">Shirt Sizes</div>';
      ['M','L','XL','XXL'].forEach(function(s) {
        html += '<label class="filter-radio"><input type="radio" name="filter_size" value="shirt_' + s + '" onchange="YARZ.applyFilters()"><span>' + s + '</span></label>';
      });
    }

    if (showPanjabi) {
      html += '<div style="grid-column:1/-1;font-size:11px;font-weight:700;color:var(--brand);margin:16px 0 4px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #eee;padding-bottom:4px;">Panjabi Sizes</div>';
      ['M','L','XL','XXL'].forEach(function(s) {
        html += '<label class="filter-radio"><input type="radio" name="filter_size" value="panjabi_' + s + '" onchange="YARZ.applyFilters()"><span>' + s + '</span></label>';
      });
    }

    if (showPant) {
      html += '<div style="grid-column:1/-1;font-size:11px;font-weight:700;color:var(--brand);margin:16px 0 4px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #eee;padding-bottom:4px;">Pant Sizes</div>';
      ['M','L','XL','XXL'].forEach(function(s) {
        html += '<label class="filter-radio"><input type="radio" name="filter_size" value="pant_' + s + '" onchange="YARZ.applyFilters()"><span>' + getPantSizeLabel(s) + '</span></label>';
      });
    }
    
    if (showOther) {
      html += '<div style="grid-column:1/-1;font-size:11px;font-weight:700;color:var(--brand);margin:16px 0 4px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #eee;padding-bottom:4px;">' + cat + ' Sizes</div>';
      ['M','L','XL','XXL'].forEach(function(s) {
        html += '<label class="filter-radio"><input type="radio" name="filter_size" value="other_' + s + '" onchange="YARZ.applyFilters()"><span>' + s + '</span></label>';
      });
    }

    // Keep current selected size if it exists
    var currentSize = state.currentSizeFilter;
    sizeContainer.innerHTML = html;
    
    if (currentSize) {
      var radio = sizeContainer.querySelector('input[value="' + currentSize + '"]');
      if (radio) radio.checked = true;
      else state.currentSizeFilter = ''; // Reset if not found in new options
    }
  }

  function applyFilters() {
    var cat = state.currentCategory || '';
    
    // 1. Filter by category
    var filtered = cat ? state.products.filter(function (p) {
      return (p.category || '').trim().toLowerCase() === cat.trim().toLowerCase();
    }) : state.products.slice();

    // 2. Filter by size
    var sizeFilter = document.querySelector('input[name="filter_size"]:checked');
    if (sizeFilter && sizeFilter.value) {
      state.currentSizeFilter = sizeFilter.value;
      var val = sizeFilter.value;
      
      if (val.indexOf('_') !== -1) {
        var parts = val.split('_');
        var type = parts[0];
        var s = parts[1];
        
        filtered = filtered.filter(function(p) {
          if (!p.sizes || !p.sizes[s] || p.sizes[s] === '0' || p.sizes[s] === 0 || p.sizes[s] === false) return false;
          var pc = (p.category || '').toLowerCase();
          if (type === 'shirt') return pc.indexOf('shirt') !== -1;
          if (type === 'panjabi') return pc.indexOf('panjabi') !== -1;
          if (type === 'pant') return isPantCategory(pc);
          return true; // for 'other'
        });
      } else {
        filtered = filtered.filter(function(p) {
          return p.sizes && p.sizes[val] && p.sizes[val] !== '0' && p.sizes[val] !== 0 && p.sizes[val] !== false;
        });
      }
    } else {
      state.currentSizeFilter = '';
    }

    // 3. Sort by price
    var sortFilter = document.querySelector('input[name="sort_price"]:checked');
    if (sortFilter && sortFilter.value) {
      state.currentSort = sortFilter.value;
      if (state.currentSort === 'low_high') {
        filtered.sort(function(a, b) {
          var priceA = parseFloat((a.salePrice || a.price || "0").toString().replace(/,/g, ''));
          var priceB = parseFloat((b.salePrice || b.price || "0").toString().replace(/,/g, ''));
          return priceA - priceB;
        });
      } else if (state.currentSort === 'high_low') {
        filtered.sort(function(a, b) {
          var priceA = parseFloat((a.salePrice || a.price || "0").toString().replace(/,/g, ''));
          var priceB = parseFloat((b.salePrice || b.price || "0").toString().replace(/,/g, ''));
          return priceB - priceA;
        });
      }
    } else {
      state.currentSort = 'default';
    }

    renderProducts(filtered);
  }

  function toggleFilterDrawer(show) {
    var drawer = document.getElementById('filter-drawer');
    var overlay = document.getElementById('filter-overlay');
    if (!drawer || !overlay) return;

    if (show) {
      drawer.classList.add('open');
      overlay.classList.add('active');
      document.body.classList.add('cart-open');
    } else {
      drawer.classList.remove('open');
      overlay.classList.remove('active');
      document.body.classList.remove('cart-open');
    }
  }

  function clearFilters() {
    state.currentSizeFilter = '';
    state.currentSort = 'default';
    
    var sortRadios = document.querySelectorAll('input[name="sort_price"]');
    if (sortRadios.length) sortRadios[0].checked = true;
    
    filterCategory('');
    toggleFilterDrawer(false);
  }

  // ===== PRODUCT DETAIL =====
  var selectedSize = '';
  var selectedQty = 1;

  // ✅ v4.2: Silent real-time stock cache (per-product)
  // Updated silently in background — customer never sees a loader
  var _liveStock = {};            // { productName: { M, L, XL, XXL, updatedAt } }
  var _stockFetchTimer = null;
  var _lastStockFetch  = 0;

  function _getEffectiveStock(product, size) {
    if (!product || !size) return 0;
    
    function parseStock(val) {
      if (val === undefined || val === null || val === '') return null;
      if (typeof val === 'boolean') return val ? 999 : 0;
      var num = parseInt(val);
      return isNaN(num) ? null : Math.max(0, num);
    }
    
    var live = _liveStock[product.name];
    if (live && (Date.now() - live.updatedAt) < 60000) {
      var l1 = parseStock(live['stock_' + size]);
      if (l1 !== null) return l1;
      var l2 = parseStock(live['stock' + size]);
      if (l2 !== null) return l2;
    }
    
    var p1 = parseStock(product['stock_' + size]);
    if (p1 !== null) return p1;
    var p2 = parseStock(product['stock' + size]);
    if (p2 !== null) return p2;
    if (product.sizes) {
      var p3 = parseStock(product.sizes[size]);
      if (p3 !== null) return p3;
    }
    return 0;
  }

  // Fetch live stock from Google Sheets in background — no UI blocking
  function _refreshLiveStock(product, opts) {
    if (!product || !product.name) return;
    if (!window.YARZ_API || !YARZ_API.getProductStock) return;
    var force = opts && opts.force;
    // Throttle: avoid hammering the API more than once every 8s unless forced
    if (!force && (Date.now() - _lastStockFetch) < 8000) return;
    _lastStockFetch = Date.now();

    YARZ_API.getProductStock(product.name).then(function (res) {
      if (!res || !res.success) return;
      _liveStock[product.name] = {
        stock_M:   res.stock_M,
        stock_L:   res.stock_L,
        stock_XL:  res.stock_XL,
        stock_XXL: res.stock_XXL,
        inStock:   res.inStock,
        updatedAt: Date.now()
      };
      // Sync into in-memory product so renderProducts() reflects new numbers
      product.stock_M   = res.stock_M;
      product.stock_L   = res.stock_L;
      product.stock_XL  = res.stock_XL;
      product.stock_XXL = res.stock_XXL;
      if (product.sizes) {
        product.sizes.M   = res.stock_M   > 0;
        product.sizes.L   = res.stock_L   > 0;
        product.sizes.XL  = res.stock_XL  > 0;
        product.sizes.XXL = res.stock_XXL > 0;
      }
      // If on product detail page, refresh disabled state of size buttons silently
      if (state.currentView === 'product' && state.currentProduct && state.currentProduct.name === product.name) {
        ['M','L','XL','XXL'].forEach(function (sz) {
          var btn = document.querySelector('#size-options .size-btn[data-size="'+sz+'"]');
          if (!btn) return;
          var avail = parseInt(res['stock_'+sz]) || 0;
          if (avail <= 0) btn.setAttribute('disabled','disabled');
          else btn.removeAttribute('disabled');
        });
        // If selected size now has fewer items than current qty, gently clamp
        if (selectedSize) {
          var newMax = parseInt(res['stock_'+selectedSize]) || 0;
          if (newMax > 0 && selectedQty > newMax) {
            selectedQty = newMax;
            var qv = $('#qty-value');
            if (qv) qv.textContent = selectedQty;
            showToast('স্টক আপডেট হয়েছে — সর্বোচ্চ ' + newMax + 'টি পাওয়া যাবে', 'warning');
          }
        }
      }
    }).catch(function () { /* silent */ });
  }

  function _startStockPoll(product) {
    _stopStockPoll();
    if (!product) return;
    // Initial silent fetch
    _refreshLiveStock(product, { force: true });
    // Re-check every 30s while customer is on the product page
    _stockFetchTimer = setInterval(function () {
      if (state.currentView !== 'product') { _stopStockPoll(); return; }
      _refreshLiveStock(product, { force: true });
    }, 30000);
  }

  function _stopStockPoll() {
    if (_stockFetchTimer) { clearInterval(_stockFetchTimer); _stockFetchTimer = null; }
  }

  function openProduct(name) {
    var product = state.products.find(function (p) { return p.name === name; });
    if (!product) return;

    state.currentProduct = product;
    selectedSize = '';
    selectedQty = 1;

    // ✅ v5.0: Facebook Pixel — ViewContent event
    if (window.YARZ_PIXEL) YARZ_PIXEL.viewContent(product);

    // ✅ v5.3: Start 30-second engagement timer for retargeting pixel
    if (window._timeOnPageTimer) clearTimeout(window._timeOnPageTimer);
    window._timeOnPageTimer = setTimeout(function() {
      if (state.currentView === 'product' && state.currentProduct && state.currentProduct.name === product.name) {
        if (window.YARZ_PIXEL) YARZ_PIXEL.timeOnPage(product);
      }
    }, 30000);

    // ✅ v4.2: Start silent live-stock polling (every 30s) — no loader shown
    _startStockPoll(product);

    // ✅ v5.4: Clean URL slug — short, professional, shareable
    var productSlug = slugify(product.name) || encodeURIComponent(product.name);
    var expectedHash = '#product/' + productSlug;
    if (window.location.hash !== expectedHash) {
      history.pushState(null, '', expectedHash);
    }

    var images = [product.image1, product.image2, product.image3, product.image4, product.image5, product.image6].filter(Boolean);
    var hasDiscount = parseFloat(product.discountPercent) > 0 && parseFloat(product.regularPrice) > parseFloat(product.salePrice);
    var sizes = ['M', 'L', 'XL', 'XXL'];
    var deliveryLocations = getDeliveryLocations();
    var safeName = escHtml(product.name).replace(/'/g, "\\'");
    var safeCat = escHtml(product.category || '').replace(/'/g, "\\'");

    var html = '<section class="product-detail-section"><div class="pd-grid">';

    // Gallery
    html += '<div class="pd-gallery">';
    html += '<div class="pd-main-image" id="pd-main-img"><img src="' + escHtml(getImgSrc(images[0])) + '" alt="' + escHtml(product.name) + '" id="pd-img-main"></div>';
    if (images.length > 1) {
      html += '<div class="pd-thumbnails">';
      images.forEach(function (img, i) {
        html += '<div class="pd-thumb' + (i === 0 ? ' active' : '') + '" onclick="YARZ.switchImage(' + i + ',\'' + escHtml(getImgSrc(img)).replace(/'/g, "\\'") + '\')"><img src="' + escHtml(getImgSrc(img)) + '" alt=""></div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // Info
    html += '<div class="pd-info">';
    html += '<div class="pd-breadcrumb"><a href="#" onclick="YARZ.goHome();return false;">Home</a><span> / </span><a href="#" onclick="YARZ.filterCategory(\'' + safeCat + '\');return false;">' + escHtml(product.category || '') + '</a><span> / </span>' + escHtml(product.name) + '</div>';
    html += '<h1 class="pd-title">' + escHtml(product.name) + '</h1>';
    html += '<div class="pd-category">' + escHtml(product.category || '');
    if (product.fabric) html += ' &middot; ' + escHtml(product.fabric);
    html += '</div>';
    html += '<div class="pd-price-row">';
    html += '<span class="pd-sale-price">' + formatPrice(product.salePrice) + '</span>';
    if (hasDiscount) html += '<span class="pd-regular-price">' + formatPrice(product.regularPrice) + '</span>';
    if (hasDiscount) html += '<span class="pd-discount">-' + Math.round(product.discountPercent) + '% OFF</span>';
    html += '</div>';

    if (product.couponActive === 'Yes' && product.couponCode && parseFloat(product.couponDisc) > 0) {
      html += '<div style="margin-top:16px;background:linear-gradient(135deg, rgba(99,74,142,0.1), rgba(78,58,114,0.05));border:1px dashed var(--brand);border-radius:8px;padding:12px;display:flex;align-items:center;gap:12px;justify-content:space-between;">' +
              '<div style="display:flex;align-items:center;gap:8px;">' +
              '<div style="width:32px;height:32px;background:var(--brand);border-radius:50%;color:white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(99,74,142,0.3);">🎁</div>' +
              '<div><div style="font-size:12px;font-weight:700;color:var(--brand);text-transform:uppercase;letter-spacing:0.5px;">Extra ' + product.couponDisc + '% OFF</div>' +
              '<div style="font-size:11px;color:var(--text-muted);font-family:var(--font-bengali);margin-top:2px;">অতিরিক্ত ডিসকাউন্ট পেতে কোডটি ব্যবহার করুন</div></div></div>' +
              '<div style="background:white;border:1px dashed rgba(99,74,142,0.4);padding:6px 12px;border-radius:6px;font-family:monospace;font-weight:700;color:var(--ink-1);letter-spacing:1px;font-size:13px;user-select:all;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 4px rgba(0,0,0,0.02);" onclick="navigator.clipboard.writeText(\'' + escHtml(product.couponCode) + '\');YARZ.showToast(\'কুপন কোড কপি করা হয়েছে!\',\'success\');" onmouseover="this.style.background=\'var(--surface-1)\'" onmouseout="this.style.background=\'white\'">' + escHtml(product.couponCode) + '</div>' +
              '</div>';
    }
    if (product.description) {
      var descText = escHtml(product.description);
      var isLong = descText.length > 150 || (descText.match(/\n/g) || []).length >= 2;
      html += '<div class="pd-description-container" style="margin-top:16px; margin-bottom:16px;">';
      html += '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em;">Description</div>';
      if (isLong) {
        html += '<div id="pd-desc-text" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-line; font-size: 14px; color: var(--text-secondary); line-height: 1.6; transition: all 0.3s ease;">' + descText + '</div>';
        html += '<button onclick="YARZ.toggleDescription(this)" style="background:none; border:none; color:var(--brand); font-size:13px; font-weight:600; padding:0; margin-top:8px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">Read More <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition:transform 0.3s"><path d="m6 9 6 6 6-6"/></svg></button>';
      } else {
        html += '<div style="white-space: pre-line; font-size: 14px; color: var(--text-secondary); line-height: 1.6;">' + descText + '</div>';
      }
      html += '</div>';
    }

    // Sizes
    html += '<div class="pd-sizes"><div class="label">Size</div><div class="size-options" id="size-options">';
    var isPant = isPantCategory(product.category);
    sizes.forEach(function (s) {
      var disabled = !product.sizes || !product.sizes[s];
      var displaySize = isPant ? getPantSizeLabel(s) : s;
      html += '<button class="size-btn" data-size="' + s + '"' + (disabled ? ' disabled' : '') + ' onclick="YARZ.selectSize(\'' + s + '\')">' + displaySize + '</button>';
    });
    html += '</div></div>';

    // Size chart
    if (product.sizeChart) {
      html += '<details style="margin-top:12px;border:1px solid var(--border-light);border-radius:6px;padding:12px;">';
      html += '<summary style="font-size:12px;font-weight:600;cursor:pointer;color:var(--text-secondary);">Size Chart</summary>';
      html += '<div style="margin-top:8px;font-size:12px;color:var(--text-secondary);white-space:pre-line;">' + escHtml(product.sizeChart) + '</div>';
      html += '</details>';
    }

    // Quantity
    html += '<div class="pd-qty"><div class="label">Quantity</div><div class="qty-controls">';
    html += '<button class="qty-btn" onclick="YARZ.changeQty(-1)">' + ICONS.minus + '</button>';
    html += '<div class="qty-value" id="qty-value">1</div>';
    html += '<button class="qty-btn" onclick="YARZ.changeQty(1)">' + ICONS.plus + '</button>';
    html += '</div></div>';

    // Actions
    html += '<div class="pd-actions">';
    var cartBtnText = product.inStock ? (state.addCartText || 'Add to Cart') : 'Out of Stock';
    html += '<button class="btn btn-primary btn-lg" onclick="YARZ.addToCart()" id="add-to-cart-btn"' + (!product.inStock ? ' disabled' : '') + '>' + escHtml(cartBtnText) + '</button>';
    html += '<button class="btn btn-outline btn-lg" onclick="YARZ.buyNow()" id="buy-now-btn"' + (!product.inStock ? ' disabled' : '') + '>Buy Now</button>';
    html += '</div>';

    // Stock Urgency Bar
    if (state.stockBar && product.inStock) {
      var totalStock = (product.sizes ? Object.values(product.sizes).reduce(function(s, v) { return s + (parseInt(v) || 0); }, 0) : 0);
      if (totalStock > 0 && totalStock <= 20) {
        var urgencyPct = Math.min(100, Math.max(10, (totalStock / 20) * 100));
        var urgencyColor = totalStock <= 5 ? '#EF4444' : totalStock <= 10 ? '#F59E0B' : '#22C55E';
        html += '<div style="margin-top:12px;padding:10px 14px;background:rgba(239,68,68,0.06);border-radius:10px;border:1px solid rgba(239,68,68,0.12);">';
        html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span style="font-size:12px;font-weight:600;color:' + urgencyColor + ';">⚡ Only ' + totalStock + ' items left!</span></div>';
        html += '<div style="height:4px;background:#E5E7EB;border-radius:4px;overflow:hidden;"><div style="height:100%;width:' + urgencyPct + '%;background:' + urgencyColor + ';border-radius:4px;transition:width 0.5s;"></div></div>';
        html += '</div>';
      }
    }

    // Max Qty hint
    if (state.maxQty > 0) {
      html += '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:center;">সর্বোচ্চ ' + state.maxQty + 'টি অর্ডার করা যাবে</div>';
    }

    var deliveryText = deliveryLocations.map(function (loc, idx) {
      var charge = parseFloat(loc.charge) || 0;
      if (idx === 0 && product.deliveryDhaka !== undefined && product.deliveryDhaka !== '') charge = parseFloat(product.deliveryDhaka);
      else if (idx === 1 && product.deliveryOutside !== undefined && product.deliveryOutside !== '') charge = parseFloat(product.deliveryOutside);
      return escHtml(loc.name) + ': ' + formatPrice(charge);
    }).join(' &middot; ');

    // Delivery info
    html += '<div class="pd-delivery-info">';
    html += '<div class="pd-delivery-row">' + ICONS.truck + '<span>' + deliveryText + '</span></div>';
    // Expected Delivery from admin or product-level
    var expDeliveryMsg = state.expDelivery || (product.deliveryDays ? product.deliveryDays + ' delivery' : '2-3 days delivery');
    html += '<div class="pd-delivery-row">' + ICONS.package + '<span>' + escHtml(expDeliveryMsg) + '</span></div>';
    html += '<div class="pd-delivery-row">' + ICONS.refresh + '<span>7 days easy return policy</span></div>';
    html += '<div class="pd-delivery-row">' + ICONS.shield + '<span>Cash on Delivery available</span></div>';
    html += '</div>';

    html += '</div></div></section>';

    // Related Products section
    if (state.relatedProd && product.category) {
      var related = state.products.filter(function(p) {
        return p.category === product.category && p.name !== product.name && p.status === 'Active';
      }).slice(0, 8);
      if (related.length > 0) {
        html += '<section style="padding:24px 16px 32px;max-width:600px;margin:0 auto;">';
        html += '<div style="font-size:15px;font-weight:700;margin-bottom:14px;color:var(--ink-1);font-family:var(--font-bengali);">আপনার পছন্দ হতে পারে</div>';
        html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;">';
        related.forEach(function(rp) {
          var rpImg = getImgSrc(rp.img1 || rp.image);
          var rpPrice = rp.sale || rp.salePrice || rp.price || 0;
          html += '<div onclick="YARZ.openProduct(\'' + escHtml(rp.name).replace(/'/g, "\\'") + '\')" style="cursor:pointer;background:#fff;border-radius:12px;overflow:hidden;border:1px solid var(--border-light);transition:transform 0.2s;" ontouchstart="this.style.transform=\'scale(0.97)\'" ontouchend="this.style.transform=\'scale(1)\'">';
          html += '<img src="' + escHtml(rpImg) + '" alt="' + escHtml(rp.name) + '" style="width:100%;aspect-ratio:1;object-fit:cover;" loading="lazy" onerror="this.style.display=\'none\'">';
          html += '<div style="padding:8px 10px;">';
          html += '<div style="font-size:12px;font-weight:600;color:var(--ink-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(rp.name) + '</div>';
          html += '<div style="font-size:13px;font-weight:700;color:var(--brand);margin-top:4px;">' + formatPrice(rpPrice) + '</div>';
          html += '</div></div>';
        });
        html += '</div></section>';
      }
    }

    showView('product', html);
  }

  function toggleDescription(btn) {
    var desc = document.getElementById('pd-desc-text');
    var svg = btn.querySelector('svg');
    if (!desc) return;
    
    if (desc.style.webkitLineClamp === '2') {
      desc.style.webkitLineClamp = 'unset';
      btn.innerHTML = 'Show Less <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(180deg);transition:transform 0.3s"><path d="m6 9 6 6 6-6"/></svg>';
    } else {
      desc.style.webkitLineClamp = '2';
      btn.innerHTML = 'Read More <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition:transform 0.3s"><path d="m6 9 6 6 6-6"/></svg>';
    }
  }

  function selectSize(s) {
    selectedSize = s;
    $$('#size-options .size-btn').forEach(function (btn) {
      btn.classList.toggle('selected', btn.dataset.size === s);
    });
    // ✅ v5.3: Fire SizeSelected pixel event for retargeting
    if (window.YARZ_PIXEL && state.currentProduct) {
      YARZ_PIXEL.sizeSelected(state.currentProduct, s);
    }
    // ✅ v4.2: Use effective (live or cached) stock + trigger silent refresh
    var p = state.currentProduct;
    if (p) {
      _refreshLiveStock(p); // silent background refresh
      var maxStock = _getEffectiveStock(p, s);
      if (maxStock <= 0) {
        showToast('দুঃখিত! এই সাইজটি বর্তমানে স্টকে নেই।', 'warning');
        selectedQty = 1;
        var el2 = $('#qty-value'); if (el2) el2.textContent = '1';
        return;
      }
      if (selectedQty > maxStock) {
        selectedQty = maxStock;
        var el = $('#qty-value');
        if (el) el.textContent = selectedQty;
        showToast('স্টক সীমিত! সর্বোচ্চ ' + maxStock + 'টি পাওয়া যাবে।', 'warning');
      }
    }
  }

  function changeQty(delta) {
    var p = state.currentProduct;
    var maxStock = 10; // Default max

    if (p && selectedSize) {
      // ✅ v4.2: Always check the freshest known stock (live > cache)
      maxStock = _getEffectiveStock(p, selectedSize);
      // Kick off a silent background refresh on every + click for super-fresh data
      if (delta > 0) _refreshLiveStock(p);
    }

    var newQty = selectedQty + delta;

    if (newQty < 1) newQty = 1;
    // ✅ v5.2: Admin max qty limit
    if (state.maxQty > 0 && newQty > state.maxQty) {
      showToast('সর্বোচ্চ ' + state.maxQty + 'টি অর্ডার করা যাবে।', 'warning');
      newQty = state.maxQty;
    }
    if (newQty > maxStock && maxStock > 0) {
      showToast('স্টক সীমিত! সর্বোচ্চ ' + maxStock + 'টি পাওয়া যাবে।', 'warning');
      newQty = maxStock;
    }
    if (maxStock <= 0 && selectedSize) {
      showToast('এই সাইজটি স্টকে নেই।', 'warning');
      newQty = 1;
    }

    selectedQty = newQty;
    var el = $('#qty-value');
    if (el) el.textContent = selectedQty;
  }

  function switchImage(idx, src) {
    var img = $('#pd-img-main');
    if (img) img.src = src;
    $$('.pd-thumb').forEach(function (t, i) { t.classList.toggle('active', i === idx); });
  }

  // ===== CART =====
  function addToCart(product, size, qty) {
    var p = product || state.currentProduct;
    var s = size || selectedSize;
    var q = qty || selectedQty;

    if (!p) return;
    if (!s) { showToast('Please select a size', 'warning'); return; }

    // ✅ v4.2: Final live-stock guard before adding to cart
    var maxStock = _getEffectiveStock(p, s);
    if (maxStock <= 0) {
      showToast('দুঃখিত! এই সাইজটি স্টকে নেই।', 'warning');
      _refreshLiveStock(p, { force: true });
      return;
    }
    var key = p.name + '_' + s;
    var existing = state.cart.find(function (i) { return i.key === key; });
    var totalAfterAdd = (existing ? existing.qty : 0) + q;
    if (totalAfterAdd > maxStock) {
      showToast('স্টক সীমিত! সর্বোচ্চ ' + maxStock + 'টি পাওয়া যাবে।', 'warning');
      _refreshLiveStock(p, { force: true });
      return;
    }

    if (existing) {
      existing.qty += q;
    } else {
      state.cart.push({
        key: key,
        name: p.name,
        size: s,
        qty: q,
        price: parseFloat(p.salePrice) || 0,
        image: p.image1 || '',
        category: p.category || '',
        // ✅ v3.8: Default location IDs → Narayanganj-based
        deliveryDhaka: parseFloat(p.deliveryDhaka) || getDeliveryCharge('inside_narayanganj'),
        deliveryOutside: parseFloat(p.deliveryOutside) || getDeliveryCharge('outside_narayanganj'),
        couponActive: p.couponActive || 'No',
        couponCode: p.couponCode || '',
        couponDisc: parseFloat(p.couponDisc) || 0,
      });
    }

    saveCart();
    showToast(p.name + ' (' + s + ') added to cart');
    renderCartDrawer();

    // ✅ v5.0: Facebook Pixel — AddToCart event
    if (window.YARZ_PIXEL) YARZ_PIXEL.addToCart(p, s, q);
  }

  function removeFromCart(key) {
    state.cart = state.cart.filter(function (i) { return i.key !== key; });
    saveCart();
    renderCartDrawer();
  }

  function updateCartItemQty(key, delta) {
    var item = state.cart.find(function (i) { return i.key === key; });
    if (!item) return;
    item.qty = Math.max(1, item.qty + delta);
    saveCart();
    renderCartDrawer();
  }

  function getCartTotal() {
    return state.cart.reduce(function (sum, i) { return sum + (i.price * i.qty); }, 0);
  }

  function renderCartDrawer() {
    var body = $('#cart-body');
    if (!body) return;

    var cartHtml = '';
    if (state.cart.length === 0) {
      cartHtml = '<div class="cart-empty">' +
        '<div style="width:48px;height:48px;margin:0 auto 12px;opacity:0.3">' + ICONS.cart + '</div>' +
        '<p>Your cart is empty</p>' +
        '<p style="font-size:11px;margin-top:4px;color:var(--text-light)">Browse products and add items</p></div>';
    } else {
      cartHtml = state.cart.map(function (item) {
        var safeKey = escHtml(item.key).replace(/'/g, "\\'");
        return '<div class="cart-item">' +
          '<div class="cart-item-img"><img src="' + escHtml(getImgSrc(item.image)) + '" alt="" onerror="this.style.display=\'none\'"></div>' +
          '<div class="cart-item-info">' +
          '<div class="cart-item-name">' + escHtml(item.name) + '</div>' +
          '<div class="cart-item-meta">Size: ' + item.size + ' &middot; Qty: ' + item.qty + '</div>' +
          '<div class="cart-item-price">' + formatPrice(item.price * item.qty) + '</div>' +
          '<div class="cart-item-remove" onclick="YARZ.removeFromCart(\'' + safeKey + '\')">Remove</div>' +
          '</div></div>';
      }).join('');
    }

    // Order History Section
    var orderHistoryHtml = '';
    try {
      var savedPhone = state.user ? (state.user.phone || '') : '';
      var allLocal = JSON.parse(localStorage.getItem('yarz_my_orders') || '[]');
      var myOrders = savedPhone ? allLocal.filter(function(o) { return o.phone === savedPhone; }) : allLocal;
      if (myOrders.length > 0) {
        var recentOrders = myOrders.slice(-5).reverse();
        orderHistoryHtml = '<div style="border-top:1px solid var(--border-light);padding-top:12px;margin-top:12px;">' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 3h15v13H1z"/><path d="m16 8 4 0 3 4v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>' +
          'Recent Orders</div>';
        recentOrders.forEach(function(o) {
          var rawStat = (o.status || 'pending').toLowerCase().replace(/\s+/g, '');
          var statusClass = rawStat;
          var displayStatus = o.status || 'Pending';
          var inlineStyle = 'font-size:9px;padding:2px 6px;border-radius:10px;';
          
          if (rawStat === 'pending') {
            displayStatus = 'অর্ডার কনফার্ম';
            statusClass = ''; // Remove default pending class
            inlineStyle += 'color:#059669;background:rgba(5,150,105,0.1);font-weight:600;'; // Green color
          }

          var total = parseFloat(o.total || o.totalAmount) || 0;
          // ✅ v4.7: Format date with time in BD timezone
          var miniDate = (typeof _fmtBdDate === 'function')
            ? _fmtBdDate(o.date || o.placedAt || '')
            : (o.date || '');
          orderHistoryHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-light);font-size:11px;">' +
            '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;color:var(--ink-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(o.product || o.productName || '') + '</div>' +
            '<div style="color:var(--text-muted);font-size:10px;">' + escHtml(miniDate) + '</div></div>' +
            '<div style="text-align:right;margin-left:8px;">' +
            '<span class="order-status ' + statusClass + '" style="' + inlineStyle + '">' + escHtml(displayStatus) + '</span>' +
            (total > 0 ? '<div style="font-weight:600;font-size:11px;margin-top:2px;">' + formatPrice(total) + '</div>' : '') +
            '</div></div>';
        });
        orderHistoryHtml += '<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px;font-size:11px;" onclick="YARZ.toggleCart(false);YARZ.openTracking()">সব অর্ডার দেখুন →</button></div>';
      }
    } catch(e) {}

    body.innerHTML = cartHtml + orderHistoryHtml;

    var footer = $('#cart-footer-total');
    if (footer) footer.textContent = formatPrice(getCartTotal());
  }

  function toggleCart(show) {
    var overlay = $('#cart-overlay');
    var drawer = $('#cart-drawer');
    if (!overlay || !drawer) return;
    if (show === undefined) show = !drawer.classList.contains('open');
    overlay.classList.toggle('active', show);
    drawer.classList.toggle('open', show);
    if (show) renderCartDrawer();
  }

  // ===== BUY NOW =====
  function buyNow() {
    addToCart();
    toggleCart(false);
    openCheckout();
  }

  // ===== CHECKOUT =====
  function openCheckout() {
    if (state.cart.length === 0) { showToast('Cart is empty', 'warning'); return; }
    toggleCart(false);

    // Anti-Bot Timing Guard
    state._checkoutOpenedAt = Date.now();

    // ✅ v5.0: Facebook Pixel — InitiateCheckout event
    if (window.YARZ_PIXEL) {
      var checkoutTotal = state.cart.reduce(function(sum, c) { return sum + (c.price * c.qty); }, 0);
      YARZ_PIXEL.initiateCheckout(state.cart, checkoutTotal);
    }

    // ✅ FIX v4.3: Silent background refresh of COD toggle when checkout opens.
    // No loader shown to customer — uses cached value instantly, then updates
    // payment selector on the fly when fresh data arrives (typically <500ms).
    try {
      if (window.YARZ_API && YARZ_API.getGlobalControls) {
        YARZ_API.getGlobalControls().then(function (controls) {
          if (!controls) return;
          var rawStore = controls.raw || {};
          state.storeInfo = Object.assign(state.storeInfo || {}, rawStore, {
            enableCOD: controls.enableCOD,
            enable_cod: rawStore.enable_cod !== undefined ? rawStore.enable_cod : (controls.enableCOD ? 'true' : 'false'),
            freeShipAmt: controls.freeShipAmt || 0,
            raw: rawStore
          });
          // Re-render payment selector with the fresh COD status
          var pSel = $('#co-payment');
          if (pSel) {
            var codNow = isCODEnabled();
            var codLbl = codNow ? 'Cash on Delivery (COD)' : '🔒 Cash on Delivery — সাময়িক বন্ধ';
            var prev = pSel.value;
            pSel.innerHTML = '<option value="COD"' + (codNow ? '' : ' data-disabled="1"') + '>' + codLbl + '</option>' +
                             '<option value="bKash">bKash</option>' +
                             '<option value="Nagad">Nagad</option>';
            // If admin just disabled COD and user had it selected → auto-switch + notify
            if (!codNow && (prev === 'COD' || !prev)) {
              pSel.value = 'bKash';
              showCODDisabledModal();
              showPaymentInfo('bKash');
            } else {
              pSel.value = prev || (codNow ? 'COD' : 'bKash');
            }
          }
        }).catch(function () {});
      }
    } catch (e) {}

    var modal = $('#checkout-modal');
    if (!modal) return;

    var u = state.user || {};
    var nameInput = $('#co-name');
    var phoneInput = $('#co-phone');
    var emailInput = $('#co-email');
    var addressInput = $('#co-address');
    var paymentSel = $('#co-payment');

    if (nameInput) nameInput.value = u.name || '';
    if (phoneInput) phoneInput.value = u.phone || '';
    if (emailInput) emailInput.value = u.email || '';
    if (addressInput) addressInput.value = u.address || '';

    state.appliedCoupon = null;
    var couponInput = $('#co-coupon-code');
    if (couponInput) couponInput.value = '';
    var couponMsg = $('#co-coupon-msg');
    if (couponMsg) couponMsg.innerHTML = '';
    var hasCoupon = state.cart.some(function(item) { return item.couponActive === 'Yes' && item.couponCode; });
    var couponSec = $('#checkout-coupon-section');
    if (couponSec) couponSec.style.display = hasCoupon ? 'block' : 'none';

    // Dynamically render location options based on admin delivery-charge settings
    var locationSel = $('#co-location');
    if (locationSel) {
      var locations = getDeliveryLocations();
      var currentLoc = locationSel.value;
      locationSel.innerHTML = locations.map(function (loc, idx) {
        var charge = parseFloat(loc.charge) || 0;
        if (state.cart.length > 0) {
          charge = calculateCartDeliveryCharge(loc.id);
        }
        return '<option value="' + escHtml(loc.id) + '">' + escHtml(loc.name) + ' — ' + formatPrice(charge) + '</option>';
      }).join('');
      if (currentLoc && locations.some(function (loc) { return String(loc.id) === String(currentLoc); })) {
        locationSel.value = currentLoc;
      }
    }

    renderCheckoutSummary();

    // ✅ FIX: Fetch live delivery locations on checkout open (ignores cache)
    if (window.YARZ_API && YARZ_API.getDeliveryCharges) {
      YARZ_API.getDeliveryCharges().then(function(res) {
        if (res && res.success && res.locations) {
          state.storeInfo = state.storeInfo || {};
          state.storeInfo.deliveryLocations = res.locations;
          if (locationSel) {
            var currentLoc = locationSel.value;
            locationSel.innerHTML = res.locations.map(function (loc, idx) {
              var charge = parseFloat(loc.charge) || 0;
              if (state.cart.length > 0) {
                charge = calculateCartDeliveryCharge(loc.id);
              }
              return '<option value="' + escHtml(loc.id) + '">' + escHtml(loc.name) + ' — ' + formatPrice(charge) + '</option>';
            }).join('');
            if (currentLoc && res.locations.some(function (loc) { return String(loc.id) === String(currentLoc); })) {
              locationSel.value = currentLoc;
            }
          }
          renderCheckoutSummary();
        }
      }).catch(function() {});
    }

    // ✅ FIX v4.2 (HARDENED): Dynamically render payment options + COD toggle handling
    // When admin disables COD via "Enable COD" toggle in admin panel:
    //   • COD option is shown with a 🔒 lock icon + "(সাময়িক বন্ধ)" label
    //   • Selecting COD opens a friendly modal + auto-reverts to bKash
    //   • Default payment becomes bKash (so customer doesn't need to change anything)
    var codEnabled = isCODEnabled();
    if (paymentSel) {
      var currentVal = paymentSel.value;
      // Build options based on COD availability
      var codLabel = codEnabled
        ? 'Cash on Delivery (COD)'
        : '🔒 Cash on Delivery — সাময়িক বন্ধ';
      var optionsHTML = '<option value="COD"' + (codEnabled ? '' : ' data-disabled="1"') + '>' + codLabel + '</option>' +
                        '<option value="bKash">bKash</option>' +
                        '<option value="Nagad">Nagad</option>';
      paymentSel.innerHTML = optionsHTML;

      // ✅ HARD FIX: If COD is disabled and user previously had COD selected, force-switch
      if (!codEnabled && (currentVal === 'COD' || !currentVal)) {
        paymentSel.value = 'bKash';
        // Show the modal once on checkout open (so user knows why)
        setTimeout(function () {
          showCODDisabledModal({ silent: false });
        }, 300);
      } else if (!paymentSel.value) {
        paymentSel.value = codEnabled ? 'COD' : 'bKash';
      } else {
        paymentSel.value = currentVal || (codEnabled ? 'COD' : 'bKash');
      }

      // Attach change handler ONCE — if user selects COD while it's disabled,
      // show a friendly popup and auto-revert to bKash
      if (!paymentSel._yarzCodHandlerAttached) {
        paymentSel.addEventListener('change', function () {
          if (this.value === 'COD' && !isCODEnabled()) {
            showCODDisabledModal();
            this.value = 'bKash';
            showPaymentInfo('bKash');
            return;
          }
          showPaymentInfo(this.value);
        });
        paymentSel._yarzCodHandlerAttached = true;
      }
    }

    // Show payment info on initial open
    if (paymentSel) showPaymentInfo(paymentSel.value);
    modal.classList.add('active');
    document.body.classList.add('checkout-open');
  }

  // ✅ FIX v4.2 (HARDENED): Centralized COD-enable check
  // Reads from MULTIPLE possible keys because backend (api.js) sends `enableCOD`
  // as camelCase boolean, while raw sheet uses "Enable COD" → `enable_cod`.
  // Previous bug: only checked `enable_cod` so admin toggle did NOT work.
  // Default behaviour: COD is ENABLED unless admin explicitly disables it.
  function isCODEnabled() {
    var info = state.storeInfo || {};
    var raw = info.raw || {};

    // Priority 1: Normalised camelCase boolean from getGlobalControls()
    if (typeof info.enableCOD === 'boolean') return info.enableCOD;

    // Priority 2: Direct snake_case from raw settings sheet
    var candidates = [
      info.enable_cod,
      info.enableCOD,
      raw.enable_cod,
      raw['Enable COD'],
      raw['enable cod']
    ];

    for (var i = 0; i < candidates.length; i++) {
      var v = candidates[i];
      if (v === undefined || v === null || v === '') continue;
      if (typeof v === 'boolean') return v;
      var s = String(v).toLowerCase().trim();
      if (s === 'false' || s === 'no' || s === '0' || s === 'off' || s === 'disabled') return false;
      if (s === 'true' || s === 'yes' || s === '1' || s === 'on' || s === 'enabled') return true;
    }
    // Default: enabled
    return true;
  }

  // Expose to window for debugging — admin can run `YARZ.isCODEnabled()` in console
  window._yarzIsCODEnabled = isCODEnabled;

  // ✅ FIX v4.2 (HARDENED): Friendly modal popup explaining COD restriction
  // Triggered when:
  //   1. Customer selects COD in dropdown (instant feedback)
  //   2. Customer opens checkout while COD is disabled (auto-shown once)
  //   3. submitOrder() detects COD bypass attempt (final guard)
  function showCODDisabledModal(opts) {
    opts = opts || {};
    // Remove any existing instance
    var prev = document.getElementById('cod-disabled-modal');
    if (prev) prev.remove();

    var overlay = document.createElement('div');
    overlay.id = 'cod-disabled-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:codFadeIn 0.25s ease-out;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;max-width:420px;width:100%;border-radius:20px;padding:0;box-shadow:0 25px 70px rgba(0,0,0,0.35);font-family:var(--font-bengali, "Hind Siliguri", sans-serif);animation:codSlideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);overflow:hidden;';
    box.innerHTML =
      // Header strip with gradient
      '<div style="background:linear-gradient(135deg,#FF9800 0%,#F57C00 50%,#E65100 100%);padding:24px 24px 20px;text-align:center;position:relative;overflow:hidden;">' +
        '<div style="position:absolute;inset:0;background:radial-gradient(circle at 30% 20%, rgba(255,255,255,0.2), transparent 50%);"></div>' +
        '<div style="position:relative;width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,0.25);margin:0 auto 12px;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);border:2px solid rgba(255,255,255,0.4);box-shadow:0 8px 20px rgba(0,0,0,0.15);">' +
          '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
        '</div>' +
        '<h3 style="position:relative;font-size:19px;font-weight:700;color:#fff;margin:0;font-family:var(--font-bengali);text-shadow:0 1px 2px rgba(0,0,0,0.1);">সম্মানিত ক্রেতা! 🙏</h3>' +
        '<p style="position:relative;font-size:12.5px;color:rgba(255,255,255,0.95);margin:6px 0 0;font-family:var(--font-bengali);">একটি গুরুত্বপূর্ণ তথ্য আপনার জন্য</p>' +
      '</div>' +
      // Body content
      '<div style="padding:22px 24px 24px;">' +
        '<p style="font-size:13.5px;line-height:1.8;color:#334155;margin:0 0 14px;font-family:var(--font-bengali);text-align:center;">' +
          'কিছু অসাধু ক্রেতা পার্সেল গ্রহণ না করার কারণে আমাদের <strong style="color:#E65100;">ক্যাশ অন ডেলিভারি (COD)</strong> সার্ভিসটি সাময়িকভাবে বন্ধ রাখা হয়েছে।' +
        '</p>' +
        // Solution box
        '<div style="background:linear-gradient(135deg,#E8F5E9 0%,#C8E6C9 100%);border:1.5px solid #66BB6A;border-radius:14px;padding:14px 16px;margin:0 0 14px;position:relative;">' +
          '<div style="position:absolute;top:-10px;left:14px;background:#2E7D32;color:#fff;font-size:10.5px;font-weight:700;padding:3px 10px;border-radius:10px;letter-spacing:0.3px;">✓ সমাধান</div>' +
          '<p style="font-size:13px;line-height:1.75;color:#1B5E20;margin:6px 0 0;font-family:var(--font-bengali);">' +
            'শুধুমাত্র <strong>ডেলিভারি চার্জটি</strong> আগেই <strong style="color:#E91E63;">bKash</strong> অথবা <strong style="color:#FF9800;">Nagad</strong>-এ পেমেন্ট করুন। প্রোডাক্টের বাকি টাকা ডেলিভারির সময় হাতে হাতে নগদ পরিশোধ করবেন।' +
          '</p>' +
        '</div>' +
        // Trust indicators
        '<div style="display:flex;gap:8px;justify-content:center;margin-bottom:16px;flex-wrap:wrap;">' +
          '<div style="display:flex;align-items:center;gap:5px;background:#F1F5F9;padding:6px 11px;border-radius:8px;font-size:11px;color:#475569;font-family:var(--font-bengali);font-weight:600;">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>' +
            '১০০% নিরাপদ' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:5px;background:#F1F5F9;padding:6px 11px;border-radius:8px;font-size:11px;color:#475569;font-family:var(--font-bengali);font-weight:600;">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' +
            'বিশ্বস্ত সেবা' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:5px;background:#F1F5F9;padding:6px 11px;border-radius:8px;font-size:11px;color:#475569;font-family:var(--font-bengali);font-weight:600;">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
            'গুণগত মান' +
          '</div>' +
        '</div>' +
        // CTA button
        '<button id="cod-modal-ok" style="width:100%;background:linear-gradient(135deg,#634A8E 0%,#4A3470 100%);color:#fff;border:none;padding:14px 20px;border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;font-family:var(--font-bengali);box-shadow:0 6px 16px rgba(99,74,142,0.35);transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:8px;">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
          'বুঝেছি, bKash/Nagad ব্যবহার করব' +
        '</button>' +
        '<p style="font-size:11px;color:#94a3b8;margin:10px 0 0;font-family:var(--font-bengali);text-align:center;">আপনার সহযোগিতার জন্য আন্তরিক ধন্যবাদ ❤️</p>' +
      '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Animation styles (inject once)
    if (!document.getElementById('cod-modal-anim-style')) {
      var st = document.createElement('style');
      st.id = 'cod-modal-anim-style';
      st.textContent = '@keyframes codFadeIn{from{opacity:0}to{opacity:1}}@keyframes codSlideUp{from{opacity:0;transform:translateY(30px) scale(0.92)}to{opacity:1;transform:translateY(0) scale(1)}}#cod-modal-ok:hover{transform:translateY(-2px);box-shadow:0 10px 22px rgba(99,74,142,0.45)}#cod-modal-ok:active{transform:translateY(0)}';
      document.head.appendChild(st);
    }

    function close() {
      overlay.style.animation = 'codFadeIn 0.2s ease-out reverse';
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 180);
    }
    document.getElementById('cod-modal-ok').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    // ESC key support
    var escHandler = function (e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);
  }

  function renderCheckoutSummary() {
    var el = $('#checkout-items');
    if (!el) return;
    var html = '';
    var subtotal = 0;
    state.cart.forEach(function (item) {
      subtotal += item.price * item.qty;
      html += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;">' +
        '<span>' + escHtml(item.name) + ' (' + item.size + ') x' + item.qty + '</span>' +
        '<span>' + formatPrice(item.price * item.qty) + '</span></div>';
    });
    el.innerHTML = html;
    
    var location = ($('#co-location') || {}).value || (getDeliveryLocations()[0] || {}).id || 'inside_narayanganj';
    var deliveryCharge = 0;
    if (state.cart.length > 0) {
      deliveryCharge = calculateCartDeliveryCharge(location);
    }

    var deliveryEl = $('#checkout-delivery');
    if (deliveryEl) deliveryEl.textContent = formatPrice(deliveryCharge);

    var total = subtotal + deliveryCharge;
    
    // Check coupon
    var couponRow = $('#checkout-coupon-row');
    if (state.appliedCoupon) {
      var discountAmt = (subtotal * state.appliedCoupon.discountPct) / 100;
      total = total - discountAmt;
      
      if (!couponRow) {
        couponRow = document.createElement('div');
        couponRow.id = 'checkout-coupon-row';
        couponRow.style.cssText = 'display:flex;justify-content:space-between;margin-top:4px;padding-top:4px;font-size:12px;color:var(--success);font-weight:600;';
        el.parentNode.insertBefore(couponRow, el.nextSibling);
      }
      couponRow.innerHTML = '<span>Coupon Discount (' + state.appliedCoupon.code + ')</span><span>-' + formatPrice(discountAmt) + '</span>';
    } else {
      if (couponRow) couponRow.remove();
    }

    var totalEl = $('#checkout-total');
    if (totalEl) totalEl.textContent = formatPrice(Math.round(total));
  }

  // ===== COUPON SYSTEM =====
  function applyCoupon() {
    var codeInput = $('#co-coupon-code');
    var msgEl = $('#co-coupon-msg');
    if (!codeInput || !msgEl) return;
    var code = codeInput.value.trim().toUpperCase();
    
    if (!code) {
      msgEl.textContent = 'Please enter a coupon code.';
      msgEl.style.color = 'var(--danger)';
      return;
    }

    // Check if code matches any product in cart
    var matchedItem = state.cart.find(function(item) {
      return item.couponActive === 'Yes' && (item.couponCode || '').toUpperCase() === code;
    });

    if (matchedItem) {
      state.appliedCoupon = {
        code: code,
        discountPct: matchedItem.couponDisc
      };
      msgEl.innerHTML = '<span style="color:var(--success);font-weight:600;">✅ Coupon applied! (' + matchedItem.couponDisc + '% OFF)</span>';
      renderCheckoutSummary();
    } else {
      state.appliedCoupon = null;
      msgEl.textContent = '❌ Invalid or expired coupon code.';
      msgEl.style.color = 'var(--danger)';
      renderCheckoutSummary();
    }
  }

  function closeCheckout() {
    var modal = $('#checkout-modal');
    if (modal) modal.classList.remove('active');
    document.body.classList.remove('checkout-open');
  }

  function submitOrder() {
    var name = ($('#co-name') || {}).value;
    var phone = ($('#co-phone') || {}).value;
    var email = ($('#co-email') || {}).value;
    var address = ($('#co-address') || {}).value;
    var location = ($('#co-location') || {}).value || 'inside_narayanganj';
    var city = ($('#co-city') || {}).value;
    var payment = ($('#co-payment') || {}).value || 'COD';

    name = (name || '').trim();
    phone = (phone || '').trim();
    email = (email || '').trim();
    address = (address || '').trim();
    city = (city || '').trim();

    var trxidEl = $('#co-trxid');
    var trxid = trxidEl ? trxidEl.value.trim() : '';

    if (payment === 'bKash' || payment === 'Nagad') {
      if (!trxid) {
        showToast('অনুগ্রহ করে Transaction ID দিন।', 'warning');
        return;
      }
      address = address + ' [TrxID: ' + trxid + ']';
    }

    // ✅ FIX v4.2 (HARDENED): Hard-block COD when admin has disabled it.
    // Even if user bypasses dropdown via DOM-edit, this final guard stops
    // the order from being submitted. Force a fresh storeInfo refresh first
    // to be 100% sure we have the latest admin setting (avoid stale cache).
    if (payment === 'COD') {
      // Quick-refresh storeInfo from server in background to be CERTAIN.
      // Non-blocking — uses cached value for instant decision below.
      try {
        if (window.YARZ_API && YARZ_API.getStoreInfo) {
          YARZ_API.getStoreInfo().then(function (res) {
            if (res && res.success) {
              var s = res.data || res.store || {};
              if (s && s['enable_cod'] !== undefined) {
                state.storeInfo = state.storeInfo || {};
                state.storeInfo.enable_cod = s['enable_cod'];
                state.storeInfo.enableCOD = !(String(s['enable_cod']).toLowerCase() === 'false');
                state.storeInfo.raw = state.storeInfo.raw || {};
                state.storeInfo.raw.enable_cod = s['enable_cod'];
              }
            }
          }).catch(function () {});
        }
      } catch (e) {}

      if (!isCODEnabled()) {
        showCODDisabledModal();
        var paymentSelEl = $('#co-payment');
        if (paymentSelEl) {
          paymentSelEl.value = 'bKash';
          showPaymentInfo('bKash');
        }
        return;
      }
    }

    // ✅ v5.0: YARZ Shield — comprehensive anti-fraud validation
    if (window.YARZ_SHIELD) {
      var shieldResult = YARZ_SHIELD.validate({
        name: name, phone: phone, address: address,
        _formOpenTime: state._checkoutOpenedAt || 0,
      });
      if (!shieldResult.allowed) {
        if (shieldResult.silent) {
          // Silent block — attacker thinks order went through
          simulateFakeSuccess(name, phone, address, payment);
        } else {
          showToast(shieldResult.reason, 'warning');
        }
        return;
      }
    }

    // 1. Honeypot check (Anti-Bot) — legacy fallback
    var honeypot = $('#co-website');
    if (honeypot && honeypot.value) {
      simulateFakeSuccess(name, phone, address, payment);
      return;
    }

    // 2. Timing Guard (Anti-Speed-Bot) — legacy fallback
    var timeSpent = Date.now() - (state._checkoutOpenedAt || 0);
    if (timeSpent < 8000) {
      showToast('অনুগ্রহ করে ফর্মটি সঠিকভাবে পূরণ করুন।', 'warning');
      return;
    }

    // 3. Name Validation
    if (!name) { showToast('Please enter your name', 'warning'); return; }

    // 4. BD Phone Validation
    var phoneRegex = /^01[3-9]\d{8}$/;
    if (!phoneRegex.test(phone)) { 
      showToast('সঠিক বাংলাদেশি ফোন নম্বর দিন (যেমন: 017XXXXXXXX)', 'warning'); 
      return; 
    }

    // 5. Address Length Validation
    if (!address || address.length < 10) { 
      showToast('সম্পূর্ণ ঠিকানা দিন (রোড/বাসা/এলাকা সহ কমপক্ষে ১০ অক্ষর)', 'warning'); 
      return; 
    }

    // 5.5: Minimum Order Amount (from admin settings)
    if (state.minOrder > 0) {
      var cartSubtotal = getCartTotal();
      if (cartSubtotal < state.minOrder) {
        showToast('সর্বনিম্ন অর্ডার ' + formatPrice(state.minOrder) + '। আরও প্রোডাক্ট যোগ করুন।', 'warning');
        return;
      }
    }

    // 5.6: Collect Order Notes & Custom Field
    var orderNotes = '';
    var orderNotesEl = $('#co-order-notes');
    if (orderNotesEl && orderNotesEl.value.trim()) {
      orderNotes = orderNotesEl.value.trim();
      address = address + ' [Note: ' + orderNotes + ']';
    }
    var customFieldEl = $('#co-custom-field');
    if (customFieldEl && customFieldEl.value.trim()) {
      address = address + ' [' + (state.customField || 'Custom') + ': ' + customFieldEl.value.trim() + ']';
    }

    // 6. Admin Phone Blacklist
    if (state.storeInfo && state.storeInfo.raw && state.storeInfo.raw.blocked_phones) {
      var blockedList = String(state.storeInfo.raw.blocked_phones).split(',');
      var isBlocked = blockedList.some(function(b) { return b.trim() === phone; });
      if (isBlocked) {
        simulateFakeSuccess(name, phone, address, payment);
        return;
      }
    }

    // 7. Rate Limiting (1 order per 3 minutes)
    var lastOrderTime = parseInt(localStorage.getItem('yarz_last_order')) || 0;
    if (Date.now() - lastOrderTime < 3 * 60 * 1000) {
      showToast('আপনি সম্প্রতি একটি অর্ডার করেছেন। কিছুক্ষণ পর আবার চেষ্টা করুন।', 'warning');
      return;
    }

    // 8. Duplicate Order Detection (Same phone + cart within 30 mins)
    var cartHash = state.cart.map(function(c){ return c.name + c.size + c.qty; }).join('|');
    var orderSig = phone + '|' + cartHash;
    var lastOrderSig = localStorage.getItem('yarz_last_order_sig');
    var lastOrderSigTime = parseInt(localStorage.getItem('yarz_last_order_sig_time')) || 0;
    if (orderSig === lastOrderSig && (Date.now() - lastOrderSigTime < 30 * 60 * 1000)) {
      showToast('এই অর্ডারটি ইতিমধ্যে করা হয়েছে। অনুগ্রহ করে Track Order থেকে চেক করুন।', 'warning');
      return;
    }

    // 9. Order Confirmation Step
    var confirmModal = $('#custom-confirm-modal');
    if (confirmModal) {
      var msgEl = $('#custom-confirm-msg');
      if (msgEl) {
        msgEl.innerHTML = '<div style="text-align:left; background:var(--surface-1); padding:12px; border-radius:8px; display:inline-block; margin-top:8px; width:100%; box-sizing:border-box;">' +
                          '<div style="margin-bottom:6px; display:flex; gap:8px;"><span style="color:var(--text-muted);font-size:12px;width:40px;">নাম:</span> <span style="font-weight:600;color:var(--ink-1);font-size:13px;">' + escHtml(name) + '</span></div>' +
                          '<div style="margin-bottom:6px; display:flex; gap:8px;"><span style="color:var(--text-muted);font-size:12px;width:40px;">ফোন:</span> <span style="font-weight:600;color:var(--ink-1);font-size:13px;">' + escHtml(phone) + '</span></div>' +
                          '<div style="display:flex; gap:8px;"><span style="color:var(--text-muted);font-size:12px;width:40px;">ঠিকানা:</span> <span style="font-weight:600;color:var(--ink-1);font-size:13px;flex:1;">' + escHtml(address) + '</span></div>' +
                          '</div>';
      }
      
      var yesBtn = $('#custom-confirm-yes-btn');
      if (yesBtn) {
        var newYesBtn = yesBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
        newYesBtn.addEventListener('click', function() {
          confirmModal.classList.remove('active');
          processOrderSubmission(name, phone, email, address, location, city, payment, trxid, orderSig);
        });
      }
      
      confirmModal.classList.add('active');
      return;
    } else {
      // Fallback
      var confirmMsg = 'আপনি কি অর্ডারটি কনফার্ম করতে চান?\n\nনাম: ' + name + '\nফোন: ' + phone + '\nঠিকানা: ' + address;
      if (!window.confirm(confirmMsg)) return;
      processOrderSubmission(name, phone, email, address, location, city, payment, trxid, orderSig);
    }
  }

  function processOrderSubmission(name, phone, email, address, location, city, payment, trxid, orderSig) {
    // Save user info to localStorage
    state.user = { name: name, phone: phone, email: email, address: address };
    saveUser();

    // Set Rate Limits
    localStorage.setItem('yarz_last_order', Date.now());
    localStorage.setItem('yarz_last_order_sig', orderSig);
    localStorage.setItem('yarz_last_order_sig_time', Date.now());

    var btn = $('#checkout-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

    // Generate Device Fingerprint for cross-browser tracking privacy
    var sw = window.screen.width || 0;
    var sh = window.screen.height || 0;
    var devId = parseInt(Math.min(sw, sh) + '' + Math.max(sw, sh) + '' + (window.screen.colorDepth || 24)).toString(36).toUpperCase();
    var generatedOrderId = 'YARZ-WEB-' + devId + '-' + Date.now().toString().slice(-5) + Math.random().toString(36).substr(2, 2).toUpperCase();

    var finalLocationName = getDeliveryLocationName(location);
    var checkoutDeliveryCharge = calculateCartDeliveryCharge(location);

    // Build order promises. Delivery is charged once per checkout, not once per product row.
    var orderPromises = state.cart.map(function (item, idx) {
      var deliveryCharge = idx === 0 ? checkoutDeliveryCharge : 0;
      var itemPrice = item.price;
      
      // Apply coupon if valid for this item (global cart level is fine for now based on matched coupon)
      if (state.appliedCoupon && item.couponActive === 'Yes' && (item.couponCode || '').toUpperCase() === state.appliedCoupon.code) {
        var discountAmt = (itemPrice * state.appliedCoupon.discountPct) / 100;
        itemPrice = itemPrice - discountAmt;
      }
      
      // ✅ v4.6: client-computed total (qty × unit_price + delivery)
      // — sent explicitly so server doesn't have to recalculate.
      var rowTotal = (itemPrice * item.qty) + deliveryCharge;

      var orderData = {
        orderId: generatedOrderId,
        customerName: name,
        phone: phone,
        email: email,
        address: address,
        location: finalLocationName,
        city: city || finalLocationName,
        product: item.name,
        size: item.size,
        qty: item.qty,
        price: itemPrice,
        delivery: deliveryCharge,
        total: rowTotal,                                    /* ✅ v4.6: explicit total */
        coupon: state.appliedCoupon ? state.appliedCoupon.code : '',  /* ✅ v4.6: explicit coupon code */
        payment: payment,
        notes: state.appliedCoupon ? 'Applied Coupon: ' + state.appliedCoupon.code : '',
        // ✅ v4.6: client-side total carried into local fallback in case the
        // server response can't be parsed (CORS / opaque-redirect)
        _clientTotal: rowTotal
      };

      if (YARZ_API.isConfigured()) {
        return YARZ_API.placeOrder(orderData).then(function(res){
          // ✅ v4.6: enrich the server response with the client-computed
          // total in case the server didn't echo it back. This guarantees
          // the order-success page never shows ৳0.
          if (res && (res.total === undefined || res.total === null || res.total === 0 || res.total === '')) {
            res.total = rowTotal;
          }
          return res || { success:true, orderId: generatedOrderId, total: rowTotal };
        }).catch(function(){
          // On parse/CORS error, return a synthetic success with client total
          return { success:true, orderId: generatedOrderId, total: rowTotal };
        });
      } else {
        return Promise.resolve({
          success: true,
          orderId: generatedOrderId,
          total: rowTotal,
        });
      }
    });

    Promise.all(orderPromises).then(function (results) {
      // Save order to Local Storage for immediate tracking
      try {
        var localOrders = JSON.parse(localStorage.getItem('yarz_my_orders') || '[]');
        var newLocalOrders = state.cart.map(function(item, idx) {
          var deliveryCharge = idx === 0 ? checkoutDeliveryCharge : 0;
          var itemPrice = item.price;
          if (state.appliedCoupon && item.couponActive === 'Yes' && (item.couponCode || '').toUpperCase() === state.appliedCoupon.code) {
            itemPrice = itemPrice - (itemPrice * state.appliedCoupon.discountPct / 100);
          }
          return {
            orderId: generatedOrderId,
            status: 'Pending',
            // ✅ v4.7 FIX: Save full ISO timestamp (with time), not just the date.
            //    Earlier `toLocaleDateString` caused "12:00 AM" everywhere.
            date: new Date().toISOString(),
            placedAt: Date.now(),
            productName: item.name,
            product: item.name,
            size: item.size,
            qty: item.qty,
            phone: phone,
            price: itemPrice,
            delivery: deliveryCharge,
            total: (itemPrice * item.qty) + deliveryCharge,
            totalAmount: (itemPrice * item.qty) + deliveryCharge,
            payment: payment
          };
        });
        localStorage.setItem('yarz_my_orders', JSON.stringify(localOrders.concat(newLocalOrders)));
      } catch(e) {}

      // Capture cart items before clearing them for pixel tracking
      var purchasedItems = JSON.parse(JSON.stringify(state.cart));

      state.cart = [];
      saveCart();
      closeCheckout();
      var backendOrderId = results[0] ? results[0].orderId || generatedOrderId : generatedOrderId;
      
      // Update localStorage orders with backend's orderId so tracking matches
      if (backendOrderId !== generatedOrderId) {
        try {
          var storedOrders = JSON.parse(localStorage.getItem('yarz_my_orders') || '[]');
          storedOrders.forEach(function(o) {
            if (o.orderId === generatedOrderId) o.orderId = backendOrderId;
          });
          localStorage.setItem('yarz_my_orders', JSON.stringify(storedOrders));
        } catch(e) {}
      }
      
      // ✅ v5.0: Facebook Pixel — Purchase event (THE MOST IMPORTANT)
      var purchaseTotal = results.reduce(function(sum, r) { return sum + (parseFloat(r.total) || parseFloat(r._clientTotal) || 0); }, 0);
      if (window.YARZ_PIXEL) YARZ_PIXEL.purchase(backendOrderId, purchasedItems, purchaseTotal);

      showOrderSuccess(backendOrderId, results, payment);
    }).catch(function (err) {
      console.error('Order error (assuming success due to Google Apps Script CORS/Redirect):', err);
      // Even if fetch throws a CORS/parsing error, Google Script usually executed successfully.
      // We log it as a success locally to clear the cart and avoid user confusion.
      try {
        var localOrders = JSON.parse(localStorage.getItem('yarz_my_orders') || '[]');
        var newLocalOrders = state.cart.map(function(item, idx) {
          var deliveryCharge = idx === 0 ? checkoutDeliveryCharge : 0;
          var itemPrice = item.price;
          if (state.appliedCoupon && item.couponActive === 'Yes' && (item.couponCode || '').toUpperCase() === state.appliedCoupon.code) {
            itemPrice = itemPrice - (itemPrice * state.appliedCoupon.discountPct / 100);
          }
          return {
            orderId: generatedOrderId,
            status: 'Pending',
            // ✅ v4.7 FIX: Full ISO timestamp (with time) instead of date-only.
            date: new Date().toISOString(),
            placedAt: Date.now(),
            productName: item.name,
            product: item.name,
            size: item.size,
            qty: item.qty,
            phone: phone,
            price: itemPrice,
            delivery: deliveryCharge,
            total: (itemPrice * item.qty) + deliveryCharge,
            totalAmount: (itemPrice * item.qty) + deliveryCharge,
            payment: payment
          };
        });
        localStorage.setItem('yarz_my_orders', JSON.stringify(localOrders.concat(newLocalOrders)));
      } catch(e) {}

      // ✅ v4.6: Compute fallback total properly — apply coupon discount too.
      var fallbackTotal = state.cart.reduce(function(sum, item) {
        var p = item.price;
        if (state.appliedCoupon && item.couponActive === 'Yes' &&
            (item.couponCode || '').toUpperCase() === state.appliedCoupon.code) {
          p = p - (p * state.appliedCoupon.discountPct / 100);
        }
        return sum + (p * item.qty);
      }, checkoutDeliveryCharge);

      // Capture cart items before clearing them for pixel tracking
      var purchasedItems = JSON.parse(JSON.stringify(state.cart));

      state.cart = [];
      saveCart();
      closeCheckout();

      // ✅ v5.1: Critical Fix — Fire pixel even if Apps Script throws CORS redirect error (which usually means success)
      if (window.YARZ_PIXEL) YARZ_PIXEL.purchase(generatedOrderId, purchasedItems, fallbackTotal);

      showOrderSuccess(generatedOrderId, [{ total: fallbackTotal, _clientTotal: fallbackTotal }], payment);
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.textContent = 'Place Order'; }
    });
  }

  function showOrderSuccess(orderId, results, paymentMethod) {
    // ✅ v4.6 CRITICAL FIX: Defensive total calculation.
    // Previously this only summed `r.total` from server responses — when the
    // Apps Script response couldn't be parsed (CORS / opaque-redirect) the
    // total ended up as ৳0. Now we also fall back to `_clientTotal` and to
    // any stored `yarz_my_orders` matching this orderId.
    var total = 0;
    if (Array.isArray(results)) {
      results.forEach(function (r) {
        if (!r) return;
        var t = parseFloat(r.total);
        if (isNaN(t) || t <= 0) t = parseFloat(r._clientTotal);
        if (!isNaN(t) && t > 0) total += t;
      });
    }
    // Fallback: if total is still 0, read from localStorage tracking records
    if (!total) {
      try {
        var localOrders = JSON.parse(localStorage.getItem('yarz_my_orders') || '[]');
        localOrders.forEach(function (o) {
          if (o && o.orderId === orderId) {
            var t = parseFloat(o.total) || parseFloat(o.totalAmount) || 0;
            if (t > 0) total += t;
          }
        });
      } catch (e) {}
    }

    // Payment instructions for digital payments
    var paymentInstructions = '';
    if (paymentMethod && (paymentMethod.toLowerCase().includes('bkash') || paymentMethod.toLowerCase().includes('nagad'))) {
      paymentInstructions = '<div style="background:var(--accent-light);border:1px solid var(--accent-subtle);border-radius:8px;padding:16px;margin-bottom:24px;text-align:left;">' +
        '<h3 style="font-size:14px;font-weight:600;color:var(--accent);margin-bottom:8px;display:flex;align-items:center;gap:6px;">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
        'Payment Instructions for ' + escHtml(paymentMethod.toUpperCase()) +
        '</h3>' +
        '<ul style="font-size:12px;color:var(--text-secondary);margin:0;padding-left:18px;">' +
        '<li>Send payment to <strong>01XXXXXXXXX</strong> (' + escHtml(paymentMethod.toUpperCase()) + ')</li>' +
        '<li>Use Order ID <strong>' + escHtml(orderId) + '</strong> as reference</li>' +
        '<li>Keep screenshot of payment confirmation</li>' +
        '<li>We will verify and confirm your order within 1 hour</li>' +
        '</ul>' +
        '<p style="font-size:11px;color:var(--text-muted);margin-top:8px;font-family:var(--font-bengali);">পেমেন্টের স্ক্রিনশট আমাদের WhatsApp এ পাঠান: 01XXXXXXXXX</p>' +
        '</div>';
    }

    var html = '<div style="max-width:480px;margin:48px auto;text-align:center;padding:0 24px;">' +
      '<div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#10B981,#059669);color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;box-shadow:0 8px 24px rgba(16,185,129,0.35);">' + ICONS.check + '</div>' +
      '<h2 style="font-family:var(--font-serif);font-size:22px;font-weight:600;margin-bottom:12px;color:var(--ink-1);">ধন্যবাদ!</h2>' +
      '<div style="background:linear-gradient(135deg,rgba(16,185,129,0.08),rgba(5,150,105,0.04));border:1.5px solid rgba(16,185,129,0.25);border-radius:12px;padding:20px 18px;margin-bottom:24px;text-align:center;">' +
      '<p style="font-size:15px;font-weight:600;color:var(--ink-1);margin-bottom:8px;line-height:1.6;">আপনার অর্ডারটি সফলভাবে নেওয়া হয়েছে</p>' +
      '<p style="font-size:13px;color:var(--ink-2);line-height:1.7;margin:0;">কিছুক্ষণের মধ্যে আমাদের টিম আপনাকে <strong>কল এর মাধ্যমে</strong> অর্ডারটি কনফার্ম করবে। অনুগ্রহ করে ফোন রিসিভ করুন।</p>' +
      '</div>' +
      paymentInstructions +
      '<div style="background:var(--bg-card);border:1px solid var(--border-light);border-radius:12px;padding:20px;text-align:left;margin-bottom:24px;">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px;"><span style="color:var(--text-muted);">অর্ডার আইডি</span><span style="font-weight:700;color:var(--accent);letter-spacing:0.5px;">' + escHtml(orderId) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:13px;"><span style="color:var(--text-muted);">সর্বমোট</span><span style="font-weight:700;font-size:15px;">' + formatPrice(total) + '</span></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
      '<button class="btn btn-primary" onclick="YARZ.goHome()" style="border-radius:10px;padding:12px 24px;">শপিং চালিয়ে যান</button>' +
      '<button class="btn btn-outline" onclick="YARZ.openTracking()" style="border-radius:10px;padding:12px 24px;">অর্ডার ট্র্যাক করুন</button></div></div>';

    showView('success', html);
  }

  // Helper for fake success (Honeypot & Blacklist)
  function simulateFakeSuccess(name, phone, address, payment) {
    var btn = $('#checkout-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
    setTimeout(function() {
      state.cart = [];
      saveCart();
      closeCheckout();
      var fakeOrderId = 'YARZ-WEB-' + Date.now().toString().slice(-6) + '-' + Math.random().toString(36).substr(2, 4).toUpperCase();
      var mockResults = [{ total: 0 }];
      showOrderSuccess(fakeOrderId, mockResults, payment);
      if (btn) { btn.disabled = false; btn.textContent = 'Place Order'; }
    }, 1500);
  }

  // ===== SEARCH =====
  function openSearch() {
    var overlay = $('#search-overlay');
    if (overlay) {
      overlay.classList.add('active');
      var input = overlay.querySelector('input');
      if (input) { input.value = ''; input.focus(); }
      var results = $('#search-results');
      if (results) results.innerHTML = '';
    }
  }

  function closeSearch() {
    var overlay = $('#search-overlay');
    if (overlay) overlay.classList.remove('active');
  }

  function handleSearch(query) {
    var q = (query || '').toLowerCase().trim();
    var container = $('#search-results');
    if (!container) return;

    if (q.length < 2) { container.innerHTML = ''; return; }

    // ✅ v5.0: Facebook Pixel — Search event
    if (window.YARZ_PIXEL && q.length >= 3) YARZ_PIXEL.search(q);

    var results = state.products.filter(function (p) {
      return p.name.toLowerCase().indexOf(q) >= 0 ||
        (p.category || '').toLowerCase().indexOf(q) >= 0 ||
        (p.description || '').toLowerCase().indexOf(q) >= 0;
    }).slice(0, 10);

    if (results.length === 0) {
      container.innerHTML = '<div class="search-empty">No products found for "' + escHtml(query) + '"</div>';
      return;
    }

    container.innerHTML = results.map(function (p) {
      var safeName = escHtml(p.name).replace(/'/g, "\\'");
      return '<div class="search-result-item" onclick="YARZ.closeSearch();YARZ.openProduct(\'' + safeName + '\')">' +
        '<img src="' + escHtml(getImgSrc(p.image1)) + '" alt="" onerror="this.style.display=\'none\'">' +
        '<div class="sr-info"><div class="sr-name">' + escHtml(p.name) + '</div>' +
        '<div class="sr-price">' + formatPrice(p.salePrice) + '</div></div></div>';
    }).join('');
  }

  // ===== ORDER TRACKING =====
  // ===== ORDER POLLING (auto-refresh status) =====
  var _orderPollTimer = null;
  function _stopOrderPoll() {
    if (_orderPollTimer) { clearInterval(_orderPollTimer); _orderPollTimer = null; }
  }
  function _startOrderPoll(phone) {
    _stopOrderPoll();
    if (!phone) return;
    // ✅ v4.7: Refresh every 10 seconds — keeps status in sync with admin panel.
    //    Also forces a fresh request (bypasses cache) so admin status updates
    //    appear within ~10 seconds for the customer.
    _orderPollTimer = setInterval(function () {
      if (state.currentView !== 'tracking') { _stopOrderPoll(); return; }
      // Bypass cache for fresh status check
      try { YARZ_API.clearCache(); } catch(e) {}
      searchOrders(true); // silent refresh
    }, 10000);
  }

  function openTracking() {
    var savedPhone = state.user ? (state.user.phone || '') : '';

    var html = '<div class="tracking-section">' +
      '<div class="page-header" style="border:none;margin-bottom:16px;">' +
      '<h1>Order Tracking</h1>' +
      '<p>Enter your phone number to view your orders</p>' +
      '<p style="font-size:12px;color:var(--text-muted);font-family:var(--font-bengali);margin-top:4px;">আপনার ফোন নম্বর দিয়ে অর্ডার খুঁজুন</p>' +
      '<p style="font-size:11px;color:var(--text-muted);margin-top:6px;">🔄 Status auto-refreshes every 20s</p></div>' +
      '<div class="tracking-card">' +
      '<div class="form-group"><label>Phone Number <span class="required">*</span></label>' +
      '<div style="display:flex;gap:8px;">' +
      '<input type="tel" class="form-input" id="track-phone" placeholder="01XXXXXXXXX" value="' + escHtml(savedPhone) + '" style="flex:1" onkeydown="if(event.key===\'Enter\')YARZ.searchOrders()">' +
      '<button class="btn btn-primary" onclick="YARZ.searchOrders()" id="track-btn">Search</button></div></div>' +
      '<div id="tracking-results"></div></div></div>';

    showView('tracking', html);

    // Auto-search if phone exists
    if (savedPhone && savedPhone.length >= 10) {
      setTimeout(function () { searchOrders(); }, 300);
    }
  }

  function searchOrders(silent) {
    var phoneInput = $('#track-phone');
    var phone = phoneInput ? (phoneInput.value || '').trim() : '';
    
    if (!phone || phone.length < 10) {
      if (!silent) showToast('Enter valid phone number', 'warning');
      return;
    }

    var container = $('#tracking-results');
    var btn = $('#track-btn');
    if (!container) return;

    if (!silent) {
      container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
      if (btn) { btn.disabled = true; btn.textContent = 'Searching...'; }
    }
    // Start auto-refresh polling on first explicit search
    if (!silent) _startOrderPoll(phone);

    // Load from LocalStorage first and show IMMEDIATELY
    var localOrders = [];
    try {
      var allLocal = JSON.parse(localStorage.getItem('yarz_my_orders') || '[]');
      localOrders = allLocal.filter(function(o) { return o.phone === phone; });
    } catch(e) {}

    // Show local orders instantly while API loads
    if (localOrders.length > 0) {
      renderOrderResults(localOrders, container);
    }

    var handleResults = function(apiOrders) {
      // Create Device Fingerprint to verify the request came from the same physical device
      var sw = window.screen.width || 0;
      var sh = window.screen.height || 0;
      var expectedDevId = parseInt(Math.min(sw, sh) + '' + Math.max(sw, sh) + '' + (window.screen.colorDepth || 24)).toString(36).toUpperCase();

      // Filter API orders to only allow those matching the same physical device (cross-browser compatible)
      // NOTE: Because the backend overwrites the Order ID, we only apply this protection if the Order ID 
      // contains our fingerprint format. If it's a backend-generated WEB- order, we allow it for now.
      var secureApiOrders = (apiOrders || []).filter(function(o) {
        var oid = o.orderId || o.orderID || '';
        // If it starts with YARZ-WEB, enforce fingerprint. If it's pure WEB-, it's from backend.
        if (oid.indexOf('YARZ-WEB') !== -1) {
          return oid.indexOf(expectedDevId) !== -1;
        }
        return true; 
      });

      // ✅ v4.7 CRITICAL FIX: Merge — API data (live status from sheet) takes
      //    PRIORITY over localStorage. Earlier the local "Pending" record kept
      //    overshadowing the admin-updated status. Now:
      //      1) Start with API orders (always live status, courier, updated, activity).
      //      2) Sync the matching localStorage record with the latest API status,
      //         so even offline reloads remember the new status.
      //      3) Only add local orders that are NOT yet present in the API result.
      var merged = [].concat(secureApiOrders);

      // Step 2 — Update localStorage records with the live status/courier
      try {
        var allLocal = JSON.parse(localStorage.getItem('yarz_my_orders') || '[]');
        var localChanged = false;
        secureApiOrders.forEach(function(ao) {
          allLocal.forEach(function(lo) {
            var matchById   = (ao.orderId && lo.orderId && ao.orderId === lo.orderId);
            var matchByMeta = (ao.phone === lo.phone) &&
                              ((ao.product || ao.productName) === (lo.product || lo.productName)) &&
                              (String(ao.size||'') === String(lo.size||''));
            if (matchById || matchByMeta) {
              if (ao.status   && lo.status   !== ao.status)   { lo.status   = ao.status;   localChanged = true; }
              if (ao.courier  && lo.courier  !== ao.courier)  { lo.courier  = ao.courier;  localChanged = true; }
              if (ao.updated  && lo.updated  !== ao.updated)  { lo.updated  = ao.updated;  localChanged = true; }
              if (ao.activity && lo.activity !== ao.activity) { lo.activity = ao.activity; localChanged = true; }
              // Adopt the backend orderId so future matches stay reliable
              if (ao.orderId && lo.orderId !== ao.orderId) { lo.orderId = ao.orderId; localChanged = true; }
            }
          });
        });
        if (localChanged) {
          localStorage.setItem('yarz_my_orders', JSON.stringify(allLocal));
        }
        // Refresh in-memory copy with the synced version for the rest of merge
        localOrders = allLocal.filter(function(o){ return o.phone === phone; });
      } catch(e) {}

      // Step 3 — Add local-only orders (not yet returned by API, e.g. just placed)
      localOrders.forEach(function(lo) {
        var exists = merged.some(function(mo) { 
          // Match by phone, product, and size to handle cases where backend generates a new Order ID
          return (mo.phone === lo.phone) && 
                 ((mo.product || mo.productName) === (lo.product || lo.productName)) &&
                 (String(mo.size||'') === String(lo.size||''));
        });
        if (!exists) merged.push(lo);
      });

      // ✅ Sort newest first (by placedAt timestamp, then ISO date string)
      merged.sort(function(a,b){
        var ta = a.placedAt || Date.parse(a.date || a.updated || 0) || 0;
        var tb = b.placedAt || Date.parse(b.date || b.updated || 0) || 0;
        return tb - ta;
      });

      if (merged.length > 0) {
        renderOrderResults(merged, container);
      } else {
        container.innerHTML = '<div class="text-center mt-24" style="color:var(--text-muted);font-size:13px;">' +
          '<p>No orders found for this phone number</p>' +
          '<p style="font-size:11px;margin-top:4px;font-family:var(--font-bengali);">এই ফোন নম্বরে কোনো অর্ডার পাওয়া যায়নি</p></div>';
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
    };

    if (!YARZ_API.isConfigured()) {
      handleResults([]);
      return;
    }

    // ✅ v4.7: Always force-fresh — every search & every poll bypasses the
    //    cache so the admin's status change reaches the customer instantly.
    YARZ_API.getOrdersByPhone(phone, true).then(function (result) {
      if (result.fallback) {
        handleResults([]);
        return;
      }
      // Apps Script returns { success, data: [...] } — normalize to .orders
      var rows = result.orders || result.data || [];
      handleResults(rows);
    }).catch(function (err) {
      console.error('Track error:', err);
      // Fallback to local on error
      if (localOrders.length > 0) {
        handleResults([]);
      } else {
        container.innerHTML = '<div class="text-center mt-24" style="color:var(--danger);font-size:13px;">Error loading orders. Please try again.</div>';
        if (btn) { btn.disabled = false; btn.textContent = 'Search Orders'; }
      }
    });
  }

  // ✅ v4.7: Format any date input (ISO string, epoch ms, Date object, Sheet
  //          formatted string "yyyy-MM-dd HH:mm:ss", DD/MM/YYYY) into
  //          Bangladesh local time, e.g. "03 May 2026, 02:45 PM".
  function _fmtBdDate(input) {
    if (!input) return '';
    var d = null;
    try {
      if (input instanceof Date) {
        d = input;
      } else if (typeof input === 'number') {
        d = new Date(input);
      } else if (typeof input === 'string') {
        var s = input.trim();
        if (!s) return '';
        // Sheet returns "yyyy-MM-dd HH:mm:ss" (no timezone) — treat as Bangladesh local
        var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
        if (m) {
          // Build a UTC Date that represents the BD wall-clock by subtracting +06:00
          d = new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4]-6, +m[5], +(m[6]||0)));
        } else {
          // DD/MM/YYYY (legacy localStorage entries from <v4.7)
          var dm = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
          if (dm) {
            d = new Date(Date.UTC(+dm[3], +dm[2]-1, +dm[1], 0-6, 0, 0));
          } else {
            d = new Date(s); // ISO string or anything Date can parse
          }
        }
      } else {
        return String(input);
      }
      if (!d || isNaN(d.getTime())) return String(input);
      // Format in Bangladesh timezone (UTC+6) regardless of viewer's locale
      return d.toLocaleString('en-GB', {
        timeZone: 'Asia/Dhaka',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
      });
    } catch(e) { return String(input); }
  }

  function renderOrderResults(orders, container) {
    var html = '<div style="margin-top:16px;">' +
      '<p style="font-size:12px;color:var(--text-muted);margin-bottom:12px;font-family:var(--font-bengali);">মোট ' + orders.length + ' টি অর্ডার পাওয়া গেছে</p>';

    orders.forEach(function (o) {
      var rawStatus = o.status || 'Pending';
      var statusClass = rawStatus.toLowerCase().replace(/\s+/g, '');
      var prodName = escHtml(o.product || o.productName || '');
      var safeName = prodName.replace(/'/g, "\\'");
      var price = parseFloat(o.price) || 0;
      var delivery = parseFloat(o.delivery) || 0;
      var total = parseFloat(o.total || o.totalAmount) || 0;
      var qty = parseInt(o.qty) || 1;
      var payment = o.payment || 'COD';
      var isPaid = payment === 'bKash' || payment === 'Nagad';

      // ✅ v4.7: Full Bengali Status palette (Pending, Confirmed, Processing, Picked Up, Shipped, Delivered, Cancelled, Returned)
      var statusText = '';
      var statusBadge = '';
      switch(rawStatus.toLowerCase()) {
        case 'pending': 
          statusText = 'আপনার অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে।';
          statusBadge = '<span style="color:#059669;background:rgba(5,150,105,0.1);padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;">✅ অর্ডার কনফার্ম</span>';
          break;
        case 'confirmed':
          statusText = 'আপনার অর্ডারটি কনফার্ম করা হয়েছে। শীঘ্রই প্রসেসিং শুরু হবে।';
          statusBadge = '<span style="color:#0891B2;background:rgba(8,145,178,0.12);padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;">✔️ Confirmed</span>';
          break;
        case 'processing':
          statusText = 'অর্ডারটি কনফার্ম হয়েছে এবং প্যাকেজিংয়ের কাজ চলছে।';
          statusBadge = '<span style="color:#2563EB;background:rgba(37,99,235,0.1);padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;">📦 Processing</span>';
          break;
        case 'picked up':
        case 'pickedup':
          statusText = 'আপনার অর্ডারটি রেডি করে কুরিয়ারে দেওয়া হয়েছে।';
          statusBadge = '<span style="color:#4F46E5;background:rgba(79,70,229,0.1);padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;">🤝 Picked Up</span>';
          break;
        case 'shipped':
          statusText = 'অর্ডারটি আপনার ঠিকানায় ডেলিভারির জন্য পাঠানো হয়েছে।';
          statusBadge = '<span style="color:#7C3AED;background:rgba(124,58,237,0.1);padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;">🚚 Shipped</span>';
          break;
        case 'delivered':
          statusText = 'আপনার অর্ডারটি সফলভাবে ডেলিভারি করা হয়েছে। ধন্যবাদ! 🎉';
          statusBadge = '<span style="color:#059669;background:rgba(5,150,105,0.1);padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;">✅ Delivered</span>';
          break;
        case 'returned':
          statusText = 'অর্ডারটি রিটার্ন করা হয়েছে।';
          statusBadge = '<span style="color:#DC2626;background:rgba(220,38,38,0.1);padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;">↩️ Returned</span>';
          break;
        case 'cancelled':
        case 'canceled':
          statusText = 'আপনার অর্ডারটি ক্যান্সেল করা হয়েছে।';
          statusBadge = '<span style="color:#DC2626;background:rgba(220,38,38,0.1);padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;">❌ Cancelled</span>';
          break;
        default:
          statusText = rawStatus;
          statusBadge = '<span style="color:var(--text-muted);background:var(--surface-1);padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;">' + escHtml(rawStatus) + '</span>';
      }

      // If total is 0, try to calculate from price
      if (total === 0 && price > 0) total = (price * qty) + delivery;

      // ✅ v4.1: Convert raw timestamp → human-readable Bangladesh time
      var displayDate = _fmtBdDate(o.date || o.orderDate || o.timestamp || '');

      html += '<div class="order-card" style="border:1px solid var(--border-light);border-radius:12px;padding:16px;margin-bottom:12px;background:var(--bg-card);box-shadow:0 1px 4px rgba(0,0,0,0.04);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<span style="font-size:11px;font-weight:700;color:var(--brand);letter-spacing:0.5px;">#' + escHtml(o.orderId || o.orderID || '') + '</span>' +
        statusBadge + '</div>' +
        '<div style="font-size:10px;color:var(--text-muted);margin-bottom:10px;">📅 ' + escHtml(displayDate) + '</div>';

      // Status descriptive text
      html += '<div style="font-family:var(--font-bengali);font-size:12.5px;color:var(--ink-2);background:var(--surface-50);padding:8px 12px;border-radius:8px;border-left:3px solid var(--brand);margin-bottom:12px;line-height:1.5;">' + statusText + '</div>';

      // Product name (clickable)
      if (prodName) {
        html += '<div style="font-size:13px;font-weight:600;color:var(--ink-1);margin-bottom:8px;cursor:pointer;text-decoration:underline;text-underline-offset:2px;" onclick="YARZ.openProduct(\'' + safeName + '\')">' +
          prodName + (o.size ? ' <span style="color:var(--text-muted);font-weight:400;">(' + escHtml(o.size) + ')</span>' : '') +
          (qty > 1 ? ' <span style="color:var(--text-muted);font-weight:400;">x' + qty + '</span>' : '') + '</div>';
      }

      // Price breakdown
      html += '<div style="background:var(--surface-1);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px;">';
      if (price > 0) {
        html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:var(--text-muted);">প্রোডাক্ট মূল্য</span><span style="font-weight:600;">' + formatPrice(price * qty) + '</span></div>';
      }
      if (delivery > 0) {
        if (isPaid) {
          html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:var(--text-muted);">ডেলিভারি চার্জ</span><span style="color:var(--success);font-weight:600;text-decoration:line-through;">' + formatPrice(delivery) + ' <span style="font-size:10px;text-decoration:none;">✅ Paid</span></span></div>';
        } else {
          html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="color:var(--text-muted);">ডেলিভারি চার্জ</span><span style="font-weight:600;">' + formatPrice(delivery) + '</span></div>';
        }
      }
      var displayTotal = isPaid ? (price * qty) : total;
      html += '<div style="display:flex;justify-content:space-between;padding-top:6px;border-top:1px dashed var(--border-light);font-weight:700;color:var(--ink-1);font-size:13px;"><span>মোট ' + (isPaid ? '(বাকি)' : '') + '</span><span style="color:var(--brand);">' + formatPrice(displayTotal) + '</span></div>';
      html += '</div>';

      // Payment method badge
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">' +
        '<span style="font-size:10px;padding:2px 8px;border-radius:12px;background:' + (isPaid ? 'rgba(5,150,105,0.1);color:var(--success)' : 'rgba(217,119,6,0.1);color:#D97706') + ';font-weight:600;">' + escHtml(payment) + '</span>';
      if (o.courier) {
        html += '<span style="font-size:10px;padding:2px 8px;border-radius:12px;background:rgba(99,74,142,0.1);color:var(--brand);font-weight:600;">🚚 ' + escHtml(o.courier) + '</span>';
      }
      html += '</div>';

      // ✅ v4.3: Customer can NO longer cancel/remove orders after placing them
      html += '<div style="text-align:right;">';
      html += '<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-bengali);">অর্ডার বাতিল করতে হলে আমাদের কল করুন</span>';
      html += '</div></div>';
    });

    html += '</div>';
    container.innerHTML = html;
  }

  // ===== CANCEL ORDER =====
  function cancelOrder(orderId) {
    if (!orderId) return;

    // ✅ v4.1 GUARD: Double-check status from latest data before allowing cancel.
    //    Prevents the race condition where customer cancels AFTER admin pickup
    //    (because their UI was showing stale data).
    try {
      var localOrders = JSON.parse(localStorage.getItem('yarz_my_orders') || '[]');
      var found = localOrders.filter(function(o){
        return (o.orderId === orderId || o.orderID === orderId);
      })[0];
      if (found && found.status && String(found.status).toLowerCase() !== 'pending') {
        showToast('এই অর্ডারটি ইতিমধ্যে প্রসেসিং হচ্ছে — ক্যান্সেল করা যাবে না।', 'warning');
        // Force a refresh so user sees the new status
        try { YARZ_API.clearCache(); } catch(e){}
        searchOrders(true);
        return;
      }
    } catch(e){}

    // Use custom confirm modal instead of browser confirm
    var confirmModal = $('#custom-confirm-modal');
    if (confirmModal) {
      var msgEl = $('#custom-confirm-msg');
      if (msgEl) {
        msgEl.innerHTML = '<div style="font-family:var(--font-bengali);font-size:13px;color:var(--text-secondary);line-height:1.6;">' +
          'আপনি কি <strong>#' + escHtml(orderId) + '</strong> অর্ডারটি রিমুভ করতে চান?<br>' +
          '<span style="font-size:11px;color:var(--text-muted);">রিমুভ করলে অর্ডারটি আমাদের সিস্টেম থেকেও মুছে যাবে।</span></div>';
      }
      var headingEl = confirmModal.querySelector('h3');
      if (headingEl) headingEl.textContent = 'অর্ডার রিমুভ করবেন?';

      var yesBtn = $('#custom-confirm-yes-btn');
      if (yesBtn) {
        var newYesBtn = yesBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
        newYesBtn.textContent = 'হ্যাঁ, রিমুভ করুন';
        newYesBtn.style.background = 'var(--danger)';
        newYesBtn.addEventListener('click', function() {
          confirmModal.classList.remove('active');
          _executeCancelOrder(orderId);
        });
      }
      confirmModal.classList.add('active');
    } else {
      if (!window.confirm('আপনি কি এই অর্ডারটি রিমুভ করতে চান?')) return;
      _executeCancelOrder(orderId);
    }
  }

  function _executeCancelOrder(orderId) {
    showToast('রিমুভ হচ্ছে...', 'info');

    // ✅ v4.1: Server-side will reject delete if status moved past Pending.
    //   So we call the API FIRST and only remove from localStorage if server agrees.
    if (YARZ_API.isConfigured()) {
      // Force-fresh status check before delete
      try { YARZ_API.clearCache(); } catch(e){}
      YARZ_API.deleteOrder(orderId).then(function(res) {
        // Server returns success:false + locked:true when status > Pending
        if (res && res.locked) {
          showToast('এই অর্ডারটি ইতিমধ্যে পিকআপ/প্রসেস হয়েছে — রিমুভ করা যাবে না।', 'warning');
          searchOrders(true);
          return;
        }
        // Server agreed → safe to remove from localStorage
        try {
          var localOrders = JSON.parse(localStorage.getItem('yarz_my_orders') || '[]');
          var updatedLocalOrders = localOrders.filter(function(o) {
            return o.orderId !== orderId && o.orderID !== orderId;
          });
          localStorage.setItem('yarz_my_orders', JSON.stringify(updatedLocalOrders));
        } catch(err) {}
        localStorage.removeItem('yarz_last_order_sig');
        localStorage.removeItem('yarz_last_order_sig_time');
        localStorage.removeItem('yarz_last_order');
        showToast('অর্ডার সফলভাবে রিমুভ করা হয়েছে।', 'success');
        searchOrders();
      }).catch(function(err) {
        console.error('Failed to delete order from backend', err);
        // Network error → don't remove from localStorage either, ask user to retry
        showToast('সংযোগ সমস্যা — পুনরায় চেষ্টা করুন।', 'error');
      });
    } else {
      // Offline mode (no API) — just clean local storage
      try {
        var localOrders = JSON.parse(localStorage.getItem('yarz_my_orders') || '[]');
        var updatedLocalOrders = localOrders.filter(function(o) {
          return o.orderId !== orderId && o.orderID !== orderId;
        });
        localStorage.setItem('yarz_my_orders', JSON.stringify(updatedLocalOrders));
      } catch(err) {}
      localStorage.removeItem('yarz_last_order_sig');
      localStorage.removeItem('yarz_last_order_sig_time');
      localStorage.removeItem('yarz_last_order');
      showToast('অর্ডার সফলভাবে রিমুভ করা হয়েছে।', 'success');
      searchOrders();
    }
  }

  // ===== USER PROFILE =====
  function openProfile() {
    if (!state.user) {
      openTracking();
      return;
    }

    var u = state.user;
    var html = '<div class="tracking-section">' +
      '<div class="page-header" style="border:none;margin-bottom:16px;"><h1>My Account</h1></div>' +
      '<div class="tracking-card" style="margin-bottom:16px;">' +
      '<h3 style="font-size:14px;font-weight:600;margin-bottom:12px;">Profile Information</h3>' +
      '<div style="font-size:13px;color:var(--text-secondary);line-height:1.8;">';

    if (u.name) html += '<div><strong>Name:</strong> ' + escHtml(u.name) + '</div>';
    if (u.phone) html += '<div><strong>Phone:</strong> ' + escHtml(u.phone) + '</div>';
    if (u.email) html += '<div><strong>Email:</strong> ' + escHtml(u.email) + '</div>';
    if (u.address) html += '<div><strong>Address:</strong> ' + escHtml(u.address) + '</div>';

    html += '</div><div style="margin-top:12px;display:flex;gap:8px;">' +
      '<button class="btn btn-outline btn-sm" onclick="YARZ.openTracking()">My Orders</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="YARZ.logout()">Logout</button></div></div></div>';

    showView('profile', html);
  }

  function logout() {
    state.user = null;
    localStorage.removeItem('yarz_user');
    updateUserUI();
    goHome();
    showToast('Logged out successfully');
  }

  // ===== HEADER SCROLL =====
  function initHeaderScroll() {
    var header = $('.site-header');
    if (!header) return;
    window.addEventListener('scroll', function () {
      header.classList.toggle('scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  // ===== PAYMENT INFO BOX =====
  function showPaymentInfo(method) {
    // Remove existing box if any
    var existing = $('#payment-info-box');
    if (existing) existing.remove();

    var paymentField = $('#co-payment');
    if (!paymentField) return;
    var parent = paymentField.closest('.form-group') || paymentField.parentNode;

    if (method === 'bKash') {
      var box = document.createElement('div');
      box.id = 'payment-info-box';
      box.className = 'payment-info-box bkash';
      box.innerHTML =
        '<div class="pay-title" style="display:flex;align-items:center;gap:6px;">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21.93 7.82L16.48 2.37C15.65 1.54 14.35 1.54 13.52 2.37L2.37 13.52C1.54 14.35 1.54 15.65 2.37 16.48L7.82 21.93C8.65 22.76 9.95 22.76 10.78 21.93L21.93 10.78C22.76 9.95 22.76 8.65 21.93 7.82Z" fill="#E2136E"/><path d="M12 17.5C8.96 17.5 6.5 15.04 6.5 12C6.5 8.96 8.96 6.5 12 6.5C15.04 6.5 17.5 8.96 17.5 12C17.5 15.04 15.04 17.5 12 17.5ZM12 8C9.79 8 8 9.79 8 12C8 14.21 9.79 16 12 16C14.21 16 16 14.21 16 12C16 9.79 14.21 8 12 8Z" fill="white"/></svg>' +
        'bKash Payment Instructions' +
        '</div>' +
        '<div class="pay-number">bKash: 01601-743670</div>' +
        '<div class="pay-instruction">' +
        '1. আপনার bKash থেকে Send Money করুন<br>' +
        '2. Amount: আপনার অর্ডার টোটাল<br>' +
        '3. Reference: আপনার ফোন নম্বর<br>' +
        '4. Transaction ID টি নিচের বক্সে দিন' +
        '</div>' +
        '<div style="margin-top:12px;"><label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Transaction ID <span class="required">*</span></label>' +
        '<input type="text" id="co-trxid" class="form-input" placeholder="e.g. 9BXX082XX" style="border-color:#E2136E;"></div>';
      parent.appendChild(box);
    } else if (method === 'Nagad') {
      var box = document.createElement('div');
      box.id = 'payment-info-box';
      box.className = 'payment-info-box nagad';
      box.innerHTML =
        '<div class="pay-title" style="display:flex;align-items:center;gap:6px;">' +
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="4" fill="#ED1C24"/><path d="M16.5 15.5C16.5 15.5 15 17 12 17C9 17 7.5 15.5 7.5 15.5" stroke="white" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="10" r="1.5" fill="white"/><circle cx="15" cy="10" r="1.5" fill="white"/></svg>' +
        'Nagad Payment Instructions' +
        '</div>' +
        '<div class="pay-number">Nagad: 01601-743670</div>' +
        '<div class="pay-instruction">' +
        '1. আপনার Nagad থেকে Send Money করুন<br>' +
        '2. Amount: আপনার অর্ডার টোটাল<br>' +
        '3. Reference: আপনার ফোন নম্বর<br>' +
        '4. Transaction ID টি নিচের বক্সে দিন' +
        '</div>' +
        '<div style="margin-top:12px;"><label style="font-size:11px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Transaction ID <span class="required">*</span></label>' +
        '<input type="text" id="co-trxid" class="form-input" placeholder="e.g. 7NXX123XX" style="border-color:#ED1C24;"></div>';
      parent.appendChild(box);
    } else if (method === 'COD') {
      // ✅ FIX v3.1: Use centralized isCODEnabled() check
      if (!isCODEnabled()) {
        var box = document.createElement('div');
        box.id = 'payment-info-box';
        box.className = 'payment-info-box restricted-cod';
        box.style.background = 'linear-gradient(135deg, rgba(255, 152, 0, 0.08) 0%, rgba(255, 152, 0, 0.02) 100%)';
        box.style.border = '1px solid rgba(255, 152, 0, 0.3)';
        box.style.borderRadius = '12px';
        box.style.padding = '18px';
        box.style.marginTop = '12px';
        box.innerHTML = 
          '<div style="color:#E65100; font-weight:700; font-size:14px; display:flex; align-items:center; gap:8px; margin-bottom:10px;">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"/></svg>' +
            'আংশিক ক্যাশ অন ডেলিভারি' +
          '</div>' +
          '<div style="color:#B26A00; font-size:12.5px; line-height:1.6; font-family:var(--font-bengali);">' +
            'কিছু অসাধু ক্রেতার কারণে আমাদের সম্পূর্ণ ক্যাশ অন ডেলিভারি সাময়িকভাবে বন্ধ রয়েছে। ' +
            '<br><br>' +
            '<strong style="color:#E65100;">তবে চিন্তার কিছু নেই!</strong> আপনি শুধুমাত্র <strong style="color:#E65100;">ডেলিভারি চার্জটি</strong> অগ্রিম প্রদান করে অর্ডার কনফার্ম করতে পারবেন। প্রোডাক্টের বাকি মূল্য প্রোডাক্ট হাতে পেয়ে ডেলিভারিম্যানকে দিবেন।' +
            '<br><br>' +
            '<div style="background:rgba(255, 152, 0, 0.1); padding:10px; border-radius:8px; text-align:center; font-weight:600; color:#E65100; font-size:13px; border:1px dashed rgba(255, 152, 0, 0.4);">' +
              'দয়া করে উপরের অপশন থেকে <b>bKash</b> বা <b>Nagad</b> সিলেক্ট করে ডেলিভারি চার্জ প্রদান করুন।' +
            '</div>' +
          '</div>';
        parent.appendChild(box);
      }
    }
  }


  // ===== SEO & PIXEL TRACKING INJECTION =====
  // Reads admin-saved settings from Google Sheets and injects pixel/tracking codes
  // Called once on page load — each tag is protected by a unique id to prevent duplicates
  function injectSEOAndTracking(raw) {
    if (!raw) return;
    function sg(key) { return String(raw[key] || '').trim(); }

    // -- Meta Title (overrides store name if set) --
    var metaTitle = sg('meta_title');
    if (metaTitle) {
      document.title = metaTitle;
      var ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.content = metaTitle;
    }

    // -- Meta Description --
    var metaDesc = sg('meta_desc');
    if (metaDesc) {
      var md = document.querySelector('meta[name="description"]');
      if (md) { md.content = metaDesc; }
      else {
        var nm = document.createElement('meta'); nm.name = 'description'; nm.content = metaDesc;
        document.head.appendChild(nm);
      }
      var ogD = document.querySelector('meta[property="og:description"]');
      if (ogD) { ogD.content = metaDesc; }
      else {
        var nod = document.createElement('meta');
        nod.setAttribute('property','og:description'); nod.content = metaDesc;
        document.head.appendChild(nod);
      }
    }

    // -- OG Image (Social Sharing) --
    var ogImage = sg('og_image');
    if (ogImage) {
      var imgSrc = getImgSrc(ogImage);
      var ogImg = document.querySelector('meta[property="og:image"]');
      if (ogImg) { ogImg.content = imgSrc; }
      else {
        var noi = document.createElement('meta');
        noi.setAttribute('property','og:image'); noi.content = imgSrc;
        document.head.appendChild(noi);
      }
    }

    // -- Google Search Console Verification --
    var gscTag = sg('gsc_tag');
    if (gscTag && !document.getElementById('yarz-gsc')) {
      var tmp = document.createElement('div');
      tmp.innerHTML = gscTag;
      var gscMeta = tmp.querySelector('meta');
      if (gscMeta) { gscMeta.id = 'yarz-gsc'; document.head.appendChild(gscMeta); }
    }

    // -- Facebook Pixel (fbq) --
    var fbPixel = sg('fb_pixel');
    if (fbPixel && !document.getElementById('yarz-fb-pixel')) {
      var fbScript = document.createElement('script');
      fbScript.id = 'yarz-fb-pixel';
      fbScript.innerHTML = '!function(f,b,e,v,n,t,s)' +
        '{if(f.fbq)return;n=f.fbq=function(){n.callMethod?' +
        'n.callMethod.apply(n,arguments):n.queue.push(arguments)};' +
        'if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version=\'2.0\';' +
        'n.queue=[];t=b.createElement(e);t.async=!0;' +
        't.src=v;s=b.getElementsByTagName(e)[0];' +
        's.parentNode.insertBefore(t,s)}(window, document,\'script\',' +
        '\'https://connect.facebook.net/en_US/fbevents.js\');' +
        'fbq(\'init\', \'' + fbPixel + '\');' +
        'fbq(\'track\', \'PageView\');';
      document.head.appendChild(fbScript);
      var fbNs = document.createElement('noscript');
      fbNs.innerHTML = '<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=' + fbPixel + '&ev=PageView&noscript=1">';
      document.head.appendChild(fbNs);
      console.log('YARZ: Facebook Pixel (' + fbPixel + ') injected.');
    }

    // -- Google Analytics 4 (GA4 / gtag.js) --
    var ga4Id = sg('ga4');
    if (ga4Id && !document.getElementById('yarz-ga4')) {
      var gaScr = document.createElement('script');
      gaScr.id = 'yarz-ga4'; gaScr.async = true;
      gaScr.src = 'https://www.googletagmanager.com/gtag/js?id=' + ga4Id;
      document.head.appendChild(gaScr);
      var gaInline = document.createElement('script');
      gaInline.innerHTML = 'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag(\'js\',new Date());gtag(\'config\',\'' + ga4Id + '\');';
      document.head.appendChild(gaInline);
      console.log('YARZ: GA4 (' + ga4Id + ') injected.');
    }

    // -- TikTok Pixel --
    var ttPixel = sg('tt_pixel');
    if (ttPixel && !document.getElementById('yarz-tt-pixel')) {
      var ttScr = document.createElement('script');
      ttScr.id = 'yarz-tt-pixel';
      ttScr.innerHTML = '!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];' +
        'ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];' +
        'ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};' +
        'for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);' +
        'ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};' +
        'ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";' +
        'ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;' +
        'ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement("script");' +
        'o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;' +
        'var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};' +
        'ttq.load(\'' + ttPixel + '\');ttq.page();}(window,document,\'ttq\');';
      document.head.appendChild(ttScr);
      console.log('YARZ: TikTok Pixel (' + ttPixel + ') injected.');
    }

    // -- Snapchat Pixel --
    var snapPixel = sg('snapchat_pixel');
    if (snapPixel && !document.getElementById('yarz-snap-pixel')) {
      var snapScr = document.createElement('script');
      snapScr.id = 'yarz-snap-pixel';
      snapScr.innerHTML = '(function(e,t,n){if(e.snaptr)return;' +
        'var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};' +
        'a.queue=[];var s="script",r=t.createElement(s);r.async=!0;' +
        'r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u);' +
        '})(window,document,"https://sc-static.net/scevent.min.js");' +
        'snaptr("init","' + snapPixel + '",{});snaptr("track","PAGE_VIEW");';
      document.head.appendChild(snapScr);
      console.log('YARZ: Snapchat Pixel (' + snapPixel + ') injected.');
    }

    // -- Pinterest Tag --
    var pinPixel = sg('pinterest_pixel');
    if (pinPixel && !document.getElementById('yarz-pin-pixel')) {
      var pinScr = document.createElement('script');
      pinScr.id = 'yarz-pin-pixel';
      pinScr.innerHTML = '!function(e){if(!window.pintrk){window.pintrk=function(){window.pintrk.queue.push(Array.prototype.slice.call(arguments))};' +
        'var n=window.pintrk;n.queue=[],n.version="3.0";' +
        'var t=document.createElement("script");t.async=!0,t.src=e;' +
        'var r=document.getElementsByTagName("script")[0];r.parentNode.insertBefore(t,r)}}' +
        '("https://s.pinimg.com/ct/core.js");' +
        'pintrk("load","' + pinPixel + '");pintrk("page");';
      document.head.appendChild(pinScr);
      console.log('YARZ: Pinterest Tag (' + pinPixel + ') injected.');
    }

    // -- Instagram / Meta Secondary Pixel --
    var igPixel = sg('ig_pixel');
    if (igPixel && igPixel !== fbPixel && !document.getElementById('yarz-ig-pixel')) {
      var igScript = document.createElement('script');
      igScript.id = 'yarz-ig-pixel';
      igScript.innerHTML = '!function(f,b,e,v,n,t,s)' +
        '{if(f.fbq)return;n=f.fbq=function(){n.callMethod?' +
        'n.callMethod.apply(n,arguments):n.queue.push(arguments)};' +
        'if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version=\'2.0\';' +
        'n.queue=[];t=b.createElement(e);t.async=!0;' +
        't.src=v;s=b.getElementsByTagName(e)[0];' +
        's.parentNode.insertBefore(t,s)}(window, document,\'script\',' +
        '\'https://connect.facebook.net/en_US/fbevents.js\');' +
        'fbq(\'init\', \'' + igPixel + '\');' +
        'fbq(\'track\', \'PageView\');';
      document.head.appendChild(igScript);
      console.log('YARZ: Instagram/Meta Pixel (' + igPixel + ') injected.');
    } else if (igPixel && igPixel === fbPixel && window.fbq) {
      // Same pixel — FB pixel already handles Instagram too, no duplicate needed
      console.log('YARZ: IG Pixel is same as FB Pixel, no duplicate injection needed.');
    }

    // -- Custom CSS (from admin Code Injection field) --
    var customCss = sg('custom_css');
    if (customCss && !document.getElementById('yarz-custom-css')) {
      var style = document.createElement('style');
      style.id = 'yarz-custom-css';
      style.textContent = customCss;
      document.head.appendChild(style);
      console.log('YARZ: Custom CSS injected.');
    }
  }

  // ===== HERO BANNERS FROM API =====
  function loadHeroBanners() {
    if (!YARZ_API.isConfigured()) return Promise.resolve();
    return YARZ_API.getGlobalControls().then(function (controls) {
      if (!controls) return;

      var store = controls.raw || {};
      state.storeInfo = Object.assign({}, store, {
        zone1Name: controls.zone1Name,
        zone2Name: controls.zone2Name,
        zone1Charge: controls.zone1Charge,
        zone2Charge: controls.zone2Charge,
        deliveryLocations: controls.deliveryLocations || [],
        // ✅ v4.2: Explicitly inject enableCOD so isCODEnabled() can read it directly
        enableCOD: controls.enableCOD,
        enable_cod: store.enable_cod !== undefined ? store.enable_cod : (controls.enableCOD ? 'true' : 'false'),
        freeShipAmt: controls.freeShipAmt || 0,
        raw: store
      });

      // ── Announcement Bar ──
      if (controls.announcementActive && controls.announcementText) {
        var bar = $('.announcement-bar');
        if (bar) {
          var span = bar.querySelector('span');
          if (span) span.textContent = controls.announcementText;
          bar.classList.add('active');
        }
      }

      // ── Hero Banners ──
      var banners = controls.heroBanners;
      // Fallback: try raw store keys directly
      if (!banners || banners.length === 0) {
        banners = [];
        for (var i = 1; i <= 5; i++) {
          var imgKey = 'hero_banner_' + i;
          var titleKey = 'banner_title_' + i;
          var linkKey = 'banner_link_' + i;
          if (store[imgKey]) {
            banners.push({
              image: store[imgKey],
              title: store[titleKey] || '',
              link: store[linkKey] || '',
              subtitle: ''
            });
          }
        }
      }

      if (banners.length > 0) {
        var slider = $('#hero-slider');
        var dotsContainer = $('#slider-dots');
        if (slider && dotsContainer) {
          slider.innerHTML = banners.map(function (b, i) {
            // Create banner image — process URL same as product images
            var bannerSrc = getImgSrc(b.image);
            var imgHtml = '<img src="' + escHtml(bannerSrc) + '" alt="' + escHtml(b.title) + '" loading="' + (i === 0 ? 'eager' : 'lazy') + '" onerror="this.style.display=\'none\'">';

            // Create banner overlay content
            var overlayHtml = '';
            if (b.title || b.subtitle) {
              overlayHtml = '<div class="banner-overlay">' +
                '<div class="banner-content">' +
                (b.title ? '<h2 class="banner-title">' + escHtml(b.title) + '</h2>' : '') +
                (b.subtitle ? '<p class="banner-subtitle">' + escHtml(b.subtitle) + '</p>' : '') +
                '<button class="banner-cta">Shop Now</button>' +
                '</div>' +
                '</div>';
            }

            // Wrap in link if provided
            var innerHtml = imgHtml + overlayHtml;
            if (b.link) {
              innerHtml = '<a href="' + escHtml(b.link) + '" class="banner-link">' + innerHtml + '</a>';
            }

            return '<div class="slide' + (i === 0 ? ' active' : '') + '">' + innerHtml + '</div>';
          }).join('');

          dotsContainer.innerHTML = banners.map(function (_, i) {
            return '<button class="slider-dot' + (i === 0 ? ' active' : '') + '" aria-label="Slide ' + (i + 1) + '"></button>';
          }).join('');

          initHeroSlider();
        }
      } else {
        // No banners from API, keep default placeholder
        console.log('YARZ: No banners found in API, using default placeholder');
      }
    }).catch(function (err) {
      console.warn('YARZ: Could not load hero banners:', err);
      // Keep default placeholder on error
    });
  }

  // ===== IN-APP BROWSER DETECTOR v3.5 (Chrome-First, Android + iOS) =====
  // ✅ Detects Facebook/Instagram/Messenger in-app browsers on BOTH iOS & Android
  // ✅ On Android: Auto-tries to launch Chrome via intent:// URL (no banner needed)
  // ✅ On iOS: Shows non-blocking banner suggesting Chrome (then Safari fallback)
  // ✅ Persists user data via localStorage so orders survive browser switching
  function initInAppBrowserWarning() {
    var ua = navigator.userAgent || navigator.vendor || window.opera || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    var isAndroid = /Android/i.test(ua);
    var isInApp = (
      ua.indexOf('FBAV') > -1 ||
      ua.indexOf('FBIOS') > -1 ||
      ua.indexOf('FB_IAB') > -1 ||
      ua.indexOf('FBAN') > -1 ||
      ua.indexOf('Instagram') > -1 ||
      ua.indexOf('Messenger') > -1 ||
      ua.indexOf('MessengerLiteForiOS') > -1
    );

    if (!isInApp) return;
    if (sessionStorage.getItem('yarz_browser_switch_dismissed')) return;
    if (document.getElementById('yarz-browser-switch-banner')) return;

    var currentUrl = window.location.href;

    // ─── ANDROID: Auto-redirect to Chrome via intent:// ───
    if (isAndroid) {
      // Try Chrome intent first
      var chromeIntent = 'intent://' + window.location.host + window.location.pathname + window.location.search + window.location.hash +
        '#Intent;scheme=https;package=com.android.chrome;end';
      // Auto-redirect after 1.5s (giving page time to render once)
      setTimeout(function () {
        try { window.location.href = chromeIntent; } catch (e) {}
      }, 1500);
    }

    // ─── BOTH iOS & ANDROID: Show non-blocking banner with action button ───
    var banner = document.createElement('div');
    banner.id = 'yarz-browser-switch-banner';
    banner.className = 'browser-switch-banner active';

    var actionUrl, actionLabel;
    if (isAndroid) {
      // googlechrome:// scheme works on Android Chrome 25+
      actionUrl = 'intent://' + window.location.host + window.location.pathname + window.location.search + window.location.hash +
                  '#Intent;scheme=https;package=com.android.chrome;end';
      actionLabel = 'Open Chrome';
    } else if (isIOS) {
      // googlechrome:// (Chrome) or googlechromes:// (https) on iOS
      actionUrl = 'googlechromes://' + currentUrl.replace(/^https?:\/\//, '');
      actionLabel = 'Open Chrome';
    } else {
      actionUrl = currentUrl;
      actionLabel = 'Open Browser';
    }

    banner.innerHTML =
      '<div class="bsb-msg">' +
        '<strong>সেরা অভিজ্ঞতার জন্য Chrome ব্যবহার করুন</strong>' +
        '<span>For the best shopping experience, please open in Chrome browser.</span>' +
      '</div>' +
      '<a href="' + escHtml(actionUrl) + '" class="bsb-btn" id="yarz-bsb-open">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><circle cx="12" cy="12" r="4"/></svg>' +
        ' ' + actionLabel +
      '</a>' +
      '<button class="bsb-close" id="yarz-bsb-close" aria-label="Close">×</button>';

    document.body.appendChild(banner);

    // Push body down so the banner doesn't cover the header
    var pushBody = function () {
      document.body.style.paddingTop = banner.offsetHeight + 'px';
    };
    pushBody();
    window.addEventListener('resize', pushBody);

    document.getElementById('yarz-bsb-close').addEventListener('click', function () {
      banner.classList.remove('active');
      document.body.style.paddingTop = '';
      sessionStorage.setItem('yarz_browser_switch_dismissed', '1');
    });

    // iOS Chrome fallback: if user taps and Chrome isn't installed, fallback to Safari
    if (isIOS) {
      document.getElementById('yarz-bsb-open').addEventListener('click', function (e) {
        var fallbackTimer = setTimeout(function () {
          // Chrome failed → just stay on current page (Safari instructions)
          alert('Chrome ইনস্টল করা নেই। Safari তে কপি করে ওপেন করুন।\n\nURL: ' + currentUrl);
        }, 2500);
        // If user comes back to this page (i.e. blur), Chrome opened — cancel fallback
        window.addEventListener('blur', function () { clearTimeout(fallbackTimer); }, { once: true });
      });
    }
  }

  // ✅ v4.1: Global popstate handler — handles browser back/forward buttons
  // so the user never lands on a blank page when navigating browser history.
  function _initPopstateHandler() {
    window.addEventListener('popstate', function () {
      try {
        var hash = window.location.hash || '';
        if (hash.indexOf('#product/') === 0) {
          var slugOrName = hash.replace('#product/', '');
          var p = findProductBySlug(slugOrName);
          if (p) { openProduct(p.name); return; }
        }
        // Any other hash (or empty) → go home safely
        goHome();
      } catch (e) {
        console.error('popstate handler error:', e);
        goHome();
      }
    });

    // ✅ Also watch for visibility change — if user switches tab and comes back,
    //   verify home view is actually visible (catches edge-case blank screens).
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && state.currentView === 'home') {
        var home = document.getElementById('home-content');
        if (home && getComputedStyle(home).display === 'none') {
          // Blank-screen recovery
          home.style.display = '';
          home.style.visibility = 'visible';
          var dyn = document.getElementById('dynamic-view');
          if (dyn) { dyn.style.display = 'none'; dyn.innerHTML = ''; }
        }
      }
    });
  }

  // ===== INIT =====
  function init() {
    // ✅ v5.0: Start background engines
    if (window.YARZ_TURBO) YARZ_TURBO.start();
    if (window.YARZ_SHIELD) YARZ_SHIELD.init();
    if (window.YARZ_PIXEL) YARZ_PIXEL.init();

    initHeaderScroll();
    updateCartCount();
    updateUserUI();
    renderCartDrawer();
    initHeroSlider();
    initMobileMenu();
    initInAppBrowserWarning();
    _initPopstateHandler(); // v4.1: prevents blank-screen on browser back button

    // ✅ v4.3 INSTANT LOAD: Show cached products + categories immediately (zero skeleton)
    // This eliminates the 10-second skeleton loading on subsequent visits
    (function _tryInstantRender() {
      try {
        var cachedStoreInfo = localStorage.getItem('yarz_storeinfo_cache');
        var cachedProducts  = localStorage.getItem('yarz_direct_cache_products'); // ✅ v4.9: Bulletproof direct cache
        var cachedCategories = localStorage.getItem('yarz_categories_cache');
        
        if (cachedProducts) {
          var parsedProducts = JSON.parse(cachedProducts);
          if (Array.isArray(parsedProducts) && parsedProducts.length > 0) {
            state.products = parsedProducts;
            
            if (cachedStoreInfo) {
              try { state.storeInfo = JSON.parse(cachedStoreInfo); } catch(e) {}
            }
            // Render instantly from cache — no skeleton needed
            updateFilterUI();
            renderProducts(state.products);
            if (state.storeInfo && Object.keys(state.storeInfo).length > 0) {
              renderDynamicSections(state.products, state.storeInfo);
            } else {
              renderDynamicSectionsSkeleton();
            }
            // v4.3: Also render categories from cache (instant tabs)
            if (cachedCategories) {
              try {
                var cats = JSON.parse(cachedCategories);
                if (Array.isArray(cats) && cats.length > 0) {
                  state.categories = cats;
                  renderCategories(cats);
                }
              } catch(e) {}
            }
            console.log('YARZ: Instant render from cache (' + state.products.length + ' products)');
            
            // ✅ v4.8 FIX: Handle hash routing instantly from cache!
            // Prevents showing the home page for 3-4 seconds before opening the product
            var hash = window.location.hash || '';
            if (hash.indexOf('#product/') === 0) {
              var slugOrName = hash.replace('#product/', '');
              var matchedP = findProductBySlug(slugOrName);
              if (matchedP) {
                setTimeout(function() { openProduct(matchedP.name); }, 50);
              }
            }
            
            return; // ← skip skeleton, go straight to API refresh
          }
        }
      } catch(e) {}
      // No cache: show skeletons while loading
      renderSkeletons('product-grid', 8);
      renderDynamicSectionsSkeleton();
    })();

    // Apply Global Controls (Maintenance Mode, Announcement, Banners)
    // This runs first to handle maintenance mode before showing anything
    YARZ_API.getGlobalControls().then(function (controls) {
      if (!controls) return;

      // Keep the latest global controls available before product/cart rendering.
      // This prevents dynamic delivery locations from being lost when cached raw settings load first.
      var rawStore = controls.raw || {};
      state.storeInfo = Object.assign({}, rawStore, {
        zone1Name: controls.zone1Name,
        zone2Name: controls.zone2Name,
        zone1Charge: controls.zone1Charge,
        zone2Charge: controls.zone2Charge,
        deliveryLocations: controls.deliveryLocations || [],
        // ✅ v4.2: Explicitly inject enableCOD so isCODEnabled() can read it directly
        enableCOD: controls.enableCOD,
        enable_cod: rawStore.enable_cod !== undefined ? rawStore.enable_cod : (controls.enableCOD ? 'true' : 'false'),
        freeShipAmt: controls.freeShipAmt || 0,
        raw: rawStore
      });

      // ── Maintenance Mode ──
      if (controls.maintenanceMode) {
        _showMaintenanceMode();
        return; // Stop further loading
      }

      // ── Announcement Bar ──
      if (controls.announcementActive && controls.announcementText) {
        var bar = $('.announcement-bar');
        if (bar) {
          var span = bar.querySelector('span');
          if (span) span.textContent = controls.announcementText;
          bar.classList.add('active');
        }
      }

      // ── Hero Banners from store_info ──
      loadHeroBanners();

      // ── SEO & Branding ──
      var sName = controls.raw.store_name;
      var sTag = controls.raw.store_tagline;
      var sLogo = controls.raw.brand_logo_url;
      if (sName) {
        document.title = sName + (sTag ? ' — ' + sTag : '');
        var ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) ogTitle.content = document.title;
      }
      if (sTag) {
        var metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) metaDesc.content = sTag;
      }
      if (sLogo) {
        var logoEl = document.querySelector('.brand-logo');
        if (logoEl) {
          logoEl.innerHTML = '<img src="' + escHtml(getImgSrc(sLogo)) + '" alt="' + escHtml(sName || 'Logo') + '" style="max-height:32px;">';
        }
      }

      if (controls.socialLinks) {
        renderSocialLinks(controls.socialLinks);
      }

      // ── Live Chat Floating Buttons (WhatsApp + Messenger) ──
      renderLiveChatButtons(controls.liveChat || {}, controls.socialLinks || {});

      // ── Inject SEO meta tags & all tracking pixels from admin settings ──
      injectSEOAndTracking(controls.raw);

      // ── Flash Sale Countdown Timer ──
      if (controls.flashDate) {
        var endDate = new Date(controls.flashDate);
        if (!isNaN(endDate.getTime()) && endDate > new Date()) {
          var flashSection = document.getElementById('flash-sale-section');
          if (!flashSection) {
            flashSection = document.createElement('div');
            flashSection.id = 'flash-sale-section';
            flashSection.style.cssText = 'background:linear-gradient(135deg,#634A8E,#4E3A72);color:#fff;padding:14px 20px;text-align:center;font-size:14px;font-weight:600;letter-spacing:0.02em;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;';
            var heroSec = document.querySelector('.hero-section');
            if (heroSec) heroSec.parentNode.insertBefore(flashSection, heroSec);
          }
          function updateFlashTimer() {
            var now = new Date();
            var diff = endDate - now;
            if (diff <= 0) { flashSection.style.display = 'none'; return; }
            var d = Math.floor(diff / 86400000);
            var h = Math.floor((diff % 86400000) / 3600000);
            var m = Math.floor((diff % 3600000) / 60000);
            var s = Math.floor((diff % 60000) / 1000);
            var timerText = (d > 0 ? d + 'দিন ' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
            flashSection.innerHTML = '🔥 <span>' + escHtml(controls.flashTitle || 'Flash Sale') + '</span> <span style="background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:20px;font-family:monospace;font-size:15px;letter-spacing:1px;">' + timerText + '</span>';
          }
          updateFlashTimer();
          setInterval(updateFlashTimer, 1000);
        }
      }

      // ── Currency Symbol ──
      if (controls.currency && controls.currency !== '৳') {
        state.currencySymbol = controls.currency;
      }

      // ── B2B / Wholesale Mode ── hide prices & cart for guests
      if (controls.b2bMode) {
        state.b2bMode = true;
        var b2bStyle = document.createElement('style');
        b2bStyle.id = 'yarz-b2b-mode';
        b2bStyle.textContent = '.card-price,.pd-price-row,.cart-footer,.cart-count,#checkout-submit-btn,.sbb-price,.sticky-buy-bar{display:none!important}.card-price::after{content:"Contact for Price";display:block;font-size:12px;color:var(--brand);font-weight:600}';
        document.head.appendChild(b2bStyle);
      }

      // ── Website Logo (from admin settings) ──
      if (controls.websiteLogoUrl) {
        var logoEl = document.querySelector('.brand-logo');
        if (logoEl) {
          logoEl.innerHTML = '<img src="' + escHtml(getImgSrc(controls.websiteLogoUrl)) + '" alt="' + escHtml(controls.raw.store_name || 'Logo') + '" style="max-height:32px;">';
        }
      }

      // ── Global Font Family ──
      if (controls.font && controls.font !== 'Inter') {
        var fontMap = {
          'Inter': "'Inter', sans-serif",
          'Roboto': "'Roboto', sans-serif",
          'Outfit': "'Outfit', sans-serif",
          'Poppins': "'Poppins', sans-serif",
          'Nunito': "'Nunito', sans-serif",
          'Lato': "'Lato', sans-serif",
          'Open Sans': "'Open Sans', sans-serif"
        };
        var fontFamily = fontMap[controls.font] || ("'" + controls.font + "', sans-serif");
        // Load font from Google Fonts
        var fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(controls.font) + ':wght@300;400;500;600;700&display=swap';
        document.head.appendChild(fontLink);
        document.documentElement.style.setProperty('--font-primary', fontFamily);
        document.body.style.fontFamily = fontFamily;
      }

      // ── Theme Primary Accent Color ──
      if (controls.themeColor) {
        document.documentElement.style.setProperty('--brand', controls.themeColor);
        document.documentElement.style.setProperty('--brand-dark', controls.themeColor);
        // Update theme-color meta tag
        var themeMeta = document.querySelector('meta[name="theme-color"]');
        if (themeMeta) themeMeta.content = controls.themeColor;
      }

      // ── Announcement Bar Colors ──
      if (controls.announcementActive && controls.announcementText) {
        var annBar = $('.announcement-bar');
        if (annBar) {
          if (controls.announcementBg) annBar.style.background = controls.announcementBg;
          if (controls.announcementColor) annBar.style.color = controls.announcementColor;
        }
      }

      // ── Footer About Text ──
      if (controls.footerText) {
        var footerCol = document.querySelector('.footer-col p');
        if (footerCol) footerCol.textContent = controls.footerText;
      }

      // ── SEO: Meta Title, Description, OG Image from Admin ──
      if (controls.metaTitle) {
        document.title = controls.metaTitle;
        var ogT = document.querySelector('meta[property="og:title"]');
        if (ogT) ogT.content = controls.metaTitle;
      }
      if (controls.metaDesc) {
        var metaD = document.querySelector('meta[name="description"]');
        if (metaD) metaD.content = controls.metaDesc;
        var ogD = document.querySelector('meta[property="og:description"]');
        if (ogD) ogD.content = controls.metaDesc;
      }
      if (controls.ogImage) {
        var ogI = document.querySelector('meta[property="og:image"]');
        if (ogI) ogI.content = getImgSrc(controls.ogImage);
      }

      // ── Store settings in state for product/checkout pages ──
      state.controls = controls;

      // ── Add to Cart Button Text ──
      if (controls.addCartText) {
        state.addCartText = controls.addCartText;
      }

      // ── Expected Delivery Message ──
      if (controls.expDelivery) {
        state.expDelivery = controls.expDelivery;
      }

      // ── Max Order Quantity ──
      if (controls.maxQty > 0) {
        state.maxQty = controls.maxQty;
      }

      // ── Stock Urgency Bar ──
      state.stockBar = controls.stockBar;

      // ── Related Products ──
      state.relatedProd = controls.relatedProd;

      // ── Order Notes ──
      if (controls.orderNotes) {
        state.orderNotes = true;
        var coAddress = document.getElementById('co-address');
        if (coAddress && !document.getElementById('co-order-notes')) {
          var notesGroup = document.createElement('div');
          notesGroup.className = 'form-group';
          notesGroup.innerHTML = '<label>Order Notes / Gift Message</label><textarea class="form-input" id="co-order-notes" placeholder="যেকোনো বিশেষ নির্দেশনা বা গিফট মেসেজ লিখুন..." style="min-height:60px;font-size:13px;"></textarea>';
          coAddress.parentNode.parentNode.insertBefore(notesGroup, coAddress.parentNode.nextSibling);
        }
      }

      // ── Custom Checkout Field ──
      if (controls.customField) {
        state.customField = controls.customField;
        var coCity = document.getElementById('co-city');
        if (coCity && !document.getElementById('co-custom-field')) {
          var customGroup = document.createElement('div');
          customGroup.className = 'form-group';
          customGroup.innerHTML = '<label>' + escHtml(controls.customField) + '</label><input type="text" class="form-input" id="co-custom-field" placeholder="' + escHtml(controls.customField) + '">';
          coCity.parentNode.parentNode.insertBefore(customGroup, coCity.parentNode.nextSibling);
        }
      }

      // ── Minimum Order Amount ──
      if (controls.minOrder > 0) {
        state.minOrder = controls.minOrder;
      }

      // ── Trust Badges on Checkout ──
      if (controls.trustBadges) {
        var checkoutBtn = document.getElementById('checkout-submit-btn');
        if (checkoutBtn && !document.getElementById('yarz-trust-badges')) {
          var badges = document.createElement('div');
          badges.id = 'yarz-trust-badges';
          badges.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;margin-top:12px;padding:10px;background:rgba(5,150,105,0.06);border-radius:10px;flex-wrap:wrap;';
          badges.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
            '<span style="font-size:11px;color:#059669;font-weight:600;">100% Secure</span>' +
            '<span style="font-size:10px;color:var(--text-muted);">•</span>' +
            '<span style="font-size:11px;color:#059669;font-weight:600;">🔒 SSL Protected</span>' +
            '<span style="font-size:10px;color:var(--text-muted);">•</span>' +
            '<span style="font-size:11px;color:#059669;font-weight:600;">✓ Verified Store</span>';
          checkoutBtn.parentNode.insertBefore(badges, checkoutBtn.nextSibling);
        }
      }

      // ── Exit-Intent Popup ──
      if (controls.exitPopup) {
        var exitDismissed = sessionStorage.getItem('yarz_exit_popup_dismissed');
        if (!exitDismissed) {
          var exitTriggered = false;
          document.addEventListener('mouseout', function(e) {
            if (exitTriggered) return;
            if (e.clientY < 5 && e.relatedTarget === null) {
              exitTriggered = true;
              var exitOverlay = document.createElement('div');
              exitOverlay.id = 'yarz-exit-popup';
              exitOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity 0.3s;';
              exitOverlay.innerHTML = '<div style="position:relative;max-width:380px;width:100%;background:#fff;border-radius:16px;padding:28px 24px;text-align:center;box-shadow:0 16px 48px rgba(0,0,0,0.3);transform:scale(0.9);transition:transform 0.3s;">' +
                '<button onclick="this.parentElement.parentElement.remove();sessionStorage.setItem(\'yarz_exit_popup_dismissed\',\'1\')" style="position:absolute;top:8px;right:12px;background:none;border:none;font-size:22px;color:var(--text-muted);cursor:pointer;">✕</button>' +
                '<div style="font-size:36px;margin-bottom:12px;">🎁</div>' +
                '<h3 style="font-size:18px;font-weight:700;margin-bottom:8px;font-family:var(--font-bengali);">একটু দাঁড়ান!</h3>' +
                '<p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;line-height:1.6;font-family:var(--font-bengali);">আপনার জন্য বিশেষ অফার অপেক্ষা করছে! এখনই অর্ডার করুন এবং স্পেশাল ডিসকাউন্ট পান।</p>' +
                '<button onclick="this.parentElement.parentElement.remove();sessionStorage.setItem(\'yarz_exit_popup_dismissed\',\'1\');YARZ.goHome();" class="btn btn-primary" style="padding:12px 32px;border-radius:10px;font-size:14px;width:100%;">🛍️ শপিং চালিয়ে যান</button></div>';
              exitOverlay.addEventListener('click', function(ev) {
                if (ev.target === exitOverlay) { exitOverlay.remove(); sessionStorage.setItem('yarz_exit_popup_dismissed', '1'); }
              });
              document.body.appendChild(exitOverlay);
              requestAnimationFrame(function() {
                exitOverlay.style.opacity = '1';
                exitOverlay.querySelector('div').style.transform = 'scale(1)';
              });
            }
          });
          // Mobile: detect back button intent via scroll-to-top
          var lastScrollY = 0;
          window.addEventListener('scroll', function() {
            if (exitTriggered) return;
            var currentY = window.scrollY;
            if (lastScrollY > 300 && currentY < 20) {
              // User scrolled to top quickly — possible exit intent on mobile
              // Don't trigger — too aggressive. Only desktop mouseout for now.
            }
            lastScrollY = currentY;
          });
        }
      }

      // ── Promotional Popup ──
      if (controls.promoPopupActive && controls.promoPopupImage) {
        var dismissedKey = 'yarz_popup_dismissed_' + new Date().toDateString();
        if (!sessionStorage.getItem(dismissedKey)) {
          setTimeout(function() {
            var overlay = document.createElement('div');
            overlay.id = 'yarz-promo-popup';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity 0.3s;';
            var popupHtml = '<div style="position:relative;max-width:420px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,0.3);transform:scale(0.9);transition:transform 0.3s;">';
            popupHtml += '<button onclick="this.parentElement.parentElement.remove();sessionStorage.setItem(\'' + dismissedKey + '\',\'1\')" style="position:absolute;top:8px;right:8px;width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,0.5);color:#fff;border:none;font-size:18px;cursor:pointer;z-index:2;display:flex;align-items:center;justify-content:center;">✕</button>';
            if (controls.promoPopupLink) {
              popupHtml += '<a href="' + escHtml(controls.promoPopupLink) + '" style="display:block;line-height:0;">';
            }
            popupHtml += '<img src="' + escHtml(getImgSrc(controls.promoPopupImage)) + '" alt="Promo" style="width:100%;display:block;" onerror="this.parentElement.parentElement.remove()">';
            if (controls.promoPopupLink) popupHtml += '</a>';
            popupHtml += '</div>';
            overlay.innerHTML = popupHtml;
            overlay.addEventListener('click', function(e) {
              if (e.target === overlay) { overlay.remove(); sessionStorage.setItem(dismissedKey, '1'); }
            });
            document.body.appendChild(overlay);
            requestAnimationFrame(function() {
              overlay.style.opacity = '1';
              overlay.querySelector('div').style.transform = 'scale(1)';
            });
          }, 2000);
        }
      }

    }).catch(function () {
      // If global controls fail, still load banners gracefully
      loadHeroBanners();
    });

    // Load products and categories in parallel
    // ✅ FIX v3.1: Parallel load — products, categories, AND storeInfo in ONE go
    // Previously: products loaded, then waited for storeInfo, causing Featured
    // Collection to show loading. Now everything fires in parallel.
    Promise.all([
      YARZ_API.getProducts(),
      YARZ_API.getCategories(),
      // storeInfo is already cached by getGlobalControls() above, so this is instant
      state.storeInfo && Object.keys(state.storeInfo).length > 0
        ? Promise.resolve({ raw: state.storeInfo })
        : YARZ_API.getGlobalControls()
    ]).then(function (res) {
      var productsRes = res[0];
      var categoriesRes = res[1];
      var ctrl = res[2];

      // Ensure storeInfo is set before rendering (prevents Featured loading flicker)
      if (ctrl && (ctrl.raw || ctrl.deliveryLocations)) {
        state.storeInfo = Object.assign({}, ctrl.raw || {}, {
          zone1Name: ctrl.zone1Name,
          zone2Name: ctrl.zone2Name,
          zone1Charge: ctrl.zone1Charge,
          zone2Charge: ctrl.zone2Charge,
          deliveryLocations: ctrl.deliveryLocations || (ctrl.raw && ctrl.raw.deliveryLocations) || []
        });
      }
      // ✅ FIX v3.5: Cache storeInfo so next page-load knows if builder sections exist
      try {
        if (state.storeInfo && Object.keys(state.storeInfo).length > 0) {
          localStorage.setItem('yarz_storeinfo_cache', JSON.stringify(state.storeInfo));
        }
      } catch (e) {}

      if (productsRes.success && productsRes.products) {
        state.products = productsRes.products;
        
        // ✅ v4.9: Save direct cache for bulletproof instant loading next time
        try {
          localStorage.setItem('yarz_direct_cache_products', JSON.stringify(state.products));
        } catch(e) {}

        // ✅ Render Featured Collection FIRST (data already available, no loading)
        if (state.storeInfo && Object.keys(state.storeInfo).length > 0) {
          renderDynamicSections(state.products, state.storeInfo);
        }
        updateFilterUI();
        renderProducts(state.products);

        // Hash routing: if URL has #product/slug, open that product
        var hash = window.location.hash || '';
        if (hash.indexOf('#product/') === 0) {
          var slugOrName = hash.replace('#product/', '');
          var matchedProduct = findProductBySlug(slugOrName);
          if (matchedProduct && state.currentView !== 'product') {
            setTimeout(function() { openProduct(matchedProduct.name); }, 100);
          }
        }
      } else {
        renderProducts([]);
      }

      if (categoriesRes.success && categoriesRes.categories) {
        state.categories = categoriesRes.categories;
        renderCategories(categoriesRes.categories);
        // v4.3: Cache categories for instant render on next visit
        try { localStorage.setItem('yarz_categories_cache', JSON.stringify(categoriesRes.categories)); } catch(e) {}
      }
    }).catch(function (err) {
      console.error('YARZ: Product load error:', err);
      var grid = $('#product-grid');
      if (grid) grid.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:48px 16px;">' +
        '<p style="font-size:14px;color:var(--text-muted);margin-bottom:8px;">পণ্য লোড হচ্ছে না। পুনরায় চেষ্টা করুন।</p>' +
        '<button class="btn btn-outline btn-sm" onclick="location.reload()">Reload Page</button>' +
        '</div>';
      // ✅ Clear dynamic-sections-wrapper skeleton on error too
      var wrapper = $('#dynamic-sections-wrapper');
      if (wrapper) wrapper.innerHTML = '';
    });

    // ===== Background Refresh Listener =====
    // When stale cache gets revalidated in background, auto-update UI
    YARZ_API.onDataRefresh(function(cacheKey, data) {
      if (cacheKey.indexOf('action=products') > -1 && data.success && data.products) {
        state.products = data.products;
        // Only re-render if user is on home view
        if (state.currentView === 'home') {
          if (state.currentCategory) {
            var filtered = state.products.filter(function(p) {
              return (p.category || '').toLowerCase() === state.currentCategory.toLowerCase();
            });
            renderProducts(filtered);
          } else {
            renderProducts(state.products);
          }
          // Also refresh dynamic sections
          if (state.storeInfo && Object.keys(state.storeInfo).length > 0) {
            renderDynamicSections(state.products, state.storeInfo);
          }
        }
        console.log('YARZ: Products refreshed in background (' + data.products.length + ' items)');
      }
      if (cacheKey.indexOf('action=categories') > -1 && data.success && data.categories) {
        state.categories = data.categories;
        renderCategories(data.categories);
        console.log('YARZ: Categories refreshed in background');
      }
    });
  }

  // ===== MAINTENANCE MODE UI =====
  function _showMaintenanceMode() {
    var overlay = document.createElement('div');
    overlay.className = 'maintenance-overlay';
    overlay.innerHTML =
      '<div class="maintenance-icon">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="10"/>' +
      '<line x1="12" y1="8" x2="12" y2="12"/>' +
      '<line x1="12" y1="16" x2="12.01" y2="16"/>' +
      '</svg>' +
      '</div>' +
      '<div class="maintenance-logo">Y A R Z</div>' +
      '<h2>We\'ll Be Right Back</h2>' +
      '<p>আমাদের সাইটটি সাময়িকভাবে রক্ষণাবেক্ষণের জন্য বন্ধ আছে।<br>শীঘ্রই ফিরে আসছি। অসুবিধার জন্য দুঃখিত।</p>' +
      '<p style="margin-top:16px;">' +
      '<a href="https://wa.me/8801601743670" style="color:rgba(255,255,255,0.7);font-size:12px;">WhatsApp এ যোগাযোগ করুন</a>' +
      '</p>';
    document.body.appendChild(overlay);
    // Hide main content to prevent scroll
    var main = $('#main-content');
    if (main) main.style.display = 'none';
  }

  // ===== SOCIAL ICON LIBRARY =====
  var SOCIAL_SVG = {
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a1.1 1.1 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>',
    messenger: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.915 1.487 5.503 3.791 7.21v3.532c0 .351.378.566.685.391l3.411-1.87c.683.188 1.393.287 2.113.287 5.523 0 10-4.145 10-9.258S17.523 2 12 2zm1.092 12.44l-2.451-2.617-4.78 2.617 5.253-5.56 2.451 2.618 4.78-2.618-5.253 5.56z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
    twitter: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>'
  };

  // Helper: open WhatsApp/Messenger link properly
  function _normalizeWaLink(input) {
    if (!input) return '';
    var s = String(input).trim();
    if (/^https?:\/\//i.test(s)) return s;
    // Just a phone number → wa.me
    var digits = s.replace(/[^0-9]/g, '');
    if (digits.length >= 8) return 'https://wa.me/' + digits;
    return s;
  }
  function _normalizeMsgrLink(input) {
    if (!input) return '';
    var s = String(input).trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (s.indexOf('m.me/') === 0) return 'https://' + s;
    return 'https://m.me/' + s.replace(/^@/, '');
  }

  // ===== RENDER SOCIAL LINKS (Footer) — v3.6 with brand colors =====
  // ✅ Brand-color backgrounds for each social platform on hover
  var SOCIAL_BRAND_COLOR = {
    facebook:  '#1877F2',
    instagram: '#E1306C',
    whatsapp:  '#25D366',
    messenger: '#0099FF',
    tiktok:    '#000000',
    youtube:   '#FF0000',
    twitter:   '#1DA1F2'
  };

  function renderSocialLinks(links) {
    var entries = [
      { key: 'facebook',  label: 'Facebook'  },
      { key: 'instagram', label: 'Instagram' },
      { key: 'whatsapp',  label: 'WhatsApp',  normalize: _normalizeWaLink   },
      { key: 'messenger', label: 'Messenger', normalize: _normalizeMsgrLink },
      { key: 'tiktok',    label: 'TikTok'    },
      { key: 'youtube',   label: 'YouTube'   },
      { key: 'twitter',   label: 'Twitter'   }
    ];

    // Top of footer (small inline icons)
    var topContainer = document.getElementById('footer-social-container');
    if (topContainer) {
      var topHtml = '';
      entries.forEach(function (e) {
        var url = links[e.key];
        if (!url) return;
        if (e.normalize) url = e.normalize(url);
        topHtml += '<a href="' + escHtml(url) + '" target="_blank" rel="noopener" aria-label="' + e.label +
                   '" title="' + e.label + '" style="--brand-color:' + SOCIAL_BRAND_COLOR[e.key] + ';">' +
                   SOCIAL_SVG[e.key] + '</a>';
      });
      topContainer.innerHTML = topHtml;
    }

    // Bottom-right contact column (vertical list with brand-color logo + label)
    var contactContainer = document.getElementById('footer-contact-social');
    if (contactContainer) {
      var btmHtml = '';
      entries.forEach(function (e) {
        var url = links[e.key];
        if (!url) return;
        if (e.normalize) url = e.normalize(url);
        btmHtml += '<a href="' + escHtml(url) + '" target="_blank" rel="noopener" class="footer-contact-social-link" ' +
                   'style="--brand-color:' + SOCIAL_BRAND_COLOR[e.key] + ';" aria-label="' + e.label + '">' +
                   '<span class="fcs-icon">' + SOCIAL_SVG[e.key] + '</span>' +
                   '<span class="fcs-label">' + e.label + '</span></a>';
      });
      contactContainer.innerHTML = btmHtml;
    }

    // Also render contact page social grid (if user is on contact.html)
    renderContactSocial(links);
  }

  // ===== RENDER CONTACT PAGE SOCIAL =====
  function renderContactSocial(links) {
    var c = document.getElementById('contact-social-grid');
    if (!c) return;
    var entries = [
      { key: 'facebook', label: 'Facebook', sub: 'Follow our page', cls: 'fb' },
      { key: 'instagram', label: 'Instagram', sub: 'See latest posts', cls: 'ig' },
      { key: 'whatsapp', label: 'WhatsApp', sub: 'Chat with us', cls: 'wa', normalize: _normalizeWaLink },
      { key: 'messenger', label: 'Messenger', sub: 'Send a message', cls: 'ms', normalize: _normalizeMsgrLink },
      { key: 'tiktok', label: 'TikTok', sub: 'Watch videos', cls: 'tt' },
      { key: 'youtube', label: 'YouTube', sub: 'Watch our channel', cls: 'yt' }
    ];
    var html = '';
    entries.forEach(function (e) {
      var url = links[e.key];
      if (!url) return;
      if (e.normalize) url = e.normalize(url);
      html += '<a href="' + escHtml(url) + '" target="_blank" rel="noopener" class="contact-social-card">' +
              '<span class="icn ' + e.cls + '">' + SOCIAL_SVG[e.key] + '</span>' +
              '<span class="lbl"><strong>' + e.label + '</strong><span>' + e.sub + '</span></span>' +
              '</a>';
    });
    c.innerHTML = html || '<p style="color:var(--text-muted);font-size:13px;">Social media links not configured yet.</p>';
  }

  // ===== RENDER LIVE CHAT FLOATING BUTTONS v4.3 =====
  // ✅ Floating Messenger button (always visible if messenger link configured)
  // ✅ v4.3: Smart deep link — opens Messenger app directly on mobile (no browser redirect)
  // ✅ Also supports WhatsApp button alongside it
  function renderLiveChatButtons(liveChat, socialLinks) {
    if (!liveChat) liveChat = {};
    if (!socialLinks) socialLinks = {};

    var waActive = liveChat.whatsappBtn;
    var msActive = liveChat.messengerBtn;
    var waUrl = '';
    var msUrl = '';

    // Auto-enable from social if not configured (so admin doesn't have to set 2 places)
    if (waActive || socialLinks.whatsapp) {
      waUrl = _normalizeWaLink(liveChat.whatsappNumber || socialLinks.whatsapp);
      if (liveChat.whatsappMsg && /wa\.me/.test(waUrl)) {
        waUrl += (waUrl.indexOf('?') > -1 ? '&' : '?') + 'text=' + encodeURIComponent(liveChat.whatsappMsg);
      }
    }
    if (msActive || socialLinks.messenger) {
      msUrl = _normalizeMsgrLink(liveChat.messengerUrl || socialLinks.messenger);
    }

    // ✅ v5.0: Update the static floating-whatsapp-btn in HTML
    var staticWaBtn = document.getElementById('floating-whatsapp-btn');
    if (staticWaBtn && waUrl) {
      staticWaBtn.href = waUrl;
      staticWaBtn.style.display = 'flex';
    }

    // v5.1: Update Bottom Nav WhatsApp Link
    var bnavWaLink = document.querySelector('.bnav-wa-link');
    if (bnavWaLink && waUrl) {
      bnavWaLink.href = waUrl;
    }

    // Legacy: hide old messenger button if it still exists
    var oldMsgrBtn = document.getElementById('floating-messenger-btn');
    if (oldMsgrBtn) oldMsgrBtn.style.display = 'none';

    // Remove any old dynamically-created container (not needed anymore)
    var existing = document.getElementById('yarz-live-chat');
    if (existing) existing.remove();

    // ✅ v5.3: Attach WhatsApp click tracking for pixel events
    _attachWhatsAppTracking();
  }

  // ✅ v5.3: Track WhatsApp clicks for Facebook Pixel retargeting
  // (invisible to customer — just fires pixel event when they click)
  function _attachWhatsAppTracking() {
    // Floating button
    var waBtn = document.getElementById('floating-whatsapp-btn');
    if (waBtn && !waBtn._yarzTracked) {
      waBtn._yarzTracked = true;
      waBtn.addEventListener('click', function() {
        if (window.YARZ_PIXEL) {
          YARZ_PIXEL.whatsAppClick(state.currentProduct || null, selectedSize || '');
        }
      });
    }
    // Bottom nav button
    var bnavWa = document.querySelector('.bnav-wa-link');
    if (bnavWa && !bnavWa._yarzTracked) {
      bnavWa._yarzTracked = true;
      bnavWa.addEventListener('click', function() {
        if (window.YARZ_PIXEL) {
          YARZ_PIXEL.whatsAppClick(state.currentProduct || null, selectedSize || '');
        }
      });
    }
  }

  // v4.3: Smart Messenger Deep Link — REVERTED
  // Browser's native m.me handling is more reliable than custom intents.
  function _attachMessengerDeepLink(btn, msUrl) {
    btn.target = '_blank';
    btn.rel = 'noopener noreferrer';
  }

  function setApiUrl() {
    var input = $('#api-url-input');
    if (!input || !input.value.trim()) { showToast('Please enter a URL', 'warning'); return; }
    var url = input.value.trim();
    if (url.indexOf('https://script.google.com') !== 0) {
      showToast('URL must start with https://script.google.com', 'warning');
      return;
    }
    YARZ_API.setBaseUrl(url);
    showToast('API URL saved! Reloading...');
    setTimeout(function () { location.reload(); }, 1000);
  }

  // ===== PUBLIC API =====
  return {
    state: state,
    ICONS: ICONS,
    formatPrice: formatPrice,
    escHtml: escHtml,
    init: init,
    goHome: goHome,
    openProduct: openProduct,
    toggleDescription: toggleDescription,
    openSearch: openSearch,
    closeSearch: closeSearch,
    handleSearch: handleSearch,
    filterCategory: filterCategory,
    applyFilters: applyFilters,
    toggleFilterDrawer: toggleFilterDrawer,
    clearFilters: clearFilters,
    selectSize: selectSize,
    changeQty: changeQty,
    switchImage: switchImage,
    addToCart: addToCart,
    removeFromCart: removeFromCart,
    updateCartItemQty: updateCartItemQty,
    toggleCart: toggleCart,
    applyCoupon: applyCoupon,
    buyNow: buyNow,
    openCheckout: openCheckout,
    closeCheckout: closeCheckout,
    submitOrder: submitOrder,
    renderCheckoutSummary: renderCheckoutSummary,
    showPaymentInfo: showPaymentInfo,
    openTracking: openTracking,
    searchOrders: searchOrders,
    cancelOrder: cancelOrder,
    openProfile: openProfile,
    logout: logout,
    setApiUrl: setApiUrl,
    showToast: showToast,
    slugify: slugify,
    findProductBySlug: findProductBySlug,
  };
})();

// Init on DOM ready
document.addEventListener('DOMContentLoaded', YARZ.init);

// Browser back/forward button support
window.addEventListener('popstate', function () {
  var hash = window.location.hash || '';
  if (hash.indexOf('#product/') === 0) {
    var slugOrName = hash.replace('#product/', '');
    if (slugOrName && YARZ.state.products.length) {
      var matched = YARZ.findProductBySlug(slugOrName);
      if (matched) { YARZ.openProduct(matched.name); return; }
    }
  }
  YARZ.goHome();
});
