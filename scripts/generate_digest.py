#!/usr/bin/env python3
"""
Daily AI/Startup Digest Generator

Fetches articles from RSS feeds, curates them with GPT-4o,
generates a static HTML digest page, updates the index, and
sends the digest email via Resend.

Environment variables required:
    OPENAI_API_KEY - OpenAI API key
    RESEND_API_KEY - Resend API key (optional, skips email if missing)
"""

import json
import logging
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import feedparser
import requests
from jinja2 import Template
from openai import OpenAI

# Add scripts directory to path for config import
sys.path.insert(0, str(Path(__file__).parent))
from config import (
    ARCHIVE_ITEM_TEMPLATE,
    INDEX_DIGEST_TEMPLATE,
    POST_TEMPLATE,
    RSS_FEEDS,
    SYSTEM_PROMPT,
    USER_PROMPT_TEMPLATE,
)

# Setup
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).parent.parent
DIGEST_DIR = REPO_ROOT / "digest"
POSTS_DIR = DIGEST_DIR / "posts"
INDEX_PATH = DIGEST_DIR / "index.html"


def fetch_articles():
    """Fetch recent articles from all configured RSS feeds."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=28)  # 28h window for overlap
    articles = []
    seen_urls = set()

    for feed_config in RSS_FEEDS:
        url = feed_config["url"]
        source = feed_config["name"]
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries:
                # Parse publish date
                published = None
                if hasattr(entry, "published_parsed") and entry.published_parsed:
                    published = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
                elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
                    published = datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)

                # Skip old articles
                if published and published < cutoff:
                    continue

                link = getattr(entry, "link", "")
                if link in seen_urls:
                    continue
                seen_urls.add(link)

                # Extract summary text, strip HTML tags
                summary = getattr(entry, "summary", "") or getattr(entry, "description", "")
                summary = re.sub(r"<[^>]+>", "", summary)
                summary = summary[:500]  # Truncate long summaries

                articles.append(
                    {
                        "title": getattr(entry, "title", "Untitled"),
                        "url": link,
                        "source": source,
                        "summary": summary,
                        "published": published.isoformat() if published else "",
                    }
                )
            logger.info(f"Fetched {len(feed.entries)} entries from {source}")
        except Exception as e:
            logger.warning(f"Failed to fetch {source} ({url}): {e}")

    logger.info(f"Total articles collected: {len(articles)}")
    return articles


def curate_with_gpt(articles):
    """Send articles to GPT-4o for curation and summarization."""
    if len(articles) < 3:
        logger.info("Fewer than 3 articles found — quiet day")
        return {"quiet_day": True, "message": "Not much happened in AI and startups today. Check back tomorrow."}

    # Format articles for the prompt
    articles_text = ""
    for i, a in enumerate(articles, 1):
        articles_text += f"{i}. [{a['source']}] {a['title']}\n   URL: {a['url']}\n   {a['summary']}\n\n"

    client = OpenAI()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER_PROMPT_TEMPLATE.format(articles=articles_text)},
        ],
        response_format={"type": "json_object"},
        temperature=0.3,
    )

    content = response.choices[0].message.content
    digest_data = json.loads(content)
    logger.info("GPT-4o curation complete")
    return digest_data


def generate_post_html(digest_data, date_obj):
    """Generate the individual post HTML file."""
    date_iso = date_obj.strftime("%Y-%m-%d")
    date_formatted = date_obj.strftime("%B %d, %Y")

    template = Template(POST_TEMPLATE)

    if digest_data.get("quiet_day"):
        html = template.render(
            date_iso=date_iso,
            date_formatted=date_formatted,
            quiet_day=True,
            quiet_message=digest_data.get("message", "Quiet day."),
            top_story_title="Quiet news day",
            top_story=None,
            sections=[],
        )
    else:
        top_story = digest_data["top_story"]
        sections = digest_data.get("sections", [])
        html = template.render(
            date_iso=date_iso,
            date_formatted=date_formatted,
            quiet_day=False,
            quiet_message="",
            top_story_title=top_story["title"],
            top_story=top_story,
            sections=sections,
        )

    # Write post file
    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    post_path = POSTS_DIR / f"{date_iso}.html"
    post_path.write_text(html, encoding="utf-8")
    logger.info(f"Generated post: {post_path}")
    return date_iso, date_formatted


def update_index(digest_data, date_obj):
    """Regenerate the digest index.html with latest content and archive."""
    date_iso = date_obj.strftime("%Y-%m-%d")
    date_formatted = date_obj.strftime("%B %d, %Y")

    # Render the latest digest content for embedding
    digest_template = Template(INDEX_DIGEST_TEMPLATE)
    if digest_data.get("quiet_day"):
        latest_html = digest_template.render(
            date_formatted=date_formatted,
            quiet_day=True,
            quiet_message=digest_data.get("message", "Quiet day."),
            top_story=None,
            sections=[],
        )
    else:
        latest_html = digest_template.render(
            date_formatted=date_formatted,
            quiet_day=False,
            quiet_message="",
            top_story=digest_data["top_story"],
            sections=digest_data.get("sections", []),
        )

    # Build archive list from existing post files
    archive_items = []
    archive_template = Template(ARCHIVE_ITEM_TEMPLATE)
    if POSTS_DIR.exists():
        for post_file in sorted(POSTS_DIR.glob("*.html"), reverse=True):
            post_date_str = post_file.stem  # e.g. "2026-02-08"
            try:
                post_date = datetime.strptime(post_date_str, "%Y-%m-%d")
                post_date_fmt = post_date.strftime("%B %d, %Y")
            except ValueError:
                continue

            # Extract top story title from the post HTML (quick parse)
            post_content = post_file.read_text(encoding="utf-8")
            title_match = re.search(r'<meta property="og:description" content="([^"]*)"', post_content)
            top_title = title_match.group(1) if title_match else post_date_fmt

            archive_items.append(
                archive_template.render(
                    date_iso=post_date_str,
                    date_formatted=post_date_fmt,
                    top_story_title=top_title,
                )
            )

    archive_html = "\n                ".join(archive_items) if archive_items else '<li class="archive-empty">No digests yet. The first one is on its way.</li>'

    # Read the index template and inject content
    index_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily Digest – AI & Startup News | Joshua Hou</title>
    <meta name="description" content="A daily curated briefing on what's happening in AI and startups, powered by an autonomous agent.">
    <meta property="og:title" content="Daily Digest – AI & Startup News">
    <meta property="og:description" content="A daily curated briefing on what's happening in AI and startups.">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://joshhou.com/digest">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📡</text></svg>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <nav class="nav">
        <a href="/" class="nav-back">&larr; joshhou.com</a>
    </nav>
    <main class="container">
        <header class="hero">
            <h1 class="hero-title">Daily Digest</h1>
            <p class="hero-subtitle">A curated briefing on AI and startups, generated every morning by an autonomous agent.</p>
        </header>

        <section id="latest-digest" class="latest-digest">
{latest_html}
        </section>

        <section class="archive-section">
            <h2 class="archive-heading">Archive</h2>
            <ul id="archive-list" class="archive-list">
                {archive_html}
            </ul>
        </section>
    </main>
    <footer class="footer">
        <p>&copy; 2026 Joshua Hou. Built with an autonomous agent, GPT-4o, and RSS feeds.</p>
    </footer>
    <script src="main.js"></script>
</body>
</html>"""

    INDEX_PATH.write_text(index_html, encoding="utf-8")
    logger.info(f"Updated index: {INDEX_PATH}")


def send_resend_email(digest_data, date_obj):
    """Send the digest to Josh via Resend."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        logger.info("RESEND_API_KEY not set, skipping email")
        return

    date_formatted = date_obj.strftime("%B %d, %Y")
    subject = f"AI & Startup Digest — {date_formatted}"

    # Build a simple email-friendly HTML body
    if digest_data.get("quiet_day"):
        body = f"<p>{digest_data.get('message', 'Quiet news day.')}</p>"
    else:
        top = digest_data["top_story"]
        body = f'<h2>Top Story: {top["title"]}</h2>\n<p>{top["summary"]}</p>\n'
        for article in top.get("articles", []):
            body += f'<p><a href="{article["url"]}">{article["title"]}</a> ({article["source"]})</p>\n'
        body += "<hr>\n"
        for section in digest_data.get("sections", []):
            body += f'<h3>{section["title"]}</h3>\n<p>{section["summary"]}</p>\n'
            for article in section.get("articles", []):
                body += f'<p><a href="{article["url"]}">{article["title"]}</a> ({article["source"]})</p>\n'
            body += "\n"

    body += '\n<p><a href="https://joshhou.com/digest">View on the web</a></p>'

    try:
        resp = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "from": "Daily Digest <onboarding@resend.dev>",
                "to": ["joshuahou17@gmail.com"],
                "subject": subject,
                "html": body,
            },
            timeout=30,
        )
        if resp.status_code in (200, 201):
            logger.info("Resend email sent successfully")
        else:
            logger.warning(f"Resend API returned {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.warning(f"Failed to send Resend email: {e}")


def main():
    today = datetime.now(timezone.utc)
    logger.info(f"Generating digest for {today.strftime('%Y-%m-%d')}")

    # Step 1: Fetch articles
    articles = fetch_articles()

    # Step 2: Curate with GPT-4o
    try:
        digest_data = curate_with_gpt(articles)
    except Exception as e:
        logger.error(f"GPT-4o curation failed: {e}")
        sys.exit(1)

    # Step 3: Generate post HTML
    generate_post_html(digest_data, today)

    # Step 4: Update index page
    update_index(digest_data, today)

    # Step 5: Send email (non-blocking — site update succeeds even if this fails)
    send_resend_email(digest_data, today)

    logger.info("Digest generation complete")


if __name__ == "__main__":
    main()
