#!/usr/bin/env python3
"""
Daily Bible Reading Plan Generator (chronological, link-out edition).

The plan is a one-year *chronological* journey. We do NOT host scripture text:
each reading links out to the NIV on the YouVersion Bible App. The content we
own is the AI-written analysis (Context, Key themes, Takeaways, Connections,
Reflection), generated once for all 365 days and keyed by DAY NUMBER, so any
reader — wherever they are in the plan — gets theirs.

Each day produces two files in bible/posts/:
    day-NNN.html   the rendered page
    day-NNN.json   the analysis data (used to send emails later)

Modes:
    --mode backfill            Generate analysis for every day missing it (the one-time mass run)
    --mode day --day N         (Re)generate a single day
    --mode send                Email each subscriber the day they're on (computed from their start date)
    --mode send-test --day N   Send day N's email to one test address (--to, or TEST_EMAIL env)
    --mode remind-evening      Nudge subscribers who haven't completed their current day
    --mode remind-morning      Same, morning copy

Environment:
    ANTHROPIC_API_KEY    Claude analysis (with web search)
    RESEND_API_KEY       Email sending (optional)
    SUPABASE_URL / SUPABASE_SERVICE_KEY   Subscribers + progress (optional)
    HMAC_SECRET          Mark-as-read token signing
    TEST_EMAIL           Default recipient for --mode send-test
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

sys.path.insert(0, str(Path(__file__).parent))
import bible_links as bl
from bible_config import (
    BIBLE_POST_TEMPLATE,
    BIBLE_SYSTEM_PROMPT,
    BIBLE_USER_PROMPT_TEMPLATE,
    EMAIL_TEMPLATE,
    REMINDER_EMAIL_TEMPLATE,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).parent.parent
BIBLE_DIR = REPO_ROOT / "bible"
POSTS_DIR = BIBLE_DIR / "posts"
PLAN_PATH = Path(__file__).parent / "reading_plan.json"

TOTAL_DAYS = 365
ET_OFFSET = timezone(timedelta(hours=-4))  # EDT
MODEL = "claude-sonnet-4-6"
EMAIL_FROM = "Daily Bible Reading <bible@joshhou.com>"
SITE = "https://joshhou.com"


# --- Plan helpers ---

def load_reading_plan(path=PLAN_PATH):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def get_entry_by_day(plan, day_number):
    for entry in plan:
        if entry["day_number"] == day_number:
            return entry
    return None


def post_html_path(day):
    return POSTS_DIR / f"day-{day:03d}.html"


def post_json_path(day):
    return POSTS_DIR / f"day-{day:03d}.json"


# --- Cumulative context (for backward cross-references) ---

def build_context_string(prior):
    """prior = list of {day_number, passage, summary} for earlier days."""
    if not prior:
        return "This is the first reading in the plan; nothing has been read yet."
    lines = [f"Day {c['day_number']}: {c['passage']} — {c.get('summary', '')}" for c in prior]
    return "Earlier readings in this plan:\n" + "\n".join(lines)


# --- Claude analysis ---

def generate_analysis(entry, prior_context):
    """Call Claude (with web search) for the day's analysis. Returns dict or None."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.info("ANTHROPIC_API_KEY not set, skipping analysis generation")
        return None
    try:
        import anthropic
    except ImportError:
        logger.warning("anthropic package not installed, skipping analysis")
        return None

    user_prompt = BIBLE_USER_PROMPT_TEMPLATE.format(
        day_number=entry["day_number"],
        passage=entry["passage"],
        context_section=build_context_string(prior_context),
    )

    for attempt in range(1, 4):
        try:
            client = anthropic.Anthropic(api_key=api_key)
            response = client.messages.create(
                model=MODEL,
                max_tokens=4096,
                system=BIBLE_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
                tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 4}],
            )
            result_text = "".join(b.text for b in response.content if b.type == "text")
            m = re.search(r"\{[\s\S]*\}", result_text)
            if m:
                data = json.loads(m.group())
                logger.info(f"Analysis generated for Day {entry['day_number']} (attempt {attempt})")
                return data
            logger.warning(f"Day {entry['day_number']} attempt {attempt}: no JSON in response")
        except Exception as e:
            logger.warning(f"Day {entry['day_number']} attempt {attempt}: {e}")

    logger.error(f"All attempts failed for Day {entry['day_number']}")
    return None


# --- Rendering ---

def _post_context(entry, analysis, plan):
    """Shared render kwargs for both the page and the email."""
    day = entry["day_number"]
    prev, nxt = get_entry_by_day(plan, day - 1), get_entry_by_day(plan, day + 1)
    a = analysis or {}
    return dict(
        day_number=day,
        passage=entry["passage"],
        title=a.get("title", ""),
        summary=a.get("summary", ""),
        buttons=bl.passage_buttons(entry["segments"]),
        context=a.get("context", ""),
        themes=a.get("themes", ""),
        takeaways=a.get("takeaways", []),
        connections=a.get("connections", ""),
        reflection=a.get("reflection", ""),
        cross_references=bl.cross_reference_links(a.get("cross_references", [])),
        sources=a.get("sources", []),
        prev_day=(day - 1 if prev else None),
        prev_passage=(prev["passage"] if prev else None),
        next_day=(day + 1 if nxt else None),
        next_passage=(nxt["passage"] if nxt else None),
    )


def write_day(entry, analysis, plan):
    """Render and save day-NNN.html and day-NNN.json."""
    day = entry["day_number"]
    html = Template(BIBLE_POST_TEMPLATE).render(**_post_context(entry, analysis, plan))
    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    post_html_path(day).write_text(html, encoding="utf-8")
    # sidecar data for the website + email: analysis + pre-linked references + buttons
    sidecar = dict(analysis or {})
    sidecar["passage"] = entry["passage"]
    sidecar["buttons"] = bl.passage_buttons(entry["segments"])
    sidecar["cross_reference_links"] = bl.cross_reference_links((analysis or {}).get("cross_references", []))
    post_json_path(day).write_text(json.dumps(sidecar, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info(f"Wrote Day {day:03d}: {entry['passage']}")


# --- Email ---

def generate_hmac_token(user_id, day_number):
    secret = os.environ.get("HMAC_SECRET", "dev-secret")
    return hmac_mod.new(secret.encode(), f"{user_id}:{day_number}".encode(), hashlib.sha256).hexdigest()


def render_email(entry, analysis, plan, sub_id, reminder=False):
    day = entry["day_number"]
    supa = os.environ.get("SUPABASE_URL", "")
    token = generate_hmac_token(sub_id, day)
    ctx = _post_context(entry, analysis, plan)
    ctx.update(
        mark_read_url=f"{supa}/functions/v1/mark-read?user_id={sub_id}&day={day}&token={token}",
        web_url=f"{SITE}/bible/posts/day-{day:03d}.html",
        unsubscribe_url=f"{supa}/functions/v1/unsubscribe?user_id={sub_id}",
    )
    tmpl = REMINDER_EMAIL_TEMPLATE if reminder else EMAIL_TEMPLATE
    return Template(tmpl).render(**ctx)


def send_email(to_email, subject, html):
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        logger.info(f"RESEND_API_KEY not set — would send to {to_email}: {subject!r}")
        return False
    try:
        resp = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"from": EMAIL_FROM, "to": [to_email], "subject": subject, "html": html},
            timeout=30,
        )
        if resp.status_code in (200, 201):
            logger.info(f"Email sent to {to_email}")
            return True
        logger.warning(f"Resend {resp.status_code} for {to_email}: {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"Send failed for {to_email}: {e}")
    return False


def load_analysis(day):
    p = post_json_path(day)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


# --- Supabase / subscribers ---

def get_supabase_client():
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return None
    try:
        from supabase import create_client
        return create_client(url, key)
    except ImportError:
        logger.warning("supabase package not installed")
        return None


def get_subscribers(sb):
    if not sb:
        return []
    try:
        return sb.table("bible_subscribers").select("*").eq("unsubscribed", False).execute().data or []
    except Exception as e:
        logger.warning(f"Failed to fetch subscribers: {e}")
        return []


def scheduled_day(sub):
    """How far the calendar has advanced for this subscriber (one day per day)."""
    sd = sub.get("start_date")
    if sd:
        try:
            start = datetime.strptime(sd, "%Y-%m-%d").date()
            today = datetime.now(ET_OFFSET).date()
            return min(max((today - start).days + 1, 1), TOTAL_DAYS)
        except Exception:
            pass
    return min(max(sub.get("current_day") or 1, 1), TOTAL_DAYS)


def completed_days(sb, user_id):
    if not sb or not user_id:
        return set()
    try:
        res = sb.table("bible_reading_progress").select("day_number, completed").eq("user_id", user_id).execute()
        return {r["day_number"] for r in (res.data or []) if r.get("completed")}
    except Exception:
        return set()


def first_incomplete(done):
    d = 1
    while d in done and d < TOTAL_DAYS:
        d += 1
    return d


def email_day_for(sb, sub):
    """The day to email: the oldest UNREAD day, but never ahead of the calendar
    schedule. Returns None if the reader is caught up (nothing due today)."""
    sched = scheduled_day(sub)
    done = completed_days(sb, sub.get("user_id") or sub.get("id"))
    fi = first_incomplete(done)
    if fi > sched:
        return None  # everything due so far is read — no email today
    return min(fi, sched)


# --- Modes ---

def run_backfill(plan):
    """Generate analysis for every day that doesn't have it yet (one-time mass run)."""
    targets = [e for e in plan if not post_json_path(e["day_number"]).exists()]
    if not targets:
        logger.info("Backfill: every day already has analysis")
        return
    logger.info(f"Backfill: generating {len(targets)} day(s)")

    prior = []  # accumulate summaries in day order for backward cross-references
    failures = []
    for e in sorted(plan, key=lambda x: x["day_number"]):
        if post_json_path(e["day_number"]).exists():
            existing = load_analysis(e["day_number"]) or {}
            if existing.get("summary"):
                prior.append({"day_number": e["day_number"], "passage": e["passage"], "summary": existing["summary"]})
            continue
        analysis = generate_analysis(e, prior)
        if analysis is None:
            # Don't lose the whole run for one bad day — skip and keep going.
            # The day stays un-generated, so a later backfill re-run retries just it.
            logger.error(f"Backfill: FAILED Day {e['day_number']} — skipping; re-run backfill to retry it")
            failures.append(e["day_number"])
            continue
        write_day(e, analysis, plan)
        prior.append({"day_number": e["day_number"], "passage": e["passage"], "summary": analysis.get("summary", "")})
    if failures:
        logger.warning(f"Backfill finished with {len(failures)} failed day(s): {failures} — re-run 'backfill' to fill them")
    else:
        logger.info("Backfill complete — all days generated")


def run_day(plan, day):
    entry = get_entry_by_day(plan, day)
    if not entry:
        logger.error(f"No plan entry for day {day}")
        sys.exit(1)
    prior = []
    for d in range(1, day):
        a = load_analysis(d)
        if a and a.get("summary"):
            prior.append({"day_number": d, "passage": get_entry_by_day(plan, d)["passage"], "summary": a["summary"]})
    analysis = generate_analysis(entry, prior)
    if analysis is None:
        sys.exit(1)
    write_day(entry, analysis, plan)


def run_send(plan):
    """Daily send: each subscriber gets their oldest unread day (resending a
    missed day rather than marching past it)."""
    sb = get_supabase_client()
    subs = get_subscribers(sb)
    if not subs:
        logger.info("No subscribers")
        return
    sent = 0
    for sub in subs:
        day = email_day_for(sb, sub)
        if day is None:
            logger.info(f"{sub.get('email')} is caught up — no email today")
            continue
        entry, analysis = get_entry_by_day(plan, day), load_analysis(day)
        if not entry or not analysis:
            logger.warning(f"Day {day} not generated yet — skipping {sub.get('email')}")
            continue
        uid = sub.get("user_id") or sub["id"]
        subject = f"Day {day}: {entry['passage']}" + (f" — {analysis['title']}" if analysis.get("title") else "")
        if send_email(sub["email"], subject, render_email(entry, analysis, plan, uid)):
            sent += 1
    logger.info(f"Sent {sent} email(s)")


def run_send_test(plan, day, to_email):
    entry, analysis = get_entry_by_day(plan, day), load_analysis(day)
    if not entry or not analysis:
        logger.error(f"Day {day} has no generated analysis yet — run backfill or --mode day first")
        sys.exit(1)
    subject = f"[TEST] Day {day}: {entry['passage']}" + (f" — {analysis['title']}" if analysis.get("title") else "")
    ok = send_email(to_email, subject, render_email(entry, analysis, plan, "test"))
    logger.info(f"Test email to {to_email}: {'sent' if ok else 'not sent (check RESEND_API_KEY)'}")


def run_reminders(plan, kind):
    sb = get_supabase_client()
    subs = get_subscribers(sb)
    if not subs:
        logger.info("No subscribers for reminders")
        return
    sent = 0
    for sub in subs:
        day = email_day_for(sb, sub)
        if day is None:
            continue  # caught up — no nudge needed
        entry, analysis = get_entry_by_day(plan, day), load_analysis(day)
        if not entry or not analysis:
            continue
        uid = sub.get("user_id") or sub["id"]
        word = "waiting for you" if kind == "evening" else "before today's reading"
        subject = f"Day {day}: {entry['passage']} is {word}"
        send_email(sub["email"], subject, render_email(entry, analysis, plan, uid, reminder=True))
        sent += 1
    logger.info(f"Sent {sent} {kind} reminders")


def main():
    p = argparse.ArgumentParser(description="Bible Reading Plan Generator")
    p.add_argument("--mode", default="backfill",
                   choices=["backfill", "day", "send", "send-test", "remind-evening", "remind-morning"])
    p.add_argument("--day", type=int, default=None)
    p.add_argument("--to", default=None, help="recipient for send-test")
    args = p.parse_args()

    plan = load_reading_plan()

    if args.mode == "backfill":
        run_backfill(plan)
    elif args.mode == "day":
        if not args.day:
            p.error("--day required for --mode day")
        run_day(plan, args.day)
    elif args.mode == "send":
        run_send(plan)
    elif args.mode == "send-test":
        to = args.to or os.environ.get("TEST_EMAIL", "joshuahou17@gmail.com")
        run_send_test(plan, args.day or 1, to)
    elif args.mode == "remind-evening":
        run_reminders(plan, "evening")
    elif args.mode == "remind-morning":
        run_reminders(plan, "morning")


if __name__ == "__main__":
    main()
