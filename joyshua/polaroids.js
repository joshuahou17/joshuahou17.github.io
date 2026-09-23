/* Polaroids: a photo taken there and then, with a line written on its white
 * strip, sent to the other person.
 *
 * It arrives blank. The first time the other person opens it, it develops in
 * front of them over about a minute -- faster if they shake the phone (or, on
 * a computer, shake the polaroid about with the pointer). Once it's developed
 * it stays that way on every device. Whose device this is comes from the
 * notifications bell (JoyNotify.owner); a device that hasn't said sees every
 * polaroid developed, the same rule the topics board uses.
 *
 * On the desk they lie in a pile (canvas.js places it; this fills it in). Tap
 * the pile for a calendar: each day they were taken shows its newest one, and
 * tapping the day spreads that day's polaroids out.
 *
 * Saved through JoyStore (joyshua_polaroids). Deleting reuses the desk's
 * press-and-hold minus (JoyDesk).
 */
(function () {
  'use strict';

  var NAMES = { josh: 'Josh', joyce: 'Joyce' };
  var OTHER = { josh: 'joyce', joyce: 'josh' };
  var DEV_MS = 60000;         // developing, left alone
  var SIDE = 1400;            // the picture's size, square

  var spill, list, adders, prevBtn, nextBtn, titleEl;   // the calendar, and a day spread out
  var view, viewSlot;                          // one polaroid, big
  var cam;                                     // the camera
  var spread = false, openedAt = 0, held = false, holdTimer = 0, holdStart = null;
  var progress = {};          // id -> how far it's developed on this visit (0..1)
  var running = null;         // {p, el, last} while one is developing in front of you
  var boost = 0;              // extra development from shaking, since the last frame

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function who(a) { return a === 'joyce' ? 'joyce' : 'josh'; }

  // A steady number from an id, so each lands at the same tilt every time.
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }

  function owner() { return window.JoyNotify && JoyNotify.owner ? JoyNotify.owner() : null; }

  function all() {
    var S = window.JoyStore;
    if (!S) return [];
    return S.added.polaroids
      .filter(function (p) { return !p.hidden && !S.isGone('polaroid:' + p.id); })
      .slice()
      .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });   // newest first
  }

  function byId(id) { return all().filter(function (p) { return p.id === id; })[0] || null; }

  // Still blank for whoever is looking?
  function blank(p) {
    var me = owner();
    return !!me && p.author !== me && !p.developed_at && (progress[p.id] || 0) < 1;
  }

  /* ---------- one polaroid ---------- */

  // How developed it looks at `d` (0 blank film .. 1 done): the film clears
  // first, then the colour and contrast come up under it.
  function setDev(pol, d) {
    var img = pol.querySelector('.pol-photo img'), film = pol.querySelector('.pol-film');
    if (d >= 1) {
      pol.classList.remove('pol--blank');
      if (img) img.style.filter = '';
      if (film) film.style.opacity = '';
      return;
    }
    pol.classList.add('pol--blank');
    var e = d * d * (3 - 2 * d);
    if (film) film.style.opacity = Math.max(0, 1 - e * 1.35).toFixed(3);
    if (img) img.style.filter = 'saturate(' + (0.15 + 0.85 * e).toFixed(3) + ') contrast(' + (0.55 + 0.45 * e).toFixed(3) +
      ') brightness(' + (0.8 + 0.2 * e).toFixed(3) + ') sepia(' + (0.55 * (1 - e)).toFixed(3) + ')';
  }

  // opts.big: the full picture (the viewer), otherwise the thumbnail
  function polFor(p, opts) {
    opts = opts || {};
    var r = hash(p.id);
    var pol = el('article', 'pol author-' + who(p.author) + (opts.big ? ' pol--big' : ''));
    pol.dataset.id = p.id;
    pol.style.setProperty('--tilt', ((r - 0.5) * (opts.big ? 4 : 10)).toFixed(2) + 'deg');
    var photo = el('div', 'pol-photo');
    var img = el('img');
    img.src = JoyStore.fileUrl(opts.big ? p.path : p.thumb_path);
    img.alt = p.caption || 'A polaroid from ' + NAMES[who(p.author)];
    img.draggable = false;
    photo.appendChild(img);
    photo.appendChild(el('span', 'pol-film'));
    pol.appendChild(photo);
    var strip = el('div', 'pol-strip');
    strip.appendChild(el('span', 'pol-cap', p.caption || ''));
    if (!opts.bare) strip.appendChild(el('span', 'who-chip author-' + who(p.author), NAMES[who(p.author)]));
    pol.appendChild(strip);
    setDev(pol, blank(p) ? progress[p.id] || 0 : 1);
    return pol;
  }

  /* ---------- the pile on the desk ---------- */

  function pileEl() { return document.querySelector('.card.pol-pile'); }

  function paint() {
    var pile = pileEl();
    if (!pile) return;
    var ps = all();
    var box = pile.querySelector('.pp-stack');
    box.textContent = '';
    pile.classList.toggle('empty', !ps.length);
    pile.setAttribute('aria-label', ps.length
      ? 'Polaroids, ' + ps.length + '. Press to spread them out.'
      : 'Polaroids');
    // the newest three, the newest on top; with none, one that's never been taken
    var top = ps.slice(0, 3).reverse();
    if (!top.length) {
      var none = el('article', 'pol pol--none');
      none.innerHTML = '<div class="pol-photo"><span class="pol-film"></span></div><div class="pol-strip"></div>';
      box.appendChild(none);
      return;
    }
    top.forEach(function (p, k) {
      var pol = polFor(p);
      var r = hash(p.id + 'pile');
      pol.style.setProperty('--tilt', ((r - 0.5) * 22).toFixed(1) + 'deg');
      pol.style.setProperty('--px', ((hash(p.id + 'x') - 0.5) * 26).toFixed(0) + 'px');
      pol.style.setProperty('--py', ((hash(p.id + 'y') - 0.5) * 18 - (top.length - 1 - k) * 3).toFixed(0) + 'px');
      box.appendChild(pol);
    });
  }

  /* ---------- the calendar, and a day spread out ----------
   * Tapping the pile opens a month (the one with the newest polaroid): a square
   * for every day, and on each day something was taken, its newest polaroid
   * lying in the square (with how many, if there's more than one). Tapping the
   * day spreads its polaroids out, in the order they were taken; the arrow
   * goes back to the month. */

  var WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var shown = null;           // the month on screen, as its 1st
  var dayOn = null;           // the day spread out (its dayKey), or null for the month

  function dayKey(when) {
    var d = new Date(when);
    return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
  }

  function dayName(when) {
    var d = new Date(when);
    return d.getMonth() + 1 + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(2);   // 9/2/26
  }

  function monthOf(when) { var d = new Date(when); return new Date(d.getFullYear(), d.getMonth(), 1); }

  // every day that has any, newest first within it
  function byDay() {
    var out = {};
    all().forEach(function (p) { (out[dayKey(p.created_at)] = out[dayKey(p.created_at)] || []).push(p); });
    return out;
  }

  // from the month of the first polaroid to this one
  function firstMonth() { var ps = all(); return monthOf(ps.length ? ps[ps.length - 1].created_at : Date.now()); }

  function draw() {
    if (!spread) return [];
    var me = owner();
    adders.querySelectorAll('[data-pol-add]').forEach(function (b) { b.hidden = !!me && b.dataset.polAdd !== me; });
    list.textContent = '';
    if (dayOn) {
      var items = drawDay();
      if (items) return items;
      dayOn = null;           // nothing left on that day (the last one was thrown away)
    }
    return drawMonth();
  }

  function drawMonth() {
    var days = byDay(), now = new Date(), today = dayKey(now);
    var y = shown.getFullYear(), m = shown.getMonth();
    spill.classList.remove('on-day');
    titleEl.textContent = MONTHS[m] + ' ' + y;
    prevBtn.setAttribute('aria-label', 'The month before');
    prevBtn.disabled = shown <= firstMonth();
    nextBtn.disabled = shown >= monthOf(now);
    adders.hidden = false;

    var grid = el('div', 'pcal');
    WEEK.forEach(function (w) { grid.appendChild(el('span', 'pcal-wd', w)); });
    for (var pad = 0; pad < shown.getDay(); pad++) grid.appendChild(el('span', 'pcal-cell pcal-cell--pad'));
    var out = [], last = new Date(y, m + 1, 0).getDate();
    for (var d = 1; d <= last; d++) {
      var date = new Date(y, m, d), k = dayKey(date), items = days[k] || [];
      var cell = el(items.length ? 'button' : 'span', 'pcal-cell' +
        (k === today ? ' pcal-cell--today' : '') + (date > now ? ' pcal-cell--future' : ''));
      cell.appendChild(el('span', 'pcal-num', d));
      if (items.length) {
        cell.type = 'button';
        cell.dataset.day = k;
        cell.setAttribute('aria-label', dayName(date) + ', ' + items.length + (items.length === 1 ? ' polaroid' : ' polaroids'));
        var mini = polFor(items[0], { bare: true });
        mini.classList.add('pol--mini');
        mini.setAttribute('aria-hidden', 'true');
        mini.style.setProperty('--tilt', ((hash(items[0].id) - 0.5) * 14).toFixed(1) + 'deg');
        cell.appendChild(mini);
        if (items.length > 1) cell.appendChild(el('span', 'pcal-n', items.length));
        out.push(mini);
      }
      grid.appendChild(cell);
    }
    list.appendChild(grid);
    return out;
  }

  function drawDay() {
    var items = (byDay()[dayOn] || []).slice().reverse();   // in the order they were taken
    if (!items.length) return null;
    spill.classList.add('on-day');
    titleEl.textContent = dayName(items[0].created_at);
    prevBtn.setAttribute('aria-label', 'Back to the month');
    prevBtn.disabled = false;
    nextBtn.disabled = true;
    adders.hidden = false;      // taking one from here too (it lands on today)
    var row = el('div', 'pday-row');
    var out = items.map(function (p) {
      var pol = polFor(p);
      pol.tabIndex = 0;
      pol.setAttribute('role', 'button');
      pol.style.setProperty('--jy', Math.round(hash(p.id + 'jy') * 16) + 'px');
      holdToDelete(pol, p);
      row.appendChild(pol);
      return pol;
    });
    list.appendChild(row);
    return out;
  }

  // each one flies out from `r` (a screen rect: the pile, or the day tapped)
  function flyFrom(items, r) {
    r = r || { left: window.innerWidth / 2, top: window.innerHeight, width: 0, height: 0 };
    var ox = r.left + r.width / 2, oy = r.top + r.height / 2;
    items.forEach(function (pol, k) {
      var b = pol.getBoundingClientRect();
      pol.style.setProperty('--fx', (ox - (b.left + b.width / 2)).toFixed(0) + 'px');
      pol.style.setProperty('--fy', (oy - (b.top + b.height / 2)).toFixed(0) + 'px');
      pol.style.animationDelay = Math.min(k * 25, 500) + 'ms';
      pol.classList.add('spilling');
    });
  }

  function openDay(k, cell) {
    if (window.JoyDesk) JoyDesk.hideMinus();
    var r = cell && cell.getBoundingClientRect();
    dayOn = k;
    flyFrom(draw(), r);
    spill.querySelector('.sp-sheet').scrollTop = 0;
    prevBtn.focus({ preventScroll: true });
  }

  function backToMonth() {
    if (!dayOn) return;
    if (window.JoyDesk) JoyDesk.hideMinus();
    var k = dayOn;
    dayOn = null;
    draw();
    var cell = list.querySelector('.pcal-cell[data-day="' + k + '"]');
    (cell || prevBtn).focus({ preventScroll: true });
  }

  function turnMonth(by) {
    if (dayOn) { backToMonth(); return; }
    shown = new Date(shown.getFullYear(), shown.getMonth() + by, 1);
    draw();
  }

  function pileBox() {
    var pile = pileEl();
    var r = pile && pile.getBoundingClientRect();
    return r && r.width && r.bottom > 0 && r.top < window.innerHeight ? r : null;
  }

  function open() {
    if (!spill) return;
    if (window.JoyDesk) JoyDesk.hideMinus();
    var ps = all();
    spread = true;
    dayOn = null;
    shown = monthOf(ps.length ? ps[0].created_at : Date.now());
    openedAt = Date.now();
    spill.hidden = false;
    var items = draw();
    void spill.offsetWidth;
    spill.classList.add('open');
    flyFrom(items, pileBox());
    spill.querySelector('.sp-close').focus({ preventScroll: true });
  }

  function close(fromKey) {
    if (!spread) return;
    spread = false;
    if (window.JoyDesk) JoyDesk.hideMinus();
    var r = pileBox();
    list.querySelectorAll('.pol').forEach(function (pol, k) {
      var b = pol.getBoundingClientRect();
      if (r) {
        pol.style.setProperty('--tx', (r.left + r.width / 2 - (b.left + b.width / 2)).toFixed(0) + 'px');
        pol.style.setProperty('--ty', (r.top + r.height / 2 - (b.top + b.height / 2)).toFixed(0) + 'px');
        pol.style.animationDelay = Math.min(k * 12, 90) + 'ms';
      } else {
        pol.style.setProperty('--tx', '0px');
        pol.style.setProperty('--ty', '30px');
      }
      pol.classList.remove('spilling');
      pol.classList.add('returning');
    });
    spill.classList.remove('open');
    setTimeout(function () { if (!spread) { spill.hidden = true; list.textContent = ''; } }, 300);
    var pile = pileEl();
    if (fromKey && pile) pile.focus({ preventScroll: true });
    else if (spill.contains(document.activeElement)) document.activeElement.blur();
  }

  // press and hold one: the desk's minus and confirm
  function holdToDelete(pol, p) {
    pol.addEventListener('pointerdown', function (e) {
      if (!window.JoyDesk) return;
      JoyDesk.hideMinus();
      held = false;
      holdStart = { x: e.clientX, y: e.clientY };
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () {
        held = true;
        JoyDesk.showMinus(pol, {
          name: 'this polaroid',
          title: 'Throw this polaroid away?',
          detail: 'This removes it for everyone.',
          run: function () {
            return JoyStore.remove('polaroid:' + p.id).then(function () { draw(); paint(); });
          }
        });
      }, JoyDesk.holdMs || 550);
    });
    pol.addEventListener('pointermove', function (e) {
      if (holdStart && Math.hypot(e.clientX - holdStart.x, e.clientY - holdStart.y) > 6) clearTimeout(holdTimer);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) {
      pol.addEventListener(n, function () { clearTimeout(holdTimer); holdStart = null; });
    });
  }

  /* ---------- one, big: where it develops ---------- */

  function show(id) {
    var p = byId(id);
    if (!p || !view) return;
    if (window.JoyDesk) JoyDesk.hideMinus();
    askMotion();
    viewSlot.textContent = '';
    var pol = polFor(p, { big: true });
    viewSlot.appendChild(pol);
    shakeWithPointer(pol);
    view.hidden = false;
    void view.offsetWidth;
    view.classList.add('open');
    view.querySelector('.pv-close').focus({ preventScroll: true });
    if (blank(p)) develop(p, pol);
  }

  function hide() {
    if (!view || view.hidden) return;
    running = null;
    view.classList.remove('open');
    setTimeout(function () { if (!view.classList.contains('open')) { view.hidden = true; viewSlot.textContent = ''; } }, 250);
    if (spread) draw();
    paint();
  }

  function develop(p, pol) {
    running = { p: p, el: pol, last: performance.now() };
    boost = 0;
    var me = running;
    function frame(now) {
      if (running !== me) return;
      var dt = Math.min(100, now - me.last);
      me.last = now;
      var d = Math.min(1, (progress[p.id] || 0) + dt / DEV_MS + boost);
      boost = 0;
      progress[p.id] = d;
      setDev(pol, d);
      if (d >= 1) { running = null; developed(p); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // Finished: from now on it's developed for everyone. If saving fails it's
  // still developed on this visit, and simply develops again next time.
  function developed(p) {
    JoyStore.developPolaroid(p.id).then(function () { paint(); if (spread) draw(); }, function () {});
  }

  /* Shaking. On a phone that's the phone itself (iPhones ask first, and only
   * from inside a tap -- if the answer's no, it just develops on its own). */
  var listening = false;
  function askMotion() {
    var D = window.DeviceMotionEvent;
    if (listening || !D) return;
    if (typeof D.requestPermission === 'function') {
      D.requestPermission().then(function (s) { if (s === 'granted') listen(); }, function () {});
    } else listen();
  }
  function listen() {
    if (listening) return;
    listening = true;
    window.addEventListener('devicemotion', function (e) {
      if (!running) return;
      var a = e.acceleration, m;
      if (a && a.x != null) m = Math.hypot(a.x, a.y || 0, a.z || 0);
      else {
        var g = e.accelerationIncludingGravity;
        if (!g || g.x == null) return;
        m = Math.abs(Math.hypot(g.x, g.y || 0, g.z || 0) - 9.81);
      }
      if (m > 6) { boost += Math.min(0.008, (m - 6) * 0.0006); jiggle(); }
    });
  }

  function jiggle() {
    if (!running) return;
    var e = running.el;
    e.classList.remove('shaken');
    void e.offsetWidth;
    e.classList.add('shaken');
  }

  // ...and on a computer (or anywhere), shaking the polaroid itself about
  function shakeWithPointer(pol) {
    var start = null, lastPt = null;
    pol.addEventListener('pointerdown', function (e) {
      askMotion();
      start = lastPt = { x: e.clientX, y: e.clientY };
      pol.setPointerCapture && pol.setPointerCapture(e.pointerId);
      pol.classList.add('held');
    });
    pol.addEventListener('pointermove', function (e) {
      if (!start) return;
      var dx = e.clientX - start.x, dy = e.clientY - start.y;
      pol.style.translate = (dx * 0.4).toFixed(0) + 'px ' + (dy * 0.4).toFixed(0) + 'px';
      pol.style.rotate = (dx * 0.03).toFixed(2) + 'deg';
      if (running && running.el === pol) boost += Math.min(0.02, Math.hypot(e.clientX - lastPt.x, e.clientY - lastPt.y) * 0.00022);
      lastPt = { x: e.clientX, y: e.clientY };
    });
    ['pointerup', 'pointercancel'].forEach(function (n) {
      pol.addEventListener(n, function () {
        start = null;
        pol.classList.remove('held');
        pol.style.translate = '';
        pol.style.rotate = '';
      });
    });
  }

  /* ---------- the camera ----------
   * A viewfinder inside a polaroid's frame. If the browser won't give the page
   * the camera, the phone's own camera opens instead (the file input with
   * `capture`). Either way it's a photo taken now, cropped square. */

  var stream = null, facing = 'environment', shot = null, shotUrl = null, author = null, sending = false;

  function take(w) {
    if (!cam) return;
    author = w === 'joyce' ? 'joyce' : 'josh';
    cam.classList.toggle('author-joyce', author === 'joyce');
    // the frame in the sender's paper, with their name on it
    var frame = cam.querySelector('.pol--cam');
    frame.classList.toggle('author-josh', author === 'josh');
    frame.classList.toggle('author-joyce', author === 'joyce');
    var tag = cam.querySelector('.pc-who');
    tag.className = 'who-chip pc-who author-' + author;
    tag.textContent = NAMES[author];
    cam.hidden = false;
    void cam.offsetWidth;
    cam.classList.add('open');
    reset();
    startCamera();
  }

  function reset() {
    shot = null;
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    shotUrl = null;
    sending = false;
    cam.classList.remove('taken', 'fallback', 'busy');
    cam.querySelector('.pc-shot').removeAttribute('src');
    cam.querySelector('.pc-cap').value = '';
    fitCaption();
    status('');
  }

  function fitCaption() {
    var c = cam.querySelector('.pc-cap');
    c.style.height = '';
    if (c.value) c.style.height = c.scrollHeight + 'px';
  }

  function status(msg, bad) {
    var s = cam.querySelector('.pc-status');
    s.textContent = msg || '';
    s.classList.toggle('bad', !!bad);
  }

  var waitTimer = 0;
  function startCamera() {
    stopCamera();
    clearTimeout(waitTimer);
    waitTimer = setTimeout(function () { if (!stream) fallback(); }, 5000);
    var md = navigator.mediaDevices;
    if (!md || !md.getUserMedia) { fallback(); return; }
    md.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } } })
      .then(function (s) {
        if (!cam.classList.contains('open') || shot) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        stream = s;
        var v = cam.querySelector('.pc-video');
        v.srcObject = s;
        v.classList.toggle('mirror', facing === 'user');
        return v.play();
      })
      .catch(function () { fallback(); });
  }

  function stopCamera() {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    var v = cam.querySelector('.pc-video');
    if (v) v.srcObject = null;
  }

  function fallback() { if (cam.classList.contains('open') && !shot) cam.classList.add('fallback'); }

  // A square from the middle of whatever was shot, what you saw is what's sent
  function square(src, sw, sh, mirror) {
    var side = Math.min(sw, sh), out = Math.min(side, SIDE);
    var c = document.createElement('canvas');
    c.width = c.height = out;
    var g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    if (mirror) { g.translate(out, 0); g.scale(-1, 1); }
    g.drawImage(src, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, out, out);
    return new Promise(function (res, rej) {
      c.toBlob(function (b) { b ? res(b) : rej(new Error('Couldn’t take that.')); }, 'image/jpeg', 0.9);
    });
  }

  function taken(blob) {
    stopCamera();
    shot = blob;
    shotUrl = URL.createObjectURL(blob);
    cam.querySelector('.pc-shot').src = shotUrl;
    cam.classList.remove('fallback');
    cam.classList.add('taken');
    // (on a phone, leave the keyboard down: the line on the strip is optional)
    if (window.matchMedia && matchMedia('(pointer: fine)').matches) cam.querySelector('.pc-cap').focus({ preventScroll: true });
  }

  // (with no picture coming through -- the browser never asked, or is still
  // asking -- the shutter opens the phone's own camera instead; it's a tap, so
  // that's allowed)
  function shutter() {
    var v = cam.querySelector('.pc-video');
    if (!stream || !v.videoWidth) { cam.querySelector('.pc-open input').click(); return; }
    cam.classList.add('flash');
    setTimeout(function () { cam.classList.remove('flash'); }, 350);
    square(v, v.videoWidth, v.videoHeight, facing === 'user').then(taken, function (err) { status(err.message, true); });
  }

  function fromFile(file) {
    if (!file) return;
    createImageBitmap(file, { imageOrientation: 'from-image' })
      .then(function (bmp) { return square(bmp, bmp.width, bmp.height, false); })
      .then(taken, function () { status('Couldn’t open that picture.', true); });
  }

  function send() {
    if (!shot || sending) return;
    sending = true;
    cam.classList.add('busy');
    var file = new File([shot], 'polaroid.jpg', { type: 'image/jpeg', lastModified: Date.now() });
    JoyStore.addPolaroid(author, file, cam.querySelector('.pc-cap').value.replace(/\s+/g, ' ').trim(), function (m) { status(m); })
      .then(function () {
        sending = false;
        var to = NAMES[OTHER[author]];
        closeCamera();
        paint();
        // show it where it landed: today's polaroids, or this month if the
        // calendar was up
        if (spread) { if (dayOn) dayOn = dayKey(Date.now()); shown = monthOf(Date.now()); draw(); }
        var pile = pileEl();
        if (pile) { pile.classList.remove('landed'); void pile.offsetWidth; pile.classList.add('landed'); }
        if (window.JoyDesk) JoyDesk.toast('Polaroid sent to ' + to);
      }, function (err) {
        sending = false;
        cam.classList.remove('busy');
        status(err.message, true);
      });
  }

  function closeCamera() {
    if (!cam || cam.hidden || sending) return;
    stopCamera();
    cam.classList.remove('open');
    setTimeout(function () { if (!cam.classList.contains('open')) { cam.hidden = true; reset(); } }, 250);
  }

  /* ---------- building it all ---------- */

  var ICON_FLIP = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9a8 8 0 0 1 14.3-3.3L20 8"/><path d="M20 3v5h-5"/><path d="M20 15a8 8 0 0 1-14.3 3.3L4 16"/><path d="M4 21v-5h5"/></svg>';
  var ICON_CAMERA = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.6"/></svg>';

  function build() {
    // spread out
    spill = el('div', 'spill pspill');
    spill.id = 'pspill';
    spill.hidden = true;
    spill.setAttribute('role', 'dialog');
    spill.setAttribute('aria-modal', 'true');
    spill.setAttribute('aria-label', 'Polaroids');
    spill.innerHTML =
      '<div class="sp-scrim" data-pclose></div>' +
      '<div class="sp-sheet" data-pclose>' +
        '<div class="sp-tabs pp-nav">' +
          '<button class="pp-arrow pp-prev" type="button">\u2039</button>' +
          '<h2 class="pp-title"></h2>' +
          '<button class="pp-arrow pp-next" type="button" aria-label="The month after">\u203a</button>' +
        '</div>' +
        '<div class="sp-list pp-days" data-pclose></div>' +
        '<div class="sp-adders">' +
          '<button class="adder adder--josh" type="button" data-pol-add="josh"><span aria-hidden="true">+</span> Josh</button>' +
          '<button class="adder adder--joyce" type="button" data-pol-add="joyce"><span aria-hidden="true">+</span> Joyce</button>' +
        '</div>' +
      '</div>' +
      '<button class="viewer-btn viewer-close sp-close" type="button" aria-label="Close" data-pclose>&times;</button>';
    document.body.appendChild(spill);
    list = spill.querySelector('.pp-days');
    adders = spill.querySelector('.sp-adders');
    prevBtn = spill.querySelector('.pp-prev');
    nextBtn = spill.querySelector('.pp-next');
    titleEl = spill.querySelector('.pp-title');
    prevBtn.addEventListener('click', function () { if (dayOn) backToMonth(); else turnMonth(-1); });
    nextBtn.addEventListener('click', function () { turnMonth(1); });

    spill.addEventListener('click', function (e) {
      if (Date.now() - openedAt < 450) return;
      var pol = e.target.closest('.pday-row .pol');
      if (pol) {
        if (held) { held = false; return; }
        show(pol.dataset.id);
        return;
      }
      var day = e.target.closest('.pcal-cell[data-day]');
      if (day) { openDay(day.dataset.day, day); return; }
      if (e.target.closest('.pcal, .pp-nav')) return;          // an empty day, or the header
      var t = e.target.closest('[data-pclose], button');
      if (t && t.hasAttribute('data-pclose')) close();
    });
    spill.addEventListener('keydown', function (e) {
      e.stopPropagation();
      var pol = e.target.closest && e.target.closest('.pday-row .pol');
      if (pol && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); show(pol.dataset.id); }
    });
    adders.querySelectorAll('[data-pol-add]').forEach(function (b) {
      b.addEventListener('click', function () { take(b.dataset.polAdd); });
    });

    // one, big
    view = el('div', 'pview');
    view.hidden = true;
    view.setAttribute('role', 'dialog');
    view.setAttribute('aria-modal', 'true');
    view.setAttribute('aria-label', 'A polaroid');
    view.innerHTML =
      '<div class="pv-scrim" data-pvclose></div>' +
      '<div class="pv-slot" data-pvclose></div>' +
      '<button class="viewer-btn viewer-close pv-close" type="button" aria-label="Close" data-pvclose>&times;</button>';
    document.body.appendChild(view);
    viewSlot = view.querySelector('.pv-slot');
    view.addEventListener('click', function (e) {
      askMotion();
      if (e.target.hasAttribute && e.target.hasAttribute('data-pvclose')) hide();
    });
    view.addEventListener('keydown', function (e) { e.stopPropagation(); });

    // the camera
    cam = el('div', 'pcam');
    cam.hidden = true;
    cam.setAttribute('role', 'dialog');
    cam.setAttribute('aria-modal', 'true');
    cam.setAttribute('aria-label', 'Take a polaroid');
    cam.innerHTML =
      '<div class="pc-scrim"></div>' +
      '<div class="pc-body">' +
        '<article class="pol pol--big pol--cam">' +
          '<div class="pol-photo">' +
            '<video class="pc-video" playsinline muted autoplay></video>' +
            '<img class="pc-shot" alt="">' +
            '<span class="pc-flash"></span>' +
          '</div>' +
          '<div class="pol-strip"><textarea class="pc-cap" maxlength="40" rows="1" autocomplete="off" aria-label="Write on it"></textarea><span class="who-chip pc-who"></span></div>' +
        '</article>' +
        '<div class="pc-controls">' +
          '<button class="pc-round pc-flip" type="button" aria-label="Switch camera">' + ICON_FLIP + '</button>' +
          '<button class="pc-shutter" type="button" aria-label="Take it"></button>' +
          '<label class="pc-shutter pc-open" aria-label="Open the camera">' + ICON_CAMERA +
            '<input type="file" accept="image/*" capture="environment"></label>' +
          '<span class="pc-round pc-spacer" aria-hidden="true"></span>' +
        '</div>' +
        '<div class="pc-after">' +
          '<button class="pc-btn pc-btn--quiet pc-retake" type="button">again</button>' +
          '<button class="pc-btn pc-send" type="button">send</button>' +
        '</div>' +
        '<p class="pc-status" role="status"></p>' +
      '</div>' +
      '<button class="viewer-btn viewer-close pc-close" type="button" aria-label="Close">&times;</button>';
    document.body.appendChild(cam);
    cam.querySelector('.pc-shutter').addEventListener('click', shutter);
    cam.querySelector('.pc-flip').addEventListener('click', function () {
      facing = facing === 'user' ? 'environment' : 'user';
      startCamera();
    });
    var fileInput = cam.querySelector('.pc-open input');
    fileInput.addEventListener('change', function () { fromFile(fileInput.files[0]); fileInput.value = ''; });
    cam.querySelector('.pc-retake').addEventListener('click', function () { reset(); startCamera(); });
    cam.querySelector('.pc-send').addEventListener('click', send);
    var capBox = cam.querySelector('.pc-cap');
    capBox.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); send(); }
    });
    // it wraps like the finished polaroid will, the strip growing to fit
    capBox.addEventListener('input', fitCaption);
    cam.querySelector('.pc-close').addEventListener('click', closeCamera);
    cam.querySelector('.pc-scrim').addEventListener('click', closeCamera);
    cam.addEventListener('keydown', function (e) { e.stopPropagation(); });

    // Escape closes whatever is on top: the camera, then the big one, then the spread
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var c = document.querySelector('.confirm');
      if (c && !c.hidden) return;
      if (!cam.hidden && cam.classList.contains('open')) closeCamera();
      else if (!view.hidden && view.classList.contains('open')) hide();
      else if (spread && dayOn) backToMonth();
      else if (spread) close(true);
      else return;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    if (window.JoyStore) JoyStore.ready.then(paint);
    paint();
    window.JoyPolaroids = { open: open, close: close, paint: paint, show: show, take: take };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
