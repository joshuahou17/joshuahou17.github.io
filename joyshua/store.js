/* /joyshua's link to its database (Supabase project "Hou").
 *
 * The page's own content is static (postcards.js, letters.js); this loads what
 * has been added or edited on top of it and saves new changes. Reads use the
 * public anon key -- the tables are read-only to it. Every write goes through
 * the `joyshua` edge function, which validates, rate-limits and logs it (see
 * supabase/functions/joyshua/index.ts).
 *
 * If the database can't be reached the page still works as it was; only the
 * edits are missing.
 */
(function () {
  'use strict';

  var URL = 'https://iaspidhmxppsuwydmvym.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlhc3BpZGhteHBwc3V3eWRtdnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MjY5MjUsImV4cCI6MjA5MTEwMjkyNX0.1tnqoNxczpZkEUyUEdi0W1pLh8nwL7LE1Ig5PgjSU5U';
  var FN = URL + '/functions/v1/joyshua';
  var REST = URL + '/rest/v1/';
  var FILES = URL + '/storage/v1/object/public/joyshua/';

  var state = {};             // key -> value, e.g. 'label:<src>' -> {text, x, y}

  function get(table, query) {
    return fetch(REST + table + '?' + query, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
      .then(function (r) { if (!r.ok) throw new Error('read ' + r.status); return r.json(); });
  }

  function call(action, data) {
    var body = { action: action };
    for (var k in data) body[k] = data[k];
    return fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.error || 'Couldn’t save that.');
          return j;
        });
      });
  }

  var added = { postcards: [], photos: [], letters: [] };   // rows added from the page

  function soft(p) {
    return p.catch(function (err) { if (window.console) console.warn('[joyshua] couldn\u2019t load:', err.message); return []; });
  }

  var ready = Promise.all([
    soft(get('joyshua_state', 'select=key,value')),
    soft(get('joyshua_postcards', 'select=*&order=created_at')),
    soft(get('joyshua_photos', 'select=*&order=created_at')),
    soft(get('joyshua_letters', 'select=*&order=created_at'))
  ]).then(function (r) {
    r[0].forEach(function (row) { state[row.key] = row.value; });
    added.postcards = r[1]; added.photos = r[2]; added.letters = r[3];
  });

  /* A picture, ready for upload: re-drawn through a canvas at most `max` px on
   * its long side. Re-encoding is also what strips the metadata -- phones put
   * GPS in every photo, and none of it survives this. `square` makes a centre
   * crop instead (the grid's thumbnails). */
  function redraw(bitmap, max, square) {
    var w = bitmap.width, h = bitmap.height, sx = 0, sy = 0, sw = w, sh = h;
    if (square) {
      var side = Math.min(w, h);
      sx = (w - side) / 2; sy = (h - side) * 0.4; sw = sh = side;
      w = h = Math.min(max, side);
    } else {
      var k = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * k); h = Math.round(h * k);
    }
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
    return new Promise(function (res, rej) {
      c.toBlob(function (b) { b ? res({ blob: b, w: w, h: h }) : rej(new Error('Couldn\u2019t read that picture.')); }, 'image/jpeg', square ? 0.8 : 0.86);
    });
  }

  function prepare(file, max) {
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
      return Promise.reject(new Error(file.name + ' isn\u2019t a picture.'));
    }
    return createImageBitmap(file, { imageOrientation: 'from-image' })
      .catch(function () { throw new Error('This browser can\u2019t open ' + file.name + '. Try a JPEG or PNG.'); })
      .then(function (bmp) {
        return Promise.all([redraw(bmp, max, false), redraw(bmp, 360, true)])
          .then(function (out) { bmp.close && bmp.close(); return { full: out[0], thumb: out[1] }; });
      });
  }

  function put(url, blob) {
    return fetch(url, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'x-upsert': 'false' }, body: blob })
      .then(function (r) { if (!r.ok) throw new Error('Upload failed (' + r.status + ').'); });
  }

  // files -> signed slots -> uploaded; resolves to [{path, thumb, w, h}]
  function upload(files, max, onProgress) {
    var prepared = [];
    var chain = Promise.resolve();
    files.forEach(function (f, i) {
      chain = chain.then(function () {
        onProgress && onProgress('Getting photo ' + (i + 1) + ' of ' + files.length + ' ready\u2026');
        return prepare(f, max).then(function (x) { prepared.push(x); });
      });
    });
    return chain
      .then(function () { return call('sign-upload', { count: files.length }); })
      .then(function (res) {
        var up = Promise.resolve();
        res.slots.forEach(function (slot, i) {
          up = up.then(function () {
            onProgress && onProgress('Uploading ' + (i + 1) + ' of ' + files.length + '\u2026');
            return put(slot.url, prepared[i].full.blob).then(function () { return put(slot.thumbUrl, prepared[i].thumb.blob); });
          });
        });
        return up.then(function () {
          return res.slots.map(function (slot, i) {
            return { path: slot.path, thumb: slot.thumb, w: prepared[i].full.w, h: prepared[i].full.h };
          });
        });
      });
  }

  window.JoyStore = {
    ready: ready,
    fileUrl: function (path) { return FILES + path; },

    // A banner's saved words and spot, or null if it's never been edited.
    label: function (src) { return state['label:' + src] || null; },

    // Applied locally at once (so the page never waits on the network) and
    // rolled back if the save fails.
    setLabel: function (src, patch) {
      var key = 'label:' + src, before = state[key];
      var next = {};
      for (var a in before || {}) next[a] = before[a];
      for (var b in patch) next[b] = patch[b];
      state[key] = next;
      var data = { src: src };
      for (var c in patch) data[c] = patch[c];
      return call('set-label', data).then(
        function (res) { state[key] = res.value; return res.value; },
        function (err) { if (before) state[key] = before; else delete state[key]; throw err; }
      );
    },

    // Deleted from the page (for everyone)? Keys: 'card:', 'photo:', 'letter:'.
    isGone: function (key) { var v = state['gone:' + key]; return !!(v && v.gone === true); },

    remove: function (key) {
      var k = 'gone:' + key, before = state[k];
      state[k] = { gone: true };
      return call('remove', { key: key }).then(
        function (res) { state[k] = res.value; return res.value; },
        function (err) { if (before) state[k] = before; else delete state[k]; throw err; }
      );
    },

    // Is this letter in the keepsake box? (`key` is the desk key, 'letter:...')
    inBox: function (key) { var v = state['box:' + key]; return !!(v && v.in === true); },

    setBox: function (key, on) {
      var k = 'box:' + key, before = state[k];
      state[k] = { in: !!on };
      return call('set-box', { letter: key, in: !!on }).then(
        function (res) { state[k] = res.value; return res.value; },
        function (err) { if (before) state[k] = before; else delete state[k]; throw err; }
      );
    },

    // what's been added from the page (filled once `ready` resolves)
    added: added,

    addLetter: function (letter) {
      return call('add-letter', letter).then(function (r) { added.letters.push(r.letter); return r.letter; });
    },

    addPhotos: function (postcardKey, author, files, labels, onProgress) {
      return upload(files, 1400, onProgress).then(function (ups) {
        onProgress && onProgress('Saving\u2026');
        return call('add-photos', {
          postcard: postcardKey, author: author,
          photos: ups.map(function (u, i) { return { path: u.path, thumb: u.thumb, w: u.w, h: u.h, label: labels[i] || '' }; })
        });
      }).then(function (r) { added.photos = added.photos.concat(r.photos); return r.photos; });
    },

    addPostcard: function (title, author, file, onProgress) {
      return upload([file], 1600, onProgress).then(function (ups) {
        onProgress && onProgress('Saving\u2026');
        return call('add-postcard', { title: title, author: author, path: ups[0].path, w: ups[0].w, h: ups[0].h });
      }).then(function (r) { added.postcards.push(r.postcard); return r.postcard; });
    },

    call: call,
    get: get
  };
})();
