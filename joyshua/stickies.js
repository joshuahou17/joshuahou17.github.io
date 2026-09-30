/* Sticky notes: a few words stuck straight onto the desk for the other person.
 *
 * On the desk each sticky is a desk item (canvas.js places it, drags it, and
 * peels it off into the sticky pad when it's dropped there). This file owns:
 *  - writing one: a big blank sticky in your colour of choice; stuck on, it
 *    lands in the middle of the screen, where you were looking.
 *  - one sticky, tapped on the desk: read it big, peel it off into the pad.
 *  - the pad's board, where every sticky is kept in order: on the desk or
 *    collected, filtered by who wrote it, filed under the day it was written,
 *    newest first. Tap one that's on the desk to go to it; collect them all in
 *    one go; stick a collected one back on the desk.
 *
 * Saved through JoyStore (see supabase/functions/joyshua), so both of them see
 * the same stickies. Deleting reuses the desk's press-and-hold minus (JoyDesk).
 */
(function () {
  'use strict';

  var NAMES = { josh: 'Josh', joyce: 'Joyce' };
  var COLORS = ['yellow', 'pink', 'blue', 'green'];
  var MAX = 300;
  var COLOR_KEY = 'joyshua-sticky-color';

  var boardEl, listEl, tabDesk, tabFiled, collectBtn, addersEl, filterEl, layer;
  var open = false, showingFiled = false, filter = 'all', holdTimer = 0, holdStart = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function owner() { return window.JoyNotify && JoyNotify.owner ? JoyNotify.owner() : null; }
  function dayOf(iso) { return window.JoyDesk ? JoyDesk.dayOf(iso) : ''; }
  function toast(msg, bad) { if (window.JoyDesk) JoyDesk.toast(msg, bad); }

  function all() {
    var S = window.JoyStore;
    if (!S || !S.added.stickies) return [];
    return S.added.stickies
      .filter(function (s) { return !s.hidden && !S.isGone('sticky:' + s.id); })
      .slice()
      .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });   // newest first
  }
  function onDesk() { return all().filter(function (s) { return !s.collected_at; }); }
  function filed() { return all().filter(function (s) { return !!s.collected_at; }); }
  function byId(id) { return all().filter(function (s) { return s.id === id; })[0] || null; }

  function lastColor() {
    try { var c = localStorage.getItem(COLOR_KEY); return COLORS.indexOf(c) >= 0 ? c : 'yellow'; } catch (err) { return 'yellow'; }
  }

  // ---------- collecting ----------

  function setCollected(ids, on) {
    if (!ids.length) return Promise.resolve();
    var done = JoyStore.collectStickies(ids, on);
    sync();
    return done.then(function () {
      sync();
      toast(on ? (ids.length > 1 ? ids.length + ' collected' : 'collected') : 'back on the desk');
    }, function (err) { sync(); toast(err.message, true); });
  }

  function sync() {
    if (window.JoyDesk) JoyDesk.syncStickies();
    draw();
  }

  // ---------- one note ----------

  function iconBtn(cls, label, svg, onClick) {
    var b = el('button', 'note-btn ' + cls);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.innerHTML = svg;
    b.addEventListener('click', function (e) { e.stopPropagation(); onClick(); });
    return b;
  }

  var PEEL = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v10l-6 6H4z"/><path d="M14 20v-6h6"/></svg>';
  var BACK = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-5-5 5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>';

  function noteFor(s) {
    var n = el('article', 'note sticky--' + (s.color || 'yellow'));
    n.dataset.id = s.id;
    n.style.setProperty('--tilt', (((s.id.charCodeAt(0) + s.id.charCodeAt(5)) % 7) - 3) * 0.8 + 'deg');
    n.appendChild(el('p', 'note-text', s.text));
    var foot = el('div', 'note-foot');
    foot.appendChild(el('span', 'who-chip author-' + (s.author === 'joyce' ? 'joyce' : 'josh'), NAMES[s.author] || 'Josh'));
    foot.appendChild(el('span', 'note-date', dayOf(s.created_at)));
    n.appendChild(foot);
    if (s.collected_at) {
      n.appendChild(iconBtn('note-btn--back', 'Stick it back on the desk', BACK, function () { setCollected([s.id], false); }));
    } else {
      n.appendChild(iconBtn('note-btn--peel', 'Collect it', PEEL, function () { setCollected([s.id], true); }));
      n.tabIndex = 0;
      n.setAttribute('role', 'button');
      n.setAttribute('aria-label', 'Go to this sticky on the desk');
      n.addEventListener('click', function () { goTo(s.id); });
      n.addEventListener('keydown', function (e) { if (e.target === n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); goTo(s.id); } });
    }
    holdToDelete(n, s);
    return n;
  }

  function goTo(id) {
    if (Date.now() - goTo.heldAt < 700) return;    // that press was a hold
    closeBoard(true);
    setTimeout(function () { if (window.JoyDesk) JoyDesk.findSticky(id); }, 120);
  }
  goTo.heldAt = 0;

  function holdToDelete(card, s) {
    card.addEventListener('pointerdown', function (e) {
      if (!window.JoyDesk || e.target.closest('.note-btn')) return;
      JoyDesk.hideMinus();
      holdStart = { x: e.clientX, y: e.clientY };
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () {
        goTo.heldAt = Date.now();
        JoyDesk.showMinus(card, {
          name: 'this sticky note',
          title: 'Delete this sticky note?',
          detail: 'This removes it for everyone.',
          run: function () { return JoyStore.remove('sticky:' + s.id).then(sync); }
        });
      }, JoyDesk.holdMs || 550);
    });
    card.addEventListener('pointermove', function (e) {
      if (holdStart && Math.hypot(e.clientX - holdStart.x, e.clientY - holdStart.y) > 6) clearTimeout(holdTimer);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) {
      card.addEventListener(n, function () { clearTimeout(holdTimer); holdStart = null; });
    });
  }

  // ---------- the board ----------

  function draw() {
    if (!boardEl) return;
    var desk = onDesk(), kept = filed();
    if (!open) return;
    if (showingFiled && !kept.length) showingFiled = false;
    var me = owner();
    boardEl.querySelectorAll('[data-sticky-add]').forEach(function (b) { b.hidden = !!me && b.dataset.stickyAdd !== me; });
    tabDesk.setAttribute('aria-pressed', showingFiled ? 'false' : 'true');
    tabFiled.setAttribute('aria-pressed', showingFiled ? 'true' : 'false');
    tabDesk.querySelector('.board-count').textContent = desk.length || '';
    tabFiled.querySelector('.board-count').textContent = kept.length || '';
    tabFiled.hidden = !kept.length;
    collectBtn.hidden = showingFiled || !desk.length;

    var list = showingFiled ? kept : desk;
    // whose: only worth offering once both of them have written some
    var authors = {};
    all().forEach(function (s) { authors[s.author] = true; });
    filterEl.hidden = !(authors.josh && authors.joyce);
    if (filterEl.hidden) filter = 'all';
    filterEl.querySelectorAll('[data-filter]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.filter === filter ? 'true' : 'false'); });
    if (filter !== 'all') list = list.filter(function (s) { return s.author === filter; });

    // collected ones are filed by when they were collected, the rest by when they were written
    var when = showingFiled ? 'collected_at' : 'created_at';
    list = list.slice().sort(function (a, b) { return a[when] < b[when] ? 1 : -1; });

    listEl.textContent = '';
    if (!list.length) {
      listEl.appendChild(el('div', 'notes-empty'));
      return;
    }
    var day = null, row = null;
    list.forEach(function (s) {
      var d = dayOf(s[when]);
      if (d !== day) {
        day = d;
        listEl.appendChild(el('h3', 'notes-day', d));
        row = listEl.appendChild(el('div', 'notes-row'));
      }
      row.appendChild(noteFor(s));
    });
  }

  function openBoard() {
    closeLayer();
    open = true;
    showingFiled = false;
    boardEl.hidden = false;
    void boardEl.offsetWidth;
    boardEl.classList.add('open');
    draw();
    boardEl.querySelector('.board-close').focus({ preventScroll: true });
  }

  function closeBoard(quiet) {
    if (!open) return;
    open = false;
    boardEl.classList.remove('open');
    if (window.JoyDesk) JoyDesk.hideMinus();
    setTimeout(function () { if (!open) boardEl.hidden = true; }, 250);
    if (!quiet) { var pad = document.querySelector('.sticky-pad'); if (pad) pad.focus({ preventScroll: true }); }
  }

  // ---------- writing one, and reading one big ----------

  // One overlay for both: a big sticky in the middle of the screen.
  function showLayer(sheet) {
    layer.textContent = '';
    layer.appendChild(el('div', 'st-scrim')).dataset.stClose = '';
    layer.appendChild(sheet);
    var x = el('button', 'viewer-btn viewer-close', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.dataset.stClose = '';
    layer.appendChild(x);
    layer.hidden = false;
    void layer.offsetWidth;
    layer.classList.add('open');
  }

  function closeLayer() {
    if (!layer || layer.hidden) return;
    layer.classList.remove('open');
    setTimeout(function () { if (!layer.classList.contains('open')) layer.hidden = true; }, 220);
  }

  function write(author) {
    author = author === 'joyce' ? 'joyce' : 'josh';
    closeBoard(true);
    var color = lastColor();
    var f = el('form', 'st-sheet st-sheet--write sticky--' + color);
    var area = el('textarea', 'st-input');
    area.maxLength = MAX;
    area.rows = 5;
    area.setAttribute('aria-label', 'Sticky note');
    f.appendChild(area);
    var foot = el('div', 'st-sheet-foot');
    foot.appendChild(el('span', 'who-chip author-' + author, NAMES[author]));
    var swatches = el('div', 'st-swatches');
    swatches.setAttribute('role', 'radiogroup');
    swatches.setAttribute('aria-label', 'Colour');
    COLORS.forEach(function (c) {
      var b = el('button', 'st-swatch sticky--' + c);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', c);
      b.setAttribute('aria-checked', c === color ? 'true' : 'false');
      b.addEventListener('click', function () {
        color = c;
        f.className = 'st-sheet st-sheet--write sticky--' + c;
        swatches.querySelectorAll('.st-swatch').forEach(function (x) { x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
        try { localStorage.setItem(COLOR_KEY, c); } catch (err) { /* ignore */ }
        area.focus();
      });
      swatches.appendChild(b);
    });
    foot.appendChild(swatches);
    var go = el('button', 'st-go', 'stick it');
    go.type = 'submit';
    foot.appendChild(go);
    f.appendChild(foot);

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = area.value.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (!text) { area.focus(); return; }
      go.disabled = area.disabled = true;
      var at = window.JoyDesk ? JoyDesk.centre() : { x: 0, y: 0 };
      // a little off the exact middle, so two in a row don't sit on each other
      at.x += Math.round((Math.random() - 0.5) * 60);
      at.y += Math.round((Math.random() - 0.5) * 40);
      JoyStore.addSticky(text, color, author, at.x, at.y).then(function () {
        closeLayer();
        sync();
      }, function (err) {
        go.disabled = area.disabled = false;
        toast(err.message, true);
      });
    });
    area.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit ? f.requestSubmit() : go.click(); }
    });
    showLayer(f);
    area.focus({ preventScroll: true });
  }

  // A sticky tapped on the desk, big enough to read, with a way to peel it off.
  function show(id) {
    var s = byId(id);
    if (!s) return;
    var n = el('article', 'st-sheet sticky--' + (s.color || 'yellow'));
    n.appendChild(el('p', 'st-read', s.text));
    var foot = el('div', 'st-sheet-foot');
    foot.appendChild(el('span', 'who-chip author-' + (s.author === 'joyce' ? 'joyce' : 'josh'), NAMES[s.author] || 'Josh'));
    foot.appendChild(el('span', 'note-date', dayOf(s.created_at)));
    var peel = el('button', 'st-go', s.collected_at ? 'stick it back' : 'collect');
    peel.type = 'button';
    peel.addEventListener('click', function () {
      closeLayer();
      setCollected([s.id], !s.collected_at);
    });
    foot.appendChild(peel);
    n.appendChild(foot);
    showLayer(n);
    peel.focus({ preventScroll: true });
  }

  // ---------- setup ----------

  function build() {
    boardEl = el('div', 'board board--stickies');
    boardEl.id = 'sticky-board';
    boardEl.hidden = true;
    boardEl.setAttribute('role', 'dialog');
    boardEl.setAttribute('aria-modal', 'true');
    boardEl.setAttribute('aria-label', 'Sticky notes');
    boardEl.innerHTML =
      '<div class="board-scrim" data-board-close></div>' +
      '<div class="board-card">' +
        '<div class="board-top">' +
          '<h2 class="board-tabs">' +
            '<button class="board-tab" type="button" data-sticky-tab="desk">on the desk <span class="board-count"></span></button>' +
            '<button class="board-tab" type="button" data-sticky-tab="filed">collected <span class="board-count"></span></button>' +
          '</h2>' +
          '<div class="board-tools">' +
            '<button class="board-btn" id="sticky-collect" type="button" aria-label="Collect every sticky on the desk">' +
              '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13h4l2 3h4l2-3h4"/><path d="M4 13l2.5-7h11l2.5 7v6H4z"/><path d="M12 3v7M9.5 7.5L12 10l2.5-2.5"/></svg>' +
            '</button>' +
            '<button class="board-btn board-close" type="button" aria-label="Close" data-board-close>&times;</button>' +
          '</div>' +
        '</div>' +
        '<div class="notes-filter" role="group" aria-label="Whose">' +
          '<button type="button" class="notes-chip" data-filter="all">both</button>' +
          '<button type="button" class="notes-chip author-josh" data-filter="josh">Josh</button>' +
          '<button type="button" class="notes-chip author-joyce" data-filter="joyce">Joyce</button>' +
        '</div>' +
        '<div class="notes-list"></div>' +
        '<div class="board-adders">' +
          '<button class="adder adder--josh" type="button" data-sticky-add="josh"><span aria-hidden="true">+</span> Josh</button>' +
          '<button class="adder adder--joyce" type="button" data-sticky-add="joyce"><span aria-hidden="true">+</span> Joyce</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(boardEl);

    listEl = boardEl.querySelector('.notes-list');
    tabDesk = boardEl.querySelector('[data-sticky-tab="desk"]');
    tabFiled = boardEl.querySelector('[data-sticky-tab="filed"]');
    collectBtn = boardEl.querySelector('#sticky-collect');
    addersEl = boardEl.querySelector('.board-adders');
    filterEl = boardEl.querySelector('.notes-filter');

    boardEl.addEventListener('click', function (e) {
      if (e.target.closest('[data-board-close]')) closeBoard();
      var f = e.target.closest('[data-filter]');
      if (f) { filter = f.dataset.filter; draw(); }
    });
    listEl.addEventListener('scroll', function () { clearTimeout(holdTimer); if (window.JoyDesk) JoyDesk.hideMinus(); }, true);
    tabDesk.addEventListener('click', function () { showingFiled = false; draw(); });
    tabFiled.addEventListener('click', function () { showingFiled = true; draw(); });
    collectBtn.addEventListener('click', function () {
      var ids = onDesk().filter(function (s) { return filter === 'all' || s.author === filter; }).map(function (s) { return s.id; });
      setCollected(ids, true);
    });
    boardEl.querySelectorAll('[data-sticky-add]').forEach(function (b) {
      b.addEventListener('click', function () { write(b.dataset.stickyAdd); });
    });
    boardEl.addEventListener('keydown', function (e) { e.stopPropagation(); });

    layer = el('div', 'st-layer');
    layer.hidden = true;
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', 'Sticky note');
    layer.addEventListener('click', function (e) { if (e.target.closest('[data-st-close]')) closeLayer(); });
    layer.addEventListener('keydown', function (e) { e.stopPropagation(); });
    document.body.appendChild(layer);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (layer && !layer.hidden) { e.preventDefault(); e.stopPropagation(); closeLayer(); }
      else if (open) { e.preventDefault(); e.stopPropagation(); closeBoard(); }
    }, true);

    if (window.JoyStore) JoyStore.ready.then(draw);
    window.JoyStickies = { open: openBoard, close: closeBoard, draw: draw, show: show, write: write };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
