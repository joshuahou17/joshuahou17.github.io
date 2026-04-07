"""
Configuration for the daily Bible reading plan generator.
Templates, prompts, constants, and mappings.
"""

# Genre → color mapping (matches bible/styles.css)
GENRE_COLORS = {
    "Epistles": "#6366F1",
    "The Law": "#D97706",
    "History": "#059669",
    "Psalms": "#7C3AED",
    "Poetry": "#DB2777",
    "Prophecy": "#EA580C",
    "Gospels": "#2563EB",
}

# Claude system prompt for passage analysis
BIBLE_SYSTEM_PROMPT = """You are a biblical scholar and pastor writing a daily reading guide. Your tone blends academic rigor with warm devotional insight. You write for an intellectually curious Christian who wants depth — not platitudes. Always ground claims in the text itself. When referencing commentary or scholarship, be specific about the source. Use web search to find reputable analysis of the specific passage.

Your analysis should be 600-900 words and cover:
1. **Context**: Where does this passage sit in the book's narrative arc? What came before it and what comes after?
2. **Key Themes**: 2-3 major themes or theological concepts in this passage.
3. **Cross-References**: How does this passage connect to what the reader has already read in this plan? Reference specific prior passages when relevant.
4. **Historical/Cultural Background**: Any important context about the original audience, author, or setting.
5. **Reflection**: A closing devotional reflection — what does this passage invite the reader to consider or apply?

Output valid JSON in this exact format:
{
  "title": "A short evocative title for today's reading",
  "summary": "1-2 sentence overview of the passage",
  "analysis": "The full 600-900 word analysis in HTML (use <h3>, <p>, <em> tags)",
  "cross_references": ["List of 3-5 specific verse cross-references as strings"],
  "sources": [{"name": "Source Name", "url": "https://..."}]
}"""

BIBLE_USER_PROMPT_TEMPLATE = """Today's reading for the 365-day Bible reading plan:

**Day {day_number} of 364** — {weekday}
**Genre**: {genre}
**Passage**: {passage}

{passage_text_section}

{context_section}

Please provide your analysis of this passage. Search the web for reputable commentary and scholarship on {passage} to enrich your analysis. Focus especially on sources like Bible Project, scholarly commentaries, and well-regarded theological resources."""

# OSIS book mapping (reused from parser, centralized here)
OSIS_BOOK_MAP = {
    "Genesis": "GEN", "Exodus": "EXO", "Leviticus": "LEV", "Numbers": "NUM",
    "Deuteronomy": "DEU", "Joshua": "JOS", "Judges": "JDG", "Ruth": "RUT",
    "1 Samuel": "1SA", "2 Samuel": "2SA", "1 Kings": "1KI", "2 Kings": "2KI",
    "1 Chronicles": "1CH", "2 Chronicles": "2CH", "Ezra": "EZR", "Nehemiah": "NEH",
    "Esther": "EST", "Job": "JOB", "Psalms": "PSA", "Proverbs": "PRO",
    "Ecclesiastes": "ECC", "Song of Solomon": "SNG",
    "Isaiah": "ISA", "Jeremiah": "JER", "Lamentations": "LAM",
    "Ezekiel": "EZK", "Daniel": "DAN",
    "Hosea": "HOS", "Joel": "JOL", "Amos": "AMO", "Obadiah": "OBA",
    "Jonah": "JON", "Micah": "MIC", "Nahum": "NAM", "Habakkuk": "HAB",
    "Zephaniah": "ZEP", "Haggai": "HAG", "Zechariah": "ZEC", "Malachi": "MAL",
    "Matthew": "MAT", "Mark": "MRK", "Luke": "LUK", "John": "JHN",
    "Acts": "ACT", "Romans": "ROM", "1 Corinthians": "1CO", "2 Corinthians": "2CO",
    "Galatians": "GAL", "Ephesians": "EPH", "Philippians": "PHP", "Colossians": "COL",
    "1 Thessalonians": "1TH", "2 Thessalonians": "2TH",
    "1 Timothy": "1TI", "2 Timothy": "2TI", "Titus": "TIT", "Philemon": "PHM",
    "Hebrews": "HEB", "James": "JAS", "1 Peter": "1PE", "2 Peter": "2PE",
    "1 John": "1JN", "2 John": "2JN", "3 John": "3JN", "Jude": "JUD",
    "Revelation": "REV",
}

# Copyright notices
NIV_COPYRIGHT = 'Scripture quotations taken from The Holy Bible, New International Version\u00ae NIV\u00ae. Copyright \u00a9 1973, 1978, 1984, 2011 by Biblica, Inc.\u2122 Used by permission. All rights reserved worldwide.'
ESV_COPYRIGHT = 'Scripture quotations are from the ESV\u00ae Bible, copyright \u00a9 2001 by Crossway. Used by permission. All rights reserved.'

# Jinja2 template for individual post pages
BIBLE_POST_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Day {{ day_number }}: {{ passage }} | Daily Bible Reading</title>
    <meta name="description" content="{{ summary }}">
    <meta property="og:title" content="Day {{ day_number }}: {{ passage }}">
    <meta property="og:description" content="{{ summary }}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="https://joshhou.com/bible/posts/{{ date_iso }}.html">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📖</text></svg>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../styles.css">
</head>
<body>
    <nav class="nav">
        <a href="/bible" class="nav-back">&larr; Daily Bible Reading</a>
    </nav>
    <main class="container">
        <div class="reading-card-header">
            <span class="genre-badge" data-genre="{{ genre }}">{{ genre }}</span>
            <span class="reading-card-meta">Day {{ day_number }} of 364 &bull; Week {{ week }} &bull; {{ date_formatted }}</span>
        </div>

        <h1 class="passage-ref" style="font-size: 2.25rem; margin-bottom: 0.5rem;">{{ passage }}</h1>

        {% if title %}
        <p class="analysis-title" style="font-size: 1.25rem; color: var(--gray-600); margin-bottom: 1.5rem;">{{ title }}</p>
        {% endif %}

        <div data-day-number="{{ day_number }}">
            <label class="mark-read-label">
                <input type="checkbox" class="mark-read-checkbox" data-day-number="{{ day_number }}">
                Mark as read
            </label>
        </div>

        {% if has_passage_text %}
        <div style="margin-top: var(--spacing-6);">
            {% if has_both_translations %}
            <div class="translation-toggle">
                <button data-translation="NIV" class="active">NIV</button>
                <button data-translation="ESV">ESV</button>
            </div>
            {% endif %}

            {% if niv_text %}
            <div class="passage-text{% if has_both_translations %} active{% endif %}" data-translation="NIV">
                {{ niv_text }}
            </div>
            {% endif %}

            {% if esv_text %}
            <div class="passage-text{% if not has_both_translations %} active{% endif %}" data-translation="ESV">
                {{ esv_text }}
            </div>
            {% endif %}

            {% if not has_both_translations and not niv_text and not esv_text %}
            <div class="passage-text active" data-translation="none">
                <em>Passage text unavailable. Please read {{ passage }} in your Bible.</em>
            </div>
            {% endif %}
        </div>
        {% endif %}

        {% if analysis %}
        <section class="analysis-section">
            {{ analysis }}
        </section>
        {% endif %}

        {% if cross_references %}
        <section class="cross-references">
            <h3>Cross References</h3>
            <ul>
                {% for ref in cross_references %}
                <li>{{ ref }}</li>
                {% endfor %}
            </ul>
        </section>
        {% endif %}

        {% if sources %}
        <section class="sources-section">
            <h3>Sources</h3>
            <ul class="sources-list">
                {% for source in sources %}
                <li><a href="{{ source.url }}" target="_blank" rel="noopener">{{ source.name }}</a></li>
                {% endfor %}
            </ul>
        </section>
        {% endif %}

        <div class="copyright-notice" data-translation="NIV" style="display: block;">
            {{ niv_copyright }}
        </div>
        <div class="copyright-notice" data-translation="ESV" style="display: none;">
            {{ esv_copyright }}
        </div>

        <nav class="post-nav">
            {% if prev_date %}
            <a href="/bible/posts/{{ prev_date }}.html">&larr; {{ prev_passage }}</a>
            {% else %}
            <span></span>
            {% endif %}

            {% if next_entry %}
            <div class="next-reading">
                <span class="label">Coming {{ 'tomorrow' if next_entry else 'next' }}</span>
                {% if next_date_has_post %}
                <a href="/bible/posts/{{ next_entry.date }}.html">{{ next_entry.passage }} &rarr;</a>
                {% else %}
                <span style="color: var(--gray-500); font-size: var(--font-size-sm);">{{ next_entry.passage }} — Analysis available tomorrow</span>
                {% endif %}
            </div>
            {% endif %}
        </nav>
    </main>
    <footer class="footer">
        <p>&copy; 2026 Joshua Hou. Daily analysis powered by Claude and web research.</p>
    </footer>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="../app.js"></script>
</body>
</html>"""

# Template snippet for today's reading card on index page
INDEX_TODAY_TEMPLATE = """
        <p class="progress-indicator">Day {{ day_number }} of 364 &bull; Week {{ week }}</p>

        <div class="reading-card featured" data-day-number="{{ day_number }}">
            <div class="reading-card-header">
                <span class="genre-badge" data-genre="{{ genre }}">{{ genre }}</span>
                <span class="reading-card-meta">{{ date_formatted }}</span>
            </div>
            <div class="passage-ref">{{ passage }}</div>
            {% if title %}
            <div class="analysis-title">{{ title }}</div>
            {% endif %}
            {% if summary %}
            <p class="summary">{{ summary }}</p>
            {% endif %}
            <div class="reading-card-actions">
                <a href="/bible/posts/{{ date_iso }}.html" class="read-analysis-link">Read Analysis &rarr;</a>
                <label class="mark-read-label">
                    <input type="checkbox" class="mark-read-checkbox" data-day-number="{{ day_number }}">
                    Mark as read
                </label>
            </div>
        </div>"""

# Template for the week strip on index page
INDEX_WEEK_TEMPLATE = """
        <h2 class="week-strip-title">Week {{ week }}</h2>
        <div class="week-strip-grid">
            {% for day in week_days %}
            <a href="{% if day.has_post %}/bible/posts/{{ day.date }}.html{% else %}#{% endif %}"
               class="week-day-card{% if day.is_today %} today{% endif %}"
               data-day-number="{{ day.day_number }}">
                <div class="week-day-label">{{ day.weekday[:3] }}</div>
                <div class="week-day-passage">{{ day.passage }}</div>
                <span class="genre-badge" data-genre="{{ day.genre }}">{{ day.genre }}</span>
            </a>
            {% endfor %}
        </div>"""

# Archive list item template
ARCHIVE_ITEM_TEMPLATE = """<li><a href="/bible/posts/{{ date_iso }}.html"><div class="archive-item-left"><span class="genre-badge" data-genre="{{ genre }}">{{ genre }}</span><span class="archive-passage">{{ passage }}</span></div><span class="archive-date">{{ date_formatted }}</span></a></li>"""

# Email HTML template for daily reading
EMAIL_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #212121; line-height: 1.6;">
    <div style="text-align: center; margin-bottom: 24px;">
        <span style="display: inline-block; background-color: {{ genre_color }}; color: white; padding: 4px 16px; border-radius: 999px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">{{ genre }}</span>
        <p style="color: #9E9E9E; font-size: 14px; margin-top: 8px;">Day {{ day_number }} of 364 &bull; Week {{ week }}</p>
    </div>

    <h1 style="text-align: center; font-size: 28px; margin-bottom: 8px;">{{ passage }}</h1>
    {% if title %}
    <p style="text-align: center; color: #757575; font-size: 16px; margin-bottom: 24px;">{{ title }}</p>
    {% endif %}

    {% if passage_text %}
    <div style="background: #FAFAFA; border: 1px solid #EEEEEE; border-radius: 8px; padding: 24px; margin-bottom: 24px; font-size: 16px; line-height: 1.8;">
        {{ passage_text }}
    </div>
    {% endif %}

    {% if analysis %}
    <div style="margin-bottom: 24px;">
        {{ analysis }}
    </div>
    {% endif %}

    {% if cross_references %}
    <div style="background: rgba(99, 102, 241, 0.08); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <h3 style="font-size: 16px; margin-bottom: 8px;">Cross References</h3>
        <p style="font-size: 14px; color: #6366F1;">{{ cross_references | join(' &bull; ') }}</p>
    </div>
    {% endif %}

    <div style="text-align: center; margin: 32px 0;">
        <a href="{{ mark_read_url }}" style="display: inline-block; background: #6366F1; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">Mark as Read &#10003;</a>
    </div>

    <div style="text-align: center; margin-bottom: 24px;">
        <a href="https://joshhou.com/bible/posts/{{ date_iso }}.html" style="color: #6366F1; text-decoration: none; font-size: 14px;">Read on the web &rarr;</a>
    </div>

    {% if next_entry %}
    <div style="background: #FAFAFA; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px;">
        <p style="font-size: 14px; color: #9E9E9E; margin-bottom: 4px;">Coming Tomorrow</p>
        <p style="font-weight: 600;">{{ next_entry.passage }} ({{ next_entry.genre }})</p>
    </div>
    {% endif %}

    <div style="border-top: 1px solid #EEEEEE; padding-top: 16px; margin-top: 32px; font-size: 12px; color: #9E9E9E; text-align: center;">
        <p>{{ copyright }}</p>
        <p style="margin-top: 8px;">
            <a href="{{ switch_translation_url }}" style="color: #9E9E9E;">Switch to {{ alt_translation }}</a>
            &bull;
            <a href="{{ unsubscribe_url }}" style="color: #9E9E9E;">Unsubscribe</a>
        </p>
    </div>
</body>
</html>"""

# Shorter reminder email template
REMINDER_EMAIL_TEMPLATE = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #212121; line-height: 1.6; text-align: center;">
    <p style="color: #9E9E9E; font-size: 14px;">Day {{ day_number }} of 364</p>
    <h2 style="font-size: 24px; margin-bottom: 8px;">{{ passage }}</h2>
    <span style="display: inline-block; background-color: {{ genre_color }}; color: white; padding: 4px 16px; border-radius: 999px; font-size: 12px; font-weight: 600; text-transform: uppercase;">{{ genre }}</span>

    {% if summary %}
    <p style="color: #616161; margin: 24px 0;">{{ summary }}</p>
    {% endif %}

    <div style="margin: 32px 0;">
        <a href="{{ mark_read_url }}" style="display: inline-block; background: #6366F1; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Mark as Read &#10003;</a>
    </div>

    <a href="https://joshhou.com/bible/posts/{{ date_iso }}.html" style="color: #6366F1; text-decoration: none; font-size: 14px;">Read on the web &rarr;</a>

    <div style="border-top: 1px solid #EEEEEE; padding-top: 16px; margin-top: 32px; font-size: 12px; color: #9E9E9E;">
        <a href="{{ unsubscribe_url }}" style="color: #9E9E9E;">Unsubscribe</a>
    </div>
</body>
</html>"""
