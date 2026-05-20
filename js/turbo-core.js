/* ════════════════════════════════════════════════════════════════════
   YARZ TURBO CORE v1.0 — Multi-Layer Cache Engine
   ════════════════════════════════════════════════════════════════════
   Architecture:
     L1: In-memory Map      → 0ms reads
     L2: IndexedDB          → 5-20ms reads, persistent
     L3: localStorage       → fallback for tiny config
     L4: Service Worker     → network-level cache

   Pattern: Stale-While-Revalidate (SWR)
     1. Return cached data INSTANTLY (UI renders in <100ms)
     2. Fetch fresh data in background
     3. If changed → emit 'turbo:update' event → UI patches silently

   Exposed globals:
     window.TURBO          → main API
     window.TURBO.get(key, fetcher, opts)
     window.TURBO.set(key, value, ttlMs)
     window.TURBO.invalidate(keyOrPrefix)
     window.TURBO.on(event, handler)
   ════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const DB_NAME    = 'yarz_turbo';
  const DB_VERSION = 2;
  const STORE      = 'cache';
  const META_STORE = 'meta';

  // Default TTLs (Time-To-Live) in milliseconds
  const TTL = {
    products:   60 * 1000,        // 60 sec — but show stale instantly via SWR
    categories: 10 * 60 * 1000,   // 10 min
    settings:   5  * 60 * 1000,   // 5 min
    banner:     5  * 60 * 1000,   // 5 min
    orders:     30 * 1000,        // 30 sec (more dynamic)
    coupon:     5  * 60 * 1000,
    default:    2  * 60 * 1000
  };

  // ─────────────────────────────────────────────────────────────────
  // L1: In-Memory Cache (fastest)
  // ─────────────────────────────────────────────────────────────────
  const memCache = new Map();

  // ─────────────────────────────────────────────────────────────────
  // L2: IndexedDB Cache (persistent, fast)
  // ─────────────────────────────────────────────────────────────────
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => { console.warn('[TURBO] IDB open failed'); resolve(null); };
      // Don't block forever
      setTimeout(() => resolve(null), 1500);
    });
    return dbPromise;
  }

  async function idbGet(key) {
    const db = await openDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx  = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror   = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  async function idbSet(key, value) {
    const db = await openDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx  = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ key, ...value });
        tx.oncomplete = () => resolve();
        tx.onerror    = () => resolve();
      } catch (e) { resolve(); }
    });
  }

  async function idbDelete(keyOrPrefix) {
    const db = await openDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx    = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        if (keyOrPrefix.endsWith('*')) {
          const prefix = keyOrPrefix.slice(0, -1);
          store.openCursor().onsuccess = (e) => {
            const cur = e.target.result;
            if (cur) {
              if (cur.key.startsWith(prefix)) cur.delete();
              cur.continue();
            }
          };
        } else {
          store.delete(keyOrPrefix);
        }
        tx.oncomplete = () => resolve();
        tx.onerror    = () => resolve();
      } catch (e) { resolve(); }
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Event Emitter (for 'turbo:update' notifications)
  // ─────────────────────────────────────────────────────────────────
  const listeners = {};
  function on(event, fn)  { (listeners[event] = listeners[event] || []).push(fn); }
  function off(event, fn) { listeners[event] = (listeners[event]||[]).filter(x => x !== fn); }
  function emit(event, data) {
    (listeners[event] || []).forEach(fn => {
      try { fn(data); } catch (e) { console.error('[TURBO event]', e); }
    });
    // Also dispatch a DOM event so plain HTML can listen
    try { global.dispatchEvent(new CustomEvent('turbo:' + event, { detail: data })); } catch(e){}
  }

  // ─────────────────────────────────────────────────────────────────
  // In-flight request deduplication
  // ─────────────────────────────────────────────────────────────────
  const inflight = new Map();

  // ─────────────────────────────────────────────────────────────────
  // Hash helper — detect data change (for silent updates)
  // ─────────────────────────────────────────────────────────────────
  function fastHash(s) {
    if (typeof s !== 'string') s = JSON.stringify(s);
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return h;
  }

  // ─────────────────────────────────────────────────────────────────
  // CORE API: get(key, fetcher, opts)
  //   - opts.ttl       : custom TTL in ms
  //   - opts.swr       : stale-while-revalidate (default true)
  //   - opts.forceFresh: bypass cache
  //   - opts.type      : 'products'|'orders'|... for default TTL
  // ─────────────────────────────────────────────────────────────────
  async function get(key, fetcher, opts) {
    opts = opts || {};
    const now = Date.now();
    const ttl = opts.ttl || TTL[opts.type] || TTL.default;
    const swr = opts.swr !== false;

    // L1: Memory
    if (!opts.forceFresh && memCache.has(key)) {
      const m = memCache.get(key);
      if (now - m.ts < ttl) {
        // Fresh — return immediately, no revalidation needed
        return m.value;
      }
      // Stale — but if SWR, return stale and refresh in background
      if (swr) {
        revalidateBg(key, fetcher, opts, m.hash);
        return m.value;
      }
    }

    // L2: IndexedDB
    if (!opts.forceFresh) {
      const idb = await idbGet(key);
      if (idb) {
        // Hydrate memory
        memCache.set(key, { value: idb.value, ts: idb.ts, hash: idb.hash });
        if (now - idb.ts < ttl) return idb.value;
        if (swr) {
          revalidateBg(key, fetcher, opts, idb.hash);
          return idb.value;          // ← INSTANT return, even if stale
        }
      }
    }

    // No cache — must wait for network
    return doFetch(key, fetcher, opts);
  }

  async function doFetch(key, fetcher, opts) {
    if (inflight.has(key)) return inflight.get(key);
    const p = (async () => {
      try {
        const value = await fetcher();
        const hash  = fastHash(value);
        const ts    = Date.now();
        memCache.set(key, { value, ts, hash });
        idbSet(key, { value, ts, hash }).catch(()=>{});
        emit('update', { key, value, fresh: true });
        return value;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  }

  function revalidateBg(key, fetcher, opts, oldHash) {
    if (inflight.has(key)) return;
    const p = (async () => {
      try {
        const value = await fetcher();
        const hash  = fastHash(value);
        const ts    = Date.now();
        memCache.set(key, { value, ts, hash });
        idbSet(key, { value, ts, hash }).catch(()=>{});
        if (hash !== oldHash) {
          emit('update', { key, value, fresh: true, changed: true });
        }
      } catch (e) {
        // Silent fail — cached data still served
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
  }

  // ─────────────────────────────────────────────────────────────────
  // Manual set / invalidate
  // ─────────────────────────────────────────────────────────────────
  async function set(key, value, ttl) {
    const hash = fastHash(value);
    const ts   = Date.now();
    memCache.set(key, { value, ts, hash, ttl });
    await idbSet(key, { value, ts, hash });
    emit('update', { key, value, fresh: true });
  }

  async function invalidate(keyOrPrefix) {
    if (keyOrPrefix.endsWith('*')) {
      const prefix = keyOrPrefix.slice(0, -1);
      for (const k of Array.from(memCache.keys())) {
        if (k.startsWith(prefix)) memCache.delete(k);
      }
    } else {
      memCache.delete(keyOrPrefix);
    }
    await idbDelete(keyOrPrefix);
  }

  async function clear() {
    memCache.clear();
    const db = await openDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
      } catch(e){ resolve(); }
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Prefetch — load data into cache before user needs it
  // ─────────────────────────────────────────────────────────────────
  function prefetch(key, fetcher, opts) {
    if (memCache.has(key) || inflight.has(key)) return;
    // Use requestIdleCallback for non-blocking prefetch
    const run = () => doFetch(key, fetcher, opts || {}).catch(()=>{});
    if (global.requestIdleCallback) {
      requestIdleCallback(run, { timeout: 2000 });
    } else {
      setTimeout(run, 50);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Performance Monitor
  // ─────────────────────────────────────────────────────────────────
  const perf = {
    marks: {},
    mark(name) {
      this.marks[name] = performance.now();
    },
    measure(name, fromMark) {
      const t = performance.now() - (this.marks[fromMark] || 0);
      console.log(`%c[TURBO] ${name}: ${t.toFixed(1)}ms`, 'color:#634A8E;font-weight:bold');
      return t;
    }
  };

  // Auto-init: warm up IDB connection
  openDB().then(db => {
    if (db) console.log('%c[TURBO] ⚡ Ready', 'color:#634A8E;font-weight:bold;font-size:14px');
  });

  // Public API
  global.TURBO = {
    get, set, invalidate, clear, prefetch,
    on, off, emit,
    perf,
    _memCache: memCache,   // for debugging
    version: '1.0.0'
  };

})(window);
