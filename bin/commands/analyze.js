// ============================================
// analyze.js — `reatlas analyze <file>`
// Run LLM analysis on a reviews.json file
// ============================================
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ override: true });

const ui = require('../../lib/ui.js');
const { log, apply, styles, icons, info, success, section, rule, Spinner, Progress } = ui;

function parseFlags(args) {
    const out = { file: null, model: 'balanced', provider: null, output: null };
    for (const a of args) {
        if (a.startsWith('--model=')) out.model = a.split('=')[1];
        else if (a === '--model=fast' || a === '--model=balanced' || a === '--model=deep') out.model = a.split('=')[1];
        else if (a === '--provider=ollama') out.provider = 'ollama';
        else if (a === '--provider=openrouter') out.provider = 'openrouter';
        else if (a.startsWith('--output=')) out.output = a.split('=')[1];
        else if (!a.startsWith('--')) out.file = a;
    }
    return out;
}

module.exports = async function analyze(args, ctx) {
    const { file, model, provider, output } = parseFlags(args);

    if (!file) {
        const err = new Error('Missing reviews.json file');
        err.hint = `Try: reatlas analyze output/reviews.json`;
        err.exitCode = 1;
        throw err;
    }
    if (!fs.existsSync(file)) {
        const err = new Error(`File not found: ${file}`);
        err.hint = `Run 'reatlas scrape <url>' first.`;
        err.exitCode = 1;
        throw err;
    }

    // Validate JSON
    let reviews = [];
    try {
        reviews = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Array.isArray(reviews)) throw new Error('expected JSON array');
    } catch (e) {
        const err = new Error(`Invalid reviews.json: ${e.message}`);
        err.exitCode = 1;
        throw err;
    }

    if (!ctx.quiet) {
        section('reatlas analyze');
        log(`  ${apply('Source', styles.dim).padEnd(14, ' ')}${apply(file, styles.cyan)}`);
        log(`  ${apply('Reviews', styles.dim).padEnd(14, ' ')}${apply(reviews.length, styles.bold)}`);
        log(`  ${apply('Tier', styles.dim).padEnd(14, ' ')}${apply(model, styles.cyan)}${provider ? `  ${apply(`(${provider})`, styles.dim)}` : ''}`);
        rule();
    }

    // Check provider
    const effectiveProvider = provider || process.env.LLM_PROVIDER || 'ollama';
    if (effectiveProvider === 'openrouter' && !process.env.OPENROUTER_API_KEY) {
        const err = new Error('OPENROUTER_API_KEY is not set');
        err.hint = `Run: reatlas init  (or set OPENROUTER_API_KEY in .env)`;
        err.exitCode = 1;
        throw err;
    }

    // Run
    const analyzerArgs = ['topic-analysis.js', `--input=${file}`, `--model=${model}`];
    if (output) analyzerArgs.push(`--output=${output}`);
    if (provider) analyzerArgs.push(`--provider=${provider}`);

    const spin = new Spinner(`Analyzing ${reviews.length} reviews with ${effectiveProvider} (${model})…`).start();

    return new Promise((resolve, reject) => {
        const proc = spawn(process.execPath, analyzerArgs, {
            stdio: ctx.quiet ? 'pipe' : ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, FORCE_COLOR: '1' },
        });
        let out = '', errOut = '';
        if (proc.stdout) proc.stdout.on('data', (d) => {
            out += d.toString();
            const cleaned = out.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
            const lastLine = cleaned.split('\n').filter(Boolean).pop();
            if (lastLine) spin.update(lastLine.slice(0, 60));
        });
        if (proc.stderr) proc.stderr.on('data', (d) => { errOut += d.toString(); });

        proc.on('exit', (code) => {
            if (code !== 0) {
                spin.stop(false, 'Analysis failed');
                const err = new Error(`Analyzer exited with code ${code}`);
                err.hint = (errOut || out).trim().split('\n').slice(-5).join('\n');
                err.exitCode = code || 1;
                return reject(err);
            }
            spin.stop(true, 'Analysis complete');

            // Locate output report
            const reportPath = output || path.join(process.cwd(), 'output', 'analysis-report.md');
            let reportLines = 0;
            if (fs.existsSync(reportPath)) {
                reportLines = fs.readFileSync(reportPath, 'utf8').split('\n').length;
            }
            if (!ctx.quiet) {
                section('Result');
                log(`  ${apply('Reviews used', styles.dim).padEnd(14, ' ')}${apply(reviews.length, styles.bold)}`);
                log(`  ${apply('Report', styles.dim).padEnd(14, ' ')}${apply(reportPath, styles.cyan)}`);
                log(`  ${apply('Lines', styles.dim).padEnd(14, ' ')}${apply(reportLines, styles.bold)}`);
                rule();
            }
            resolve({
                ok: true,
                source: file,
                count: reviews.length,
                report: reportPath,
                summary: {
                    reviews: reviews.length,
                    report: reportPath,
                    lines: reportLines,
                },
            });
        });
        proc.on('error', reject);
    });
};