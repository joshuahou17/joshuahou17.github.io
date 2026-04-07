(function() {
'use strict';

const SUPABASE_URL = 'https://iaspidhmxppsuwydmvym.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlhc3BpZGhteHBwc3V3eWRtdnltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MjY5MjUsImV4cCI6MjA5MTEwMjkyNX0.1tnqoNxczpZkEUyUEdi0W1pLh8nwL7LE1Ig5PgjSU5U';

let sb = null;
let readingPlan = null;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function initSupabase() {
    try {
        if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
            sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
    } catch (e) {
        console.warn('Supabase init failed:', e);
    }
}

function getUserId() {
    let userId = localStorage.getItem('bible_user_id');
    if (!userId) {
        userId = crypto.randomUUID();
        localStorage.setItem('bible_user_id', userId);
    }
    return userId;
}

function hasStarted() {
    return localStorage.getItem('bible_started') === 'true';
}

function getCurrentDay() {
    return parseInt(localStorage.getItem('bible_current_day') || '1');
}

function setCurrentDay(day) {
    localStorage.setItem('bible_current_day', String(day));
}

// Get the user's personal date for a given day number
// Day 1 = the date the user clicked Start
function getUserDateForDay(dayNumber) {
    const startDate = localStorage.getItem('bible_start_date');
    if (!startDate) return new Date();
    const d = new Date(startDate + 'T12:00:00');
    d.setDate(d.getDate() + (dayNumber - 1));
    return d;
}

async function loadReadingPlan() {
    if (readingPlan) return readingPlan;
    try {
        const resp = await fetch('/scripts/reading_plan.json');
        readingPlan = await resp.json();
        return readingPlan;
    } catch (e) {
        console.error('Failed to load reading plan:', e);
        return null;
    }
}

function getEntryByDay(plan, dayNumber) {
    return plan.find(function(e) { return e.day_number === dayNumber; }) || null;
}

// Get 7 consecutive days starting from the beginning of the week containing dayNumber
function getPersonalWeekEntries(plan, dayNumber) {
    // Find which "week" this day falls in (groups of 7)
    var weekStart = Math.floor((dayNumber - 1) / 7) * 7 + 1;
    var entries = [];
    for (var i = 0; i < 7; i++) {
        var entry = getEntryByDay(plan, weekStart + i);
        if (entry) entries.push(entry);
    }
    return entries;
}

// --- Onboarding ---

async function startPlan() {
    var today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
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
                '<a href="/bible/posts/' + entry.date + '.html" class="read-analysis-link">Read Analysis &rarr;</a>' +
                '<label class="mark-read-label">' +
                    '<input type="checkbox" class="mark-read-checkbox" data-day-number="' + entry.day_number + '">' +
                    ' Mark as read' +
                '</label>' +
            '</div>' +
        '</div>';
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

        cards += '<a href="/bible/posts/' + day.date + '.html" class="' + cls + '" data-day-number="' + day.day_number + '">' +
                '<div class="week-day-label">' + weekdayLabel + '</div>' +
                '<div class="week-day-passage">' + day.passage + '</div>' +
                '<span class="genre-badge" data-genre="' + day.genre + '">' + day.genre + '</span>' +
            '</a>';
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

        html += '<li><a href="/bible/posts/' + entry.date + '.html">' +
            '<div class="archive-item-left">' +
                '<span class="genre-badge" data-genre="' + entry.genre + '">' + entry.genre + '</span>' +
                '<span class="archive-passage">Day ' + entry.day_number + ': ' + entry.passage + '</span>' +
            '</div>' +
            '<span class="archive-date">' + dateFormatted + '</span>' +
        '</a></li>';
    }

    archiveList.innerHTML = html;
}

// --- Progress Tracking ---

async function renderProgress(plan) {
    if (!sb) return;

    var userId = getUserId();

    try {
        var result = await sb
            .from('bible_reading_progress')
            .select('day_number, completed')
            .eq('user_id', userId);

        if (result.data) {
            var completed = {};
            result.data.forEach(function(r) { if (r.completed) completed[r.day_number] = true; });

            document.querySelectorAll('[data-day-number]').forEach(function(el) {
                var dayNum = parseInt(el.dataset.dayNumber);
                if (completed[dayNum]) {
                    var checkbox = el.querySelector('input[type="checkbox"]');
                    if (checkbox) checkbox.checked = true;
                    el.classList.add('completed');
                }
            });
        }
    } catch (e) {
        console.error('Failed to load progress:', e);
    }

    document.querySelectorAll('.mark-read-checkbox').forEach(function(checkbox) {
        checkbox.addEventListener('change', function(e) {
            var dayNumber = parseInt(e.target.dataset.dayNumber);
            toggleProgress(dayNumber, e.target.checked);
        });
    });
}

async function toggleProgress(dayNumber, completed) {
    var userId = getUserId();

    if (sb) {
        await sb
            .from('bible_reading_progress')
            .upsert({
                user_id: userId,
                day_number: dayNumber,
                completed: completed,
                completed_at: completed ? new Date().toISOString() : null,
            }, { onConflict: 'user_id,day_number' });
    }

    var card = document.querySelector('[data-day-number="' + dayNumber + '"]');
    if (card) card.classList.toggle('completed', completed);

    if (completed && dayNumber === getCurrentDay()) {
        setCurrentDay(dayNumber + 1);
        setTimeout(renderPersonalizedView, 500);
    }
}

// --- Translation Toggle ---

function initTranslationToggle() {
    var saved = localStorage.getItem('bible_translation') || 'NIV';
    setTranslation(saved);

    document.querySelectorAll('.translation-toggle button').forEach(function(btn) {
        btn.addEventListener('click', function() {
            setTranslation(btn.dataset.translation);
        });
    });
}

function setTranslation(translation) {
    localStorage.setItem('bible_translation', translation);

    document.querySelectorAll('.passage-text[data-translation]').forEach(function(el) {
        el.classList.toggle('active', el.dataset.translation === translation);
    });

    document.querySelectorAll('.translation-toggle button').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.translation === translation);
    });

    document.querySelectorAll('.copyright-notice[data-translation]').forEach(function(el) {
        el.style.display = el.dataset.translation === translation ? 'block' : 'none';
    });
}

// --- Subscribe Form ---

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
            var result = await sb
                .from('bible_subscribers')
                .insert({ email: email, subscribed_at: new Date().toISOString() });

            if (result.error && result.error.code === '23505') {
                button.textContent = 'Already subscribed!';
            } else if (result.error) {
                button.textContent = 'Error — try again';
                button.disabled = false;
            } else {
                button.textContent = 'Subscribed!';
            }
        } else {
            button.textContent = 'Coming soon!';
        }

        setTimeout(function() {
            button.textContent = 'Subscribe';
            button.disabled = false;
        }, 3000);
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
        if (startBtn) {
            startBtn.addEventListener('click', startPlan);
        }
    }

    initTranslationToggle();
    initSubscribeForm();
});

})();
