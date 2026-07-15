// ============================================
// init.js — `reatlas init`  create .env from .env.example
// ============================================
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ui = require('../../lib/ui.js');
const { apply, styles, success, info, warn, section, rule } = ui;

function prompt(rl, question, defaultValue) {
    return new Promise((resolve) => {
        const prompt = defaultValue ? `${question} ${apply(`[${defaultValue}]`, styles.dim)}: ` : `${question}: `;
        rl.question(prompt, (answer) => {
            resolve(answer.trim() || defaultValue || '');
        });
    });
}

module.exports = async function init(args, ctx) {
    section('reatlas init');
    info('Setting up your .env file. Leave a field blank to skip.\n');

    const templatePath = path.join(process.cwd(), '.env.example');
    const targetPath = path.join(process.cwd(), '.env');

    if (!fs.existsSync(templatePath)) {
        const err = new Error('.env.example not found');
        err.hint = 'Are you in the repo root?';
        err.exitCode = 1;
        throw err;
    }

    if (fs.existsSync(targetPath) && !args.includes('--force')) {
        warn('.env already exists. Use --force to overwrite.');
        process.exit(0);
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answers = {};

    answers.OPENROUTER_API_KEY   = await prompt(rl, 'OpenRouter API key (free at openrouter.ai)', '');
    answers.GOOGLE_PLACES_API_KEY = await prompt(rl, 'Google Places API key (optional, --api mode)', '');

    answers.LLM_PROVIDER = await prompt(rl, 'LLM provider (ollama | openrouter)', 'ollama');
    answers.MODEL_TIER   = await prompt(rl, 'Model tier (fast | balanced | deep)', 'fast');
    answers.PARALLEL_PROXIES = await prompt(rl, 'Parallel proxies to race', '2');

    rl.close();

    let template = fs.readFileSync(templatePath, 'utf8');
    for (const [key, val] of Object.entries(answers)) {
        if (!val) continue;
        const re = new RegExp(`^${key}=.*$`, 'm');
        template = template.replace(re, `${key}=${val}`);
    }
    // Append keys that weren't in the template
    for (const [key, val] of Object.entries(answers)) {
        if (!val) continue;
        if (!new RegExp(`^${key}=`, 'm').test(template)) {
            template += `\n${key}=${val}\n`;
        }
    }

    fs.writeFileSync(targetPath, template);
    success(`Wrote ${targetPath}`);
    info('Run `reatlas doctor` to verify your setup.');
    rule();
    process.exit(0);
};