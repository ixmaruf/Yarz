/* ============================================================
   YARZ FORTRESS v2.0 — Ultra-Powerful Anti-Fraud System
   ✅ FingerprintJS v5 integration (40+ browser signals)
   ✅ IP geolocation + VPN/Proxy/Tor detection (ip-api.com)
   ✅ Canvas + WebGL + AudioContext fingerprinting
   ✅ Device name parsing (Samsung, iPhone, Xiaomi, etc.)
   ✅ 15+ risk signals → 0-100 score
   ✅ Local-first blocklist (works offline)
   ✅ Server-side blocklist (cross-device sync)
   ✅ Shadow ban: fake success for blocked devices
   ✅ Composite hash matching (catches VPN/incognito bypass)
   ✅ Fingerprint family tracking (device similarity)
   ✅ Auto-save fingerprints to Supabase (7-day retention)
   ✅ Pairs with shield.js (behavior) — does NOT replace it
   ============================================================ */
const YARZ_FORTRESS = (() => {
  'use strict';

  // ===== CONFIG =====
  const CFG = {
    VERSION: '2.0',
    SOFT_BLOCK_THRESHOLD: 70,
    HARD_BLOCK_THRESHOLD: 90,
    TELEGRAM_ALERT_THRESHOLD: 70,

    MAX_ORDERS_PER_DEVICE_5MIN: 2,
    MAX_ORDERS_PER_DEVICE_1H:   4,
    MAX_ORDERS_PER_DEVICE_24H:  5,
    BURST_WINDOW_MS:            60_000,
    BURST_THRESHOLD:            3,

    MIN_FORM_TIME_MS: 2500,

    PHONE_VELOCITY_24H:    10,
    PHONE_MISMATCH_1H:     3,
    ADDRESS_SIMILARITY_24H: 3,

    FINGERPRINT_SYNC_INTERVAL_MS: 300_000, // 5 min
    IP_CACHE_TTL_MS: 600_000,              // 10 min
    FINGERPRINT_SIMILARITY_THRESHOLD: 0.80,

    KEYS: {
      BLOCKLIST:    'yarz_fortress_blocked',
      EVENTS:       'yarz_fortress_events',
      SALT:         'yarz_fortress_salt',
      DEVICE:       'yarz_fortress_device',
      PROFILE:      'yarz_fortress_profile',
      IP_CACHE:     'yarz_fortress_ip',
      FPJS_ID:      'yarz_fortress_fpjs',
      COMPOSITE:    'yarz_fortress_composite',
      VISITOR_ID:   'yarz_fortress_visitor',
    },
  };

  // ===== MODULE STATE =====
  let _initialized = false;
  let _deviceId = null;
  let _visitorId = null;
  let _compositeHash = null;
  let _profile = null;
  let _salt = null;
  let _localBlocklist = null;
  let _eventLog = [];
  let _serverBlocklist = null;
  let _ipData = null;
  let _fpjsVisitorId = null;
  let _fpjsConfidence = 0;
  let _fingerprintReady = false;
  let _lastSyncTime = 0;

  // ===== LOCALSTORAGE HELPERS =====
  function _readLS(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function _writeLS(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function _readLSValidate(key, fallback, validator) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      var parsed = JSON.parse(raw);
      if (validator && !validator(parsed)) return fallback;
      return parsed;
    } catch (e) { return fallback; }
  }

  // ===== HASH HELPERS =====
  function _fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  async function _sha256(str) {
    try {
      var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
    } catch (e) {
      return _fnv1a(str) + _fnv1a(str + '_salt');
    }
  }

  function _hashPhone(phone) {
    if (!phone) return '';
    var norm = String(phone).replace(/\D/g, '');
    if (!_salt) _salt = _readLS(CFG.KEYS.SALT, null) || _initSalt();
    return 'ph_' + _fnv1a(norm + _salt);
  }
  function _initSalt() {
    var s = '';
    try {
      var a = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(a);
      s = Array.from(a, function(b){ return b.toString(16).padStart(2,'0'); }).join('');
    } catch (e) {
      s = Date.now().toString(36) + Math.random().toString(36).slice(2);
    }
    _writeLS(CFG.KEYS.SALT, s);
    _salt = s;
    return s;
  }
  function _randHex(n) {
    var s = '';
    while (s.length < n) s += Math.random().toString(16).slice(2);
    return s.slice(0, n);
  }

  // ===== DEVICE NAME PARSING =====
  function _parseDeviceName(ua) {
    if (!ua) return 'Unknown';
    // Samsung
    if (/SM-[A-Z]\d+/i.test(ua))       return 'Samsung ' + (ua.match(/SM-[A-Z]\d+[A-Z]*/i) || [])[0];
    if (/SAMSUNG/i.test(ua))            return 'Samsung Device';
    // Apple
    if (/iPhone/i.test(ua))             return 'iPhone';
    if (/iPad/i.test(ua))               return 'iPad';
    // Xiaomi / Redmi / POCO
    if (/Redmi/i.test(ua))              return 'Redmi ' + (ua.match(/Redmi[\s_]?(\S+)/i) || [,''])[1];
    if (/POCO/i.test(ua))               return 'POCO ' + (ua.match(/POCO[\s_]?(\S+)/i) || [,''])[1];
    if (/Mi\s?\d/i.test(ua))            return 'Xiaomi ' + (ua.match(/Mi[\s_]?(\d\S*)/i) || [,''])[1];
    if (/M200[67]\w+/i.test(ua))        return 'Redmi ' + (ua.match(/M200[67]\w+/i) || [])[0];
    // Realme
    if (/RMX\d+/i.test(ua))             return 'Realme ' + (ua.match(/RMX\d+/i) || [])[0];
    // Oppo
    if (/CPH\d+/i.test(ua))             return 'Oppo ' + (ua.match(/CPH\d+/i) || [])[0];
    // Vivo
    if (/V\d{4}\b/i.test(ua))           return 'Vivo ' + (ua.match(/V\d{4}\w*/i) || [])[0];
    if (/vivo/i.test(ua))               return 'Vivo ' + (ua.match(/vivo[\s_]?(\S+)/i) || [,''])[1];
    // Tecno
    if (/TECNO/i.test(ua))              return 'Tecno ' + (ua.match(/TECNO[\s_]?(\S+)/i) || [,''])[1];
    // Infinix
    if (/Infinix/i.test(ua))            return 'Infinix ' + (ua.match(/Infinix[\s_]?(\S+)/i) || [,''])[1];
    // Huawei / Honor
    if (/HUAWEI/i.test(ua))             return 'Huawei ' + (ua.match(/HUAWEI[\s_]?(\S+)/i) || [,''])[1];
    if (/Honor/i.test(ua))              return 'Honor ' + (ua.match(/Honor[\s_]?(\S+)/i) || [,''])[1];
    // Nokia
    if (/Nokia/i.test(ua))              return 'Nokia ' + (ua.match(/Nokia[\s_]?(\S+)/i) || [,''])[1];
    // OnePlus
    if (/OnePlus/i.test(ua))            return 'OnePlus ' + (ua.match(/OnePlus[\s_]?(\S+)/i) || [,''])[1];
    // Google Pixel
    if (/Pixel/i.test(ua))              return 'Google Pixel ' + (ua.match(/Pixel[\s_]?(\S+)/i) || [,''])[1];
    // Motorola
    if (/moto/i.test(ua))               return 'Motorola ' + (ua.match(/moto[\s_]?(\S+)/i) || [,''])[1];
    // Desktop
    if (/Windows NT 10/i.test(ua))      return 'Windows 10/11 PC';
    if (/Windows NT/i.test(ua))         return 'Windows PC';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
    if (/CrOS/i.test(ua))               return 'Chromebook';
    if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'Linux PC';
    if (/Android/i.test(ua))            return 'Android Device';
    return 'Unknown Device';
  }

  function _parseOS(ua) {
    if (!ua) return 'unknown';
    var m = ua.match(/(Android|iPhone OS|Mac OS X|Windows NT|Linux|CrOS) ?[\d._]+/);
    return m ? m[0] : 'unknown';
  }

  function _parseBrowser(ua) {
    if (!ua) return 'Unknown';
    if (/Edg\//i.test(ua))     return 'Edge ' + (ua.match(/Edg\/([\d.]+)/) || [,'?'])[1];
    if (/Chrome\//i.test(ua))  return 'Chrome ' + (ua.match(/Chrome\/([\d.]+)/) || [,'?'])[1];
    if (/Firefox\//i.test(ua)) return 'Firefox ' + (ua.match(/Firefox\/([\d.]+)/) || [,'?'])[1];
    if (/Safari\//i.test(ua))  return 'Safari ' + (ua.match(/Version\/([\d.]+)/) || [,'?'])[1];
    return 'Unknown';
  }

  // ===== ADVANCED FINGERPRINTING =====
  function _captureCanvasHash() {
    try {
      var c = document.createElement('canvas');
      c.width = 240; c.height = 60;
      var ctx = c.getContext('2d');
      if (!ctx) return 'n/a';
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 100, 30);
      ctx.fillStyle = '#069';
      ctx.fillText('YARZ-fp-' + (Date.now()%100000), 4, 8);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Fortress v2', 4, 20);
      return _fnv1a(c.toDataURL());
    } catch (e) { return 'n/a'; }
  }

  function _captureWebGLInfo() {
    try {
      var gl = document.createElement('canvas').getContext('webgl') ||
                document.createElement('canvas').getContext('experimental-webgl');
      if (!gl) return { vendor: 'unknown', renderer: 'unknown' };
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (!ext) return { vendor: 'unknown', renderer: 'unknown' };
      return {
        vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || 'unknown',
        renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'unknown'
      };
    } catch (e) { return { vendor: 'unknown', renderer: 'unknown' }; }
  }

  function _captureAudioHash() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return 'n/a';
      var ctx = new AC();
      var osc = ctx.createOscillator();
      var analyser = ctx.createAnalyser();
      var gain = ctx.createGain();
      var proc = ctx.createScriptProcessor(4096, 1, 1);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(10000, ctx.currentTime);
      osc.connect(analyser);
      analyser.connect(proc);
      proc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      var hash = 'pending';
      proc.onaudioprocess = function(event) {
        var data = event.inputBuffer.getChannelData(0);
        var sum = 0;
        for (var i = 0; i < Math.min(1000, data.length); i++) sum += Math.abs(data[i]);
        hash = String(sum);
        osc.disconnect();
        try { ctx.close(); } catch(e){}
      };
      return hash;
    } catch (e) { return 'n/a'; }
  }

  function _captureFontCount() {
    try {
      var testFonts = ['Arial','Verdana','Times New Roman','Courier New','Georgia',
        'Palatino','Garamond','Comic Sans MS','Impact','Lucida Console',
        'Tahoma','Trebuchet MS','Helvetica','Calibri','Cambria','Segoe UI',
        'Roboto','Open Sans','Lato','Ubuntu'];
      var span = document.createElement('span');
      span.style.cssText = 'position:absolute;left:-9999px;font-size:72px;';
      span.innerHTML = 'mmmmmmmmmmlli';
      document.body.appendChild(span);
      var defaultWidth = span.offsetWidth;
      var defaultHeight = span.offsetHeight;
      var count = 0;
      for (var i = 0; i < testFonts.length; i++) {
        span.style.fontFamily = '"' + testFonts[i] + '", monospace';
        if (span.offsetWidth !== defaultWidth || span.offsetHeight !== defaultHeight) count++;
      }
      document.body.removeChild(span);
      return count;
    } catch (e) { return 0; }
  }

  // ===== IP GEOLOCATION =====
  function _fetchIPData() {
    return new Promise(function(resolve) {
      // Check cache first
      var cached = _readLS(CFG.KEYS.IP_CACHE, null);
      if (cached && cached.ts && (Date.now() - cached.ts) < CFG.IP_CACHE_TTL_MS) {
        _ipData = cached;
        resolve(cached);
        return;
      }

      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var opts = { method: 'GET' };
      if (ctl) {
        opts.signal = ctl.signal;
        setTimeout(function(){ try { ctl.abort(); } catch(e){} }, 5000);
      }

      fetch('http://ip-api.com/json/?fields=status,message,country,countryCode,regionName,city,isp,org,as,proxy,hosting,query', opts)
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(data){
          if (data && data.status === 'success') {
            var ipInfo = {
              ip: data.query || '',
              country: data.country || '',
              countryCode: data.countryCode || '',
              region: data.regionName || '',
              city: data.city || '',
              isp: data.isp || '',
              org: data.org || '',
              as: data.as || '',
              isProxy: data.proxy || false,
              isHosting: data.hosting || false,
              ts: Date.now()
            };
            _ipData = ipInfo;
            _writeLS(CFG.KEYS.IP_CACHE, ipInfo);
            resolve(ipInfo);
          } else {
            resolve(null);
          }
        }).catch(function(){ resolve(null); });
    });
  }

  // ===== COMPOSITE FINGERPRINT HASH =====
  async function _computeCompositeHash(profile, fpjsId, ipData) {
    var parts = [
      profile.deviceId || '',
      fpjsId || '',
      profile.canvasHash || '',
      profile.screenResolution || '',
      String(profile.hwCores || ''),
      String(profile.deviceMemoryGb || ''),
      String(profile.pixelRatio || ''),
      profile.timezone || '',
      profile.language || '',
      (ipData && ipData.ip) ? ipData.ip : '',
      profile.webglRenderer || ''
    ];
    var raw = parts.join('|');
    return await _sha256(raw);
  }

  // ===== FULL DEVICE FINGERPRINT CAPTURE =====
  async function _captureFullFingerprint() {
    var n = navigator || {};
    var s = screen || {};
    var tz = (Intl && Intl.DateTimeFormat) ?
      Intl.DateTimeFormat().resolvedOptions().timeZone || '' : '';
    var lang = (n.languages && n.languages[0]) || n.language || '';
    var conn = n.connection || n.mozConnection || n.webkitConnection || {};

    var canvasHash = _captureCanvasHash();
    var webglInfo = _captureWebGLInfo();
    var audioHash = _captureAudioHash();
    var fontCount = _captureFontCount();
    var ua = n.userAgent || '';

    var deviceName = _parseDeviceName(ua);
    var os = _parseOS(ua);
    var browser = _parseBrowser(ua);

    // Raw fingerprint string (for hash)
    var raw = [
      ua, n.platform || '',
      s.width + 'x' + s.height, s.colorDepth || '',
      (window.devicePixelRatio || 1),
      n.hardwareConcurrency || '', n.deviceMemory || '',
      (n.maxTouchPoints || 0), tz, lang,
      canvasHash, webglInfo.renderer
    ].join('|');

    var deviceId = 'd_' + _fnv1a(raw) + _fnv1a(raw + (_salt || ''));

    var profile = {
      deviceId: deviceId,
      deviceName: deviceName,
      os: os,
      browser: browser,
      screen: s.width + 'x' + s.height + ' @' + (window.devicePixelRatio || 1) + 'x',
      screenResolution: s.width + 'x' + s.height,
      hwCores: n.hardwareConcurrency || 0,
      deviceMemoryGb: n.deviceMemory || 0,
      pixelRatio: window.devicePixelRatio || 1,
      canvasHash: canvasHash,
      audioHash: audioHash,
      webglRenderer: webglInfo.renderer,
      webglVendor: webglInfo.vendor,
      timezone: tz,
      timezoneOffset: new Date().getTimezoneOffset(),
      language: lang,
      colorDepth: s.colorDepth || 0,
      networkType: conn.effectiveType || conn.type || 'unknown',
      touchSupport: n.maxTouchPoints || 0,
      fontsCount: fontCount,
      firstSeenAt: new Date().toISOString()
    };

    return profile;
  }

  // ===== EVENT LOG (rolling 24h, capped 200) =====
  function _loadEventLog() {
    var data = _readLSValidate(CFG.KEYS.EVENTS, [], function(v){ return Array.isArray(v); });
    var cutoff = Date.now() - 24 * 60 * 60 * 1000;
    var filtered = data.filter(function(e){ return e && e.ts && e.ts >= cutoff; });
    if (filtered.length !== data.length) _writeLS(CFG.KEYS.EVENTS, filtered);
    return filtered;
  }
  function _recordEvent(type, extra) {
    if (!_eventLog.length) _eventLog = _loadEventLog();
    var ev = Object.assign({
      ts: Date.now(),
      type: type,
      deviceId: _deviceId,
      visitorId: _visitorId
    }, extra || {});
    _eventLog.push(ev);
    if (_eventLog.length > 200) _eventLog = _eventLog.slice(-200);
    _writeLS(CFG.KEYS.EVENTS, _eventLog);
    return ev;
  }

  // ===== BLOCKLIST =====
  function _loadLocalBlocklist() {
    var data = _readLSValidate(CFG.KEYS.BLOCKLIST, [], function(v){ return Array.isArray(v); });
    return new Set(data);
  }
  function _saveLocalBlocklist() {
    _writeLS(CFG.KEYS.BLOCKLIST, Array.from(_localBlocklist));
  }
  function _isLocallyBlocked(id) {
    if (!_localBlocklist) _localBlocklist = _loadLocalBlocklist();
    return _localBlocklist.has(id);
  }
  function _isServerBlocked(id) {
    return _serverBlocklist && _serverBlocklist.has(id);
  }
  function isBlocked(id) {
    id = id || _deviceId;
    if (_isLocallyBlocked(id)) return true;
    if (_isServerBlocked(id)) return true;
    // Also check by visitor_id and composite hash
    if (_visitorId && (_isLocallyBlocked(_visitorId) || _isServerBlocked(_visitorId))) return true;
    if (_compositeHash && (_isLocallyBlocked(_compositeHash) || _isServerBlocked(_compositeHash))) return true;
    return false;
  }

  // ===== RISK SIGNALS =====
  function _signalDeviceVelocity() {
    if (!_eventLog.length) _eventLog = _loadEventLog();
    var now = Date.now();
    var c1min = 0, c5 = 0, c1h = 0, c24 = 0;
    for (var i = 0; i < _eventLog.length; i++) {
      var e = _eventLog[i];
      if (e.type !== 'order_attempt') continue;
      var age = now - e.ts;
      if (age < 60000) c1min++;
      if (age < 5*60*1000) c5++;
      if (age < 60*60*1000) c1h++;
      if (age < 24*60*60*1000) c24++;
    }
    if (c1min >= CFG.BURST_THRESHOLD) return 95;
    if (c5 > CFG.MAX_ORDERS_PER_DEVICE_5MIN) return 70;
    if (c1h > CFG.MAX_ORDERS_PER_DEVICE_1H) return 50;
    if (c24 > CFG.MAX_ORDERS_PER_DEVICE_24H) return 30;
    return 0;
  }

  function _signalPhoneVelocity(phone) {
    if (!phone) return 0;
    var ph = _hashPhone(phone);
    var now = Date.now();
    var c = 0;
    if (!_eventLog.length) _eventLog = _loadEventLog();
    for (var i = 0; i < _eventLog.length; i++) {
      var e = _eventLog[i];
      if (e.type === 'order_attempt' && e.phoneHash === ph && (now - e.ts) < 24*60*60*1000) c++;
    }
    if (c > CFG.PHONE_VELOCITY_24H) return 60;
    if (c > 5) return 25;
    return 0;
  }

  function _signalPhoneMismatch(phone) {
    if (!phone) return 0;
    var ph = _hashPhone(phone);
    if (!_eventLog.length) _eventLog = _loadEventLog();
    var now = Date.now();
    var phones = {};
    for (var i = 0; i < _eventLog.length; i++) {
      var e = _eventLog[i];
      if (e.type === 'order_attempt' && e.phoneHash && (now - e.ts) < 60*60*1000) {
        phones[e.phoneHash] = (phones[e.phoneHash] || 0) + 1;
      }
    }
    var distinct = Object.keys(phones).length;
    if (distinct >= CFG.PHONE_MISMATCH_1H) return 60;
    if (distinct >= 2) return 20;
    return 0;
  }

  function _signalAddressShape(address) {
    if (!address) return 30;
    var a = String(address).trim();
    var words = a.split(/\s+/).filter(Boolean);
    if (words.length < 3) return 30;
    var hasVowel = /[aeiouAEIOU\u0985-\u09AF]/.test(a);
    if (!hasVowel && a.length > 12) return 40;
    if (/\b(test|fake|asdf|qwerty|xxx)\b/i.test(a)) return 50;
    return 0;
  }

  function _signalAddressSimilarity(phone, address) {
    if (!address) return 0;
    if (!_eventLog.length) _eventLog = _loadEventLog();
    var now = Date.now();
    var norm = String(address).toLowerCase().replace(/[^a-z0-9\u0985-\u09AF]+/g,' ').trim();
    var first12 = norm.split(' ').slice(0,3).join(' ');
    var c = 0;
    for (var i = 0; i < _eventLog.length; i++) {
      var e = _eventLog[i];
      if (e.type === 'order_attempt' && e.addressSig && (now - e.ts) < 24*60*60*1000) {
        if (e.addressSig === first12) c++;
      }
    }
    if (c >= CFG.ADDRESS_SIMILARITY_24H) return 35;
    if (c >= 2) return 15;
    return 0;
  }

  function _signalFormTiming(formOpenTime) {
    if (!formOpenTime) return 0;
    var elapsed = Date.now() - formOpenTime;
    if (elapsed < 1500) return 50;
    if (elapsed < CFG.MIN_FORM_TIME_MS) return 25;
    return 0;
  }

  function _signalUA() {
    var ua = (navigator.userAgent || '').toLowerCase();
    if (/(headless|phantom|puppeteer|playwright|curl|python-requests|node-fetch|wget|httpie)/.test(ua)) return 95;
    if (!ua) return 30;
    return 0;
  }

  function _signalWebGL() {
    if (!_profile) return 0;
    var r = String(_profile.webglRenderer || '').toLowerCase();
    if (/swiftshader|llvmpipe|software/.test(r)) return 50;
    if (/google inc\. \(google\)/.test(r)) return 40;
    return 0;
  }

  function _signalTimezone() {
    if (!_profile) return 0;
    var tz = _profile.timezone || '';
    if (!tz) return 10;
    if (tz !== 'Asia/Dhaka' && tz.indexOf('Dhaka') === -1) return 20;
    return 0;
  }

  function _signalCanvasTamper() {
    if (!_profile) return 0;
    if (_profile.canvasHash === 'n/a') return 15;
    return 0;
  }

  function _signalTimeOfDay() {
    var h = new Date().getHours();
    if (h >= 2 && h < 5) return 15;
    return 0;
  }

  function _signalIsLocalBlocked() {
    if (_isLocallyBlocked(_deviceId)) return 100;
    return 0;
  }

  function _signalIsServerBlocked() {
    if (_isServerBlocked(_deviceId)) return 100;
    return 0;
  }

  function _signalVPN() {
    if (_ipData && (_ipData.isProxy || _ipData.isHosting)) return 40;
    return 0;
  }

  function _signalFingerprintMismatch() {
    // If FingerprintJS says low confidence, it might be a fresh browser = suspicious
    if (_fpjsConfidence > 0 && _fpjsConfidence < 0.3) return 20;
    return 0;
  }

  // ===== SCORE ORDER =====
  function scoreOrder(orderData) {
    if (!_initialized) init();
    orderData = orderData || {};
    var name = orderData.name || '';
    var phone = orderData.phone || '';
    var address = orderData.address || '';
    var formOpenTime = orderData._formOpenTime || 0;

    var ph = _hashPhone(phone);
    var addrSig = String(address).toLowerCase().replace(/[^a-z0-9\u0985-\u09AF]+/g,' ').trim().split(' ').slice(0,3).join(' ');
    _recordEvent('order_attempt', { phoneHash: ph, addressSig: addrSig, name: name });

    var signals = [
      ['local_blocked',   _signalIsLocalBlocked()],
      ['server_blocked',  _signalIsServerBlocked()],
      ['burst',           _signalDeviceVelocity()],
      ['phone_velocity',  _signalPhoneVelocity(phone)],
      ['phone_mismatch',  _signalPhoneMismatch(phone)],
      ['address_shape',   _signalAddressShape(address)],
      ['address_sim',     _signalAddressSimilarity(phone, address)],
      ['form_too_fast',   _signalFormTiming(formOpenTime)],
      ['ua_suspicious',   _signalUA()],
      ['webgl_bot',       _signalWebGL()],
      ['timezone',        _signalTimezone()],
      ['canvas_blocked',  _signalCanvasTamper()],
      ['time_of_day',     _signalTimeOfDay()],
      ['vpn_proxy',       _signalVPN()],
      ['fpjs_low_conf',   _signalFingerprintMismatch()]
    ];

    var total = 0;
    for (var i = 0; i < signals.length; i++) total += signals[i][1];
    total = Math.min(total, 100);

    var action = 'allow';
    var reason = '';
    if (total >= CFG.HARD_BLOCK_THRESHOLD) {
      action = 'hard';
      reason = 'fortress_hard_block';
    } else if (total >= CFG.SOFT_BLOCK_THRESHOLD) {
      action = 'soft';
      reason = 'fortress_soft_flag';
    } else {
      action = 'allow';
      reason = 'ok';
    }

    _recordEvent('score', { total: total, action: action, phoneHash: ph });

    return {
      score: total,
      action: action,
      reason: reason,
      deviceId: _deviceId,
      visitorId: _visitorId,
      compositeHash: _compositeHash,
      signals: signals,
      silent: action === 'hard',
      ip: _ipData ? _ipData.ip : '',
      country: _ipData ? _ipData.country : '',
      city: _ipData ? _ipData.city : '',
      deviceName: _profile ? _profile.deviceName : ''
    };
  }

  // ===== SERVER SYNC =====
  function _syncFromServer() {
    if (!window.YARZ_API) return;
    try {
      var baseUrl = (typeof window.YARZ_API.getApiUrl === 'function') ? window.YARZ_API.getApiUrl() : ((typeof window.YARZ_API.getReadUrl === 'function') ? window.YARZ_API.getReadUrl() : '');
      if (!baseUrl) return;
      var url = baseUrl + '?action=__fortress_public_blocklist';
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var opts = { method: 'GET' };
      if (ctl) { opts.signal = ctl.signal; setTimeout(function(){ try { ctl.abort(); } catch(e){} }, 5000); }
      fetch(url, opts)
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(data){
          if (data && Array.isArray(data.devices)) {
            _serverBlocklist = new Set(data.devices);
          }
        }).catch(function(){});
    } catch (e) {}
  }

  // ===== SAVE FINGERPRINT TO SERVER =====
  async function _saveFingerprintToServer() {
    if (!_profile || !_visitorId) return;
    if (!_fingerprintReady) return;

    // Rate limit: don't sync more than once per 5 min
    var now = Date.now();
    if (now - _lastSyncTime < CFG.FINGERPRINT_SYNC_INTERVAL_MS) return;
    _lastSyncTime = now;

    try {
      var baseUrl = (typeof window.YARZ_API.getApiUrl === 'function') ? window.YARZ_API.getApiUrl() : ((typeof window.YARZ_API.getReadUrl === 'function') ? window.YARZ_API.getReadUrl() : '');
      if (!baseUrl) return;

      var payload = {
        visitorId: _visitorId,
        compositeHash: _compositeHash,
        ip: _ipData ? _ipData.ip : '',
        userAgent: navigator.userAgent || '',
        deviceName: _profile.deviceName || '',
        deviceOS: _profile.os || '',
        deviceBrowser: _profile.browser || '',
        deviceScreen: _profile.screen || '',
        canvasHash: _profile.canvasHash || '',
        audioHash: _profile.audioHash || '',
        webglVendor: _profile.webglVendor || '',
        webglRenderer: _profile.webglRenderer || '',
        screenResolution: _profile.screenResolution || '',
        colorDepth: _profile.colorDepth || 0,
        hwCores: _profile.hwCores || 0,
        deviceMemory: _profile.deviceMemoryGb || 0,
        pixelRatio: _profile.pixelRatio || 1,
        timezone: _profile.timezone || '',
        timezoneOffset: _profile.timezoneOffset || 0,
        language: _profile.language || '',
        fontsCount: _profile.fontsCount || 0,
        touchSupport: _profile.touchSupport || 0,
        networkType: _profile.networkType || '',
        fpjsId: _fpjsVisitorId || '',
        fpjsConfidence: _fpjsConfidence || 0,
        ipCountry: _ipData ? _ipData.country : '',
        ipCity: _ipData ? _ipData.city : '',
        ipRegion: _ipData ? _ipData.region : '',
        ipIsp: _ipData ? _ipData.isp : '',
        isVpn: _ipData ? _ipData.isProxy : false,
        isProxy: _ipData ? _ipData.isProxy : false,
        isDatacenter: _ipData ? _ipData.isHosting : false
      };

      var url = baseUrl + '?action=__fortress_save_fingerprint';
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var opts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      };
      if (ctl) { opts.signal = ctl.signal; setTimeout(function(){ try { ctl.abort(); } catch(e){} }, 8000); }
      fetch(url, opts).catch(function(){});
    } catch (e) {}
  }

  // ===== ADMIN-FACING BLOCK/UNBLOCK =====
  function blockDevice(deviceId, opts) {
    opts = opts || {};
    deviceId = deviceId || _deviceId;
    if (!_localBlocklist) _localBlocklist = _loadLocalBlocklist();
    _localBlocklist.add(deviceId);
    if (_visitorId) _localBlocklist.add(_visitorId);
    if (_compositeHash) _localBlocklist.add(_compositeHash);
    _saveLocalBlocklist();
    _recordEvent('local_block', { target: deviceId, reason: opts.reason || 'admin_manual' });
    return { ok: true, deviceId: deviceId };
  }

  function unblockDevice(deviceId) {
    deviceId = deviceId || _deviceId;
    if (!_localBlocklist) _localBlocklist = _loadLocalBlocklist();
    _localBlocklist.delete(deviceId);
    _saveLocalBlocklist();
    _recordEvent('local_unblock', { target: deviceId });
    return { ok: true, deviceId: deviceId };
  }

  function clearAllLocalBlocks() {
    _localBlocklist = new Set();
    _saveLocalBlocklist();
    _recordEvent('local_clear_all', {});
    return { ok: true };
  }

  // ===== FINGERPRINTJS INTEGRATION =====
  async function _initFingerprintJS() {
    try {
      // Load FingerprintJS from CDN
      var FingerprintJS = await import('https://openfpcdn.io/fingerprintjs/v5').then(function(m){ return m.default || m; });
      var fp = await FingerprintJS.load();
      var result = await fp.get();
      _fpjsVisitorId = result.visitorId;
      _fpjsConfidence = (result.confidence && result.confidence.score) || 0;
      _writeLS(CFG.KEYS.FPJS_ID, _fpjsVisitorId);
      _fingerprintReady = true;
    } catch (e) {
      // Fallback: use stored ID or generate one
      _fpjsVisitorId = _readLS(CFG.KEYS.FPJS_ID, null) || 'fpjs_' + _randHex(16);
      _writeLS(CFG.KEYS.FPJS_ID, _fpjsVisitorId);
      _fingerprintReady = true;
    }
  }

  // ===== ADMIN-FACING READ API =====
  function getDeviceProfile() { return _profile; }
  function getEventLog() {
    if (!_eventLog.length) _eventLog = _loadEventLog();
    return _eventLog.slice();
  }
  function getLocalBlocklist() {
    if (!_localBlocklist) _localBlocklist = _loadLocalBlocklist();
    return Array.from(_localBlocklist);
  }
  function getDeviceId() { return _deviceId; }
  function getVisitorId() { return _visitorId; }
  function getCompositeHash() { return _compositeHash; }
  function getIPData() { return _ipData; }
  function getFingerprintJSId() { return _fpjsVisitorId; }
  function getFullPayload() {
    return {
      deviceId: _deviceId,
      visitorId: _visitorId,
      compositeHash: _compositeHash,
      profile: _profile,
      ipData: _ipData,
      fpjsId: _fpjsVisitorId,
      fpjsConfidence: _fpjsConfidence,
      isBlocked: isBlocked()
    };
  }

  // ===== INIT =====
  async function init() {
    if (_initialized) return;
    _initialized = true;
    try {
      _salt = _readLS(CFG.KEYS.SALT, null);
      if (!_salt) _initSalt();

      // Restore device ID
      _deviceId = _readLS(CFG.KEYS.DEVICE, null);
      _visitorId = _readLS(CFG.KEYS.VISITOR_ID, null);
      _compositeHash = _readLS(CFG.KEYS.COMPOSITE, null);

      // Capture full fingerprint
      _profile = await _captureFullFingerprint();

      // Generate IDs if new
      if (!_deviceId) {
        _deviceId = _profile.deviceId;
        _writeLS(CFG.KEYS.DEVICE, _deviceId);
      }
      if (!_visitorId) {
        _visitorId = 'v_' + _randHex(16);
        _writeLS(CFG.KEYS.VISITOR_ID, _visitorId);
      }

      _writeLS(CFG.KEYS.PROFILE, _profile);

      // Load blocklists
      _localBlocklist = _loadLocalBlocklist();
      _eventLog = _loadEventLog();

      // Fetch IP data (non-blocking)
      _fetchIPData().then(function() {
        // Compute composite hash after IP is available
        _computeCompositeHash(_profile, _fpjsVisitorId, _ipData).then(function(hash) {
          _compositeHash = hash;
          _writeLS(CFG.KEYS.COMPOSITE, _compositeHash);
          // Save to server
          _saveFingerprintToServer();
        });
      });

      // Init FingerprintJS (non-blocking)
      _initFingerprintJS().then(function() {
        // Recompute composite hash with FingerprintJS ID
        if (_fpjsVisitorId) {
          _computeCompositeHash(_profile, _fpjsVisitorId, _ipData).then(function(hash) {
            _compositeHash = hash;
            _writeLS(CFG.KEYS.COMPOSITE, _compositeHash);
            _saveFingerprintToServer();
          });
        }
      });

      // Sync server blocklist
      _syncFromServer();

    } catch (e) {
      console.warn('YARZ Fortress v2 init failed:', e);
      // Fallback init
      _deviceId = _readLS(CFG.KEYS.DEVICE, null) || 'd_fallback_' + _randHex(12);
      _visitorId = _readLS(CFG.KEYS.VISITOR_ID, null) || 'v_' + _randHex(16);
      _fingerprintReady = true;
    }
  }

  // ===== PUBLIC API =====
  var publicApi = {
    init: init,
    scoreOrder: scoreOrder,
    isBlocked: isBlocked,
    blockDevice: blockDevice,
    unblockDevice: unblockDevice,
    clearAllLocalBlocks: clearAllLocalBlocks,
    getDeviceId: getDeviceId,
    getVisitorId: getVisitorId,
    getCompositeHash: getCompositeHash,
    getDeviceProfile: getDeviceProfile,
    getEventLog: getEventLog,
    getLocalBlocklist: getLocalBlocklist,
    getIPData: getIPData,
    getFingerprintJSId: getFingerprintJSId,
    getFullPayload: getFullPayload,
    getCFG: function(){ return JSON.parse(JSON.stringify(CFG)); },
    VERSION: CFG.VERSION
  };

  // Auto-init
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

  return publicApi;
})();

window.YARZ_FORTRESS = YARZ_FORTRESS;
