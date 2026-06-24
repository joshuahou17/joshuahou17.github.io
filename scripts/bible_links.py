#!/usr/bin/env python3
"""
Turn passage references into bible.com (YouVersion) NIV links.

bible.com URL format:
    chapter:        https://www.bible.com/bible/111/ROM.1.NIV
    single verse:   https://www.bible.com/bible/111/JHN.3.16.NIV
    verse range:    https://www.bible.com/bible/111/ROM.5.12-19.NIV

Used for both the per-passage "Read in the NIV" buttons (from plan segments)
and the clickable cross-references inside an analysis.
"""

import re

from bible_config import OSIS_BOOK_MAP  # canonical book name -> USFM/YouVersion code

NIV_VERSION = 111
BASE = "https://www.bible.com/bible"

ALIASES = {"Psalm": "Psalms", "Song of Songs": "Song of Solomon"}
# longest names first so "1 John" wins over "John", "Song of Solomon" over nothing
_NAMES = sorted(list(OSIS_BOOK_MAP.keys()) + list(ALIASES.keys()), key=len, reverse=True)


def _canon(name):
    return ALIASES.get(name, name)


def ref_to_url(ref, version=NIV_VERSION):
    """'Romans 5:12-19' -> https://www.bible.com/bible/111/ROM.5.12-19.NIV

    Handles book-only, chapter, single verse, and verse ranges; tolerates
    en/em dashes and a leading book number (e.g. '2 Samuel 7:12-16').
    Returns None if the book can't be identified.
    """
    s = ref.strip().replace("–", "-").replace("—", "-")
    low = s.lower()
    book = next((n for n in _NAMES if low.startswith(n.lower())), None)
    if not book:
        return None
    code = OSIS_BOOK_MAP[_canon(book)]
    rest = s[len(book):].strip()

    m = re.match(r"(\d+)(?::(\d+)(?:\s*-\s*(\d+))?)?", rest)
    if not m:
        return f"{BASE}/{version}/{code}.1.NIV"  # book-only -> chapter 1
    chapter, v_start, v_end = m.group(1), m.group(2), m.group(3)
    path = f"{code}.{chapter}"
    if v_start:
        path += f".{v_start}" + (f"-{v_end}" if v_end else "")
    return f"{BASE}/{version}/{path}.NIV"


def passage_buttons(segments):
    """Plan segments -> [{'label': 'Read 2 Samuel 5 in the NIV', 'url': ...}, ...]"""
    return [
        {"label": f"Read {seg['ref']} in the NIV", "url": seg["link"]}
        for seg in segments
    ]


def cross_reference_links(refs):
    """['Romans 5:12-19', ...] -> [{'label': 'Romans 5:12-19', 'url': ...}, ...].

    A reference whose book can't be parsed still renders, just without a link.
    """
    out = []
    for r in refs or []:
        out.append({"label": r, "url": ref_to_url(r)})
    return out


if __name__ == "__main__":
    tests = [
        "Genesis 1:26-27", "Genesis 3:15", "John 1:1-3", "Romans 5:12-19",
        "Revelation 22:1-3", "Psalm 48", "2 Samuel 7:12-16", "Matthew 1:1",
        "Luke 1:32–33", "1 John 4:7-12", "Ruth",
    ]
    for t in tests:
        print(f"{t:24} -> {ref_to_url(t)}")
