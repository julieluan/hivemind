#!/usr/bin/env python3
"""Fetch real GDELT headlines for each scenario's 32-day window.

Caches per (ticker, date) into public/data/news/<ticker>_<date>.json,
matching the format the play UI already loads. Free, no API key.

Usage:  python3 scripts/fetch-news.py
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TICKER = "AAPL"
DAYS = 32
SCENARIO_STARTS = [
    "2025-02-19",
    "2022-04-04",
    "2023-01-09",
    "2024-08-05",
]
NEWS_DIR = ROOT / "public" / "data" / "news"
NEWS_DIR.mkdir(parents=True, exist_ok=True)

GDELT = "https://api.gdeltproject.org/api/v2/doc/doc"


def trading_days(prices, start, n):
    out = []
    started = False
    for p in prices:
        if not started and p["date"] >= start:
            started = True
        if started:
            out.append(p["date"])
            if len(out) >= n:
                break
    return out


def fetch_day(date_str):
    ymd = date_str.replace("-", "")
    params = {
        "query": f"{TICKER} stock sourcelang:eng",
        "format": "JSON",
        "maxrecords": "12",
        "startdatetime": ymd + "000000",
        "enddatetime": ymd + "235959",
    }
    url = f"{GDELT}?{urllib.parse.urlencode(params)}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "hivemind/0.1"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            text = resp.read().decode("utf-8")
        if not text.strip():
            return []
        data = json.loads(text)
        articles = data.get("articles", [])
    except Exception as e:
        print(f"  fetch error for {date_str}: {e}", file=sys.stderr)
        return []
    cleaned = []
    for a in articles:
        title = (a.get("title") or "").strip()
        if not title:
            continue
        cleaned.append({
            "title": title,
            "domain": (a.get("domain") or "").strip(),
            "seendate": (a.get("seendate") or "")[:8],
            "url": a.get("url", ""),
        })
    return cleaned


def main():
    with open(ROOT / "public" / "data" / f"{TICKER}.json") as f:
        prices = json.load(f)["prices"]

    total_fetched = 0
    total_cached = 0
    total_empty = 0

    for start in SCENARIO_STARTS:
        dates = trading_days(prices, start, DAYS)
        print(f"\n{start} · {len(dates)} trading days")
        for i, d in enumerate(dates, 1):
            out = NEWS_DIR / f"{TICKER}_{d}.json"
            if out.exists():
                total_cached += 1
                continue
            articles = fetch_day(d)
            with open(out, "w") as f:
                json.dump(articles, f, indent=2)
            if not articles:
                total_empty += 1
            else:
                total_fetched += 1
            print(f"  [{i}/{len(dates)}] {d} · {len(articles)} articles", flush=True)
            time.sleep(0.7)

    print(f"\nDone. Fetched: {total_fetched} · Already cached: {total_cached} · Empty: {total_empty}")


if __name__ == "__main__":
    main()
