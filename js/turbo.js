/* YARZ TURBO — Background Performance Engine v1.0 */
const YARZ_TURBO = (() => {
  'use strict';
  const _originalFetch = window.fetch;
  const _inflightRequests = new Map();
  function deduplicatedFetch(url, options) {
    const isGet = !options || !options.method || options.method === 'GET';
    if (!isGet) return _originalFetch(url, options);
    const u = new URL(url, window.location.origin);
    u.searchParams.delete('_t');
    u.searchParams.delete('cb');
    const dedupKey = u.href;
    if (_inflightRequests.has(dedupKey)) {
      return _inflightRequests.get(dedupKey).then(function(r) { return r.clone(); });
    }
    const promise = _originalFetch(url, options).then(function(response) {
      setTimeout(function() { _inflightRequests.delete(dedupKey); }, 200);
      return response;
    }).catch(function(err) { _inflightRequests.delete(dedupKey); throw err; });
    _inflightRequests.set(dedupKey, promise);
    return promise.then(function(r) { return r.clone(); });
  }
  function _patchFetch() {
    var _currentFetch = window.fetch;
    window.fetch = function(url, options) {
      if (typeof url === 'string') {
        if (url.indexOf('googleapis.com') > -1 || url.indexOf('script.google.com') > -1 || url.indexOf('workers.dev') > -1) {
          return deduplicatedFetch(url, options);
        }
      }
      return _currentFetch(url, options);
    };
  }
  function start() {
    _patchFetch();
    console.log('YARZ Turbo: started');
  }
  return { start, deduplicatedFetch };
})();
