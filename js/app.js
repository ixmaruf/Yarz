/* ============================================================
   YARZ — Main Application v3.0
   State Management, Cart, User, UI Components, Navigation
   Global Control Sync: Maintenance Mode, Announcement
   Payment Info: bKash, Nagad, COD
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
    return '\u09F3' + num.toLocaleString('en-IN');
  }

  function escHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ===== IMAGE URL PROCESSOR v3.7 — HIGH-QUALITY (Original-Resolution) =====
  // ✅ Returns the ORIGINAL high-resolution image (no scaling, no compression).
  // ✅ Supports: imgbb (i.ibb.co direct + ibb.co share), Google Drive,
  //              postimg, imgur, and ANY direct image link
  //              (.jpg / .jpeg / .png / .webp / .avif / .gif / .bmp).
  // ✅ FIX v3.7: When user pastes an i.ibb.co direct link (with extension)
  //              we KEEP it untouched so .webp / .png / .gif stay intact.
  //              Previously the share-page regex over-matched and rewrote
  //              every imgbb URL to ".jpg", which broke webp uploads.
  // ✅ FIX v3.7: Google Drive now uses =s0 (original resolution, no thumbnail
  //              compression). Previously thumbnails defaulted to 320px and
  //              looked blurry on phones.
  function getImgSrc(url) {
    if (!url) return '';
    url = String(url).trim();
    if (!url) return '';

    // Auto-prepend https:// if missing
    if (!url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('//')) {
      url = 'https://' + url;
    }

    // ── Direct image link (any common extension) → return as-is, FULL quality ──
    // This catches i.ibb.co/<id>/<name>.webp, i.imgur.com/<id>.png,
    // i.postimg.cc/<id>/file.jpeg, custom CDNs, etc.
    if (/\.(jpe?g|png|webp|avif|gif|bmp|svg)(\?.*)?$/i.test(url)) {
      return url;
    }

    // ── Google Drive → ORIGINAL-resolution direct image (v3.9 super-HD) ──
    if (url.indexOf('drive.google.com') !== -1) {
      var m = url.match(/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
      // =s0 → original size, fully uncompressed (no thumbnail downscale).
      // Quality flags: -no = no resize, k = keep original, rj = JPEG quality high
      if (m) return 'https://lh3.googleusercontent.com/d/' + m[1] + '=s0?authuser=0';
    }

    // ── lh3.googleusercontent.com URLs → upgrade thumbnails to s0 (original) ──
    if (url.indexOf('lh3.googleusercontent.com') !== -1) {
      // Strip any =sN, =wN-hN, =sN-c, =wN sizing suffixes → use =s0 for original
      url = url.replace(/=[swh]\d+(-[a-z]\d*)*(-c)?(-no)?(-k)?$/i, '=s0');
      // If no sizing suffix at all, append =s0
      if (!/=[swh]\d+/i.test(url) && !/=s0/i.test(url)) {
        url += (url.indexOf('=') === -1 ? '=s0' : '');
      }
      return url;
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
  }

  function goHome() {
    // Stop order polling if active
    if (typeof _stopOrderPoll === 'function') _stopOrderPoll();
    state.currentView = 'home';
    state.currentProduct = null;
    selectedSize = '';
    selectedQty = 1;
    var home = $('#home-content');
    var dyn = $('#dynamic-view');
    if (dyn) { dyn.style.display = 'none'; dyn.innerHTML = ''; }
    if (home) home.style.display = '';

    // Close mobile menu if open
    var mainNav = $('#main-nav');
    var hamburger = $('#hamburger');
    if (mainNav && mainNav.classList.contains('active')) {
      mainNav.classList.remove('active');
      hamburger.classList.remove('active');
      document.body.style.overflow = '';
    }

    // Reset category filter if applied
    if (state.currentCategory !== '') {
      state.currentCategory = '';
      $$('.category-tab').forEach(function (t) { t.classList.remove('active'); });
      var allTab = $$('.category-tab')[0];
      if (allTab) allTab.classList.add('active');
      
      var wrapper = $('#dynamic-sections-wrapper');
      var allProductsSec = $('#all-products-section');
      if (wrapper && wrapper.innerHTML) {
        wrapper.style.display = '';
        if (allProductsSec) allProductsSec.style.display = 'none';
      } else {
        if (allProductsSec) allProductsSec.style.display = '';
      }
      renderProducts(state.products);
    }

    // Re-init hero slider in case timer was lost
    initHeroSlider();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Update URL hash
    if (window.location.hash) history.pushState(null, '', window.location.pathname);
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
    sizes.forEach(function (s) {
      var avail = p.sizes && p.sizes[s];
      html += '<span class="size-dot' + (avail ? ' available' : ' out') + '">' + s + '</span>';
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
  }

  // ===== RENDER DYNAMIC SECTIONS =====
  // ✅ FIX v3.1: Zero-loading rendering for "আবার কালেকশন" / Featured Collection
  // - Caches the last rendered HTML hash to skip identical re-renders (prevents flicker)
  // - Uses requestAnimationFrame batching for smooth paint
  // - No skeleton flicker — only renders when data is actually different
  var _lastDynSecHash = '';
  function renderDynamicSections(products, storeInfo) {
    var wrapper = $('#dynamic-sections-wrapper');
    var allProductsSec = $('#all-products-section');
    if (!wrapper || !storeInfo) return;

    var sections = [];
    for (var i = 1; i <= 50; i++) {
      var title = storeInfo['section_' + i + '_title'] || storeInfo['section_' + i + 'title'];
      var category = storeInfo['section_' + i + '_category'] || storeInfo['section_' + i + 'category'];
      if (title) sections.push({ title: title, category: category });
    }

    if (sections.length === 0) {
      if (wrapper.innerHTML !== '') wrapper.innerHTML = '';
      wrapper.classList.add('is-empty');
      if (allProductsSec) allProductsSec.style.display = '';
      _lastDynSecHash = '';
      return;
    }
    wrapper.classList.remove('is-empty');

    var html = '';
    sections.forEach(function (sec, idx) {
      var secProducts = sec.category ? products.filter(function(p) {
        return (p.category || '').toLowerCase() === sec.category.toLowerCase();
      }) : products.slice(0, 8);

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

    // ✅ Skip re-render if HTML is identical (eliminates flicker on background refresh)
    var newHash = html.length + '_' + sections.length + '_' + (products.length || 0);
    if (newHash === _lastDynSecHash && wrapper.innerHTML) {
      if (allProductsSec) allProductsSec.style.display = html ? 'none' : '';
      return;
    }
    _lastDynSecHash = newHash;

    // Use requestAnimationFrame for smooth paint (avoids layout thrash)
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
    
    state.currentCategory = cat;
    
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

    var filtered = cat ? state.products.filter(function (p) {
      return (p.category || '').toLowerCase() === cat.toLowerCase();
    }) : state.products;
    renderProducts(filtered);
  }

  // ===== PRODUCT DETAIL =====
  var selectedSize = '';
  var selectedQty = 1;

  function openProduct(name) {
    var product = state.products.find(function (p) { return p.name === name; });
    if (!product) return;

    state.currentProduct = product;
    selectedSize = '';
    selectedQty = 1;

    // Update URL hash for refresh safety
    history.pushState(null, '', '#product/' + encodeURIComponent(product.name));

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
    sizes.forEach(function (s) {
      var disabled = !product.sizes || !product.sizes[s];
      html += '<button class="size-btn" data-size="' + s + '"' + (disabled ? ' disabled' : '') + ' onclick="YARZ.selectSize(\'' + s + '\')">' + s + '</button>';
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
    html += '<button class="btn btn-primary btn-lg" onclick="YARZ.addToCart()" id="add-to-cart-btn"' + (!product.inStock ? ' disabled' : '') + '>' + (product.inStock ? 'Add to Cart' : 'Out of Stock') + '</button>';
    html += '<button class="btn btn-outline btn-lg" onclick="YARZ.buyNow()"' + (!product.inStock ? ' disabled' : '') + '>Buy Now</button>';
    html += '</div>';

    var deliveryText = deliveryLocations.map(function (loc) {
      return escHtml(loc.name) + ': ' + formatPrice(loc.charge);
    }).join(' &middot; ');

    // Delivery info
    html += '<div class="pd-delivery-info">';
    html += '<div class="pd-delivery-row">' + ICONS.truck + '<span>' + deliveryText + '</span></div>';
    html += '<div class="pd-delivery-row">' + ICONS.package + '<span>' + escHtml(product.deliveryDays || '2-3 days') + ' delivery</span></div>';
    html += '<div class="pd-delivery-row">' + ICONS.refresh + '<span>7 days easy return policy</span></div>';
    html += '<div class="pd-delivery-row">' + ICONS.shield + '<span>Cash on Delivery available</span></div>';
    html += '</div>';

    html += '</div></div></section>';

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
    // Clamp qty to available stock for this size
    var p = state.currentProduct;
    if (p) {
      var stockKey = 'stock_' + s;
      var maxStock = parseInt(p[stockKey]) || 0;
      if (maxStock > 0 && selectedQty > maxStock) {
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
      var stockKey = 'stock_' + selectedSize;
      maxStock = parseInt(p[stockKey]) || 0;
    }

    var newQty = selectedQty + delta;

    if (newQty < 1) newQty = 1;
    if (newQty > maxStock && maxStock > 0) {
      showToast('স্টক সীমিত! সর্বোচ্চ ' + maxStock + 'টি পাওয়া যাবে।', 'warning');
      newQty = maxStock;
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

    var key = p.name + '_' + s;
    var existing = state.cart.find(function (i) { return i.key === key; });

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
          var statusClass = (o.status || 'pending').toLowerCase().replace(/\s+/g, '');
          var total = parseFloat(o.total || o.totalAmount) || 0;
          orderHistoryHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border-light);font-size:11px;">' +
            '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;color:var(--ink-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(o.product || o.productName || '') + '</div>' +
            '<div style="color:var(--text-muted);font-size:10px;">' + escHtml(o.date || '') + '</div></div>' +
            '<div style="text-align:right;margin-left:8px;">' +
            '<span class="order-status ' + statusClass + '" style="font-size:9px;padding:2px 6px;border-radius:10px;">' + escHtml(o.status || 'Pending') + '</span>' +
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
      locationSel.innerHTML = locations.map(function (loc) {
        return '<option value="' + escHtml(loc.id) + '">' + escHtml(loc.name) + ' — ' + formatPrice(loc.charge) + '</option>';
      }).join('');
      if (currentLoc && locations.some(function (loc) { return String(loc.id) === String(currentLoc); })) {
        locationSel.value = currentLoc;
      }
    }

    renderCheckoutSummary();

    // ✅ FIX v3.1: Dynamically render payment options + COD toggle handling
    // When admin disables COD via "Enable COD" toggle in admin panel, the COD
    // option remains visible (so customers see it exists) but selecting it
    // shows a friendly modal explaining advance delivery-charge payment.
    var codEnabled = isCODEnabled();
    if (paymentSel) {
      var currentVal = paymentSel.value;
      var optionsHTML = '<option value="COD">Cash on Delivery (COD)</option>' +
                        '<option value="bKash">bKash</option>' +
                        '<option value="Nagad">Nagad</option>';
      paymentSel.innerHTML = optionsHTML;

      // Default selection — if COD disabled, default to bKash
      if (!paymentSel.value) {
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
  }

  // ✅ FIX v3.1: Centralized COD-enable check — reads admin "Enable COD" toggle
  // Default: COD is enabled UNLESS admin explicitly sets it to "false".
  function isCODEnabled() {
    if (!state.storeInfo) return true;
    var v = state.storeInfo.enable_cod;
    if (v === undefined || v === null || v === '') return true;
    var s = String(v).toLowerCase().trim();
    return !(s === 'false' || s === 'no' || s === '0' || s === 'off' || s === 'disabled');
  }

  // ✅ FIX v3.1: Show a friendly modal popup explaining COD restriction
  // Triggered when customer tries to select COD while admin has disabled it
  function showCODDisabledModal() {
    // Remove any existing instance
    var prev = document.getElementById('cod-disabled-modal');
    if (prev) prev.remove();

    var overlay = document.createElement('div');
    overlay.id = 'cod-disabled-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);animation:fadeIn 0.2s ease-out;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;max-width:440px;width:100%;border-radius:18px;padding:28px 24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;font-family:var(--font-bengali, "Hind Siliguri", sans-serif);animation:slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);';
    box.innerHTML =
      '<div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#FFE082 0%,#FFB74D 100%);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(255,152,0,0.3);">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#E65100" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
      '</div>' +
      '<h3 style="font-size:18px;font-weight:700;color:#1a1a1a;margin:0 0 12px;font-family:var(--font-bengali);">দুঃখিত সম্মানিত ক্রেতা!</h3>' +
      '<p style="font-size:13.5px;line-height:1.7;color:#475569;margin:0 0 14px;font-family:var(--font-bengali);">' +
        'কিছু অসাধু ক্রেতার কারণে আমাদের <strong style="color:#E65100;">ক্যাশ অন ডেলিভারি (COD)</strong> অপশনটি সাময়িক সময়ের জন্য বন্ধ রাখা হয়েছে।' +
      '</p>' +
      '<div style="background:linear-gradient(135deg,#FFF8E1 0%,#FFECB3 100%);border:1px dashed #FFB74D;border-radius:12px;padding:14px 16px;margin:14px 0;">' +
        '<p style="font-size:13px;line-height:1.7;color:#8D6E63;margin:0;font-family:var(--font-bengali);">' +
          '<strong style="color:#E65100;">তবে চিন্তার কিছু নেই!</strong><br>' +
          'শুধুমাত্র <strong style="color:#2E7D32;">ডেলিভারি চার্জটি</strong> আগেই <strong>bKash</strong> অথবা <strong>Nagad</strong>-এর মাধ্যমে পেমেন্ট করে অর্ডার কনফার্ম করতে পারবেন। প্রোডাক্টের বাকি মূল্য ডেলিভারির সময়ে ডেলিভারিম্যানকে নগদ প্রদান করবেন।' +
        '</p>' +
      '</div>' +
      '<p style="font-size:12px;color:#94a3b8;margin:8px 0 18px;font-family:var(--font-bengali);">আপনার সহযোগিতার জন্য ধন্যবাদ 🙏</p>' +
      '<button id="cod-modal-ok" style="width:100%;background:linear-gradient(135deg,#634A8E 0%,#4A3470 100%);color:#fff;border:none;padding:13px 20px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:var(--font-bengali);box-shadow:0 4px 12px rgba(99,74,142,0.3);transition:transform 0.15s;">' +
        'বুঝতে পেরেছি, bKash/Nagad ব্যবহার করব' +
      '</button>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Animation styles (inject once)
    if (!document.getElementById('cod-modal-anim-style')) {
      var st = document.createElement('style');
      st.id = 'cod-modal-anim-style';
      st.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(20px) scale(0.95)}to{opacity:1;transform:translateY(0) scale(1)}}#cod-modal-ok:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(99,74,142,0.4)}#cod-modal-ok:active{transform:translateY(0)}';
      document.head.appendChild(st);
    }

    function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    document.getElementById('cod-modal-ok').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
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
    var deliveryCharge = state.cart.length > 0 ? getDeliveryCharge(location) : 0;

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

    // ✅ FIX v3.1: Use centralized isCODEnabled() check + show friendly popup
    if (payment === 'COD' && !isCODEnabled()) {
      showCODDisabledModal();
      var paymentSelEl = $('#co-payment');
      if (paymentSelEl) {
        paymentSelEl.value = 'bKash';
        showPaymentInfo('bKash');
      }
      return;
    }

    // 1. Honeypot check (Anti-Bot)
    var honeypot = $('#co-website');
    if (honeypot && honeypot.value) {
      // Silently fake success
      simulateFakeSuccess(name, phone, address, payment);
      return;
    }

    // 2. Timing Guard (Anti-Speed-Bot)
    var timeSpent = Date.now() - (state._checkoutOpenedAt || 0);
    if (timeSpent < 8000) { // less than 8 seconds
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
    var checkoutDeliveryCharge = getDeliveryCharge(location);

    // Build order promises. Delivery is charged once per checkout, not once per product row.
    var orderPromises = state.cart.map(function (item, idx) {
      var deliveryCharge = idx === 0 ? checkoutDeliveryCharge : 0;
      var itemPrice = item.price;
      
      // Apply coupon if valid for this item (global cart level is fine for now based on matched coupon)
      if (state.appliedCoupon && item.couponActive === 'Yes' && (item.couponCode || '').toUpperCase() === state.appliedCoupon.code) {
        var discountAmt = (itemPrice * state.appliedCoupon.discountPct) / 100;
        itemPrice = itemPrice - discountAmt;
      }
      
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
        payment: payment,
        notes: state.appliedCoupon ? 'Applied Coupon: ' + state.appliedCoupon.code : '',
      };

      if (YARZ_API.isConfigured()) {
        return YARZ_API.placeOrder(orderData);
      } else {
        return Promise.resolve({
          success: true,
          orderId: generatedOrderId,
          total: itemPrice * item.qty + deliveryCharge,
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
            date: new Date().toLocaleDateString('en-GB'),
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
            date: new Date().toLocaleDateString('en-GB'),
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

      var fallbackTotal = state.cart.reduce(function(sum, item) {
        return sum + (item.price * item.qty);
      }, checkoutDeliveryCharge);

      state.cart = [];
      saveCart();
      closeCheckout();
      showOrderSuccess(generatedOrderId, [{ total: fallbackTotal }], payment);
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.textContent = 'Place Order'; }
    });
  }

  function showOrderSuccess(orderId, results, paymentMethod) {
    var total = results.reduce(function (s, r) { return s + (parseFloat(r.total) || 0); }, 0);

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
      '<div style="width:56px;height:56px;border-radius:50%;background:var(--success);color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">' + ICONS.check + '</div>' +
      '<h2 style="font-family:var(--font-serif);font-size:22px;font-weight:600;margin-bottom:8px;">Order Placed Successfully!</h2>' +
      '<p style="font-size:13px;color:var(--text-muted);margin-bottom:4px;">Thank you for your order. We will contact you shortly.</p>' +
      '<p style="font-size:12px;color:var(--text-muted);margin-bottom:24px;font-family:var(--font-bengali);">আপনার অর্ডারটি সফলভাবে সম্পন্ন হয়েছে। আমরা শীঘ্রই আপনার সাথে যোগাযোগ করবো।</p>' +
      paymentInstructions +
      '<div style="background:var(--bg-card);border:1px solid var(--border-light);border-radius:8px;padding:20px;text-align:left;margin-bottom:24px;">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;"><span style="color:var(--text-muted);">Order ID</span><span style="font-weight:700;color:var(--accent);">' + escHtml(orderId) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:13px;"><span style="color:var(--text-muted);">Total</span><span style="font-weight:700;">' + formatPrice(total) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:13px;"><span style="color:var(--text-muted);">Status</span><span class="order-status pending">PENDING</span></div></div>' +
      '<div style="display:flex;gap:8px;justify-content:center;">' +
      '<button class="btn btn-primary" onclick="YARZ.goHome()">Continue Shopping</button>' +
      '<button class="btn btn-outline" onclick="YARZ.openTracking()">Track Order</button></div></div>';

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
    // Refresh every 20 seconds — keeps status in sync with admin panel
    _orderPollTimer = setInterval(function () {
      if (state.currentView !== 'tracking') { _stopOrderPoll(); return; }
      // Bypass cache for fresh status check
      YARZ_API.clearCache();
      searchOrders(true); // silent refresh
    }, 20000);
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

      // Merge local and secure API orders
      var merged = [].concat(secureApiOrders);
      localOrders.forEach(function(lo) {
        var exists = merged.some(function(mo) { 
          // Match by phone, product, and size to handle cases where backend generates a new Order ID
          return (mo.phone === lo.phone) && 
                 (mo.product === lo.productName || mo.productName === lo.productName) &&
                 (mo.size === lo.size);
        });
        if (!exists) merged.push(lo);
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

    YARZ_API.getOrdersByPhone(phone).then(function (result) {
      if (result.fallback) {
        handleResults([]);
        return;
      }
      handleResults(result.success ? result.orders : []);
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

      // Custom Bengali Status Texts
      var statusText = '';
      var statusBadge = '';
      switch(rawStatus.toLowerCase()) {
        case 'pending': 
          statusText = 'আপনার অর্ডারটি গ্রহণ করা হয়েছে, কনফার্মেশনের জন্য অপেক্ষা করুন।';
          statusBadge = '<span style="color:#d97706;background:rgba(245,158,11,0.1);padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;">⏳ Pending</span>';
          break;
        case 'processing':
          statusText = 'অর্ডারটি কনফার্ম হয়েছে এবং প্যাকেজিংয়ের কাজ চলছে।';
          statusBadge = '<span style="color:#2563EB;background:rgba(37,99,235,0.1);padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;">📦 Processing</span>';
          break;
        case 'picked up':
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
          statusText = 'আপনার অর্ডারটি ক্যান্সেল করা হয়েছে।';
          statusBadge = '<span style="color:#DC2626;background:rgba(220,38,38,0.1);padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;">❌ Cancelled</span>';
          break;
        default:
          statusText = rawStatus;
          statusBadge = '<span style="color:var(--text-muted);background:var(--surface-1);padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600;">' + escHtml(rawStatus) + '</span>';
      }

      // If total is 0, try to calculate from price
      if (total === 0 && price > 0) total = (price * qty) + delivery;

      html += '<div class="order-card" style="border:1px solid var(--border-light);border-radius:12px;padding:16px;margin-bottom:12px;background:var(--bg-card);box-shadow:0 1px 4px rgba(0,0,0,0.04);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
        '<span style="font-size:11px;font-weight:700;color:var(--brand);letter-spacing:0.5px;">#' + escHtml(o.orderId || o.orderID || '') + '</span>' +
        statusBadge + '</div>' +
        '<div style="font-size:10px;color:var(--text-muted);margin-bottom:10px;">' + escHtml(o.date || o.orderDate || '') + '</div>';

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

      // Cancel/Remove button
      html += '<div style="text-align:right;">';
      if ((o.status || 'Pending').toLowerCase() === 'pending') {
        html += '<button class="btn btn-outline btn-sm" style="font-size:11px;padding:4px 10px;color:var(--danger);border-color:var(--danger);border-radius:6px;" onclick="YARZ.cancelOrder(\'' + escHtml(o.orderId || o.orderID || '') + '\')">রিমুভ অর্ডার</button>';
      } else {
        html += '<span style="font-size:10px;color:var(--text-muted);font-family:var(--font-bengali);">প্রসেসিং হচ্ছে, ক্যান্সেল করা যাবে না</span>';
      }
      html += '</div></div>';
    });

    html += '</div>';
    container.innerHTML = html;
  }

  // ===== CANCEL ORDER =====
  function cancelOrder(orderId) {
    if (!orderId) return;

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
    
    // Remove from local storage
    try {
      var localOrders = JSON.parse(localStorage.getItem('yarz_my_orders') || '[]');
      var updatedLocalOrders = localOrders.filter(function(o) {
        return o.orderId !== orderId && o.orderID !== orderId;
      });
      localStorage.setItem('yarz_my_orders', JSON.stringify(updatedLocalOrders));
    } catch(err) {}

    // Clear duplicate detection and rate limit so user can re-order
    localStorage.removeItem('yarz_last_order_sig');
    localStorage.removeItem('yarz_last_order_sig_time');
    localStorage.removeItem('yarz_last_order');

    // API Call to remove from Admin Panel
    if (YARZ_API.isConfigured()) {
      YARZ_API.deleteOrder(orderId).then(function(res) {
        showToast('অর্ডার সফলভাবে রিমুভ করা হয়েছে।', 'success');
        searchOrders();
      }).catch(function(err) {
        console.error('Failed to delete order from backend', err);
        showToast('অর্ডার রিমুভ করা হয়েছে।', 'success');
        searchOrders();
      });
    } else {
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
        deliveryLocations: controls.deliveryLocations || []
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

  // ===== INIT =====
  function init() {
    initHeaderScroll();
    updateCartCount();
    updateUserUI();
    renderCartDrawer();
    initHeroSlider();
    initMobileMenu();
    renderSkeletons('product-grid', 8);
    // ✅ FIX v3.1: Render dynamic sections skeleton too (prevents blank-space flash)
    renderDynamicSectionsSkeleton();
    initInAppBrowserWarning();

    // Apply Global Controls (Maintenance Mode, Announcement, Banners)
    // This runs first to handle maintenance mode before showing anything
    YARZ_API.getGlobalControls().then(function (controls) {
      if (!controls) return;

      // Keep the latest global controls available before product/cart rendering.
      // This prevents dynamic delivery locations from being lost when cached raw settings load first.
      state.storeInfo = Object.assign({}, controls.raw || {}, {
        zone1Name: controls.zone1Name,
        zone2Name: controls.zone2Name,
        zone1Charge: controls.zone1Charge,
        zone2Charge: controls.zone2Charge,
        deliveryLocations: controls.deliveryLocations || []
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
        // ✅ Render Featured Collection FIRST (data already available, no loading)
        if (state.storeInfo && Object.keys(state.storeInfo).length > 0) {
          renderDynamicSections(state.products, state.storeInfo);
        }
        renderProducts(state.products);

        // Hash routing: if URL has #product/Name, open that product
        var hash = window.location.hash || '';
        if (hash.indexOf('#product/') === 0) {
          var productName = decodeURIComponent(hash.replace('#product/', ''));
          if (productName) {
            setTimeout(function() { openProduct(productName); }, 100);
          }
        }
      } else {
        renderProducts([]);
      }

      if (categoriesRes.success && categoriesRes.categories) {
        state.categories = categoriesRes.categories;
        renderCategories(categoriesRes.categories);
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

  // ===== RENDER LIVE CHAT FLOATING BUTTONS v3.5 =====
  // ✅ Floating Messenger button (always visible if messenger link configured)
  // ✅ Uses colorful gradient — looks like the real Messenger app icon
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

    // Update the static floating-messenger-btn in HTML (preferred path)
    var staticBtn = document.getElementById('floating-messenger-btn');
    if (staticBtn) {
      if (msUrl) {
        staticBtn.href = msUrl;
        staticBtn.style.display = 'flex';
      } else {
        staticBtn.style.display = 'none';
      }
    }

    // Remove any old dynamically-created container
    var existing = document.getElementById('yarz-live-chat');
    if (existing) existing.remove();

    // If WhatsApp is active too, render a separate stacked container above messenger
    if (waUrl) {
      var box = document.createElement('div');
      box.id = 'yarz-live-chat';
      box.className = 'live-chat-buttons';
      // Position the WhatsApp button above the existing messenger button
      box.style.cssText = 'position:fixed;bottom:' + (msUrl ? '88px' : '20px') + ';right:20px;z-index:94;display:flex;flex-direction:column;gap:10px;';
      box.innerHTML = '<a href="' + escHtml(waUrl) + '" target="_blank" rel="noopener" class="live-chat-btn whatsapp" aria-label="WhatsApp Chat" title="Chat on WhatsApp">' + SOCIAL_SVG.whatsapp + '</a>';
      document.body.appendChild(box);
    }
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
  };
})();

// Init on DOM ready
document.addEventListener('DOMContentLoaded', YARZ.init);

// Browser back/forward button support
window.addEventListener('popstate', function () {
  var hash = window.location.hash || '';
  if (hash.indexOf('#product/') === 0) {
    var productName = decodeURIComponent(hash.replace('#product/', ''));
    if (productName && YARZ.state.products.length) {
      YARZ.openProduct(productName);
    }
  } else {
    YARZ.goHome();
  }
});
