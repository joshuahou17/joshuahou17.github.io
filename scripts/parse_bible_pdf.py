#!/usr/bin/env python3
"""
Parse NIV Bible PDF into structured JSON.

Strategy: extract raw text per book, then use a two-pass approach:
1. Find all number-letter markers
2. Use known chapter counts to identify chapter boundaries
   (a chapter break = number N where N = next expected chapter, followed by verse 2)
"""

import json
import re
import sys
from pathlib import Path

import PyPDF2

PDF_PATH = Path("/Users/joshuahou/Downloads/NIV Bible.pdf")
OUTPUT_PATH = Path(__file__).parent.parent / "bible" / "niv.json"

PDF_BOOK_NAMES = [
    ("Genesis", "Genesis", 50), ("Exodus", "Exodus", 40),
    ("Leviticus", "Leviticus", 27), ("Numbers", "Numbers", 36),
    ("Deuteronomy", "Deuteronomy", 34), ("Joshua", "Joshua", 24),
    ("Judges", "Judges", 21), ("Ruth", "Ruth", 4),
    ("1st Samuel", "1 Samuel", 31), ("2nd Samuel", "2 Samuel", 24),
    ("1st Kings", "1 Kings", 22), ("2nd Kings", "2 Kings", 25),
    ("1st Chronicles", "1 Chronicles", 29), ("2nd Chronicles", "2 Chronicles", 36),
    ("Ezra", "Ezra", 10), ("Nehemiah", "Nehemiah", 13),
    ("Esther", "Esther", 10), ("Job", "Job", 42),
    ("Psalms", "Psalms", 150), ("Proverbs", "Proverbs", 31),
    ("Ecclesiastes", "Ecclesiastes", 12), ("Song of Solomon", "Song of Solomon", 8),
    ("Isaiah", "Isaiah", 66), ("Jeremiah", "Jeremiah", 52),
    ("Lamentations", "Lamentations", 5), ("Ezekiel", "Ezekiel", 48),
    ("Daniel", "Daniel", 12),
    ("Hosea", "Hosea", 14), ("Joel", "Joel", 3), ("Amos", "Amos", 9),
    ("Obadiah", "Obadiah", 1), ("Jonah", "Jonah", 4), ("Micah", "Micah", 7),
    ("Nahum", "Nahum", 3), ("Habakkuk", "Habakkuk", 3),
    ("Zephaniah", "Zephaniah", 3), ("Haggai", "Haggai", 2),
    ("Zechariah", "Zechariah", 14), ("Malachi", "Malachi", 4),
    ("Matthew", "Matthew", 28), ("Mark", "Mark", 16),
    ("Luke", "Luke", 24), ("John", "John", 21),
    ("Acts", "Acts", 28), ("Romans", "Romans", 16),
    ("1st Corinthians", "1 Corinthians", 16), ("2nd Corinthians", "2 Corinthians", 13),
    ("Galatians", "Galatians", 6), ("Ephesians", "Ephesians", 6),
    ("Philippians", "Philippians", 4), ("Colossians", "Colossians", 4),
    ("1st Thessalonians", "1 Thessalonians", 5), ("2nd Thessalonians", "2 Thessalonians", 3),
    ("1st Timothy", "1 Timothy", 6), ("2nd Timothy", "2 Timothy", 4),
    ("Titus", "Titus", 3), ("Philemon", "Philemon", 1),
    ("Hebrews", "Hebrews", 13), ("James", "James", 5),
    ("1st Peter", "1 Peter", 5), ("2nd Peter", "2 Peter", 3),
    ("1st John", "1 John", 5), ("2nd John", "2 John", 1),
    ("3rd John", "3 John", 1), ("Jude", "Jude", 1),
    ("Revelation", "Revelation", 22),
]

PDF_BOOK_LIST = [pdf for pdf, _, _ in PDF_BOOK_NAMES]
MARKER = re.compile(r'(\d{1,3})\s?([A-Za-z"\'\(])')


def find_book_pages(reader):
    book_pages = {}
    for i in range(len(reader.pages)):
        first_line = reader.pages[i].extract_text().strip().split("\n")[0].strip()
        if first_line in PDF_BOOK_LIST:
            book_pages[first_line] = i
    return book_pages


def extract_book_text(reader, book_pages, pdf_name):
    start = book_pages[pdf_name]
    idx = PDF_BOOK_LIST.index(pdf_name)
    end = book_pages.get(PDF_BOOK_LIST[idx + 1], len(reader.pages)) if idx + 1 < len(PDF_BOOK_LIST) else len(reader.pages)

    text = ""
    for i in range(start, end):
        t = reader.pages[i].extract_text()
        if i == start:
            lines = t.split("\n")
            if lines[0].strip() == pdf_name:
                t = "\n".join(lines[1:])
        text += t + " "
    return text


def clean(text):
    text = re.sub(r'\s*\n\s*', ' ', text)
    return re.sub(r'\s{2,}', ' ', text).strip()


def get_text_between(text, matches, idx):
    """Get cleaned text from after match[idx]'s full match to match[idx+1]'s start."""
    start = matches[idx].start() + len(matches[idx].group(0))  # skip number + optional space + first char
    end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
    # Prepend the captured first character back
    first_char = matches[idx].group(2)
    return clean(first_char + text[start:end])


def parse_book(text, expected_chapters):
    """Parse book text into chapters using known chapter count."""
    matches = list(MARKER.finditer(text))
    if not matches:
        return {"1": {"1": clean(text)}}

    # Step 1: Find chapter break positions
    # A chapter break for chapter N is a marker with value N,
    # where the next valid marker (with text >= 3 chars) has value 2.
    # We search in order of chapter numbers to avoid ambiguity.
    chapter_break_indices = {1: 0}  # Chapter 1 starts at first marker

    for ch in range(2, expected_chapters + 1):
        # Search for a marker with value == ch, followed by a marker with value 2
        for idx in range(chapter_break_indices.get(ch - 1, 0) + 1, len(matches)):
            num = int(matches[idx].group(1))
            if num != ch:
                continue

            # Check that the NEXT valid marker is 2
            for j in range(idx + 1, min(idx + 8, len(matches))):
                next_text = get_text_between(text, matches, j)
                if len(next_text) >= 3:
                    next_num = int(matches[j].group(1))
                    if next_num == 2:
                        chapter_break_indices[ch] = idx
                    break
            if ch in chapter_break_indices:
                break

    # Step 2: Extract verses for each chapter
    chapters = {}
    sorted_chs = sorted(chapter_break_indices.keys())

    for ci, ch_num in enumerate(sorted_chs):
        start_idx = chapter_break_indices[ch_num]

        # End = start of next chapter or end of matches
        if ci + 1 < len(sorted_chs):
            end_idx = chapter_break_indices[sorted_chs[ci + 1]]
        else:
            end_idx = len(matches)

        verses = {}
        expected_verse = 1

        for idx in range(start_idx, end_idx):
            num = int(matches[idx].group(1))
            verse_text = get_text_between(text, matches, idx)

            if not verse_text or len(verse_text) < 3:
                continue

            # First marker in chapter = verse 1 (the number itself is the chapter number for ch > 1)
            if idx == start_idx:
                verses["1"] = verse_text
                expected_verse = 2
                continue

            # Sequential verse
            if num == expected_verse:
                verses[str(num)] = verse_text
                expected_verse = num + 1
            elif expected_verse < num <= expected_verse + 3:
                verses[str(num)] = verse_text
                expected_verse = num + 1
            # else: number embedded in text, skip

        if verses:
            chapters[str(ch_num)] = verses

    return chapters


def parse_psalms(text):
    """Psalms have explicit PSALM N headers."""
    splits = re.split(r'PSALM\s+(\d+)', text)
    chapters = {}

    i = 1
    while i < len(splits) - 1:
        psalm_num = splits[i].strip()
        psalm_text = splits[i + 1]
        matches = list(MARKER.finditer(psalm_text))

        verses = {}
        expected = 1
        for idx in range(len(matches)):
            num = int(matches[idx].group(1))
            start = matches[idx].start() + len(matches[idx].group(1))
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(psalm_text)
            vt = clean(psalm_text[start:end])

            if not vt or len(vt) < 3:
                continue
            if num == expected or (expected < num <= expected + 2):
                verses[str(num)] = vt
                expected = num + 1

        if verses:
            chapters[psalm_num] = verses
        i += 2

    return chapters


def main():
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else PDF_PATH
    print(f"Reading: {pdf_path}")
    reader = PyPDF2.PdfReader(str(pdf_path))
    print(f"Pages: {len(reader.pages)}")

    book_pages = find_book_pages(reader)
    print(f"Found {len(book_pages)} books")

    bible = {}
    total_ch = 0
    total_v = 0
    issues = []

    for pdf_name, norm_name, expected_ch in PDF_BOOK_NAMES:
        if pdf_name not in book_pages:
            print(f"  WARNING: {pdf_name} not found")
            continue

        text = extract_book_text(reader, book_pages, pdf_name)

        if norm_name == "Psalms":
            chapters = parse_psalms(text)
        else:
            chapters = parse_book(text, expected_ch)

        bible[norm_name] = chapters
        got_ch = len(chapters)
        got_v = sum(len(v) for v in chapters.values())
        total_ch += got_ch
        total_v += got_v

        status = "OK" if got_ch == expected_ch else f"WANT {expected_ch}"
        if got_ch != expected_ch:
            issues.append(f"{norm_name}: {got_ch}/{expected_ch}")
        print(f"  {norm_name}: {got_ch} ch ({status}), {got_v} verses")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(bible, ensure_ascii=False), encoding="utf-8")

    print(f"\nTotal: {total_ch} chapters, {total_v} verses")
    print(f"Written to: {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size / 1024 / 1024:.1f} MB)")

    if issues:
        print(f"\nChapter count mismatches ({len(issues)}):")
        for iss in issues:
            print(f"  {iss}")

    print("\n=== Spot Checks ===")
    for book, ch, v in [
        ("Genesis", "1", "1"), ("Genesis", "2", "1"), ("Genesis", "50", "26"),
        ("Romans", "1", "1"), ("Romans", "2", "1"), ("Romans", "16", "27"),
        ("Psalms", "23", "1"), ("Psalms", "150", "6"),
        ("John", "1", "1"), ("John", "3", "16"), ("John", "21", "25"),
        ("Matthew", "1", "1"), ("Matthew", "28", "20"),
        ("Revelation", "1", "1"), ("Revelation", "22", "21"),
    ]:
        txt = bible.get(book, {}).get(ch, {}).get(v, "NOT FOUND")
        s = "OK" if txt != "NOT FOUND" else "!!"
        print(f"  [{s}] {book} {ch}:{v} = {txt[:70]}...")


if __name__ == "__main__":
    main()
