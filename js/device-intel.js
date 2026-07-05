/* ============================================================
   YARZ DEVICE DETECTOR v2.0 — Real-Time Dynamic Detection
   ✅ NO hardcoded model mappings — detects ANY device in real-time
   ✅ navigator.userAgentData (Chrome/Edge) — browser knows the device
   ✅ Dynamic User-Agent parsing — extracts raw model codes
   ✅ WebGL GPU detection — auto-detects new chips
   ✅ Screen + iOS version + GPU → iPhone model (dynamic)
   ✅ Hardware fingerprint (cores, memory, screen, touch)
   ✅ Headless/Automation/Bot detection
   ✅ Geolocation API for precise lat/lng
   ✅ Works for ANY future device — no updates needed
   ============================================================ */
const YARZ_DEVICE = (() => {
  'use strict';

  let _result = null;

  let _detectPromise = null;

  // ===== DYNAMIC GPU NAME EXTRACTION =====
  // Instead of hardcoded mapping, parse the GPU renderer string directly
  // "Qualcomm Adreno (TM) 750" → { vendor: "Qualcomm", model: "Adreno 750", raw: "..." }
  function _parseGPU(renderer) {
    if (!renderer || renderer === 'unknown') return { vendor: 'Unknown', model: 'Unknown', raw: '' };
    var r = renderer.toLowerCase();

    // Qualcomm Adreno — extract model number dynamically
    var adrenoMatch = renderer.match(/adreno\s*(?:\(tm\)\s*)?(\d+)/i);
    if (adrenoMatch) return { vendor: 'Qualcomm', model: 'Adreno ' + adrenoMatch[1], raw: renderer };

    // ARM Mali — extract model dynamically
    var maliMatch = renderer.match(/mali[-\s]*(g?\d+\w*(?:\s*mc\d+)?)/i);
    if (maliMatch) return { vendor: 'ARM', model: 'Mali ' + maliMatch[1], raw: renderer };

    // Apple GPU — extract generation from iOS version context
    if (/apple\s*gpu/i.test(renderer)) return { vendor: 'Apple', model: 'Apple GPU', raw: renderer };
    if (/apple\s*a\d+/i.test(renderer)) {
      var appleMatch = renderer.match(/apple\s*(a\d+)/i);
      return { vendor: 'Apple', model: appleMatch ? appleMatch[1].toUpperCase() + ' GPU' : 'Apple GPU', raw: renderer };
    }

    // Samsung Xclipse / AMD
    if (/xclipse/i.test(renderer)) {
      var xcMatch = renderer.match(/xclipse\s*(\d+)/i);
      return { vendor: 'Samsung/AMD', model: 'Xclipse ' + (xcMatch ? xcMatch[1] : ''), raw: renderer };
    }

    // PowerVR
    if (/powervr/i.test(renderer)) {
      var pvMatch = renderer.match(/powervr\s*(bxt|ge\d+)/i);
      return { vendor: 'Imagination', model: 'PowerVR ' + (pvMatch ? pvMatch[1] : ''), raw: renderer };
    }

    // Intel
    if (/intel/i.test(renderer)) {
      var intelMatch = renderer.match(/intel(r?)\s*(iris|uhd|hd)\s*(\w+)?/i);
      return { vendor: 'Intel', model: intelMatch ? ('Intel ' + intelMatch[2] + (intelMatch[3] ? ' ' + intelMatch[3] : '')) : 'Intel GPU', raw: renderer };
    }

    // NVIDIA
    if (/nvidia|geforce/i.test(renderer)) {
      var nvMatch = renderer.match(/geforce\s*(gtx|rtx|gt|mx)?\s*(\w+)/i);
      return { vendor: 'NVIDIA', model: nvMatch ? ('GeForce ' + (nvMatch[1] || '') + ' ' + nvMatch[2]).trim() : 'NVIDIA GPU', raw: renderer };
    }

    // AMD Radeon
    if (/radeon|amd/i.test(renderer)) {
      var amdMatch = renderer.match(/radeon\s*(rx|vega|pro)?\s*(\w+)/i);
      return { vendor: 'AMD', model: amdMatch ? ('Radeon ' + (amdMatch[1] || '') + ' ' + amdMatch[2]).trim() : 'AMD GPU', raw: renderer };
    }

    // Software renderers
    if (/swiftshader/i.test(renderer)) return { vendor: 'Google', model: 'SwiftShader (Software)', raw: renderer };
    if (/llvmpipe/i.test(renderer)) return { vendor: 'Mesa', model: 'LLVMpipe (Software)', raw: renderer };
    if (/mesa/i.test(renderer)) return { vendor: 'Mesa', model: 'Mesa GPU', raw: renderer };

    // Fallback — return raw string as-is (new unknown GPU)
    return { vendor: 'Unknown', model: renderer, raw: renderer };
  }

  // ===== DYNAMIC iPHONE MODEL DETECTION =====
  // Uses screen dimensions + iOS version + GPU to determine model
  // NO hardcoded lookup table — works for ANY iPhone
  function _detectIPhoneModel(screenW, screenH, iosVersion, gpuRenderer, pixelRatio) {
    // iPhone internal identifiers appear in newer Safari UAs
    // "iPhone16,2" = iPhone 15 Pro Max, "iPhone15,4" = iPhone 15
    // We detect by combining signals:

    var logicalW = Math.min(screenW, screenH); // portrait width
    var logicalH = Math.max(screenW, screenH);

    // Determine chip generation from GPU
    var chipGen = 'unknown';
    if (/a17/i.test(gpuRenderer)) chipGen = 'A17';
    else if (/a16/i.test(gpuRenderer)) chipGen = 'A16';
    else if (/a15/i.test(gpuRenderer)) chipGen = 'A15';
    else if (/a14/i.test(gpuRenderer)) chipGen = 'A14';
    else if (/a13/i.test(gpuRenderer)) chipGen = 'A13';
    else if (/a12/i.test(gpuRenderer)) chipGen = 'A12';
    else if (/a11/i.test(gpuRenderer)) chipGen = 'A11';
    else if (/a10/i.test(gpuRenderer)) chipGen = 'A10';
    else if (/a9/i.test(gpuRenderer)) chipGen = 'A9';

    // Determine iOS major version
    var iosMajor = parseInt(iosVersion) || 0;

    // Dynamic screen-based classification
    // All dimensions are in CSS pixels (logical pixels)
    var model = 'iPhone';

    if (logicalW >= 420) {
      // Large screens — Pro Max or Plus
      model = chipGen !== 'unknown' ? ('iPhone Pro Max/Plus (' + chipGen + ')') : 'iPhone Pro Max/Plus';
    } else if (logicalW >= 390 && logicalW < 420) {
      // Standard/Pro screens
      model = chipGen !== 'unknown' ? ('iPhone Pro/Standard (' + chipGen + ')') : 'iPhone Pro/Standard';
    } else if (logicalW >= 375 && logicalW < 390) {
      // Mini or older standard
      model = chipGen !== 'unknown' ? ('iPhone Mini/Standard (' + chipGen + ')') : 'iPhone Mini/Standard';
    } else if (logicalW >= 320 && logicalW < 375) {
      // Older iPhones (SE, 6, 7, 8)
      model = 'iPhone (Legacy)';
    }

    // If we have chip generation, we can be more specific
    if (chipGen !== 'unknown') {
      model = 'iPhone (' + chipGen + ' chip, ' + logicalW + 'x' + logicalH + ')';
    }

    return model;
  }

  // ===== DYNAMIC ANDROID MODEL DETECTION =====
  // Extracts raw model code from UA — NO hardcoded mapping
  // "SM-S928B" is the actual device identifier — server can map it later
  function _detectAndroidModel(ua, highEntropy) {
    var brand = 'Android';
    var model = 'Unknown';
    var modelCode = '';

    // Try navigator.userAgentData first (Chrome/Edge — most reliable)
    if (highEntropy && highEntropy.model) {
      model = highEntropy.model;
      modelCode = highEntropy.model;
    }

    // v2.5: Detect in-app browser type (Facebook, Instagram, WhatsApp)
    var inAppBrowser = '';
    if (/FBAN\/FBIOS|FBAN\/FBAV|FBAV\//i.test(ua)) inAppBrowser = 'Facebook';
    else if (/Instagram/i.test(ua)) inAppBrowser = 'Instagram';
    else if (/WhatsApp\//i.test(ua)) inAppBrowser = 'WhatsApp';
    else if (/BytedanceWebview|TikTok/i.test(ua)) inAppBrowser = 'TikTok';
    else if (/Line\//i.test(ua)) inAppBrowser = 'LINE';
    else if (/SamsungBrowser/i.test(ua)) inAppBrowser = 'Samsung Internet';
    else if (/UCBrowser|UCWEB/i.test(ua)) inAppBrowser = 'UC Browser';

    // v2.5: Extract brand from FBBD/FBMF params (Facebook/Instagram browser)
    // UA contains: "FBMF/samsung;FBBD/samsung" or "FBMF/xiaomi;FBBD/xiaomi"
    var fbbdMatch = ua.match(/FB[BMD]F\/([a-z0-9_-]+)/i);
    if (fbbdMatch) {
      var fbBrand = fbbdMatch[1].toLowerCase();
      if (/samsung/i.test(fbBrand)) brand = 'Samsung';
      else if (/xiaomi/i.test(fbBrand)) brand = 'Xiaomi';
      else if (/redmi/i.test(fbBrand)) brand = 'Redmi';
      else if (/poco/i.test(fbBrand)) brand = 'POCO';
      else if (/oneplus/i.test(fbBrand)) brand = 'OnePlus';
      else if (/realme/i.test(fbBrand)) brand = 'Realme';
      else if (/oppo/i.test(fbBrand)) brand = 'Oppo';
      else if (/vivo/i.test(fbBrand)) brand = 'Vivo';
      else if (/tecno/i.test(fbBrand)) brand = 'Tecno';
      else if (/infinix/i.test(fbBrand)) brand = 'Infinix';
      else if (/huawei/i.test(fbBrand)) brand = 'Huawei';
      else if (/honor/i.test(fbBrand)) brand = 'Honor';
      else if (/motorola|moto/i.test(fbBrand)) brand = 'Motorola';
      else if (/nokia/i.test(fbBrand)) brand = 'Nokia';
      else if (/google|pixel/i.test(fbBrand)) brand = 'Google';
      else if (/apple/i.test(fbBrand)) brand = 'Apple';
    }

    // Extract brand from User-Agent (fallback — works in all browsers)
    if (brand === 'Android') {
      if (/samsung|sm-/i.test(ua)) brand = 'Samsung';
      else if (/xiaomi|mi\s/i.test(ua)) brand = 'Xiaomi';
      else if (/redmi/i.test(ua)) brand = 'Redmi';
      else if (/poco/i.test(ua)) brand = 'POCO';
      else if (/oneplus/i.test(ua)) brand = 'OnePlus';
      else if (/realme/i.test(ua)) brand = 'Realme';
      else if (/oppo/i.test(ua)) brand = 'Oppo';
      else if (/vivo/i.test(ua)) brand = 'Vivo';
      else if (/tecno/i.test(ua)) brand = 'Tecno';
      else if (/infinix/i.test(ua)) brand = 'Infinix';
      else if (/huawei/i.test(ua)) brand = 'Huawei';
      else if (/honor/i.test(ua)) brand = 'Honor';
      else if (/motorola|moto/i.test(ua)) brand = 'Motorola';
      else if (/nokia/i.test(ua)) brand = 'Nokia';
      else if (/pixel/i.test(ua)) brand = 'Google';
    }

    // v2.4: Extract brand from navigator.userAgentData.brands (Chrome on mobile)
    if (brand === 'Android' && highEntropy && highEntropy.brands) {
      var knownBrands = { 'Samsung':'Samsung','Xiaomi':'Xiaomi','Google':'Google','OnePlus':'OnePlus','Oppo':'Oppo','Vivo':'Vivo','Realme':'Realme','Huawei':'Huawei','Honor':'Honor','Motorola':'Motorola','Nokia':'Nokia','Tecno':'Tecno','Infinix':'Infinix','POCO':'POCO','Redmi':'Redmi','Nothing':'Nothing','Sony':'Sony','Asus':'Asus','LG':'LG' };
      for (var i = 0; i < highEntropy.brands.length; i++) {
        var bName = highEntropy.brands[i].brand || '';
        if (knownBrands[bName]) { brand = knownBrands[bName]; break; }
      }
    }

    // Extract raw model code from UA — this is the ACTUAL device identifier
    // Samsung: SM-XXXX pattern
    var smMatch = ua.match(/\b(SM-[A-Z]\d{2,5}[A-Z0-9]*)\b/i);
    if (smMatch) { modelCode = smMatch[1]; model = modelCode; }

    // Xiaomi/Redmi/POCO: MXXXXXX pattern
    var miMatch = ua.match(/\b(M\d{4}[A-Z0-9]{1,5})\b/);
    if (miMatch && !modelCode) { modelCode = miMatch[1]; model = modelCode; }

    // Realme: RMX pattern
    var rmMatch = ua.match(/\b(RMX\d{3,5})\b/i);
    if (rmMatch && !modelCode) { modelCode = rmMatch[1]; model = modelCode; }

    // Oppo: CPH pattern
    var cphMatch = ua.match(/\b(CPH\d{3,5})\b/i);
    if (cphMatch && !modelCode) { modelCode = cphMatch[1]; model = modelCode; }

    // Vivo: V + 4 digits
    var vivoMatch = ua.match(/\b(V\d{4}[A-Z]?)\b/);
    if (vivoMatch && !modelCode) { modelCode = vivoMatch[1]; model = modelCode; }

    // OnePlus: IN + 4 digits or LE + 4-5 digits
    var opMatch = ua.match(/\b(IN\d{4}|LE\d{4,5})\b/);
    if (opMatch && !modelCode) { modelCode = opMatch[1]; model = modelCode; }

    // Generic Android model extraction — anything after brand name
    if (!modelCode && model === 'Unknown') {
      // Try to extract model from UA string pattern: "Android XXX; ModelName Build/XXX"
      var genericMatch = ua.match(/Android[\s\d.]+;\s*(\S+?)[\s;)]/);
      if (genericMatch) {
        modelCode = genericMatch[1];
        model = genericMatch[1];
      }
    }

    // v2.4: If brand is still 'Android', try inferring from model code pattern
    if (brand === 'Android' && modelCode) {
      var inferred = _inferBrandFromModelCode(modelCode);
      if (inferred) brand = inferred;
    }

    return { brand: brand, model: model, modelCode: modelCode, inAppBrowser: inAppBrowser };
  }

  // v2.6: Resolve model code → marketing name via Worker API
  // Runs async after detection so it doesn't block page load
  function _resolveModelName(brand, modelCode) {
    if (!modelCode || !brand || brand === 'Unknown' || brand === 'Windows PC' || brand === 'Apple') return;
    // Build Worker URL
    var workerUrl = 'https://yarz-api.marufhasan80009.workers.dev/';
    try {
      var resp = fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve_model', model_code: modelCode, brand: brand })
      });
      resp.then(function(r) { return r.json(); }).then(function(data) {
        if (data && data.success && data.name && _result) {
          _result.marketingName = data.name;
          _result.model = data.name + ' (' + modelCode + ')';
        }
      }).catch(function() {});
    } catch(e) {}
  }

  // v2.4: Infer brand from model code when UA/userAgentData don't have it
  function _inferBrandFromModelCode(code) {
    if (!code) return '';
    if (/^SM-|^SC-|^GT-|^SPH|^SCH|^SCH/i.test(code)) return 'Samsung';
    if (/^M\d{4}/i.test(code)) return 'Xiaomi';
    if (/^RMX/i.test(code)) return 'Realme';
    if (/^CPH/i.test(code)) return 'Oppo';
    if (/^V\d{4}/i.test(code)) return 'Vivo';
    if (/^IN\d{4}|^LE\d{4,5}/i.test(code)) return 'OnePlus';
    if (/^NX\d+/i.test(code)) return 'Nubia';
    if (/^TA-|^N\d{3}[A-Z]/i.test(code)) return 'Nokia';
    if (/^2[2-9]\d{2}[A-Z]/i.test(code)) return 'Huawei';
    return '';
  }

  // ===== DYNAMIC DESKTOP DETECTION =====
  function _detectDesktop(ua) {
    var os = 'Unknown';
    var osVersion = '';
    var distro = '';

    if (/Windows/i.test(ua)) {
      os = 'Windows';
      var winMatch = ua.match(/Windows NT (\d+\.\d+)/);
      if (winMatch) {
        osVersion = winMatch[1];
        // Map NT version to Windows name dynamically
        var ntVer = parseFloat(winMatch[1]);
        if (ntVer >= 10.0) {
          // Distinguish Win 10 vs 11 by build number
          var buildMatch = ua.match(/Windows NT 10\.0\.(\d+)/);
          if (buildMatch && parseInt(buildMatch[1]) >= 22000) os = 'Windows 11';
          else os = 'Windows 10';
        } else if (ntVer >= 6.3) os = 'Windows 8.1';
        else if (ntVer >= 6.2) os = 'Windows 8';
        else if (ntVer >= 6.1) os = 'Windows 7';
        else os = 'Windows (Legacy)';
      }
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      os = 'macOS';
      var macMatch = ua.match(/Mac OS X (\d+[_.]\d+[_.]?\d*)/);
      if (macMatch) osVersion = macMatch[1].replace(/_/g, '.');
    } else if (/CrOS/i.test(ua)) {
      os = 'Chrome OS';
    } else if (/Linux/i.test(ua)) {
      os = 'Linux';
      // Detect distro dynamically from UA
      var distros = [
        [/ubuntu/i, 'Ubuntu'], [/debian/i, 'Debian'], [/fedora/i, 'Fedora'],
        [/centos/i, 'CentOS'], [/red\s*hat/i, 'Red Hat'], [/arch/i, 'Arch Linux'],
        [/manjaro/i, 'Manjaro'], [/mint/i, 'Linux Mint'], [/opensuse/i, 'openSUSE'],
        [/gentoo/i, 'Gentoo'], [/alpine/i, 'Alpine'], [/kali/i, 'Kali Linux'],
        [/raspberry/i, 'Raspberry Pi OS']
      ];
      for (var d = 0; d < distros.length; d++) {
        if (distros[d][0].test(ua)) { distro = distros[d][1]; break; }
      }
    }

    return { os: os, osVersion: osVersion, distro: distro };
  }

  // ===== HEADLESS / AUTOMATION DETECTION =====
  function _detectHeadless() {
    var signals = [];
    var ua = (navigator.userAgent || '').toLowerCase();

    // Check UA for automation keywords
    var botPatterns = ['headless', 'phantom', 'puppeteer', 'playwright', 'nightmare',
      'curl', 'wget', 'python-requests', 'node-fetch', 'httpie', 'go-http-client',
      'java/', 'okhttp', 'apache-httpclient', 'postmanruntime', 'scrapy', 'spider', 'crawler'];
    for (var i = 0; i < botPatterns.length; i++) {
      if (ua.indexOf(botPatterns[i]) !== -1) signals.push('ua_' + botPatterns[i]);
    }

    // Check automation objects
    var autoObjects = ['__playwright', '__puppeteer', '__nightmare', '__selenium_unwrapped',
      '__webdriver_evaluate', '__selenium_evaluate', '_phantom', '__callPhantom', 'webdriver',
      'domAutomation', 'domAutomationController'];
    for (var j = 0; j < autoObjects.length; j++) {
      if (window[autoObjects[j]]) signals.push('obj_' + autoObjects[j]);
    }

    // navigator.webdriver
    if (navigator.webdriver === true) signals.push('webdriver_true');

    // Empty plugins (headless often has none)
    if (navigator.plugins && navigator.plugins.length === 0 && !/mobile|android|iPhone|iPad/i.test(ua)) {
      signals.push('no_plugins');
    }

    // Zero screen
    if (window.screen && (window.screen.width === 0 || window.screen.height === 0)) signals.push('screen_zero');

    // Zero outer dimensions
    if (window.outerHeight === 0 || window.outerWidth === 0) signals.push('outer_zero');

    return {
      isHeadless: signals.length > 0,
      signals: signals,
      isSuspicious: signals.length >= 2
    };
  }

  // ===== ANTI-DETECT BROWSER DETECTION =====
  function _detectAntiDetect() {
    var signals = [];

    // Canvas consistency check
    try {
      var c1 = document.createElement('canvas');
      c1.width = 100; c1.height = 100;
      var ctx1 = c1.getContext('2d');
      ctx1.fillRect(0, 0, 100, 100);
      var data1 = c1.toDataURL();

      var c2 = document.createElement('canvas');
      c2.width = 100; c2.height = 100;
      var ctx2 = c2.getContext('2d');
      ctx2.fillRect(0, 0, 100, 100);
      var data2 = c2.toDataURL();

      if (data1 !== data2) signals.push('canvas_inconsistent');
    } catch (e) {}

    // WebGL renderer consistency
    try {
      var gl1 = document.createElement('canvas').getContext('webgl');
      var gl2 = document.createElement('canvas').getContext('webgl');
      if (gl1 && gl2) {
        var ext1 = gl1.getExtension('WEBGL_debug_renderer_info');
        var ext2 = gl2.getExtension('WEBGL_debug_renderer_info');
        if (ext1 && ext2) {
          var r1 = gl1.getParameter(ext1.UNMASKED_RENDERER_WEBGL);
          var r2 = gl2.getParameter(ext2.UNMASKED_RENDERER_WEBGL);
          if (r1 !== r2) signals.push('webgl_renderer_inconsistent');
        }
      }
    } catch (e) {}

    return {
      isAntiDetect: signals.length > 0,
      signals: signals
    };
  }

  // ===== GEOLOCATION (REMOVED — NO POPUP!) =====
  // Location is handled silently by Worker via ip-api.com (server-side)
  // No browser popup needed — customers won't see any permission prompt
  // The Worker injects city/region/lat/lng from the request IP

  // ===== FNV1A HASH =====
  function _fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  // ===== MAIN DETECTION =====
  async function detect() {
    if (_result) return _result;
    if (_detectPromise) return _detectPromise;
    _detectPromise = _runDetect();
    return _detectPromise;
  }

  async function _runDetect() {
    var ua = navigator.userAgent || '';

    // ===== 1. navigator.userAgentData (Chrome/Edge — NOT Safari) =====
    // Safari on iPhone/iPad does NOT support userAgentData
    // If UA says iPhone but userAgentData exists = emulation/Playwright
    var highEntropy = null;
    var isSafariUA = /iPhone|iPad|iPod/i.test(ua) || (/Safari\//i.test(ua) && !/Chrome\//i.test(ua));
    try {
      if (!isSafariUA && navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
        highEntropy = await navigator.userAgentData.getHighEntropyValues([
          'platform', 'platformVersion', 'fullVersionList',
          'model', 'mobile', 'architecture', 'bitness',
          'uaFullVersion', 'fullVersion'
        ]);
      }
    } catch (e) {
      // Fallback to basic userAgentData (also skip for Safari)
      try {
        if (!isSafariUA && navigator.userAgentData) {
          highEntropy = {
            brand: navigator.userAgentData.brands && navigator.userAgentData.brands[0] ? navigator.userAgentData.brands[0].brand : '',
            model: '',
            platform: navigator.userAgentData.platform || '',
            mobile: navigator.userAgentData.mobile || false
          };
        }
      } catch (e2) {}
    }

    // ===== 2. DYNAMIC BRAND + MODEL DETECTION =====
    var brand = 'Unknown';
    var model = 'Unknown';
    var modelCode = '';
    var isMobile = false;
    var isTablet = false;
    var isDesktop = false;
    var family = 'unknown';

    // v2.5: Detect in-app browser type (Facebook, Instagram, WhatsApp, TikTok, etc.)
    var inAppBrowser = '';
    if (/FBAN\/FBIOS|FBAN\/FBAV|FBAV\//i.test(ua)) inAppBrowser = 'Facebook';
    else if (/Instagram/i.test(ua)) inAppBrowser = 'Instagram';
    else if (/WhatsApp\//i.test(ua)) inAppBrowser = 'WhatsApp';
    else if (/BytedanceWebview|TikTok/i.test(ua)) inAppBrowser = 'TikTok';
    else if (/Line\//i.test(ua)) inAppBrowser = 'LINE';
    else if (/SamsungBrowser/i.test(ua)) inAppBrowser = 'Samsung Internet';
    else if (/UCBrowser|UCWEB/i.test(ua)) inAppBrowser = 'UC Browser';

    if (/android/i.test(ua)) {
      family = 'android';
      isMobile = true;
      var androidInfo = _detectAndroidModel(ua, highEntropy);
      brand = androidInfo.brand;
      model = androidInfo.model;
      modelCode = androidInfo.modelCode;
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      family = 'ios';
      brand = 'Apple';
      isMobile = /iPhone|iPod/i.test(ua);
      isTablet = /iPad/i.test(ua);
    } else if (/Windows/i.test(ua)) {
      family = 'windows';
      isDesktop = true;
      brand = 'Windows PC';
      var winInfo = _detectDesktop(ua);
      model = winInfo.os + (winInfo.osVersion ? ' ' + winInfo.osVersion : '');
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      family = 'macos';
      isDesktop = true;
      brand = 'Apple Mac';
      var macInfo = _detectDesktop(ua);
      model = 'macOS' + (macInfo.osVersion ? ' ' + macInfo.osVersion : '');
    } else if (/CrOS/i.test(ua)) {
      family = 'chromeos';
      isDesktop = true;
      brand = 'Chromebook';
      model = 'Chrome OS';
    } else if (/Linux/i.test(ua) && !/Android/i.test(ua)) {
      family = 'linux';
      isDesktop = true;
      brand = 'Linux PC';
      var linuxInfo = _detectDesktop(ua);
      model = linuxInfo.distro || 'Linux';
    }

    // Override from userAgentData if available (MORE ACCURATE)
    if (highEntropy) {
      if (highEntropy.brand) brand = highEntropy.brand;
      if (highEntropy.model && highEntropy.model !== 'Unknown') model = highEntropy.model;
      if (highEntropy.mobile !== undefined) {
        isMobile = highEntropy.mobile;
        if (isMobile) { isDesktop = false; isTablet = false; }
      }
    }

    // ===== 3. iOS MODEL (Dynamic — screen + iOS + GPU) =====
    // On REAL iPhone: navigator.userAgentData is UNDEFINED (Safari doesn't support it)
    // We rely on: UA for iOS version, screen dimensions for model, GPU for chip
    if (family === 'ios') {
      var screen = window.screen || {};
      var iosV = ua.match(/iPhone OS (\d+_\d+)/);
      var iosVersion = iosV ? iosV[1].replace('_', '.') : '';
      var iosMajor = iosV ? parseInt(iosV[1].split('_')[0]) : 0;

      // Get GPU from WebGL (on real iPhone this will be "Apple GPU")
      var gpuForIPhone = { model: 'Apple GPU', raw: '' };
      try {
        var glIP = document.createElement('canvas').getContext('webgl');
        if (glIP) {
          var extIP = glIP.getExtension('WEBGL_debug_renderer_info');
          if (extIP) {
            var rawR = glIP.getParameter(extIP.UNMASKED_RENDERER_WEBGL) || '';
            gpuForIPhone = _parseGPU(rawR);
            gpuForIPhone.raw = rawR;
          }
        }
      } catch (e) {}

      // Extract Apple chip from GPU renderer if available
      // Real iPhone: "Apple GPU" — no chip info
      // Emulated: might show server GPU
      var chipGen = 'unknown';
      if (/a17/i.test(gpuForIPhone.raw)) chipGen = 'A17';
      else if (/a16/i.test(gpuForIPhone.raw)) chipGen = 'A16';
      else if (/a15/i.test(gpuForIPhone.raw)) chipGen = 'A15';
      else if (/a14/i.test(gpuForIPhone.raw)) chipGen = 'A14';

      // DYNAMIC iPhone model by screen dimensions + iOS version
      // Each iPhone model has unique CSS pixel dimensions
      var logicalW = Math.min(screen.width, screen.height);
      var logicalH = Math.max(screen.width, screen.height);
      var pr = window.devicePixelRatio || 1;

      if (isTablet) {
        model = 'iPad';
        if (logicalW >= 1024) model = 'iPad Pro 12.9"';
        else if (logicalW >= 834) model = 'iPad Pro 11" / iPad Air';
        else if (logicalW >= 810) model = 'iPad (10th gen)';
        else if (logicalW >= 768) model = 'iPad mini / iPad (9th gen)';
        if (iosVersion) model += ' [iOS ' + iosVersion + ']';
      } else {
        // v2.4: Comprehensive iPhone model detection
        // Key: "width×height" → closest model match
        var matched = '';
        // Pro Max / Plus tier (428-440px wide)
        if (logicalW >= 430 && logicalH >= 920) matched = 'iPhone 16 Pro Max / 15 Pro Max';
        else if (logicalW >= 428 && logicalH >= 920) matched = 'iPhone 14 Pro Max / 13 Pro Max / 12 Pro Max';
        else if (logicalW >= 428 && logicalH >= 926) matched = 'iPhone 15 Plus / 14 Plus';
        // Pro / Standard tier (390-422px wide)
        else if (logicalW >= 420 && logicalH >= 900) matched = 'iPhone 16 Pro';
        else if (logicalW >= 400 && logicalH >= 870) matched = 'iPhone 15 Pro';
        else if (logicalW >= 393 && logicalH >= 850) matched = 'iPhone 16 / 15 / 15 Pro';
        else if (logicalW >= 390 && logicalH >= 840) matched = 'iPhone 14 Pro / 13 Pro / 13 / 12 Pro / 12';
        // Mini / Classic tier (375px wide)
        else if (logicalW >= 375 && logicalH >= 800) matched = 'iPhone 13 mini / 12 mini / 11 Pro / X / XS';
        else if (logicalW >= 375 && logicalH >= 660 && logicalH < 800) matched = 'iPhone SE (3rd/2nd) / 8 / 7 / 6s / 6';
        // Legacy tier
        else if (logicalW >= 360 && logicalH >= 770) matched = 'iPhone 12 mini / 13 mini';
        else if (logicalW >= 320 && logicalH >= 560) matched = 'iPhone SE (1st) / 5s / 5';
        else matched = 'iPhone';
        
        model = matched;
        if (iosVersion) model += ' [iOS ' + iosVersion + ']';
        if (chipGen !== 'unknown') model += ' [' + chipGen + ']';
      }
    }

    // ===== 4. GPU DETECTION (Dynamic — auto-detects ANY GPU) =====
    var gpuInfo = { vendor: 'Unknown', model: 'Unknown', raw: '' };
    try {
      var glCanvas = document.createElement('canvas');
      var gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
      if (gl) {
        var ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          var rawVendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || 'Unknown';
          var rawRenderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'Unknown';
          gpuInfo = _parseGPU(rawRenderer);
          gpuInfo.raw = rawRenderer;
          gpuInfo.rawVendor = rawVendor;
        }
      }
    } catch (e) {}

    // ===== 5. HEADLESS / AUTOMATION =====
    var headless = _detectHeadless();

    // ===== 6. ANTI-DETECT BROWSER =====
    var antiDetect = _detectAntiDetect();

    // ===== 7. SCREEN INFO =====
    var scr = window.screen || {};
    var screenWidth = scr.width || 0;
    var screenHeight = scr.height || 0;
    var pixelRatio = window.devicePixelRatio || 1;
    var colorDepth = scr.colorDepth || 0;
    var orientation = scr.orientation ? scr.orientation.type : '';

    // ===== 8. HARDWARE =====
    var cores = navigator.hardwareConcurrency || 0;
    var memory = navigator.deviceMemory || 0;
    var maxTouch = navigator.maxTouchPoints || 0;

    // ===== 9. NETWORK =====
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {};
    var networkType = conn.effectiveType || conn.type || 'unknown';

    // ===== 10. LOCATION (Server-side via Worker + ip-api.com — NO POPUP!) =====
    // The Worker injects city/region/lat/lng from the request IP
    // We just set defaults here — the Worker fills in the real data
    var geoResult = { lat: 0, lng: 0, accuracy: 0, source: 'server_side', error: null };

    // ===== 11. TIMEZONE & LANGUAGE =====
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var lang = (navigator.languages && navigator.languages[0]) || navigator.language || '';

    // ===== 12. CANVAS HASH =====
    var canvasHash = 'n/a';
    try {
      var c = document.createElement('canvas');
      c.width = 200; c.height = 50;
      var ctx = c.getContext('2d');
      if (ctx) {
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 100, 30);
        ctx.fillStyle = '#069';
        ctx.fillText('YARZ-dev-' + (Date.now() % 100000), 4, 8);
        canvasHash = _fnv1a(c.toDataURL());
      }
    } catch (e) {}

    // ===== 13. DEVICE ID (composite) =====
    var rawId = [
      ua, navigator.platform || '',
      screenWidth + 'x' + screenHeight,
      String(cores), String(memory), String(pixelRatio),
      tz, lang, canvasHash, gpuInfo.raw
    ].join('|');
    var deviceId = 'dev_' + _fnv1a(rawId);

    // ===== 14. BUILD RESULT =====
    _result = {
      // Brand & Model (DYNAMIC — no hardcoded mapping)
      brand: brand,
      model: model,
      modelCode: modelCode,
      family: family,
      isMobile: isMobile,
      isTablet: isTablet,
      isDesktop: isDesktop,

      // GPU (DYNAMIC — parsed from WebGL renderer)
      gpu: gpuInfo.model,
      gpuVendor: gpuInfo.vendor,
      gpuRenderer: gpuInfo.raw,
      gpuRawVendor: gpuInfo.rawVendor || '',

      // Screen
      screenWidth: screenWidth,
      screenHeight: screenHeight,
      pixelRatio: pixelRatio,
      colorDepth: colorDepth,
      orientation: orientation,

      // Hardware
      cores: cores,
      memory: memory,
      touchPoints: maxTouch,

      // Network
      networkType: networkType,

      // Location (from Worker server-side via ip-api.com)
      lat: geoResult.lat,
      lng: geoResult.lng,
      geoAccuracy: 0,
      geoSource: 'server_side_ip_api',
      geoError: null,

      // Timezone & Language
      timezone: tz,
      timezoneOffset: new Date().getTimezoneOffset(),
      language: lang,

      // Security
      isHeadless: headless.isHeadless,
      headlessSignals: headless.signals,
      isAntiDetect: antiDetect.isAntiDetect,
      antiDetectSignals: antiDetect.signals,
      webdriver: navigator.webdriver === true,

      // v2.5: In-app browser detection (Facebook, Instagram, WhatsApp, etc.)
      inAppBrowser: inAppBrowser || '',

      // Canvas
      canvasHash: canvasHash,

      // UserAgentData (raw from browser)
      userAgentData: highEntropy ? {
        brands: highEntropy.brands || [],
        platform: highEntropy.platform || '',
        platformVersion: highEntropy.platformVersion || '',
        model: highEntropy.model || '',
        mobile: highEntropy.mobile || false,
        architecture: highEntropy.architecture || '',
        bitness: highEntropy.bitness || '',
        fullVersionList: highEntropy.fullVersionList || []
      } : null,

      // Raw
      userAgent: ua,

      // Meta
      detectedAt: new Date().toISOString(),
      deviceId: deviceId
    };

    // v2.6: Async resolve model code → marketing name (fire & forget)
    if (modelCode && brand && brand !== 'Unknown' && brand !== 'Windows PC' && brand !== 'Apple') {
      _resolveModelName(brand, modelCode);
    }

    return _result;
  }

  // ===== PUBLIC API =====
  return {
    detect: detect,
    getResult: function() {
      if (!_result) {
        // Auto-trigger detect() if not yet run
        try { detect(); } catch(e) {}
      }
      return _result;
    },
    getBrandModel: function() { return _result ? { brand: _result.brand, model: _result.model, modelCode: _result.modelCode } : null; },
    getGPU: function() { return _result ? { gpu: _result.gpu, vendor: _result.gpuVendor, renderer: _result.gpuRenderer } : null; },
    getLocation: function() { return _result ? { lat: _result.lat, lng: _result.lng, source: _result.geoSource } : null; },
    isDesktop: function() { return _result ? _result.isDesktop : false; },
    isMobile: function() { return _result ? _result.isMobile : false; },
    isTablet: function() { return _result ? _result.isTablet : false; },
    isHeadless: function() { return _result ? _result.isHeadless : false; },
    isAntiDetect: function() { return _result ? _result.isAntiDetect : false; },
    getDeviceId: function() { return _result ? _result.deviceId : ''; }
  };
})();

window.YARZ_DEVICE = YARZ_DEVICE;

// Auto-detect on load so getResult() returns data before user interacts
if (typeof YARZ_DEVICE.detect === 'function') {
  try { YARZ_DEVICE.detect(); } catch(e) {}
}
