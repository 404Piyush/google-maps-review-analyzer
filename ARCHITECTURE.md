# Architecture

End-to-end view of how Google Maps Review Analyzer fits together — from a public Maps URL to a streamed AI report in the browser.

---

## 🗺️ System Overview

```
                         ┌─────────────────────────────────────────────────┐
                         │                  USER                          │
                         │   Terminal (scrape / analyze)                   │
                         │   Browser (interactive demo)                    │
                         └───────────────────┬─────────────────────────────┘
                                             │
                ┌────────────────────────────┼─────────────────────────────┐
                │                            │                             │
                ▼                            ▼                             ▼
        ┌───────────────┐           ┌──────────────────┐         ┌──────────────────┐
        │  SCRAPER      │           │  FRONTEND        │         │  ANALYZER        │
        │  index.js     │           │  index.html      │         │  topic-analysis  │
        │  places-api   │           │  app.js          │         │  openrouter-     │
        │  (Node CLI)   │           │  interactive.js  │         │  analyzer.js     │
        │               │           │  live.js         │         │                 │
        └───────┬───────┘           └────────┬─────────┘         └────────┬─────────┘
                │                            │                            │
                │ writes                     │ fetches                    │ reads
                ▼                            ▼                            ▼
        ┌───────────────┐           ┌──────────────────┐         ┌──────────────────┐
        │  extracted-   │──────────▶│  sample-reviews  │         │   LLM Provider   │
        │  reviews.json │  bundled  │  .json           │         │  Ollama (local)  │
        │  (local disk) │           │  (showcase)      │         │  OpenRouter      │
        └───────────────┘           └──────────────────┘         │  (hosted)        │
                                                                 └────────┬─────────┘
                                                                          │
                                                                          ▼
                                                                 ┌──────────────────┐
                                                                 │   analysis.json  │
                                                                 │   report.md      │
                                                                 │   (local file)   │
                                                                 └──────────────────┘
```

---

## 🔧 Three Runtime Tiers

The project splits into three independent layers, each runnable on its own:

### Tier 1 — Data Acquisition (`index.js`, `places-api.js`)

**Purpose:** Pull reviews out of Google Maps and write them to disk.

- `index.js` — headless browser scraper (puppeteer-extra + stealth). Parallel proxy race, adaptive scroll, selector-based waits, URL cache, streaming JSON writes. Handles dynamic rendering and bot detection.
- `places-api.js` — official Google Places API alternative. Same `reviews.json` schema, no scraping. Free tier ($200/mo credit).
- Output: `extracted-reviews.json` (canonical schema: `{name, author, stars, text, date}`)

**Run:**
```bash
node index.js              # scrape mode
node places-api.js         # API mode
```

### Tier 2 — Analysis (`topic-analysis.js`, `lib/*`)

**Purpose:** Turn raw reviews into structured insights + an executive report.

- `topic-analysis.js` — Two-phase LLM pipeline:
  - **Phase 1:** per-review topic + sentiment extraction (batched, parallel)
  - **Phase 2:** synthesis into executive markdown report
- `lib/hardware-detect.js` — auto-detects GPU (Apple Silicon Metal, NVIDIA CUDA, or CPU fallback)
- `lib/openrouter-analyzer.js` — OpenRouter adapter for free hosted models

**Outputs:**
- `intermediate-analysis.json` — per-review structured data (resumable)
- `analysis.json` — aggregated insights
- `report.md` — executive report

**Run:**
```bash
node topic-analysis.js     # LLM-powered (Ollama / OpenRouter)
gmaps-analyzer analyze     # via CLI wrapper
```

### Tier 3 — Demo Frontend (browser)

**Purpose:** Showcase the analyzer to humans without requiring them to install Node.

- **Tab 1 — Showcase:** pre-rendered sample report + interactive sentiment charts
- **Tab 2 — Paste JSON:** drop in any `reviews.json`, run client-side analysis (AFINN lexicon + topic extraction), no network needed
- **Tab 3 — Live:** real LLM streaming via backend proxy

**Tech stack:**
- Vanilla ES modules + import map (no build step)
- Three.js (lazy-loaded wireframe hero)
- D3.js (donut, bars, word cloud)
- Chart.js fallback
- IntersectionObserver-based scroll reveals, custom cursor, magnetic buttons

---

## 🌐 Deployment (Vercel)

The demo lives at **https://repo-dun-six.vercel.app**.

```
┌────────────────────────────────────────────────────────────────┐
│                         VERCEL                                 │
│                                                                │
│   ┌──────────────────────────┐   ┌──────────────────────────┐  │
│   │  STATIC ASSETS (root)    │   │  SERVERLESS FUNCTION     │  │
│   │  index.html              │   │  api/analyze.js          │  │
│   │  app.js, live.js, ...    │   │                          │  │
│   │  styles.css              │   │  - reads OPENROUTER_API │  │
│   │  sample-reviews.json     │   │    KEY + OPENROUTER_MODEL│  │
│   │  sample-report.md        │   │    from env              │  │
│   │                          │   │  - streams SSE back      │  │
│   │  (auto-detected)         │   │  - caps at 50 reviews    │  │
│   └──────────────────────────┘   └──────────────────────────┘  │
│                                                                │
└────────────────────────────────────────────────────────────────┘
            │                                       │
            │ browser                               │ fetch (server-side)
            ▼                                       ▼
   ┌─────────────────┐                    ┌─────────────────────┐
   │   User browser  │                    │   OpenRouter        │
   │   (any device)  │                    │   api/v1/chat/...   │
   └─────────────────┘                    │   model: nemotron-  │
                                          │   ultra-3-550b:free │
                                          └─────────────────────┘
```

### Key deployment properties

- **No build step.** Vercel serves `index.html` + JS/CSS as-is; `api/analyze.js` is auto-detected as a serverless function.
- **API key never leaves the server.** The browser only sees `https://repo-dun-six.vercel.app/api/analyze`. The OpenRouter key lives only in Vercel env vars (encrypted at rest) and locally in `.env` (gitignored).
- **CORS handled.** `api/analyze.js` sets `Access-Control-Allow-Origin: *` so it can be called from anywhere if needed.
- **Streaming pass-through.** SSE tokens flow OpenRouter → Vercel → browser with no buffering (`X-Accel-Buffering: no`).
- **No `vercel.json`.** Routing is fully auto-detected. Configuration lives in `.vercelignore` (excludes `node_modules`, `.env`).

---

## 📂 File Map

```
repo/
├── index.js                    # Tier 1: puppeteer scraper
├── places-api.js               # Tier 1: Google Places API path
├── topic-analysis.js           # Tier 2: LLM pipeline (Phases 1 + 2)
├── lib/
│   ├── hardware-detect.js      # GPU/CPU auto-detection
│   └── openrouter-analyzer.js  # OpenRouter adapter
├── bin/cli.js                  # `gmaps-analyzer` CLI entrypoint
│
├── api/analyze.js              # Vercel serverless: OpenRouter proxy
│
├── index.html                  # Tier 3: app shell
├── app.js                      # Tier 3: tab + theme + scroll init
├── interactive.js              # Tier 3: client-side analysis (Tab 2)
├── live.js                     # Tier 3: SSE streaming client (Tab 3)
├── reveal.js                   # Tier 3: IntersectionObserver animations
├── hero-3d.js                  # Tier 3: Three.js wireframe (lazy)
├── viz.js                      # Tier 3: D3.js chart helpers
├── cursor.js                   # Tier 3: custom cursor + magnetic
├── styles.css                  # Tier 3: cream + ink + acid green theme
│
├── sample-reviews.json         # bundled demo data (Tab 1)
├── sample-report.md            # bundled demo report (Tab 1)
│
├── test/                       # unit tests (npm test)
├── notebooks/                  # Colab + Lightning AI guides
├── .github/                    # workflows, templates, dependabot
├── .env / .env.example         # local secrets (gitignored)
└── ARCHITECTURE.md             # ← you are here
```

---

## 🔐 Secret Surface

| Location | What | How it's protected |
|---|---|---|
| `OPENROUTER_API_KEY` (Vercel env) | Real LLM key | Encrypted at rest, only accessible to the deployed function |
| `OPENROUTER_MODEL` (Vercel env) | Model override | Same as above |
| `.env` (local) | Mirror of Vercel env | Gitignored — never committed |
| `.env.example` | Placeholder values | Committed, safe to share |
| Browser | None | Key is never sent to or stored in the browser |

---

## 🔄 Data Flow (Live Demo Path)

```
User drops reviews.json or clicks "Load Sample"
            │
            ▼
   ┌────────────────────────────────────────┐
   │  Tab 2: client-side (AFINN + topics)  │  ← no network, instant
   │  Tab 3: POST /api/analyze             │  ← streamed from server
   └────────────────┬───────────────────────┘
                    │ (Tab 3 only)
                    ▼
        Vercel: api/analyze.js
        - validates input (reviews array, max 50)
        - reads OPENROUTER_API_KEY from env
        - builds prompt
        - POSTs to OpenRouter with stream:true
                    │
                    ▼
        OpenRouter: nvidia/nemotron-3-ultra-550b-a55b:free
        - returns SSE chunks
                    │
                    ▼
        api/analyze.js pipes chunks to response (SSE)
                    │
                    ▼
        live.js appends tokens to DOM as they arrive
        + animated counters + skeleton → smooth report render
```

---

## 🚧 Boundaries & Constraints

- **Tier 1 and Tier 2 run locally** (Node CLI). The demo frontend (Tier 3) does not include the scraper — scraping is browser-fingerprint-sensitive and shouldn't run on shared infra.
- **No database.** All state is on disk (`*.json`) or in the request body. This keeps the deploy trivial and stateless.
- **No auth.** The demo is public. Rate limiting is on OpenRouter's side (free tier).
- **Browser support.** Modern evergreen browsers only. Uses native ES modules, `fetch`, `ReadableStream`, `IntersectionObserver`.
- **Performance budget.** Initial page load < 100KB JS (gzipped). Three.js (~600KB) lazy-loads only when hero is in viewport.

---

## 🛣️ Evolution

- **v1.0** — single-stage scraper + offline analyzer, no demo
- **v1.1** — OpenRouter support, hardware detection, CLI wrapper
- **v1.2** — speed overhaul (parallel proxies, batched prompts), Vercel deploy with backend proxy
- **v1.3** — editorial UI (cream + ink + acid green), Three.js hero, D3.js charts, full motion