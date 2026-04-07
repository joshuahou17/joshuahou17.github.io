#!/usr/bin/env python3
"""
Seed the bible_reading_plan table in Supabase from reading_plan.json.

Environment variables:
    SUPABASE_URL        - Supabase project URL
    SUPABASE_SERVICE_KEY - Supabase service role key
"""

import json
import os
import sys
from pathlib import Path

PLAN_PATH = Path(__file__).parent / "reading_plan.json"


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not url or not key:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        sys.exit(1)

    try:
        from supabase import create_client
    except ImportError:
        print("Error: supabase package not installed. Run: pip install supabase")
        sys.exit(1)

    client = create_client(url, key)

    # Load reading plan
    plan = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    print(f"Loaded {len(plan)} entries from {PLAN_PATH}")

    # Prepare rows (only the columns in the table)
    rows = [
        {
            "day_number": entry["day_number"],
            "date": entry["date"],
            "weekday": entry["weekday"],
            "genre": entry["genre"],
            "passage": entry["passage"],
            "week": entry["week"],
        }
        for entry in plan
    ]

    # Upsert in batches of 50
    batch_size = 50
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        result = client.table("bible_reading_plan").upsert(batch).execute()
        print(f"  Upserted rows {i + 1}–{i + len(batch)}")

    print(f"Seeded {len(rows)} rows into bible_reading_plan")


if __name__ == "__main__":
    main()
