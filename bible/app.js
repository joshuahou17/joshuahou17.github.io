(function() {
'use strict';

var SUPABASE_URL = 'https://iaspidhmxppsuwydmvym.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlhc3BpZGhteHBwc3V3eWRtdnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MjY5MjUsImV4cCI6MjA5MTEwMjkyNX0.1tnqoNxczpZkEUyUEdi0W1pLh8nwL7LE1Ig5PgjSU5U';

var sb = null;
var readingPlan = null;
var nivBible = null;

var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

var NIV_COPYRIGHT = 'Scripture quotations taken from The Holy Bible, New International Version\u00ae NIV\u00ae. Copyright \u00a9 1973, 1978, 1984, 2011 by Biblica, Inc.\u2122 Used by permission. All rights reserved worldwide.';

function initSupabase() {
    try {
        if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
            sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
    } catch (e) { /* ignore */ }
}

function getUserId() {
    var userId = localStorage.getItem('bible_user_id');
    if (!userId) {
        userId = crypto.randomUUID();
        localStorage.setItem('bible_user_id', userId);
    }
    return userId;
}

function hasStarted() { return localStorage.getItem('bible_started') === 'true'; }
function getCurrentDay() { return parseInt(localStorage.getItem('bible_current_day') || '1'); }
function setCurrentDay(day) { localStorage.setItem('bible_current_day', String(day)); }

function getUserDateForDay(dayNumber) {
    var startDate = localStorage.getItem('bible_start_date');
    if (!startDate) return new Date();
    var d = new Date(startDate + 'T12:00:00');
    d.setDate(d.getDate() + (dayNumber - 1));
    return d;
}

async function loadReadingPlan() {
    if (readingPlan) return readingPlan;
    try {
        var resp = await fetch('/scripts/reading_plan.json');
        readingPlan = await resp.json();
        return readingPlan;
    } catch (e) { return null; }
}

async function loadNivBible() {
    if (nivBible) return nivBible;
    try {
        var resp = await fetch('/bible/niv.json');
        nivBible = await resp.json();
        return nivBible;
    } catch (e) { return null; }
}

function getEntryByDay(plan, dayNumber) {
    return plan.find(function(e) { return e.day_number === dayNumber; }) || null;
}

function getPersonalWeekEntries(plan, dayNumber) {
    var weekStart = Math.floor((dayNumber - 1) / 7) * 7 + 1;
    var entries = [];
    for (var i = 0; i < 7; i++) {
        var entry = getEntryByDay(plan, weekStart + i);
        if (entry) entries.push(entry);
    }
    return entries;
}

// --- Bible Text ---

function getPassageText(bible, book, chapters) {
    if (!bible || !bible[book]) return null;

    var result = [];
    for (var i = 0; i < chapters.length; i++) {
        var ch = String(chapters[i]);
        var chData = bible[book][ch];
        if (!chData) continue;

        var verses = [];
        // Sort verse numbers numerically
        var verseNums = Object.keys(chData).sort(function(a, b) { return parseInt(a) - parseInt(b); });
        for (var j = 0; j < verseNums.length; j++) {
            verses.push({ num: verseNums[j], text: chData[verseNums[j]] });
        }
        result.push({ chapter: chapters[i], verses: verses });
    }
    return result.length > 0 ? result : null;
}

function renderPassageHtml(chaptersData, multiChapter) {
    var html = '';
    for (var c = 0; c < chaptersData.length; c++) {
        var ch = chaptersData[c];
        if (multiChapter) {
            html += '<h3 class="chapter-heading">Chapter ' + ch.chapter + '</h3>';
        }
        html += '<p class="verse-block">';
        for (var v = 0; v < ch.verses.length; v++) {
            var verse = ch.verses[v];
            html += '<span class="verse"><sup class="verse-num">' + verse.num + '</sup>\u00a0' + verse.text + ' </span>';
        }
        html += '</p>';
    }
    return html;
}

// --- Onboarding ---

async function startPlan() {
    var today = new Date().toLocaleDateString('en-CA');
    localStorage.setItem('bible_started', 'true');
    localStorage.setItem('bible_start_date', today);
    setCurrentDay(1);
    getUserId();
    await renderPersonalizedView();
}

// --- Rendering ---

async function renderPersonalizedView() {
    var plan = await loadReadingPlan();
    if (!plan) return;

    var currentDay = getCurrentDay();
    var entry = getEntryByDay(plan, currentDay);
    if (!entry) return;

    var onboarding = document.getElementById('onboarding');
    var todaysReading = document.getElementById('todays-reading');
    var weekStrip = document.getElementById('week-strip');

    if (onboarding) onboarding.style.display = 'none';
    if (todaysReading) {
        todaysReading.style.display = 'block';
        todaysReading.innerHTML = renderTodayCard(entry);
    }
    if (weekStrip) {
        weekStrip.style.display = 'block';
        weekStrip.innerHTML = renderWeekStrip(plan, entry);
    }

    // Load and display Bible text
    loadPassageForDay(entry);

    await renderProgress(plan);
    await renderArchive(plan);
}

function renderTodayCard(entry) {
    var dateObj = getUserDateForDay(entry.day_number);
    var dateFormatted = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: '2-digit' });
    var weekday = WEEKDAYS[dateObj.getDay()];
    var personalWeek = Math.ceil(entry.day_number / 7);

    return '<p class="progress-indicator">Day ' + entry.day_number + ' of 364 &bull; Week ' + personalWeek + '</p>' +
        '<div class="reading-card featured" data-day-number="' + entry.day_number + '">' +
            '<div class="reading-card-header">' +
                '<span class="genre-badge" data-genre="' + entry.genre + '">' + entry.genre + '</span>' +
                '<span class="reading-card-meta">' + weekday + ', ' + dateFormatted + '</span>' +
            '</div>' +
            '<div class="passage-ref">' + entry.passage + '</div>' +
            '<div class="reading-card-actions">' +
                '<label class="mark-read-label">' +
                    '<input type="checkbox" class="mark-read-checkbox" data-day-number="' + entry.day_number + '">' +
                    ' Mark as read' +
                '</label>' +
            '</div>' +
        '</div>' +
        '<div id="passage-text-container" class="passage-text active" style="margin-top: 1.5rem;">' +
            '<p style="color: #BDBDBD; font-style: italic;">Loading passage...</p>' +
        '</div>' +
        '<p class="copyright-notice" id="passage-copyright"></p>' +
        '<div id="analysis-container" class="analysis-section" style="display: none;">' +
            '<h3>Analysis</h3>' +
            '<div id="analysis-content"></div>' +
        '</div>';
}

async function loadPassageForDay(entry) {
    var container = document.getElementById('passage-text-container');
    var copyright = document.getElementById('passage-copyright');
    if (!container) return;

    var bible = await loadNivBible();
    var chaptersData = bible ? getPassageText(bible, entry.book, entry.chapters) : null;

    if (chaptersData) {
        var multiChapter = chaptersData.length > 1;
        container.innerHTML = renderPassageHtml(chaptersData, multiChapter);
        if (copyright) copyright.textContent = NIV_COPYRIGHT;
    } else {
        container.innerHTML = '<p style="color: #9E9E9E;"><em>Unable to load passage text. Please read ' + entry.passage + ' in your Bible.</em></p>';
    }

    // Try to load analysis from generated post
    loadAnalysisForDay(entry);
}

async function loadAnalysisForDay(entry) {
    var analysisContainer = document.getElementById('analysis-container');
    var analysisContent = document.getElementById('analysis-content');
    if (!analysisContainer || !analysisContent) return;

    try {
        var resp = await fetch('/bible/posts/' + entry.date + '.html');
        if (!resp.ok) return;

        var html = await resp.text();
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var analysis = doc.querySelector('.analysis-section');

        if (analysis && analysis.innerHTML.trim()) {
            analysisContent.innerHTML = analysis.innerHTML;
            analysisContainer.style.display = 'block';
        }
    } catch (e) { /* no post yet */ }
}

function renderWeekStrip(plan, currentEntry) {
    var weekEntries = getPersonalWeekEntries(plan, currentEntry.day_number);
    var currentDay = getCurrentDay();
    var personalWeek = Math.ceil(currentEntry.day_number / 7);

    var cards = '';
    for (var i = 0; i < weekEntries.length; i++) {
        var day = weekEntries[i];
        var isToday = day.day_number === currentDay;
        var dateObj = getUserDateForDay(day.day_number);
        var weekdayLabel = WEEKDAYS[dateObj.getDay()];
        var cls = 'week-day-card' + (isToday ? ' today' : '');

        cards += '<div class="' + cls + '" data-day-number="' + day.day_number + '">' +
                '<div class="week-day-label">' + weekdayLabel + '</div>' +
                '<div class="week-day-passage">' + day.passage + '</div>' +
                '<span class="genre-badge" data-genre="' + day.genre + '">' + day.genre + '</span>' +
            '</div>';
    }

    return '<h2 class="week-strip-title">Week ' + personalWeek + '</h2>' +
        '<div class="week-strip-grid">' + cards + '</div>';
}

async function renderArchive(plan) {
    var archiveList = document.getElementById('archive-list');
    if (!archiveList) return;

    var currentDay = getCurrentDay();
    var pastDays = plan.filter(function(e) { return e.day_number <= currentDay; }).reverse();

    if (pastDays.length === 0) {
        archiveList.innerHTML = '<li class="archive-empty">Complete your first reading to see it here.</li>';
        return;
    }

    var html = '';
    for (var i = 0; i < pastDays.length; i++) {
        var entry = pastDays[i];
        var dateObj = getUserDateForDay(entry.day_number);
        var dateFormatted = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: '2-digit' });

        html += '<li><div class="archive-item-left" style="display:flex;align-items:center;gap:0.75rem;padding:1rem 0.5rem;">' +
                '<span class="genre-badge" data-genre="' + entry.genre + '">' + entry.genre + '</span>' +
                '<span class="archive-passage">Day ' + entry.day_number + ': ' + entry.passage + '</span>' +
                '<span class="archive-date" style="margin-left:auto;">' + dateFormatted + '</span>' +
            '</div></li>';
    }

    archiveList.innerHTML = html;
}

// --- Progress ---

async function renderProgress() {
    if (!sb) return;
    var userId = getUserId();
    try {
        var result = await sb.from('bible_reading_progress').select('day_number, completed').eq('user_id', userId);
        if (result.data) {
            var completed = {};
            result.data.forEach(function(r) { if (r.completed) completed[r.day_number] = true; });
            document.querySelectorAll('[data-day-number]').forEach(function(el) {
                var dayNum = parseInt(el.dataset.dayNumber);
                if (completed[dayNum]) {
                    var cb = el.querySelector('input[type="checkbox"]');
                    if (cb) cb.checked = true;
                    el.classList.add('completed');
                }
            });
        }
    } catch (e) { /* ignore */ }

    document.querySelectorAll('.mark-read-checkbox').forEach(function(checkbox) {
        checkbox.addEventListener('change', function(e) {
            toggleProgress(parseInt(e.target.dataset.dayNumber), e.target.checked);
        });
    });
}

async function toggleProgress(dayNumber, completed) {
    var userId = getUserId();
    if (sb) {
        await sb.from('bible_reading_progress').upsert({
            user_id: userId, day_number: dayNumber,
            completed: completed, completed_at: completed ? new Date().toISOString() : null,
        }, { onConflict: 'user_id,day_number' });
    }

    var card = document.querySelector('[data-day-number="' + dayNumber + '"]');
    if (card) card.classList.toggle('completed', completed);

    if (completed && dayNumber === getCurrentDay()) {
        setCurrentDay(dayNumber + 1);
        setTimeout(renderPersonalizedView, 500);
    }
}

// --- Translation Toggle (for post pages) ---

function initTranslationToggle() {
    document.querySelectorAll('.translation-toggle button').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var t = btn.dataset.translation;
            localStorage.setItem('bible_translation', t);
            document.querySelectorAll('.passage-text[data-translation]').forEach(function(el) {
                el.classList.toggle('active', el.dataset.translation === t);
            });
            document.querySelectorAll('.translation-toggle button').forEach(function(b) {
                b.classList.toggle('active', b.dataset.translation === t);
            });
        });
    });
}

// --- Subscribe ---

function initSubscribeForm() {
    var form = document.getElementById('subscribe-form');
    if (!form) return;
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        var email = form.querySelector('input[type="email"]').value;
        var button = form.querySelector('button');
        button.textContent = 'Subscribing...';
        button.disabled = true;

        if (sb) {
            var result = await sb.from('bible_subscribers').insert({ email: email, subscribed_at: new Date().toISOString() });
            button.textContent = (result.error && result.error.code === '23505') ? 'Already subscribed!' :
                                  result.error ? 'Error — try again' : 'Subscribed!';
            if (result.error && result.error.code !== '23505') button.disabled = false;
        } else {
            button.textContent = 'Coming soon!';
        }
        setTimeout(function() { button.textContent = 'Subscribe'; button.disabled = false; }, 3000);
    });
}

// --- Init ---

document.addEventListener('DOMContentLoaded', async function() {
    initSupabase();
    var onboarding = document.getElementById('onboarding');

    if (hasStarted()) {
        if (onboarding) onboarding.style.display = 'none';
        await renderPersonalizedView();
    } else {
        var startBtn = document.getElementById('start-plan-btn');
        if (startBtn) startBtn.addEventListener('click', startPlan);
    }

    initTranslationToggle();
    initSubscribeForm();
});

})();
