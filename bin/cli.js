#!/usr/bin/env node
require('dotenv').config();

const commands = {
    scrape: () => require('../index.js'),
    'scrape:api': () => require('../places-api.js'),
    analyze: () => require('../topic-analysis.js'),
    demo: () => require('../demo/serve.js'),
    version: () => console.log(require('../package.json').version),
};

const cmd = process.argv[2];
if (!cmd || cmd === '--help' || cmd === '-h') {
    const v = require('../package.json').version;
    console.log(`gmaps-analyzer v${v}

Usage: gmaps-analyzer <command>

Commands:
  scrape        Run the Puppeteer scraper (requires puppeteer + proxies)
  scrape:api    Pull reviews via Google Places API (no proxies, no CAPTCHA)
  analyze       Run LLM analysis (Ollama by default, OpenRouter if configured)
  demo          Start the local showcase server on http://localhost:3000
  version       Print version
`);
    process.exit(0);
}
if (!commands[cmd]) {
    console.error(`Unknown command: ${cmd}. Run 'gmaps-analyzer --help' for usage.`);
    process.exit(1);
}
commands[cmd]();
