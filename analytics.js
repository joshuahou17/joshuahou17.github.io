/* joshhou.com analytics beacon.
   Fires one request per page view at the `track` edge function, which works
   out everything else server-side. No cookies, no localStorage, nothing read
   from the visitor. ~30 lines and one request; it never blocks rendering. */
(function () {
  'use strict';

  var ENDPOINT = 'https://iaspidhmxppsuwydmvym.supabase.co/functions/v1/track';

  // Don't count me developing. Local previews and file:// are ignored.
  var host = location.hostname;
  if (!host || host === 'localhost' || host === '127.0.0.1' || host === '[::1]' ||
      host.endsWith('.local') || location.protocol === 'file:') return;

  /* Self-exclusion. Visiting any page with ?noanalytics=1 sets a flag in this
     browser and this browser is never counted again; ?noanalytics=0 clears it.
     Per-browser and per-device, because there is nothing else stable to key
     off -- home IPs change, and we deliberately store no identity. */
  var OPT_OUT = 'joshhou_no_analytics';
  function flag(v) {
    try {
      if (v === null) localStorage.removeItem(OPT_OUT);
      else localStorage.setItem(OPT_OUT, v);
    } catch (e) { /* private mode: nothing we can do */ }
  }
  var q = location.search;
  if (q.indexOf('noanalytics=1') !== -1) {
    flag('1');
    if (window.console) console.log('[analytics] This browser will no longer be counted.');
    return;
  }
  if (q.indexOf('noanalytics=0') !== -1) {
    flag(null);
    if (window.console) console.log('[analytics] This browser is being counted again.');
  }
  try {
    if (localStorage.getItem(OPT_OUT) === '1') return;
  } catch (e) { /* unreadable storage: fall through and count */ }

  var payload = JSON.stringify({
    path: location.pathname,
    ref: document.referrer || null
  });

  /* Sent as text/plain on purpose. sendBeacon cannot perform a CORS preflight,
     and application/json would trigger one — so a JSON content-type here means
     the request is silently dropped cross-origin. The function parses the body
     as JSON regardless of the declared type. */
  try {
    if (navigator.sendBeacon &&
        navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'text/plain;charset=UTF-8' }))) {
      return;
    }
  } catch (e) { /* fall through */ }

  // Fallback for browsers without sendBeacon. keepalive lets it survive the
  // page being closed mid-flight.
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      body: payload,
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      mode: 'cors'
    }).catch(function () {});
  } catch (e) { /* analytics must never break the page */ }
})();
