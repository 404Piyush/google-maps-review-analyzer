"""server.py — Flask wrapper around gaspa93's GoogleMapsScraper.

Endpoints:
  GET /health   → {"ok": true, "uptime_s": ..., "in_flight": ..., "version": ...}
  GET /scrape?url=...&key=...&N=20
                → NDJSON stream: meta → batches → done | error

Same wire format as our existing scraper-server.js, so Vercel /api/scrape
needs zero changes.
"""
import json
import os
import re
import time
from datetime import datetime

import requests
from flask import Flask, Response, request, stream_with_context

from googlemaps import GoogleMapsScraper
from selenium.webdriver.common.by import By

PORT = int(os.environ.get("PORT", 8080))
SCRAPER_API_KEY = os.environ.get("SCRAPER_API_KEY", "")
VERSION = "1.9.0"
STARTED_AT = time.time()
IN_FLIGHT = 0
LAST_RESULT = None

app = Flask(__name__)


def ndjson(obj):
    return (json.dumps(obj, default=str) + "\n").encode("utf-8")


def resolve_short_url(url, hops=0):
    if hops > 5:
        return url
    if "goo.gl" not in url:
        return url
    try:
        r = requests.head(url, allow_redirects=True, timeout=6,
                          headers={"User-Agent": "Mozilla/5.0"})
        return r.url or url
    except Exception:
        return url


def place_from_url(url):
    m = re.search(r"/place/([^/@]+)", url)
    if not m:
        return ("Unknown", "place")
    name = m.group(1).replace("+", " ").replace("%20", " ").strip()
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60] or "place"
    return (name, slug)


@app.route("/health")
def health():
    return Response(
        json.dumps({
            "ok": True,
            "uptimeS": int(time.time() - STARTED_AT),
            "in_flight": IN_FLIGHT,
            "last_result": LAST_RESULT,
            "version": VERSION,
        }),
        mimetype="application/json",
    )


@app.route("/scrape")
def scrape():
    global IN_FLIGHT, LAST_RESULT

    if SCRAPER_API_KEY:
        provided = request.args.get("key", "") or request.headers.get("X-Scraper-Key", "")
        if provided != SCRAPER_API_KEY:
            return Response(json.dumps({"ok": False, "error": "unauthorized"}),
                            status=401, mimetype="application/json")

    target_url = request.args.get("url", "")
    if not target_url:
        return Response(json.dumps({"ok": False, "error": "missing url"}),
                        status=400, mimetype="application/json")
    if not (target_url.startswith("http://") or target_url.startswith("https://")):
        return Response(json.dumps({"ok": False, "error": "url must be http(s)"}),
                        status=400, mimetype="application/json")

    try:
        n = int(request.args.get("N", "30"))
    except ValueError:
        n = 30
    n = max(1, min(n, 200))

    IN_FLIGHT += 1
    LAST_RESULT = None

    def generate():
        global IN_FLIGHT, LAST_RESULT
        collected = []
        error_msg = None

        try:
            resolved = resolve_short_url(target_url)
            place, slug = place_from_url(resolved)
            yield ndjson({
                "type": "meta",
                "url": target_url,
                "resolved_url": resolved,
                "ts": datetime.utcnow().isoformat() + "Z",
            })

            with GoogleMapsScraper(debug=False) as scraper:
                # DEBUG: capture page info for troubleshooting
                try:
                    title = scraper.driver.title
                    url_now = scraper.driver.current_url
                    page_src = scraper.driver.page_source
                    src_len = len(page_src)
                    # Look for Sort button explicitly
                    sort_btns = scraper.driver.find_elements(By.XPATH, '//button[@data-value=\'Sort\']')
                    review_divs = scraper.driver.find_elements(By.XPATH, '//div[@data-review-id]')
                    tabs = scraper.driver.find_elements(By.XPATH, '//button[@role=\'tab\']')
                    consent = ('consent' in page_src.lower() or 'i agree' in page_src.lower()
                               or 'before you continue' in page_src.lower())
                    yield ndjson({
                        "type": "progress",
                        "stage": "diagnostic",
                        "title": title,
                        "url": url_now,
                        "src_len": src_len,
                        "sort_btns": len(sort_btns),
                        "review_divs": len(review_divs),
                        "tabs": [t.text for t in tabs[:6]],
                        "consent_screen": consent,
                        "page_snippet": page_src[:400].replace("\n", " "),
                    })
                except Exception as e:
                    yield ndjson({"type": "progress", "stage": "diagnostic_err",
                                  "error": str(e)})

                sort_err = scraper.sort_by(resolved, 1)  # 1 = newest
                yield ndjson({
                    "type": "progress",
                    "stage": "sort",
                    "ok": sort_err != -1,
                    "sort_err": sort_err,
                })
                if sort_err == -1:
                    error_msg = "sort_by failed (couldn't click Sort dropdown — Google may have blocked)"
                else:
                    fetched = 0
                    while fetched < n:
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
                            yield ndjson({
                                "type": "batch",
                                "count": len(batch),
                                "scraped": min(fetched + len(batch), n),
                                "total": n,
                                "reviews": batch,
                            })
                            time.sleep(0.05)
                        fetched += len(reviews)

        except Exception as e:
            error_msg = str(e)
            yield ndjson({"type": "error", "error": "exception", "message": error_msg})

        if error_msg:
            LAST_RESULT = {"ok": False, "reason": "exception", "error": error_msg}
        elif not collected:
            yield ndjson({"type": "error", "error": "no_results",
                          "message": "Scraper returned no reviews"})
            LAST_RESULT = {"ok": False, "reason": "no_results"}
        else:
            place, slug = place_from_url(target_url)
            yield ndjson({
                "type": "done",
                "source": "gaspa93",
                "scraped_at": datetime.utcnow().isoformat() + "Z",
                "total_scraped": len(collected),
                "place": {
                    "name": place,
                    "slug": slug,
                    "address": "",
                    "rating": None,
                    "review_count": len(collected),
                    "phone": "",
                    "website": "",
                    "latitude": None,
                    "longitude": None,
                    "url": target_url,
                },
            })
            LAST_RESULT = {"ok": True, "count": len(collected), "place": place}

        IN_FLIGHT -= 1

    return Response(stream_with_context(generate()),
                    mimetype="application/x-ndjson",
                    headers={"Cache-Control": "no-cache",
                             "Access-Control-Allow-Origin": "*"})


if __name__ == "__main__":
    print(f"[scraper-server] listening on :{PORT}, auth={'on' if SCRAPER_API_KEY else 'off'}")
    app.run(host="0.0.0.0", port=PORT, threaded=True, debug=False)