const { execSync } = require('child_process');
const os = require('os');

async function detectGPU() {
    const platform = os.platform();
    try {
        if (platform === 'darwin') {
            const out = execSync('system_profiler SPDisplaysDataType 2>/dev/null | grep "Metal Support" || true', { encoding: 'utf-8' });
            const hasMetal = /\bYes\b/.test(out);
            if (hasMetal) {
                const vramMatch = execSync('sysctl hw.memsize 2>/dev/null', { encoding: 'utf-8' });
                const totalGB = parseInt(vramMatch.replace(/[^0-9]/g, ''), 10) / 1024 / 1024 / 1024;
                return { gpu: 'Apple Silicon', vramGB: Math.floor(totalGB * 0.7), metal: true };
            }
        }
        if (platform === 'linux' || platform === 'darwin') {
            try {
                const out = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null', { encoding: 'utf-8' });
                const [name, memStr] = out.trim().split(',').map(s => s.trim());
                if (name) {
                    const vramMB = parseInt(memStr.replace(/[^0-9]/g, ''), 10);
                    return { gpu: name, vramGB: Math.floor(vramMB / 1024) };
                }
            } catch {}
        }
    } catch {}
    return { gpu: false, vramGB: Math.floor(os.totalmem() / 1024 / 1024 / 1024) };
}

module.exports = { detectGPU };
