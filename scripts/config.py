"""
Configuration for the daily AI/startup digest agent.
Edit RSS_FEEDS to add or remove sources.
"""

# RSS feeds to pull articles from
RSS_FEEDS = [
    # AI / ML
    {
        "url": "https://techcrunch.com/category/artificial-intelligence/feed/",
        "name": "TechCrunch AI",
    },
    {
        "url": "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
        "name": "The Verge AI",
    },
    {
        "url": "https://www.technologyreview.com/topic/artificial-intelligence/feed",
        "name": "MIT Technology Review",
    },
    {
        "url": "https://blog.openai.com/rss/",
        "name": "OpenAI Blog",
    },
    {
        "url": "https://www.anthropic.com/feed.xml",
        "name": "Anthropic Blog",
    },
    {
        "url": "https://ai.googleblog.com/feeds/posts/default?alt=rss",
        "name": "Google AI Blog",
    },
    {
        "url": "https://hnrss.org/frontpage",
        "name": "Hacker News",
    },
    # Startups / VC
    {
        "url": "https://techcrunch.com/category/startups/feed/",
        "name": "TechCrunch Startups",
    },
    {
        "url": "https://news.crunchbase.com/feed/",
        "name": "Crunchbase News",
    },
    {
        "url": "https://arstechnica.com/feed/",
        "name": "Ars Technica",
    },
    {
        "url": "https://feeds.arstechnica.com/arstechnica/technology-lab",
        "name": "Ars Technica Tech",
    },
]

# GPT-4o system prompt for curation
SYSTEM_PROMPT = """You are a concise, opinionated tech news curator writing a daily briefing for a smart audience interested in AI and startups.

Given a list of today's articles (title, source, summary), produce a structured daily digest:

1. Pick the 8-12 most significant and interesting stories. Prioritize genuinely new developments over opinion pieces or rehashes.
2. Identify the single biggest story of the day and label it "Top Story".
3. Group the remaining stories into 3-5 thematic sections. Good section names: "AI Models & Research", "Funding & Deals", "Product Launches", "Policy & Regulation", "Industry Moves", "Open Source", "Worth Watching".
4. For each section, write a 2-3 sentence summary that captures the key developments. Be direct and informative — no filler.
5. For the Top Story, write a 3-4 sentence summary explaining why it matters.

Output valid JSON in this exact format:
{
  "top_story": {
    "title": "Section title",
    "summary": "3-4 sentence summary",
    "articles": [{"title": "Article title", "url": "https://...", "source": "Source name"}]
  },
  "sections": [
    {
      "title": "Section title",
      "summary": "2-3 sentence summary",
      "articles": [{"title": "Article title", "url": "https://...", "source": "Source name"}]
    }
  ]
}

If there are fewer than 3 articles, output:
{
  "quiet_day": true,
  "message": "A brief note that it was a quiet news day."
}
"""

USER_PROMPT_TEMPLATE = """Here are today's articles from AI and startup news sources. Curate them into a daily digest.

Articles:
{articles}
"""

# Jinja2 template for individual digest post pages
POST_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI & Startup Digest – {{ date_formatted }} | Joshua Hou</title>
    <meta name="description" content="Daily AI and startup news digest for {{ date_formatted }}.">
    <meta property="og:title" content="AI & Startup Digest – {{ date_formatted }}">
    <meta property="og:description" content="{{ top_story_title }}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="https://joshhou.com/digest/posts/{{ date_iso }}.html">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📡</text></svg>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../styles.css">
</head>
<body>
    <nav class="nav">
        <a href="/digest" class="nav-back">&larr; All Digests</a>
    </nav>
    <main class="container">
        <p class="digest-date">{{ date_formatted }}</p>

        {% if quiet_day %}
        <div class="digest-card">
            <p>{{ quiet_message }}</p>
        </div>
        {% else %}
        <!-- Top Story -->
        <div class="digest-card top-story">
            <span class="digest-card-label">Top Story</span>
            <h3>{{ top_story.title }}</h3>
            <p>{{ top_story.summary }}</p>
            <div class="digest-card-sources">
                {% for article in top_story.articles %}
                <a href="{{ article.url }}" target="_blank" rel="noopener">{{ article.source }}</a>
                {% endfor %}
            </div>
        </div>

        <!-- Sections -->
        {% for section in sections %}
        <div class="digest-card">
            <h3>{{ section.title }}</h3>
            <p>{{ section.summary }}</p>
            <div class="digest-card-sources">
                {% for article in section.articles %}
                <a href="{{ article.url }}" target="_blank" rel="noopener">{{ article.source }}</a>
                {% endfor %}
            </div>
        </div>
        {% endfor %}
        {% endif %}
    </main>
    <footer class="footer">
        <p>&copy; 2026 Joshua Hou. Generated by an autonomous agent using GPT-4o and RSS feeds.</p>
    </footer>
</body>
</html>
"""

# Template snippet for the latest digest content (embedded in index.html)
INDEX_DIGEST_TEMPLATE = """
        <p class="digest-date">{{ date_formatted }}</p>

        {% if quiet_day %}
        <div class="digest-card">
            <p>{{ quiet_message }}</p>
        </div>
        {% else %}
        <!-- Top Story -->
        <div class="digest-card top-story">
            <span class="digest-card-label">Top Story</span>
            <h3>{{ top_story.title }}</h3>
            <p>{{ top_story.summary }}</p>
            <div class="digest-card-sources">
                {% for article in top_story.articles %}
                <a href="{{ article.url }}" target="_blank" rel="noopener">{{ article.source }}</a>
                {% endfor %}
            </div>
        </div>

        {% for section in sections %}
        <div class="digest-card">
            <h3>{{ section.title }}</h3>
            <p>{{ section.summary }}</p>
            <div class="digest-card-sources">
                {% for article in section.articles %}
                <a href="{{ article.url }}" target="_blank" rel="noopener">{{ article.source }}</a>
                {% endfor %}
            </div>
        </div>
        {% endfor %}
        {% endif %}
"""

# Template for archive list items
ARCHIVE_ITEM_TEMPLATE = """<li><a href="/digest/posts/{{ date_iso }}.html"><span class="archive-headline">{{ top_story_title }}</span><span class="archive-date">{{ date_formatted }}</span></a></li>"""
