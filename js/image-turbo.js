/* ════════════════════════════════════════════════════════════════════
   YARZ IMAGE TURBO v1.0 — Smart Image Loading
   ════════════════════════════════════════════════════════════════════
   What it does:
     1. Auto-converts Google Drive URLs to lh3 fast-CDN format with size hints
     2. Lazy-loads all images using IntersectionObserver
     3. Adds fade-in animation when image arrives
     4. Replaces broken images with placeholder
     5. Generates LQIP (Low-Quality Image Placeholder) blur effect

   Usage in HTML / template:
     <img data-src="https://drive.google.com/..." data-size="400" class="lazy-img" alt="...">
       → loads at 400px wide via lh3 CDN, lazily

   Or call manually:
     ImageTurbo.optimize(url, 400)  // returns optimized URL
     ImageTurbo.observe(imgElement)  // start lazy loading
   ════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const LQIP_CSS = `
    .yarz-img-lazy{
      background:linear-gradient(135deg,#f0ebf7 0%,#e6dff3 100%);
      transition:opacity .35s ease, filter .35s ease;
      opacity:.0;
      filter:blur(8px);
    }
    .yarz-img-loaded{opacity:1!important;filter:none!important}
    .yarz-img-error{
      background:#f5f5f5 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='%23bbb'%3E%3Cpath d='M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z'/%3E%3C/svg%3E") center/40px no-repeat;
    }
  `;
  if (!document.getElementById('yarz-img-css')) {
    const s = document.createElement('style');
    s.id = 'yarz-img-css';
    s.textContent = LQIP_CSS;
    document.head.appendChild(s);
  }

  // ──────────────────────────────────────────────────────────────
  // URL OPTIMIZER
  //   Converts Google Drive / Sheet-hosted images to fast CDN URLs
  // ──────────────────────────────────────────────────────────────
  function extractDriveId(url) {
    if (!url) return null;
    // formats:
    //  https://drive.google.com/file/d/{id}/view
    //  https://drive.google.com/open?id={id}
    //  https://drive.google.com/uc?id={id}
    //  https://lh3.googleusercontent.com/d/{id}
    let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = url.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    return null;
  }

  function optimize(url, size) {
    if (!url) return url;
    size = size || 1200;
    // ✅ v15.8 FIX: DPR multiplier was inflating product card images on mobile.
    // The srcset triplet (400w/800w/1200w) already provides DPR variants — the
    // browser picks the right one. Multiplying by DPR INSIDE optimize() caused
    // mobile to fetch 2000-px images for every product card (~1.5 MB JPG).
    // Now: only multiply for hero/detail images (size >= 1600).
    var dpr = (window.devicePixelRatio || 1);
    var realSize;
    if (size >= 1600) {
      realSize = Math.round(size * Math.min(dpr, 2)); // hero gets retina
      if (realSize > 2000) realSize = 2000;
    } else {
      realSize = size; // product cards: trust the srcset
    }
    const id = extractDriveId(url);
    if (id) {
      // lh3 CDN — s{size} = max dimension
      // -rw = WebP format (50% smaller than JPEG, all modern browsers support it)
      return `https://lh3.googleusercontent.com/d/${id}=s${realSize}-rw`;
    }
    // i.ibb.co — already CDN, leave as is
    return url;
  }

  // ──────────────────────────────────────────────────────────────
  // Detect what KIND of image this is so we can pick a smart size
  //   - Banner / hero slide   → 1600px (full width, retina-aware)
  //   - Product card thumb    → 800px
  //   - Product detail / zoom → 1600px
  //   - Logo / icon           → 200px
  // ──────────────────────────────────────────────────────────────
  function smartSizeFor(img) {
    // Explicit data-size always wins
    var ds = parseInt(img.dataset.size || img.getAttribute('data-size') || '0', 10);
    if (ds > 0) return ds;

    // Walk ancestors looking for known classes
    var el = img;
    for (var i = 0; i < 6 && el; i++) {
      var cls = (el.className || '') + '';
      if (/hero|banner|slide|slider|carousel/i.test(cls)) return 1600;
      if (/product-detail|product-zoom|gallery|main-image|main-img/i.test(cls)) return 1600;
      if (/product-card|product-grid|card-image|thumb/i.test(cls)) return 800;
      if (/logo|icon|avatar/i.test(cls)) return 200;
      el = el.parentElement;
    }

    // Fall back to actual rendered width (if available) × 1.5 for safety margin
    var w = img.clientWidth || img.naturalWidth || 0;
    if (w > 0) {
      if (w >= 600) return 1600;
      if (w >= 300) return 800;
      return 400;
    }

    // Default: assume product image
    return 1200;
  }

  // ──────────────────────────────────────────────────────────────
  // AUTO-UPGRADE existing <img src="..."> Google Drive URLs to lh3 CDN
  //   So you don't have to change your existing markup at all.
  // ──────────────────────────────────────────────────────────────
  function upgradeExistingImg(img) {
    if (!img || img.dataset.turboUpgraded === '1') return;
    const src = img.getAttribute('src');
    if (!src) return;
    // ✅ v15.6: Skip if image has srcset — the browser already picks the right
    // size, and double-upgrading wastes bandwidth on product cards.
    if (img.srcset || img.getAttribute('srcset')) {
      img.dataset.turboUpgraded = '1';
      return;
    }
    // ✅ v12.1 PERF: Skip upgrade if URL already has a size param (=s..., =w..., =h...).
    //   Prevents the double-fetch race that was wasting bandwidth and slowing LCP.
    if (/=[swh]\d+/.test(src)) {
      img.dataset.turboUpgraded = '1';
      return;
    }
    const id = extractDriveId(src);
    if (!id) return;
    const size = smartSizeFor(img);
    const newSrc = optimize(src, size);
    if (newSrc !== src) {
      img.dataset.turboUpgraded = '1';
      img.dataset.turboOriginal = src;
      // Add lazy attr if not already loading="eager"
      if (!img.loading) img.loading = 'lazy';
      if (!img.decoding) img.decoding = 'async';
      img.src = newSrc;
    }
  }

  function upgradeAllImages(root) {
    const r = root || document;
    const imgs = r.querySelectorAll ? r.querySelectorAll('img[src]') : [];
    imgs.forEach(upgradeExistingImg);
  }

  // After layout settles, re-check images in case clientWidth became larger
  // (this lets us upgrade an image that was rendered very wide AFTER first scan)
  function recheckSizesOnLayout() {
    var imgs = document.querySelectorAll('img[data-turbo-upgraded="1"]');
    imgs.forEach(function(img) {
      var orig = img.dataset.turboOriginal;
      if (!orig) return;
      // ✅ v12.1: Don't waste bandwidth replacing an already-loaded image.
      //   Only re-upgrade if image hasn't finished loading yet OR if rendered
      //   significantly larger than what we fetched.
      if (img.complete && img.naturalWidth > 0) return;
      var id = extractDriveId(orig);
      if (!id) return;
      // Compute the size that would be picked NOW that layout is ready
      var idealSize = smartSizeFor(img);
      // Get the size that's currently in src
      var m = (img.src || '').match(/=s(\d+)/);
      var currentSize = m ? parseInt(m[1], 10) : 0;
      // If our layout-aware ideal is significantly bigger, upgrade the image
      if (idealSize * (window.devicePixelRatio || 1) > currentSize * 1.3) {
        img.src = optimize(orig, idealSize);
      }
    });
  }

  // Run rechecks after a tiny delay so DOM has time to lay out
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(recheckSizesOnLayout, 600); });
  } else {
    setTimeout(recheckSizesOnLayout, 600);
  }
  window.addEventListener('load', function() { setTimeout(recheckSizesOnLayout, 100); });

  let observer = null;
  function getObserver() {
    if (observer) return observer;
    if (!('IntersectionObserver' in window)) return null;
    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          load(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '200px 0px', threshold: 0.01 });
    return observer;
  }

  function load(img) {
    const src   = img.dataset.src || img.getAttribute('data-src');
    if (!src) return;
    const size  = parseInt(img.dataset.size || img.getAttribute('data-size') || '600', 10);
    const final = optimize(src, size);

    // Preload via Image() then swap → smooth fade
    const probe = new Image();
    probe.onload = () => {
      img.src = final;
      img.classList.remove('yarz-img-lazy');
      img.classList.add('yarz-img-loaded');
    };
    probe.onerror = () => {
      img.classList.add('yarz-img-error');
      img.classList.remove('yarz-img-lazy');
    };
    probe.src = final;
  }

  function observe(imgOrSelector) {
    const obs = getObserver();
    let imgs;
    if (typeof imgOrSelector === 'string') {
      imgs = document.querySelectorAll(imgOrSelector);
    } else if (imgOrSelector instanceof Element) {
      imgs = [imgOrSelector];
    } else if (imgOrSelector && imgOrSelector.length !== undefined) {
      imgs = imgOrSelector;
    } else {
      imgs = document.querySelectorAll('img[data-src]:not(.yarz-img-loaded)');
    }
    imgs.forEach(img => {
      if (img.classList.contains('yarz-img-loaded')) return;
      img.classList.add('yarz-img-lazy');
      if (obs) {
        obs.observe(img);
      } else {
        // No IO support — load immediately
        load(img);
      }
    });
  }

  // Auto-scan on DOM ready + after dynamic content changes
  function autoScan() { observe(); upgradeAllImages(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoScan);
  } else {
    autoScan();
  }

  // MutationObserver — pick up dynamically-added images
  if (window.MutationObserver) {
    const mo = new MutationObserver((mutations) => {
      let needsScanLazy = false;
      let needsUpgrade  = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            if (node.matches && node.matches('img[data-src]')) needsScanLazy = true;
            else if (node.querySelector && node.querySelector('img[data-src]')) needsScanLazy = true;
            if (node.matches && node.matches('img[src]')) {
              upgradeExistingImg(node);
            } else if (node.querySelector) {
              const inner = node.querySelectorAll('img[src]');
              if (inner && inner.length) { inner.forEach(upgradeExistingImg); needsUpgrade = true; }
            }
          }
        }
      }
      if (needsScanLazy) observe();
    });
    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  // Public API
  global.ImageTurbo = { optimize, observe, extractDriveId, upgradeExistingImg, upgradeAllImages };

  console.log('%c[IMAGE-TURBO] ⚡ Ready', 'color:#634A8E;font-weight:bold');

})(window);
