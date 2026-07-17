# Scraper server for render.com free tier.
# Image: Node 20 LTS + Chromium + all fonts/libs puppeteer needs.
# Uses the puppeteer bundled from optionalDependencies — puppeteer.launch({args}) picks
# the system chromium we install here, no Chrome download at build time.

FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=production

# Chromium runtime deps used by puppeteer-extra + stealth.
# See https://pptr.dev/troubleshooting#running-puppeteer-in-docker
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
        libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
        libgcc-s1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
        libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
        libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
        libxss1 libxtst6 lsb-release wget xdg-utils chromium \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Install only production deps. Treat puppeteer* as required here so npm install runs them.
COPY package.json package-lock.json* ./
ENV npm_config_production=false

# Force puppeteer to actually install even though it's in optionalDependencies by default.
RUN npm pkg delete optionalDependencies.puppeteer && \
    npm pkg delete optionalDependencies."puppeteer-extra" && \
    npm pkg delete optionalDependencies."puppeteer-extra-plugin-stealth" && \
    npm install --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 8080

# Reasonable defaults for a low-memory free tier.
ENV PORT=8080 \
    NO_PROXY=1 \
    FAST=1 \
    NAV_TIMEOUT_MS=45000 \
    SCROLL_INTERVAL_MS=2200

CMD ["node", "scraper-server.js"]
