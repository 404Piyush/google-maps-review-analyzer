#!/usr/bin/env node
// ============================================
// bin/cli.js — `reatlas` CLI wrapper
//   scrape <url>   Pull reviews from a Google Maps URL
//   analyze <file> Run LLM analysis on a scraped JSON file
//   run <url>      scrape + analyze in one shot
//   globe          Launch the 3D globe demo locally
//   doctor         Check your environment
//   init           Create .env from .env.example
//   help / --help  Show usage
//   version        Print version
// ============================================
'use strict';

const ui = require('../lib/ui.js');
const { log, info, success, warn, fail, error, section, rule, banner, Spinner, Progress, brand, apply, styles, icons } = ui;

// ============================================
// Top-level dispatch
// ============================================
const argv = process.argv.slice(2);

if (argv.length === 0 || argv.includes('--help') || argv.includes('-h') || argv[0] === 'help') {
    banner();
    log(`
${apply('Usage', styles.bold)}: reatlas ${apply('<command>', styles.cyan)} ${apply('[options]', styles.dim)}

${apply('Commands', styles.bold)}:
  ${apply('scrape', styles.cyan)} ${apply('<url>', styles.dim)}     Scrape reviews, save to ${apply('output/reviews.json', styles.dim)}
  ${apply('analyze', styles.cyan)} ${apply('<file>', styles.dim)}   LLM-analyze an existing reviews.json
  ${apply('run', styles.cyan)} ${apply('<url>', styles.dim)}        One-shot: scrape + analyze + report
  ${apply('globe', styles.cyan)}              Launch the 3D globe demo at ${apply('http://localhost:3777', styles.dim)}
  ${apply('doctor', styles.cyan)}             Check Node version, deps, env vars, browser path
  ${apply('init', styles.cyan)}               Create ${apply('.env', styles.dim)} from template (prompts)
  ${apply('version', styles.cyan)}            Print version
  ${apply('help', styles.cyan)}                This page

${apply('Global flags', styles.bold)}:
  ${apply('--quiet', styles.dim)}     Suppress progress UI (only errors + result)
  ${apply('--json', styles.dim)}      Output the result as JSON on stdout (for piping)
  ${apply('--no-color', styles.dim)}  Disable ANSI colors

${apply('Examples', styles.bold)}:
  ${apply('$', styles.dim)} reatlas scrape https://maps.app.goo.gl/xyz
  ${apply('$', styles.dim)} reatlas run https://maps.app.goo.gl/xyz --model=balanced
  ${apply('$', styles.dim)} reatlas globe
  ${apply('$', styles.dim)} reatlas doctor
`);
    process.exit(0);
}

if (argv.includes('--version') || argv[0] === 'version') {
    log(require('../package.json').version);
    process.exit(0);
}

// Parse global flags
const flags = new Set(argv.filter(a => a.startsWith('--')));
const quiet = flags.has('--quiet') || flags.has('-q');
const jsonOnly = flags.has('--json');
if (flags.has('--no-color')) process.env.NO_COLOR = '1';
const positional = argv.filter(a => !a.startsWith('--') && !a.startsWith('-'));

const cmd = positional[0];
const rest = positional.slice(1);

const commands = {
    scrape: require('./commands/scrape'),
    analyze: require('./commands/analyze'),
    run: require('./commands/run'),
    globe: require('./commands/globe'),
    doctor: require('./commands/doctor'),
    init: require('./commands/init'),
};

if (!cmd) {
    error(`Unknown command: nothing given`, `Try 'reatlas --help'.`);
    process.exit(1);
}
if (!commands[cmd]) {
    error(`Unknown command: '${cmd}'`, `Try 'reatlas --help' for a list of commands.`);
    process.exit(1);
}

// Run the command
commands[cmd](rest, { flags, quiet, jsonOnly })
    .then((result) => {
        if (jsonOnly && result !== undefined) {
            log(JSON.stringify(result, null, 2));
        } else if (!quiet && result && result.summary) {
            // Print summary block at end of run
            section('Summary');
            for (const [k, v] of Object.entries(result.summary)) {
                log(`  ${apply(k.padEnd(14, ' '), styles.dim)}${apply(String(v), styles.bold)}`);
            }
            rule();
            success('Done.');
        }
    })
    .catch((err) => {
        if (jsonOnly) {
            log(JSON.stringify({ ok: false, error: err.message }, null, 2));
        } else {
            error(err.message || String(err), err.hint);
            if (err.stack && process.env.DEBUG) console.error(err.stack);
        }
        process.exit(err.exitCode || 1);
    });