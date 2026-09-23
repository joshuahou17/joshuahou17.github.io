/* Things to talk about: index cards Josh and Joyce write during the week.
 *
 * A little stack sits under the joyshua logo showing the newest one; tapping it
 * opens the board. Each card carries whose it is and the day it was written, and
 * can be ticked once it's been talked about -- ticked cards leave the board for
 * a faded pile. The shuffle deals through the ones still waiting, one at a time.
 *
 * Saved through JoyStore (see supabase/functions/joyshua), so both of them see
 * the same board. Deleting reuses the desk's press-and-hold minus (JoyDesk).
 */
(function () {
  'use strict';

  var NAMES = { josh: 'Josh', joyce: 'Joyce' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var stackEl, boardEl, listEl, doneEl, doneWrap, oneEl, countEl;
  var open = false, showingDone = false, single = null, holdTimer = 0, holdStart = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Whose device this is (whoever's notifications are on here), or null for
  // no one yet -- then the board shows everybody's.
  function owner() { return window.JoyNotify && JoyNotify.owner ? JoyNotify.owner() : null; }

  function topics() {
    var S = window.JoyStore, me = owner();
    if (!S) return [];
    return S.added.topics
      .filter(function (t) { return !t.hidden && t.kind !== 'bucket' && !S.isGone('topic:' + t.id); })
      .filter(function (t) { return !me || t.author === me; })
      .slice()
      .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });   // newest first
  }

  function openOnes() { return topics().filter(function (t) { return !t.done_at; }); }
  function doneOnes() { return topics().filter(function (t) { return !!t.done_at; }); }

  function dayOf(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  // ---------- one index card ----------

  function cardFor(t, opts) {
    opts = opts || {};
    var c = el('article', 'topic author-' + (t.author === 'joyce' ? 'joyce' : 'josh') + (t.done_at ? ' topic--done' : ''));
    c.dataset.id = t.id;
    c.appendChild(el('p', 'topic-text', t.text));
    var foot = el('div', 'topic-foot');
    foot.appendChild(el('span', 'who-chip author-' + (t.author === 'joyce' ? 'joyce' : 'josh'), NAMES[t.author] || 'Josh'));
    foot.appendChild(el('span', 'topic-date', dayOf(t.created_at)));
    c.appendChild(foot);

    var tick = el('button', 'topic-tick');
    tick.type = 'button';
    tick.setAttribute('aria-pressed', t.done_at ? 'true' : 'false');
    tick.setAttribute('aria-label', t.done_at ? 'Not talked about yet' : 'Talked about');
    tick.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.2 5.3L20 6.6"/></svg>';
    tick.addEventListener('click', function (e) {
      e.stopPropagation();
      setDone(t, !t.done_at);
    });
    c.appendChild(tick);

    if (!opts.plain) holdToDelete(c, t);
    return c;
  }

  // press and hold a card: the desk's minus and confirm, on a topic
  function holdToDelete(card, t) {
    card.addEventListener('pointerdown', function (e) {
      if (!window.JoyDesk || e.target.closest('.topic-tick')) return;
      JoyDesk.hideMinus();
      holdStart = { x: e.clientX, y: e.clientY };
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () {
        JoyDesk.showMinus(card, {
          name: 'this topic',
          title: 'Delete this topic?',
          detail: 'This removes it for everyone.',
          run: function () {
            return JoyStore.remove('topic:' + t.id).then(function () { draw(); });
          }
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

  function setDone(t, done) {
    var was = t.done_at;
    t.done_at = done ? new Date().toISOString() : null;      // show it at once
    draw();
    JoyStore.setTopicDone(t.id, done).catch(function (err) {
      t.done_at = was;
      draw();
      if (window.JoyDesk) JoyDesk.toast(err.message, true);
    });
  }

  // ---------- writing a new one ----------

  function writeCard(author) {
    var c = el('form', 'topic topic--new author-' + author);
    var area = el('textarea', 'topic-input');
    area.maxLength = 280;
    area.rows = 3;
    var foot = el('div', 'topic-foot');
    foot.appendChild(el('span', 'who-chip author-' + author, NAMES[author]));
    foot.appendChild(el('span', 'topic-date', dayOf(new Date().toISOString())));
    var add = el('button', 'topic-add');
    add.type = 'submit';
    add.setAttribute('aria-label', 'Add this topic');
    add.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    foot.appendChild(add);
    c.appendChild(area);
    c.appendChild(foot);
    c.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = area.value.replace(/\s+/g, ' ').trim();
      if (!text) { area.focus(); return; }
      add.disabled = area.disabled = true;
      JoyStore.addTopic(text, author).then(function () { draw(); }, function (err) {
        add.disabled = area.disabled = false;
        if (window.JoyDesk) JoyDesk.toast(err.message, true);
      });
    });
    area.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); c.requestSubmit ? c.requestSubmit() : add.click(); }
    });
    return { card: c, area: area };
  }

  // ---------- drawing ----------

  function draw() {
    var opens = openOnes(), dones = doneOnes();

    // the stack under the logo
    stackEl.classList.toggle('empty', !opens.length);
    stackEl.querySelector('.stack-text').textContent = opens.length ? opens[0].text : '';
    stackEl.querySelector('.stack-count').textContent = opens.length || '';
    stackEl.setAttribute('aria-label', opens.length
      ? 'Things to talk about: ' + opens.length + (opens.length === 1 ? ' topic' : ' topics')
      : 'Things to talk about');

    if (!open) return;
    var me = owner();
    boardEl.querySelectorAll('[data-topic-add]').forEach(function (b) { b.hidden = !!me && b.dataset.topicAdd !== me; });
    countEl.textContent = opens.length || '';
    listEl.textContent = '';
    opens.forEach(function (t) { listEl.appendChild(cardFor(t)); });

    doneWrap.hidden = !dones.length;
    doneWrap.classList.toggle('showing', showingDone);
    doneWrap.querySelector('.done-count').textContent = dones.length;
    doneEl.textContent = '';
    if (showingDone) dones.forEach(function (t) { doneEl.appendChild(cardFor(t)); });

    if (single) {
      var still = opens.filter(function (t) { return t.id === single.id; })[0];
      if (still) showSingle(still); else nextSingle();
    }
  }

  // ---------- shuffle through the ones still waiting ----------

  function nextSingle() {
    var opens = openOnes();
    if (!opens.length) { single = null; oneEl.hidden = true; boardEl.classList.remove('one'); return; }
    var pick = opens[Math.floor(Math.random() * opens.length)];
    if (opens.length > 1 && single && pick.id === single.id) pick = opens[(opens.indexOf(pick) + 1) % opens.length];
    showSingle(pick);
  }

  function showSingle(t) {
    single = t;
    oneEl.textContent = '';
    var c = cardFor(t, { plain: true });
    c.classList.add('topic--big');
    oneEl.appendChild(c);
    oneEl.hidden = false;
    boardEl.classList.add('one');
  }

  // ---------- open / close ----------

  // opts.write ('josh' | 'joyce'): open with a blank card of theirs ready to
  // write on (the + panel's "To talk about")
  function openBoard(opts) {
    open = true;
    showingDone = false;
    single = null;
    boardEl.hidden = false;
    void boardEl.offsetWidth;
    boardEl.classList.add('open');
    draw();
    var author = opts && (opts.write === 'josh' || opts.write === 'joyce') ? opts.write : null;
    if (author) {
      var w = writeCard(author);
      listEl.insertBefore(w.card, listEl.firstChild);
      w.area.focus({ preventScroll: true });
    } else boardEl.querySelector('.board-close').focus({ preventScroll: true });
  }

  function closeBoard() {
    open = false;
    single = null;
    oneEl.hidden = true;
    boardEl.classList.remove('open', 'one');
    if (window.JoyDesk) JoyDesk.hideMinus();
    setTimeout(function () { if (!open) boardEl.hidden = true; }, 250);
    stackEl.focus({ preventScroll: true });
  }

  function build() {
    // the stack under the logo
    stackEl = el('button', 'topic-stack');
    stackEl.type = 'button';
    stackEl.id = 'topic-stack';
    stackEl.innerHTML =
      '<span class="stack-card stack-card--3"></span>' +
      '<span class="stack-card stack-card--2"></span>' +
      '<span class="stack-card stack-card--1"><span class="stack-text"></span><span class="stack-count"></span></span>';
    stackEl.addEventListener('click', openBoard);
    var mast = document.querySelector('.mast');
    (mast && mast.parentNode ? mast.parentNode : document.body).insertBefore(stackEl, mast ? mast.nextSibling : null);

    // the stack is the same size as the joyshua label above it, whatever the
    // handwriting measures once its font has loaded
    function sizeStack() {
      if (!mast) return;
      var r = mast.getBoundingClientRect();
      if (!r.width) return;
      stackEl.style.width = Math.round(r.width) + 'px';
      stackEl.style.height = Math.round(r.height) + 'px';
    }
    sizeStack();
    window.addEventListener('resize', sizeStack, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeStack);

    boardEl = el('div', 'board');
    boardEl.id = 'topic-board';
    boardEl.hidden = true;
    boardEl.setAttribute('role', 'dialog');
    boardEl.setAttribute('aria-modal', 'true');
    boardEl.setAttribute('aria-label', 'Things to talk about');
    boardEl.innerHTML =
      '<div class="board-scrim" data-board-close></div>' +
      '<div class="board-card">' +
        '<div class="board-top">' +
          '<h2 class="board-title">to talk about <span class="board-count" id="board-count"></span></h2>' +
          '<div class="board-tools">' +
            '<button class="board-btn" id="topic-shuffle" type="button" aria-label="Shuffle through the topics">' +
              '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h3.5c2 0 3.2 1 4.3 2.7l2.4 4.6c1.1 1.7 2.3 2.7 4.3 2.7H21"/><path d="M3 17h3.5c1.4 0 2.4-.5 3.3-1.4M14.2 8.4c.9-.9 1.9-1.4 3.3-1.4H21"/><path d="M18 4l3 3-3 3M18 14l3 3-3 3"/></svg>' +
            '</button>' +
            '<button class="board-btn board-close" type="button" aria-label="Close" data-board-close>&times;</button>' +
          '</div>' +
        '</div>' +
        '<div class="board-one" hidden></div>' +
        '<div class="board-list"></div>' +
        '<div class="board-adders">' +
          '<button class="adder adder--josh" type="button" data-topic-add="josh"><span aria-hidden="true">+</span> Josh</button>' +
          '<button class="adder adder--joyce" type="button" data-topic-add="joyce"><span aria-hidden="true">+</span> Joyce</button>' +
        '</div>' +
        '<div class="board-done" hidden>' +
          '<button class="done-toggle" type="button"><span class="done-count"></span> talked about</button>' +
          '<div class="done-list"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(boardEl);

    listEl = boardEl.querySelector('.board-list');
    doneEl = boardEl.querySelector('.done-list');
    doneWrap = boardEl.querySelector('.board-done');
    oneEl = boardEl.querySelector('.board-one');
    countEl = boardEl.querySelector('.board-count');

    boardEl.addEventListener('click', function (e) {
      if (e.target.closest('[data-board-close]')) closeBoard();
    });
    boardEl.querySelector('.done-toggle').addEventListener('click', function () { showingDone = !showingDone; draw(); });
    boardEl.querySelector('#topic-shuffle').addEventListener('click', function () {
      if (single) { nextSingle(); return; }
      nextSingle();
    });
    boardEl.addEventListener('keydown', function (e) { e.stopPropagation(); });
    // Escape works wherever focus happens to be (writing a card replaces the
    // element focus was on, so a listener on the board alone would miss it)
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !open) return;
      e.preventDefault();
      e.stopPropagation();
      if (single) { single = null; oneEl.hidden = true; boardEl.classList.remove('one'); }
      else closeBoard();
    }, true);
    boardEl.querySelectorAll('[data-topic-add]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (single) { single = null; oneEl.hidden = true; boardEl.classList.remove('one'); }
        var w = writeCard(b.dataset.topicAdd);
        listEl.insertBefore(w.card, listEl.firstChild);
        w.area.focus();
      });
    });

    if (window.JoyStore) JoyStore.ready.then(draw);
    draw();
    window.JoyTopics = { open: openBoard, close: closeBoard, draw: draw };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
