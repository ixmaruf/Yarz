/* YARZ TURBO CORE v1.0 — Multi-Layer Cache Engine */
(function (global) {
  'use strict';
  const memCache = new Map();
  const listeners = {};
  function on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); }
  function off(event, fn) { listeners[event] = (listeners[event]||[]).filter(x => x !== fn); }
  function emit(event, data) {
    (listeners[event] || []).forEach(fn => { try { fn(data); } catch (e) {} });
    try { global.dispatchEvent(new CustomEvent('turbo:' + event, { detail: data })); } catch(e){}
  }
  const inflight = new Map();
  function fastHash(s) { if (typeof s !== 'string') s = JSON.stringify(s); let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return h; }
  async function doFetch(key, fetcher, opts) {
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      try {
        const value = await fetcher();
        memCache.set(key, { value, ts: Date.now(), hash: fastHash(value) });
        emit('update', { key, value, fresh: true });
        return value;
      } finally { inflight.delete(key); }
    })();
    inflight.set(key, p);
    return p;
  }
  async function get(key, fetcher, opts) {
    opts = opts || {};
    const ttl = opts.ttl || 60000;
    if (!opts.forceFresh && memCache.has(key)) {
      const m = memCache.get(key);
      if (Date.now() - m.ts < ttl) return m.value;
    }
    return doFetch(key, fetcher, opts);
  }
  async function set(key, value, ttl) { memCache.set(key, { value, ts: Date.now(), hash: fastHash(value), ttl: ttl || 60000 }); }
  async function invalidate(keyOrPrefix) {
    if (keyOrPrefix.endsWith('*')) {
      const prefix = keyOrPrefix.slice(0, -1);
      for (const k of Array.from(memCache.keys())) { if (k.startsWith(prefix)) memCache.delete(k); }
    } else { memCache.delete(keyOrPrefix); }
  }
  global.TURBO = { get, set, invalidate, on, off, emit, version: '1.0.0' };
})();
