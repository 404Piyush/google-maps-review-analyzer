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
[![Lightning AI](https://img.shields.io/badge/⚡_Lightning_AI-792EE5?style=for-the-badge)](https://github.com/404Piyush/google-maps-review-analyzer/blob/main/notebooks/lightning-ai.md)

</div>

> **☁️ What's new in v1.7.0:** Oracle Cloud Always Free deploy. `oracle/bootstrap.sh` provisions a 2-OCPU + 12 GB ARM Ampere VM, builds the Docker image, and starts the scraper — all in ~5 min, $0/mo forever, no cold starts. Card is required at signup but never charged. Full guide in [`oracle/README.md`](oracle/README.md).
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
- 📊 **Keyword sentiment (offline)** — `analyze.js` ships as a zero-dependency fallback that does basic positive/negative scoring without Ollama.
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
    │   analyze.js         offline keyword baseline (no LLM)            │
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
| **Puppeteer Chromium** | Pulled automatically via `npm install` (~170 MB) |
| **Ollama** *(optional, recommended)* | Local LLM for the report stage — get it at <https://ollama.com> |
| **Proxies** *(required for real use)* | Residential or mobile proxies; the scraper cannot bypass Google's defenses from a datacenter IP |

### Install

```bash
git clone https://github.com/404Piyush/google-maps-review-analyzer.git
cd google-maps-review-analyzer
npm install
```

### Configure

Create `proxies.txt` in the project root (one per line):

```
http://user:pass@residential.proxy-a.com:8080
http://user:pass@residential.proxy-b.com:8080
http://user:pass@mobile.proxy-c.com:3128
```

> ⚠️ `proxies.txt` is gitignored. Datacenter proxies will hit CAPTCHAs almost immediately — use residential or mobile.

### Run the full pipeline

```bash
# Option A: stealth scraper (needs proxies.txt)
node index.js --parallel-proxies=2

# Option B: Google Places API (needs GOOGLE_PLACES_API_KEY in .env)
node places-api.js --text-search="Joe's Pizza Manhattan" --analyze

# Single combined command (v1.2.0+)
node index.js --analyze            # scrapes then runs analysis
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

# Offline keyword-only fallback
node analyze.js
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
├── index.js                  # Stage 1 — stealth scraper (also exports scrape() fn)
├── scraper-server.js         # Stage 1 service — Express wrapper around index.js for cloud deploys
├── analyze.js                # Stage 2 alt — offline keyword sentiment
├── topic-analysis.js         # Stage 2/3 — Ollama two-pass report
├── places-api.js             # Stage 1 alt — Google Places API (no Puppeteer)
├── api/                      # Vercel serverless endpoints
│   ├── scrape.js             # /api/scrape (cache → optional proxy to scraper-server)
│   └── analyze.js            # /api/analyze (OpenRouter streaming)
├── dev-server.js             # Local web demo server
├── Dockerfile                # Container image for scraper-server (Chromium + Node)
├── render.yaml               # One-click deploy to Render.com free tier
├── proxies.txt               # (you create this — gitignored)
├── package.json
├── .gitignore
├── reviews.json              # generated
├── reviews.html              # generated
├── intermediate-analysis.json# generated
└── analysis-report.md        # generated — the deliverable
```

---

## ☁️ Deploying the scraper as a service

The Puppeteer scraper needs Chromium, so it can't run on Vercel's serverless tier. Pick one:

### Oracle Cloud Always Free (recommended) — **$0/mo, no cold starts**

2 OCPUs + 12 GB RAM ARM Ampere VM, free forever. The script in `oracle/bootstrap.sh` does everything in one shot.

Full guide: **[`oracle/README.md`](oracle/README.md)** — covers signup (card is required for identity verification but never charged), home region choice, VCN setup, Ampere A1.Flex shape, and how to wire the resulting URL into Vercel.

TL;DR:

```text
1. Sign up at https://cloud.oracle.com/free (home region matters; cannot change later)
2. Create a VCN (or use the default one created during signup)
3. Compute → Create Instance:
     Image: Canonical Ubuntu 22.04 (aarch64)
     Shape: VM.Standard.A1.Flex → 2 OCPU, 12 GB RAM
     Assign public IPv4
     Cloud-init script: paste contents of oracle/bootstrap.sh
4. Wait ~5 min. Script prints SCRAPER_URL + SCRAPER_API_KEY to console output.
5. vercel env add SCRAPER_URL production        → http://<oracle-public-ip>
   vercel env add SCRAPER_API_KEY production    → (key from step 4)
   vercel deploy --yes --prod
```

### Render.com / Fly.io / any Docker host — alternatives

The repo also ships:

- **`Dockerfile`** — ARM64/AMD64 with system Chromium + all puppeteer-extra runtime deps
- **`render.yaml`** — one-click Render Blueprint (works on free tier; subject to 15min idle spin-down)
- **`scraper-server.js`** — Express service exposing `/health` and `/scrape`

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
- The bundled `reCAPTCHA v2 Bypass with Capsolver_.txt` is a **third-party service reference** retained from the original implementation. Running automated CAPTCHA bypass against Google Maps is almost certainly a ToS violation; remove it if you intend to run the tool in production.

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
