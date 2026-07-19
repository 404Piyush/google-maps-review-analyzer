# Dockerfile.gosom — bundles the official gosom/google-maps-scraper image
# with our Node.js auth + NDJSON proxy wrapper.
#
# gosom does the actual scraping; gosom-proxy.js adds SCRAPER_API_KEY auth
# and streams results in our existing NDJSON format that Vercel /api/scrape
# already understands.

FROM gosom/google-maps-scraper:latest AS gosom
# Inherit gosom's Playwright browser + binary from the official image.

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

# Pull the binary + Playwright browser cache from the official gosom image
COPY --from=gosom /usr/bin/google-maps-scraper /usr/local/bin/google-maps-scraper
COPY --from=gosom /opt/browsers /opt/browsers
COPY --from=gosom /opt/ms-playwright-go /opt/ms-playwright-go
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/browsers

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY gosom-proxy.js ./

ENV PORT=8080
ENV GOSOM_INTERNAL_PORT=8888
ENV GOSOM_API=http://127.0.0.1:8888
ENV SCRAPER_API_KEY=

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:8080/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

RUN mkdir -p /data
WORKDIR /data
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "google-maps-scraper -web -addr :${GOSOM_INTERNAL_PORT} -data-folder /data & node /app/gosom-proxy.js"]