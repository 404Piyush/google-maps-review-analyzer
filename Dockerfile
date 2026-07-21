# Dockerfile — Python scraper service using gaspa93's GoogleMapsScraper
# Runs Flask + Gunicorn on PORT. Hits Google Maps without proxies (Selenium
# browser fingerprints work for low-volume single-URL scrapes on datacenter IPs
# — Render's outbound IPs cycle frequently enough to avoid immediate blocks).

FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_PATH=/usr/bin/chromedriver \
    PORT=8080

# System packages: Chromium (Selenium-controlled browser) + chromedriver + fonts.
# Debian bookworm has chromium 120 in apt, paired with chromium-driver.
RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium chromium-driver \
        fonts-liberation libasound2 libnss3 libnspr4 libatk1.0-0 \
        libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 libxkbcommon0 \
        libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
        libpango-1.0-0 libcairo2 libatspi2.0-0 \
        ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps first (cached layer)
COPY scraper/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY scraper/ ./scraper/

# Patch googlemaps.py to use system chromedriver + real chromium binary +
# container-safe flags. /usr/bin/chromium on Debian is a shell wrapper that
# exports CHROMIUM_FLAGS and exec's /usr/lib/chromium/chromium — Selenium
# needs the real binary path because the wrapper isn't a valid executable.
RUN sed -i "s|webdriver.Chrome(service=Service()|webdriver.Chrome(service=Service(executable_path='/usr/bin/chromedriver')|" \
        scraper/googlemaps.py && \
    sed -i "s|options.add_argument(\"--headless=new\")|options.binary_location='/usr/lib/chromium/chromium'; options.add_argument(\"--headless=new\"); options.add_argument(\"--no-sandbox\"); options.add_argument(\"--disable-dev-shm-usage\"); options.add_argument(\"--disable-gpu\")|" \
        scraper/googlemaps.py

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/health || exit 1

WORKDIR /app/scraper
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "4", \
     "--timeout", "120", "--access-logfile", "-", "server:app"]