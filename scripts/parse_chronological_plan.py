#!/usr/bin/env python3
"""
Parse the Blue Letter Bible 1-Year Chronological reading plan (PDF) into JSON.

Source PDF: "1 Year Chronological Plan.pdf" (365 numbered readings).
Output schema (per day) — no genres, no fixed dates (per-user start):

    {
      "day_number": 121,
      "passage": "2 Samuel 5; 1 Chronicles 11-12",
      "segments": [
        {"book": "2 Samuel", "chapters": [5], "ref": "2 Samuel 5",
         "usfm": "2SA", "start_chapter": 5,
         "link": "https://www.bible.com/bible/111/2SA.5.NIV"},
        {"book": "1 Chronicles", "chapters": [11, 12], "ref": "1 Chronicles 11-12",
         "usfm": "1CH", "start_chapter": 11,
         "link": "https://www.bible.com/bible/111/1CH.11.NIV"}
      ]
    }

Each segment = one passage = one bible.com button.
"""

import json
import re
import sys
from pathlib import Path

import PyPDF2

DEFAULT_PDF = Path.home() / "Downloads" / "1 Year Chronological Plan.pdf"
OUTPUT_PATH = Path(__file__).parent / "reading_plan.json"
YOUVERSION_NIV = 111  # bible.com version id for NIV

# Canonical book -> chapter count (Protestant 66)
CHAPTER_COUNTS = {
    "Genesis": 50, "Exodus": 40, "Leviticus": 27, "Numbers": 36, "Deuteronomy": 34,
    "Joshua": 24, "Judges": 21, "Ruth": 4, "1 Samuel": 31, "2 Samuel": 24,
    "1 Kings": 22, "2 Kings": 25, "1 Chronicles": 29, "2 Chronicles": 36, "Ezra": 10,
    "Nehemiah": 13, "Esther": 10, "Job": 42, "Psalms": 150, "Proverbs": 31,
    "Ecclesiastes": 12, "Song of Solomon": 8, "Isaiah": 66, "Jeremiah": 52,
    "Lamentations": 5, "Ezekiel": 48, "Daniel": 12, "Hosea": 14, "Joel": 3, "Amos": 9,
    "Obadiah": 1, "Jonah": 4, "Micah": 7, "Nahum": 3, "Habakkuk": 3, "Zephaniah": 3,
    "Haggai": 2, "Zechariah": 14, "Malachi": 4, "Matthew": 28, "Mark": 16, "Luke": 24,
    "John": 21, "Acts": 28, "Romans": 16, "1 Corinthians": 16, "2 Corinthians": 13,
    "Galatians": 6, "Ephesians": 6, "Philippians": 4, "Colossians": 4,
    "1 Thessalonians": 5, "2 Thessalonians": 3, "1 Timothy": 6, "2 Timothy": 4,
    "Titus": 3, "Philemon": 1, "Hebrews": 13, "James": 5, "1 Peter": 5, "2 Peter": 3,
    "1 John": 5, "2 John": 1, "3 John": 1, "Jude": 1, "Revelation": 22,
}

# Canonical book -> USFM code (YouVersion/bible.com uses these)
USFM = {
    "Genesis": "GEN", "Exodus": "EXO", "Leviticus": "LEV", "Numbers": "NUM",
    "Deuteronomy": "DEU", "Joshua": "JOS", "Judges": "JDG", "Ruth": "RUT",
    "1 Samuel": "1SA", "2 Samuel": "2SA", "1 Kings": "1KI", "2 Kings": "2KI",
    "1 Chronicles": "1CH", "2 Chronicles": "2CH", "Ezra": "EZR", "Nehemiah": "NEH",
    "Esther": "EST", "Job": "JOB", "Psalms": "PSA", "Proverbs": "PRO",
    "Ecclesiastes": "ECC", "Song of Solomon": "SNG", "Isaiah": "ISA", "Jeremiah": "JER",
    "Lamentations": "LAM", "Ezekiel": "EZK", "Daniel": "DAN", "Hosea": "HOS",
    "Joel": "JOL", "Amos": "AMO", "Obadiah": "OBA", "Jonah": "JON", "Micah": "MIC",
    "Nahum": "NAM", "Habakkuk": "HAB", "Zephaniah": "ZEP", "Haggai": "HAG",
    "Zechariah": "ZEC", "Malachi": "MAL", "Matthew": "MAT", "Mark": "MRK", "Luke": "LUK",
    "John": "JHN", "Acts": "ACT", "Romans": "ROM", "1 Corinthians": "1CO",
    "2 Corinthians": "2CO", "Galatians": "GAL", "Ephesians": "EPH", "Philippians": "PHP",
    "Colossians": "COL", "1 Thessalonians": "1TH", "2 Thessalonians": "2TH",
    "1 Timothy": "1TI", "2 Timothy": "2TI", "Titus": "TIT", "Philemon": "PHM",
    "Hebrews": "HEB", "James": "JAS", "1 Peter": "1PE", "2 Peter": "2PE", "1 John": "1JN",
    "2 John": "2JN", "3 John": "3JN", "Jude": "JUD", "Revelation": "REV",
}

# Names we try to match at the start of a reference (canonical + aliases).
# Longest match wins, so "1 Chronicles" beats a hypothetical "1 Ch".
ALIASES = {"Psalm": "Psalms", "Song of Songs": "Song of Solomon"}
MATCH_NAMES = sorted(
    list(CHAPTER_COUNTS.keys()) + list(ALIASES.keys()),
    key=len, reverse=True,
)


def clean_text(raw: str) -> str:
    """Collapse whitespace and repair known PDF-extraction artifacts."""
    s = raw
    s = s.replace("Psal m", "Psalm")          # day 206: "Psal m 76"
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s*-\s*", "-", s)             # "1 -3" -> "1-3"
    s = re.sub(r"\bPsalm 9 0\b", "Psalm 90", s)  # day 81: split "90"
    return s


def extract_days(pdf_path: Path) -> dict:
    """Return {day_number: raw_reference_string} from the PDF."""
    reader = PyPDF2.PdfReader(str(pdf_path))
    text = " ".join(pg.extract_text() for pg in reader.pages)
    # Day markers look like "121." — chapter refs never carry a trailing dot.
    matches = re.findall(r"(\d{1,3})\.\s+(.*?)(?=\s+\d{1,3}\.\s|\s*$)", text, re.S)
    days = {}
    for num, body in matches:
        n = int(num)
        if 1 <= n <= 365 and n not in days:
            days[n] = clean_text(body)
    return days


def canonical(name: str) -> str:
    return ALIASES.get(name, name)


def match_book(s: str):
    """Longest canonical book name that prefixes s (case-insensitive)."""
    low = s.lower()
    best = None
    for name in MATCH_NAMES:
        if low.startswith(name.lower()) and (best is None or len(name) > len(best)):
            best = name
    return best


def format_chapters(chapters: list) -> str:
    """[6,8,9,10,14] -> '6, 8-10, 14' (compact ranges, original order)."""
    if not chapters:
        return ""
    parts, run_start, prev = [], chapters[0], chapters[0]
    for c in chapters[1:]:
        if c == prev + 1:
            prev = c
            continue
        parts.append(f"{run_start}-{prev}" if run_start != prev else f"{run_start}")
        run_start = prev = c
    parts.append(f"{run_start}-{prev}" if run_start != prev else f"{run_start}")
    return ", ".join(parts)


def make_segment(book: str, chapters: list) -> dict:
    count = CHAPTER_COUNTS[book]
    whole_book = (not chapters) or chapters == list(range(1, count + 1))
    if not chapters:
        chapters = list(range(1, count + 1))
    start = chapters[0]
    ref = book if whole_book else f"{book} {format_chapters(chapters)}"
    return {
        "book": book,
        "chapters": chapters,
        "ref": ref,
        "usfm": USFM[book],
        "start_chapter": start,
        "link": f"https://www.bible.com/bible/{YOUVERSION_NIV}/{USFM[book]}.{start}.NIV",
    }


def parse_part(part: str) -> list:
    """Parse one reference part into one or more segments."""
    part = part.strip().strip(";,").strip()
    if not part:
        return []

    # Special: "1 & 2 Thessalonians" -> 1 Thessalonians + 2 Thessalonians
    m = re.match(r"^(\d)\s*&\s*(\d)\s+(.+)$", part)
    if m:
        a, b, name = m.group(1), m.group(2), canonical(match_book(m.group(3)) or m.group(3).strip())
        base = name.split(" ", 1)[-1] if name[0].isdigit() else name
        return [make_segment(f"{a} {base}", []), make_segment(f"{b} {base}", [])]

    # Special: "2, 3 John" -> 2 John + 3 John
    m = re.match(r"^(\d)\s*,\s*(\d)\s+([A-Za-z].*)$", part)
    if m:
        base = m.group(3).strip()
        return [make_segment(f"{m.group(1)} {base}", []), make_segment(f"{m.group(2)} {base}", [])]

    book = match_book(part)
    if not book:
        raise ValueError(f"Unknown book in part: {part!r}")
    canon = canonical(book)
    remainder = part[len(book):].strip()

    if not remainder:
        return [make_segment(canon, [])]

    # Walk comma-separated tokens: numbers/ranges are chapters; an alphabetic
    # token starts a new book (recurse on the rest).
    chapters, trailing = [], None
    tokens = [t.strip() for t in remainder.split(",")]
    for i, tok in enumerate(tokens):
        if re.fullmatch(r"\d+(-\d+)?", tok):
            if "-" in tok:
                a, b = map(int, tok.split("-"))
                chapters.extend(range(a, b + 1))
            else:
                chapters.append(int(tok))
        else:
            trailing = ", ".join(tokens[i:])  # a new book begins here
            break

    segments = [make_segment(canon, chapters)]
    if trailing:
        segments.extend(parse_part(trailing))
    return segments


def parse_reference(ref: str) -> list:
    segments = []
    for part in ref.split(";"):
        segments.extend(parse_part(part))
    return segments


def main():
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    if not pdf_path.exists():
        print(f"Error: PDF not found at {pdf_path}")
        sys.exit(1)

    days = extract_days(pdf_path)
    missing = [n for n in range(1, 366) if n not in days]
    if missing:
        print(f"WARNING: missing day numbers: {missing}")

    entries, problems = [], []
    for n in sorted(days):
        raw = days[n]
        try:
            segments = parse_reference(raw)
            # validate chapter ranges
            for seg in segments:
                cap = CHAPTER_COUNTS[seg["book"]]
                bad = [c for c in seg["chapters"] if c < 1 or c > cap]
                if bad:
                    problems.append(f"Day {n}: {seg['book']} chapters out of range {bad} (raw {raw!r})")
            passage = "; ".join(seg["ref"] for seg in segments)
            entries.append({"day_number": n, "passage": passage, "segments": segments})
        except Exception as e:
            problems.append(f"Day {n}: {e} (raw {raw!r})")

    OUTPUT_PATH.write_text(json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Parsed {len(entries)} days -> {OUTPUT_PATH.name}")
    if problems:
        print(f"\n{len(problems)} PROBLEM(S):")
        for p in problems:
            print("  -", p)
    else:
        print("Validation: all books known, all chapters in range. OK")

    # spot-check the trickiest days
    by_num = {e["day_number"]: e for e in entries}
    print("\nSpot checks:")
    for n in [1, 4, 81, 97, 105, 112, 121, 200, 274, 331, 349, 359, 361, 365]:
        e = by_num.get(n)
        if e:
            links = " | ".join(f"{s['ref']} -> {s['usfm']}.{s['start_chapter']}" for s in e["segments"])
            print(f"  Day {n}: {e['passage']}")
            print(f"          {links}")


if __name__ == "__main__":
    main()
