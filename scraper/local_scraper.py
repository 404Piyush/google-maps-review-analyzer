"""local_scraper.py — CLI wrapper around gaspa93's GoogleMapsScraper.

Usage:
    python3 local_scraper.py <url> [--N=30] [--sort=newest]

Outputs NDJSON (one event per line) to stdout matching our Vercel /api/scrape
schema so the frontend can consume it unchanged:

  {"type":"meta", ...}
  {"type":"batch", "reviews":[...]}
  {"type":"done", ...}
  {"type":"error", ...}

Environment:
    CHROMEDRIVER_PATH  Override chromedriver location (default: system PATH)
"""
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime

# Use Homebrew's system chromedriver (newer than apt's) when available.
_DEFAULT_CHROMEDRIVER = "/opt/homebrew/bin/chromedriver"
if os.path.exists(_DEFAULT_CHROMEDRIVER):
    os.environ["CHROMEDRIVER_PATH"] = _DEFAULT_CHROMEDRIVER

from googlemaps import GoogleMapsScraper  # noqa: E402

SORT_INDEX = {"most_relevant": 0, "newest": 1, "highest_rating": 2, "lowest_rating": 3}


def emit(obj):
    sys.stdout.write(json.dumps(obj, default=str) + "\n")
    sys.stdout.flush()


def resolve_short_url(url, hops=0):
    if hops > 3 or "goo.gl" not in url:
        return url
    try:
        import requests
        r = requests.head(url, allow_redirects=True, timeout=6,
                          headers={"User-Agent": "Mozilla/5.0"})
        return r.url or url
    except Exception:
        return url


def place_from_url(url):
    from urllib.parse import unquote
    m = re.search(r"/place/([^/@]+)", url)
    if not m:
        return ("Unknown", "place")
    raw = m.group(1)
    name = unquote(raw).replace("+", " ").strip()
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60] or "place"
    return (name, slug)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("url", help="Google Maps URL (short or full)")
    p.add_argument("--N", type=int, default=30, help="Max reviews (default 30)")
    p.add_argument("--sort", default="newest", choices=list(SORT_INDEX.keys()))
    # Headed by default — Google's bot detection still catches --headless=new,
    # but a real browser window passes. Pass --headless to override.
    p.add_argument("--headless", action="store_true",
                   help="Run Chrome headless (less reliable; Google often redirects to homepage)")
    args = p.parse_args()

    url = args.url
    if not (url.startswith("http://") or url.startswith("https://")):
        emit({"type": "error", "error": "bad_url", "message": "url must be http(s)"})
        sys.exit(1)

    resolved = resolve_short_url(url)
    place, slug = place_from_url(resolved)
    emit({"type": "meta", "url": url, "resolved_url": resolved,
          "ts": datetime.utcnow().isoformat() + "Z",
          "sort": args.sort, "max_reviews": args.N})

    collected = []
    try:
        with GoogleMapsScraper(debug=not args.headless) as scraper:
            # Diagnostic
            try:
                emit({"type": "progress", "stage": "pre_sort",
                      "url": scraper.driver.current_url,
                      "title": scraper.driver.title,
                      "sort_btns": len(scraper.driver.find_elements(
                          "xpath", '//button[@data-value=\'Sort\']')),
                      "review_divs": len(scraper.driver.find_elements(
                          "xpath", '//div[@data-review-id]')),
                      "tabs": [t.text for t in scraper.driver.find_elements(
                          "xpath", '//button[@role=\'tab\']')[:6]]})
            except Exception as e:
                emit({"type": "progress", "stage": "diag_err", "error": str(e)})

            sort_err = scraper.sort_by(resolved, SORT_INDEX[args.sort])
            if sort_err == -1:
                emit({"type": "error", "error": "sort_failed",
                      "message": "Couldn't click the Sort dropdown — Google may have blocked this IP or the URL isn't a /place/ reviews page."})
                sys.exit(1)

            fetched = 0
            while fetched < args.N:
                reviews = scraper.get_reviews(fetched)
                if not reviews:
                    break
                batch = []
                for r in reviews:
                    row = {
                        "name": r.get("username") or "Anonymous",
                        "time": r.get("relative_date") or "",
                        "stars": r.get("rating") or 0,
                        "text": r.get("caption") or "",
                    }
                    batch.append(row)
                    collected.append(row)
                if batch:
                    emit({"type": "batch",
                          "count": len(batch),
                          "scraped": min(fetched + len(batch), args.N),
                          "total": args.N,
                          "reviews": batch})
                    time.sleep(0.05)
                fetched += len(reviews)

    except KeyboardInterrupt:
        emit({"type": "error", "error": "interrupted"})
        sys.exit(1)
    except Exception as e:
        emit({"type": "error", "error": "exception", "message": str(e)})
        sys.exit(1)

    if not collected:
        emit({"type": "error", "error": "no_results",
              "message": "Scraper returned no reviews."})
        sys.exit(1)

    emit({"type": "done",
          "source": "gaspa93-local",
          "scraped_at": datetime.utcnow().isoformat() + "Z",
          "total_scraped": len(collected),
          "place": {"name": place, "slug": slug, "address": "", "rating": None,
                    "review_count": len(collected), "phone": "", "website": "",
                    "latitude": None, "longitude": None, "url": resolved}})


if __name__ == "__main__":
    main()