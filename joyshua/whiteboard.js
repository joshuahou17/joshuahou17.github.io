/* The whiteboard: one board the two of them draw on, for each other.
 *
 * On the desk it's a small whiteboard (canvas.js places it) showing what's
 * on it now. Tapped, it opens big: four markers, an eraser that rubs out
 * whole strokes, undo, and a wipe for a clean board. Whose hand is drawing is
 * the chip in the corner (this device's owner if the bell is on).
 *
 * Every stroke is saved as a path on a 1000 x 750 board, so it lands in the
 * same place at every screen size. Strokes are saved a few at a time, once
 * the pen has rested (the function allows only so many saves a minute), and
 * while the board is open it checks every few seconds for what the other
 * person has drawn -- so drawing together more or less works live. Nothing is
 * ever really erased on the server; rubbed-out strokes are only marked so.
 */
(function () {
  'use strict';

  var W = 1000, H = 750;
  var INK = { black: '#23262b', red: '#d23a2f', blue: '#2459c2', green: '#2f8f4e' };
  var MARKERS = ['black', 'red', 'blue', 'green'];
  var PEN = 6, RUB = 22;                  // marker width, eraser reach (board units)
  var SAVE_AFTER = 1600;                  // ms of resting pen before saving
  var POLL = 4000;
  var BATCH = 60;                         // the function's STROKES_PER_SAVE
  var WHO_KEY = 'joyshua-wb-who';
  var NAMES = { josh: 'Josh', joyce: 'Joyce' };

  var strokes = [];                       // on the board, oldest first: {id?, author, color, size, points, pending?}
  var erasing = {};                       // ids rubbed out here, not yet saved
  var eraseQueue = [];
  var mine = [];                          // what this page drew, newest last (for undo)
  var tool = 'black', who = 'josh';
  var layer, board, cv, g, whoBtn, scale = 1, open = false;
  var live = null;                        // the stroke being drawn {stroke, id}
  var saveTimer = 0, pollTimer = 0, saving = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function owner() { return window.JoyNotify && JoyNotify.owner ? JoyNotify.owner() : null; }
  function toast(msg, bad) { if (window.JoyDesk) JoyDesk.toast(msg, bad); }

  // ---------- drawing a stroke ----------

  // Round-capped marker, smoothed through the midpoints so a quick scribble
  // doesn't come out as a polygon.
  function drawStroke(ctx, s, k) {
    var p = s.points, n = p.length / 2;
    ctx.strokeStyle = INK[s.color] || INK.black;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = s.size * k;
    if (n === 1) {
      ctx.beginPath();
      ctx.arc(p[0] * k, p[1] * k, s.size * k / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(p[0] * k, p[1] * k);
    for (var i = 1; i < n - 1; i++) {
      var mx = (p[i * 2] + p[i * 2 + 2]) / 2, my = (p[i * 2 + 1] + p[i * 2 + 3]) / 2;
      ctx.quadraticCurveTo(p[i * 2] * k, p[i * 2 + 1] * k, mx * k, my * k);
    }
    ctx.lineTo(p[n * 2 - 2] * k, p[n * 2 - 1] * k);
    ctx.stroke();
  }

  function drawAll(ctx, w, h, list) {
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var k = w / W;
    list.forEach(function (s) { drawStroke(ctx, s, k); });
  }

  function redraw() { if (g) drawAll(g, cv.width, cv.height, strokes); }

  // Anything drawn here that isn't saved yet? Then this page's copy is the
  // truest one; otherwise JoyStore's is (a notification may have refreshed it).
  function unsaved() { return strokes.some(function (s) { return !s.id; }); }

  // the little board on the desk
  function paint() {
    var c = document.querySelector('.whiteboard .wb-mini');
    if (!c || !window.JoyStore) return;
    var list = open || unsaved() || saving ? strokes : fromStore();
    drawAll(c.getContext('2d'), c.width, c.height, list);
    c.closest('.whiteboard').classList.toggle('blank', !list.length);
  }

  function fromStore() {
    return (JoyStore.added.strokes || []).filter(function (s) { return !erasing[s.id]; }).map(function (s) {
      return { id: s.id, author: s.author, color: s.color, size: s.size, points: s.points };
    });
  }

  // ---------- the pen ----------

  function boardPoint(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }

  function onDown(e) {
    if (live || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    clearTimeout(saveTimer);
    var pt = boardPoint(e);
    if (tool === 'eraser') {
      live = { id: e.pointerId, rub: true };
      rubAt(pt);
      return;
    }
    var s = { author: who, color: tool, size: PEN, points: [Math.round(pt.x), Math.round(pt.y)], pending: true };
    strokes.push(s);
    live = { id: e.pointerId, stroke: s };
    redraw();
  }

  function onMove(e) {
    if (!live || e.pointerId !== live.id) return;
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (!evs.length) evs = [e];
    evs.forEach(function (ev) {
      var pt = boardPoint(ev);
      if (live.rub) { rubAt(pt); return; }
      var p = live.stroke.points, lx = p[p.length - 2], ly = p[p.length - 1];
      if (Math.hypot(pt.x - lx, pt.y - ly) < 2 || p.length >= 3998) return;   // close enough to the last point
      p.push(Math.round(pt.x), Math.round(pt.y));
    });
    if (!live.rub) redraw();
  }

  function onUp(e) {
    if (!live || e.pointerId !== live.id) return;
    try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (live.stroke) mine.push(live.stroke);
    live = null;
    scheduleSave();
  }

  // Rub out every stroke that passes near this point.
  function rubAt(pt) {
    var hit = false;
    strokes = strokes.filter(function (s) {
      if (!near(s, pt)) return true;
      hit = true;
      forget(s);
      return false;
    });
    if (hit) redraw();
  }

  function near(s, pt) {
    var p = s.points, reach = RUB + s.size / 2;
    for (var i = 0; i < p.length; i += 2) {
      var ax = p[i], ay = p[i + 1];
      var bx = i + 2 < p.length ? p[i + 2] : ax, by = i + 2 < p.length ? p[i + 3] : ay;
      var dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      var t = len ? Math.max(0, Math.min(1, ((pt.x - ax) * dx + (pt.y - ay) * dy) / len)) : 0;
      if (Math.hypot(pt.x - (ax + t * dx), pt.y - (ay + t * dy)) <= reach) return true;
    }
    return false;
  }

  // A stroke leaves the board: if it's saved, it's queued to be rubbed out on
  // the server too; if not, it simply never gets saved.
  function forget(s) {
    if (s.id) { erasing[s.id] = true; eraseQueue.push(s.id); }
    var at = mine.indexOf(s);
    if (at >= 0) mine.splice(at, 1);
  }

  function undo() {
    var s = mine.pop();
    if (!s) return;
    var at = strokes.indexOf(s);
    if (at >= 0) strokes.splice(at, 1);
    if (s.id) { erasing[s.id] = true; eraseQueue.push(s.id); }
    redraw();
    scheduleSave();
  }

  function wipe() {
    if (!strokes.length) return;
    var ask = window.JoyDesk ? JoyDesk.confirm('Wipe the whiteboard?', 'It comes off for both of you.') : Promise.resolve(true);
    ask.then(function (yes) {
      if (!yes) return;
      flush().then(function () {
        var before = strokes;
        strokes = []; mine = [];
        redraw(); paint();
        JoyStore.eraseStrokes('all').then(function (ids) {
          ids.forEach(function (id) { erasing[id] = true; });
          syncStore();
        }, function (err) { strokes = before; redraw(); paint(); toast(err.message, true); });
      });
    });
  }

  // ---------- saving ----------

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_AFTER);
  }

  // Save what's waiting: new strokes, then rub-outs. Resolves once it's done
  // (or has failed and said so).
  function flush() {
    clearTimeout(saveTimer);
    if (saving) return saving;
    var waiting = strokes.filter(function (s) { return s.pending && !s.sending && s !== (live && live.stroke); });
    var author = waiting.length ? waiting[0].author : who;
    // one hand per save (the chip can be switched mid-drawing)
    var batch = waiting.filter(function (s) { return s.author === author; }).slice(0, BATCH);
    var rub = eraseQueue.splice(0, 500);
    if (!batch.length && !rub.length) return Promise.resolve();
    batch.forEach(function (s) { s.sending = true; });

    var steps = Promise.resolve();
    if (batch.length) {
      steps = steps.then(function () {
        return JoyStore.addStrokes(author, batch.map(function (s) { return { color: s.color, size: s.size, points: s.points }; }));
      }).then(function (rows) {
        rows.forEach(function (row, i) {
          var s = batch[i];
          s.id = row.id; s.pending = false; s.sending = false;
          // rubbed out while it was being saved: rub the saved copy out too
          if (strokes.indexOf(s) < 0) { erasing[row.id] = true; eraseQueue.push(row.id); }
        });
      }, function (err) {
        batch.forEach(function (s) { s.sending = false; });
        throw err;
      });
    }
    steps = steps.then(function () {
      if (rub.length) return JoyStore.eraseStrokes(rub);
    });
    saving = steps.then(function () {
      saving = false;
      syncStore();
      paint();
      if (eraseQueue.length || strokes.some(function (s) { return s.pending && !s.sending; })) scheduleSave();
    }, function (err) {
      saving = false;
      eraseQueue = rub.concat(eraseQueue);
      toast(err.message || 'Couldn’t save the drawing.', true);
    });
    return saving;
  }

  // keep JoyStore's copy (what the desk's little board is drawn from) current
  function syncStore() {
    if (!window.JoyStore) return;
    JoyStore.added.strokes = strokes.filter(function (s) { return s.id && !erasing[s.id]; }).map(function (s) {
      return { id: s.id, author: s.author, color: s.color, size: s.size, points: s.points };
    });
  }

  // ---------- the other person's strokes ----------

  function poll() {
    clearTimeout(pollTimer);
    if (!open) return;
    if (document.hidden || saving) { pollTimer = setTimeout(poll, POLL); return; }
    var have = {};
    strokes.forEach(function (s) { if (s.id) have[s.id] = s; });
    JoyStore.fetchStrokes(have).then(function (res) {
      if (!open) return;
      res.rows.forEach(function (r) { if (!have[r.id]) have[r.id] = { id: r.id, author: r.author, color: r.color, size: r.size, points: r.points }; });
      var saved = res.ids.filter(function (id) { return !erasing[id] && have[id]; }).map(function (id) { return have[id]; });
      var unsaved = strokes.filter(function (s) { return !s.id; });
      var before = strokes.length;
      var changed = saved.length + unsaved.length !== before ||
        saved.some(function (s, i) { return strokes[i] !== s; });
      if (changed && !live) {
        strokes = saved.concat(unsaved);
        mine = mine.filter(function (s) { return strokes.indexOf(s) >= 0; });
        redraw();
        syncStore();
      }
    }).catch(function () { /* offline for a moment: try again next time */ })
      .then(function () { if (open) pollTimer = setTimeout(poll, POLL); });
  }

  // ---------- open / close ----------

  function fit() {
    if (!board) return;
    var small = window.innerWidth < 640;
    var maxW = Math.min(window.innerWidth - (small ? 16 : 80), 1300);
    var maxH = window.innerHeight - (small ? 170 : 150);
    var w = Math.floor(Math.min(maxW, maxH * W / H));
    board.style.width = w + 'px';
    board.style.height = Math.round(w * H / W) + 'px';
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(w * H / W * dpr);
    scale = w / W;
    redraw();
  }

  function setWho(w) {
    who = w === 'joyce' ? 'joyce' : 'josh';
    whoBtn.textContent = NAMES[who];
    whoBtn.className = 'who-chip wb-who author-' + who;
    whoBtn.setAttribute('aria-label', 'Drawing as ' + NAMES[who] + '. Switch');
    try { localStorage.setItem(WHO_KEY, who); } catch (err) { /* ignore */ }
  }

  function setTool(t) {
    tool = t;
    layer.querySelectorAll('[data-tool]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tool === t ? 'true' : 'false'); });
    board.classList.toggle('rubbing', t === 'eraser');
  }

  // opts.who: whose hand ('josh' | 'joyce'), from the + panel
  function openBoard(opts) {
    if (open) return;
    open = true;
    var saved = null;
    try { saved = localStorage.getItem(WHO_KEY); } catch (err) { /* ignore */ }
    setWho((opts && opts.who) || owner() || saved || 'josh');
    // the other person can't switch to you once the bell says whose device this is
    whoBtn.disabled = !!owner() && !(opts && opts.who);
    if (!unsaved() && !saving) { strokes = fromStore(); mine = []; }
    layer.hidden = false;
    fit();
    void layer.offsetWidth;
    layer.classList.add('open');
    layer.querySelector('.wb-close').focus({ preventScroll: true });
    poll();
  }

  function closeBoard() {
    if (!open) return;
    open = false;
    clearTimeout(pollTimer);
    flush();
    paint();
    layer.classList.remove('open');
    setTimeout(function () { if (!open) layer.hidden = true; }, 250);
    var desk = document.querySelector('.card.whiteboard');
    if (desk) desk.focus({ preventScroll: true });
  }

  function build() {
    layer = el('div', 'wb-layer');
    layer.hidden = true;
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', 'The whiteboard');
    var pens = MARKERS.map(function (m) {
      return '<button type="button" class="wb-tool wb-marker wb-marker--' + m + '" data-tool="' + m + '" aria-label="' + m + ' marker"><i></i></button>';
    }).join('');
    layer.innerHTML =
      '<div class="wb-scrim"></div>' +
      '<div class="wb-stage">' +
        '<div class="wb-board"><canvas class="wb-canvas"></canvas></div>' +
        '<div class="wb-bar">' +
          '<button type="button" class="who-chip wb-who"></button>' +
          '<div class="wb-tools">' + pens +
            '<button type="button" class="wb-tool wb-eraser" data-tool="eraser" aria-label="Eraser"><i></i></button>' +
          '</div>' +
          '<div class="wb-actions">' +
            '<button type="button" class="board-btn wb-undo" aria-label="Undo">' +
              '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></button>' +
            '<button type="button" class="board-btn wb-wipe" aria-label="Wipe the board">' +
              '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<button class="viewer-btn viewer-close wb-close" type="button" aria-label="Close">&times;</button>';
    document.body.appendChild(layer);

    board = layer.querySelector('.wb-board');
    cv = layer.querySelector('.wb-canvas');
    g = cv.getContext('2d');
    whoBtn = layer.querySelector('.wb-who');

    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    layer.querySelectorAll('[data-tool]').forEach(function (b) { b.addEventListener('click', function () { setTool(b.dataset.tool); }); });
    whoBtn.addEventListener('click', function () { setWho(who === 'josh' ? 'joyce' : 'josh'); });
    layer.querySelector('.wb-undo').addEventListener('click', undo);
    layer.querySelector('.wb-wipe').addEventListener('click', wipe);
    layer.querySelector('.wb-close').addEventListener('click', closeBoard);
    layer.querySelector('.wb-scrim').addEventListener('click', closeBoard);
    layer.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !open) return;
      e.preventDefault();
      e.stopPropagation();
      closeBoard();
    }, true);
    window.addEventListener('resize', function () { if (open) fit(); }, { passive: true });
    // don't lose a drawing to a closed tab
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
    window.addEventListener('pagehide', function () { flush(); });

    setTool('black');
    if (window.JoyStore) JoyStore.ready.then(paint);
    window.JoyWhiteboard = { open: openBoard, close: closeBoard, paint: paint };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
