/* YARZ IMAGE TURBO v1.0 — Smart Image Loading */
(function (global) {
  'use strict';
  if (!document.getElementById('yarz-img-css')) {
    const s = document.createElement('style');
    s.id = 'yarz-img-css';
    s.textContent = '.yarz-img-lazy{background:linear-gradient(135deg,#f0ebf7 0%,#e6dff3 100%);transition:opacity .35s ease;opacity:0;filter:blur(8px)}.yarz-img-loaded{opacity:1!important;filter:none!important}';
    document.head.appendChild(s);
  }
  function extractDriveId(url) {
    if (!url) return null;
    let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    return null;
  }
  function optimize(url, size) {
    if (!url) return url;
    size = size || 1200;
    const id = extractDriveId(url);
    if (id) return `https://lh3.googleusercontent.com/d/${id}=s${size}-rw`;
    return url;
  }
  function upgradeExistingImg(img) {
    if (!img || img.dataset.turboUpgraded === '1') return;
    if (img.complete && img.naturalWidth > 0) return;
    const src = img.getAttribute('src');
    if (!src || img.srcset) { img.dataset.turboUpgraded = '1'; return; }
    const id = extractDriveId(src);
    if (!id) return;
    img.src = optimize(src, 1200);
    img.dataset.turboUpgraded = '1';
  }
  function upgradeAllImages(root) {
    const r = root || document;
    const imgs = r.querySelectorAll ? r.querySelectorAll('img[src]') : [];
    imgs.forEach(upgradeExistingImg);
  }
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { const img = e.target; if (img.dataset.src && !img.src) img.src = img.dataset.src; obs.unobserve(img); } });
    }, { rootMargin: '200px 0px' });
    document.addEventListener('DOMContentLoaded', () => {
      upgradeAllImages();
      document.querySelectorAll('img[data-src]').forEach(img => obs.observe(img));
    });
  } else {
    document.addEventListener('DOMContentLoaded', upgradeAllImages);
  }
  global.ImageTurbo = { optimize, upgradeExistingImg, upgradeAllImages, extractDriveId };
})();
