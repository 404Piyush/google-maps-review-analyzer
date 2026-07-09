# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive README rewrite with badges, architecture diagram, sample output, and ethics section
- `package.json` keywords, author, repository, and `engines` metadata
- `npm run analyze:llm` and `npm run analyze:basic` script aliases

## [1.0.0] — 2025-06-29

### Added
- Initial release: `index.js` stealth scraper with proxy rotation
- `topic-analysis.js` two-pass Ollama report generator (gemma2:2b → qwen3:8b)
- `analyze.js` zero-dependency keyword-based sentiment fallback
- `proxies.txt` template + `.gitignore` for runtime outputs
