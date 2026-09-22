/* The bucket list: a galvanised pail on the desk, full of folded paper slips,
 * one thing to do together on each.
 *
 * Tap the pail and every slip spills out of it across the screen; tap the
 * background to put them back. A slip that's been done gets a DONE stamp with
 * the date and stays in the pail (its top shows the stamp); the "done" tab
 * spreads those out, and the arrow on one takes the stamp off again.
 *
 * The slips are rows in joyshua_topics with kind 'bucket' (the same shape as
 * the things to talk about), saved through JoyStore. The desk (canvas.js) owns
 * the pail's place; this fills it in and owns the spill. Deleting reuses the
 * desk's press-and-hold minus (JoyDesk).
 */
(function () {
  'use strict';

  var NAMES = { josh: 'Josh', joyce: 'Joyce' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var root, sheet, list, adders, tabTodo, tabDone;
  var mode = null;            // 'todo' | 'done' while the spill is open
  var openedAt = 0;
  var holdTimer = 0, holdStart = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function who(a) { return a === 'joyce' ? 'joyce' : 'josh'; }

  function slips() {
    var S = window.JoyStore;
    if (!S) return [];
    return S.added.topics.filter(function (t) {
      return t.kind === 'bucket' && !t.hidden && !S.isGone('bucket:' + t.id);
    });
  }
  function todo() {
    return slips().filter(function (t) { return !t.done_at; })
      .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });       // newest first
  }
  function done() {
    return slips().filter(function (t) { return !!t.done_at; })
      .sort(function (a, b) { return a.done_at < b.done_at ? 1 : -1; });             // most recently done first
  }

  function dayOf(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2);
  }

  // A steady number from a slip's id, so it lands at the same tilt every time.
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }

  function pailEl() { return document.querySelector('.card.pail'); }

  /* ---------- the pail on the desk ----------
   * Up to ten slips stand in it, in two rows across the opening -- the ones
   * still to do and the ones that have been done (a red stamp on their tops)
   * all together, the newest nearest the middle. */
  function paint() {
    var p = pailEl();
    if (!p) return;
    var open = todo(), fin = done();
    p.classList.toggle('empty', !open.length && !fin.length);
    p.setAttribute('aria-label', 'The bucket list, ' +
      (open.length ? open.length + (open.length === 1 ? ' thing' : ' things') + ' to do' : 'nothing to do') +
      (fin.length ? ', ' + fin.length + ' done' : '') + '. Press to spill them out.');

    var box = p.querySelector('.pl-slips');
    box.textContent = '';
    var all = slips().sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).slice(0, 10);
    // deal them out from the middle, so the newest stand in the centre
    var n = all.length, order = [];
    all.forEach(function (t, k) { order[k % 2 ? Math.floor((n - 1) / 2) - Math.ceil(k / 2) : Math.floor((n - 1) / 2) + k / 2] = t; });
    order.forEach(function (t, k) {
      if (!t) return;
      var r = hash(t.id);
      var s = el('span', 'pl-slip author-' + who(t.author) + (t.done_at ? ' pl-slip--done' : ''));
      var off = n > 1 ? k / (n - 1) - 0.5 : 0;                   // -0.5 .. 0.5 across the opening
      var back = k % 2 === 0;                                    // two rows, back and front
      // the opening is an ellipse: nearer its ends, a slip has to stand further back
      var edge = Math.abs(off) * 2;
      s.style.left = (50 + off * (back ? 56 : 64) + (r - 0.5) * 6).toFixed(1) + '%';
      s.style.setProperty('--lift', ((back ? 20 : 6) + r * 14 - edge * 10).toFixed(1) + 'px');
      s.style.setProperty('--lean', (off * 18 + (r - 0.5) * 10).toFixed(1) + 'deg');
      s.style.zIndex = back ? 1 : 2;
      if (back) s.classList.add('pl-slip--back');
      box.appendChild(s);
    });
  }

  /* ---------- one slip, spilled out ---------- */

  function slipFor(t) {
    var r = hash(t.id);
    var s = el('article', 'slip author-' + who(t.author) + (t.done_at ? ' slip--done' : ''));
    s.dataset.id = t.id;
    s.style.setProperty('--tilt', ((r - 0.5) * 9).toFixed(2) + 'deg');
    s.style.setProperty('--jy', Math.round(hash(t.id + 'y') * 22) + 'px');      // tipped out, not filed
    s.appendChild(el('p', 'slip-text', t.text));
    var foot = el('div', 'slip-foot');
    foot.appendChild(el('span', 'who-chip author-' + who(t.author), NAMES[who(t.author)]));
    foot.appendChild(el('span', 'slip-date', dayOf(t.created_at)));
    s.appendChild(foot);

    if (t.done_at) s.appendChild(stamp(t.done_at, r));

    var btn = el('button', 'slip-btn');
    btn.type = 'button';
    if (t.done_at) {
      btn.classList.add('slip-btn--back');
      btn.setAttribute('aria-label', 'Put it back in the bucket');
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/></svg>';
    } else {
      btn.setAttribute('aria-label', 'We did it');
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.2 5.3L20 6.6"/></svg>';
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setDone(t, s, !t.done_at);
    });
    s.appendChild(btn);

    holdToDelete(s, t);
    return s;
  }

  function stamp(iso, r) {
    var st = el('span', 'slip-stamp');
    st.style.setProperty('--st', (-14 + (r - 0.5) * 12).toFixed(1) + 'deg');
    st.appendChild(el('span', 'slip-stamp-word', 'done'));
    st.appendChild(el('span', 'slip-stamp-date', dayOf(iso)));
    return st;
  }

  // press and hold a slip: the desk's minus and confirm
  function holdToDelete(s, t) {
    s.addEventListener('pointerdown', function (e) {
      if (!window.JoyDesk || e.target.closest('.slip-btn')) return;
      JoyDesk.hideMinus();
      holdStart = { x: e.clientX, y: e.clientY };
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () {
        JoyDesk.showMinus(s, {
          name: 'this slip',
          title: 'Take this out of the bucket?',
          detail: 'This removes it for everyone.',
          run: function () {
            return JoyStore.remove('bucket:' + t.id).then(function () { draw(); paint(); });
          }
        });
      }, JoyDesk.holdMs || 550);
    });
    s.addEventListener('pointermove', function (e) {
      if (holdStart && Math.hypot(e.clientX - holdStart.x, e.clientY - holdStart.y) > 6) clearTimeout(holdTimer);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) {
      s.addEventListener(n, function () { clearTimeout(holdTimer); holdStart = null; });
    });
  }

  /* Done: the stamp comes down on the slip, then it leaves for the pile.
   * Put back: it leaves the pile for the pail. Shown at once, rolled back if
   * the save fails. */
  function setDone(t, s, on) {
    var was = t.done_at;
    t.done_at = on ? new Date().toISOString() : null;
    s.querySelector('.slip-btn').disabled = true;
    if (on) {
      s.appendChild(stamp(t.done_at, hash(t.id)));
      s.classList.add('stamping');
    }
    setTimeout(function () { s.classList.add('leaving'); }, on ? 650 : 0);
    setTimeout(function () { draw(); paint(); }, on ? 1050 : 380);
    JoyStore.setTopicDone(t.id, on).catch(function (err) {
      t.done_at = was;
      draw(); paint();
      if (window.JoyDesk) JoyDesk.toast(err.message, true);
    });
  }

  /* ---------- writing a new one ---------- */

  function writeSlip(author) {
    var f = el('form', 'slip slip--new author-' + author);
    f.style.setProperty('--tilt', '-1deg');
    var area = el('textarea', 'slip-input');
    area.maxLength = 280;
    area.rows = 2;
    area.setAttribute('aria-label', 'Something to do together');
    var foot = el('div', 'slip-foot');
    foot.appendChild(el('span', 'who-chip author-' + author, NAMES[author]));
    foot.appendChild(el('span', 'slip-date', dayOf(new Date().toISOString())));
    var add = el('button', 'slip-add');
    add.type = 'submit';
    add.setAttribute('aria-label', 'Put it in the bucket');
    add.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    foot.appendChild(add);
    f.appendChild(area);
    f.appendChild(foot);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = area.value.replace(/\s+/g, ' ').trim();
      if (!text) { area.focus(); return; }
      add.disabled = area.disabled = true;
      JoyStore.addTopic(text, author, 'bucket').then(function () { draw(); paint(); }, function (err) {
        add.disabled = area.disabled = false;
        if (window.JoyDesk) JoyDesk.toast(err.message, true);
      });
    });
    area.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit ? f.requestSubmit() : add.click(); }
    });
    list.insertBefore(f, list.firstChild);
    area.focus({ preventScroll: true });
  }

  /* ---------- the spill ---------- */

  // Each slip flies out from wherever the pail (or its pile) is on screen.
  function spillFrom(items) {
    var p = pailEl();
    var src = p && p.querySelector('.pl-slips');
    var r = src && src.getBoundingClientRect();
    if (!r || !r.width) r = { left: window.innerWidth / 2, top: window.innerHeight, width: 0, height: 0 };
    var ox = r.left + r.width / 2, oy = r.top + r.height / 2;
    items.forEach(function (s, k) {
      var b = s.getBoundingClientRect();
      s.style.setProperty('--fx', (ox - (b.left + b.width / 2)).toFixed(0) + 'px');
      s.style.setProperty('--fy', (oy - (b.top + b.height / 2)).toFixed(0) + 'px');
      s.style.animationDelay = Math.min(k * 40, 600) + 'ms';
      s.classList.add('spilling');
    });
  }

  function draw() {
    if (!mode) return;
    var open = todo(), fin = done();
    if (mode === 'done' && !fin.length) mode = 'todo';
    root.classList.toggle('done-mode', mode === 'done');
    tabTodo.setAttribute('aria-pressed', mode === 'todo' ? 'true' : 'false');
    tabDone.setAttribute('aria-pressed', mode === 'done' ? 'true' : 'false');
    tabDone.hidden = !fin.length;
    tabDone.querySelector('.sp-n').textContent = fin.length;
    tabTodo.querySelector('.sp-n').textContent = open.length || '';

    // keep a half-written slip across a redraw
    var draft = list.querySelector('.slip--new');
    if (draft && draft.querySelector('.slip-input').disabled) draft = null;
    list.textContent = '';
    if (draft && mode === 'todo') list.appendChild(draft);
    (mode === 'done' ? fin : open).forEach(function (t) { list.appendChild(slipFor(t)); });
    adders.hidden = mode !== 'todo';
    // the button that was pressed may have just left with its slip
    if (!root.contains(document.activeElement)) root.querySelector('.sp-close').focus({ preventScroll: true });
    return list.querySelectorAll('.slip:not(.slip--new)');
  }

  function open(which, opts) {
    opts = opts || {};
    if (!root) return;
    if (window.JoyDesk) JoyDesk.hideMinus();
    mode = which === 'done' ? 'done' : 'todo';
    openedAt = Date.now();
    root.hidden = false;
    list.textContent = '';
    var items = draw();
    void root.offsetWidth;
    root.classList.add('open');
    spillFrom(Array.prototype.slice.call(items));
    if (opts.write) writeSlip(opts.write);
    else root.querySelector('.sp-close').focus({ preventScroll: true });
  }

  function switchTo(which) {
    if (mode === which) return;
    mode = which;
    var items = draw();
    spillFrom(Array.prototype.slice.call(items));
  }

  function close() {
    if (!mode) return;
    mode = null;
    if (window.JoyDesk) JoyDesk.hideMinus();
    root.classList.remove('open');
    setTimeout(function () { if (!mode) { root.hidden = true; list.textContent = ''; } }, 280);
    var p = pailEl();
    if (p) p.focus({ preventScroll: true });
  }

  function build() {
    root = el('div', 'spill');
    root.id = 'spill';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'The bucket list');
    root.innerHTML =
      '<div class="sp-scrim" data-spclose></div>' +
      '<div class="sp-sheet" data-spclose>' +
        '<div class="sp-tabs">' +
          '<button class="sp-tab" type="button" data-tab="todo">bucket list <span class="sp-n"></span></button>' +
          '<button class="sp-tab" type="button" data-tab="done">done <span class="sp-n"></span></button>' +
        '</div>' +
        '<div class="sp-list" data-spclose></div>' +
        '<div class="sp-adders">' +
          '<button class="adder adder--josh" type="button" data-slip-add="josh"><span aria-hidden="true">+</span> Josh</button>' +
          '<button class="adder adder--joyce" type="button" data-slip-add="joyce"><span aria-hidden="true">+</span> Joyce</button>' +
        '</div>' +
      '</div>' +
      '<button class="viewer-btn viewer-close sp-close" type="button" aria-label="Close" data-spclose>&times;</button>';
    document.body.appendChild(root);

    sheet = root.querySelector('.sp-sheet');
    list = root.querySelector('.sp-list');
    adders = root.querySelector('.sp-adders');
    tabTodo = root.querySelector('[data-tab="todo"]');
    tabDone = root.querySelector('[data-tab="done"]');

    // tapping anywhere that isn't a slip (or a button) puts them all back
    // (a phone sends its click a beat after the tap that opened this, and it
    // lands on the background -- which mustn't count as putting them back)
    root.addEventListener('click', function (e) {
      if (Date.now() - openedAt < 450) return;
      var t = e.target.closest('[data-spclose], .slip, button, form');
      if (t && t.hasAttribute('data-spclose')) close();
    });
    tabTodo.addEventListener('click', function () { switchTo('todo'); });
    tabDone.addEventListener('click', function () { switchTo('done'); });
    root.querySelectorAll('[data-slip-add]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = list.querySelector('.slip--new');
        if (d) d.remove();
        writeSlip(b.dataset.slipAdd);
        sheet.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    root.addEventListener('keydown', function (e) { e.stopPropagation(); });
    // Escape puts them back wherever focus happens to be (but not while the
    // delete confirm is up -- Escape there only cancels that)
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !mode) return;
      var c = document.querySelector('.confirm');
      if (c && !c.hidden) return;
      e.preventDefault();
      e.stopPropagation();
      close();
    }, true);

    if (window.JoyStore) JoyStore.ready.then(paint);
    paint();
    window.JoyBucket = { open: open, close: close, paint: paint };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
