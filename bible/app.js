/**
 * Bible Reading Plan — Client-Side Logic
 *
 * Handles:
 * - Onboarding: new users start at Day 1
 * - Personalized day tracking (each user has their own current_day)
 * - Reading progress via Supabase
 * - Translation toggle (NIV/ESV)
 * - Email subscription form
 */

const SUPABASE_URL = 'https://iaspidhmxppsuwydmvym.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hl2mvfwXvLILtYRqg15v3Q_sbI2dRNG';

let supabase = null;
let readingPlan = null;

// Initialize Supabase client
function initSupabase() {
    try {
        if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
    } catch (e) {
        console.warn('Supabase init failed:', e);
    }
}

// Get or create anonymous user ID
function getUserId() {
    let userId = localStorage.getItem('bible_user_id');
    if (!userId) {
        userId = crypto.randomUUID();
        localStorage.setItem('bible_user_id', userId);
    }
    return userId;
}

// Check if user has started the plan
function hasStarted() {
    return localStorage.getItem('bible_started') === 'true';
}

// Get user's current day
function getCurrentDay() {
    return parseInt(localStorage.getItem('bible_current_day') || '1');
}

// Set user's current day
function setCurrentDay(day) {
    localStorage.setItem('bible_current_day', String(day));
}

// Load reading plan JSON
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

// Get entry by day number
function getEntryByDay(plan, dayNumber) {
    return plan.find(e => e.day_number === dayNumber) || null;
}

// Get week entries for a given day
function getWeekEntries(plan, week) {
    return plan.filter(e => e.week === week);
}

// --- Onboarding ---

function startPlan() {
    localStorage.setItem('bible_started', 'true');
    setCurrentDay(1);
    getUserId(); // ensure user ID exists
    renderPersonalizedView();
}

// --- Rendering ---

async function renderPersonalizedView() {
    const plan = await loadReadingPlan();
    if (!plan) return;

    const currentDay = getCurrentDay();
    const entry = getEntryByDay(plan, currentDay);
    if (!entry) return;

    // Hide onboarding, show reading sections
    const onboarding = document.getElementById('onboarding');
    const todaysReading = document.getElementById('todays-reading');
    const weekStrip = document.getElementById('week-strip');

    if (onboarding) onboarding.style.display = 'none';
    if (todaysReading) {
        todaysReading.style.display = 'block';
        todaysReading.innerHTML = renderTodayCard(entry);
    }
    if (weekStrip) {
        weekStrip.style.display = 'block';
        weekStrip.innerHTML = renderWeekStrip(plan, entry);
    }

    // Load and render completed days
    await renderProgress(plan);

    // Update archive with post links
    await renderArchive(plan);
}

function renderTodayCard(entry) {
    const dateObj = new Date(entry.date + 'T12:00:00');
    const dateFormatted = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: '2-digit' });

    return `
        <p class="progress-indicator">Day ${entry.day_number} of 364 &bull; Week ${entry.week}</p>
        <div class="reading-card featured" data-day-number="${entry.day_number}">
            <div class="reading-card-header">
                <span class="genre-badge" data-genre="${entry.genre}">${entry.genre}</span>
                <span class="reading-card-meta">${dateFormatted}</span>
            </div>
            <div class="passage-ref">${entry.passage}</div>
            <div class="reading-card-actions">
                <a href="/bible/posts/${entry.date}.html" class="read-analysis-link">Read Analysis &rarr;</a>
                <label class="mark-read-label">
                    <input type="checkbox" class="mark-read-checkbox" data-day-number="${entry.day_number}">
                    Mark as read
                </label>
            </div>
        </div>`;
}

function renderWeekStrip(plan, currentEntry) {
    const weekEntries = getWeekEntries(plan, currentEntry.week);
    const currentDay = getCurrentDay();

    let cards = '';
    for (const day of weekEntries) {
        const isToday = day.day_number === currentDay;
        const classes = `week-day-card${isToday ? ' today' : ''}`;

        cards += `
            <a href="/bible/posts/${day.date}.html"
               class="${classes}"
               data-day-number="${day.day_number}">
                <div class="week-day-label">${day.weekday.slice(0, 3)}</div>
                <div class="week-day-passage">${day.passage}</div>
                <span class="genre-badge" data-genre="${day.genre}">${day.genre}</span>
            </a>`;
    }

    return `
        <h2 class="week-strip-title">Week ${currentEntry.week}</h2>
        <div class="week-strip-grid">${cards}</div>`;
}

async function renderArchive(plan) {
    const archiveList = document.getElementById('archive-list');
    if (!archiveList) return;

    // Show all days up to current day as archive items
    const currentDay = getCurrentDay();
    const pastDays = plan.filter(e => e.day_number <= currentDay).reverse();

    if (pastDays.length === 0) {
        archiveList.innerHTML = '<li class="archive-empty">Complete your first reading to see it here.</li>';
        return;
    }

    let html = '';
    for (const entry of pastDays) {
        const dateObj = new Date(entry.date + 'T12:00:00');
        const dateFormatted = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: '2-digit' });

        html += `<li><a href="/bible/posts/${entry.date}.html">
            <div class="archive-item-left">
                <span class="genre-badge" data-genre="${entry.genre}">${entry.genre}</span>
                <span class="archive-passage">Day ${entry.day_number}: ${entry.passage}</span>
            </div>
            <span class="archive-date">${dateFormatted}</span>
        </a></li>`;
    }

    archiveList.innerHTML = html;
}

// --- Progress Tracking ---

async function renderProgress(plan) {
    if (!supabase) return;

    const userId = getUserId();

    try {
        const { data } = await supabase
            .from('bible_reading_progress')
            .select('day_number, completed')
            .eq('user_id', userId);

        if (data) {
            const completed = new Set(data.filter(r => r.completed).map(r => r.day_number));

            document.querySelectorAll('[data-day-number]').forEach(el => {
                const dayNum = parseInt(el.dataset.dayNumber);
                if (completed.has(dayNum)) {
                    const checkbox = el.querySelector('input[type="checkbox"]');
                    if (checkbox) checkbox.checked = true;
                    el.classList.add('completed');
                }
            });
        }
    } catch (e) {
        console.error('Failed to load progress:', e);
    }

    // Bind checkbox events
    document.querySelectorAll('.mark-read-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const dayNumber = parseInt(e.target.dataset.dayNumber);
            await toggleProgress(dayNumber, e.target.checked);
        });
    });
}

async function toggleProgress(dayNumber, completed) {
    const userId = getUserId();

    if (supabase) {
        await supabase
            .from('bible_reading_progress')
            .upsert({
                user_id: userId,
                day_number: dayNumber,
                completed: completed,
                completed_at: completed ? new Date().toISOString() : null,
            }, { onConflict: 'user_id,day_number' });
    }

    // Update UI
    const card = document.querySelector(`[data-day-number="${dayNumber}"]`);
    if (card) card.classList.toggle('completed', completed);

    // If marking current day as read, advance to next day
    if (completed && dayNumber === getCurrentDay()) {
        setCurrentDay(dayNumber + 1);
        // Re-render to show next day
        setTimeout(() => renderPersonalizedView(), 500);
    }
}

// --- Translation Toggle ---

function initTranslationToggle() {
    const saved = localStorage.getItem('bible_translation') || 'NIV';
    setTranslation(saved);

    document.querySelectorAll('.translation-toggle button').forEach(btn => {
        btn.addEventListener('click', () => {
            setTranslation(btn.dataset.translation);
        });
    });
}

function setTranslation(translation) {
    localStorage.setItem('bible_translation', translation);

    document.querySelectorAll('.passage-text[data-translation]').forEach(el => {
        el.classList.toggle('active', el.dataset.translation === translation);
    });

    document.querySelectorAll('.translation-toggle button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.translation === translation);
    });

    document.querySelectorAll('.copyright-notice[data-translation]').forEach(el => {
        el.style.display = el.dataset.translation === translation ? 'block' : 'none';
    });
}

// --- Subscribe Form ---

function initSubscribeForm() {
    const form = document.getElementById('subscribe-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = form.querySelector('input[type="email"]').value;
        const button = form.querySelector('button');

        button.textContent = 'Subscribing...';
        button.disabled = true;

        if (supabase) {
            const { error } = await supabase
                .from('bible_subscribers')
                .insert({ email: email, subscribed_at: new Date().toISOString() });

            if (error && error.code === '23505') {
                button.textContent = 'Already subscribed!';
            } else if (error) {
                button.textContent = 'Error — try again';
                button.disabled = false;
            } else {
                button.textContent = 'Subscribed!';
            }
        } else {
            button.textContent = 'Coming soon!';
        }

        setTimeout(() => {
            button.textContent = 'Subscribe';
            button.disabled = false;
        }, 3000);
    });
}

// --- Init ---

document.addEventListener('DOMContentLoaded', async () => {
    initSupabase();

    const onboarding = document.getElementById('onboarding');

    if (hasStarted()) {
        // Returning user — hide onboarding, show personalized view
        if (onboarding) onboarding.style.display = 'none';
        await renderPersonalizedView();
    } else {
        // New user — onboarding is visible by default
        const startBtn = document.getElementById('start-plan-btn');
        if (startBtn) {
            startBtn.addEventListener('click', startPlan);
        }
    }

    initTranslationToggle();
    initSubscribeForm();
});
