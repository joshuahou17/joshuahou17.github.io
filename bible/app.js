(function () {
'use strict';

var SUPABASE_URL = 'https://iaspidhmxppsuwydmvym.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlhc3BpZGhteHBwc3V3eWRtdnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MjY5MjUsImV4cCI6MjA5MTEwMjkyNX0.1tnqoNxczpZkEUyUEdi0W1pLh8nwL7LE1Ig5PgjSU5U';

var TOTAL_DAYS = 365;
var sb = null;
var plan = null;

// --- state ---
function initSupabase() {
    try {
        if (window.supabase) sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) { /* ignore */ }
}
function getUserId() {
    var id = localStorage.getItem('bible_user_id');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('bible_user_id', id); }
    return id;
}
function hasStarted() { return localStorage.getItem('bible_started') === 'true'; }
function getCurrentDay() { return Math.min(Math.max(parseInt(localStorage.getItem('bible_current_day') || '1'), 1), TOTAL_DAYS); }
function setCurrentDay(d) { localStorage.setItem('bible_current_day', String(d)); }
function pad(n) { return String(n).padStart(3, '0'); }

async function loadPlan() {
    if (plan) return plan;
    var r = await fetch('/scripts/reading_plan.json');
    plan = await r.json();
    return plan;
}
function entryByDay(p, d) { return p.find(function (e) { return e.day_number === d; }) || null; }

async function loadAnalysis(day) {
    try {
        var r = await fetch('/bible/posts/day-' + pad(day) + '.json');
        if (!r.ok) return null;
        return await r.json();
    } catch (e) { return null; }
}

// --- onboarding ---
async function startPlan() {
    var today = new Date().toLocaleDateString('en-CA');
    localStorage.setItem('bible_started', 'true');
    localStorage.setItem('bible_start_date', today);
    setCurrentDay(1);
    var uid = getUserId();
    // record start date server-side so daily emails know which day to send
    if (sb) {
        try { await sb.from('bible_subscribers').update({ start_date: today, current_day: 1 }).eq('user_id', uid); } catch (e) {}
    }
    await renderView();
}
function resetPlan() {
    if (!window.confirm('Start over from Day 1? This clears your progress on this device.')) return;
    ['bible_started', 'bible_start_date', 'bible_current_day'].forEach(function (k) { localStorage.removeItem(k); });
    window.location.reload();
}

// --- rendering ---
function buttonsHtml(entry) {
    return (entry.segments || []).map(function (s) {
        return '<a class="read-btn" href="' + s.link + '" target="_blank" rel="noopener">Read ' + s.ref + ' in the NIV &rarr;</a>';
    }).join('');
}

function analysisHtml(a) {
    var h = '';
    if (a.context) h += '<p class="section-kicker">Context</p><div class="analysis-sec">' + a.context + '</div>';
    if (a.themes) h += '<p class="section-kicker">Key themes</p><div class="analysis-sec">' + a.themes + '</div>';
    if (a.takeaways && a.takeaways.length) {
        h += '<p class="section-kicker">Takeaways</p><ul class="takeaways">' +
            a.takeaways.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>';
    }
    if (a.connections) {
        h += '<p class="section-kicker">Connections</p><div class="analysis-sec">' + a.connections;
        var xr = a.cross_reference_links || [];
        if (xr.length) {
            h += '<div class="xref-links">' + xr.map(function (x) {
                return x.url
                    ? '<a href="' + x.url + '" target="_blank" rel="noopener">' + x.label + ' &rarr;</a>'
                    : '<span>' + x.label + '</span>';
            }).join('') + '</div>';
        }
        h += '</div>';
    }
    if (a.reflection) h += '<p class="section-kicker">Reflection</p><div class="analysis-sec">' + a.reflection + '</div>';
    if (a.sources && a.sources.length) {
        h += '<div class="sources-section"><p class="section-kicker" style="color:var(--faint)">Sources</p><ul class="sources-list">' +
            a.sources.map(function (s) { return '<li><a href="' + s.url + '" target="_blank" rel="noopener">' + s.name + '</a></li>'; }).join('') +
            '</ul></div>';
    }
    return h;
}

function renderToday(entry, a, day) {
    var h = '<p class="post-meta">Day ' + day + ' of ' + TOTAL_DAYS + '</p>';
    h += '<h1 class="passage-ref">' + entry.passage + '</h1>';
    if (a && a.title) h += '<p class="post-title">' + a.title + '</p>';
    h += '<div class="read-buttons">' + buttonsHtml(entry) + '</div>';
    h += '<div data-day-number="' + day + '"><label class="mark-read-label" style="margin-bottom:8px;">' +
         '<input type="checkbox" class="mark-read-checkbox" data-day-number="' + day + '"> Mark as read</label></div>';
    h += a ? analysisHtml(a)
           : '<p class="analysis-sec" style="color:var(--muted);"><em>Today’s analysis is being prepared — check back shortly.</em></p>';
    return h;
}

function renderComingUp(p, day) {
    var cards = '';
    for (var i = 1; i <= 6 && day + i <= TOTAL_DAYS; i++) {
        var e = entryByDay(p, day + i);
        if (!e) continue;
        cards += '<a class="week-day-card" href="/bible/posts/day-' + pad(e.day_number) + '.html">' +
                 '<div class="week-day-label">Day ' + e.day_number + '</div>' +
                 '<div class="week-day-passage">' + e.passage + '</div></a>';
    }
    if (!cards) return '';
    return '<h2 class="week-strip-title">Coming up</h2><div class="week-strip-grid">' + cards + '</div>';
}

function renderArchive(p, day) {
    var list = document.getElementById('archive-list');
    if (!list) return;
    var past = p.filter(function (e) { return e.day_number < day; }).reverse();
    if (!past.length) { list.innerHTML = '<li class="archive-empty">Your finished readings will appear here.</li>'; return; }
    list.innerHTML = past.map(function (e) {
        return '<li><a href="/bible/posts/day-' + pad(e.day_number) + '.html">' +
               '<div class="archive-item-left"><span class="archive-passage">Day ' + e.day_number + ': ' + e.passage + '</span></div></a></li>';
    }).join('');
}

async function renderView() {
    var p = await loadPlan();
    var day = getCurrentDay();
    var entry = entryByDay(p, day);
    if (!entry) return;

    var onboarding = document.getElementById('onboarding');
    if (onboarding) onboarding.style.display = 'none';

    var todays = document.getElementById('todays-reading');
    var a = await loadAnalysis(day);
    if (todays) { todays.style.display = 'block'; todays.innerHTML = renderToday(entry, a, day); }

    var strip = document.getElementById('week-strip');
    if (strip) { strip.style.display = 'block'; strip.innerHTML = renderComingUp(p, day); }

    var resetRow = document.getElementById('reset-row');
    if (resetRow) {
        resetRow.style.display = 'block';
        var rb = document.getElementById('reset-plan-btn');
        if (rb && !rb.dataset.wired) { rb.addEventListener('click', resetPlan); rb.dataset.wired = 'true'; }
    }

    renderArchive(p, day);
    renderProgress();
}

// --- progress (Supabase) ---
async function renderProgress() {
    if (sb) {
        try {
            var res = await sb.from('bible_reading_progress').select('day_number, completed').eq('user_id', getUserId());
            if (res.data) {
                var done = {};
                res.data.forEach(function (r) { if (r.completed) done[r.day_number] = true; });
                document.querySelectorAll('[data-day-number]').forEach(function (el) {
                    if (done[parseInt(el.dataset.dayNumber)]) {
                        var cb = el.querySelector('input[type="checkbox"]');
                        if (cb) cb.checked = true;
                        el.classList.add('completed');
                    }
                });
            }
        } catch (e) { /* ignore */ }
    }
    document.querySelectorAll('.mark-read-checkbox').forEach(function (cb) {
        cb.addEventListener('change', function (e) { toggleProgress(parseInt(e.target.dataset.dayNumber), e.target.checked); });
    });
}

async function toggleProgress(day, completed) {
    var uid = getUserId();
    if (sb) {
        try {
            await sb.from('bible_reading_progress').upsert({
                user_id: uid, day_number: day, completed: completed,
                completed_at: completed ? new Date().toISOString() : null
            }, { onConflict: 'user_id,day_number' });
        } catch (e) {}
    }
    if (completed && day === getCurrentDay() && day < TOTAL_DAYS) {
        setCurrentDay(day + 1);
        if (sb) { try { await sb.from('bible_subscribers').update({ current_day: day + 1 }).eq('user_id', uid); } catch (e) {} }
        setTimeout(renderView, 500);
    }
}

// --- subscribe ---
function initSubscribeForm() {
    var form = document.getElementById('subscribe-form');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var email = form.querySelector('input[type="email"]').value;
        var btn = form.querySelector('button');
        btn.textContent = 'Subscribing...'; btn.disabled = true;
        if (sb) {
            var today = new Date().toLocaleDateString('en-CA');
            var res = await sb.from('bible_subscribers').insert({
                email: email, user_id: getUserId(), start_date: today, current_day: 1,
                subscribed_at: new Date().toISOString()
            });
            btn.textContent = (res.error && res.error.code === '23505') ? 'Already subscribed!' :
                              res.error ? 'Error — try again' : 'Subscribed!';
            if (res.error && res.error.code !== '23505') btn.disabled = false;
        } else { btn.textContent = 'Coming soon!'; }
        setTimeout(function () { btn.textContent = 'Subscribe'; btn.disabled = false; }, 3000);
    });
}

// --- init ---
document.addEventListener('DOMContentLoaded', function () {
    initSupabase();
    var onboarding = document.getElementById('onboarding');
    if (hasStarted()) {
        if (onboarding) onboarding.style.display = 'none';
        renderView();
    } else {
        var startBtn = document.getElementById('start-plan-btn');
        if (startBtn) startBtn.addEventListener('click', startPlan);
    }
    initSubscribeForm();
});

})();
