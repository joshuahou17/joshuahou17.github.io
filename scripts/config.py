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
SYSTEM_PROMPT = """You are a concise, opinionated tech news curator writing a daily briefing for someone in finance who cares deeply about the AI and startup ecosystem.

PRIORITIES (in order of importance):
- New funding rounds (who raised, how much, from whom, at what valuation if known)
- New product launches and major feature releases
- Companies coming out of stealth
- Key opinion leader takes and hot takes (Sam Altman, Paul Graham, etc.)
- Major partnerships, acquisitions, and hires
- Policy and regulation that affects startups or AI

DEPRIORITIZE: Generic opinion pieces, listicles, tutorials, rehashes of old news.

Given a list of today's articles (title, source, summary), produce a structured daily digest:

1. Identify the single biggest story of the day as "Top Story". Write a 3-4 sentence summary explaining why it matters.

2. Create THREE specific bullet-point lists. Each item should be one concise line. If there are no items for a category today, return an empty list.
   - "funding_rounds": New funding rounds. Format each as: "Company — $Amount Series X led by Investor (brief context)"
   - "product_launches": New product launches, features, or releases. Format each as: "Company — Product/feature name (brief context)"
   - "stealth_launches": Companies coming out of stealth or launching for the first time. Format each as: "Company — What they do (investors/founders if notable)"

3. Group any remaining notable stories into 1-3 thematic sections (e.g., "Notable Takes", "Policy & Regulation", "Industry Moves", "Worth Watching"). Write a 2-3 sentence summary per section.

Output valid JSON in this exact format:
{
  "top_story": {
    "title": "Headline",
    "summary": "3-4 sentence summary",
    "articles": [{"title": "Article title", "url": "https://...", "source": "Source name"}]
  },
  "funding_rounds": [
    {"text": "Company — $50M Series B led by Sequoia (building AI infrastructure for healthcare)", "url": "https://...", "source": "Source name"}
  ],
  "product_launches": [
    {"text": "OpenAI — GPT-5 released with improved reasoning (available to all API tiers)", "url": "https://...", "source": "Source name"}
  ],
  "stealth_launches": [
    {"text": "Acme AI — AI-powered legal assistant out of stealth (founded by ex-Google engineers, $10M seed from a16z)", "url": "https://...", "source": "Source name"}
  ],
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

        <!-- Funding Rounds -->
        {% if funding_rounds %}
        <div class="digest-card">
            <span class="digest-card-label">💰 Funding</span>
            <h3>New Funding Rounds</h3>
            <ul class="digest-bullet-list">
                {% for item in funding_rounds %}
                <li><a href="{{ item.url }}" target="_blank" rel="noopener">{{ item.text }}</a></li>
                {% endfor %}
            </ul>
        </div>
        {% endif %}

        <!-- Product Launches -->
        {% if product_launches %}
        <div class="digest-card">
            <span class="digest-card-label">🚀 Launches</span>
            <h3>New Product Launches</h3>
            <ul class="digest-bullet-list">
                {% for item in product_launches %}
                <li><a href="{{ item.url }}" target="_blank" rel="noopener">{{ item.text }}</a></li>
                {% endfor %}
            </ul>
        </div>
        {% endif %}

        <!-- Stealth / New Companies -->
        {% if stealth_launches %}
        <div class="digest-card">
            <span class="digest-card-label">👀 Out of Stealth</span>
            <h3>Companies Out of Stealth</h3>
            <ul class="digest-bullet-list">
                {% for item in stealth_launches %}
                <li><a href="{{ item.url }}" target="_blank" rel="noopener">{{ item.text }}</a></li>
                {% endfor %}
            </ul>
        </div>
        {% endif %}

        <!-- Other Sections -->
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

        {% if funding_rounds %}
        <div class="digest-card">
            <span class="digest-card-label">💰 Funding</span>
            <h3>New Funding Rounds</h3>
            <ul class="digest-bullet-list">
                {% for item in funding_rounds %}
                <li><a href="{{ item.url }}" target="_blank" rel="noopener">{{ item.text }}</a></li>
                {% endfor %}
            </ul>
        </div>
        {% endif %}

        {% if product_launches %}
        <div class="digest-card">
            <span class="digest-card-label">🚀 Launches</span>
            <h3>New Product Launches</h3>
            <ul class="digest-bullet-list">
                {% for item in product_launches %}
                <li><a href="{{ item.url }}" target="_blank" rel="noopener">{{ item.text }}</a></li>
                {% endfor %}
            </ul>
        </div>
        {% endif %}

        {% if stealth_launches %}
        <div class="digest-card">
            <span class="digest-card-label">👀 Out of Stealth</span>
            <h3>Companies Out of Stealth</h3>
            <ul class="digest-bullet-list">
                {% for item in stealth_launches %}
                <li><a href="{{ item.url }}" target="_blank" rel="noopener">{{ item.text }}</a></li>
                {% endfor %}
            </ul>
        </div>
        {% endif %}

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
