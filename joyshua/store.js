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

  var ready = get('joyshua_state', 'select=key,value')
    .then(function (rows) { rows.forEach(function (r) { state[r.key] = r.value; }); })
    .catch(function (err) { if (window.console) console.warn('[joyshua] edits unavailable:', err.message); });

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

    call: call,
    get: get
  };
})();
