<div align="center">

# 🗺️ Google Maps Review Analyzer

**Stealth-scrape reviews from any Google Maps place, then turn them into an executive-grade sentiment report — fully local, powered by Ollama.**

</div>

<div align="center">

![Node](https://img.shields.io/badge/node-%3E%3D18-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Puppeteer](https://img.shields.io/badge/puppeteer--extra-stealth-40B5A4?style=for-the-badge&logo=puppeteer&logoColor=white)
![Ollama](https://img.shields.io/badge/ollama-local_AI-000000?style=for-the-badge&logo=ollama&logoColor=white)
![OpenRouter](https://img.shields.io/badge/openrouter-supported-7C3AED?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge)
![No telemetry](https://img.shields.io/badge/telemetry-none-9aa5ce?style=for-the-badge)

</div>

<div align="center">

[![Live Demo](https://img.shields.io/badge/🚀_Live_Demo-0a0a0a?style=for-the-badge)](https://repo-dun-six.vercel.app)
[![Colab](https://img.shields.io/badge/▶_Open_in_Colab-F9AB00?style=for-the-badge&logo=googlecolab&logoColor=white)](https://github.com/404Piyush/google-maps-review-analyzer/blob/main/notebooks/colab.ipynb)

</div>

> **☁️ What's new in v1.7.0:** Docker scraper microservice deployed on Render free tier. `Dockerfile` + `render.yaml` build the Chromium image and start the scraper behind `SCRAPER_URL` — Vercel's `/api/scrape` auto-proxies cache misses to it.
>
> 🚀 v1.6.0: Headless scraper microservice. `index.js` exports `scrape(url, opts)`, wrapped by `scraper-server.js` (Express) + Dockerfile. Wire `SCRAPER_URL` to Vercel and the hosted demo forwards cache-miss URLs to your scraper in real time.
>
> 🎨 v1.3.0: Editorial redesign of the demo page.

---

---

## ❓ What is this?

A three-stage, end-to-end pipeline that takes a Google Maps place URL and returns a **business-grade customer feedback report**.

```
Google Maps URL ──► stealth scrape ──► review JSON ──► Ollama LLM ──► analysis-report.md
                  (Puppeteer +       (reviews.json)   (gemma2 + qwen3)   (Markdown)
                   proxy rotation)
```

No cloud APIs. No data leaves your machine. The LLM runs locally via [Ollama](https://ollama.com) — your scraped reviews never touch a third party.

---

## ✨ Features

- 🕶️ **Stealth scraping** — `puppeteer-extra` + the stealth plugin avoids the most common bot-detection fingerprints.
- 🔁 **Proxy rotation** — Cycles through `proxies.txt`; on CAPTCHA it screenshots the page, moves to the next proxy, and retries.
- 📜 **Dynamic scrolling** — Auto-scrolls the reviews pane until the height stabilizes (no fragile "scroll N times" magic numbers).
- 🧠 **Two-pass LLM analysis** — Fast `gemma2:2b` extracts topics + per-review sentiment in parallel; heavier `qwen3:8b` writes the executive summary.
- 📝 **Structured Markdown report** — Executive summary, sentiment breakdown, top-10 topic table, "what's working" / "areas to improve" sections, actionable recommendations.
- 💾 **Checkpointed intermediate output** — `intermediate-analysis.json` is written after Phase 1 so you can re-run only the report step.

---

## 🏗️ Architecture

```
    ┌──────────────────────────────────────────────────────────────────┐
    │  TIER 1 — DATA ACQUISITION         (Node CLI, runs locally)       │
    │  ────────────────────────                                         │
    │   index.js          puppeteer-extra + stealth, parallel proxies, │
    │                     adaptive scroll, URL cache, streaming writes  │
    │                     →  extracted-reviews.json                     │
    │   places-api.js     official Google Places API (same schema)       │
    │                     →  extracted-reviews.json                     │
    └──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌──────────────────────────────────────────────────────────────────┐
    │  TIER 2 — ANALYSIS                   (Node CLI, runs locally)     │
    │  ────────────────                                                 │
    │   topic-analysis.js  Phase 1: gemma2:2b → per-review topics       │
    │                     Phase 2: qwen3:8b  → executive markdown       │
    │                     →  intermediate-analysis.json                 │
    │                     →  analysis-report.md                         │
    └──────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌──────────────────────────────────────────────────────────────────┐
    │  TIER 3 — DEMO FRONTEND          (browser, deployed on Vercel)    │
    │  ─────────────────────                                           │
    │   Tab 1: Showcase       pre-bundled sample-reviews.json           │
    │   Tab 2: Paste JSON     client-side AFINN + topic extraction       │
    │   Tab 3: Live           POST /api/analyze ──► OpenRouter (SSE)    │
    │                         ──► Nemotron 3 Ultra 550B (free)          │
    └──────────────────────────────────────────────────────────────────┘
```

Full module-by-module breakdown, deployment topology, and data flow → **[ARCHITECTURE.md](ARCHITECTURE.md)**

---

## ⚡ Quick start

### Prerequisites

| What | Why |
|---|---|
| **Node.js 18+** | Runs the scraper |
| **Puppeteer Chromium** | Pulled automatically via `npm install` (~170 MB, optional dep) |
| **OpenRouter API key** | For cloud LLM analysis — free models at <https://openrouter.ai> |
| **Ollama** *(optional)* | Local LLM alternative — get it at <https://ollama.com> |
| **Proxies** *(required for real scraping)* | Residential or mobile; datacenter IPs hit Google CAPTCHAs |

### Install the CLI

The `reatlas` CLI wraps `node index.js --url=…`, `topic-analysis.js`, and the demo server into one binary.

```bash
git clone https://github.com/404Piyush/google-maps-review-analyzer.git
cd google-maps-review-analyzer
npm install
```

### Configure

```bash
# 1. Create .env from the template (prompts you for the OpenRouter key)
npx reatlas init

# OR write .env yourself:
cp .env.example .env
# then edit .env and paste: OPENROUTER_API_KEY=sk-or-v1-…
```

Create `proxies.txt` in the project root, one proxy per line:

```
http://user:pass@residential.proxy-a.com:8080
http://user:pass@mobile.proxy-b.com:3128
```

> ⚠️ `proxies.txt` is gitignored. Skip this only for cached demo data — real Maps URLs need residential or mobile proxies.

### Verify the install

```bash
npx reatlas doctor          # ✓ Node, deps, .env, browser, OpenRouter key
npx reatlas version         # 1.7.0
```

### Use it

```bash
# Try it on cached demo data first (no proxy needed)
npx reatlas analyze cache/reviews/pujol.json --provider=openrouter --model=fast

# Scrape a real Maps URL (needs proxies.txt)
npx reatlas scrape "https://maps.app.goo.gl/4GYEAoyVke1oCgyv5"

# Scrape + analyze in one shot
npx reatlas run "https://maps.app.goo.gl/4GYEAoyVke1oCgyv5" --provider=openrouter --model=balanced

# Launch the 3D globe demo locally
npx reatlas globe           # → http://localhost:3777
```

### CLI reference

```text
reatlas <command> [options]

Commands:
  scrape <url>     Scrape reviews → output/reviews.json
  analyze <file>   Run LLM analysis on an existing reviews.json
                    (auto-detects {reviews:[…]} wrapper or flat array)
  run <url>        scrape + analyze in one shot
  globe            Launch the 3D globe demo at http://localhost:3777
  doctor           Check Node, deps, .env, browser, LLM keys
  init             Create .env from template
  version          Print version

Global flags:
  --provider=openrouter|ollama   (default: ollama, or OPENROUTER_API_KEY auto-selects openrouter)
  --model=fast|balanced|deep      (default: balanced)
  --quiet                         (progress UI off)
  --json                          (machine-readable output on stdout)
  --no-color
```

### Run the full pipeline (raw `node` form)

If you prefer to bypass the CLI:

```bash
# Option A: stealth scraper (needs proxies.txt)
node index.js --parallel-proxies=2

# Option B: Google Places API (needs GOOGLE_PLACES_API_KEY in .env)
node places-api.js --text-search="Joe's Pizza Manhattan" --analyze

# Option C: scrape + analyze in one shot
node index.js --analyze
```

`index.js` accepts env vars or flags. Common ones:

| Flag / env | Default | What it does |
|---|---|---|
| `--parallel-proxies=N` / `PARALLEL_PROXIES` | 2 | Proxies to try in parallel |
| `--fast` | off | Skip screenshots + minimal waits |
| `--no-cache` | off | Force re-scrape even if cached |
| `--headed` | off | Show browser (debug) |
| `--analyze` | off | Auto-run topic-analysis after scraping |
| `--no-proxy` | off | Run Puppeteer without proxy |

The scraper picks the fastest proxy, navigates to `GOOGLE_MAPS_URL`, scrolls to load all reviews, writes `output/reviews.json`, then invokes `topic-analysis.js`.

To run a different place, edit `.env` or set `GOOGLE_MAPS_URL=...` — no code change needed.

### Run just the analysis (you already have `reviews.json`)

```bash
# Local Ollama (default)
node topic-analysis.js --model=fast           # gemma2:2b only, ~75s for 200 reviews
node topic-analysis.js --model=balanced       # gemma2:2b → qwen3:8b
node topic-analysis.js --model=deep           # qwen3:8b for both phases

# OpenRouter free hosted models (no GPU needed)
OPENROUTER_API_KEY=sk-or-... node topic-analysis.js --provider=openrouter --model=fast
```

---

## 📦 Output files

| File | When | What it is |
|---|---|---|
| `reviews.json` | After scrape | Structured review array: `{ name, time, stars, text }` |
| `reviews.html` | After scrape | Raw rendered HTML of the final reviews pane (debug) |
| `intermediate-analysis.json` | After Phase 1 | Every review with topics + sentiment attached |
| `analysis-report.md` | After Phase 2 | The final executive report — open this |
| `screenshots/*.png` | Per proxy | CAPTCHA pages or successful runs (debug) |

---

## 📝 Sample report excerpt

```markdown
# Customer Feedback Analysis

## 1. Executive Summary
Across 412 reviews, sentiment skews positive (71% / 18% / 11%). The most
discussed themes are *service speed*, *staff friendliness*, and *wait time*,
with service speed generating the highest volume of both praise and complaint.

## 3. Deep Dive: Key Themes

### What's Working Well
- **Staff friendliness** — Reception staff are repeatedly called out by name...
- **Atmosphere** — "cozy", "intimate", "great for dates" dominate...

### Areas for Improvement
- **Wait time on weekends** — Average perceived wait skews long...
```

---

## 🧪 Configuration

Edit the constants near the top of `topic-analysis.js`:

| Constant | Default | Notes |
|---|---|---|
| `OLLAMA_API_URL` | `http://localhost:11434/api/generate` | Point at a remote Ollama if needed |
| `FAST_MODEL` | `gemma2:2b` | Per-review pass; small and fast |
| `POWERFUL_MODEL` | `qwen3:8b` | Final report pass; swap for `llama3:8b`, `mistral`, etc. |
| `CONCURRENCY_LIMIT` | `50` | Parallel review calls against Ollama |

Pull the models once before first run:

```bash
ollama pull gemma2:2b
ollama pull qwen3:8b
```

---

## 🛠️ Project layout

```
google-maps-review-analyzer/
├── bin/
│   ├── cli.js                # `reatlas` CLI entry point
│   └── commands/             # scrape · analyze · run · globe · doctor · init
├── index.js                  # Stage 1 — stealth scraper (also exports scrape() fn)
├── scraper-server.js         # Stage 1 service — Express wrapper around index.js
├── topic-analysis.js         # Stage 2/3 — Two-pass LLM analysis
├── places-api.js             # Stage 1 alt — Google Places API (no Puppeteer)
├── api/                      # Vercel serverless endpoints
│   ├── scrape.js             # /api/scrape (cache → optional proxy to scraper-server)
│   └── analyze.js            # /api/analyze (OpenRouter streaming)
├── dev-server.js             # Local web demo server
├── lib/                      # CLI helpers (ANSI UI, GPU detection)
├── Dockerfile                # Container image for scraper-server (Chromium + Node)
├── render.yaml               # One-click deploy to Render.com free tier
├── proxies.txt               # (you create this — gitignored)
├── package.json
├── .env.example              # Copy → .env, then add OPENROUTER_API_KEY
├── output/
│   ├── reviews.json          # generated by scrape
│   ├── intermediate-analysis.json   # generated by topic-analysis Phase 1
│   └── analysis-report.md    # generated — the deliverable
```

---

## ☁️ Deploying the scraper as a service

The Puppeteer scraper needs Chromium, so it can't run on Vercel's serverless tier.

### Render.com (recommended) — **Free tier, one-click Blueprint**

The repo ships a `render.yaml` that builds the Docker image and deploys the scraper with zero config:

1. Sign in at <https://render.com> → **New +** → **Blueprint**
2. Connect your fork of `google-maps-review-analyzer`
3. Render auto-detects `render.yaml`, click **Apply**
4. After build (~5–7 min), copy the URL from the dashboard (e.g. `https://gmaps-scraper.onrender.com`)
5. Copy the auto-generated `SCRAPER_API_KEY` from the Environment tab

Wire those into Vercel:

```bash
vercel env add SCRAPER_URL     production   # https://gmaps-scraper.onrender.com
vercel env add SCRAPER_API_KEY production   # paste the key
vercel deploy --yes --prod
```

Vercel's `/api/scrape` will now forward any cache-miss URL to your Render service.

### Any Docker host — Fly.io, Railway, your own VPS

The same `Dockerfile` + `scraper-server.js` works on any container host. The container:

- Listens on `PORT` (default `8080`)
- Exposes `GET /health` and `GET /scrape?url=…` (NDJSON stream)
- Requires `SCRAPER_API_KEY` env var to enable auth (recommended)

For any Docker host:

```bash
docker build -t gmaps-scraper .
docker run -p 8080:8080 -e SCRAPER_API_KEY=changeme gmaps-scraper
```

### Endpoints

| Method | Path                    | Notes                                                          |
| ------ | ----------------------- | -------------------------------------------------------------- |
| GET    | `/health`               | Liveness + last scrape result, JSON.                           |
| GET    | `/scrape?url=...`       | NDJSON stream: `meta` → N×`batch` → `done` \| `error`.         |
| GET    | `/scrape?url=...&key=...` | Pass `key` only if `SCRAPER_API_KEY` is set on the server.    |

### Hook the live demo to your scraper

The hosted demo at `repo-dun-six.vercel.app` reads two env vars to decide what to do on a cache miss:

| Env var           | Effect                                                          |
| ----------------- | --------------------------------------------------------------- |
| `SCRAPER_URL`     | URL of the scraper service (e.g. `http://129.146.x.x` or `https://gmaps-scraper.onrender.com`) |
| `SCRAPER_API_KEY` | Optional shared secret; must match the scraper service          |

When both are set, any URL the user pastes that isn't already cached in `cache/reviews/<slug>.json` is forwarded to the scraper service and streamed back to the browser. No frontend changes needed.

---

## 🧯 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Could not find a review element after 5 retries` | Maps page hasn't loaded reviews pane, or HTML structure changed | Confirm Maps URL is for a place with reviews; check `reviews.html` |
| Every proxy hits `sorry/index` CAPTCHA | Datacenter IPs, or sticky session | Switch to residential/mobile; avoid reusing the same proxy across runs |
| `Error connecting to Ollama` | Ollama not running, or model not pulled | `ollama serve` in another terminal; `ollama pull gemma2:2b && ollama pull qwen3:8b` |
| Empty `analysis-report.md` | `reviews.json` had no `.text` | Phase 1 only processes reviews with non-empty text — check `reviews.json` |
| Browser opens but immediately closes | Missing shared libs on Linux | `apt-get install -y ca-certificates fonts-liberation libasound2 libgbm1 libnss3` |

---

## ⚖️ Ethics & legality

This repository is a **technical demonstration** of public-page scraping and on-device language modeling. Things to be aware of before you use it:

- Google's [Terms of Service](https://policies.google.com/terms) prohibit automated access to most of Maps' content. The official [Places API](https://developers.google.com/maps/documentation/places/web-service/overview) is the supported way to get review data at scale.
- Scraping personal data (reviewer names + content) may fall under GDPR / CCPA depending on jurisdiction. Pseudonymize before publishing any analysis.
- Use residential/mobile proxies, respect `robots.txt` where applicable, don't hammer the endpoint, and store results securely.
- Don't run automated CAPTCHA bypass against Google Maps — that's a ToS violation and a fast way to get your IP permanently banned.

This repo is for **educational use**. The author is not responsible for misuse.

---

## 🤝 Contributing

Issues and PRs welcome for:

- New scraper strategies (API fallbacks, lighter Puppeteer use)
- Better default Ollama prompts
- New report sections (per-aspect ratings, time-series trends)
- Output formats (JSON, HTML dashboard, CSV)

Please open an issue before sending large PRs.

---

## 📜 License

[MIT](./LICENSE) — Piyush Utkar, 2025.

---

## 👤 Author

**Piyush Utkar** — [github.com/404Piyush](https://github.com/404Piyush) · [404piyush.me](https://404piyush.me) · [@PiyushUtkar](https://x.com/PiyushUtkar)
