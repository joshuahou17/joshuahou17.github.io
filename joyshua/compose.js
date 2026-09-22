/* The + Josh / + Joyce buttons: write a letter, add photos to a postcard, add
 * a new postcard, or put something in the bucket (bucket.js). Also opened by the grid's "+ add photos" tile.
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

  var root, card, body, fromTag, who = null, busy = false, lastFocus = null;
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

  // Who this is from is decided by which + was pressed and can't be switched;
  // the panel takes that person's paper colour and says so in its corner.
  function setWho(w) {
    who = w;
    root.classList.toggle('author-joyce', w === 'joyce');
    root.classList.toggle('author-none', !w);
    fromTag.textContent = w ? 'from ' + NAMES[w] : '';
    fromTag.hidden = !w;
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

  function actions(submitText, onBack) {
    var a = el('div', 'c-actions');
    var st = el('p', 'c-status');
    st.setAttribute('role', 'status');
    var back = el('button', 'c-btn c-btn--quiet', 'back');
    back.type = 'button';
    back.addEventListener('click', onBack || function () { show('choose'); });
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
    [['letter', 'A letter'], ['photos', 'Photos'], ['postcard', 'A postcard'], ['bucket', 'The bucket']].forEach(function (c) {
      var b = el('button', 'c-choice c-choice--' + c[0]);
      b.type = 'button';
      b.appendChild(el('span', 'c-choice-art'));
      b.appendChild(el('span', 'c-choice-name', c[1]));
      b.addEventListener('click', function () {
        if (c[0] !== 'bucket') { show(c[0]); return; }
        // a bucket slip is written on the spill itself, not in this panel
        var w = who;
        close();
        if (window.JoyBucket) JoyBucket.open('todo', { write: w || 'josh' });
      });
      grid.appendChild(b);
    });
    body.appendChild(grid);
  }

  function viewLetter() {
    body.appendChild(heading('Write a letter'));
    var f = el('form', 'c-form');
    var label = input('label', '', 80, '', true);
    var greeting = input('greeting', NAMES[OTHER[who]] + ',', 80);
    greeting.dataset.auto = greeting.value;
    var text = el('textarea', 'c-input c-letter');
    text.name = 'body'; text.maxLength = 8000; text.required = true; text.rows = 9;
    var closing = input('closing', 'Love,', 80);
    var name = input('name', NAMES[who], 40);
    name.dataset.auto = name.value;
    f.appendChild(field('Written on the envelope', label));
    f.appendChild(field('Opening', greeting));
    f.appendChild(field('Letter', text));
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

  function dropZone(multiple, onFiles) {
    var z = el('label', 'c-drop');
    var fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.multiple = multiple;
    z.appendChild(fileInput);
    z.appendChild(el('span', 'c-drop-text', multiple ? 'Choose photos' : 'Choose a picture'));
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

  /* Photos, in two steps. First tap the postcard they belong on (its own
   * picture, not a list of names); the same tap opens the camera roll, so on a
   * phone it's one touch from "Photos" to choosing them. Then label each one. */
  function viewPhotos(opts) {
    if (opts && opts.card != null) { photoStep(opts.card, false, opts.fromGrid); return; }
    body.appendChild(heading('Which postcard?'));
    var grid = el('div', 'c-cards');
    (window.JoyDesk ? JoyDesk.cards() : []).forEach(function (c, i) {
      if (c.gone) return;
      var b = el('button', 'c-card');
      b.type = 'button';
      var img = el('img');
      img.src = c.front.src; img.alt = ''; img.loading = 'lazy';
      b.appendChild(img);
      b.appendChild(el('span', 'c-card-name', c.title));
      b.addEventListener('click', function () {
        body.textContent = '';
        photoStep(i, true, false);
      });
      grid.appendChild(b);
    });
    body.appendChild(grid);
    var back = el('div', 'c-actions');
    back.appendChild(el('p', 'c-status'));
    var bb = el('button', 'c-btn c-btn--quiet', 'back');
    bb.type = 'button';
    bb.addEventListener('click', function () { show('choose'); });
    back.appendChild(bb);
    body.appendChild(back);
  }

  function photoStep(ci, openPicker, fromGrid) {
    var c = JoyDesk.cards()[ci];
    body.appendChild(heading('Add to ' + c.title));
    var f = el('form', 'c-form');

    var chosen = el('div', 'c-chosen');
    var thumb = el('img');
    thumb.src = c.front.src; thumb.alt = '';
    chosen.appendChild(thumb);
    chosen.appendChild(el('span', 'c-chosen-name', c.title));
    if (!fromGrid) {
      var change = el('button', 'c-link', 'change');
      change.type = 'button';
      change.addEventListener('click', function () { if (!busy) show('photos'); });
      chosen.appendChild(change);
    }
    f.appendChild(chosen);

    var list = el('div', 'c-picked');
    function redraw() {
      list.textContent = '';
      picked.forEach(function (p, i) {
        var item = el('div', 'c-pick');
        var img = el('img');
        img.src = p.url; img.alt = '';
        var lab = input('label' + i, p.label, 80, 'label');
        lab.addEventListener('input', function () { p.label = lab.value; });
        var rm = el('button', 'c-remove', '\u00d7');
        rm.type = 'button';
        rm.setAttribute('aria-label', 'Remove this photo');
        rm.addEventListener('click', function () { URL.revokeObjectURL(p.url); picked.splice(i, 1); redraw(); });
        item.appendChild(img); item.appendChild(lab); item.appendChild(rm);
        list.appendChild(item);
      });
      var go = f.querySelector('[type=submit]');
      if (go) go.textContent = picked.length ? 'Add ' + picked.length + (picked.length === 1 ? ' photo' : ' photos') : 'Add photos';
    }
    var zone = dropZone(true, function (files) {
      files.slice(0, MAX_PHOTOS - picked.length).forEach(function (file) { picked.push({ file: file, url: URL.createObjectURL(file), label: '' }); });
      if (files.length + picked.length > MAX_PHOTOS) status('Up to ' + MAX_PHOTOS + ' at a time.', true); else status('');
      redraw();
      var first = list.querySelector('.c-input');
      if (first) first.focus();
    });
    f.appendChild(zone);
    f.appendChild(list);
    f.appendChild(actions('Add photos', fromGrid ? close : function () { show('photos'); }));
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      if (!picked.length) { status('Choose at least one photo.', true); return; }
      setBusy(true);
      JoyStore.addPhotos(c.key || c.title, who,
        picked.map(function (p) { return p.file; }),
        picked.map(function (p) { return p.label; }),
        function (msg) { status(msg); })
        .then(function (rows) { clearPicked(); done(rows.length === 1 ? 'Photo added to ' + c.title : rows.length + ' photos added to ' + c.title); })
        .catch(function (err) { setBusy(false); status(err.message, true); });
    });
    body.appendChild(f);
    // still inside the tap that chose the postcard, so the browser allows it
    if (openPicker) zone.querySelector('input').click();
  }

  // From a postcard's grid, where nobody has said who they are yet.
  function viewWho(opts) {
    body.appendChild(heading('Who\u2019s adding?'));
    var row = el('div', 'c-whos');
    ['josh', 'joyce'].forEach(function (w) {
      var b = el('button', 'c-whopick c-whopick--' + w, NAMES[w]);
      b.type = 'button';
      b.addEventListener('click', function () {
        setWho(w);
        body.textContent = '';
        photoStep(opts.card, true, true);
      });
      row.appendChild(b);
    });
    body.appendChild(row);
  }

  function viewPostcard() {
    body.appendChild(heading('Add a postcard'));
    var f = el('form', 'c-form');
    var title = input('title', '', 60, '', true);
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
    ({ choose: viewChoose, letter: viewLetter, photos: viewPhotos, postcard: viewPostcard, who: viewWho })[view](opts);
    focusIn();
  }

  // Each new screen replaces the last, so focus would otherwise be left on
  // nothing (and Escape would miss the panel): put it on the first thing to use.
  function focusIn() {
    if (card.contains(document.activeElement) && document.activeElement !== document.body) return;
    var f = body.querySelector('input:not([type=file]), textarea, select, button');
    (f || card).focus({ preventScroll: true });
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
    lastFocus = document.activeElement;
    root.hidden = false;
    setWho(opts.author || null);
    void root.offsetWidth;
    root.classList.add('open');
    show(view || 'choose', opts);
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
    card.tabIndex = -1;
    var top = el('div', 'c-top');
    fromTag = el('span', 'c-from');
    var x = el('button', 'c-close', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', close);
    top.appendChild(fromTag);
    top.appendChild(x);
    body = el('div', 'c-body');
    card.appendChild(top);
    card.appendChild(body);
    root.appendChild(scrim);
    root.appendChild(card);
    document.body.appendChild(root);

    // keys stay inside the panel: the desk and viewer ignore them while it's open
    root.addEventListener('keydown', function (e) { e.stopPropagation(); });
    // Escape closes the panel wherever focus happens to be
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || root.hidden || !root.classList.contains('open')) return;
      e.preventDefault();
      e.stopPropagation();
      close();
    }, true);

    document.querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () { open('choose', { author: b.dataset.add }); });
    });
  }

  window.JoyCompose = { open: open, close: close };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
