/* ============================================================
   YARZ — Common Page Enhancements v3.5
   For: about.html, privacy.html, terms.html,
        return-policy.html, shipping.html
   Adds:
     ✅ Floating Messenger button (auto-link from admin panel)
     ✅ In-app browser warning (Chrome redirect)
     ✅ Footer / Contact social-link auto-sync
   ============================================================ */

(function () {
  'use strict';

  // ---------- Helpers ----------
  function escHtml(s) {
    if (s === null || s === undefined) return '';
    var d = document.createElement('div');
    d.textContent = String(s);
    return d.innerHTML;
  }

  function _normalizeWaLink(input) {
    if (!input) return '';
    var s = String(input).trim();
    if (/^https?:\/\//i.test(s)) return s;
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

  // ---------- 1) FLOATING MESSENGER BUTTON ----------
  function injectFloatingMessenger(messengerUrl) {
    if (!messengerUrl) return;
    if (document.getElementById('floating-messenger-btn')) {
      var existing = document.getElementById('floating-messenger-btn');
      existing.href = messengerUrl;
      existing.style.display = 'flex';
      return;
    }

    var btn = document.createElement('a');
    btn.id = 'floating-messenger-btn';
    btn.className = 'floating-messenger-btn';
    btn.href = messengerUrl;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.title = 'Chat on Messenger';
    btn.setAttribute('aria-label', 'Messenger Chat');
    var gradId = 'msgr-grad-' + Math.random().toString(36).slice(2, 7);
    btn.innerHTML =
      '<svg width="32" height="32" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">' +
        '<defs>' +
          '<radialGradient id="' + gradId + '" cx="0.2" cy="1" r="1.2">' +
            '<stop offset="0%" stop-color="#0099FF"/>' +
            '<stop offset="60%" stop-color="#A033FF"/>' +
            '<stop offset="100%" stop-color="#FF5050"/>' +
          '</radialGradient>' +
        '</defs>' +
        '<circle cx="18" cy="18" r="18" fill="url(#' + gradId + ')"/>' +
        '<path fill="#FFFFFF" d="M18 7.5c-5.8 0-10.5 4.35-10.5 9.7 0 3.05 1.55 5.78 3.97 7.55v3.7c0 .37.4.6.72.4l3.58-1.96c.71.2 1.46.3 2.23.3 5.8 0 10.5-4.35 10.5-9.7S23.8 7.5 18 7.5zm1.15 13.06l-2.57-2.74-5.01 2.74 5.51-5.83 2.57 2.74 5.01-2.74-5.51 5.83z"/>' +
      '</svg>';
    document.body.appendChild(btn);
  }

  // ---------- 2) IN-APP BROWSER → CHROME REDIRECT ----------
  function initInAppBrowserWarning() {
    var ua = navigator.userAgent || navigator.vendor || window.opera || '';
    var isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    var isAndroid = /Android/i.test(ua);
    var isInApp = (
      ua.indexOf('FBAV') > -1 || ua.indexOf('FBIOS') > -1 ||
      ua.indexOf('FB_IAB') > -1 || ua.indexOf('FBAN') > -1 ||
      ua.indexOf('Instagram') > -1 || ua.indexOf('Messenger') > -1
    );
    if (!isInApp) return;
    if (sessionStorage.getItem('yarz_browser_switch_dismissed')) return;
    if (document.getElementById('yarz-browser-switch-banner')) return;

    var currentUrl = window.location.href;
    if (isAndroid) {
      var chromeIntent = 'intent://' + window.location.host + window.location.pathname +
        window.location.search + window.location.hash +
        '#Intent;scheme=https;package=com.android.chrome;end';
      setTimeout(function () { try { window.location.href = chromeIntent; } catch (e) {} }, 1500);
    }

    var actionUrl, actionLabel = 'Open Chrome';
    if (isAndroid) {
      actionUrl = 'intent://' + window.location.host + window.location.pathname +
        window.location.search + window.location.hash +
        '#Intent;scheme=https;package=com.android.chrome;end';
    } else if (isIOS) {
      actionUrl = 'googlechromes://' + currentUrl.replace(/^https?:\/\//, '');
    } else {
      actionUrl = currentUrl;
      actionLabel = 'Open Browser';
    }

    var banner = document.createElement('div');
    banner.id = 'yarz-browser-switch-banner';
    banner.className = 'browser-switch-banner active';
    banner.innerHTML =
      '<div class="bsb-msg">' +
        '<strong>সেরা অভিজ্ঞতার জন্য Chrome ব্যবহার করুন</strong>' +
        '<span>Open this site in Chrome for the best shopping experience.</span>' +
      '</div>' +
      '<a href="' + escHtml(actionUrl) + '" class="bsb-btn">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg> ' +
        actionLabel +
      '</a>' +
      '<button class="bsb-close" aria-label="Close">×</button>';
    document.body.appendChild(banner);
    document.body.style.paddingTop = banner.offsetHeight + 'px';

    banner.querySelector('.bsb-close').addEventListener('click', function () {
      banner.classList.remove('active');
      document.body.style.paddingTop = '';
      sessionStorage.setItem('yarz_browser_switch_dismissed', '1');
    });
  }

  // ---------- 3) APPLY GLOBAL CONTROLS (Social Links) ----------
  function applyGlobalControls() {
    if (typeof YARZ_API === 'undefined') return;
    YARZ_API.getGlobalControls().then(function (controls) {
      if (!controls) return;
      var s = controls.socialLinks || {};

      // Floating Messenger button (uses Messenger link from admin panel)
      var msgrUrl = '';
      if (controls.liveChat && controls.liveChat.messengerUrl) {
        msgrUrl = _normalizeMsgrLink(controls.liveChat.messengerUrl);
      } else if (s.messenger) {
        msgrUrl = _normalizeMsgrLink(s.messenger);
      }
      if (msgrUrl) injectFloatingMessenger(msgrUrl);

      // Update contact-page social cards if present
      var idMap = {
        'contact-wa': s.whatsapp ? _normalizeWaLink(s.whatsapp) : '',
        'contact-fb': s.facebook || '',
        'contact-ms': s.messenger ? _normalizeMsgrLink(s.messenger) : '',
        'contact-ig': s.instagram || '',
        'contact-tt': s.tiktok || '',
        'contact-yt': s.youtube || ''
      };
      Object.keys(idMap).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
          if (idMap[id]) {
            el.href = idMap[id];
            el.style.display = 'flex';
          } else {
            el.style.display = 'none';
          }
        }
      });

      // Footer social-icon container (if present)
      var footerSocial = document.getElementById('footer-social-container');
      if (footerSocial) {
        var SVG = {
          facebook:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
          instagram: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
          whatsapp:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a1.1 1.1 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347"/></svg>',
          messenger: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.915 1.487 5.503 3.791 7.21v3.532c0 .351.378.566.685.391l3.411-1.87c.683.188 1.393.287 2.113.287 5.523 0 10-4.145 10-9.258S17.523 2 12 2zm1.092 12.44l-2.451-2.617-4.78 2.617 5.253-5.56 2.451 2.618 4.78-2.618-5.253 5.56z"/></svg>',
          tiktok:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>',
          youtube:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>'
        };
        var entries = [
          { key: 'facebook' }, { key: 'instagram' },
          { key: 'whatsapp', normalize: _normalizeWaLink },
          { key: 'messenger', normalize: _normalizeMsgrLink },
          { key: 'tiktok' }, { key: 'youtube' }
        ];
        var html = '';
        entries.forEach(function (e) {
          var url = s[e.key];
          if (!url) return;
          if (e.normalize) url = e.normalize(url);
          html += '<a href="' + escHtml(url) + '" target="_blank" rel="noopener" aria-label="' + e.key + '">' + (SVG[e.key] || '') + '</a>';
        });
        if (html) footerSocial.innerHTML = html;
      }
    }).catch(function () {});
  }

  // ---------- INIT ----------
  document.addEventListener('DOMContentLoaded', function () {
    initInAppBrowserWarning();
    applyGlobalControls();
  });
})();
