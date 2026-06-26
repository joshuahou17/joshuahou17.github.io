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
function firstIncomplete(done) {
    for (var d = 1; d <= TOTAL_DAYS; d++) if (!done[d]) return d;
    return TOTAL_DAYS;
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
        await renderToday();
        return true;
    } catch (e) { return false; }
}
function resetPlan() {
    if (!window.confirm('Start over from Day 1? This clears your progress on this device.')) return;
    ['bible_started', 'bible_start_date', 'bible_current_day'].forEach(function (k) { localStorage.removeItem(k); });
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
    var firstUnread = Object.keys(done).length ? firstIncomplete(done) : 1;
    var onboarding = document.getElementById('onboarding'); if (onboarding) onboarding.style.display = 'none';
    var todays = document.getElementById('todays-reading');
    var stripBase = firstUnread;

    if (todays) {
        todays.style.display = 'block';
        var caughtUp = (typeof view !== 'number') && (firstUnread > sched);
        if (caughtUp) {
            var nextEntry = entryByDay(p, firstUnread);
            var ch = '<p class="post-meta">' + (firstUnread - 1) + ' of ' + TOTAL_DAYS + ' read · all caught up</p>';
            ch += '<h1 class="passage-ref">You’re all caught up</h1>';
            ch += '<p class="post-title">Your next reading' + (nextEntry ? ' — ' + nextEntry.passage : '') + ' arrives tomorrow morning.</p>';
            if (nextEntry) ch += '<div class="read-buttons"><button class="read-btn" id="ahead-btn" type="button">Read ahead &rarr;</button></div>';
            todays.innerHTML = ch;
            var ab = document.getElementById('ahead-btn');
            if (ab) ab.addEventListener('click', function () { window.scrollTo(0, 0); renderToday(firstUnread); });
            stripBase = firstUnread - 1;
        } else {
            var day = (typeof view === 'number') ? Math.min(Math.max(view, 1), TOTAL_DAYS) : firstUnread;
            stripBase = day;
            var entry = entryByDay(p, day);
            var a = await loadAnalysis(day);
            var ahead = day > sched;
            var offTrack = (typeof view === 'number') && day !== firstUnread;
            var h = '<p class="post-meta">Day ' + day + ' of ' + TOTAL_DAYS + (ahead ? ' · reading ahead' : '') + '</p>';
            h += '<h1 class="passage-ref">' + entry.passage + '</h1>';
            if (a && a.title) h += '<p class="post-title">' + a.title + '</p>';
            h += '<div class="read-buttons">' + buttonsHtml(entry) + '</div>';
            h += '<div class="read-actions" data-day-number="' + day + '">';
            if (day > 1) h += '<button class="read-nav" id="prev-btn" type="button">&larr; Previous day</button>';
            h += '<label class="mark-read-label"><input type="checkbox" class="mark-read-checkbox"' + (done[day] ? ' checked' : '') + '> Mark as read</label>';
            h += '<button class="read-btn" id="continue-btn" type="button" style="display:' + (done[day] ? 'inline-block' : 'none') + ';">Read the next one &rarr;</button>';
            h += '</div>';
            if (ahead || offTrack) h += '<p class="reading-hint"><a href="#" id="back-today">&larr; Back to today’s reading</a></p>';
            h += a ? analysisHtml(a) : '<p class="analysis-sec" style="color:var(--muted);"><em>This analysis is being prepared — check back shortly.</em></p>';
            todays.innerHTML = h;
            var cb = todays.querySelector('.mark-read-checkbox');
            var cont = todays.querySelector('#continue-btn');
            cb.addEventListener('change', async function () {
                await toggleProgress(day, cb.checked);
                var nextDay = Math.min(day + 1, TOTAL_DAYS);
                if (sb) { try { await sb.from('bible_subscribers').update({ current_day: cb.checked ? nextDay : day }).eq('user_id', getUserId()); } catch (e) {} }
                if (cb.checked) { setCurrentDay(nextDay); if (day < TOTAL_DAYS) cont.style.display = 'inline-block'; }
                else { cont.style.display = 'none'; }
            });
            if (cont) cont.addEventListener('click', function () { window.scrollTo(0, 0); renderToday(day + 1); });
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
        for (var i = 1; i <= 6 && stripBase + i <= TOTAL_DAYS; i++) {
            var e = entryByDay(p, stripBase + i);
            cards += '<a class="week-day-card" href="' + dayHref(e.day_number) + '"><div class="week-day-label">Day ' + e.day_number + '</div><div class="week-day-passage">' + e.passage + '</div></a>';
        }
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
    var current = (Object.keys(done).length || hasStarted()) ? firstIncomplete(done) : 1;
    var readCount = Object.keys(done).length;

    var countEl = document.getElementById('progress-count');
    if (countEl) countEl.textContent = 'Day ' + current + ' of ' + TOTAL_DAYS;
    var readEl = document.getElementById('progress-read');
    if (readEl) {
        var remaining = TOTAL_DAYS - (current - 1);
        var finish = new Date(); finish.setHours(12, 0, 0, 0); finish.setDate(finish.getDate() + remaining - 1);
        readEl.textContent = readCount + ' read · on pace to finish ' +
            finish.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Progress-driven dates: a completed day sits on the date it was read;
    // the current day is "today"; upcoming days flow forward from today.
    var today = new Date(); today.setHours(12, 0, 0, 0);
    var byDate = {};
    p.forEach(function (e) {
        var c = done[e.day_number];
        var d;
        if (c && c !== true) { d = new Date(c); }
        else if (c === true) { d = new Date(today); }
        else { d = new Date(today); d.setDate(d.getDate() + (e.day_number - current)); }
        var key = d.toLocaleDateString('en-CA');
        (byDate[key] = byDate[key] || []).push(e);
    });

    if (!calMonth) { calMonth = new Date(today.getFullYear(), today.getMonth(), 1); }
    drawCalendar(byDate, done, current);
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

// ============ POST PAGE (day-NNN.html) ============
async function initPostPage() {
    var holder = document.querySelector('[data-day-number]');
    if (!holder) return;
    var day = parseInt(holder.dataset.dayNumber);
    var done = await getCompleted();

    // inject a "make this my current day" button next to mark-as-read
    var label = holder.querySelector('.mark-read-label');
    var cb = holder.querySelector('.mark-read-checkbox');
    if (cb) { cb.checked = !!done[day]; cb.addEventListener('change', function () { toggleProgress(day, cb.checked); }); }
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
