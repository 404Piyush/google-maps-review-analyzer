// ============================================
// lib/ui.js — Terminal UI helpers (ANSI, spinners, progress, errors)
// ============================================
'use strict';

const c = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`;

const styles = {
    bold:   c(1),
    dim:    c(2),
    green:  c(32),
    yellow: c(33),
    blue:   c(34),
    cyan:   c(36),
    red:    c(31),
    gray:   c(90),
    acid:   c('38;5;190'),  // matches the demo's acid green
    ink:    c('38;5;235'),
    cream:  c('38;5;230'),
};

const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;

function apply(s, color) { return supportsColor ? color(s) : s; }

const icons = {
    ok:    apply('✓', styles.green),
    fail:  apply('✗', styles.red),
    arrow: apply('→', styles.cyan),
    dot:   apply('●', styles.acid),
    warn:  apply('!', styles.yellow),
};

const brand = apply('reatlas', styles.bold + styles.acid);

function log(msg = '') { console.log(msg); }
function info(msg) { log(`${apply('i', styles.cyan)}  ${msg}`); }
function success(msg) { log(`${icons.ok}  ${apply(msg, styles.green)}`); }
function warn(msg) { log(`${icons.warn}  ${apply(msg, styles.yellow)}`); }
function fail(msg) { log(`${icons.fail}  ${apply(msg, styles.red)}`); }

// Section heading like ┌─ Section ──────┐
function section(title) {
    const bar = '─'.repeat(Math.max(0, 60 - title.length - 4));
    log(`\n${apply('┌─ ', styles.gray)}${apply(title, styles.bold)} ${apply(bar, styles.gray)}┐`);
}

function rule() {
    log(apply('─'.repeat(64), styles.gray));
}

// ============================================
// Spinner — single-line rotating indicator
// ============================================
class Spinner {
    constructor(text) {
        this.text = text || '';
        this.frames = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
        this.i = 0;
        this.timer = null;
        this.stream = process.stderr;
    }
    start() {
        if (!this.stream.isTTY) {
            log(`  ${apply(this.text, styles.dim)}…`);
            return this;
        }
        this.stream.write(`\r${styles.cyan(this.frames[0])}  ${this.text}`);
        this.timer = setInterval(() => {
            this.i = (this.i + 1) % this.frames.length;
            this.stream.write(`\r${styles.cyan(this.frames[this.i])}  ${this.text}`);
        }, 80);
        return this;
    }
    update(text) {
        this.text = text;
        if (!this.stream.isTTY) return;
        this.stream.write(`\r${styles.cyan(this.frames[this.i])}  ${this.text}`);
    }
    stop(ok = true, msg) {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        const final = msg || this.text;
        if (this.stream.isTTY) {
            this.stream.write(`\r${ok ? icons.ok : icons.fail}  ${apply(final, ok ? styles.green : styles.red)}\n`);
        } else {
            log(`  ${final}`);
        }
    }
}

// ============================================
// Progress bar — current/total with ETA
// ============================================
class Progress {
    constructor(total, label = '') {
        this.total = total;
        this.current = 0;
        this.label = label;
        this.startTime = Date.now();
        this.stream = process.stderr;
        this.stream.write('\n');
    }
    tick(n = 1, extra = '') {
        this.current = Math.min(this.current + n, this.total);
        this.render(extra);
    }
    set(current, extra = '') {
        this.current = Math.min(current, this.total);
        this.render(extra);
    }
    render(extra) {
        const pct = this.total ? this.current / this.total : 0;
        const elapsed = (Date.now() - this.startTime) / 1000;
        const eta = pct > 0 ? (elapsed / pct) - elapsed : 0;
        const width = 24;
        const filled = Math.round(pct * width);
        const bar = apply('█'.repeat(filled), styles.acid) + apply('░'.repeat(width - filled), styles.gray);
        const line = `\r  ${bar}  ${apply(String(this.current).padStart(3, ' '), styles.bold)}/${this.total}  ${apply(extra, styles.dim)}`;
        const etaStr = pct >= 1 ? 'done' : `~${Math.ceil(eta)}s`;
        this.stream.write(line + `  ${apply(etaStr, styles.dim)}`);
        if (pct >= 1) this.stream.write('\n');
    }
    done(extra = '') {
        this.set(this.total, extra);
    }
}

// ============================================
// Errors with hint
// ============================================
function error(label, hint) {
    fail(label);
    if (hint) log(`   ${apply(hint, styles.dim)}`);
}

// ============================================
// Box-drawing header
// ============================================
function banner() {
    const version = require('../package.json').version;
    const lines = [
        apply(`  ${brand} ${apply(`v${version}`, styles.dim)}`, styles.bold),
        apply(`  Scrape Google Maps reviews. Analyze with AI. Ship a report.`, styles.dim),
    ];
    log(lines.join('\n'));
    rule();
}

module.exports = {
    styles, icons, brand, supportsColor, apply,
    log, info, success, warn, fail, error,
    section, rule, banner,
    Spinner, Progress,
};