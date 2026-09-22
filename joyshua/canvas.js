/* /joyshua -- postcards on an endless desk you can drag and zoom.
 *
 * The desk has no edges and nothing repeats: the postcards sit near the origin
 * and the camera ({x, y} = the world point at the screen's top-left, z = zoom)
 * can go anywhere. Only the dot grid is everywhere, drawn as a CSS background
 * that follows the camera. Since you can wander into empty space forever, the
 * ⌖ button (and "0") glides back to fit the postcards.
 *
 * screen = (world - cam) * z, so the world layer is translate(-cam*z) scale(z)
 * with its origin at 0,0, and zooming about a screen point keeps the world point
 * under it fixed.
 *
 * Dragging a postcard moves it (and it stays put for this browser); dragging
 * the empty desk pans. Taps are detected by hand (pointerdown + pointerup with under 6px of travel and
 * only ever one finger) rather than with click, so ending a drag or a pinch on a
 * card never opens it.
 */
(function () {
  'use strict';

  var CARDS = window.POSTCARDS || [];
  var LETTERS = window.LETTERS || [];
  if (!CARDS.length) return;
  var EW = 360, EH = 226;     // an envelope on the desk
  var BW = 300, BH = 210;     // the keepsake box

  var SEED = 20260921;
  var TAP_SLOP = 6;           // px of travel before a press becomes a drag
  var FRICTION = 0.94;        // momentum kept per 16ms frame after a flick
  var DOT = 28;               // dot spacing at zoom 1
  var Z_MIN = 0.15, Z_MAX = 4;

  var stage, world, hint;
  var cam = { x: 0, y: 0, z: 1 };
  var vel = { x: 0, y: 0 };   // screen px per ms, for momentum after a flick
  var glide = null;           // {x, y, z} the camera is easing toward
  var raf = 0, lastT = 0;

  var CW, CH, small, portrait;
  var placed = [];            // {el, x, y, rot, card}

  // ---------- helpers ----------

  function rng(seed) {                       // mulberry32: small, seeded, good enough
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function clampZ(z) { return Math.max(Z_MIN, Math.min(Z_MAX, z)); }

  // ---------- layout ----------

  // A loose grid around the origin: one column on a tall screen, otherwise as
  // square as the count allows. Seeded jitter and tilt, so it reads as tossed
  // onto the desk but lands the same way every visit.
  function layout() {
    small = window.innerWidth < 640;
    portrait = window.innerHeight > window.innerWidth;
    CW = 420;
    CH = Math.round(CW * CARDS[0].front.h / CARDS[0].front.w);
    document.documentElement.style.setProperty('--cw', CW + 'px');
    document.documentElement.style.setProperty('--ch', CH + 'px');

    var n = CARDS.length;
    var cols = portrait ? 1 : Math.ceil(Math.sqrt(n));
    var rows = Math.ceil(n / cols);
    var cellW = CW * 1.18, cellH = CH * 1.3;
    var rand = rng(SEED);

    var saved = loadSpots();
    placed.forEach(function (p) { world.removeChild(p.el); });
    placed = [];
    function put(el, x, y, rot, kind, idx, w, h, key) { putItem(saved, el, x, y, rot, kind, idx, w, h, key); }

    for (var i = 0; i < n; i++) {
      var c = i % cols, r = Math.floor(i / cols);
      var inRow = Math.min(cols, n - r * cols);      // centre a short last row
      var x = (c - (inRow - 1) / 2) * cellW - CW / 2 + (rand() - 0.5) * CW * 0.16;
      var y = (r - (rows - 1) / 2) * cellH - CH / 2 + (rand() - 0.5) * CH * 0.16;
      // alternate the lean so neighbours don't tilt the same way
      var rot = (i % 2 ? 1 : -1) * (2.5 + rand() * 3.5);
      put(makeCard(i), x, y, rot, 'card', i, CW, CH, CARDS[i].title);
    }

    // The envelopes get a row of their own under the postcards (on a phone, they
    // just carry on down the column).
    // The envelopes share a row with the keepsake box (on a phone they all carry
    // on down the column). Letters already in the box don't take a spot.
    var m = LETTERS.length, slot = 0;
    var slots = LETTERS.filter(function (L, j) { return !isBoxed(j); }).length + 1;
    function spot(w, h) {
      var er = rows + (portrait ? slot : 0), ec = portrait ? 0 : slot, eIn = portrait ? 1 : slots;
      slot++;
      return {
        x: (ec - (eIn - 1) / 2) * cellW - w / 2 + (rand() - 0.5) * w * 0.2,
        y: (er - (rows - 1) / 2) * cellH - h / 2 + (rand() - 0.5) * h * 0.16
      };
    }
    for (var j = 0; j < m; j++) {
      var erot = (j % 2 ? -1 : 1) * (3 + rand() * 4);
      if (isBoxed(j)) {
        put(makeEnvelope(j), 0, 0, erot, 'letter', j, EW, EH, letterKey(j));
        stowed(placed[placed.length - 1], true);
      } else {
        var sp = spot(EW, EH);
        put(makeEnvelope(j), sp.x, sp.y, erot, 'letter', j, EW, EH, letterKey(j));
      }
    }
    var bs = spot(BW, BH);
    put(makeBox(), bs.x, bs.y + 10, -1.5, 'box', 0, BW, BH, 'keepsake-box');
    boxItem = placed[placed.length - 1];
    renderBox();
  }

  function isBoxed(j) { return !!(window.JoyStore && JoyStore.inBox(letterKey(j))); }

  // In the box, an envelope stays in `placed` (every index stays valid) but is
  // invisible and ignored until it's taken out again.
  function stowed(p, on) {
    p.inBox = on;
    p.el.classList.toggle('in-box', on);
    p.el.tabIndex = on ? -1 : 0;
  }

  function putItem(saved, el, x, y, rot, kind, idx, w, h, key) {
    // wherever this visitor last dropped it, if they moved it
    var spot = saved[key];
    if (spot && isFinite(spot.x) && isFinite(spot.y)) { x = spot.x; y = spot.y; }
    var p = { el: el, x: x, y: y, rot: rot, kind: kind, idx: idx, w: w, h: h, key: key, moved: !!spot };
    el.dataset.p = placed.length;
    el.dataset.rot = rot.toFixed(2);
    placed.push(p);
    placeCard(p);
    world.appendChild(el);
    return p;
  }

  /* ---------- the keepsake box ----------
   * A lidded kraft box on the desk. Drag an envelope over it and the lid lifts;
   * let go and it drops in. Hover over it (or tap it, on a phone) and the lid
   * opens and its letters fan out above it: tap one to read it, or drag it out to
   * put it back on the desk. What's in the box is saved for everyone. */
  var boxItem = null, boxTimer = 0;

  function makeBox() {
    var b = document.createElement('div');
    b.className = 'card keepsake';
    b.tabIndex = 0;
    b.setAttribute('role', 'button');
    b.setAttribute('aria-expanded', 'false');
    b.innerHTML =
      '<span class="kb-inside"></span>' +
      '<span class="kb-peeks"></span>' +
      '<span class="kb-body"><span class="kb-ribbon"></span><span class="kb-label">our letters</span><span class="kb-count"></span></span>' +
      '<span class="kb-lid"><span class="kb-ribbon"></span><span class="kb-bow"></span></span>' +
      '<span class="kb-fan"></span>';
    b.addEventListener('pointerenter', function (e) {
      if (e.pointerType !== 'mouse' || pointers.size) return;
      clearTimeout(boxTimer);
      boxTimer = setTimeout(function () { openBox(true); }, 90);
    });
    b.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(boxTimer);
      boxTimer = setTimeout(function () { if (!letterState && !(press && press.fan)) openBox(false); }, 380);
    });
    b.addEventListener('keydown', function (e) {
      if (e.target !== b || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      openBox(!b.classList.contains('open'));
      var first = b.querySelector('.kb-env');
      if (first && b.classList.contains('open')) first.focus({ preventScroll: true });
    });
    return b;
  }

  function boxedItems() {
    return placed.filter(function (p) { return p.kind === 'letter' && p.inBox; });
  }

  function renderBox() {
    if (!boxItem) return;
    var el = boxItem.el, inside = boxedItems(), n = inside.length;
    el.querySelector('.kb-count').textContent = n ? n + (n === 1 ? ' letter' : ' letters') : 'drop letters in';
    el.setAttribute('aria-label', 'Keepsake box, ' + (n ? n + (n === 1 ? ' letter' : ' letters') : 'empty') + '. Open to choose a letter.');
    el.classList.toggle('empty', !n);

    // tops of envelopes, standing in the box, seen when the lid lifts
    var peeks = el.querySelector('.kb-peeks');
    peeks.textContent = '';
    inside.slice(0, 4).forEach(function (p, k) {
      var s = document.createElement('span');
      s.className = 'kb-peek author-' + (LETTERS[p.idx].author || 'josh');
      s.style.left = (8 + k * 22) + '%';
      s.style.rotate = ((k % 2 ? 1 : -1) * (2 + k * 1.5)) + 'deg';
      peeks.appendChild(s);
    });

    // the fan: every letter, spread in an arc above the box
    var fan = el.querySelector('.kb-fan');
    fan.textContent = '';
    // side by side in a gentle arc: wide enough apart that every label reads,
    // tighter as the box fills up
    var gap = n > 1 ? Math.min(200, 820 / (n - 1 + 1)) : 0;
    inside.forEach(function (p, k) {
      var L = LETTERS[p.idx];
      var off = k - (n - 1) / 2;
      var a = off * Math.min(9, 36 / Math.max(1, n - 1));
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'kb-env author-' + (L.author || 'josh');
      b.dataset.letter = p.idx;
      b.dataset.rot = a.toFixed(1);
      b.setAttribute('aria-label', 'Read: ' + L.label);
      b.style.setProperty('--fx', (off * gap).toFixed(1) + 'px');
      b.style.setProperty('--fy', (-205 + Math.abs(off) * gap * 0.16).toFixed(1) + 'px');
      b.style.setProperty('--fr', a.toFixed(1) + 'deg');
      b.style.setProperty('--i', k);
      b.innerHTML = '<span class="env-body"><span class="fold fold--bottom"><i></i></span><span class="fold fold--top"><i></i></span><span class="env-label"></span></span>';
      b.querySelector('.env-label').textContent = L.label;
      fan.appendChild(b);
    });
  }

  function openBox(on) {
    if (!boxItem) return;
    var el = boxItem.el;
    if (on && !boxedItems().length) on = false;       // nothing to fan out; the hover peek still shows
    el.classList.toggle('open', on);
    el.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) el.style.zIndex = ++zTop;
  }

  function overBox(clientX, clientY) {
    if (!boxItem) return false;
    var r = boxItem.el.getBoundingClientRect();
    return clientX > r.left && clientX < r.right && clientY > r.top - 30 && clientY < r.bottom;
  }

  function putInBox(p) {
    stowed(p, true);
    p.moved = false;
    saveSpots();
    renderBox();
    var el = boxItem.el;
    el.classList.remove('drop-target');
    el.classList.remove('gulp');
    void el.offsetWidth;
    el.classList.add('gulp');                          // the lid bounces shut on it
    if (window.JoyStore) {
      JoyStore.setBox(p.key, true).then(
        function () { toast('in the box'); },
        function (err) { toast(err.message, true); stowed(p, false); renderBox(); }
      );
    }
  }

  // Lift a letter out of the fan and put it under the finger, mid-drag.
  function takeOut(fanBtn, clientX, clientY) {
    var j = +fanBtn.dataset.letter;
    var p = placed.filter(function (q) { return q.kind === 'letter' && q.idx === j; })[0];
    if (!p) return null;
    stowed(p, false);
    p.x = cam.x + clientX / cam.z - EW / 2;
    p.y = cam.y + clientY / cam.z - EH / 2;
    p.moved = true;
    placeCard(p);
    openBox(false);
    renderBox();
    if (window.JoyStore) {
      JoyStore.setBox(p.key, false).catch(function (err) { toast(err.message, true); });
    }
    return p;
  }

  function letterKey(j) { return 'letter:' + (LETTERS[j].key || LETTERS[j].label); }

  /* ---------- things added from the page ----------
   * JoyStore holds the rows; they're folded into CARDS / LETTERS here, once
   * each. Static postcards are keyed by title, added ones by id. */
  var merged = {};

  function mergeAdded() {
    var S = window.JoyStore;
    var fresh = { cards: [], letters: [] };
    if (!S) return fresh;
    S.added.postcards.forEach(function (r) {
      if (merged[r.id]) return;
      merged[r.id] = true;
      CARDS.push({
        title: r.title, key: r.id, author: r.author,
        front: { src: S.fileUrl(r.front_path), w: r.w, h: r.h, alt: 'A postcard: ' + r.title + '.' },
        photos: []
      });
      fresh.cards.push(CARDS.length - 1);
    });
    S.added.photos.forEach(function (r) {
      if (merged[r.id]) return;
      var card = CARDS.filter(function (c) { return (c.key || c.title) === r.postcard_key; })[0];
      if (!card) return;
      merged[r.id] = true;
      card.photos.push({
        key: r.path, src: S.fileUrl(r.path), thumb: S.fileUrl(r.thumb_path),
        w: r.w, h: r.h, label: r.label, alt: r.label || 'A photo.', author: r.author
      });
    });
    S.added.letters.forEach(function (r) {
      if (merged[r.id]) return;
      merged[r.id] = true;
      LETTERS.push({
        key: r.id, label: r.label, greeting: r.greeting,
        body: r.body.split(/\n\s*\n/), closing: r.closing, name: r.name, author: r.author
      });
      fresh.letters.push(LETTERS.length - 1);
    });
    return fresh;
  }

  // New things drop onto the desk where you're looking, rather than reshuffling
  // everything already there; next visit they take their place in the layout.
  function dropNew(fresh) {
    var saved = loadSpots();
    var cx = cam.x + window.innerWidth / 2 / cam.z, cy = cam.y + window.innerHeight / 2 / cam.z;
    var last = null, k = 0;
    fresh.cards.forEach(function (i) {
      last = putItem(saved, makeCard(i), cx - CW / 2 + k * 40, cy - CH / 2 + k * 30, (k % 2 ? 1 : -1) * 4, 'card', i, CW, CH, CARDS[i].key || CARDS[i].title);
      k++;
    });
    fresh.letters.forEach(function (j) {
      last = putItem(saved, makeEnvelope(j), cx - EW / 2 + k * 40, cy - EH / 2 + k * 30, (k % 2 ? -1 : 1) * 5, 'letter', j, EW, EH, letterKey(j));
      k++;
    });
    if (last) {
      last.el.style.zIndex = ++zTop;
      last.el.classList.add('arrived');
      setTimeout(function () { last.el.classList.remove('arrived'); }, 900);
    }
    render();
    return last;
  }

  function refreshAdded() {
    var fresh = mergeAdded();
    if (openState && openState.grid) buildSheet();
    var last = dropNew(fresh);
    renderBox();
    return last;
  }

  /* Dragged postcards stay where they're dropped, per browser. Keyed by title so
   * adding or reordering postcards doesn't shuffle anyone's arrangement. Storage
   * can throw (private mode, blocked site data); the page just forgets then. */
  var SPOTS_KEY = 'joyshua-spots';

  function loadSpots() {
    try { return JSON.parse(localStorage.getItem(SPOTS_KEY)) || {}; } catch (err) { return {}; }
  }

  function saveSpots() {
    var out = {};
    placed.forEach(function (p) { if (p.moved) out[p.key] = { x: Math.round(p.x), y: Math.round(p.y) }; });
    try { localStorage.setItem(SPOTS_KEY, JSON.stringify(out)); } catch (err) { /* ignore */ }
  }

  function placeCard(p) {
    p.el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px) rotate(' + p.rot.toFixed(2) + 'deg)';
  }

  var zTop = 1;

  function makeCard(i) {
    var c = CARDS[i];
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'card';
    b.dataset.card = i;
    b.setAttribute('aria-label', c.title + ' postcard, ' + c.photos.length + (c.photos.length === 1 ? ' photo' : ' photos'));
    var img = document.createElement('img');
    img.className = 'card-art';
    img.src = c.front.src;
    img.alt = '';
    img.width = c.front.w;
    img.height = c.front.h;
    img.draggable = false;
    img.decoding = 'async';
    var body = document.createElement('span');
    body.className = 'card-body';
    body.appendChild(img);
    b.appendChild(body);
    return b;
  }

  // A grey envelope, back side up (flap and all), with its label written across.
  function makeEnvelope(j) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'card envelope author-' + (LETTERS[j].author || 'josh');
    b.dataset.letter = j;
    b.setAttribute('aria-label', 'Envelope: ' + LETTERS[j].label + '. Open the letter.');
    var body = document.createElement('span');
    body.className = 'card-body env-body';
    // each fold is a clipped sheet of paper inside an unclipped wrapper, so the
    // wrapper's drop-shadow can fall on the paper underneath it
    body.innerHTML = '<span class="fold fold--bottom"><i></i></span><span class="fold fold--top"><i></i></span>';
    var label = document.createElement('span');
    label.className = 'env-label';
    label.textContent = LETTERS[j].label;
    body.appendChild(label);
    b.appendChild(body);
    return b;
  }

  // The camera that fits everything on the desk on screen with room to breathe.
  function fitCam() {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    placed.forEach(function (p) {
      if (p.inBox) return;
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + p.w); y1 = Math.max(y1, p.y + p.h);
    });
    var vw = window.innerWidth, vh = window.innerHeight;
    var padX = small ? 28 : 120, padY = 150;   // leaves room for the label + controls
    if (portrait && small) {
      // A phone stacks the postcards in one column. Fitting them all would make
      // each one stamp-sized, so fit the width instead and start at the top: the
      // next card peeking in at the bottom says "drag up for more".
      var zp = clampZ(Math.min(1.1, (vw - padX * 2) / (x1 - x0)));
      return { x: (x0 + x1) / 2 - vw / 2 / zp, y: y0 - 140 / zp, z: zp };
    }
    var z = clampZ(Math.min(1.1, (vw - padX * 2) / (x1 - x0), (vh - padY * 2) / (y1 - y0)));
    return { x: (x0 + x1) / 2 - vw / 2 / z, y: (y0 + y1) / 2 - vh / 2 / z, z: z };
  }

  // ---------- rendering ----------

  function render() {
    var z = cam.z;
    world.style.transform = 'translate3d(' + (-cam.x * z) + 'px,' + (-cam.y * z) + 'px,0) scale(' + z + ')';

    // Dot grid: keep the on-screen spacing between 14 and 56px by doubling or
    // halving the world spacing, so zooming out never turns the desk to mush.
    var s = DOT * z;
    while (s < 14) s *= 2;
    while (s > 56) s /= 2;
    stage.style.backgroundSize = s + 'px ' + s + 'px';
    stage.style.backgroundPosition = mod(-cam.x * z, s) + 'px ' + mod(-cam.y * z, s) + 'px';

    if (recenter) recenter.classList.toggle('lost', !placed.some(onScreen));
  }

  function mod(a, b) { return ((a % b) + b) % b; }

  function onScreen(p) {
    if (p.inBox) return false;
    var r = p.el.getBoundingClientRect();
    return r.right > 0 && r.bottom > 0 && r.left < window.innerWidth && r.top < window.innerHeight;
  }

  // ---------- motion loop ----------

  function kick() {
    if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); }
  }

  function tick(t) {
    raf = 0;
    var dt = lastT ? Math.min(t - lastT, 48) : 16;
    lastT = t;
    var moving = false;

    if (glide) {
      var e = 1 - Math.pow(0.8, dt / 16);
      // ease zoom in log space so zooming in and out feel the same speed, and
      // move the screen-centre world point in a straight line meanwhile
      var hw = window.innerWidth / 2, hh = window.innerHeight / 2;
      var cx = cam.x + hw / cam.z, cy = cam.y + hh / cam.z;
      var gx = glide.x + hw / glide.z, gy = glide.y + hh / glide.z;
      var z = Math.exp(Math.log(cam.z) + (Math.log(glide.z) - Math.log(cam.z)) * e);
      cx += (gx - cx) * e; cy += (gy - cy) * e;
      cam.z = z; cam.x = cx - hw / z; cam.y = cy - hh / z;
      if (Math.abs(gx - cx) < 0.5 && Math.abs(gy - cy) < 0.5 && Math.abs(glide.z - z) < 0.001) {
        cam.x = glide.x; cam.y = glide.y; cam.z = glide.z; glide = null;
      } else moving = true;
    } else if (!pointers.size && (vel.x || vel.y)) {
      cam.x -= vel.x * dt / cam.z;
      cam.y -= vel.y * dt / cam.z;
      var f = Math.pow(FRICTION, dt / 16);
      vel.x *= f; vel.y *= f;
      if (Math.abs(vel.x) < 0.01 && Math.abs(vel.y) < 0.01) { vel.x = vel.y = 0; }
      else moving = true;
    }

    render();
    if (moving) raf = requestAnimationFrame(tick);
    else lastT = 0;
  }

  function stop() { vel.x = vel.y = 0; glide = null; }

  function glideTo(target) { vel.x = vel.y = 0; glide = target; kick(); }

  function glideBy(dx, dy) {
    var from = glide || cam;
    glideTo({ x: from.x + dx / from.z, y: from.y + dy / from.z, z: from.z });
  }

  // Zoom by a factor about a screen point, keeping the world point under it fixed.
  function zoomAt(sx, sy, factor) {
    var z = clampZ(cam.z * factor);
    var wx = cam.x + sx / cam.z, wy = cam.y + sy / cam.z;
    cam.z = z; cam.x = wx - sx / z; cam.y = wy - sy / z;
  }

  function zoomGlide(factor) {
    var from = glide || cam;
    var z = clampZ(from.z * factor);
    var sx = window.innerWidth / 2, sy = window.innerHeight / 2;
    var wx = from.x + sx / from.z, wy = from.y + sy / from.z;
    dismissHint();
    glideTo({ x: wx - sx / z, y: wy - sy / z, z: z });
  }

  // ---------- panning + pinching ----------

  var pointers = new Map();   // pointerId -> {x, y}
  var press = null;           // the one-finger press that may still become a tap
  var pinch = null;           // {dist, mx, my} while two fingers are down
  var last = null;            // {t} of the last drag move, for flick velocity

  function dismissHint() {
    if (!hint || hint.classList.contains('gone')) return;
    hint.classList.add('gone');
    // once faded, take it out of the label so the label shrinks to the name
    setTimeout(function () { hint.hidden = true; }, 800);
  }

  function midpoint() {
    var a = Array.from(pointers.values());
    return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, dist: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1 };
  }

  function onDown(e) {
    if (openState || letterState || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (pointers.size >= 2) return;
    stop();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

    if (pointers.size === 1) {
      press = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false,
                card: e.target.closest ? e.target.closest('.card') : null,
                fan: e.target.closest ? e.target.closest('.kb-env') : null };
      last = { t: e.timeStamp };
      // a tap anywhere else closes an open box (phones have no hover-out)
      if (boxItem && press.card !== boxItem.el) openBox(false);
    } else {
      // a second finger: this is a pinch now, and never a tap
      dropCard();
      press = null;
      var m = midpoint();
      pinch = { dist: m.dist, mx: m.x, my: m.y };
      stage.classList.add('dragging');
      dismissHint();
    }
  }

  function onMove(e) {
    var p = pointers.get(e.pointerId);
    if (!p) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;

    if (pinch) {
      var m = midpoint();
      cam.x -= (m.x - pinch.mx) / cam.z;
      cam.y -= (m.y - pinch.my) / cam.z;
      zoomAt(m.x, m.y, m.dist / pinch.dist);
      pinch = { dist: m.dist, mx: m.x, my: m.y };
      kick();
      return;
    }

    if (!press || e.pointerId !== press.id) return;
    if (!press.moved && Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > TAP_SLOP) {
      press.moved = true;
      stage.classList.add('dragging');
      dismissHint();
      // a press that started on a postcard picks the postcard up instead of
      // panning the desk; it comes to the top of the pile
      if (press.fan) {
        press.held = takeOut(press.fan, e.clientX, e.clientY);
        press.fan = null;
      } else if (press.card) {
        press.held = placed[+press.card.dataset.p];
        if (press.held.kind === 'box') openBox(false);
      }
      if (press.held) {
        press.held.el.classList.add('held');
        press.held.el.style.zIndex = ++zTop;
      }
    }
    if (press.held) {
      press.held.x += dx / cam.z;
      press.held.y += dy / cam.z;
      press.held.moved = true;
      placeCard(press.held);
      if (press.held.kind === 'letter' && boxItem) {
        press.overBox = overBox(e.clientX, e.clientY);
        boxItem.el.classList.toggle('drop-target', press.overBox);
      }
      return;
    }
    if (press.moved) {
      cam.x -= dx / cam.z; cam.y -= dy / cam.z;
      var dt = Math.max(e.timeStamp - last.t, 1);
      // smoothed velocity, so one jittery last event doesn't decide the flick
      vel.x = vel.x * 0.6 + (dx / dt) * 0.4;
      vel.y = vel.y * 0.6 + (dy / dt) * 0.4;
      last = { t: e.timeStamp };
      kick();
    }
  }

  function dropCard() {
    if (!press || !press.held) return;
    press.held.el.classList.remove('held');
    if (press.held.kind === 'letter' && press.overBox) putInBox(press.held);
    else saveSpots();
    if (boxItem) boxItem.el.classList.remove('drop-target');
    render();
  }

  function onUp(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }

    if (pinch) {
      pinch = null;
      vel.x = vel.y = 0;
      // the finger left behind carries on as a plain drag, but can't tap
      var rest = pointers.entries().next().value;
      if (rest) {
        press = { id: rest[0], sx: rest[1].x, sy: rest[1].y, moved: true, card: null };
        last = { t: e.timeStamp };
      } else stage.classList.remove('dragging');
      return;
    }

    var p = press;
    dropCard();
    press = null;
    stage.classList.remove('dragging');
    if (!p || p.id !== e.pointerId) return;
    if (p.held) return;
    if (!p.moved) {
      vel.x = vel.y = 0;
      if (e.type !== 'pointerup') return;
      if (p.fan) openLetter(p.fan);
      // with a mouse the box is already open from hovering; a click keeps it so
      else if (p.card && p.card.classList.contains('keepsake') && e.pointerType === 'mouse') openBox(true);
      else if (p.card) openItem(p.card);
      return;
    }
    // a drag that stopped before letting go shouldn't fling
    if (e.timeStamp - last.t > 80) vel.x = vel.y = 0;
    kick();
  }

  function onWheel(e) {
    e.preventDefault();
    if (openState || letterState) return;
    stop();
    var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    var dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) {
      // a trackpad pinch arrives as ctrl+wheel; so does ctrl + a mouse wheel
      zoomAt(e.clientX, e.clientY, Math.exp(-dy * 0.01));
    } else {
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      cam.x += dx / cam.z; cam.y += dy / cam.z;
    }
    dismissHint();
    kick();
  }

  function onKey(e) {
    if (letterState) return letterViewKey(e);
    if (openState) return viewerKey(e);
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var step = e.shiftKey ? 480 : 180;
    var map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (map[e.key]) { e.preventDefault(); dismissHint(); glideBy(map[e.key][0], map[e.key][1]); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomGlide(1.4); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomGlide(1 / 1.4); }
    else if (e.key === '0') { e.preventDefault(); glideTo(fitCam()); }
  }

  // Keyboard users tab onto cards that may be off screen: bring them into view.
  function onFocusIn(e) {
    var b = e.target.closest && e.target.closest('.card');
    stage.scrollLeft = stage.scrollTop = 0;   // undo the browser's own scroll-into-view
    if (!b || pointers.size) return;
    var r = b.getBoundingClientRect();
    var pad = 40;
    if (r.left >= pad && r.top >= pad && r.right <= window.innerWidth - pad && r.bottom <= window.innerHeight - pad) return;
    glideBy(r.left + r.width / 2 - window.innerWidth / 2, r.top + r.height / 2 - window.innerHeight / 2);
  }

  // Enter / Space on a focused card. Pointer taps are handled in onUp.
  function onClick(e) {
    if (e.detail !== 0) return;
    var f = e.target.closest && e.target.closest('.kb-env');
    if (f) { openLetter(f); return; }
    var b = e.target.closest && e.target.closest('.card');
    if (b && !b.classList.contains('keepsake')) openItem(b);
  }

  // ---------- the viewer ----------

  var viewer, vCard, vPhoto, vImg, vTitle, vCount, vPrev, vNext, vClose, vBanner, recenter;
  var vGridBtn, vSheet, vSheetTitle, vSheetGrid;
  var openState = null;       // {ci, i, btn, grid}
  var swipe = null;

  /* Scrapbook banners. The style is picked by the photo's position, so no two
   * neighbours match; on the second lap round the list the colours change, so
   * photo 1 and photo 9 don't look the same either. */
  var BANNERS = ['tape', 'torn', 'ribbon', 'labelmaker', 'ticket', 'sticky', 'clipping', 'sticker'];

  function setBanner(i, text) {
    var style = BANNERS[i % BANNERS.length];
    var alt = Math.floor(i / BANNERS.length) % 2;
    vBanner.className = 'banner banner--' + style + (alt ? ' banner--alt' : '');
    vBanner.textContent = '';
    if (style === 'clipping') {
      // ransom-note letters, each cut from a different "magazine"
      // letters are grouped by word so a long caption only wraps between words
      var r = rng(SEED + i * 97);
      text.split(' ').forEach(function (word, wi) {
        if (wi) { var g = document.createElement('span'); g.className = 'gap'; g.textContent = ' '; vBanner.appendChild(g); }
        var w = document.createElement('span');
        w.className = 'word';
        word.split('').forEach(function (ch) {
          var s = document.createElement('span');
          s.className = 'cut cut' + Math.floor(r() * 5);
          s.style.transform = 'rotate(' + ((r() - 0.5) * 14).toFixed(1) + 'deg)';
          s.textContent = ch;
          w.appendChild(s);
        });
        vBanner.appendChild(w);
      });
    } else {
      var span = document.createElement('span');
      span.textContent = text;
      vBanner.appendChild(span);
    }
    // restart the "stuck on" animation for each new photo
    vBanner.style.animation = 'none';
    void vBanner.offsetWidth;
    vBanner.style.animation = '';
  }

  function photoBox(p) {
    var vw = window.innerWidth, vh = window.innerHeight;
    var frame = small ? 24 : 36;                        // viewer-card side padding x2
    var maxW = Math.min(vw - (small ? 36 : 190), 1100) - frame;
    var maxH = vh - (small ? 230 : 180) - frame;
    var s = Math.min(maxW / p.w, maxH / p.h);
    return { w: Math.round(p.w * s), h: Math.round(p.h * s) };
  }

  function showPhoto(i, instant) {
    var c = CARDS[openState.ci];
    var n = c.photos.length;
    if (!n) return;
    i = (i + n) % n;
    openState.i = i;
    var p = c.photos[i];
    var box = photoBox(p);

    if (instant) vPhoto.style.transition = 'none';
    vPhoto.style.width = box.w + 'px';
    vPhoto.style.height = box.h + 'px';
    if (instant) { void vPhoto.offsetWidth; vPhoto.style.transition = ''; }

    vImg.classList.remove('loaded');
    vImg.alt = p.alt || '';
    vImg.width = p.w;
    vImg.height = p.h;
    vImg.onload = function () { if (vImg.getAttribute('src') === p.src) vImg.classList.add('loaded'); };
    vImg.src = p.src;
    if (vImg.complete && vImg.naturalWidth) vImg.classList.add('loaded');

    openState.box = box;
    renderBanner();

    vCount.textContent = n > 1 ? (i + 1) + ' / ' + n : '';
    vPrev.disabled = vNext.disabled = n < 2;

    if (n > 1) { var pre = new Image(); pre.src = c.photos[(i + 1) % n].src; }
  }

  /* ---------- banners you can edit and move ----------
   * A banner's words and spot come from the photo (postcards.js) unless someone
   * has changed them on the page, in which case JoyStore has the edit. The spot
   * is the banner's centre as a percentage of the photo, so it lands in the same
   * place at every screen size; with no saved spot the style's own corner is
   * used. A press that travels under TAP_SLOP is a tap (edit the words); any
   * further and it's a drag (move the banner). */

  var bDrag = null;           // a banner being pressed or dragged
  var editing = null;         // {src, before, span}
  var editEndedAt = 0;

  function currentPhoto() {
    return openState ? CARDS[openState.ci].photos[openState.i] : null;
  }

  function labelFor(p) {
    var o = window.JoyStore && JoyStore.label(p.key || p.src);
    return {
      text: o && typeof o.text === 'string' && o.text ? o.text : (p.label || ''),
      x: o && isFinite(o.x) ? o.x : null,
      y: o && isFinite(o.y) ? o.y : null
    };
  }

  function renderBanner() {
    var p = currentPhoto();
    if (!p || editing) return;
    var L = labelFor(p);
    vBanner.hidden = !L.text;
    if (L.text) setBanner(openState.i, L.text);
    placeBanner(L.x, L.y);
  }

  function placeBanner(x, y) {
    if (x == null || y == null) {
      vBanner.classList.remove('placed');
      vBanner.style.left = vBanner.style.top = '';
      return;
    }
    var box = openState.box, pad = vPhoto.offsetLeft;
    vBanner.classList.add('placed');
    vBanner.style.left = (pad + x / 100 * box.w) + 'px';
    vBanner.style.top = (vPhoto.offsetTop + y / 100 * box.h) + 'px';
  }

  // Where the banner's centre is now, in % of the photo.
  function bannerCentre() {
    var b = vBanner.getBoundingClientRect(), ph = vPhoto.getBoundingClientRect();
    return { x: (b.left + b.width / 2 - ph.left) / ph.width * 100, y: (b.top + b.height / 2 - ph.top) / ph.height * 100 };
  }

  function toast(msg, bad) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.toggle('bad', !!bad);
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.classList.remove('show'); }, bad ? 3200 : 1400);
  }

  function saveLabel(src, patch) {
    if (!window.JoyStore) return;
    JoyStore.setLabel(src, patch).then(
      function () { toast('saved'); },
      function (err) { toast(err.message || 'Couldn\u2019t save that.', true); var c = currentPhoto(); if (c && (c.key || c.src) === src) renderBanner(); }
    );
  }

  function onBannerDown(e) {
    if (editing || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.stopPropagation();                      // not a swipe of the photo
    var c = bannerCentre();
    bDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x0: c.x, y0: c.y, moved: false };
    try { vBanner.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }

  function onBannerMove(e) {
    if (!bDrag || e.pointerId !== bDrag.id) return;
    var dx = e.clientX - bDrag.sx, dy = e.clientY - bDrag.sy;
    if (!bDrag.moved && Math.hypot(dx, dy) <= TAP_SLOP) return;
    bDrag.moved = true;
    vBanner.classList.add('moving');
    var ph = vPhoto.getBoundingClientRect();
    // on the photo or hanging off its edges, but never lost off the card
    bDrag.x = Math.max(-15, Math.min(115, bDrag.x0 + dx / ph.width * 100));
    bDrag.y = Math.max(-12, Math.min(112, bDrag.y0 + dy / ph.height * 100));
    placeBanner(bDrag.x, bDrag.y);
  }

  function onBannerUp(e) {
    if (!bDrag || e.pointerId !== bDrag.id) return;
    e.stopPropagation();
    var d = bDrag;
    bDrag = null;
    vBanner.classList.remove('moving');
    try { vBanner.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    var p = currentPhoto();
    if (!p || e.type !== 'pointerup') { renderBanner(); return; }
    if (d.moved) saveLabel(p.key || p.src, { x: Math.round(d.x * 10) / 10, y: Math.round(d.y * 10) / 10 });
    else startEdit();
  }

  function startEdit() {
    var p = currentPhoto();
    if (!p || editing) return;
    var before = labelFor(p).text;
    var span = document.createElement('span');
    span.className = 'edit';
    span.contentEditable = 'plaintext-only';
    if (span.contentEditable !== 'plaintext-only') span.contentEditable = 'true';
    span.spellcheck = false;
    span.textContent = before;
    vBanner.textContent = '';
    vBanner.appendChild(span);
    editing = { src: p.key || p.src, before: before, span: span, count: vCount.textContent };
    viewer.classList.add('editing');
    vCount.textContent = 'enter to save';
    span.focus();
    var range = document.createRange();
    range.selectNodeContents(span);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    span.addEventListener('keydown', function (e) {
      e.stopPropagation();                    // arrows and G belong to the text now
      if (e.key === 'Enter') { e.preventDefault(); endEdit(true); }
      else if (e.key === 'Escape') { e.preventDefault(); endEdit(false); }
    });
    span.addEventListener('input', function () {
      if (span.textContent.length > 80) span.textContent = span.textContent.slice(0, 80);
    });
    span.addEventListener('blur', function () { endEdit(true); });
  }

  function endEdit(keep) {
    if (!editing) return;
    var ed = editing;
    editing = null;
    editEndedAt = Date.now();
    viewer.classList.remove('editing');
    vCount.textContent = ed.count;
    var next = ed.span.textContent.replace(/\s+/g, ' ').trim().slice(0, 80);
    var p = currentPhoto();
    // JoyStore applies the new words at once and puts the old ones back if the
    // save fails, so re-drawing from it is always right
    if (keep && next && next !== ed.before) saveLabel(ed.src, { text: next });
    if (p && (p.key || p.src) === ed.src) renderBanner();
  }

  // The transform that makes the (centred, upright) viewer card sit exactly where
  // the postcard is on the desk, tilted like it -- the start of the open animation
  // and the end of the close one.
  function fromCardTransform(btn, panel) {
    var r = btn.getBoundingClientRect();              // axis-aligned box of the tilted card
    var f = panel.getBoundingClientRect();
    var dx = (r.left + r.width / 2) - (f.left + f.width / 2);
    var dy = (r.top + r.height / 2) - (f.top + f.height / 2);
    var item = btn.dataset.p != null ? placed[+btn.dataset.p] : null;
    var s = (item ? item.w : btn.offsetWidth) * cam.z / f.width;
    return 'translate(' + dx + 'px,' + dy + 'px) rotate(' + (+btn.dataset.rot || 0) + 'deg) scale(' + s + ')';
  }

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function openItem(btn) {
    if (btn.classList.contains('keepsake')) openBox(!btn.classList.contains('open'));
    else if (btn.classList.contains('envelope')) openLetter(btn);
    else openCard(btn);
  }

  function openCard(btn) {
    if (openState || letterState) return;
    stop();
    var ci = +btn.dataset.card;
    openState = { ci: ci, i: 0, btn: btn, grid: false };
    vTitle.textContent = CARDS[ci].title;
    var empty = !CARDS[ci].photos.length;
    setGrid(empty);
    viewer.hidden = false;
    showPhoto(0, true);
    btn.style.visibility = 'hidden';
    void viewer.offsetWidth;
    viewer.classList.add('open');
    if (!reduced && vCard.animate) {
      vCard.animate(
        [{ transform: fromCardTransform(btn, empty ? vSheet : vCard), opacity: 0.4 }, { transform: 'none', opacity: 1 }],
        { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' }
      );
    }
    if (!empty) vClose.focus({ preventScroll: true });
  }

  function closeViewer() {
    if (!openState || openState.closing) return;
    if (editing) endEdit(true);
    var st = openState;
    st.closing = true;
    viewer.classList.remove('open');
    var panel = st.grid ? vSheet : vCard;
    function done() {
      viewer.hidden = true;
      setGrid(false);
      st.btn.style.visibility = '';
      openState = null;
      vImg.removeAttribute('src');
      st.btn.focus({ preventScroll: true });
    }
    if (!reduced && panel.animate) {
      var a = panel.animate(
        [{ transform: 'none', opacity: 1 }, { transform: fromCardTransform(st.btn, panel), opacity: 0.4 }],
        { duration: 340, easing: 'cubic-bezier(.5,0,.75,.3)', fill: 'forwards' }
      );
      a.onfinish = function () { done(); a.cancel(); };
    } else done();
  }

  function step(d) {
    if (!openState || openState.grid) return;
    if (editing) endEdit(true);
    showPhoto(openState.i + d);
  }

  /* The contact sheet: every photo of this postcard at once, four across. Tap
   * one to go straight to it. Thumbnails are 360px squares made for this, so a
   * 27-photo sheet costs about 400KB, not the full-size set. */
  function buildSheet() {
    var c = CARDS[openState.ci];
    vSheetTitle.textContent = c.title + ' \u00b7 ' + (c.photos.length ? c.photos.length + (c.photos.length === 1 ? ' photo' : ' photos') : 'no photos yet');
    vSheetGrid.textContent = '';
    c.photos.forEach(function (p, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sheet-thumb';
      b.dataset.i = i;
      b.setAttribute('aria-label', 'Photo ' + (i + 1) + (p.label ? ': ' + p.label : ''));
      var img = document.createElement('img');
      img.src = p.thumb || p.src;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.draggable = false;
      b.appendChild(img);
      vSheetGrid.appendChild(b);
    });
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'sheet-add';
    add.innerHTML = '<span aria-hidden="true">+</span>add photos';
    add.addEventListener('click', function () {
      if (window.JoyCompose) JoyCompose.open('photos', { card: openState.ci });
    });
    vSheetGrid.appendChild(add);
  }

  function setGrid(on) {
    // with nothing to show one at a time, the grid (and its "+ add photos") is all there is
    if (!on && openState && !CARDS[openState.ci].photos.length) on = true;
    if (openState) openState.grid = on;
    vGridBtn.disabled = !!openState && !CARDS[openState.ci].photos.length;
    viewer.classList.toggle('grid', on);
    vCard.hidden = on;
    vSheet.hidden = !on;
    vGridBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    vGridBtn.setAttribute('aria-label', on ? 'Back to one photo' : 'See all photos');
    if (!openState) return;
    if (on) {
      buildSheet();
      var cur = vSheetGrid.children[openState.i];
      vSheet.scrollTop = 0;
      if (cur) {
        cur.classList.add('current');
        cur.scrollIntoView({ block: 'nearest' });
        cur.focus({ preventScroll: true });
      }
    } else {
      showPhoto(openState.i, true);
    }
  }

  function viewerKey(e) {
    if (editing) return;
    if (e.key === 'Escape') { e.preventDefault(); closeViewer(); }
    else if (e.key === 'g' || e.key === 'G') { e.preventDefault(); setGrid(!openState.grid); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'Tab') {
      // keep focus inside the dialog
      var f = Array.prototype.filter.call(viewer.querySelectorAll('button'), function (b) {
        return !b.disabled && b.offsetParent !== null;
      });
      var i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  }

  function onSwipeDown(e) { swipe = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
  function onSwipeUp(e) {
    if (!swipe || e.pointerId !== swipe.id) return;
    var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    // the tap that finished editing a banner shouldn't also turn the page
    if (editing || Date.now() - editEndedAt < 450) return;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
    else if (Math.hypot(dx, dy) < TAP_SLOP && e.target.closest('.viewer-photo')) step(1);
  }

  // ---------- the letters ----------

  /* Opening an envelope, in four beats: it flies off the desk to the middle, the
   * flap swings open (the flap drops behind the card halfway through its turn,
   * via a delayed z-index in the CSS), a plain grey card rises out of the pocket,
   * and then the card grows into the full letter while the envelope falls away.
   * The small card and the letter are separate elements -- the letter is far
   * taller than an envelope, so it can't honestly sit inside one. */
  var lv, lvEnv, lvSlip, lvLetter, lvLabel, lvText, lvClose;
  var letterState = null;     // {btn, timers, shown}

  function rectTransform(from, to) {
    var dx = (from.left + from.width / 2) - (to.left + to.width / 2);
    var dy = (from.top + from.height / 2) - (to.top + to.height / 2);
    return 'translate(' + dx + 'px,' + dy + 'px) scale(' + (from.width / to.width) + ')';
  }

  function fillLetter(L) {
    lvLabel.textContent = L.label;
    lvText.textContent = '';
    function para(text, cls) {
      var el = document.createElement('p');
      if (cls) el.className = cls;
      text.split('\n').forEach(function (line, k) {
        if (k) el.appendChild(document.createElement('br'));
        el.appendChild(document.createTextNode(line));
      });
      lvText.appendChild(el);
    }
    para(L.greeting, 'lv-greeting');
    L.body.forEach(function (t) { para(t); });
    para(L.closing + '\n' + L.name, 'lv-sign');
    lvLetter.scrollTop = 0;
  }

  function showLetter(animateFrom) {
    lvLetter.classList.add('shown');
    letterState.shown = true;
    if (animateFrom && lvLetter.animate) {
      lvLetter.animate(
        [{ transform: rectTransform(animateFrom, lvLetter.getBoundingClientRect()), opacity: 0.5 }, { transform: 'none', opacity: 1 }],
        { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' }
      );
    }
    lvEnv.classList.add('gone');
    lvLetter.focus({ preventScroll: true });
  }

  function openLetter(btn) {
    if (letterState || openState) return;
    stop();
    letterState = { btn: btn, timers: [], shown: false };
    var L = LETTERS[+btn.dataset.letter];
    lv.classList.toggle('author-joyce', L.author === 'joyce');
    fillLetter(L);
    lvEnv.className = 'lv-env';
    lvLetter.classList.remove('shown');
    lv.hidden = false;
    btn.style.visibility = 'hidden';
    void lv.offsetWidth;
    lv.classList.add('open');
    lvClose.focus({ preventScroll: true });

    if (reduced || !lvEnv.animate) { showLetter(null); return; }
    lvEnv.animate(
      [{ transform: fromCardTransform(btn, lvEnv), opacity: 0.6 }, { transform: 'none', opacity: 1 }],
      { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
    var t = letterState.timers;
    t.push(setTimeout(function () { lvEnv.classList.add('opened'); }, 500));
    t.push(setTimeout(function () { lvEnv.classList.add('out'); }, 950));
    t.push(setTimeout(function () { showLetter(lvSlip.getBoundingClientRect()); }, 1550));
  }

  function closeLetter() {
    if (!letterState || letterState.closing) return;
    var st = letterState;
    st.closing = true;
    st.timers.forEach(clearTimeout);
    lv.classList.remove('open');
    var panel = st.shown ? lvLetter : lvEnv;
    function done() {
      lv.hidden = true;
      lvLetter.classList.remove('shown');
      lvEnv.className = 'lv-env';
      st.btn.style.visibility = '';
      letterState = null;
      st.btn.focus({ preventScroll: true });
      if (boxItem && st.btn.closest('.keepsake') && !boxItem.el.matches(':hover')) openBox(false);
    }
    if (!reduced && panel.animate) {
      var a = panel.animate(
        [{ transform: 'none', opacity: 1 }, { transform: fromCardTransform(st.btn, panel), opacity: 0.2 }],
        { duration: 360, easing: 'cubic-bezier(.5,0,.75,.3)', fill: 'forwards' }
      );
      a.onfinish = function () { done(); a.cancel(); };
    } else done();
  }

  function letterViewKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeLetter(); }
    else if (e.key === 'Tab') {
      // only two stops in here: the letter (so it can be scrolled) and close
      e.preventDefault();
      (document.activeElement === lvClose ? lvLetter : lvClose).focus({ preventScroll: true });
    }
  }

  // ---------- boot ----------

  function ready() {
    stage = document.getElementById('stage');
    world = document.getElementById('world');
    hint = document.getElementById('hint');
    viewer = document.getElementById('viewer');
    vCard = document.getElementById('viewer-card');
    vPhoto = document.getElementById('viewer-photo');
    vImg = document.getElementById('viewer-img');
    vTitle = document.getElementById('viewer-title');
    vCount = document.getElementById('viewer-count');
    vPrev = document.getElementById('viewer-prev');
    vNext = document.getElementById('viewer-next');
    vBanner = document.getElementById('viewer-banner');
    vClose = viewer.querySelector('.viewer-close');
    vGridBtn = document.getElementById('viewer-grid');
    vSheet = document.getElementById('viewer-sheet');
    vSheetTitle = document.getElementById('sheet-title');
    vSheetGrid = document.getElementById('sheet-grid');
    recenter = document.getElementById('zoom-fit');
    lv = document.getElementById('letter-view');
    lvEnv = document.getElementById('lv-env');
    lvSlip = lvEnv.querySelector('.lv-slip');
    lvLetter = document.getElementById('lv-letter');
    lvLabel = document.getElementById('lv-label');
    lvText = document.getElementById('lv-text');
    lvClose = lv.querySelector('.viewer-close');
    lv.addEventListener('click', function (e) {
      if (e.target.closest('[data-lclose]')) closeLetter();
    });

    function firstPaint() {
      mergeAdded();
      layout();
      var f = fitCam();
      cam.x = f.x; cam.y = f.y; cam.z = f.z;
      render();
    }
    // Wait briefly for what's been added from the page, so it's laid out with
    // everything else; if the database is slow, paint anyway and drop the rest
    // in when it arrives.
    if (window.JoyStore) {
      var painted = false;
      var paintOnce = function () { if (!painted) { painted = true; firstPaint(); } };
      var late = setTimeout(paintOnce, 1500);
      JoyStore.ready.then(function () { if (!painted) { clearTimeout(late); paintOnce(); } else refreshAdded(); });
    } else firstPaint();

    window.JoyDesk = {
      cards: function () { return CARDS; },
      refresh: refreshAdded,
      toast: toast,
      // glide to something just added so you can see it land
      show: function (p) {
        if (!p) return;
        glideTo({ x: p.x + p.w / 2 - window.innerWidth / 2 / cam.z, y: p.y + p.h / 2 - window.innerHeight / 2 / cam.z, z: cam.z });
      }
    };

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('click', onClick);
    stage.addEventListener('focusin', onFocusIn);
    stage.addEventListener('scroll', function () { stage.scrollLeft = stage.scrollTop = 0; });
    document.addEventListener('keydown', onKey);
    // stop Safari zooming the whole page on a pinch; the desk handles pinches itself
    ['gesturestart', 'gesturechange'].forEach(function (t) {
      document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false });
    });

    document.getElementById('zoom-in').addEventListener('click', function () { zoomGlide(1.4); });
    document.getElementById('zoom-out').addEventListener('click', function () { zoomGlide(1 / 1.4); });
    recenter.addEventListener('click', function () { glideTo(fitCam()); });

    viewer.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeViewer();
    });
    vPrev.addEventListener('click', function () { step(-1); });
    vGridBtn.addEventListener('click', function () { if (openState) setGrid(!openState.grid); });
    vSheetGrid.addEventListener('click', function (e) {
      if (e.target.closest('.sheet-add')) return;
      var t = e.target.closest('.sheet-thumb');
      if (!t || !openState) return;
      openState.i = +t.dataset.i;
      setGrid(false);
      vGridBtn.focus({ preventScroll: true });
    });
    vNext.addEventListener('click', function () { step(1); });
    vCard.addEventListener('pointerdown', onSwipeDown);
    vBanner.addEventListener('pointerdown', onBannerDown);
    vBanner.addEventListener('pointermove', onBannerMove);
    vBanner.addEventListener('pointerup', onBannerUp);
    vBanner.addEventListener('pointercancel', onBannerUp);
    vBanner.title = 'Tap to edit \u00b7 drag to move';
    if (window.JoyStore) JoyStore.ready.then(function () { if (openState && !openState.grid && !editing) renderBanner(); });
    vCard.addEventListener('pointerup', onSwipeUp);
    vCard.addEventListener('pointercancel', function () { swipe = null; });

    var pending = false;
    window.addEventListener('resize', function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        if ((window.innerHeight > window.innerWidth) !== portrait && !openState) {
          layout();                       // phone rotated: re-stack and refit
          var fc = fitCam();
          cam.x = fc.x; cam.y = fc.y; cam.z = fc.z;
        }
        small = window.innerWidth < 640;
        if (openState) showPhoto(openState.i, true);
        render();
      });
    }, { passive: true });

    setTimeout(dismissHint, 9000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
