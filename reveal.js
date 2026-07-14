// ============================================
// reveal.js — IntersectionObserver + counter animation
// ============================================
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initReveal() {
    if (reduceMotion) {
        document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-revealed'));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const delay = parseInt(entry.target.dataset.revealDelay || '0', 10);
                setTimeout(() => {
                    entry.target.classList.add('is-revealed');
                }, delay);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -80px 0px' });

    document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));
}

// Animated number counter
export function animateCount(el) {
    if (reduceMotion) {
        el.textContent = formatFinal(el.dataset.count, el.dataset.suffix || '');
        return;
    }
    const target = parseFloat(el.dataset.count);
    if (isNaN(target)) return;
    const isFloat = !Number.isInteger(target);
    const suffix = el.dataset.suffix || '';
    const duration = 1200;
    const start = performance.now();
    const isDecimal = el.dataset.decimal === 'true';

    function tick(now) {
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        const current = target * eased;
        if (isFloat) {
            el.textContent = current.toFixed(1) + suffix;
        } else if (isDecimal) {
            el.textContent = current.toFixed(2) + suffix;
        } else {
            el.textContent = Math.round(current) + suffix;
        }
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = formatFinal(target, suffix);
    }
    requestAnimationFrame(tick);
}

function formatFinal(value, suffix) {
    const isFloat = !Number.isInteger(value);
    if (isFloat) return value.toFixed(1) + suffix;
    return Math.round(value) + suffix;
}

// Watch all count elements
export function initCounters() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                animateCount(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });

    document.querySelectorAll('[data-count]').forEach((el) => observer.observe(el));
}

// Watch bench bars
export function initBenchBars() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const bar = entry.target;
                const from = parseFloat(bar.dataset.barFrom || '0');
                const to = parseFloat(bar.dataset.barTo || '0');
                const max = parseFloat(bar.dataset.barMax || '100');
                const oldWidth = (from / max) * 100;
                const newWidth = (to / max) * 100;
                const oldFill = bar.querySelector('.bench-fill-old');
                const newFill = bar.querySelector('.bench-fill-new');
                setTimeout(() => {
                    if (oldFill) oldFill.style.width = oldWidth + '%';
                    if (newFill) newFill.style.width = newWidth + '%';
                }, 200);
                observer.unobserve(bar);
            }
        });
    }, { threshold: 0.4 });

    document.querySelectorAll('[data-bar-from]').forEach((el) => observer.observe(el));
}