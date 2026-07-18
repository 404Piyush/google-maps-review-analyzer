# Deploying gmaps-scraper to Oracle Cloud Always Free

This is the **recommended path** — $0/month forever, **real CPU**, **no cold starts**, **no idle sleep** (as long as your scraper averages ≥ 20% utilization per Oracle's idle policy).

The script at `oracle/bootstrap.sh` does everything in one shot on a fresh Ubuntu 22.04 ARM64 instance.

## Specs you get

| Resource | Free quota used |
|---|---|
| Shape | `VM.Standard.A1.Flex` (Ampere Altra, ARM64) |
| vCPUs | 2 OCPUs |
| RAM | 12 GB |
| Disk | 47 GB boot volume (default) |
| Outbound transfer | 10 TB/month |
| Estimated cost | **$0.00** |

## Step-by-step

### 1. Sign up

- Go to https://cloud.oracle.com/free
- Click **Start for Free**
- Provide email, password, **home region** (pick the region closest to your users — can't change later without support ticket)
- Verify phone (SMS)
- Add a **credit card** for identity verification — Oracle does **not charge** it on Always Free resources. The card just unlocks the account.
- After signup you're in a $300 / 30-day trial; **don't spend it on anything** — just let it expire. Always Free resources continue afterwards unchanged.

### 2. Create a VCN (virtual network)

If you don't already have one in your home region:

- OCI Console → **Networking → Virtual Cloud Networks → Start VCN Wizard → Create VCN with Internet Connectivity**
- Accept defaults, click Next → Create

### 3. Launch the instance

- OCI Console → **Compute → Instances → Create Instance**
- Name: `gmaps-scraper`
- Placement: your home region
- Image: **Canonical Ubuntu 22.04 (aarch64)** — must be ARM64
- Shape: click **Edit → VM.Standard.A1.Flex**
  - OCPUs: **2**
  - Memory: **12 GB**
  - Total boot volume: **47 GB** (default)
  > If you get "Out of host capacity", retry in a different Availability Domain in your home region, or wait a few hours. Don't pick a different region — Always Free compute only works in home region.
- Networking: select your VCN + the public subnet
- **Assign a public IPv4 address** (free)
- SSH keys: paste your public key (`cat ~/.ssh/id_ed25519.pub`)
- **Show advanced options → Management → Cloud-init script**: paste the contents of `oracle/bootstrap.sh` from this repo

Click **Create**.

### 4. Wait ~5–10 minutes

The script will:
1. Install Docker (ARM64)
2. Clone this repo
3. Build the image
4. Run the container, mapping port 80 → 8080 inside the container
5. Open the firewall

When it's done, the script **prints its own SCRAPER_URL** to the console output. You can also grab it from the instance's public IP via the OCI Console.

### 5. Verify

```bash
curl http://<public-ip>/health
# { "ok": true, "uptimeS": ..., "version": "1.6.0", ... }

curl "http://<public-ip>/scrape?url=https://maps.app.goo.gl/4GYEAoyVke1oCgyv5"
# NDJSON stream: meta → batches → done
```

### 6. Wire to the live demo

Back in your Vercel dashboard:

```bash
cd ~/Desktop/gmaps-analyzer-update/repo
vercel env add SCRAPER_URL production
# paste:  http://<oracle-public-ip>

vercel env add SCRAPER_API_KEY production
# paste the SCRAPER_API_KEY printed by bootstrap.sh

vercel deploy --yes --prod
```

Now any Google Maps URL pasted at https://repo-dun-six.vercel.app that isn't already cached gets scraped live by the Oracle VM and streamed back into the popup.

## Keep it from being reclaimed

Oracle's idle policy says:

> Always Free compute instances may be reclaimed if, over a 7-day window: 95th-percentile CPU < 20%, network < 20%, memory < 20%.

A scraper that gets even ~1 request every few days easily clears this. If your demo truly goes silent for a week, Oracle may reclaim the instance — re-launch with the same script and you're back in 5 min.

## Optional: HTTPS

This default setup exposes HTTP on port 80 — fine because the URL is only used by Vercel's serverless function, never by a browser. If you want browser-accessible HTTPS:

- **Cloudflare Tunnel** (zero config, free): `cloudflared tunnel --url http://localhost:80` on the VM gives you `https://something.trycloudflare.com`
- **Caddy** on the VM with a free domain (Freenom / DuckDNS) for proper Let's Encrypt TLS

## Tear down

OCI Console → Compute → Instances → select `gmaps-scraper` → **Terminate**. Zero cost. To redeploy: same script, ~5 min.

## Why this beats Render

| | Render free | Render Starter $7/mo | Oracle Always Free |
|---|---|---|---|
| Monthly cost | $0 | $7 | **$0** |
| Cold start | 30s after 15min idle | none | none |
| Idle-suspend | yes (15min) | no | no (subject to 20% utilization) |
| vCPUs | 0.1 | 0.5 | **2** |
| RAM | 512 MB | 512 MB | **12 GB** |
| Always-on | no | yes | **yes** |
| Card needed | yes (free tier) | yes | yes (verification, not charged) |
