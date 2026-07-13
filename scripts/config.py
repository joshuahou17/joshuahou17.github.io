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
    # Personal Health Tech (wearables, longevity, diagnostics, metabolic health)
    # Google News RSS search: watches named consumer health-tech companies by name.
    {
        "url": "https://news.google.com/rss/search?q=(Oura+OR+Whoop+OR+%22Eight+Sleep%22+OR+%22Function+Health%22+OR+Superpower+OR+%22Levels+Health%22+OR+%22Hone+Health%22+OR+Ultrahuman)+when:2d&hl=en-US&gl=US&ceid=US:en",
        "name": "Health Tech (Google News)",
    },
    {
        "url": "https://rockhealth.com/feed/",
        "name": "Rock Health",
    },
    {
        "url": "https://www.fiercehealthcare.com/rss/xml",
        "name": "Fierce Healthcare",
    },
    {
        "url": "https://www.statnews.com/feed/",
        "name": "STAT News",
    },
    {
        "url": "https://www.lifespan.io/feed/",
        "name": "Lifespan.io (Longevity)",
    },
]

# Cap articles taken per feed (most recent first) to keep the curation prompt
# bounded — the Google News health search can return many items per day.
MAX_ARTICLES_PER_FEED = 20

# GPT-4o system prompt for curation
SYSTEM_PROMPT = """You are a concise, opinionated tech news curator writing a daily briefing for someone in finance who cares deeply about the AI, startup, and personal health tech ecosystems.

PRIORITIES (in order of importance):
- New funding rounds (who raised, how much, from whom, at what valuation if known)
- New product launches and major feature releases
- Companies coming out of stealth
- Personal health tech developments — wearables (Whoop, Oura, Eight Sleep, Ultrahuman, Apple Watch), consumer diagnostics and bloodwork (Function Health, Superpower), longevity and hormone health (Hone Health), metabolic health (Levels): their funding, product launches, new features, clinical results, and regulatory news (e.g. FDA)
- Key opinion leader takes and hot takes (Sam Altman, Paul Graham, etc.)
- Major partnerships, acquisitions, and hires
- Policy and regulation that affects startups, AI, or health tech

DEPRIORITIZE: Generic opinion pieces, listicles, tutorials, rehashes of old news, general clinical/pharma news with no consumer or startup angle.

Given a list of today's articles (title, source, summary), produce a structured daily digest:

1. Identify the single biggest story of the day as "Top Story". Write a 3-4 sentence summary explaining why it matters.

2. Create bullet-point lists. Each item should be one concise line. If there are no items for a category today, return an empty list.
   - "funding_rounds": New funding rounds (AI/startup). Format each as: "Company — $Amount Series X led by Investor (brief context)"
   - "product_launches": New product launches, features, or releases (AI/startup). Format each as: "Company — Product/feature name (brief context)"
   - "stealth_launches": Companies coming out of stealth or launching for the first time. Format each as: "Company — What they do (investors/founders if notable)"
   - "health_tech": Personal health tech news — funding, product launches, features, or regulatory news for wearables, consumer diagnostics, longevity, and metabolic-health companies. Put ALL health-tech items here (even funding or launches), so they stay grouped together. Format each as: "Company — What happened (brief context)"

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
  "health_tech": [
    {"text": "Whoop — new blood pressure feature cleared by FDA (expands into medical-grade metrics)", "url": "https://...", "source": "Source name"}
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
    <title>Daily News – {{ date_formatted }} | Joshua Hou</title>
    <meta name="description" content="Daily News: AI, startup, and personal health tech briefing for {{ date_formatted }}.">
    <meta property="og:title" content="Daily News – {{ date_formatted }}">
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

        <!-- Personal Health Tech -->
        {% if health_tech %}
        <div class="digest-card">
            <span class="digest-card-label">❤️ Health Tech</span>
            <h3>Personal Health Tech</h3>
            <ul class="digest-bullet-list">
                {% for item in health_tech %}
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

        {% if health_tech %}
        <div class="digest-card">
            <span class="digest-card-label">❤️ Health Tech</span>
            <h3>Personal Health Tech</h3>
            <ul class="digest-bullet-list">
                {% for item in health_tech %}
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
