/* The Bible: a leather-bound Bible on the desk, with a paper bookmark sticking
 * up out of it for every verse Josh or Joyce has saved.
 *
 * Tap it and it opens: the saved verses, newest first, on thin gilt-edged
 * pages. + Josh / + Joyce start a new one -- type a reference ("ps 23:1-3",
 * "1 Cor 13:4-7") and the words fill themselves in from the NIV (the
 * translation the Bible-reading plan uses), still editable before it's saved.
 * If the lookup can't find it, the words can just be typed or pasted in.
 *
 * The words come from bolls.life, which serves the NIV with open CORS. Only
 * the lookup goes there; what's saved is a row in joyshua_verses (JoyStore).
 * The desk (canvas.js) owns the Bible's place; this fills in the bookmarks and
 * owns the open book. Deleting reuses the desk's press-and-hold minus.
 */
(function () {
  'use strict';

  var NAMES = { josh: 'Josh', joyce: 'Joyce' };
  var TEXT_API = 'https://bolls.life/get-text/NIV/';
  var MAX_WORDS = 2000;       // the column's cap (joyshua_schema.sql)

  // The 66 books in order (their number is the index + 1), each with the
  // short forms people actually type. Anything else is matched as a prefix of
  // the name, first book wins -- "rom", "matt", "rev" all just work.
  var BOOKS = [
    ['Genesis', 'gn'], ['Exodus', 'ex'], ['Leviticus', 'lv'], ['Numbers', 'nm'], ['Deuteronomy', 'dt'],
    ['Joshua', 'jos'], ['Judges', 'jdg'], ['Ruth', 'rth'], ['1 Samuel', '1sa'], ['2 Samuel', '2sa'],
    ['1 Kings', '1ki'], ['2 Kings', '2ki'], ['1 Chronicles', '1ch'], ['2 Chronicles', '2ch'], ['Ezra'],
    ['Nehemiah'], ['Esther'], ['Job'], ['Psalms', 'ps', 'psa', 'psalm', 'pss'], ['Proverbs', 'prv'],
    ['Ecclesiastes', 'eccl', 'qoh'], ['Song of Songs', 'song', 'sos', 'song of solomon', 'songs', 'canticles'], ['Isaiah', 'is'], ['Jeremiah', 'jer'], ['Lamentations'],
    ['Ezekiel', 'ezk'], ['Daniel', 'dn'], ['Hosea'], ['Joel'], ['Amos'],
    ['Obadiah'], ['Jonah'], ['Micah'], ['Nahum'], ['Habakkuk'],
    ['Zephaniah'], ['Haggai'], ['Zechariah'], ['Malachi'],
    ['Matthew', 'mt'], ['Mark', 'mk', 'mrk'], ['Luke', 'lk'], ['John', 'jn', 'jhn'], ['Acts'],
    ['Romans', 'rm'], ['1 Corinthians'], ['2 Corinthians'], ['Galatians'], ['Ephesians'],
    ['Philippians', 'php', 'phil'], ['Colossians'], ['1 Thessalonians'], ['2 Thessalonians'], ['1 Timothy'],
    ['2 Timothy'], ['Titus'], ['Philemon', 'phm', 'phlm', 'philem'], ['Hebrews'], ['James', 'jas'],
    ['1 Peter', '1pt'], ['2 Peter', '2pt'], ['1 John', '1jn'], ['2 John', '2jn'], ['3 John', '3jn'],
    ['Jude'], ['Revelation', 'rev', 'revelations']
  ];

  var ONE_CHAPTER = [31, 57, 63, 64, 65];   // Obadiah, Philemon, 2 and 3 John, Jude

  var root, book, list, adders;
  var isOpen = false, openedAt = 0;
  var holdTimer = 0, holdStart = null;
  var chapters = {};          // 'book/chapter' -> Promise of [{verse, text}]

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

  /* ---------- reading a reference ----------
   * "John 3:16", "ps 23", "1 cor 13:4-7", "Song of Songs 2.4" ->
   * {book: 43, chapter: 3, from: 16, to: 16, label: 'John 3:16'}, or null. */
  function squash(s) { return s.toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function findBook(name) {
    var q = squash(name);
    if (q.length < 2) return 0;
    for (var i = 0; i < BOOKS.length; i++) {
      for (var j = 0; j < BOOKS[i].length; j++) if (squash(BOOKS[i][j]) === q) return i + 1;
    }
    for (var k = 0; k < BOOKS.length; k++) {
      if (squash(BOOKS[k][0]).indexOf(q) === 0) return k + 1;
    }
    return 0;
  }

  function parseRef(raw) {
    var m = /^\s*((?:[1-3]\s*)?[a-z][a-z .]*?)\s*(\d{1,3})(?:\s*[:.]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?)?\s*$/i.exec(raw || '');
    if (!m) return null;
    var b = findBook(m[1]);
    if (!b) return null;
    var ch = +m[2], from = m[3] ? +m[3] : 0, to = m[4] ? +m[4] : from;
    // a book with one chapter is cited by verse alone: "Jude 24"
    if (!m[3] && ONE_CHAPTER.indexOf(b) >= 0 && ch > 1) { from = to = ch; ch = 1; }
    if (!ch || (m[3] && !from) || to < from) return null;
    var name = BOOKS[b - 1][0];
    if (b === 19) name = 'Psalm';                               // one psalm at a time
    var label = name + ' ' + ch + (from ? ':' + from + (to > from ? '–' + to : '') : '');
    return { book: b, chapter: ch, from: from, to: to, label: label };
  }

  /* ---------- looking up the words ---------- */

  function chapter(b, c) {
    var key = b + '/' + c;
    if (!chapters[key]) {
      chapters[key] = fetch(TEXT_API + b + '/' + c + '/')
        .then(function (r) { if (!r.ok) throw new Error('lookup ' + r.status); return r.json(); })
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

  // Prose verses run on in one paragraph; poetry keeps its lines.
  function lookup(ref) {
    return chapter(ref.book, ref.chapter).then(function (all) {
      var got = (all || []).filter(function (v) { return !ref.from || (v.verse >= ref.from && v.verse <= ref.to); });
      if (!got.length) throw new Error('not found');
      var out = '', poem = false;
      got.forEach(function (v, k) {
        var t = clean(v.text), lined = t.indexOf('\n') >= 0;
        out += (k ? (poem || lined ? '\n' : ' ') : '') + t;
        poem = lined;
      });
      return out;
    });
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

  /* ---------- writing a new one ----------
   * The reference fills the words in by itself (a moment after typing stops),
   * unless the words have been typed by hand -- those are never overwritten. */
  function writeVerse(author) {
    var old = list.querySelector('.verse--new');
    if (old) old.remove();

    var f = el('form', 'verse verse--new author-' + author);
    var ref = el('input', 'verse-ref verse-ref-input');
    ref.type = 'text';
    ref.maxLength = 60;
    ref.placeholder = 'John 3:16';
    ref.autocomplete = 'off';
    ref.spellcheck = false;
    ref.setAttribute('aria-label', 'Which verse');
    var words = el('textarea', 'verse-text verse-words');
    words.rows = 3;
    words.maxLength = MAX_WORDS;
    words.placeholder = 'The words fill in by themselves…';
    words.setAttribute('aria-label', 'The words');
    var note = el('p', 'verse-note');
    note.setAttribute('aria-live', 'polite');
    var foot = el('div', 'verse-foot');
    foot.appendChild(el('span', 'who-chip author-' + author, NAMES[author]));
    foot.appendChild(el('span', 'verse-date', dayOf(new Date().toISOString())));
    var add = el('button', 'verse-add');
    add.type = 'submit';
    add.setAttribute('aria-label', 'Keep it in the Bible');
    add.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    foot.appendChild(add);
    [ref, words, note, foot].forEach(function (n) { f.appendChild(n); });

    var auto = '';            // what the lookup last put in the words
    var seq = 0, timer = 0;
    function grow() { words.style.height = 'auto'; words.style.height = words.scrollHeight + 'px'; }
    function say(t, bad) { note.textContent = t; note.classList.toggle('bad', !!bad); }

    ref.addEventListener('input', function () {
      clearTimeout(timer);
      var mine = ++seq;
      var r = parseRef(ref.value);
      var hand = words.value && words.value !== auto;
      if (!r) { say(ref.value.trim() && !hand ? 'Book chapter:verse, like Romans 8:28' : ''); return; }
      if (hand) { say(r.label); return; }
      say('Looking up ' + r.label + '…');
      timer = setTimeout(function () {
        lookup(r).then(function (t) {
          if (mine !== seq || (words.value && words.value !== auto)) return;
          if (t.length > MAX_WORDS) { say(r.label + ' is too long to keep — try fewer verses.', true); return; }
          words.value = auto = t;
          grow();
          say(r.label + ' · NIV');
        }, function () {
          if (mine !== seq) return;
          say('Couldn’t find ' + r.label + '. Type the words in instead?', true);
        });
      }, 450);
    });
    words.addEventListener('input', grow);

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = parseRef(ref.value);
      var label = r ? r.label : ref.value.replace(/\s+/g, ' ').trim();
      var text = words.value.trim();
      if (!label) { ref.focus(); return; }
      if (!text) { words.focus(); return; }
      add.disabled = ref.disabled = words.disabled = true;
      JoyStore.addVerse(label, text, author).then(function () { draw(); paint(); }, function (err) {
        add.disabled = ref.disabled = words.disabled = false;
        if (window.JoyDesk) JoyDesk.toast(err.message, true);
      });
    });
    ref.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); words.value ? (f.requestSubmit ? f.requestSubmit() : add.click()) : words.focus(); }
    });

    list.insertBefore(f, list.firstChild);
    ref.focus({ preventScroll: true });
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
            '<p class="bv-empty">Nothing kept yet. Press <b>+ Josh</b> or <b>+ Joyce</b> and type a reference &mdash; the words fill in by themselves.</p>' +
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
    window.JoyBible = { open: open, close: close, paint: paint, parseRef: parseRef };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
