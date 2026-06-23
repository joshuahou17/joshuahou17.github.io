#!/usr/bin/env python3
"""One-off: recover the 3 chapters the original PDF parser dropped.

Ezekiel 45, 1 Chronicles 27, and Revelation 14 were lost because each
chapter's verse 1 contains a large number (25,000 / 24,000 / 144,000) that
broke parse_bible_pdf's chapter-boundary heuristic. This re-extracts those
chapters straight from the source PDF and splices them into bible/niv.json.

Run once locally:  python scripts/patch_niv_missing.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import parse_bible_pdf as P

NIV_PATH = Path(__file__).parent.parent / "bible" / "niv.json"

# (pdf_book_name, normalized_name, chapter, expected_verse_count)
TARGETS = [
    ("Ezekiel", "Ezekiel", 45, 25),
    ("1st Chronicles", "1 Chronicles", 27, 34),
    ("Revelation", "Revelation", 14, 20),
]


def chapter_breaks(text, expected_chapters):
    """Re-run parse_bible_pdf's break detection to locate neighbouring chapters."""
    matches = list(P.MARKER.finditer(text))
    breaks = {1: 0}
    for ch in range(2, expected_chapters + 1):
        for idx in range(breaks.get(ch - 1, 0) + 1, len(matches)):
            if int(matches[idx].group(1)) != ch:
                continue
            for j in range(idx + 1, min(idx + 8, len(matches))):
                nxt = P.get_text_between(text, matches, j)
                if len(nxt) >= 3:
                    if int(matches[j].group(1)) == 2:
                        breaks[ch] = idx
                    break
            if ch in breaks:
                break
    return matches, breaks


def find_start(text, matches, breaks, ch):
    """The dropped chapter's start = a marker valued `ch` that is shortly followed by a real
    verse-2 marker (the chapter-restart signature). This disambiguates from a verse `ch`
    that merely occurs inside the previous or the same chapter (e.g. 1 Chron 27:27)."""
    lo = breaks.get(ch - 1, 0)
    hi = breaks.get(ch + 1, len(matches))
    starts = []
    for i in range(lo + 1, hi):
        if int(matches[i].group(1)) != ch:
            continue
        # A real chapter start restarts verse numbering: scanning forward (past
        # embedded measurement numbers), verse 2 appears before verse ch+1.
        for j in range(i + 1, min(i + 14, len(matches))):
            if len(P.get_text_between(text, matches, j)) < 3:
                continue
            val = int(matches[j].group(1))
            if val == 2:
                starts.append(i)
                break
            if val == ch + 1:
                break  # this is verse `ch` inside a chapter, not a chapter start
    if len(starts) != 1:
        raise RuntimeError(f"chapter {ch}: expected 1 start marker, found {len(starts)}")
    return starts[0], hi  # start marker idx, end marker idx (next chapter's start)


def extract_verses(text, matches, start_idx, end_idx, n_verses):
    """Slice raw text between sequential real verse markers (preserves embedded numbers)."""
    # Locate real verse boundary markers 2..n by sequential value match.
    real = {1: start_idx}
    expected = 2
    idx = start_idx + 1
    while idx < end_idx and expected <= n_verses:
        if int(matches[idx].group(1)) == expected and len(P.get_text_between(text, matches, idx)) >= 2:
            real[expected] = idx
            expected += 1
        idx += 1
    # Build each verse from the RAW char span (keeps numbers like 25,000 intact).
    verses = {}
    ordered = sorted(real)
    for n in ordered:
        m = matches[real[n]]
        text_start = m.start() + len(m.group(1))  # drop the verse/chapter number only
        nxt = real.get(n + 1)
        text_end = matches[nxt].start() if nxt else matches[end_idx].start() if end_idx < len(matches) else len(text)
        verses[str(n)] = P.clean(text[text_start:text_end])
    return verses


def main():
    reader = P.PyPDF2.PdfReader(str(P.PDF_PATH))
    book_pages = P.find_book_pages(reader)
    bible = json.loads(NIV_PATH.read_text(encoding="utf-8"))

    expected_ch = {pdf: ec for pdf, _, ec in P.PDF_BOOK_NAMES}

    for pdf_name, norm, ch, vexp in TARGETS:
        text = P.extract_book_text(reader, book_pages, pdf_name)
        matches, breaks = chapter_breaks(text, expected_ch[pdf_name])
        start_idx, end_idx = find_start(text, matches, breaks, ch)
        verses = extract_verses(text, matches, start_idx, end_idx, vexp)

        got = len(verses)
        flag = "OK" if got == vexp else f"WANT {vexp}"
        print(f"\n{norm} {ch}: extracted {got} verses ({flag})")
        print(f"  v1:  {verses.get('1','')[:90]}")
        print(f"  v{vexp}: {verses.get(str(vexp),'')[:90]}")
        if got != vexp:
            raise SystemExit(f"Verse count mismatch for {norm} {ch} — not patching.")

        bible[norm][str(ch)] = verses

    # Re-sort chapters numerically so the file stays tidy.
    for _, norm, _, _ in TARGETS:
        bible[norm] = {str(k): bible[norm][str(k)]
                       for k in sorted(int(x) for x in bible[norm])}

    NIV_PATH.write_text(json.dumps(bible, ensure_ascii=False), encoding="utf-8")
    print(f"\nPatched {NIV_PATH} ({NIV_PATH.stat().st_size/1024/1024:.1f} MB)")


if __name__ == "__main__":
    main()
