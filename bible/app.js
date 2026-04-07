/**
 * Bible Reading Plan — Client-Side Logic
 *
 * Handles:
 * - User ID generation and persistence (localStorage)
 * - Reading progress tracking via Supabase
 * - Translation toggle (NIV/ESV)
 * - Email subscription form
 */

// Supabase config — will be set during Supabase project setup
const SUPABASE_URL = 'https://iaspidhmxppsuwydmvym.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hl2mvfwXvLILtYRqg15v3Q_sbI2dRNG';

let supabase = null;

// Initialize Supabase client if configured
function initSupabase() {
    if (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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

// Translation toggle
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

    // Toggle passage text visibility
    document.querySelectorAll('.passage-text[data-translation]').forEach(el => {
        el.classList.toggle('active', el.dataset.translation === translation);
    });

    // Toggle button active state
    document.querySelectorAll('.translation-toggle button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.translation === translation);
    });

    // Toggle copyright notices
    document.querySelectorAll('.copyright-notice[data-translation]').forEach(el => {
        el.style.display = el.dataset.translation === translation ? 'block' : 'none';
    });
}

// Reading progress — checkbox handling
async function initProgress() {
    if (!supabase) return;

    const userId = getUserId();

    // Load existing progress
    const { data } = await supabase
        .from('bible_reading_progress')
        .select('day_number, completed')
        .eq('user_id', userId);

    if (data) {
        const completed = new Set(data.filter(r => r.completed).map(r => r.day_number));

        // Check off completed days
        document.querySelectorAll('[data-day-number]').forEach(el => {
            const dayNum = parseInt(el.dataset.dayNumber);
            if (completed.has(dayNum)) {
                const checkbox = el.querySelector('input[type="checkbox"]');
                if (checkbox) checkbox.checked = true;
                el.classList.add('completed');
            }
        });
    }

    // Bind checkbox change events
    document.querySelectorAll('.mark-read-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const dayNumber = parseInt(e.target.dataset.dayNumber);
            await toggleProgress(dayNumber, e.target.checked);
        });
    });
}

async function toggleProgress(dayNumber, completed) {
    if (!supabase) return;

    const userId = getUserId();

    await supabase
        .from('bible_reading_progress')
        .upsert({
            user_id: userId,
            day_number: dayNumber,
            completed: completed,
            completed_at: completed ? new Date().toISOString() : null,
        }, { onConflict: 'user_id,day_number' });

    // Update UI
    const card = document.querySelector(`[data-day-number="${dayNumber}"]`);
    if (card) {
        card.classList.toggle('completed', completed);
    }
}

// Subscribe form
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
            // Supabase not configured yet
            button.textContent = 'Coming soon!';
        }

        setTimeout(() => {
            button.textContent = 'Subscribe';
            button.disabled = false;
        }, 3000);
    });
}

// Smooth scroll for anchor links
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

// Initialize everything on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
    initTranslationToggle();
    initProgress();
    initSubscribeForm();
    initSmoothScroll();
});
