# Contributing

Thanks for stopping by. Here's how I prefer contributions to be structured.

## Quick start

```bash
git clone https://github.com/404Piyush/google-maps-review-analyzer.git
cd google-maps-review-analyzer
npm install --include=optional
cp .env.example .env
git checkout -b feat/your-feature
npm run lint
npm test
git commit -s -m "feat: ..."
git push origin feat/your-feature
```

## Ground rules

1. **Scope:** PRs should be small and focused. One feature/fix per PR.
2. **No proprietary scraping targets:** Don't commit Google Maps URLs you don't own rights to, even in tests.
3. **Proxies stay local:** Never commit `proxies.txt` or any file containing credentials.
4. **Performance claims must include benchmarks:** If you say it's faster, show before/after timing in the PR description.
5. **CHANGELOG:** Update the Unreleased section under your change.
6. **DCO:** Sign off your commits with `git commit -s`.

## Coding style

- CommonJS (no ESM in the runtime files)
- 2-space indent, single quotes, semicolons preserved (matches existing code)
- Prefer small, named functions over classes
- Helpers go in `lib/` and should be unit-testable in isolation

## Reporting bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml) template. Include the Maps URL (or a similar public one), Node version, OS, and full terminal output.

## Adding a new LLM provider

The provider contract is two functions in `topic-analysis.js`:

- `callLLM(prompt, { model, jsonFormat })` returns the model's raw text
- Output is parsed as JSON when `jsonFormat: true`, plain markdown otherwise

See how `--provider=openrouter` is plumbed. Add your provider to the same dispatch.

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
