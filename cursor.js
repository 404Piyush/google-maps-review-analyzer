// ============================================
// cursor.js — Custom cursor + magnetic buttons
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
        // Dot follows tightly
        dotX += (mouseX - dotX) * 0.6;
        dotY += (mouseY - dotY) * 0.6;
        // Ring follows with more lag
        ringX += (mouseX - ringX) * 0.18;
        ringY += (mouseY - ringY) * 0.18;

        dot.style.transform = `translate3d(${dotX}px, ${dotY}px, 0)`;
        ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0)`;

        requestAnimationFrame(loop);
    }
    loop();

    // Hover state for interactive elements
    const interactiveSelector = 'a, button, .tab, summary, input, textarea, select, [role="button"]';
    document.querySelectorAll(interactiveSelector).forEach((el) => {
        el.addEventListener('mouseenter', () => document.body.classList.add('is-hovering'));
        el.addEventListener('mouseleave', () => document.body.classList.remove('is-hovering'));
    });

    // Magnetic buttons
    document.querySelectorAll('.magnetic').forEach((btn) => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            btn.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px)`;
            document.body.classList.add('is-magnetic');
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = '';
            document.body.classList.remove('is-magnetic');
        });
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