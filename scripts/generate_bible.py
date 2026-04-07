#!/usr/bin/env python3
"""
Daily Bible Reading Plan Generator

Generates static HTML pages with AI-powered passage analysis,
fetches Bible text in multiple translations, and sends daily emails.

Modes:
    --mode=generate         Generate today's post, update index, send daily email
    --mode=remind-evening   Send evening reminder to incomplete readers
    --mode=remind-morning   Send morning reminder to incomplete readers

Environment variables:
    ANTHROPIC_API_KEY   - Anthropic API key for Claude analysis
    BIBLE_API_KEY       - API.Bible key (NIV)
    ESV_API_KEY         - ESV API key
    RESEND_API_KEY      - Resend API key (optional)
    SUPABASE_URL        - Supabase project URL (optional)
    SUPABASE_SERVICE_KEY - Supabase service role key (optional)
    HMAC_SECRET         - Secret for email mark-as-read tokens (optional)
"""

import argparse
import hashlib
import hmac as hmac_mod
import json
import logging
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from jinja2 import Template

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))
from bible_config import (
    ARCHIVE_ITEM_TEMPLATE,
    BIBLE_POST_TEMPLATE,
    BIBLE_SYSTEM_PROMPT,
    BIBLE_USER_PROMPT_TEMPLATE,
    EMAIL_TEMPLATE,
    ESV_COPYRIGHT,
    GENRE_COLORS,
    INDEX_TODAY_TEMPLATE,
    INDEX_WEEK_TEMPLATE,
    NIV_COPYRIGHT,
    REMINDER_EMAIL_TEMPLATE,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).parent.parent
BIBLE_DIR = REPO_ROOT / "bible"
POSTS_DIR = BIBLE_DIR / "posts"
INDEX_PATH = BIBLE_DIR / "index.html"
PLAN_PATH = Path(__file__).parent / "reading_plan.json"
CONTEXT_PATH = Path(__file__).parent / "bible_context.json"

# Eastern Time offset (UTC-4 during EDT, UTC-5 during EST)
ET_OFFSET = timezone(timedelta(hours=-4))  # EDT (March-November)


def load_reading_plan():
    """Load the reading plan JSON."""
    return json.loads(PLAN_PATH.read_text(encoding="utf-8"))


def get_today_entry(plan):
    """Find today's entry in the reading plan."""
    today = datetime.now(ET_OFFSET).strftime("%Y-%m-%d")
    for entry in plan:
        if entry["date"] == today:
            return entry
    return None


def get_entry_by_day(plan, day_number):
    """Find an entry by day number."""
    for entry in plan:
        if entry["day_number"] == day_number:
            return entry
    return None


def get_week_entries(plan, week):
    """Get all entries for a given week."""
    return [e for e in plan if e["week"] == week]


# --- Bible Text Fetching ---

def fetch_niv_text(passage, osis_id):
    """Fetch passage text from API.Bible (NIV)."""
    api_key = os.environ.get("BIBLE_API_KEY")
    if not api_key:
        logger.info("BIBLE_API_KEY not set, skipping NIV fetch")
        return None

    # NIV Bible ID — verify after registration
    bible_id = "06125adad2d5898a-01"

    try:
        resp = requests.get(
            f"https://api.scripture.api.bible/v1/bibles/{bible_id}/passages/{osis_id}",
            headers={"api-key": api_key},
            params={
                "content-type": "text",
                "include-verse-numbers": "true",
                "include-titles": "true",
            },
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            content = data.get("data", {}).get("content", "")
            # Strip HTML tags if present
            content = re.sub(r"<[^>]+>", "", content).strip()
            if content:
                logger.info(f"Fetched NIV text for {passage}")
                return content
        else:
            logger.warning(f"API.Bible returned {resp.status_code} for {osis_id}: {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"Failed to fetch NIV text: {e}")

    return None


def fetch_esv_text(passage):
    """Fetch passage text from ESV API."""
    api_key = os.environ.get("ESV_API_KEY")
    if not api_key:
        logger.info("ESV_API_KEY not set, skipping ESV fetch")
        return None

    try:
        resp = requests.get(
            "https://api.esv.org/v3/passage/text/",
            headers={"Authorization": f"Token {api_key}"},
            params={
                "q": passage,
                "include-passage-references": "false",
                "include-verse-numbers": "true",
                "include-footnotes": "false",
                "include-headings": "true",
                "include-short-copyright": "false",
            },
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            passages = data.get("passages", [])
            if passages:
                text = passages[0].strip()
                logger.info(f"Fetched ESV text for {passage}")
                return text
        else:
            logger.warning(f"ESV API returned {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"Failed to fetch ESV text: {e}")

    return None


def fetch_passage_text(entry):
    """Fetch passage text in both translations. Returns (niv_text, esv_text)."""
    niv = fetch_niv_text(entry["passage"], entry["osis_id"])
    esv = fetch_esv_text(entry["passage"])
    return niv, esv


# --- Cumulative Context ---

def load_context():
    """Load cumulative context from previous days."""
    if CONTEXT_PATH.exists():
        return json.loads(CONTEXT_PATH.read_text(encoding="utf-8"))
    return []


def save_context(context):
    """Save updated cumulative context."""
    CONTEXT_PATH.write_text(json.dumps(context, indent=2), encoding="utf-8")


def build_context_string(context):
    """Build a concise context string for Claude."""
    if not context:
        return "This is the first day of the reading plan. No prior passages have been read."

    lines = []
    for c in context:
        lines.append(f"Day {c['day_number']} ({c['weekday']}, {c['genre']}): {c['passage']}")
        if c.get("summary"):
            lines.append(f"  Summary: {c['summary']}")

    return "Previously read passages:\n" + "\n".join(lines)


# --- Claude Analysis ---

def generate_analysis(entry, niv_text, esv_text, context):
    """Call Claude API to generate passage analysis."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.info("ANTHROPIC_API_KEY not set, skipping analysis generation")
        return None

    try:
        import anthropic
    except ImportError:
        logger.warning("anthropic package not installed, skipping analysis")
        return None

    # Build passage text section
    text = niv_text or esv_text
    if text:
        passage_text_section = f"**Passage Text ({('NIV' if niv_text else 'ESV')}):**\n{text}"
    else:
        passage_text_section = "(Passage text not available — analyze based on your knowledge and web search)"

    # Build context section
    context_section = build_context_string(context)

    user_prompt = BIBLE_USER_PROMPT_TEMPLATE.format(
        day_number=entry["day_number"],
        weekday=entry["weekday"],
        genre=entry["genre"],
        passage=entry["passage"],
        passage_text_section=passage_text_section,
        context_section=context_section,
    )

    try:
        client = anthropic.Anthropic(api_key=api_key)

        # Use Claude with web search via server-side tool
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            system=BIBLE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
            tools=[{
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": 3,
            }],
        )

        # Extract text content from response
        result_text = ""
        for block in response.content:
            if block.type == "text":
                result_text += block.text

        # Parse JSON from response
        # Try to find JSON in the response
        json_match = re.search(r'\{[\s\S]*\}', result_text)
        if json_match:
            analysis_data = json.loads(json_match.group())
            logger.info("Claude analysis generated successfully")
            return analysis_data
        else:
            logger.warning("Could not find JSON in Claude response")
            return None

    except Exception as e:
        logger.warning(f"Claude API call failed: {e}")
        return None


# --- HTML Generation ---

def generate_post_html(entry, niv_text, esv_text, analysis_data, plan):
    """Generate the individual post HTML file."""
    date_obj = datetime.strptime(entry["date"], "%Y-%m-%d")
    date_formatted = date_obj.strftime("%B %d, %Y")

    # Find prev/next entries
    prev_entry = get_entry_by_day(plan, entry["day_number"] - 1)
    next_entry = get_entry_by_day(plan, entry["day_number"] + 1)

    # Check if next day's post exists
    next_date_has_post = False
    if next_entry:
        next_post = POSTS_DIR / f"{next_entry['date']}.html"
        next_date_has_post = next_post.exists()

    template = Template(BIBLE_POST_TEMPLATE)
    html = template.render(
        day_number=entry["day_number"],
        date_iso=entry["date"],
        date_formatted=date_formatted,
        weekday=entry["weekday"],
        genre=entry["genre"],
        passage=entry["passage"],
        week=entry["week"],
        title=analysis_data.get("title", "") if analysis_data else "",
        summary=analysis_data.get("summary", "") if analysis_data else "",
        analysis=analysis_data.get("analysis", "") if analysis_data else "",
        cross_references=analysis_data.get("cross_references", []) if analysis_data else [],
        sources=analysis_data.get("sources", []) if analysis_data else [],
        has_passage_text=bool(niv_text or esv_text),
        has_both_translations=bool(niv_text and esv_text),
        niv_text=niv_text or "",
        esv_text=esv_text or "",
        niv_copyright=NIV_COPYRIGHT,
        esv_copyright=ESV_COPYRIGHT,
        prev_date=prev_entry["date"] if prev_entry else None,
        prev_passage=prev_entry["passage"] if prev_entry else None,
        next_entry=next_entry,
        next_date_has_post=next_date_has_post,
    )

    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    post_path = POSTS_DIR / f"{entry['date']}.html"
    post_path.write_text(html, encoding="utf-8")
    logger.info(f"Generated post: {post_path}")


def update_index(entry, analysis_data, plan):
    """Regenerate the bible/index.html.

    The index page is personalized client-side by app.js.
    The server just maintains the static shell with onboarding
    and placeholders that JS fills in per-user.
    """
    # The index.html is now client-side rendered for personalization.
    # We only need to ensure the static shell exists, which it does.
    # No need to regenerate it on each run since app.js handles
    # today's card, week strip, and archive dynamically.
    logger.info("Index is client-side rendered — skipping server-side update")


# --- Email ---

def generate_hmac_token(user_id, day_number):
    """Generate HMAC token for email mark-as-read links."""
    secret = os.environ.get("HMAC_SECRET", "dev-secret")
    return hmac_mod.new(
        secret.encode(),
        f"{user_id}:{day_number}".encode(),
        hashlib.sha256,
    ).hexdigest()


def get_supabase_client():
    """Get Supabase client for server-side operations."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return None

    try:
        from supabase import create_client
        return create_client(url, key)
    except ImportError:
        logger.warning("supabase package not installed")
        return None


def get_subscribers(supabase_client):
    """Fetch active subscribers from Supabase."""
    if not supabase_client:
        # Fallback: send to hardcoded recipient
        return [{"id": "default", "email": "joshuahou17@gmail.com", "current_day": None, "preferred_translation": "NIV"}]

    try:
        result = supabase_client.table("bible_subscribers").select("*").eq("unsubscribed", False).execute()
        return result.data or []
    except Exception as e:
        logger.warning(f"Failed to fetch subscribers: {e}")
        return [{"id": "default", "email": "joshuahou17@gmail.com", "current_day": None, "preferred_translation": "NIV"}]


def get_incomplete_subscribers(supabase_client, plan):
    """Get subscribers who haven't completed their current day's reading."""
    if not supabase_client:
        return []

    subscribers = get_subscribers(supabase_client)
    incomplete = []

    for sub in subscribers:
        current_day = sub.get("current_day", 1) or 1
        try:
            result = supabase_client.table("bible_reading_progress").select("completed").eq(
                "user_id", sub["id"]
            ).eq("day_number", current_day).execute()

            if not result.data or not result.data[0].get("completed"):
                incomplete.append(sub)
        except Exception:
            incomplete.append(sub)

    return incomplete


def send_daily_email(entry, analysis_data, niv_text, esv_text, plan):
    """Send daily reading email to all subscribers."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        logger.info("RESEND_API_KEY not set, skipping email")
        return

    supabase_client = get_supabase_client()
    subscribers = get_subscribers(supabase_client)
    supabase_url = os.environ.get("SUPABASE_URL", "https://your-project.supabase.co")

    next_entry = get_entry_by_day(plan, entry["day_number"] + 1)
    genre_color = GENRE_COLORS.get(entry["genre"], "#6366F1")

    template = Template(EMAIL_TEMPLATE)

    for sub in subscribers:
        # Determine which day to send (subscriber's current_day or today's day)
        sub_day = sub.get("current_day") or entry["day_number"]
        sub_entry = get_entry_by_day(plan, sub_day) or entry

        # Use subscriber's preferred translation
        pref = sub.get("preferred_translation", "NIV")
        passage_text = niv_text if pref == "NIV" else (esv_text or niv_text)
        copyright_text = NIV_COPYRIGHT if pref == "NIV" else ESV_COPYRIGHT
        alt_translation = "ESV" if pref == "NIV" else "NIV"

        # Generate mark-as-read URL
        token = generate_hmac_token(sub["id"], sub_entry["day_number"])
        mark_read_url = f"{supabase_url}/functions/v1/mark-read?user_id={sub['id']}&day={sub_entry['day_number']}&token={token}"
        switch_url = f"{supabase_url}/functions/v1/switch-translation?subscriber_id={sub['id']}&translation={alt_translation}"
        unsub_url = f"{supabase_url}/functions/v1/unsubscribe?subscriber_id={sub['id']}"

        subject = f"\U0001F4D6 Day {sub_entry['day_number']}: {sub_entry['passage']}"
        if analysis_data and analysis_data.get("title"):
            subject += f" — {analysis_data['title']}"

        html_body = template.render(
            day_number=sub_entry["day_number"],
            date_iso=sub_entry["date"],
            genre=sub_entry["genre"],
            genre_color=genre_color,
            passage=sub_entry["passage"],
            week=sub_entry["week"],
            title=analysis_data.get("title", "") if analysis_data else "",
            passage_text=passage_text,
            analysis=analysis_data.get("analysis", "") if analysis_data else "",
            cross_references=analysis_data.get("cross_references", []) if analysis_data else [],
            mark_read_url=mark_read_url,
            next_entry=next_entry,
            copyright=copyright_text,
            alt_translation=alt_translation,
            switch_translation_url=switch_url,
            unsubscribe_url=unsub_url,
        )

        try:
            resp = requests.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "from": "Daily Bible Reading <bible@joshhou.com>",
                    "to": [sub["email"]],
                    "subject": subject,
                    "html": html_body,
                },
                timeout=30,
            )
            if resp.status_code in (200, 201):
                logger.info(f"Email sent to {sub['email']}")
            else:
                logger.warning(f"Resend API returned {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            logger.warning(f"Failed to send email to {sub['email']}: {e}")


def send_reminder_emails(plan, reminder_type):
    """Send reminder emails to subscribers who haven't completed today's reading."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        logger.info("RESEND_API_KEY not set, skipping reminders")
        return

    supabase_client = get_supabase_client()
    if not supabase_client:
        logger.info("Supabase not configured, skipping reminders")
        return

    incomplete = get_incomplete_subscribers(supabase_client, plan)
    if not incomplete:
        logger.info("All subscribers are up to date")
        return

    supabase_url = os.environ.get("SUPABASE_URL", "")
    template = Template(REMINDER_EMAIL_TEMPLATE)

    for sub in incomplete:
        current_day = sub.get("current_day", 1) or 1
        entry = get_entry_by_day(plan, current_day)
        if not entry:
            continue

        genre_color = GENRE_COLORS.get(entry["genre"], "#6366F1")
        token = generate_hmac_token(sub["id"], entry["day_number"])
        mark_read_url = f"{supabase_url}/functions/v1/mark-read?user_id={sub['id']}&day={entry['day_number']}&token={token}"
        unsub_url = f"{supabase_url}/functions/v1/unsubscribe?subscriber_id={sub['id']}"

        if reminder_type == "evening":
            subject = f"\U0001F4D6 Reminder: Day {entry['day_number']} — {entry['passage']} is waiting for you"
        else:
            subject = f"\U0001F4D6 Last call: Day {entry['day_number']} — {entry['passage']} before today's reading"

        html_body = template.render(
            day_number=entry["day_number"],
            date_iso=entry["date"],
            genre=entry["genre"],
            genre_color=genre_color,
            passage=entry["passage"],
            summary="",
            mark_read_url=mark_read_url,
            unsubscribe_url=unsub_url,
        )

        try:
            resp = requests.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "from": "Daily Bible Reading <bible@joshhou.com>",
                    "to": [sub["email"]],
                    "subject": subject,
                    "html": html_body,
                },
                timeout=30,
            )
            if resp.status_code in (200, 201):
                logger.info(f"Reminder sent to {sub['email']}")
            else:
                logger.warning(f"Resend returned {resp.status_code} for {sub['email']}")
        except Exception as e:
            logger.warning(f"Failed to send reminder to {sub['email']}: {e}")

    logger.info(f"Sent {reminder_type} reminders to {len(incomplete)} subscribers")


# --- Main ---

def main():
    parser = argparse.ArgumentParser(description="Bible Reading Plan Generator")
    parser.add_argument("--mode", default="generate", choices=["generate", "remind-evening", "remind-morning"])
    parser.add_argument("--date", default=None, help="Override date (YYYY-MM-DD) for generation")
    args = parser.parse_args()

    plan = load_reading_plan()

    if args.mode in ("remind-evening", "remind-morning"):
        reminder_type = "evening" if args.mode == "remind-evening" else "morning"
        send_reminder_emails(plan, reminder_type)
        return

    # Generate mode
    if args.date:
        # Find entry for the specified date
        entry = None
        for e in plan:
            if e["date"] == args.date:
                entry = e
                break
        if not entry:
            logger.error(f"No reading plan entry for date: {args.date}")
            sys.exit(1)
    else:
        entry = get_today_entry(plan)

    if not entry:
        logger.info("No reading scheduled for today")
        return

    logger.info(f"Generating Day {entry['day_number']}: {entry['passage']} ({entry['genre']})")

    # Check idempotency
    post_path = POSTS_DIR / f"{entry['date']}.html"
    if post_path.exists():
        logger.info(f"Post already exists: {post_path} — skipping")
        # Still update index in case it's stale
        context = load_context()
        analysis_data = None
        # Try to extract analysis data from existing post for index update
        update_index(entry, analysis_data, plan)
        return

    # Step 1: Fetch Bible text
    niv_text, esv_text = fetch_passage_text(entry)

    # Step 2: Load cumulative context
    context = load_context()

    # Step 3: Generate analysis via Claude
    analysis_data = generate_analysis(entry, niv_text, esv_text, context)

    # Step 4: Generate post HTML
    generate_post_html(entry, niv_text, esv_text, analysis_data, plan)

    # Step 5: Update index page
    update_index(entry, analysis_data, plan)

    # Step 6: Update cumulative context
    context.append({
        "day_number": entry["day_number"],
        "date": entry["date"],
        "weekday": entry["weekday"],
        "genre": entry["genre"],
        "passage": entry["passage"],
        "summary": analysis_data.get("summary", "") if analysis_data else "",
    })
    save_context(context)

    # Step 7: Send daily email
    send_daily_email(entry, analysis_data, niv_text, esv_text, plan)

    logger.info(f"Generation complete for Day {entry['day_number']}: {entry['passage']}")


if __name__ == "__main__":
    main()
