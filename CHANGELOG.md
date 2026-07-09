# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive README rewrite with badges, architecture diagram, sample output, and ethics section
- `package.json` keywords, author, repository, and `engines` metadata
- `npm run analyze:llm` and `npm run analyze:basic` script aliases

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
