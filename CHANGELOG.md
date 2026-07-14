# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] — 2026-07-14

### Changed
- **Editorial design overhaul** of the demo page
  - Theme: cream (#f5f1e8) + ink (#0a0a0a) + acid green (#c5f900) — replaced Tokyo Night purple/blue
  - Display font: Fraunces (variable serif, opsz + SOFT axes) replacing generic sans
  - Body: Inter, Mono: JetBrains Mono (all loaded via Google Fonts with preconnect)
- **Chart.js replaced with D3.js** for full custom data viz control
  - Animated arc donut chart (cubic ease, sequential delays)
  - Word cloud layout via d3-cloud (custom coloring by sentiment)
  - Horizontal bar chart with `scaleX` from 0
- **Three.js wireframe icosahedron** added to hero (lazy-loaded via IntersectionObserver, ~600KB deferred)
- **`api/analyze.js`** stays the same — backend untouched

### Added
- **Custom cursor** (`cursor.js`): dot + ring with `mix-blend-mode: difference`, lerps to mouse position, grows on interactive elements, hidden on touch devices
- **Magnetic buttons** (`.magnetic` class): translate toward cursor on hover, integrated with cursor visuals
- **3D tilt-on-hover** (`.tilt` class): CSS perspective + transform driven by mouse position, applied to cards, tiles, and CTA
- **Scroll progress bar** at top of viewport
- **Marquee** with pause-on-hover
- **Bento grid** layout for the "What it does" section
- **Animated tab underline** that slides between tabs
- **Animated number counters** that count up from 0 when scrolled into view
- **Bench bars** that animate from 0 to value on scroll into view
- **IntersectionObserver-driven reveal** with optional delay
- **Skeleton shimmer** during streaming LLM responses
- **Reduced-motion support** throughout (`prefers-reduced-motion` disables animations)
- **Import map** for ES modules: three, d3, d3-cloud, marked loaded from esm.sh (no build step)
- **`three`, `d3`, `d3-cloud`, `marked`** as npm dependencies

## [1.2.1] — 2026-06-10

### Added
- **Interactive demo frontend** with 3 tabs (showcase, paste-JSON, live via OpenRouter)
  - `demo/interactive.js`: client-side sentiment + topic extraction (no network)
  - `demo/live.js`: OpenRouter streaming client (real LLM analysis in the browser)
  - Tab system + forms + styling in `demo/index.html` / `demo/styles.css`

## [1.2.0] — 2026-06-10

### Added
- **Speed overhaul** (~4-6× faster end-to-end)
  - Parallel proxy race (`--parallel-proxies=N`)
  - `domcontentloaded` + selector-based waits instead of `networkidle2`
  - Configurable wait timers via `.env` (NAV_SETTLE_MS, CLICK_DELAY_MS, SCROLL_INTERVAL_MS)
  - Adaptive scroll with early termination
  - Streaming JSON writes for `output/reviews.json`
  - `--fast` flag for production/cron mode (skip screenshots)
  - URL → reviews cache with TTL (`CACHE_TTL_HOURS`)
- **LLM analysis overhaul**
  - Batched prompts (10 reviews per inference via `BATCH_SIZE`)
  - `--model=fast|balanced|deep` tier selection
  - GPU/CPU auto-detection (`lib/hardware-detect.js`) with smart concurrency
  - **OpenRouter provider** (`--provider=openrouter`) — free hosted models, no Ollama needed
  - Resume from `intermediate-analysis.json` (skip already-analyzed reviews on retry)
- **`places-api.js`** — Google Places API path (no proxies, no CAPTCHA). Outputs the same `reviews.json` schema. $200/mo free credit covers most hobbyists.
- **`bin/cli.js`** — `gmaps-analyzer` CLI with subcommands: `scrape`, `scrape:api`, `analyze`, `demo`, `version`
- **`demo/`** — Static showcase page (Vercel-compatible) with sample report + Chart.js visualizations + `vercel.json` for one-click deploy
- **Notebooks** — `notebooks/colab.ipynb` (free T4 GPU one-click run) + `notebooks/lightning-ai.md` (Lightning AI Studios free GPU guide)
- **GitHub polish** — Issue templates (bug/feature), PR template, Dependabot config, CI workflow, Release workflow, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `FUNDING.yml`
- **Tests** — `npm test` runs `node:test` unit suite for topic-analysis aggregation and hardware detection
- `dotenv` and `express` as runtime dependencies (express is for the demo server)

### Changed
- `puppeteer*` moved to `optionalDependencies` — users only running `places-api.js` no longer download Chromium
- Configurable wait timers replace hard-coded `setTimeout` calls
- `topic-analysis.js` reuses existing reviews from `intermediate-analysis.json` on retry

## [1.0.0] — 2025-06-29

### Added
- Initial release: `index.js` stealth scraper with proxy rotation
- `topic-analysis.js` two-pass Ollama report generator (gemma2:2b → qwen3:8b)
- `analyze.js` zero-dependency keyword-based sentiment fallback
- `proxies.txt` template + `.gitignore` for runtime outputs
