# Running on Lightning AI (free GPU credits)

[Lightning AI Studios](https://lightning.ai/) gives you free GPU hours each month on L4/A10/A100 GPUs. This is the fastest way to run this repo end-to-end on a real GPU without paying anything.

## One-time setup (5 minutes)

1. Sign up at https://lightning.ai/ (use GitHub OAuth)
2. Click **New Studio** → pick **L4** or **A10G** (free tier eligible)
3. In the studio terminal:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
sudo apt-get install -y nodejs
curl -fsSL https://ollama.com/install.sh | sh
ollama serve &
ollama pull gemma2:2b

git clone https://github.com/404Piyush/google-maps-review-analyzer.git
cd google-maps-review-analyzer
npm install --omit=optional
```

## Running

```bash
# Option A — bring your own reviews.json
node topic-analysis.js --model=fast --batch-size=10

# Option B — bring your own Google Places API key (free tier)
GOOGLE_PLACES_API_KEY=AIza... node places-api.js --text-search="Central Park, NYC" --analyze
```

## Speed expectations on free GPU

| Model tier | 100 reviews | 200 reviews | 500 reviews |
|---|---|---|---|
| fast (gemma2:2b) | ~10s | ~20s | ~50s |
| balanced | ~25s | ~45s | ~2min |
| deep | ~40s | ~80s | ~3min |

CPU on the same host is ~5–8x slower.

## Persistent demo (advanced)

To host the demo page persistently on Lightning:

1. Create a new **App** in your Studio
2. Add `web: node demo/serve.js` to your startup script
3. Connect a custom domain via CNAME (exposes a `*.lightning.ai` URL by default)

Cost: ~$0 within the monthly free GPU-hour budget.
