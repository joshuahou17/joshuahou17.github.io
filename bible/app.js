(function () {
'use strict';

var SUPABASE_URL = 'https://iaspidhmxppsuwydmvym.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlhc3BpZGhteHBwc3V3eWRtdnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MjY5MjUsImV4cCI6MjA5MTEwMjkyNX0.1tnqoNxczpZkEUyUEdi0W1pLh8nwL7LE1Ig5PgjSU5U';

var TOTAL_DAYS = 365;
var ENROLL_URL = SUPABASE_URL + '/functions/v1/enroll';
var sb = null;
var plan = null;

var ABBR = {
    "Genesis":"Gen","Exodus":"Ex","Leviticus":"Lev","Numbers":"Num","Deuteronomy":"Deut",
    "Joshua":"Josh","Judges":"Judg","Ruth":"Ruth","1 Samuel":"1 Sam","2 Samuel":"2 Sam",
    "1 Kings":"1 Kgs","2 Kings":"2 Kgs","1 Chronicles":"1 Chr","2 Chronicles":"2 Chr",
    "Ezra":"Ezra","Nehemiah":"Neh","Esther":"Est","Job":"Job","Psalms":"Ps","Proverbs":"Prov",
    "Ecclesiastes":"Eccl","Song of Solomon":"Song","Isaiah":"Isa","Jeremiah":"Jer",
    "Lamentations":"Lam","Ezekiel":"Ezek","Daniel":"Dan","Hosea":"Hos","Joel":"Joel","Amos":"Amos",
    "Obadiah":"Obad","Jonah":"Jonah","Micah":"Mic","Nahum":"Nah","Habakkuk":"Hab","Zephaniah":"Zeph",
    "Haggai":"Hag","Zechariah":"Zech","Malachi":"Mal","Matthew":"Matt","Mark":"Mark","Luke":"Luke",
    "John":"John","Acts":"Acts","Romans":"Rom","1 Corinthians":"1 Cor","2 Corinthians":"2 Cor",
    "Galatians":"Gal","Ephesians":"Eph","Philippians":"Phil","Colossians":"Col",
    "1 Thessalonians":"1 Thess","2 Thessalonians":"2 Thess","1 Timothy":"1 Tim","2 Timothy":"2 Tim",
    "Titus":"Titus","Philemon":"Phlm","Hebrews":"Heb","James":"Jas","1 Peter":"1 Pet","2 Peter":"2 Pet",
    "1 John":"1 Jn","2 John":"2 Jn","3 John":"3 Jn","Jude":"Jude","Revelation":"Rev"
};

// --- state helpers ---
function initSupabase() {
    try { if (window.supabase) sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch (e) {}
}
// Identity is the subscriber id (tied to email), so progress is shared across
// devices and with the daily email. Set by enrolling with an email.
function getUserId() { return localStorage.getItem('bible_sub_id') || null; }
function hasStarted() { return !!localStorage.getItem('bible_sub_id'); }
function getEmail() { return localStorage.getItem('bible_email') || ''; }
function getCurrentDay() { return Math.min(Math.max(parseInt(localStorage.getItem('bible_current_day') || '1'), 1), TOTAL_DAYS); }
function setCurrentDay(d) { localStorage.setItem('bible_current_day', String(d)); }
function getStartDate() {
    var s = localStorage.getItem('bible_start_date');
    return s ? new Date(s + 'T12:00:00') : new Date();
}
function pad(n) { return String(n).padStart(3, '0'); }
function dayHref(n) { return '/bible/posts/day-' + pad(n) + '.html'; }

async function loadPlan() {
    if (plan) return plan;
    var r = await fetch('/scripts/reading_plan.json');
    plan = await r.json();
    return plan;
}
function entryByDay(p, d) { return p.find(function (e) { return e.day_number === d; }) || null; }

async function loadAnalysis(day) {
    try { var r = await fetch(dayHref(day).replace('.html', '.json')); if (!r.ok) return null; return await r.json(); } catch (e) { return null; }
}

// completed day_numbers for this user, as a Set
async function getCompleted() {
    var done = {};
    if (!sb) return done;
    try {
        var res = await sb.from('bible_reading_progress').select('day_number, completed, completed_at').eq('user_id', getUserId());
        (res.data || []).forEach(function (r) { if (r.completed) done[r.day_number] = r.completed_at || true; });
    } catch (e) {}
    return done;
}

// --- reading order ---------------------------------------------------------
// Position in the plan used to be implied by day_number ("next = lowest unread
// number"), which made reordering impossible. readingOrder() makes it explicit:
// the list of UNREAD days in the order they'll actually be served. Because it's
// computed over unread days only, a gospel day read during a jump simply never
// reappears when the plan comes back round — the skip is free.
var GOSPEL_BOOKS = { 'Matthew': 1, 'Mark': 1, 'Luke': 1, 'John': 1 };

// Derived from the plan rather than hardcoded to days 274-319, so regenerating
// reading_plan.json can't silently point this at the wrong passages.
function gospelDays(p) {
    var s = {};
    p.forEach(function (e) {
        if ((e.segments || []).some(function (g) { return GOSPEL_BOOKS[g.book]; })) s[e.day_number] = true;
    });
    return s;
}
function getGospelStart() { return localStorage.getItem('bible_gospel_start') || null; }
function parseDayKey(k) { return new Date(k + 'T12:00:00'); }
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

// Where the next unread reading lands on the calendar: today, unless today's
// reading is already ticked -- then the next one belongs to tomorrow, otherwise
// it stacks on top of a day that's already done.
function upcomingBaseDate(done) {
    var today = new Date(); today.setHours(12, 0, 0, 0);
    var todayK = dayKey(today);
    var readToday = Object.keys(done).some(function (d) {
        var c = done[d];
        return c && c !== true && dayKey(new Date(c)) === todayK;
    });
    var base = new Date(today);
    if (readToday) base.setDate(base.getDate() + 1);
    return base;
}

// Ascending by day number, unless a gospel jump is active -- then the unread
// gospel block slides in at the position matching its start date, and the rest
// of the plan closes up around it. Nothing is rewritten; this is order only.
function readingOrder(p, done, gospelStart, base) {
    var unread = [];
    p.forEach(function (e) { if (!done[e.day_number]) unread.push(e.day_number); });
    unread.sort(function (a, b) { return a - b; });
    if (!gospelStart) return unread;
    var gd = gospelDays(p);
    var gospels = unread.filter(function (d) { return gd[d]; });
    if (!gospels.length) return unread;   // block finished -- jump is a no-op
    var rest = unread.filter(function (d) { return !gd[d]; });
    var offset = Math.max(0, Math.min(daysBetween(base, parseDayKey(gospelStart)), rest.length));
    return rest.slice(0, offset).concat(gospels, rest.slice(offset));
}

// Persist the jump: localStorage first so the UI is instant, then through to
// the subscriber row so the 6am email follows the same order. Returns false if
// the server leg failed, so the caller can say so instead of drifting silently.
async function saveGospelStart(dateStr) {
    if (dateStr) localStorage.setItem('bible_gospel_start', dateStr);
    else localStorage.removeItem('bible_gospel_start');
    var uid = getUserId();
    if (!uid) return true;
    try {
        var q = SUPABASE_URL + '/functions/v1/set-gospel-start?subscriber_id=' + encodeURIComponent(uid) +
                (dateStr ? '&date=' + encodeURIComponent(dateStr) : '&clear=1');
        var r = await fetch(q);
        return r.ok;
    } catch (e) { return false; }
}

function shortPassage(entry) {
    var segs = entry.segments || [];
    if (!segs.length) return entry.passage;
    var first = segs[0];
    var label = (ABBR[first.book] || first.book) + first.ref.slice(first.book.length);
    return segs.length > 1 ? label + ' +' + (segs.length - 1) : label;
}

// --- shared actions ---
async function toggleProgress(day, completed) {
    var uid = getUserId();
    if (sb && uid) {
        try {
            await sb.from('bible_reading_progress').upsert({
                user_id: uid, day_number: day, completed: completed,
                completed_at: completed ? new Date().toISOString() : null
            }, { onConflict: 'user_id,day_number' });
        } catch (e) {}
    }
}
async function makeCurrentDay(day) {
    localStorage.setItem('bible_started', 'true');
    setCurrentDay(day);
    if (sb) { try { await sb.from('bible_subscribers').update({ current_day: day }).eq('user_id', getUserId()); } catch (e) {} }
    window.location.href = '/bible';
}

// ============ INDEX (Today) ============
async function startPlan(email) {
    try {
        var r = await fetch(ENROLL_URL + '?email=' + encodeURIComponent(email));
        if (!r.ok) return false;
        var d = await r.json();
        if (!d || !d.id) return false;
        localStorage.setItem('bible_sub_id', d.id);
        localStorage.setItem('bible_email', email);
        if (d.start_date) localStorage.setItem('bible_start_date', d.start_date);
        // The jump lives on the subscriber row, so a second device picks it up here.
        if (d.gospel_start) localStorage.setItem('bible_gospel_start', d.gospel_start);
        else localStorage.removeItem('bible_gospel_start');
        await renderToday();
        return true;
    } catch (e) { return false; }
}
function resetPlan() {
    if (!window.confirm('Start over from Day 1? This clears your progress on this device.')) return;
    ['bible_started', 'bible_start_date', 'bible_current_day', 'bible_gospel_start'].forEach(function (k) { localStorage.removeItem(k); });
    window.location.reload();
}
function buttonsHtml(entry) {
    return (entry.segments || []).map(function (s) {
        return '<a class="read-btn" href="' + s.link + '" target="_blank" rel="noopener">Read ' + s.ref + ' in the NIV &rarr;</a>';
    }).join('');
}
function analysisHtml(a) {
    var h = '';
    if (a.context) h += '<p class="section-kicker">Context</p><div class="analysis-sec">' + a.context + '</div>';
    if (a.themes) h += '<p class="section-kicker">Key themes</p><div class="analysis-sec">' + a.themes + '</div>';
    if (a.takeaways && a.takeaways.length) h += '<p class="section-kicker">Takeaways</p><ul class="takeaways">' + a.takeaways.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>';
    if (a.connections) {
        h += '<p class="section-kicker">Connections</p><div class="analysis-sec">' + a.connections;
        var xr = a.cross_reference_links || [];
        if (xr.length) h += '<div class="xref-links">' + xr.map(function (x) { return x.url ? '<a href="' + x.url + '" target="_blank" rel="noopener">' + x.label + ' &rarr;</a>' : '<span>' + x.label + '</span>'; }).join('') + '</div>';
        h += '</div>';
    }
    if (a.reflection) h += '<p class="section-kicker">Reflection</p><div class="analysis-sec">' + a.reflection + '</div>';
    if (a.sources && a.sources.length) h += '<div class="sources-section"><p class="section-kicker" style="color:var(--faint)">Sources</p><ul class="sources-list">' + a.sources.map(function (s) { return '<li><a href="' + s.url + '" target="_blank" rel="noopener">' + s.name + '</a></li>'; }).join('') + '</ul></div>';
    return h;
}
// How far the calendar has unlocked: one new day per day since you started.
function scheduledDay() {
    var s = localStorage.getItem('bible_start_date');
    if (!s) return TOTAL_DAYS;
    var start = new Date(s + 'T12:00:00');
    var today = new Date(); today.setHours(12, 0, 0, 0);
    var d = Math.floor((today - start) / 86400000) + 1;
    return Math.min(Math.max(d, 1), TOTAL_DAYS);
}

// view = an explicit day to show (read-ahead or back nav); omit for the default daily reading.
async function renderToday(view) {
    var p = await loadPlan();
    var done = await getCompleted();
    var sched = scheduledDay();
    var readCount = Object.keys(done).length;
    var gStart = getGospelStart();
    var gd = gospelDays(p);
    var order = readingOrder(p, done, gStart, upcomingBaseDate(done));
    var nextUp = order.length ? order[0] : TOTAL_DAYS;
    var onboarding = document.getElementById('onboarding'); if (onboarding) onboarding.style.display = 'none';
    var todays = document.getElementById('todays-reading');
    var stripDays = order.slice(0, 6);

    if (todays) {
        todays.style.display = 'block';
        // Count-based, not day-number-based: once days can be reordered,
        // "my next day number is past the calendar" stops meaning anything.
        // With in-order reading the two tests are identical.
        var caughtUp = (typeof view !== 'number') && (readCount >= sched);
        if (caughtUp) {
            var nextEntry = entryByDay(p, nextUp);
            var ch = '<p class="post-meta">' + readCount + ' of ' + TOTAL_DAYS + ' read \u00b7 all caught up</p>';
            ch += '<h1 class="passage-ref">You\u2019re all caught up</h1>';
            ch += '<p class="post-title">Your next reading' + (nextEntry ? ' \u2014 ' + nextEntry.passage : '') + ' arrives tomorrow morning.</p>';
            if (nextEntry) ch += '<div class="read-buttons"><button class="read-btn" id="ahead-btn" type="button">Read ahead &rarr;</button></div>';
            todays.innerHTML = ch;
            var ab = document.getElementById('ahead-btn');
            if (ab) ab.addEventListener('click', function () { window.scrollTo(0, 0); renderToday(nextUp); });
        } else {
            var day = (typeof view === 'number') ? Math.min(Math.max(view, 1), TOTAL_DAYS) : nextUp;
            var idx = order.indexOf(day);
            // Coming-up follows the reading order. A day that isn't in `order`
            // is one you've already read (back nav), so fall back to plan order.
            if (idx >= 0) stripDays = order.slice(idx + 1, idx + 7);
            else { stripDays = []; for (var k = day + 1; k <= Math.min(day + 6, TOTAL_DAYS); k++) stripDays.push(k); }
            var entry = entryByDay(p, day);
            var a = await loadAnalysis(day);
            var ahead = idx > 0 || (idx === 0 && readCount >= sched);
            var offTrack = (typeof view === 'number') && day !== nextUp;
            // During a jump a gospel day IS today's reading, so don't cry "reading ahead".
            var tag = (gStart && gd[day] && idx === 0) ? ' \u00b7 gospels, moved up'
                    : (ahead ? ' \u00b7 reading ahead' : '');
            var h = '<p class="post-meta">Day ' + day + ' of ' + TOTAL_DAYS + tag + '</p>';
            h += '<h1 class="passage-ref">' + entry.passage + '</h1>';
            if (a && a.title) h += '<p class="post-title">' + a.title + '</p>';
            h += '<div class="read-buttons">' + buttonsHtml(entry) + '</div>';
            if (ahead || offTrack) h += '<p class="reading-hint"><a href="#" id="back-today">&larr; Back to today\u2019s reading</a></p>';
            h += a ? analysisHtml(a) : '<p class="analysis-sec" style="color:var(--muted);"><em>This analysis is being prepared \u2014 check back shortly.</em></p>';
            // Mark-as-read and day nav sit AFTER the analysis, mirroring the
            // post pages \u2014 you tick the box once you've actually read it.
            h += '<div class="read-actions at-end" data-day-number="' + day + '">';
            if (day > 1) h += '<button class="read-nav" id="prev-btn" type="button">&larr; Previous day</button>';
            h += '<label class="mark-read-label"><input type="checkbox" class="mark-read-checkbox"' + (done[day] ? ' checked' : '') + '> Mark as read</label>';
            h += '<button class="read-btn" id="continue-btn" type="button" style="display:' + (done[day] ? 'inline-block' : 'none') + ';">Read the next one &rarr;</button>';
            h += '</div>';
            todays.innerHTML = h;
            // "Next" is the next entry in reading order, not day + 1.
            var nextAfter = (idx >= 0 && idx + 1 < order.length) ? order[idx + 1] : Math.min(day + 1, TOTAL_DAYS);
            var cb = todays.querySelector('.mark-read-checkbox');
            var cont = todays.querySelector('#continue-btn');
            cb.addEventListener('change', async function () {
                await toggleProgress(day, cb.checked);
                if (sb) { try { await sb.from('bible_subscribers').update({ current_day: cb.checked ? nextAfter : day }).eq('user_id', getUserId()); } catch (e) {} }
                if (cb.checked) { setCurrentDay(nextAfter); if (day < TOTAL_DAYS) cont.style.display = 'inline-block'; }
                else { cont.style.display = 'none'; }
            });
            if (cont) cont.addEventListener('click', function () { window.scrollTo(0, 0); renderToday(nextAfter); });
            var pv = document.getElementById('prev-btn');
            if (pv) pv.addEventListener('click', function () { window.scrollTo(0, 0); renderToday(day - 1); });
            var bt = document.getElementById('back-today');
            if (bt) bt.addEventListener('click', function (ev) { ev.preventDefault(); window.scrollTo(0, 0); renderToday(); });
        }
    }
    var strip = document.getElementById('week-strip');
    if (strip) {
        strip.style.display = 'block';
        var cards = '';
        stripDays.forEach(function (dn) {
            var e = entryByDay(p, dn);
            if (!e) return;
            cards += '<a class="week-day-card" href="' + dayHref(e.day_number) + '"><div class="week-day-label">Day ' + e.day_number + '</div><div class="week-day-passage">' + e.passage + '</div></a>';
        });
        strip.innerHTML = cards ? '<h2 class="week-strip-title">Coming up</h2><div class="week-strip-grid">' + cards + '</div>' : '';
    }
    var resetRow = document.getElementById('reset-row');
    if (resetRow) { resetRow.style.display = 'block'; var rb = document.getElementById('reset-plan-btn'); if (rb && !rb.dataset.wired) { rb.addEventListener('click', resetPlan); rb.dataset.wired = 'true'; } }
}

// ============ PROGRESS (calendar) ============
var calMonth = null; // Date pointing at first of the displayed month

async function renderProgressPage() {
    var p = await loadPlan();
    var done = await getCompleted();
    var gStart = getGospelStart();
    var base = upcomingBaseDate(done);
    var order = readingOrder(p, done, gStart, base);
    var current = order.length ? order[0] : TOTAL_DAYS;
    var readCount = Object.keys(done).length;

    var countEl = document.getElementById('progress-count');
    if (countEl) countEl.textContent = 'Day ' + current + ' of ' + TOTAL_DAYS;
    var readEl = document.getElementById('progress-read');
    if (readEl) {
        // Finish date = one reading per day through everything still unread.
        var finish = new Date(base);
        finish.setDate(finish.getDate() + Math.max(order.length - 1, 0));
        readEl.textContent = readCount + ' read \u00b7 on pace to finish ' +
            finish.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Progress-driven dates: a completed day sits on the date it was read;
    // unread days flow forward one-per-day from `base` in READING order. Using
    // the order index (not day_number - current) is what lets the gospel block
    // move, and it also stops gaps from out-of-order reading shifting the rest.
    var today = new Date(); today.setHours(12, 0, 0, 0);
    var pos = {};
    order.forEach(function (d, i) { pos[d] = i; });
    var byDate = {};
    p.forEach(function (e) {
        var c = done[e.day_number];
        var d;
        if (c && c !== true) { d = new Date(c); }
        else if (c === true) { d = new Date(today); }
        else { d = new Date(base); d.setDate(d.getDate() + (pos[e.day_number] || 0)); }
        var key = dayKey(d);
        (byDate[key] = byDate[key] || []).push(e);
    });

    if (!calMonth) { calMonth = new Date(today.getFullYear(), today.getMonth(), 1); }
    drawCalendar(byDate, done, current);
    drawGospelJump(p, done);
    drawHeatmap(done);
}

// ============ GOSPEL JUMP (under the calendar) ============
// Pull the gospel block forward without leaving the plan. This writes a single
// setting -- never a progress row -- so "Go back to original plan" is lossless
// and anything ticked during the detour stays ticked.
var gospelPicking = false;

function drawGospelJump(p, done) {
    var el = document.getElementById('gospel-jump');
    if (!el) return;
    if (!hasStarted()) { el.hidden = true; return; }
    el.hidden = false;

    var gd = gospelDays(p);
    var all = Object.keys(gd).map(Number);
    var readN = all.filter(function (d) { return done[d]; }).length;
    var gStart = getGospelStart();

    // Whole block finished -- the detour is over, so retire the setting rather
    // than leaving a stale date on the subscriber row.
    if (gStart && readN === all.length) { saveGospelStart(null); gStart = null; }

    var h = '';
    if (gStart) {
        h += '<p class="gospel-line"><span class="gospel-tag">Gospels moved up</span> starting ' +
             parseDayKey(gStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
             ' \u00b7 ' + readN + ' of ' + all.length + ' read</p>';
        h += '<button class="gospel-btn" id="gospel-revert" type="button">Go back to original plan</button>';
    } else if (gospelPicking) {
        var todayK = dayKey(new Date());
        h += '<p class="gospel-line">Start the gospels on\u2026</p>';
        h += '<div class="gospel-panel">' +
             '<input class="gospel-date" type="date" id="gospel-date" min="' + todayK + '" value="' + todayK + '">' +
             '<button class="gospel-btn" id="gospel-go" type="button">Move them here</button>' +
             '<button class="gospel-cancel" id="gospel-cancel" type="button">Cancel</button></div>';
    } else {
        h += '<button class="gospel-btn" id="gospel-open" type="button">Read the Gospels now</button>';
        h += '<p class="gospel-note">Brings the ' + all.length + ' gospel readings (Matthew\u2013John) forward to a date you pick; the rest of the plan shifts back behind them. Reversible \u2014 and anything you\'ve already read stays read.</p>';
    }
    el.innerHTML = h;

    var open = document.getElementById('gospel-open');
    if (open) open.addEventListener('click', function () { gospelPicking = true; drawGospelJump(p, done); });
    var cancel = document.getElementById('gospel-cancel');
    if (cancel) cancel.addEventListener('click', function () { gospelPicking = false; drawGospelJump(p, done); });

    var go = document.getElementById('gospel-go');
    if (go) go.addEventListener('click', async function () {
        var v = (document.getElementById('gospel-date') || {}).value;
        if (!v || v < dayKey(new Date())) return;
        go.disabled = true;
        gospelPicking = false;
        var ok = await saveGospelStart(v);
        await renderProgressPage();
        if (!ok) warnGospelSync();
    });
    var revert = document.getElementById('gospel-revert');
    if (revert) revert.addEventListener('click', async function () {
        revert.disabled = true;
        var ok = await saveGospelStart(null);
        await renderProgressPage();
        if (!ok) warnGospelSync();
    });
}

// The site follows localStorage, the daily email follows the subscriber row.
// If the server leg fails, say so rather than letting the two drift in silence.
function warnGospelSync() {
    var el = document.getElementById('gospel-jump');
    if (el) el.insertAdjacentHTML('beforeend',
        '<p class="gospel-warn">Saved on this device, but we couldn\'t reach the server \u2014 your daily email may still follow the original order.</p>');
}

function drawCalendar(byDate, done, current) {
    var el = document.getElementById('progress-calendar');
    if (!el) return;
    var year = calMonth.getFullYear(), month = calMonth.getMonth();
    var monthName = calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    var startDow = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var todayKey = new Date().toLocaleDateString('en-CA');

    var h = '<div class="cal-head"><button class="cal-nav" id="cal-prev">&lsaquo;</button>' +
            '<span class="cal-title">' + monthName + '</span>' +
            '<button class="cal-nav" id="cal-next">&rsaquo;</button></div>';
    h += '<div class="cal-grid">';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function (d) { h += '<div class="cal-dow">' + d + '</div>'; });
    for (var b = 0; b < startDow; b++) h += '<div class="cal-cell empty"></div>';
    for (var dt = 1; dt <= daysInMonth; dt++) {
        var key = new Date(year, month, dt).toLocaleDateString('en-CA');
        var list = byDate[key];
        if (!list || !list.length) { h += '<div class="cal-cell empty"><span class="cal-date">' + dt + '</span></div>'; continue; }
        list.sort(function (x, y) { return x.day_number - y.day_number; });
        var e = list[0];
        var allDone = list.every(function (x) { return done[x.day_number]; });
        var isCurrent = list.some(function (x) { return x.day_number === current; });
        var cls = 'cal-cell has-day' + (allDone ? ' done' : '') + (isCurrent ? ' current' : '') + (key === todayKey ? ' today' : '');
        var more = list.length > 1 ? ' <span style="font-family:var(--mono);font-size:9px;color:var(--faint)">+' + (list.length - 1) + ' more</span>' : '';
        h += '<a class="' + cls + '" href="' + dayHref(e.day_number) + '">' +
             '<span class="cal-date">' + dt + (allDone ? ' &#10003;' : '') + '</span>' +
             '<span class="cal-passage">' + shortPassage(e) + more + '</span></a>';
    }
    h += '</div>';
    el.innerHTML = h;
    document.getElementById('cal-prev').addEventListener('click', function () { calMonth = new Date(year, month - 1, 1); drawCalendar(byDate, done, current); });
    document.getElementById('cal-next').addEventListener('click', function () { calMonth = new Date(year, month + 1, 1); drawCalendar(byDate, done, current); });
}

// ============ HEATMAP (a year of reading activity) ============
// GitHub-contributions grid: one tile per day across the plan year, shaded by
// how many passages were marked read that day. Rendered into its own section so
// month navigation above (which rewrites #progress-calendar) never wipes it.
var HEAT_WEEKS = 53;
var MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var HEAT_DOW = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

function dayKey(d) { return d.toLocaleDateString('en-CA'); }
function longDate(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
// Three tones: 1 reading, 2 readings, 3-or-more.
function heatLevel(n) { return n <= 0 ? 0 : (n >= 3 ? 3 : n); }

function drawHeatmap(done) {
    var el = document.getElementById('reading-heatmap');
    if (!el) return;

    // 1. Count passages per local calendar date. done[day] is the completed_at
    // ISO string, or the sentinel `true` for legacy rows saved before timestamps
    // existed — those have no date to sit on, so they're counted but not placed.
    var counts = {}, dated = 0, undated = 0;
    Object.keys(done).forEach(function (d) {
        var c = done[d];
        if (c === true) { undated++; return; }
        var key = dayKey(new Date(c));
        counts[key] = (counts[key] || 0) + 1;
        dated++;
    });

    if (!dated && !hasStarted()) { el.hidden = true; return; }

    // 2. Frame the plan year, padded back to the Sunday before it so the
    // columns line up as whole weeks. Noon-anchored throughout to dodge DST.
    var start = getStartDate(); start.setHours(12, 0, 0, 0);
    var last = new Date(start); last.setDate(last.getDate() + TOTAL_DAYS - 1);
    var startKey = dayKey(start), lastKey = dayKey(last), todayKey = dayKey(new Date());
    var gridStart = new Date(start); gridStart.setDate(gridStart.getDate() - gridStart.getDay());

    // 3. Month labels: one per column where the month first turns over.
    var months = '', prevMonth = -1;
    for (var c = 0; c < HEAT_WEEKS; c++) {
        var colStart = new Date(gridStart); colStart.setDate(colStart.getDate() + c * 7);
        var m = colStart.getMonth();
        var label = (m !== prevMonth && dayKey(colStart) <= lastKey) ? MONTH_ABBR[m] : '';
        prevMonth = m;
        months += '<span class="heat-month">' + label + '</span>';
    }

    // 4. The grid itself — fills top-to-bottom then left-to-right (see CSS).
    var cells = '', outside = 0;
    for (var col = 0; col < HEAT_WEEKS; col++) {
        for (var row = 0; row < 7; row++) {
            var d = new Date(gridStart); d.setDate(d.getDate() + col * 7 + row);
            var key = dayKey(d);
            if (key < startKey || key > lastKey) { cells += '<span class="heat-cell out"></span>'; continue; }
            var n = counts[key] || 0;
            var title = (n ? n + (n === 1 ? ' passage' : ' passages') : 'No reading') + ' · ' + longDate(d);
            cells += '<span class="heat-cell l' + heatLevel(n) + (key === todayKey ? ' today' : '') +
                     '" title="' + title + '"></span>';
        }
    }
    Object.keys(counts).forEach(function (k) { if (k < startKey || k > lastKey) outside += counts[k]; });

    var dows = '';
    HEAT_DOW.forEach(function (d) { dows += '<span>' + d + '</span>'; });

    var legend = '';
    for (var L = 0; L <= 3; L++) legend += '<span class="heat-key l' + L + '"></span>';

    var notes = [];
    if (undated) notes.push(undated === 1
        ? '1 earlier reading has no recorded date'
        : undated + ' earlier readings have no recorded date');
    if (outside) notes.push(outside === 1
        ? '1 reading falls outside the plan year'
        : outside + ' readings fall outside the plan year');

    el.innerHTML =
        '<div class="heat-head">' +
            '<span class="heat-title">Reading activity</span>' +
            '<span class="heat-legend">Less ' + legend + ' More</span>' +
        '</div>' +
        '<div class="heat-scroll"><div class="heat-inner">' +
            '<div class="heat-months">' + months + '</div>' +
            '<div class="heat-dows">' + dows + '</div>' +
            '<div class="heat-grid">' + cells + '</div>' +
        '</div></div>' +
        (notes.length ? '<p class="heat-note">' + notes.join(' · ') + ' — not shown above.</p>' : '');
    el.hidden = false;
}

// ============ POST PAGE (day-NNN.html) ============
async function initPostPage() {
    var cb = document.querySelector('.mark-read-checkbox');
    if (!cb) return;
    var day = parseInt(cb.dataset.dayNumber);
    var done = await getCompleted();

    // inject a "make this my current day" button next to mark-as-read
    var label = document.querySelector('.mark-read-label');
    cb.checked = !!done[day];
    cb.addEventListener('change', function () { toggleProgress(day, cb.checked); });
    if (label && !document.getElementById('make-current-btn')) {
        var btn = document.createElement('button');
        btn.id = 'make-current-btn'; btn.className = 'make-current-btn'; btn.type = 'button';
        btn.textContent = 'Make this my current day';
        btn.addEventListener('click', function () { makeCurrentDay(day); });
        label.parentNode.appendChild(btn);
    }
    // add a Progress link to the post nav
    var nav = document.querySelector('nav.nav');
    if (nav && !nav.querySelector('.nav-progress')) {
        var a = document.createElement('a');
        a.href = '/bible/progress.html'; a.className = 'nav-progress'; a.textContent = 'Progress';
        nav.appendChild(a);
    }
}

// --- subscribe (index) ---
function initSubscribeForm() {
    var form = document.getElementById('subscribe-form');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var email = form.querySelector('input[type="email"]').value;
        var btn = form.querySelector('button');
        btn.textContent = 'Subscribing...'; btn.disabled = true;
        try {
            var r = await fetch(ENROLL_URL + '?email=' + encodeURIComponent((email || '').trim()));
            btn.textContent = r.ok ? 'Subscribed!' : 'Error — try again';
        } catch (e2) { btn.textContent = 'Error — try again'; }
        setTimeout(function () { btn.textContent = 'Subscribe'; btn.disabled = false; }, 3000);
    });
}

// --- unsubscribe (footer, any page) ---
function wireUnsubscribe() {
    var btn = document.getElementById('unsubscribe-btn');
    if (!btn) return;
    btn.addEventListener('click', function () {
        var email = window.prompt('Enter the email you subscribed with to unsubscribe:');
        if (!email) return;
        window.location.href = SUPABASE_URL + '/functions/v1/unsubscribe?email=' + encodeURIComponent(email.trim());
    });
}

// --- init / route ---
document.addEventListener('DOMContentLoaded', function () {
    initSupabase();
    wireUnsubscribe();
    if (document.getElementById('progress-calendar')) { renderProgressPage(); return; }
    if (document.querySelector('main.post')) { initPostPage(); return; }
    // index
    if (hasStarted()) { var ob = document.getElementById('onboarding'); if (ob) ob.style.display = 'none'; renderToday(); }
    else {
        var sf = document.getElementById('start-form');
        if (sf) sf.addEventListener('submit', async function (e) {
            e.preventDefault();
            var em = (document.getElementById('start-email').value || '').trim();
            if (!em) return;
            var b = document.getElementById('start-plan-btn');
            b.textContent = 'Starting…'; b.disabled = true;
            var ok = await startPlan(em);
            if (!ok) { b.textContent = 'Try again'; b.disabled = false; setTimeout(function () { b.textContent = 'Start reading plan'; }, 2500); }
        });
    }
    initSubscribeForm();
});

})();
