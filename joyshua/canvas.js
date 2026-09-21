/* /joyshua -- an endless desk of postcards.
 *
 * The postcards are laid out once, into one rectangular "tile" of the desk, and
 * that tile repeats forever in every direction like wallpaper. The camera is just
 * an (x, y) offset; the world layer is translated by it, and on every frame only
 * the card copies that are near the screen exist in the DOM. So however far you
 * drag, the page holds a few dozen elements.
 *
 * A tile always has at least 12 slots, and with only a handful of postcards each
 * one appears more than once per tile at a different spot and angle -- otherwise
 * three cards repeating every 800px reads as a pattern, not a scatter.
 *
 * Taps are detected by hand (pointerdown + pointerup with under 6px of travel)
 * rather than with click, so that ending a drag on top of a card never opens it.
 */
(function () {
  'use strict';

  var CARDS = window.POSTCARDS || [];
  if (!CARDS.length) return;

  var SEED = 20260921;
  var TAP_SLOP = 6;           // px of travel before a press becomes a drag
  var MARGIN = 240;           // px beyond the screen edge where copies are kept alive
  var FRICTION = 0.94;        // momentum kept per 16ms frame after a flick
  var DOT = 28;               // matches .stage background-size

  var stage, world, hint;
  var cam = { x: 0, y: 0 };   // world coordinate at the top-left of the screen
  var vel = { x: 0, y: 0 };   // px per ms, for momentum after a flick
  var glide = null;           // {x, y} target the camera is easing toward
  var raf = 0, lastT = 0;

  var CW, CH, TILE_W, TILE_H, small;
  var slots = [];             // one tile's layout: {x, y, rot, card}
  var live = {};              // "tx:ty:slot" -> element currently on the desk
  var cardHTML = [];          // inner markup per postcard, built once

  // ---------- helpers ----------

  function rng(seed) {                       // mulberry32: small, seeded, good enough
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffled(arr, rand) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- layout ----------

  function layout() {
    small = window.innerWidth < 640;
    CW = small ? 272 : 340;
    CH = Math.round(CW * 0.647);            // a real postcard is 6 x 4 in... ish
    document.documentElement.style.setProperty('--cw', CW + 'px');
    document.documentElement.style.setProperty('--ch', CH + 'px');

    // Looser on a big screen; on a phone the same spacing leaves whole screens empty.
    var cellW = Math.round(CW * (small ? 1.3 : 1.42));
    var cellH = Math.round(CH * (small ? 1.5 : 1.72));
    var n = CARDS.length;
    var cells = Math.max(12, Math.ceil(n * 1.3));
    var cols = Math.ceil(Math.sqrt(cells * 1.3));
    var rows = Math.ceil(cells / cols);
    cells = cols * rows;
    TILE_W = cols * cellW;
    TILE_H = rows * cellH;

    var rand = rng(SEED);

    // A few empty cells so it reads as scattered, never so many that a card is dropped.
    var blanks = Math.min(cells - n, Math.round(cells * (small ? 0.06 : 0.12)));
    if (blanks < 0) blanks = 0;
    var blank = {};
    shuffled(range(cells), rand).slice(0, blanks).forEach(function (i) { blank[i] = true; });

    // Deal the cards round-robin in shuffled rounds, so every card shows up before
    // any repeats and the same card is never dealt twice in a row.
    var deck = [];
    var ids = range(n);
    while (deck.length < cells) {
      var round = shuffled(ids, rand);
      if (deck.length && n > 1 && round[0] === deck[deck.length - 1]) round.push(round.shift());
      deck = deck.concat(round);
    }

    slots = [];
    var d = 0;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var i = r * cols + c;
        if (blank[i]) continue;
        var stagger = (r % 2) * cellW * 0.38;
        slots.push({
          x: Math.round(c * cellW + stagger + (cellW - CW) * (0.1 + 0.8 * rand())),
          y: Math.round(r * cellH + (cellH - CH) * (0.1 + 0.8 * rand())),
          rot: +((rand() * 2 - 1) * 7).toFixed(2),
          card: deck[d++]
        });
      }
    }
  }

  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }

  function buildCardHTML() {
    cardHTML = CARDS.map(function (c) {
      var cover = c.photos[0];
      var stamp = c.photos[1] || cover;
      return '' +
        '<span class="card-body">' +
          '<span class="card-front"><img src="' + esc(cover.src) + '" alt="" draggable="false" decoding="async"></span>' +
          '<span class="card-back">' +
            '<span class="stamp"><img src="' + esc(stamp.src) + '" alt="" draggable="false" decoding="async"></span>' +
            '<svg class="postmark" viewBox="0 0 64 64" aria-hidden="true">' +
              '<circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
              '<circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" stroke-width="1.1"/>' +
              '<text font-size="6.2" letter-spacing="0.6"><textPath href="#pm-arc" startOffset="50%" text-anchor="middle">' + esc(c.place) + '</textPath></text>' +
              '<text x="32" y="34.5" font-size="6.4" text-anchor="middle">' + esc(c.date) + '</text>' +
              '<path d="M-6 22 q-6 -4 -12 0 t-12 0 t-12 0 M-6 32 q-6 -4 -12 0 t-12 0 t-12 0 M-6 42 q-6 -4 -12 0 t-12 0 t-12 0" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
            '</svg>' +
            '<span class="card-title">' + esc(c.title) + '</span>' +
            '<span class="card-caption">' + esc(c.caption) + '</span>' +
          '</span>' +
        '</span>';
    });
  }

  // ---------- rendering ----------

  function render() {
    world.style.transform = 'translate3d(' + (-cam.x) + 'px,' + (-cam.y) + 'px,0)';
    stage.style.backgroundPosition = (-cam.x % DOT) + 'px ' + (-cam.y % DOT) + 'px';

    var vw = window.innerWidth, vh = window.innerHeight;
    var x0 = cam.x - MARGIN, x1 = cam.x + vw + MARGIN;
    var y0 = cam.y - MARGIN, y1 = cam.y + vh + MARGIN;
    // A slot can hang past its tile's right/bottom edge (stagger + card size), so
    // start one tile early.
    var tx0 = Math.floor(x0 / TILE_W) - 1, tx1 = Math.floor(x1 / TILE_W);
    var ty0 = Math.floor(y0 / TILE_H) - 1, ty1 = Math.floor(y1 / TILE_H);

    var want = {};
    for (var ty = ty0; ty <= ty1; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) {
        for (var s = 0; s < slots.length; s++) {
          var sl = slots[s];
          var x = tx * TILE_W + sl.x, y = ty * TILE_H + sl.y;
          if (x + CW < x0 || x > x1 || y + CH < y0 || y > y1) continue;
          var key = tx + ':' + ty + ':' + s;
          want[key] = true;
          if (!live[key]) live[key] = place(sl, x, y);
        }
      }
    }
    for (var k in live) {
      if (!want[k] && live[k] !== (openState && openState.btn)) {
        world.removeChild(live[k]);
        delete live[k];
      }
    }
  }

  function place(sl, x, y) {
    var c = CARDS[sl.card];
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'card';
    b.dataset.card = sl.card;
    b.dataset.rot = sl.rot;
    b.setAttribute('aria-label', c.title + ' postcard, ' + c.photos.length + (c.photos.length === 1 ? ' photo' : ' photos'));
    b.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + sl.rot + 'deg)';
    b.innerHTML = cardHTML[sl.card];
    world.appendChild(b);
    return b;
  }

  function clearDesk() {
    for (var k in live) world.removeChild(live[k]);
    live = {};
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
      var ease = 1 - Math.pow(0.82, dt / 16);
      cam.x += (glide.x - cam.x) * ease;
      cam.y += (glide.y - cam.y) * ease;
      if (Math.abs(glide.x - cam.x) < 0.5 && Math.abs(glide.y - cam.y) < 0.5) {
        cam.x = glide.x; cam.y = glide.y; glide = null;
      } else moving = true;
    } else if (!drag && (vel.x || vel.y)) {
      cam.x -= vel.x * dt;
      cam.y -= vel.y * dt;
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

  function glideBy(dx, dy) {
    var from = glide || cam;
    glide = { x: from.x + dx, y: from.y + dy };
    vel.x = vel.y = 0;
    kick();
  }

  // ---------- panning ----------

  var drag = null;

  function dismissHint() {
    if (!hint || hint.classList.contains('gone')) return;
    hint.classList.add('gone');
    // once faded, take it out of the label so the label shrinks to the name
    setTimeout(function () { hint.hidden = true; }, 800);
  }

  function onDown(e) {
    if (drag || openState || (e.pointerType === 'mouse' && e.button !== 0)) return;
    stop();
    drag = {
      id: e.pointerId,
      sx: e.clientX, sy: e.clientY,
      lx: e.clientX, ly: e.clientY, lt: e.timeStamp,
      moved: false,
      card: e.target.closest ? e.target.closest('.card') : null
    };
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
    var dt = Math.max(e.timeStamp - drag.lt, 1);
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > TAP_SLOP) {
      drag.moved = true;
      stage.classList.add('dragging');
      dismissHint();
    }
    if (drag.moved) {
      cam.x -= dx; cam.y -= dy;
      // smoothed velocity, so one jittery last event doesn't decide the flick
      vel.x = vel.x * 0.6 + (dx / dt) * 0.4;
      vel.y = vel.y * 0.6 + (dy / dt) * 0.4;
      kick();
    }
    drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = e.timeStamp;
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag;
    drag = null;
    stage.classList.remove('dragging');
    try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (!d.moved) {
      vel.x = vel.y = 0;
      if (d.card && e.type === 'pointerup') openCard(d.card);
      return;
    }
    // a drag that stopped before letting go shouldn't fling
    if (e.timeStamp - d.lt > 80) vel.x = vel.y = 0;
    kick();
  }

  function onWheel(e) {
    e.preventDefault();
    if (openState || e.ctrlKey) return;     // ctrlKey = trackpad pinch; no zoom here
    var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
    var dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    stop();
    cam.x += dx; cam.y += dy;
    dismissHint();
    kick();
  }

  function onKey(e) {
    if (openState) return viewerKey(e);
    var step = e.shiftKey ? 480 : 180;
    var map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    var m = map[e.key];
    if (!m) return;
    e.preventDefault();
    dismissHint();
    glideBy(m[0], m[1]);
  }

  // Keyboard users tab onto cards that may be off screen: bring them into view.
  function onFocusIn(e) {
    var b = e.target.closest && e.target.closest('.card');
    stage.scrollLeft = stage.scrollTop = 0;   // undo the browser's own scroll-into-view
    if (!b || drag) return;
    var r = b.getBoundingClientRect();
    var pad = 40;
    if (r.left >= pad && r.top >= pad && r.right <= window.innerWidth - pad && r.bottom <= window.innerHeight - pad) return;
    glideBy(r.left + r.width / 2 - window.innerWidth / 2, r.top + r.height / 2 - window.innerHeight / 2);
  }

  // Enter / Space on a focused card. Pointer taps are handled in onUp.
  function onClick(e) {
    if (e.detail !== 0) return;
    var b = e.target.closest && e.target.closest('.card');
    if (b) openCard(b);
  }

  // ---------- the viewer ----------

  var viewer, vCard, vPhoto, vImg, vTitle, vCount, vPrev, vNext, vClose;
  var openState = null;       // {ci, i, btn}
  var swipe = null;

  function photoBox(p) {
    var vw = window.innerWidth, vh = window.innerHeight;
    var frame = small ? 20 : 28;                        // viewer-card side padding x2
    var maxW = Math.min(vw - (small ? 28 : 190), 1100) - frame;
    var maxH = vh - (small ? 200 : 140) - frame;
    var s = Math.min(maxW / p.w, maxH / p.h);
    return { w: Math.round(p.w * s), h: Math.round(p.h * s) };
  }

  function showPhoto(i, instant) {
    var c = CARDS[openState.ci];
    var n = c.photos.length;
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

    vCount.textContent = n > 1 ? (i + 1) + ' / ' + n : '';
    var many = n > 1;
    vPrev.disabled = vNext.disabled = !many;

    if (many) { var pre = new Image(); pre.src = c.photos[(i + 1) % n].src; }
  }

  // The transform that makes the (centred, upright) viewer card sit exactly where
  // the postcard is on the desk, tilted like it -- the start of the open animation
  // and the end of the close one.
  function fromCardTransform(btn) {
    var r = btn.getBoundingClientRect();              // axis-aligned box of the tilted card
    var f = vCard.getBoundingClientRect();
    var dx = (r.left + r.width / 2) - (f.left + f.width / 2);
    var dy = (r.top + r.height / 2) - (f.top + f.height / 2);
    var s = CW / f.width;
    return 'translate(' + dx + 'px,' + dy + 'px) rotate(' + (+btn.dataset.rot || 0) + 'deg) scale(' + s + ')';
  }

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function openCard(btn) {
    if (openState) return;
    stop();
    var ci = +btn.dataset.card;
    openState = { ci: ci, i: 0, btn: btn };
    vTitle.textContent = CARDS[ci].title;
    viewer.hidden = false;
    showPhoto(0, true);
    btn.style.visibility = 'hidden';
    void viewer.offsetWidth;
    viewer.classList.add('open');
    if (!reduced && vCard.animate) {
      vCard.animate(
        [{ transform: fromCardTransform(btn) }, { transform: 'none' }],
        { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' }
      );
    }
    vClose.focus({ preventScroll: true });
  }

  function closeViewer() {
    if (!openState || openState.closing) return;
    var st = openState;
    st.closing = true;
    viewer.classList.remove('open');
    function done() {
      viewer.hidden = true;
      st.btn.style.visibility = '';
      openState = null;
      vImg.removeAttribute('src');
      // the card may have been culled from the desk while we were away
      if (st.btn.isConnected) st.btn.focus({ preventScroll: true });
      render();
    }
    if (!reduced && vCard.animate && st.btn.isConnected) {
      var a = vCard.animate(
        [{ transform: 'none' }, { transform: fromCardTransform(st.btn) }],
        { duration: 340, easing: 'cubic-bezier(.5,0,.75,.3)', fill: 'forwards' }
      );
      a.onfinish = function () { done(); a.cancel(); };
    } else done();
  }

  function step(d) { if (openState) showPhoto(openState.i + d); }

  function viewerKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeViewer(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'Tab') {
      // keep focus inside the dialog
      var f = [vPrev, vNext, vClose].filter(function (b) { return !b.disabled; });
      var i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  }

  function onSwipeDown(e) {
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  function onSwipeUp(e) {
    if (!swipe || e.pointerId !== swipe.id) return;
    var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
    else if (Math.hypot(dx, dy) < TAP_SLOP && e.target.closest('.viewer-photo')) step(1);
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
    vClose = viewer.querySelector('.viewer-close');

    // the curve the postmark's town name sits on, shared by every card
    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    defs.setAttribute('width', '0'); defs.setAttribute('height', '0');
    defs.setAttribute('aria-hidden', 'true');
    defs.style.position = 'absolute';
    defs.innerHTML = '<defs><path id="pm-arc" d="M 9.5 32 A 22.5 22.5 0 0 1 54.5 32"/></defs>';
    document.body.appendChild(defs);

    buildCardHTML();
    layout();
    // start with the middle of the first tile in the middle of the screen
    cam.x = Math.round(TILE_W / 2 - window.innerWidth / 2);
    cam.y = Math.round(TILE_H / 2 - window.innerHeight / 2);
    render();

    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('lostpointercapture', onUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('click', onClick);
    stage.addEventListener('focusin', onFocusIn);
    stage.addEventListener('scroll', function () { stage.scrollLeft = stage.scrollTop = 0; });
    document.addEventListener('keydown', onKey);

    viewer.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeViewer();
    });
    vPrev.addEventListener('click', function () { step(-1); });
    vNext.addEventListener('click', function () { step(1); });
    vCard.addEventListener('pointerdown', onSwipeDown);
    vCard.addEventListener('pointerup', onSwipeUp);
    vCard.addEventListener('pointercancel', function () { swipe = null; });

    var pending = false;
    window.addEventListener('resize', function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        var wasSmall = small;
        small = window.innerWidth < 640;
        if (small !== wasSmall && !openState) { clearDesk(); layout(); }
        if (openState) showPhoto(openState.i, true);
        render();
      });
    }, { passive: true });

    setTimeout(dismissHint, 9000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
