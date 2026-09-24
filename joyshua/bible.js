/* The Bible: a leather-bound Bible on the desk, with a paper bookmark sticking
 * up out of it for every verse Josh or Joyce has saved.
 *
 * Tap it and it opens: the saved verses, newest first, on thin gilt-edged
 * pages. + Josh / + Joyce lay a slip on the page to pick a new one without
 * typing: scroll to the book, tap the chapter, and the chapter itself comes
 * up to read -- tap a verse, then another to take in the ones between. The
 * words of what's picked fill in underneath from the NIV (the translation
 * the Bible-reading plan uses), still editable before it's saved.
 *
 * The words come from bolls.life, which serves the NIV with open CORS. Only
 * reading goes there; what's saved is a row in joyshua_verses (JoyStore).
 * The desk (canvas.js) owns the Bible's place; this fills in the bookmarks and
 * owns the open book. Deleting reuses the desk's press-and-hold minus.
 */
(function () {
  'use strict';

  var NAMES = { josh: 'Josh', joyce: 'Joyce' };
  var TEXT_API = 'https://bolls.life/get-text/NIV/';
  var MAX_WORDS = 2000;       // the column's cap (joyshua_schema.sql)

  // The 66 books in order (their number is the index + 1), and how many
  // chapters each has.
  var BOOKS = [
    ['Genesis', 50], ['Exodus', 40], ['Leviticus', 27], ['Numbers', 36], ['Deuteronomy', 34],
    ['Joshua', 24], ['Judges', 21], ['Ruth', 4], ['1 Samuel', 31], ['2 Samuel', 24],
    ['1 Kings', 22], ['2 Kings', 25], ['1 Chronicles', 29], ['2 Chronicles', 36], ['Ezra', 10],
    ['Nehemiah', 13], ['Esther', 10], ['Job', 42], ['Psalms', 150], ['Proverbs', 31],
    ['Ecclesiastes', 12], ['Song of Songs', 8], ['Isaiah', 66], ['Jeremiah', 52], ['Lamentations', 5],
    ['Ezekiel', 48], ['Daniel', 12], ['Hosea', 14], ['Joel', 3], ['Amos', 9],
    ['Obadiah', 1], ['Jonah', 4], ['Micah', 7], ['Nahum', 3], ['Habakkuk', 3],
    ['Zephaniah', 3], ['Haggai', 2], ['Zechariah', 14], ['Malachi', 4],
    ['Matthew', 28], ['Mark', 16], ['Luke', 24], ['John', 21], ['Acts', 28],
    ['Romans', 16], ['1 Corinthians', 16], ['2 Corinthians', 13], ['Galatians', 6], ['Ephesians', 6],
    ['Philippians', 4], ['Colossians', 4], ['1 Thessalonians', 5], ['2 Thessalonians', 3], ['1 Timothy', 6],
    ['2 Timothy', 4], ['Titus', 3], ['Philemon', 1], ['Hebrews', 13], ['James', 5],
    ['1 Peter', 5], ['2 Peter', 3], ['1 John', 5], ['2 John', 1], ['3 John', 1],
    ['Jude', 1], ['Revelation', 22]
  ];
  var NEW_TESTAMENT = 40;     // Matthew

  var root, book, list, adders;
  var isOpen = false, openedAt = 0;
  var holdTimer = 0, holdStart = null;
  var chapters = {};          // 'book/chapter' -> Promise of [{verse, text}], cleaned

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function who(a) { return a === 'joyce' ? 'joyce' : 'josh'; }

  function verses() {
    var S = window.JoyStore;
    if (!S) return [];
    return S.added.verses
      .filter(function (v) { return !v.hidden && !S.isGone('verse:' + v.id); })
      .slice()
      .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });    // newest first
  }

  function dayOf(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.getMonth() + 1 + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(2);   // 9/2/26
  }

  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }

  function bibleEl() { return document.querySelector('.card.bible'); }

  // 'Psalm 23:1–3' (one psalm at a time, so no "s")
  function label(b, c, from, to) {
    var name = b === 19 ? 'Psalm' : BOOKS[b - 1][0];
    return name + ' ' + c + ':' + from + (to > from ? '–' + to : '');
  }

  /* ---------- reading a chapter ---------- */

  function fetchChapter(b, c) {
    var key = b + '/' + c;
    if (!chapters[key]) {
      chapters[key] = fetch(TEXT_API + b + '/' + c + '/')
        .then(function (r) { if (!r.ok) throw new Error('lookup ' + r.status); return r.json(); })
        .then(function (all) {
          if (!all || !all.length) throw new Error('empty chapter');
          return all.map(function (v) { return { verse: v.verse, text: clean(v.text) }; });
        })
        .catch(function (err) { delete chapters[key]; throw err; });
    }
    return chapters[key];
  }

  /* The NIV's poetry comes with its line breaks as <br/>, and a section
   * heading ("Doxology", "Psalm 42", "For the director of music...") sits on
   * its own line before the verse it starts. Those aren't the verse, so
   * leading lines are dropped while they look like headings: a psalm's
   * superscription, or a short line with no closing punctuation that the next
   * line doesn't carry on from (a poem's broken line runs on in lower case). */
  var SUPERSCRIPTION = /^(for the director\b|(a |an )?(psalm|song|prayer|maskil|miktam|shiggaion)\b|of (david|asaph|solomon|moses|the sons of korah)\b)/i;

  function heading(line, next) {
    if (SUPERSCRIPTION.test(line)) return true;
    return line.length < 60 && !/[.,;:!?\u2014\u2019\u201d)'"]$/.test(line) && /^[\u201c"'(A-Z]/.test(next);
  }

  function clean(text) {
    var lines = String(text).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
      .split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    while (lines.length > 1 && heading(lines[0], lines[1])) lines.shift();
    return lines.join('\n');
  }

  // The words of verses picked out of a chapter: prose runs on in one
  // paragraph, poetry keeps its lines.
  function wordsOf(picked) {
    var out = '', poem = false;
    picked.forEach(function (v, k) {
      var lined = v.text.indexOf('\n') >= 0;
      out += (k ? (poem || lined ? '\n' : ' ') : '') + v.text;
      poem = lined;
    });
    return out;
  }

  /* ---------- the Bible on the desk ----------
   * A bookmark sticks up out of the pages for each saved verse (the newest
   * seven), in the paper of whoever saved it. */
  function paint() {
    var b = bibleEl();
    if (!b) return;
    var all = verses();
    b.setAttribute('aria-label', 'The Bible, ' +
      (all.length ? all.length + (all.length === 1 ? ' verse' : ' verses') + ' saved' : 'no verses saved yet') + '. Press to open it.');
    var box = b.querySelector('.bb-marks');
    box.textContent = '';
    var shown = all.slice(0, 7);
    shown.forEach(function (v, k) {
      var r = hash(v.id);
      var m = el('span', 'bb-mark author-' + who(v.author));
      var off = shown.length > 1 ? k / (shown.length - 1) : 0.5;
      m.style.left = (14 + off * 64 + (r - 0.5) * 6).toFixed(1) + '%';
      m.style.setProperty('--lift', (26 + r * 16).toFixed(1) + 'px');
      m.style.setProperty('--lean', ((r - 0.5) * 12).toFixed(1) + 'deg');
      box.appendChild(m);
    });
  }

  /* ---------- one verse, on the page ---------- */

  function verseFor(v) {
    var a = el('article', 'verse author-' + who(v.author));
    a.dataset.id = v.id;
    a.appendChild(el('h3', 'verse-ref', v.ref));
    a.appendChild(el('p', 'verse-text', v.text));
    var foot = el('div', 'verse-foot');
    foot.appendChild(el('span', 'who-chip author-' + who(v.author), NAMES[who(v.author)]));
    foot.appendChild(el('span', 'verse-date', dayOf(v.created_at)));
    a.appendChild(foot);
    holdToDelete(a, v);
    return a;
  }

  function holdToDelete(a, v) {
    a.addEventListener('pointerdown', function (e) {
      if (!window.JoyDesk) return;
      JoyDesk.hideMinus();
      holdStart = { x: e.clientX, y: e.clientY };
      clearTimeout(holdTimer);
      holdTimer = setTimeout(function () {
        JoyDesk.showMinus(a, {
          name: v.ref,
          title: 'Take ' + v.ref + ' out of the Bible?',
          detail: 'This removes it for everyone.',
          run: function () {
            return JoyStore.remove('verse:' + v.id).then(function () { draw(); paint(); });
          }
        });
      }, JoyDesk.holdMs || 550);
    });
    a.addEventListener('pointermove', function (e) {
      if (holdStart && Math.hypot(e.clientX - holdStart.x, e.clientY - holdStart.y) > 6) clearTimeout(holdTimer);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) {
      a.addEventListener(n, function () { clearTimeout(holdTimer); holdStart = null; });
    });
  }

  /* ---------- picking a new one ----------
   * A slip laid across both pages, in three steps, each one a breadcrumb at
   * the top to step back to:
   *   the books   -- the whole Bible in order, scrolled through, Old and New
   *   a chapter   -- its numbers (skipped for a book with only one)
   *   the chapter -- to read; tap a verse to pick it, then another to take in
   *                  everything between (tap again to start over)
   * The words of what's picked fill in below. They can be edited, and once
   * they have been, picking again doesn't overwrite them. */
  function writeVerse(author) {
    var old = list.querySelector('.verse--new');
    if (old) old.remove();

    var f = el('form', 'verse verse--new author-' + author);
    var crumbs = el('nav', 'vp-crumbs');
    crumbs.setAttribute('aria-label', 'Where in the Bible');
    var pane = el('div', 'vp-pane');
    var words = el('textarea', 'verse-text verse-words');
    words.rows = 3;
    words.maxLength = MAX_WORDS;
    words.setAttribute('aria-label', 'The words');
    var note = el('p', 'verse-note');
    note.setAttribute('aria-live', 'polite');
    var foot = el('div', 'verse-foot');
    foot.appendChild(el('span', 'who-chip author-' + author, NAMES[author]));
    foot.appendChild(el('span', 'verse-date', dayOf(new Date().toISOString())));
    var add = el('button', 'verse-add');
    add.type = 'submit';
    add.disabled = true;
    add.setAttribute('aria-label', 'Keep it in the Bible');
    add.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    foot.appendChild(add);
    [crumbs, pane, words, note, foot].forEach(function (n) { f.appendChild(n); });

    var pick = { book: 0, chapter: 0, from: 0, to: 0 };
    var reading = [];         // the chapter being read
    var auto = '';            // what picking last put in the words
    var seq = 0;
    var bookScroll = 0;       // where the list of books was, to come back to

    function say(t, bad) { note.textContent = t || ''; note.classList.toggle('bad', !!bad); }
    function grow() { words.style.height = 'auto'; words.style.height = words.scrollHeight + 'px'; }
    function hand() { return words.value && words.value !== auto; }
    function ready() {
      add.disabled = !(pick.from && words.value.trim());
      words.hidden = !pick.from && !words.value;
    }

    function crumb(text, go, current) {
      var b = el('button', 'vp-crumb', text);
      b.type = 'button';
      if (current) b.setAttribute('aria-current', 'step');
      else b.addEventListener('click', go);
      crumbs.appendChild(b);
    }
    function drawCrumbs() {
      crumbs.textContent = '';
      var step = !pick.book ? 0 : !pick.chapter ? 1 : 2;
      crumb('Books', showBooks, step === 0);
      if (pick.book) crumb(BOOKS[pick.book - 1][0], BOOKS[pick.book - 1][1] > 1 ? showChapters : showBooks, step === 1 || (step === 2 && BOOKS[pick.book - 1][1] === 1));
      if (pick.chapter && BOOKS[pick.book - 1][1] > 1) crumb((pick.book === 19 ? 'Psalm ' : 'Chapter ') + pick.chapter, function () {}, true);
    }

    function showBooks() {
      pick = { book: 0, chapter: 0, from: 0, to: 0 };
      drawCrumbs();
      pane.className = 'vp-pane vp-pane--books';
      pane.textContent = '';
      [['Old Testament', 0, NEW_TESTAMENT - 1], ['New Testament', NEW_TESTAMENT - 1, BOOKS.length]].forEach(function (part) {
        pane.appendChild(el('h4', 'vp-part', part[0]));
        var grid = el('div', 'vp-books');
        BOOKS.slice(part[1], part[2]).forEach(function (bk, k) {
          var n = part[1] + k + 1;
          var b = el('button', 'vp-book', bk[0]);
          b.type = 'button';
          b.addEventListener('click', function () {
            bookScroll = pane.scrollTop;
            pick.book = n;
            if (bk[1] === 1) { pick.chapter = 1; showChapter(); } else showChapters();
          });
          grid.appendChild(b);
        });
        pane.appendChild(grid);
      });
      pane.scrollTop = bookScroll;
      say(pick.from ? '' : 'Pick a book.');
      ready();
    }

    function showChapters() {
      pick.chapter = pick.from = pick.to = 0;
      drawCrumbs();
      pane.className = 'vp-pane vp-pane--chapters';
      pane.textContent = '';
      var grid = el('div', 'vp-nums');
      for (var c = 1; c <= BOOKS[pick.book - 1][1]; c++) {
        (function (c) {
          var b = el('button', 'vp-num', String(c));
          b.type = 'button';
          b.setAttribute('aria-label', (pick.book === 19 ? 'Psalm ' : 'Chapter ') + c);
          b.addEventListener('click', function () { pick.chapter = c; showChapter(); });
          grid.appendChild(b);
        })(c);
      }
      pane.appendChild(grid);
      pane.scrollTop = 0;
      say(pick.book === 19 ? 'Which psalm?' : 'Which chapter?');
      ready();
    }

    function showChapter() {
      pick.from = pick.to = 0;
      drawCrumbs();
      pane.className = 'vp-pane vp-pane--read';
      pane.textContent = '';
      pane.scrollTop = 0;
      reading = [];
      var mine = ++seq;
      say('Opening ' + (pick.book === 19 ? 'Psalm ' + pick.chapter : BOOKS[pick.book - 1][0] + ' ' + pick.chapter) + '…');
      ready();
      fetchChapter(pick.book, pick.chapter).then(function (all) {
        if (mine !== seq) return;
        reading = all;
        all.forEach(function (v) {
          var b = el('button', 'vp-verse');
          b.type = 'button';
          b.dataset.v = v.verse;
          b.appendChild(el('sup', 'vp-vn', String(v.verse)));
          b.appendChild(document.createTextNode(v.text));
          b.addEventListener('click', function () { tap(v.verse); });
          pane.appendChild(b);
        });
        say('Tap a verse — then another to take in the ones between.');
      }, function () {
        if (mine !== seq) return;
        say('Couldn’t open that chapter. Check the connection and try again.', true);
      });
    }

    function tap(n) {
      if (!pick.from) pick.from = pick.to = n;
      else if (pick.from === pick.to && n !== pick.from) { pick.to = Math.max(n, pick.from); pick.from = Math.min(n, pick.from); }
      else if (pick.from === pick.to) pick.from = pick.to = 0;           // the same one again: none
      else pick.from = pick.to = n;                                     // a range already: start over
      pane.querySelectorAll('.vp-verse').forEach(function (b) {
        var v = +b.dataset.v;
        b.classList.toggle('on', !!pick.from && v >= pick.from && v <= pick.to);
        b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false');
      });
      if (!pick.from) {
        if (!hand()) words.value = auto = '';
        say('Tap a verse — then another to take in the ones between.');
      } else {
        var t = wordsOf(reading.filter(function (v) { return v.verse >= pick.from && v.verse <= pick.to; }));
        if (t.length > MAX_WORDS) say(label(pick.book, pick.chapter, pick.from, pick.to) + ' is too long to keep — pick fewer verses.', true);
        else {
          if (!hand()) { words.value = auto = t; }
          say(label(pick.book, pick.chapter, pick.from, pick.to) + ' · NIV');
        }
      }
      grow();
      ready();
    }

    words.addEventListener('input', function () { grow(); ready(); });

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = words.value.trim();
      if (!pick.from || !text || text.length > MAX_WORDS) return;
      add.disabled = words.disabled = true;
      JoyStore.addVerse(label(pick.book, pick.chapter, pick.from, pick.to), text, author).then(function () { draw(); paint(); }, function (err) {
        add.disabled = words.disabled = false;
        if (window.JoyDesk) JoyDesk.toast(err.message, true);
      });
    });

    list.insertBefore(f, list.firstChild);
    showBooks();
    var first = pane.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }

  /* ---------- the open book ---------- */

  function draw() {
    if (!isOpen) return;
    var all = verses();
    var draft = list.querySelector('.verse--new');
    if (draft && draft.querySelector('.verse-words').disabled) draft = null;
    list.textContent = '';
    if (draft) list.appendChild(draft);
    all.forEach(function (v) { list.appendChild(verseFor(v)); });
    root.querySelector('.bv-count').textContent = all.length ? all.length + (all.length === 1 ? ' verse' : ' verses') : '';
    root.classList.toggle('empty', !all.length && !draft);
    if (!root.contains(document.activeElement)) root.querySelector('.bv-close').focus({ preventScroll: true });
  }

  // The book opens out of wherever the Bible is on screen, and goes back there:
  // --fx/--fy take the top middle of the book to the middle of the Bible. It's
  // scaled about its top middle, so only its translate has to be undone to
  // find where it really sits.
  function aim() {
    var b = bibleEl();
    var r = b && b.getBoundingClientRect();
    if (!r || !r.width || r.bottom < 0 || r.top > window.innerHeight) {
      book.style.setProperty('--fx', '0px');
      book.style.setProperty('--fy', '40px');
      return;
    }
    var f = book.getBoundingClientRect();
    var t = (getComputedStyle(book).translate || '').split(' ');
    var x = f.left + f.width / 2 - (parseFloat(t[0]) || 0), y = f.top - (parseFloat(t[1]) || 0);
    book.style.setProperty('--fx', ((r.left + r.width / 2) - x).toFixed(0) + 'px');
    book.style.setProperty('--fy', ((r.top + r.height / 2) - y).toFixed(0) + 'px');
  }

  function open(opts) {
    opts = opts || {};
    if (!root) return;
    if (window.JoyDesk) JoyDesk.hideMinus();
    isOpen = true;
    openedAt = Date.now();
    root.hidden = false;
    root.classList.remove('closing');
    list.textContent = '';
    draw();
    root.querySelector('.bv-sheet').scrollTop = 0;
    aim();
    void root.offsetWidth;
    root.classList.add('open');
    if (opts.write) { writeVerse(opts.write); root.classList.remove('empty'); }
    else root.querySelector('.bv-close').focus({ preventScroll: true });
  }

  function close(fromKey) {
    if (!isOpen) return;
    isOpen = false;
    if (window.JoyDesk) JoyDesk.hideMinus();
    aim();
    root.classList.remove('open');
    root.classList.add('closing');
    setTimeout(function () { if (!isOpen) { root.hidden = true; root.classList.remove('closing'); list.textContent = ''; } }, 300);
    var b = bibleEl();
    if (fromKey && b) b.focus({ preventScroll: true });
    else if (root.contains(document.activeElement)) document.activeElement.blur();
  }

  function build() {
    root = el('div', 'bible-view');
    root.id = 'bible-view';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'bv-title');
    root.innerHTML =
      '<div class="bv-scrim" data-bvclose></div>' +
      '<div class="bv-sheet" data-bvclose>' +
        '<div class="bv-book">' +
          '<span class="bv-ribbon" aria-hidden="true"></span>' +
          '<div class="bv-pages">' +
            '<header class="bv-head">' +
              '<h2 class="bv-title" id="bv-title">Verses we love</h2>' +
              '<span class="bv-count"></span>' +
            '</header>' +
            '<p class="bv-empty">Nothing kept yet. Press <b>+ Josh</b> or <b>+ Joyce</b>, find the verse, and tap it.</p>' +
            '<div class="bv-list"></div>' +
          '</div>' +
        '</div>' +
        '<div class="bv-adders">' +
          '<button class="adder adder--josh" type="button" data-verse-add="josh"><span aria-hidden="true">+</span> Josh</button>' +
          '<button class="adder adder--joyce" type="button" data-verse-add="joyce"><span aria-hidden="true">+</span> Joyce</button>' +
        '</div>' +
      '</div>' +
      '<button class="viewer-btn viewer-close bv-close" type="button" aria-label="Close" data-bvclose>&times;</button>';
    document.body.appendChild(root);

    book = root.querySelector('.bv-book');
    list = root.querySelector('.bv-list');
    adders = root.querySelector('.bv-adders');

    // tapping outside the book closes it (not the phone's late click from the
    // tap that opened it -- see bucket.js)
    root.addEventListener('click', function (e) {
      if (Date.now() - openedAt < 450) return;
      var t = e.target.closest('[data-bvclose], .bv-book, button');
      if (t && t.hasAttribute('data-bvclose')) close();
    });
    adders.querySelectorAll('[data-verse-add]').forEach(function (b) {
      b.addEventListener('click', function () {
        writeVerse(b.dataset.verseAdd);
        root.classList.remove('empty');
        root.querySelector('.bv-sheet').scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    root.addEventListener('keydown', function (e) { e.stopPropagation(); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !isOpen) return;
      var c = document.querySelector('.confirm');
      if (c && !c.hidden) return;
      e.preventDefault();
      e.stopPropagation();
      close(true);
    }, true);

    if (window.JoyStore) JoyStore.ready.then(paint);
    paint();
    window.JoyBible = { open: open, close: close, paint: paint };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
