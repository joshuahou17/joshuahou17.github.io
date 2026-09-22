/* The + Josh / + Joyce buttons: write a letter, add photos to a postcard, or
 * add a new postcard. Also opened by the grid's "+ add photos" tile.
 *
 * Everything is saved through JoyStore; the desk (JoyDesk) is told once a save
 * has landed. The panel is tinted by who it's from -- grey for Josh, beige for
 * Joyce -- which is also the colour a new letter's envelope will be.
 */
(function () {
  'use strict';

  var NAMES = { josh: 'Josh', joyce: 'Joyce' };
  var OTHER = { josh: 'joyce', joyce: 'josh' };
  var MAX_PHOTOS = 20;

  var root, card, body, who = 'josh', busy = false, lastFocus = null;
  var picked = [];            // photos chosen but not yet uploaded: {file, url}

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function field(label, input, hint) {
    var f = el('label', 'c-field');
    f.appendChild(el('span', 'c-label', label));
    f.appendChild(input);
    if (hint) f.appendChild(el('span', 'c-hint', hint));
    return f;
  }

  function input(name, value, max, placeholder, required) {
    var i = el('input', 'c-input');
    i.name = name; i.value = value || ''; i.maxLength = max;
    if (placeholder) i.placeholder = placeholder;
    if (required) i.required = true;
    i.autocomplete = 'off';
    return i;
  }

  function setWho(w) {
    who = w;
    root.classList.toggle('author-joyce', w === 'joyce');
    root.querySelectorAll('.c-who button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.who === w ? 'true' : 'false');
    });
    // a letter that's still untouched follows the switch
    var g = body.querySelector('[name=greeting]'), n = body.querySelector('[name=name]');
    if (g && g.dataset.auto === g.value) { g.value = g.dataset.auto = NAMES[OTHER[w]] + ','; }
    if (n && n.dataset.auto === n.value) { n.value = n.dataset.auto = NAMES[w]; }
  }

  function status(msg, bad) {
    var s = body.querySelector('.c-status');
    if (!s) return;
    s.textContent = msg || '';
    s.classList.toggle('bad', !!bad);
  }

  function setBusy(on) {
    busy = on;
    root.classList.toggle('busy', on);
    body.querySelectorAll('input, textarea, select, button').forEach(function (x) { x.disabled = on; });
  }

  function heading(text) {
    var h = el('h2', 'c-title', text);
    h.id = 'compose-title';
    return h;
  }

  function actions(submitText) {
    var a = el('div', 'c-actions');
    var st = el('p', 'c-status');
    st.setAttribute('role', 'status');
    var back = el('button', 'c-btn c-btn--quiet', 'back');
    back.type = 'button';
    back.addEventListener('click', function () { show('choose'); });
    var go = el('button', 'c-btn', submitText);
    go.type = 'submit';
    a.appendChild(st);
    a.appendChild(back);
    a.appendChild(go);
    return a;
  }

  // ---------- the views ----------

  function viewChoose() {
    body.appendChild(heading('Add something'));
    var grid = el('div', 'c-choices');
    [['letter', 'A letter', 'in an envelope on the desk'],
     ['photos', 'Photos', 'onto one of the postcards'],
     ['postcard', 'A postcard', 'a new place, with its own photos']].forEach(function (c) {
      var b = el('button', 'c-choice c-choice--' + c[0]);
      b.type = 'button';
      b.appendChild(el('span', 'c-choice-art'));
      b.appendChild(el('span', 'c-choice-name', c[1]));
      b.appendChild(el('span', 'c-choice-sub', c[2]));
      b.addEventListener('click', function () { show(c[0]); });
      grid.appendChild(b);
    });
    body.appendChild(grid);
  }

  function viewLetter() {
    body.appendChild(heading('Write a letter'));
    var f = el('form', 'c-form');
    var label = input('label', '', 80, 'what it’s for, e.g. “happy birthday”', true);
    var greeting = input('greeting', NAMES[OTHER[who]] + ',', 80);
    greeting.dataset.auto = greeting.value;
    var text = el('textarea', 'c-input c-letter');
    text.name = 'body'; text.maxLength = 8000; text.required = true; text.rows = 9;
    text.placeholder = 'Dear…';
    var closing = input('closing', 'Love,', 80);
    var name = input('name', NAMES[who], 40);
    name.dataset.auto = name.value;
    f.appendChild(field('Written on the envelope', label));
    f.appendChild(field('Opening', greeting));
    f.appendChild(field('Letter', text, 'A blank line starts a new paragraph.'));
    var row = el('div', 'c-row');
    row.appendChild(field('Sign-off', closing));
    row.appendChild(field('From', name));
    f.appendChild(row);
    f.appendChild(actions('Seal it'));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      status('Sealing…');
      JoyStore.addLetter({ label: label.value, greeting: greeting.value, body: text.value, closing: closing.value, name: name.value, author: who })
        .then(function () { done('Letter added'); })
        .catch(function (err) { setBusy(false); status(err.message, true); });
    });
    body.appendChild(f);
    label.focus();
  }

  function cardOptions(select, preset) {
    var cards = window.JoyDesk ? JoyDesk.cards() : [];
    cards.forEach(function (c, i) {
      var o = el('option', null, c.title);
      o.value = i;
      if (i === preset) o.selected = true;
      select.appendChild(o);
    });
  }

  function dropZone(multiple, onFiles) {
    var z = el('label', 'c-drop');
    var fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.multiple = multiple;
    z.appendChild(fileInput);
    z.appendChild(el('span', 'c-drop-text', multiple ? 'Choose photos, or drop them here' : 'Choose the postcard picture, or drop it here'));
    fileInput.addEventListener('change', function () { onFiles(Array.prototype.slice.call(fileInput.files)); fileInput.value = ''; });
    ['dragenter', 'dragover'].forEach(function (t) {
      z.addEventListener(t, function (e) { e.preventDefault(); z.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      z.addEventListener(t, function () { z.classList.remove('over'); });
    });
    z.addEventListener('drop', function (e) {
      e.preventDefault();
      onFiles(Array.prototype.slice.call(e.dataTransfer.files || []));
    });
    return z;
  }

  function clearPicked() {
    picked.forEach(function (p) { URL.revokeObjectURL(p.url); });
    picked = [];
  }

  function viewPhotos(opts) {
    body.appendChild(heading('Add photos'));
    var f = el('form', 'c-form');
    var select = el('select', 'c-input');
    select.name = 'card';
    cardOptions(select, opts && opts.card != null ? opts.card : 0);
    f.appendChild(field('Which postcard?', select));

    var list = el('div', 'c-picked');
    function redraw() {
      list.textContent = '';
      picked.forEach(function (p, i) {
        var item = el('div', 'c-pick');
        var img = el('img');
        img.src = p.url; img.alt = '';
        var lab = input('label' + i, p.label, 80, 'a label for this one');
        lab.addEventListener('input', function () { p.label = lab.value; });
        var rm = el('button', 'c-remove', '×');
        rm.type = 'button';
        rm.setAttribute('aria-label', 'Remove this photo');
        rm.addEventListener('click', function () { URL.revokeObjectURL(p.url); picked.splice(i, 1); redraw(); });
        item.appendChild(img); item.appendChild(lab); item.appendChild(rm);
        list.appendChild(item);
      });
      var go = f.querySelector('[type=submit]');
      if (go) go.textContent = picked.length ? 'Add ' + picked.length + (picked.length === 1 ? ' photo' : ' photos') : 'Add photos';
    }
    f.appendChild(dropZone(true, function (files) {
      files.slice(0, MAX_PHOTOS - picked.length).forEach(function (file) { picked.push({ file: file, url: URL.createObjectURL(file), label: '' }); });
      if (files.length + picked.length > MAX_PHOTOS) status('Up to ' + MAX_PHOTOS + ' at a time.', true); else status('');
      redraw();
      var first = list.querySelector('.c-input');
      if (first) first.focus();
    }));
    f.appendChild(list);
    f.appendChild(el('p', 'c-hint c-hint--block', 'Each label becomes that photo’s banner. Location and camera details are removed before anything is saved.'));
    f.appendChild(actions('Add photos'));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      if (!picked.length) { status('Choose at least one photo.', true); return; }
      var ci = +select.value, c = JoyDesk.cards()[ci];
      setBusy(true);
      JoyStore.addPhotos(c.key || c.title, who,
        picked.map(function (p) { return p.file; }),
        picked.map(function (p) { return p.label; }),
        function (msg) { status(msg); })
        .then(function (rows) { clearPicked(); done(rows.length === 1 ? 'Photo added to ' + c.title : rows.length + ' photos added to ' + c.title); })
        .catch(function (err) { setBusy(false); status(err.message, true); });
    });
    body.appendChild(f);
  }

  function viewPostcard() {
    body.appendChild(heading('Add a postcard'));
    var f = el('form', 'c-form');
    var title = input('title', '', 60, 'the place, e.g. “Montauk”', true);
    f.appendChild(field('Label', title));
    var preview = el('div', 'c-postcard-preview');
    var file = null;
    f.appendChild(dropZone(false, function (files) {
      if (!files.length) return;
      file = files[0];
      preview.textContent = '';
      var img = el('img');
      img.src = URL.createObjectURL(file);
      img.alt = '';
      preview.appendChild(img);
      status('');
    }));
    f.appendChild(preview);
    f.appendChild(el('p', 'c-hint c-hint--block', 'Landscape pictures fit best; the desk shows it at postcard shape. Add its photos afterwards from the postcard’s grid.'));
    f.appendChild(actions('Add postcard'));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      if (!file) { status('Choose the postcard’s picture.', true); return; }
      setBusy(true);
      JoyStore.addPostcard(title.value, who, file, function (msg) { status(msg); })
        .then(function () { done('Postcard added'); })
        .catch(function (err) { setBusy(false); status(err.message, true); });
    });
    body.appendChild(f);
    title.focus();
  }

  function show(view, opts) {
    if (busy) return;
    clearPicked();
    body.textContent = '';
    ({ choose: viewChoose, letter: viewLetter, photos: viewPhotos, postcard: viewPostcard })[view](opts);
  }

  // ---------- open / close ----------

  function done(msg) {
    setBusy(false);
    close();
    if (window.JoyDesk) {
      var p = JoyDesk.refresh();
      if (p) JoyDesk.show(p);
      JoyDesk.toast(msg);
    }
  }

  function open(view, opts) {
    opts = opts || {};
    if (opts.author) who = opts.author;
    lastFocus = document.activeElement;
    root.hidden = false;
    setWho(who);
    void root.offsetWidth;
    root.classList.add('open');
    show(view || 'choose', opts);
    setWho(who);
  }

  function close() {
    if (busy) return;
    root.classList.remove('open');
    clearPicked();
    setTimeout(function () { if (!root.classList.contains('open')) root.hidden = true; }, 250);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function build() {
    root = el('div', 'compose');
    root.id = 'compose';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'compose-title');
    var scrim = el('div', 'compose-scrim');
    scrim.addEventListener('click', close);
    card = el('div', 'compose-card');
    var top = el('div', 'c-top');
    var whoRow = el('div', 'c-who');
    whoRow.appendChild(el('span', 'c-label', 'From'));
    ['josh', 'joyce'].forEach(function (w) {
      var b = el('button', 'c-who-btn c-who-btn--' + w, NAMES[w]);
      b.type = 'button';
      b.dataset.who = w;
      b.addEventListener('click', function () { setWho(w); });
      whoRow.appendChild(b);
    });
    var x = el('button', 'c-close', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    top.appendChild(whoRow);
    top.appendChild(x);
    body = el('div', 'c-body');
    card.appendChild(top);
    card.appendChild(body);
    root.appendChild(scrim);
    root.appendChild(card);
    document.body.appendChild(root);

    // keys stay inside the panel: the desk and viewer ignore them while it's open
    root.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });

    document.querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () { open('choose', { author: b.dataset.add }); });
    });
  }

  window.JoyCompose = { open: open, close: close };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
