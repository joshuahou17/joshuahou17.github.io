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
 * Taps are detected by hand (pointerdown + pointerup with under 6px of travel and
 * only ever one finger) rather than with click, so ending a drag or a pinch on a
 * card never opens it.
 */
(function () {
  'use strict';

  var CARDS = window.POSTCARDS || [];
  if (!CARDS.length) return;

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

    placed.forEach(function (p) { world.removeChild(p.el); });
    placed = [];
    for (var i = 0; i < n; i++) {
      var c = i % cols, r = Math.floor(i / cols);
      var x = (c - (cols - 1) / 2) * cellW - CW / 2 + (rand() - 0.5) * CW * 0.16;
      var y = (r - (rows - 1) / 2) * cellH - CH / 2 + (rand() - 0.5) * CH * 0.16;
      // alternate the lean so neighbours don't tilt the same way
      var rot = (i % 2 ? 1 : -1) * (2.5 + rand() * 3.5);
      var el = makeCard(i, x, y, rot);
      world.appendChild(el);
      placed.push({ el: el, x: x, y: y, rot: rot, card: i });
    }
  }

  function makeCard(i, x, y, rot) {
    var c = CARDS[i];
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'card';
    b.dataset.card = i;
    b.dataset.rot = rot.toFixed(2);
    b.setAttribute('aria-label', c.title + ' postcard, ' + c.photos.length + (c.photos.length === 1 ? ' photo' : ' photos'));
    b.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + rot.toFixed(2) + 'deg)';
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

  // The camera that fits every postcard on screen with room to breathe.
  function fitCam() {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    placed.forEach(function (p) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + CW); y1 = Math.max(y1, p.y + CH);
    });
    var vw = window.innerWidth, vh = window.innerHeight;
    var padX = small ? 28 : 120, padY = 150;   // leaves room for the label + controls
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
    if (openState || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (pointers.size >= 2) return;
    stop();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

    if (pointers.size === 1) {
      press = { id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false,
                card: e.target.closest ? e.target.closest('.card') : null };
      last = { t: e.timeStamp };
    } else {
      // a second finger: this is a pinch now, and never a tap
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
    press = null;
    stage.classList.remove('dragging');
    if (!p || p.id !== e.pointerId) return;
    if (!p.moved) {
      vel.x = vel.y = 0;
      if (p.card && e.type === 'pointerup') openCard(p.card);
      return;
    }
    // a drag that stopped before letting go shouldn't fling
    if (e.timeStamp - last.t > 80) vel.x = vel.y = 0;
    kick();
  }

  function onWheel(e) {
    e.preventDefault();
    if (openState) return;
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
    var b = e.target.closest && e.target.closest('.card');
    if (b) openCard(b);
  }

  // ---------- the viewer ----------

  var viewer, vCard, vPhoto, vImg, vTitle, vCount, vPrev, vNext, vClose, vBanner, recenter;
  var openState = null;       // {ci, i, btn}
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
      var r = rng(SEED + i * 97);
      text.split('').forEach(function (ch) {
        var s = document.createElement('span');
        if (ch === ' ') s.className = 'gap';
        else {
          s.className = 'cut cut' + Math.floor(r() * 5);
          s.style.transform = 'rotate(' + ((r() - 0.5) * 14).toFixed(1) + 'deg)';
        }
        s.textContent = ch;
        vBanner.appendChild(s);
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

    vBanner.hidden = !p.label;
    if (p.label) setBanner(i, p.label);

    vCount.textContent = n > 1 ? (i + 1) + ' / ' + n : '';
    vPrev.disabled = vNext.disabled = n < 2;

    if (n > 1) { var pre = new Image(); pre.src = c.photos[(i + 1) % n].src; }
  }

  // The transform that makes the (centred, upright) viewer card sit exactly where
  // the postcard is on the desk, tilted like it -- the start of the open animation
  // and the end of the close one.
  function fromCardTransform(btn) {
    var r = btn.getBoundingClientRect();              // axis-aligned box of the tilted card
    var f = vCard.getBoundingClientRect();
    var dx = (r.left + r.width / 2) - (f.left + f.width / 2);
    var dy = (r.top + r.height / 2) - (f.top + f.height / 2);
    var s = CW * cam.z / f.width;
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
        [{ transform: fromCardTransform(btn), opacity: 0.4 }, { transform: 'none', opacity: 1 }],
        { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' }
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
      st.btn.focus({ preventScroll: true });
    }
    if (!reduced && vCard.animate) {
      var a = vCard.animate(
        [{ transform: 'none', opacity: 1 }, { transform: fromCardTransform(st.btn), opacity: 0.4 }],
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

  function onSwipeDown(e) { swipe = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
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
    vBanner = document.getElementById('viewer-banner');
    vClose = viewer.querySelector('.viewer-close');
    recenter = document.getElementById('zoom-fit');

    layout();
    var f = fitCam();
    cam.x = f.x; cam.y = f.y; cam.z = f.z;
    render();

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
