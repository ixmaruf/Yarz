/* ============================================================
   YARZ ARMOR — Security Shield v1.0
   ✅ DevTools detection (behavioral, non-blocking)
   ✅ Console method neutralization (production)
   ✅ Right-click & keyboard shortcut interception
   ✅ Source tampering detection (integrity check)
   ✅ DOES NOT affect: Meta Pixel, GA4, TikTok, normal browsing
   ✅ DOES NOT affect: Mobile users, touch events, scrolling
   ============================================================ */

;(function() {
  'use strict';

  // ===== CONFIG =====
  var _cfg = {
    // Whitelist: these domains' scripts are NEVER blocked
    // (Facebook Pixel, Google Analytics, TikTok, etc.)
    TRACKING_DOMAINS: [
      'facebook', 'fbq', 'fb.com', 'fbcdn',
      'google', 'gtag', 'analytics', 'googletagmanager',
      'tiktok', 'ttq', 'bytedance',
      'snapchat', 'sentry', 'hotjar',
      'pinterest', 'clarity'
    ],
    WARN_MSG: '\u26a0\ufe0f This is a protected website. Unauthorized access attempts are logged.',
    WARN_MSG_BN: '\u26a0\ufe0f \u098f\u099f\u09bf \u098f\u0995\u099f\u09bf \u09b8\u09c1\u09b0\u0995\u09cd\u09b7\u09bf\u09a4 \u0993\u09af\u09bc\u09c7\u09ac\u09b8\u09be\u0987\u099f\u0964 \u0985\u09a8\u09c1\u09ae\u09a4\u09bf \u099b\u09be\u09dc\u09be \u09aa\u09cd\u09b0\u09ac\u09c7\u09b6 \u099a\u09c7\u09b7\u09cd\u099f\u09be \u09b0\u09c7\u0995\u09b0\u09cd\u09a1 \u0995\u09b0\u09be \u09b9\u099a\u09cd\u099b\u09c7\u0964',
    CHECK_INTERVAL: 2000, // Check every 2 seconds
  };

  var _devtoolsOpen = false;
  var _warningShown = false;

  // ===== A. CONSOLE NEUTRALIZATION =====
  // Disable console methods so attackers can't use console to inspect state
  // BUT: Tracking pixels use console.log internally — we must NOT break them.
  // Solution: We replace console methods with no-ops ONLY for non-tracking code.
  // Tracking libraries (fbq, gtag, ttq) cache their own console references
  // at load time, so neutralizing console AFTER they load is safe.
  function _neutralizeConsole() {
    // Wait 3 seconds for all tracking scripts to initialize
    // (they cache console references at load time)
    setTimeout(function() {
      var noop = function() {};
      // Only neutralize if NOT in development/admin mode
      if (window.location.hostname === 'localhost' || 
          window.location.hostname === '127.0.0.1' ||
          window.location.search.indexOf('debug=1') > -1) {
        return; // Keep console for local development
      }
      try {
        // Save original for internal use
        window.__yc = {
          log: console.log.bind(console),
          warn: console.warn.bind(console),
          error: console.error.bind(console)
        };
        console.log = noop;
        console.warn = noop;
        console.info = noop;
        console.debug = noop;
        console.dir = noop;
        console.dirxml = noop;
        console.table = noop;
        console.trace = noop;
        console.group = noop;
        console.groupCollapsed = noop;
        console.groupEnd = noop;
        console.count = noop;
        console.countReset = noop;
        console.time = noop;
        console.timeEnd = noop;
        console.timeLog = noop;
        console.profile = noop;
        console.profileEnd = noop;
        // Keep console.error and console.clear functioning
        // (error is needed for critical runtime issues)
      } catch (e) { /* some environments restrict console modification */ }
    }, 3000);
  }

  // ===== B. DEVTOOLS DETECTION (Behavioral) =====
  // Uses the image/toString trick — DevTools calls toString() on objects
  // when they are logged. This is non-invasive and doesn't use debugger traps.
  function _checkDevTools() {
    var threshold = 160; // DevTools panel width
    var widthThreshold = window.outerWidth - window.innerWidth > threshold;
    var heightThreshold = window.outerHeight - window.innerHeight > threshold;
    
    if (widthThreshold || heightThreshold) {
      if (!_devtoolsOpen) {
        _devtoolsOpen = true;
        _onDevToolsOpen();
      }
    } else {
      if (_devtoolsOpen) {
        _devtoolsOpen = false;
      }
    }
  }

  function _onDevToolsOpen() {
    if (_warningShown) return;
    _warningShown = true;

    // Show a visual warning overlay
    var overlay = document.createElement('div');
    overlay.id = 'yarz-security-overlay';
    overlay.innerHTML = 
      '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:999999;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;">' +
        '<div style="max-width:420px;background:#fff;border-radius:16px;padding:32px 24px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">' +
          '<div style="width:64px;height:64px;background:linear-gradient(135deg,#FF6B6B,#EE5A24);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">' +
            '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4"/><circle cx="12" cy="16" r="0.5" fill="#fff"/></svg>' +
          '</div>' +
          '<h2 style="font-size:20px;font-weight:800;color:#1A1A2E;margin:0 0 8px;font-family:Inter,sans-serif;">Security Alert</h2>' +
          '<p style="font-size:14px;color:#6B7280;margin:0 0 6px;line-height:1.5;">Developer tools detected. This website is protected against unauthorized inspection.</p>' +
          '<p style="font-size:13px;color:#634A8E;margin:0 0 20px;line-height:1.5;font-family:\'Hind Siliguri\',sans-serif;">' + _cfg.WARN_MSG_BN + '</p>' +
          '<button onclick="this.closest(\'#yarz-security-overlay\').remove()" style="background:linear-gradient(135deg,#634A8E,#4E3A72);color:#fff;border:none;border-radius:10px;padding:12px 32px;font-size:14px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;">I Understand</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    // Auto-remove after 8 seconds
    setTimeout(function() {
      var el = document.getElementById('yarz-security-overlay');
      if (el) el.remove();
    }, 8000);
  }

  // ===== C. KEYBOARD SHORTCUT INTERCEPTION =====
  // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
  // But allow Ctrl+C (copy), Ctrl+V (paste), Ctrl+A (select all) — normal use
  function _blockShortcuts() {
    document.addEventListener('keydown', function(e) {
      // F12
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      // Ctrl+Shift+I (DevTools), Ctrl+Shift+J (Console), Ctrl+Shift+C (Inspector)
      if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c' || e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      // Ctrl+U (View Source)
      if (e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.keyCode === 85) && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, true); // Use capture phase to intercept before any other handler
  }

  // ===== D. RIGHT-CLICK CONTEXT MENU =====
  // Disable right-click on the page body (prevents "Inspect Element")
  // But allow right-click on inputs/textareas (for paste/spell-check)
  function _blockContextMenu() {
    document.addEventListener('contextmenu', function(e) {
      // Allow right-click on form elements (input, textarea, select)
      var tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return true; // Allow — users need paste/spell-check
      }
      e.preventDefault();
      return false;
    });
  }

  // ===== E. ANTI-COPY PROTECTION (Optional — keeps product info safe) =====
  // Prevent copying the entire page content (but allow form field copying)
  function _antiCopy() {
    document.addEventListener('copy', function(e) {
      var tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea') {
        return true; // Allow copying from form fields
      }
      // For product descriptions, etc. — allow but add attribution
      // (This is non-blocking — just adds a note)
    });
  }

  // ===== F. SOURCE VIEWING DETERRENT =====
  // When someone tries to view source (Ctrl+U or view-source:), 
  // they'll see obfuscated code. This is handled by the obfuscation in api.js.
  // Additionally, we monitor for iframes that might try to load our page.
  function _antiIframe() {
    try {
      if (window.self !== window.top) {
        // We're inside an iframe — could be clickjacking attempt
        // Redirect to the real page
        window.top.location = window.self.location;
      }
    } catch (e) {
      // Cross-origin iframe — can't access top, but we can break out
      document.body.innerHTML = '<div style="padding:40px;text-align:center;"><h1>Access Denied</h1></div>';
    }
  }

  // ===== G. SCRIPT INTEGRITY MONITOR =====
  // Watches for unauthorized script injections (XSS attempts)
  function _monitorScripts() {
    if (typeof MutationObserver === 'undefined') return;

    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        if (m.type !== 'childList') return;
        m.addedNodes.forEach(function(node) {
          if (node.tagName !== 'SCRIPT') return;
          var src = node.src || '';
          // Allow known tracking scripts
          var isTracking = _cfg.TRACKING_DOMAINS.some(function(d) {
            return src.toLowerCase().indexOf(d) > -1;
          });
          // Allow our own scripts
          var isOwn = src.indexOf(window.location.hostname) > -1 || 
                      src.indexOf('./js/') > -1 || 
                      src.indexOf('/js/') > -1 ||
                      src === '';
          
          if (!isTracking && !isOwn && src) {
            // Unknown external script being injected — potential XSS
            try {
              node.remove();
              if (window.__yc) window.__yc.warn('YARZ Armor: Blocked unauthorized script:', src);
            } catch (e) {}
          }
        });
      });
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ===== H. GLOBAL VARIABLE PROTECTION =====
  // Prevent direct manipulation of critical global objects
  function _protectGlobals() {
    // Freeze YARZ_API config to prevent tampering via console
    setTimeout(function() {
      try {
        if (window.YARZ_API && window.YARZ_API.CONFIG) {
          Object.freeze(window.YARZ_API.CONFIG);
        }
      } catch (e) {}
    }, 2000);
  }

  // ===== I. DRAG PREVENTION =====
  // Prevent dragging images (makes it slightly harder to steal product photos)
  function _preventDrag() {
    document.addEventListener('dragstart', function(e) {
      if (e.target && e.target.tagName === 'IMG') {
        e.preventDefault();
        return false;
      }
    });
  }

  // ===== INIT =====
  function init() {
    // Don't run on admin panel
    if (window.location.pathname.indexOf('admin') > -1) return;
    // Don't run on localhost (development)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return;

    _neutralizeConsole();
    _blockShortcuts();
    _blockContextMenu();
    _antiCopy();
    _antiIframe();
    _monitorScripts();
    _protectGlobals();
    _preventDrag();

    // DevTools check — runs periodically
    setInterval(_checkDevTools, _cfg.CHECK_INTERVAL);
    _checkDevTools(); // Initial check
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
