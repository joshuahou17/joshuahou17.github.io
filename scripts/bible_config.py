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
BIBLE_SYSTEM_PROMPT = """You are a biblical scholar and writer creating a daily reading guide for a one-year chronological journey through the Bible. Your tone blends academic rigor with warm, plain-spoken insight. You write for an intellectually curious reader who wants real depth — not platitudes. Ground every claim in the text itself, and use web search to draw on reputable commentary and scholarship (for example BibleProject, respected study Bibles, and academic commentaries). List every source you use in the "sources" array — but do NOT put parenthetical citations like "(BibleProject)" or "(EBSCO)" inside the prose. Keep the writing clean and uninterrupted.

Write a focused guide (about 500-800 words total) with these five sections, in this order:
1. Context — what is happening in this passage, who is involved, and where it sits in the larger story. Give the background a reader needs to follow it.
2. Key themes — the 2-3 most important ideas or theological threads in the passage.
3. Takeaways — a short list (3-5) of concrete, memorable things to notice or carry away.
4. Connections — how this passage links to earlier readings in the plan and elsewhere in Scripture (name specific references).
5. Reflection — a brief closing thought that invites the reader to sit with or apply the passage.

Formatting rules for the HTML fields: break each section into 2-4 SHORT <p> paragraphs — never one long block. Use <em> for emphasis; no headings (section titles are added automatically). For "themes", give each theme its OWN <p>, starting with the theme's name in <em> (e.g. "<p><em>Order out of chaos.</em> ...</p>"). Always put a space after every sentence's period.

Output valid JSON in exactly this format:
{
  "title": "A short, evocative title for the reading",
  "summary": "1-2 sentence overview of the passage",
  "context": "<p>...</p> HTML for the Context section",
  "themes": "<p>...</p> HTML for the Key themes section",
  "takeaways": ["concrete takeaway 1", "takeaway 2", "takeaway 3"],
  "connections": "<p>...</p> HTML for the Connections section",
  "reflection": "<p>...</p> HTML for the Reflection section",
  "cross_references": ["3-5 specific verse references as strings"],
  "sources": [{"name": "Source name", "url": "https://..."}]
}"""

BIBLE_USER_PROMPT_TEMPLATE = """Today's reading in the one-year chronological Bible plan:

**Day {day_number} of 365**
**Passage**: {passage}

{context_section}

Please write the reading guide for {passage}. Search the web for reputable commentary and scholarship on this passage to enrich and ground your analysis, and cite the sources you use."""

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
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📖</text></svg>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,300;1,6..72,400;1,6..72,500&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../styles.css">
</head>
<body>
    <nav class="nav">
        <a href="/bible" class="nav-back">&larr; Daily Bible Reading</a>
    </nav>
    <main class="container post">
        <p class="post-meta">Day {{ day_number }} of 365</p>
        <h1 class="passage-ref">{{ passage }}</h1>
        {% if title %}<p class="post-title">{{ title }}</p>{% endif %}

        <div class="read-buttons">
            {% for b in buttons %}
            <a class="read-btn" href="{{ b.url }}" target="_blank" rel="noopener">{{ b.label }} &rarr;</a>
            {% endfor %}
        </div>

        {% if context %}<p class="section-kicker">Context</p><div class="analysis-sec">{{ context }}</div>{% endif %}
        {% if themes %}<p class="section-kicker">Key themes</p><div class="analysis-sec">{{ themes }}</div>{% endif %}
        {% if takeaways %}
        <p class="section-kicker">Takeaways</p>
        <ul class="takeaways">{% for t in takeaways %}<li>{{ t }}</li>{% endfor %}</ul>
        {% endif %}
        {% if connections %}
        <p class="section-kicker">Connections</p>
        <div class="analysis-sec">{{ connections }}
            {% if cross_references %}
            <div class="xref-links">
                {% for x in cross_references %}
                {% if x.url %}<a href="{{ x.url }}" target="_blank" rel="noopener">{{ x.label }} &rarr;</a>{% else %}<span>{{ x.label }}</span>{% endif %}
                {% endfor %}
            </div>
            {% endif %}
        </div>
        {% endif %}
        {% if reflection %}<p class="section-kicker">Reflection</p><div class="analysis-sec">{{ reflection }}</div>{% endif %}

        {% if sources %}
        <div class="sources-section">
            <p class="section-kicker" style="color: var(--faint);">Sources</p>
            <ul class="sources-list">
                {% for s in sources %}<li><a href="{{ s.url }}" target="_blank" rel="noopener">{{ s.name }}</a></li>{% endfor %}
            </ul>
        </div>
        {% endif %}

        <label class="mark-read-label" style="margin-top: var(--spacing-8); margin-bottom: 8px;">
            <input type="checkbox" class="mark-read-checkbox" data-day-number="{{ day_number }}">
            Mark as read
        </label>

        <nav class="post-nav">
            {% if prev_day %}<a href="/bible/posts/day-{{ '%03d'|format(prev_day) }}.html">&larr; {{ prev_passage }}</a>{% else %}<span></span>{% endif %}
            {% if next_day %}<div class="next-reading"><span class="label">Next</span><a href="/bible/posts/day-{{ '%03d'|format(next_day) }}.html">{{ next_passage }} &rarr;</a></div>{% endif %}
        </nav>
    </main>
    <footer class="footer">
        <p>&copy; 2026 Joshua Hou &bull; Scripture linked to the NIV on the YouVersion Bible App</p>
    </footer>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="../app.js?v=14"></script>
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
<body style="margin:0; background:#efece4; font-family: Georgia, 'Times New Roman', serif; color:#1d1c18; line-height:1.65;">
  <div style="max-width:600px; margin:0 auto; background:#f7f5f0; padding:32px 28px 40px;">

    <p style="font-family:'Courier New',monospace; font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#a8a496; margin:0 0 12px;">Day {{ day_number }} of 365</p>
    <h1 style="font-size:30px; font-weight:normal; letter-spacing:-0.02em; margin:0 0 4px;">{{ passage }}</h1>
    {% if title %}<p style="font-style:italic; font-size:18px; color:#6b675c; margin:0 0 22px;">{{ title }}</p>{% endif %}

    {% for b in buttons %}
    <a href="{{ b.url }}" style="display:inline-block; font-family:'Courier New',monospace; font-size:13px; letter-spacing:0.03em; text-decoration:none; padding:12px 20px; border-radius:999px; background:#1d1c18; color:#f7f5f0; margin:0 8px 10px 0;">{{ b.label }} &rarr;</a>
    {% endfor %}

    {% if context %}<p style="font-family:'Courier New',monospace; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:#2f3a8c; margin:30px 0 10px;">Context</p><div style="font-size:17px; line-height:1.7;">{{ context }}</div>{% endif %}
    {% if themes %}<p style="font-family:'Courier New',monospace; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:#2f3a8c; margin:30px 0 10px;">Key themes</p><div style="font-size:17px; line-height:1.7;">{{ themes }}</div>{% endif %}
    {% if takeaways %}
    <p style="font-family:'Courier New',monospace; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:#2f3a8c; margin:30px 0 10px;">Takeaways</p>
    <ul style="margin:0; padding:0 0 0 18px; font-size:16px; line-height:1.6;">{% for t in takeaways %}<li style="margin:0 0 8px;">{{ t }}</li>{% endfor %}</ul>
    {% endif %}
    {% if connections %}
    <p style="font-family:'Courier New',monospace; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:#2f3a8c; margin:30px 0 10px;">Connections</p>
    <div style="font-size:17px; line-height:1.7;">{{ connections }}</div>
    {% if cross_references %}
    <p style="font-size:14px; margin:12px 0 0;">{% for x in cross_references %}{% if x.url %}<a href="{{ x.url }}" style="font-family:'Courier New',monospace; font-size:12px; color:#2f3a8c; text-decoration:none; white-space:nowrap;">{{ x.label }} &rarr;</a>{% if not loop.last %} &nbsp;&middot;&nbsp; {% endif %}{% endif %}{% endfor %}</p>
    {% endif %}
    {% endif %}
    {% if reflection %}<p style="font-family:'Courier New',monospace; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:#2f3a8c; margin:30px 0 10px;">Reflection</p><div style="font-size:17px; line-height:1.7;">{{ reflection }}</div>{% endif %}

    <div style="margin:34px 0 8px;">
        <a href="{{ mark_read_url }}" style="display:inline-block; font-family:'Courier New',monospace; font-size:13px; letter-spacing:0.03em; text-decoration:none; padding:12px 24px; border-radius:999px; background:#2f3a8c; color:#ffffff;">Mark as read &#10003;</a>
    </div>
    <p style="margin:0 0 24px;"><a href="{{ web_url }}" style="font-family:'Courier New',monospace; font-size:12px; color:#6b675c;">Read on the web &rarr;</a></p>

    {% if next_passage %}
    <div style="border-top:1px solid #e7e2d6; padding-top:16px;">
        <p style="font-family:'Courier New',monospace; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:#a8a496; margin:0 0 4px;">Tomorrow</p>
        <p style="margin:0; font-size:16px;">{{ next_passage }}</p>
    </div>
    {% endif %}

    <div style="border-top:1px solid #e7e2d6; padding-top:16px; margin-top:24px; font-family:'Courier New',monospace; font-size:11px; color:#a8a496;">
        <p style="margin:0;">Scripture opens in the NIV on the YouVersion Bible App.</p>
        <p style="margin:8px 0 0;"><a href="{{ unsubscribe_url }}" style="color:#a8a496;">Unsubscribe</a></p>
    </div>
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
<body style="margin:0; background:#efece4; font-family: Georgia, 'Times New Roman', serif; color:#1d1c18; line-height:1.65;">
  <div style="max-width:600px; margin:0 auto; background:#f7f5f0; padding:36px 28px 40px; text-align:center;">
    <p style="font-family:'Courier New',monospace; font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#a8a496; margin:0 0 12px;">Day {{ day_number }} of 365</p>
    <h1 style="font-size:28px; font-weight:normal; letter-spacing:-0.02em; margin:0 0 6px;">{{ passage }}</h1>
    {% if title %}<p style="font-style:italic; font-size:17px; color:#6b675c; margin:0 0 24px;">{{ title }}</p>{% endif %}

    <div style="margin:8px 0 24px;">
        {% for b in buttons %}
        <a href="{{ b.url }}" style="display:inline-block; font-family:'Courier New',monospace; font-size:13px; letter-spacing:0.03em; text-decoration:none; padding:12px 20px; border-radius:999px; background:#1d1c18; color:#f7f5f0; margin:0 6px 10px;">{{ b.label }} &rarr;</a>
        {% endfor %}
    </div>

    <div style="margin:8px 0 24px;">
        <a href="{{ mark_read_url }}" style="display:inline-block; font-family:'Courier New',monospace; font-size:13px; text-decoration:none; padding:11px 22px; border-radius:999px; background:#2f3a8c; color:#ffffff;">Mark as read &#10003;</a>
    </div>

    <p style="margin:0 0 24px;"><a href="{{ web_url }}" style="font-family:'Courier New',monospace; font-size:12px; color:#6b675c;">Read the analysis &rarr;</a></p>

    <div style="border-top:1px solid #e7e2d6; padding-top:16px; font-family:'Courier New',monospace; font-size:11px; color:#a8a496;">
        <a href="{{ unsubscribe_url }}" style="color:#a8a496;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>"""
