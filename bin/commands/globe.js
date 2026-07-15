// ============================================
// globe.js — `reatlas globe`  launch the local 3D globe demo
// ============================================
'use strict';

const ui = require('../../lib/ui.js');
const { apply, styles, success, info, section, rule, Spinner } = ui;
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async function globe(args, ctx) {
    const port = '3777';

    if (!ctx.quiet) {
        section('reatlas globe');
        log(`  Launching the 3D globe + interactive demo.`);
        log(`  Will open ${apply(`http://localhost:${port}`, styles.cyan)} when ready.\n`);
        rule();
    }

    const serverPath = path.join(process.cwd(), 'dev-server.js');
    if (!fs.existsSync(serverPath)) {
        const err = new Error(`Missing dev-server.js`);
        err.hint = `Are you in the repo root?`;
        err.exitCode = 1;
        throw err;
    }

    const spin = new Spinner(`Starting dev server on :${port}…`).start();

    const proc = spawn(process.execPath, [serverPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '1' },
    });

    let opened = false;
    proc.stdout.on('data', (d) => {
        const s = d.toString();
        if (s.includes('listening') || s.includes('localhost')) {
            spin.stop(true, `Server ready at ${apply(`http://localhost:${port}`, styles.cyan)}`);
            // Auto-open browser if possible
            const openCmd = process.platform === 'darwin' ? 'open'
                : process.platform === 'win32' ? 'start'
                : 'xdg-open';
            try { require('child_process').exec(`${openCmd} http://localhost:${port}`); opened = true; } catch {}
            info(`Press ${apply('Ctrl-C', styles.bold)} to stop.`);
        }
        if (!ctx.quiet) process.stdout.write(d);
    });
    proc.stderr.on('data', (d) => {
        const s = d.toString();
        if (s.includes('listening') || s.includes('localhost')) {
            spin.stop(true, `Server ready at ${apply(`http://localhost:${port}`, styles.cyan)}`);
            const openCmd = process.platform === 'darwin' ? 'open'
                : process.platform === 'win32' ? 'start'
                : 'xdg-open';
            try { require('child_process').exec(`${openCmd} http://localhost:${port}`); opened = true; } catch {}
            info(`Press ${apply('Ctrl-C', styles.bold)} to stop.`);
        }
        if (!ctx.quiet) process.stderr.write(d);
    });

    process.on('SIGINT', () => {
        spin.stop(false, 'Stopping');
        try { proc.kill(); } catch {}
        process.exit(0);
    });
    process.on('SIGTERM', () => { try { proc.kill(); } catch {} process.exit(0); });

    return new Promise(() => {});
};