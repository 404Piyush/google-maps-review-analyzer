// ============================================
// cursor.js — Custom cursor + magnetic buttons
// Uses event delegation so dynamically inserted elements
// (like MapLibre / Three.js popups) get the cursor treatment too.
// ============================================
const dot = document.querySelector('.cursor-dot');
const ring = document.querySelector('.cursor-ring');
const isCoarse = window.matchMedia('(pointer: coarse)').matches;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!isCoarse && !reduceMotion && dot && ring) {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let dotX = mouseX, dotY = mouseY;
    let ringX = mouseX, ringY = mouseY;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    function loop() {
        dotX += (mouseX - dotX) * 0.6;
        dotY += (mouseY - dotY) * 0.6;
        ringX += (mouseX - ringX) * 0.18;
        ringY += (mouseY - ringY) * 0.18;

        dot.style.transform = `translate3d(${dotX}px, ${dotY}px, 0)`;
        ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;

        requestAnimationFrame(loop);
    }
    loop();

    // Event delegation: any current or future interactive element
    // (a, button, tab, input, textarea, select, [role=button], .magnetic)
    // toggles body.is-hovering on mouseenter/leave.
    const INTERACTIVE = 'a, button, .tab, summary, input, textarea, select, [role="button"], .reatlas-popup-close';
    const MAGNETIC = '.magnetic';

    document.body.addEventListener('mouseover', (e) => {
        const t = e.target;
        if (t && t.matches && (t.matches(INTERACTIVE) || t.closest && t.closest(INTERACTIVE))) {
            document.body.classList.add('is-hovering');
        }
    });
    document.body.addEventListener('mouseout', (e) => {
        const t = e.target;
        // Only remove if the related target is NOT a new interactive
        const newT = e.relatedTarget;
        if (newT && newT.matches && (newT.matches(INTERACTIVE) || newT.closest && newT.closest(INTERACTIVE))) {
            return;
        }
        document.body.classList.remove('is-hovering');
    });

    // Magnetic buttons — also via delegation
    document.body.addEventListener('mousemove', (e) => {
        const t = e.target;
        if (!t || !t.closest) return;
        const btn = t.closest(MAGNETIC);
        if (btn) {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            btn.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px)`;
            document.body.classList.add('is-magnetic');
        } else if (document.body.classList.contains('is-magnetic')) {
            // Mouse left a magnetic button — find previous magnetic and reset
            const prev = document.querySelector('.magnetic[style*="translate"]');
            if (prev) {
                prev.style.transform = '';
                document.body.classList.remove('is-magnetic');
            }
        }
    });

    // Hide on tab leave
    document.addEventListener('mouseleave', () => {
        dot.style.opacity = '0';
        ring.style.opacity = '0';
    });
    document.addEventListener('mouseenter', () => {
        dot.style.opacity = '1';
        ring.style.opacity = '1';
    });
}

export {};
