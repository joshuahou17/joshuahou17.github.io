/* Notifications: the bell in the + Josh / + Joyce panel.
 *
 * Ringing it in Joyce's panel means "tell Joyce, on this device, when Josh
 * adds something" (and the other way round). A device belongs to one of them
 * at a time; ringing the other panel's bell moves it over. The sending is done
 * by the `joyshua` edge function, the showing by sw.js.
 *
 * On an iPhone this only works once joyshua is on the home screen, opened from
 * there (Safari itself has no push) -- elsewhere the bell simply isn't shown.
 *
 * Tapping a notification lands here too: in a fresh page as #go=..., or as a
 * message from sw.js if the page is already open.
 */
(function () {
  'use strict';

  var NAMES = { josh: 'Josh', joyce: 'Joyce' };
  var WHO_KEY = 'joyshua-notify-who';     // whose device this is, while notifications are on
  var SENT_KEY = 'joyshua-notify-sent';   // when the server last heard from this device
  var RESEND_MS = 7 * 864e5;

  var supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  var worker = null, pushKey = null;

  function saved(k) { try { return localStorage.getItem(k); } catch (err) { return null; } }
  function save(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (err) { /* ignore */ }
  }

  function toast(msg, bad) { if (window.JoyDesk) JoyDesk.toast(msg, bad); }

  function keyBytes(s) {
    var b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
    var out = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }

  // The server's public key, asked for once. Null means notifications aren't
  // set up there yet, and then there's no bell.
  function getKey() {
    if (!pushKey) {
      pushKey = JoyStore.call('push-key', {}).then(function (r) { return r.key || null; })
        .catch(function () { pushKey = null; return null; });
    }
    return pushKey;
  }

  function subscription() {
    return worker ? worker.then(function (r) { return r.pushManager.getSubscription(); }) : Promise.resolve(null);
  }

  // Is this device on, for this person? (What the bell shows.)
  function isOn(who) {
    return supported && Notification.permission === 'granted' && saved(WHO_KEY) === who;
  }

  // Whose device this is, as far as the page knows: whoever's notifications
  // are on here, or null. The topics board shows only their cards.
  function owner() {
    var who = saved(WHO_KEY);
    return isOn(who) ? who : null;
  }

  function ownerChanged() { if (window.JoyTopics) JoyTopics.draw(); }

  function tell(who, sub) {
    return JoyStore.call('subscribe', { who: who, subscription: sub.toJSON() }).then(function () {
      save(WHO_KEY, who);
      save(SENT_KEY, String(Date.now()));
      ownerChanged();
    });
  }

  // Called straight from the tap: iPhones only ask for permission inside one.
  function turnOn(who) {
    var asked = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
    return Promise.resolve(asked).then(function (p) {
      if (p === 'denied') throw new Error('Notifications are blocked for joyshua in this device’s settings.');
      if (p !== 'granted') throw new Error('');
      return Promise.all([worker, getKey()]);
    }).then(function (both) {
      var reg = both[0], key = both[1];
      if (!key) throw new Error('Notifications aren’t set up yet.');
      return reg.pushManager.getSubscription().then(function (sub) {
        return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      });
    }).then(function (sub) { return tell(who, sub); });
  }

  function turnOff() {
    save(WHO_KEY, null);
    save(SENT_KEY, null);
    ownerChanged();
    return subscription().then(function (sub) {
      if (!sub) return;
      var endpoint = sub.endpoint;
      return sub.unsubscribe().then(function () {
        // if the server doesn't hear this, its next send gets a 410 and it forgets the device then
        return JoyStore.call('unsubscribe', { endpoint: endpoint }).catch(function () {});
      });
    });
  }

  /* ---------- the bell ---------- */

  var BELL = '<svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path class="bell-body" d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 1.8H4.4z"/><path d="M10 20.6a2.2 2.2 0 0 0 4 0"/>' +
    '<path class="bell-slash" d="M4 4l16 16"/></svg>';

  function paint(btn) {
    var who = btn.dataset.who, on = isOn(who);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', 'Notify ' + NAMES[who] + ' on this device when ' + NAMES[who === 'josh' ? 'joyce' : 'josh'] + ' adds something');
  }

  function button() {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'c-bell';
    b.hidden = true;
    b.innerHTML = BELL;
    b.addEventListener('click', function () {
      var who = b.dataset.who;
      if (!who || b.classList.contains('busy')) return;
      b.classList.add('busy');
      var was = isOn(who);
      (was ? turnOff() : turnOn(who)).then(function () {
        toast(was ? 'Notifications off' : 'Notifications on for ' + NAMES[who]);
      }, function (err) {
        // the browser's own failures (no push service, and so on) read badly
        if (err.name === 'Error' && err.message) toast(err.message, true);
        else if (err.name !== 'Error') toast('Couldn’t turn notifications on here.', true);
      }).then(function () { b.classList.remove('busy'); paint(b); });
    });
    return b;
  }

  // The panel says who it's for (or no one); the bell follows.
  function forWho(btn, who) {
    btn.dataset.who = who || '';
    btn.hidden = true;
    if (!supported || !who) return;
    getKey().then(function (key) {
      if (!key || btn.dataset.who !== who) return;
      paint(btn);
      btn.hidden = false;
    });
  }

  /* ---------- keeping a device signed up ---------- */

  // Browsers renew subscriptions now and then; checking in once a week keeps
  // the server's copy current. If permission was taken away in the device's
  // settings, this device is simply off.
  function checkIn() {
    var who = saved(WHO_KEY);
    if (!who) return;
    if (Notification.permission !== 'granted') { save(WHO_KEY, null); ownerChanged(); return; }
    subscription().then(function (sub) {
      if (!sub) {
        return Promise.all([worker, getKey()]).then(function (both) {
          if (!both[1]) return;
          return both[0].pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(both[1]) })
            .then(function (fresh) { return tell(who, fresh); });
        });
      }
      if (Date.now() - (+saved(SENT_KEY) || 0) > RESEND_MS) return tell(who, sub);
    }).catch(function () { /* try again next visit */ });
  }

  // Opening joyshua clears what's waiting on the lock screen.
  function clearShown() {
    if (!worker || document.visibilityState !== 'visible') return;
    worker.then(function (r) {
      return r.getNotifications ? r.getNotifications() : [];
    }).then(function (list) { list.forEach(function (n) { n.close(); }); }).catch(function () {});
  }

  /* ---------- arriving from a notification ---------- */

  function arrive(go, fresh) {
    if (!go || !window.JoyStore || !window.JoyDesk) return;
    (fresh ? JoyStore.ready : JoyStore.reload()).then(function () {
      if (!fresh) {
        JoyDesk.refresh();
        if (window.JoyTopics) JoyTopics.draw();
        if (window.JoyBucket) JoyBucket.paint();
      }
      // let the desk finish its first layout before opening anything on it
      setTimeout(function () { JoyDesk.go(go); }, fresh ? 400 : 0);
    });
  }

  function start() {
    var m = /^#go=(.+)$/.exec(location.hash);
    if (m) {
      history.replaceState(null, '', location.pathname + location.search);
      try { arrive(decodeURIComponent(m[1]), true); } catch (err) { /* a mangled link: just the desk */ }
    }
    if (!supported) return;
    worker = navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; });
    worker.catch(function () { supported = false; });
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'go') arrive(e.data.go, false);
    });
    checkIn();
    clearShown();
    document.addEventListener('visibilitychange', clearShown);
  }

  window.JoyNotify = { button: button, forWho: forWho, owner: owner };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
