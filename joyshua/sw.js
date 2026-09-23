/* joyshua's service worker: notifications only.
 *
 * It shows what the `joyshua` edge function pushes ("Joyce wrote you a
 * letter") and, when one is tapped, brings the page up at the thing it was
 * about. It deliberately has no fetch handler -- nothing is cached, so the
 * page is always the latest version.
 */
'use strict';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { /* shown with the defaults */ }
  // Same tag, same person and kind: the newer one quietly replaces the older,
  // so a run of additions stays one notification with a running count.
  e.waitUntil(self.registration.showNotification(d.title || 'joyshua', {
    body: d.body || '',
    icon: 'apple-touch-icon.png',
    tag: d.tag || undefined,
    data: { go: d.go || '' }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var go = (e.notification.data && e.notification.data.go) || '';
  var scope = self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (open) {
    for (var i = 0; i < open.length; i++) {
      if (open[i].url.indexOf(scope) !== 0) continue;
      open[i].postMessage({ type: 'go', go: go });
      return open[i].focus();
    }
    return self.clients.openWindow(scope + (go ? '#go=' + encodeURIComponent(go) : ''));
  }));
});
