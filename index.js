const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { devices } = require('puppeteer');

puppeteer.use(StealthPlugin());

const GOOGLE_MAPS_URL = 'https://maps.app.goo.gl/CCGmfPudoLzPoK2a7';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const PROXIES_FILE = path.join(__dirname, 'proxies.txt');

function parseProxy(proxyUrl) {
    if (!proxyUrl.startsWith('http://')) {
        return null;
    }
    try {
        const url = new URL(proxyUrl);
        return {
            server: url.host,
            username: url.username,
            password: url.password,
        };
    } catch (error) {
        console.error(`Error parsing proxy URL: ${proxyUrl}`, error);
        return null;
    }
}

function getTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

async function autoScroll(page) {
    await page.evaluate(async () => {
        const findScrollableParent = (element) => {
            let parent = element.parentElement;
            while (parent) {
                if (parent === document.body) return document.body;
                const style = window.getComputedStyle(parent);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                    return parent;
                }
                parent = parent.parentElement;
            }
            return document.body;
        };

        const getReviewElement = async () => {
            for (let i = 0; i < 5; i++) {
                const el = document.querySelector('.hjmQqc');
                if (el) return el;
                console.log(`Review element not found, retrying... (${i + 1}/5)`);
                await new Promise(r => setTimeout(r, 1000));
            }
            return null;
        };

        const reviewElement = await getReviewElement();
        let scrollableNode;

        if (!reviewElement) {
            console.log("Could not find a review element after 5 retries. Aborting scroll.");
            return;
        }

        scrollableNode = findScrollableParent(reviewElement);

        if (!scrollableNode) {
            console.log('Could not find a scrollable parent for reviews. Aborting scroll.');
            return;
        }

        console.log('Found scrollable element. Starting to scroll.');

        await new Promise((resolve) => {
            let lastHeight = -1;
            let stableChecks = 0;
            const maxStableChecks = 3; // Number of times to check for stability before stopping

            const timer = setInterval(() => {
                const isBody = scrollableNode === document.body;
                const currentHeight = isBody ? document.body.scrollHeight : scrollableNode.scrollHeight;

                if (currentHeight === lastHeight) {
                    stableChecks++;
                    console.log(`Height is stable. Check ${stableChecks}/${maxStableChecks}.`);
                    if (stableChecks >= maxStableChecks) {
                        console.log('Reached what appears to be the bottom of the page.');
                        clearInterval(timer);
                        resolve();
                    }
                } else {
                    stableChecks = 0;
                    lastHeight = currentHeight;
                    console.log(`Scrolling... new height: ${currentHeight}`);
                }

                // Keep scrolling to trigger lazy-loading
                if (isBody) {
                    window.scrollBy(0, 800);
                } else {
                    scrollableNode.scrollBy(0, 800);
                }
            }, 2500 + Math.random() * 1000); // Increased delay
        });
    });
}

(async () => {
    console.log('🎯 Starting Google Maps Automation with Proxy Rotation...');

    if (!fs.existsSync(SCREENSHOTS_DIR)) {
        fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    }

    if (!fs.existsSync(PROXIES_FILE)) {
        console.error(`❌ Proxies file not found at: ${PROXIES_FILE}`);
        return;
    }

    const proxies = fs.readFileSync(PROXIES_FILE, 'utf-8').split(/\r?\n/).filter(Boolean);
    if (proxies.length === 0) {
        console.error('❌ No proxies found in proxies.txt');
        return;
    }

    console.log(`✅ Found ${proxies.length} proxies to try.`);

    let success = false;

    for (let i = 0; i < proxies.length; i++) {
        const proxy = proxies[i];
        const proxyDetails = parseProxy(proxy);

        if (!proxyDetails) {
            console.warn(`⚠️ Skipping invalid proxy format: ${proxy}`);
            continue;
        }

        console.log(`\n🔄 Attempt ${i + 1}/${proxies.length} using proxy: ${proxyDetails.server}`);
        let browser = null;

        try {
            browser = await puppeteer.launch({
                headless: false,
                args: [
                    `--proxy-server=${proxyDetails.server}`,
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-infobars',
                    '--window-position=0,0',
                ],
            });

            const page = await browser.newPage();
            
            // Pipe browser console logs to Node's console
            page.on('console', msg => console.log(`[Browser] ${msg.text()}`));

            console.log('📱 Emulating Google Pixel 2 XL...');
            await page.emulate(devices['Pixel 2 XL']);

            if (proxyDetails.username && proxyDetails.password) {
                console.log('🔒 Authenticating proxy...');
                await page.authenticate({
                    username: proxyDetails.username,
                    password: proxyDetails.password,
                });
                console.log('✅ Proxy authenticated.');
            }

            console.log(`🌐 Navigating to: ${GOOGLE_MAPS_URL}`);
            await page.goto(GOOGLE_MAPS_URL, { waitUntil: 'networkidle2', timeout: 45000 });

            console.log('⏳ Waiting for 5 seconds for page to settle...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            const url = page.url();
            const isCaptcha = url.includes('sorry') || await page.$('iframe[src*="api2/anchor"]');

            if (isCaptcha) {
                console.log(`🚨 CAPTCHA detected on URL: ${url}. Trying next proxy.`);
                const screenshotPath = path.join(SCREENSHOTS_DIR, `captcha-detected-${proxyDetails.server.replace(/:/g, '_')}-${getTimestamp()}.png`);
                await page.screenshot({ path: screenshotPath });
                console.log(`📸 Screenshot of CAPTCHA page saved to ${screenshotPath}`);
                await browser.close();
                continue; 
            }

            console.log('✅ Success! No CAPTCHA detected.');
            console.log(`📍 Final URL reached: ${url}`);
            
            console.log('⏳ Waiting 5 seconds before attempting to click...');
            await new Promise(resolve => setTimeout(resolve, 5000));

            console.log("🖱️ Looking for button with class 'vfi8qf' to click...");
            const elements = await page.$$('.vfi8qf');
            
            if (elements.length > 1) {
                console.log(`✅ Found ${elements.length} elements. Clicking the second element, which should be the correct button.`);
                await elements[1].click();
                console.log('🎉 Button clicked! Waiting 2 seconds for page to settle...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                console.log("⚠️ Could not find more than one element with class 'vfi8qf'. Cannot click the target button.");
            }

            console.log("🖱️ Looking for intermediate button with class 'ecJbe'...");
            const intermediateButtons = await page.$$('button.ecJbe');

            if (intermediateButtons.length > 0) {
                console.log(`[DEBUG] Found ${intermediateButtons.length} elements with class 'ecJbe'. Clicking the first one.`);
                await intermediateButtons[0].click();
                console.log('🎉 Intermediate button clicked! Waiting 2 seconds...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                console.log("⚠️ Could not find any intermediate buttons with class 'ecJbe'.");
            }

            console.log("🖱️ Looking for 'More reviews' button with class 'M77dve'...");
            const moreReviewsButton = await page.$('button.M77dve');

            if (moreReviewsButton) {
                console.log("✅ Found 'More reviews' button. Clicking it.");
                await moreReviewsButton.click();
                console.log("🎉 'More reviews' button clicked!");
                
                try {
                    console.log('⏳ Waiting for review stream to load...');
                    await page.waitForSelector('.hjmQqc', { timeout: 15000 });
                    console.log('✅ Review stream loaded. Waiting 3 seconds before scrolling...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    console.log('🚀 Starting to scroll for reviews...');
                    await autoScroll(page);
                    console.log('✅ Finished scrolling.');

                    console.log("🚀 Starting review extraction...");
                    const reviews = await page.evaluate(() => {
                        const results = [];
                        const reviewElements = document.querySelectorAll('.hjmQqc');

                        for (const reviewEl of reviewElements) {
                            try {
                                const name = reviewEl.querySelector('.IaK8zc.CVo7Bb')?.textContent.trim();
                                const time = reviewEl.querySelector('.bHyEBc')?.textContent.trim();
                                const ratingAriaLabel = reviewEl.querySelector('.HeTgld')?.getAttribute('aria-label');
                                
                                const ratingMatch = ratingAriaLabel ? ratingAriaLabel.match(/\d+(\.\d+)?/) : null;
                                const stars = ratingMatch ? parseFloat(ratingMatch[0]) : 'N/A';
                                
                                const text = reviewEl.querySelector('span.d5K5Pd')?.textContent.trim() || '';

                                if (name && time) {
                                    results.push({ name, time, stars, text });
                                }
                            } catch (e) {
                                console.error('Error parsing a review element:', e);
                            }
                        }
                        return results;
                    });

                    console.log(`✅ Extracted ${reviews.length} reviews.`);

                    fs.writeFileSync('reviews.json', JSON.stringify(reviews, null, 2));
                    console.log('💾 Reviews saved to reviews.json');

                    const htmlContent = await page.content();
                    fs.writeFileSync('reviews.html', htmlContent);
                    console.log('💾 Full page HTML saved to reviews.html');

                } catch (error) {
                    console.log(`⚠️ An error occurred during review scraping: ${error.message}`);
                    const errorScreenshotPath = path.join(SCREENSHOTS_DIR, `review-scraping-error-${getTimestamp()}.png`);
                    await page.screenshot({ path: errorScreenshotPath });
                    console.log(`📸 Screenshot of the error state saved to ${errorScreenshotPath}`);
                }

            } else {
                console.log("⚠️ Could not find 'More reviews' button.");
            }

            console.log('✅ All reviews should be loaded now.');
            const screenshotPath = path.join(SCREENSHOTS_DIR, `google-maps-success-${getTimestamp()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`📸 Screenshot of final page saved to ${screenshotPath}`);
            
            success = true;
            break;
        } catch (error) {
            console.error(`❌ An error occurred with proxy ${proxyDetails.server}: ${error.message}`);
        } finally {
            if (browser) {
                await browser.close();
                console.log('✅ Browser closed.');
            }
        }
    }

    if (success) {
        console.log('\n✅ Automation finished successfully.');
        console.log('🚀 Running analysis script...');
        try {
            const { execSync } = require('child_process');
            const output = execSync('node topic-analysis.js', { encoding: 'utf-8' });
            console.log(output);
            console.log('✅ Analysis complete. Report generated at analysis-report.md');
        } catch (error) {
            console.error('❌ Failed to run analysis script:', error.stderr);
        }
    } else {
        console.log('\n❌ Automation failed after trying all proxies.');
    }
})();
