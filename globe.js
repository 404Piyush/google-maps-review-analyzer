// ============================================
// globe.js — Interactive Three.js globe with business pins
// Click a pin → fetches REAL reviews from /api/scrape
// ============================================

const container = document.getElementById('hero3d');
if (!container) {
    console.warn('[globe] container missing');
} else {
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            observer.disconnect();
            initGlobe(container);
        }
    }, { rootMargin: '200px' });
    observer.observe(container);
}

async function initGlobe(container) {
    let THREE, feature;
    try {
        THREE = await import('three');
        ({ feature } = await import('https://esm.sh/topojson-client@3.1.0'));
    } catch (err) {
        console.error('[globe] failed to load dependencies', err);
        return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;

    const { PLACES } = await import('./globe-data.js');

    // ============================================
    // SCENE
    // ============================================
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 3.6;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const fallback = container.querySelector('.hero-3d-fallback');
    if (fallback) fallback.style.display = 'none';

    // ============================================
    // GLOBE
    // ============================================
    const GLOBE_RADIUS = 1.4;
    const globeGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
    const globeMaterial = new THREE.MeshBasicMaterial({
        color: 0x0a0a0a,
        transparent: true,
        opacity: 0.92,
    });
    const globe = new THREE.Mesh(globeGeometry, globeMaterial);
    scene.add(globe);

    const gridMaterial = new THREE.LineBasicMaterial({ color: 0xc5f900, transparent: true, opacity: 0.08 });
    for (let i = 0; i <= 12; i++) {
        const phi = (i / 12) * Math.PI;
        const radius = GLOBE_RADIUS * 1.001;
        const points = [];
        for (let j = 0; j <= 64; j++) {
            const theta = (j / 64) * Math.PI * 2;
            points.push(new THREE.Vector3(
                radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.cos(phi),
                radius * Math.sin(phi) * Math.sin(theta)
            ));
        }
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMaterial));
    }
    for (let i = 0; i < 24; i++) {
        const theta = (i / 24) * Math.PI * 2;
        const radius = GLOBE_RADIUS * 1.001;
        const points = [];
        for (let j = 0; j <= 64; j++) {
            const phi = (j / 64) * Math.PI;
            points.push(new THREE.Vector3(
                radius * Math.sin(phi) * Math.cos(theta),
                radius * Math.cos(phi),
                radius * Math.sin(phi) * Math.sin(theta)
            ));
        }
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMaterial));
    }

    const haloGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.08, 32, 32);
    const haloMat = new THREE.MeshBasicMaterial({
        color: 0xc5f900, transparent: true, opacity: 0.06, side: THREE.BackSide,
    });
    scene.add(new THREE.Mesh(haloGeo, haloMat));

    // ============================================
    // COUNTRY OUTLINES (lazy fetch)
    // ============================================
    (async () => {
        const CDNS = [
            'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
            'https://unpkg.com/world-atlas@2/countries-110m.json',
        ];
        for (const url of CDNS) {
            try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 8000);
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(tid);
                if (!res.ok) continue;
                const topo = await res.json();
                const countries = feature(topo, topo.objects.countries);
                const mat = new THREE.LineBasicMaterial({ color: 0xc5f900, transparent: true, opacity: 0.35 });
                countries.features.forEach(c => {
                    const draw = (coords) => coords.forEach(ring => {
                        const pts = [];
                        for (let i = 0; i < ring.length; i++) {
                            const [lng, lat] = ring[i];
                            const v = latLngToVector3(THREE, lat, lng, GLOBE_RADIUS * 1.002);
                            pts.push(v);
                        }
                        globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
                    });
                    const g = c.geometry;
                    if (g.type === 'Polygon') draw(g.coordinates);
                    else if (g.type === 'MultiPolygon') g.coordinates.forEach(draw);
                });
                return;
            } catch (e) { /* try next CDN */ }
        }
        console.warn('[globe] country outlines unavailable');
    })();

    // ============================================
    // PINS
    // ============================================
    const pins = [];
    PLACES.forEach((place, i) => {
        const pos = latLngToVector3(THREE, place.coords[0], place.coords[1], GLOBE_RADIUS * 1.005);
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.018, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0xc5f900 })
        );
        dot.position.copy(pos);
        dot.userData = { place, type: 'pin' };
        globe.add(dot);
        pins.push(dot);

        const halo = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xc5f900, transparent: true, opacity: 0, side: THREE.BackSide })
        );
        halo.position.copy(pos);
        halo.userData = { type: 'halo', basePhase: i * 0.7 };
        globe.add(halo);
    });

    // ============================================
    // INTERACTION
    // ============================================
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hoveredPin = null;
    let activePin = null;
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let dragDelta = { x: 0, y: 0 };
    let zoom = 3.6;

    renderer.domElement.style.cursor = 'grab';

    renderer.domElement.addEventListener('pointermove', (e) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        if (isDragging) {
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            dragStart.x = e.clientX;
            dragStart.y = e.clientY;
            dragDelta.x += dx * 0.005;
            dragDelta.y += dy * 0.005;
        }
    });
    renderer.domElement.addEventListener('pointerdown', (e) => {
        isDragging = true;
        dragStart.x = e.clientX;
        dragStart.y = e.clientY;
        renderer.domElement.style.cursor = 'grabbing';
    });
    renderer.domElement.addEventListener('pointerup', () => {
        isDragging = false;
        renderer.domElement.style.cursor = 'grab';
    });
    renderer.domElement.addEventListener('pointerleave', () => {
        isDragging = false;
        if (hoveredPin) { hoveredPin.scale.set(1, 1, 1); hoveredPin = null; }
        hideTooltip();
    });
    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoom = Math.max(2.4, Math.min(5.5, zoom + e.deltaY * 0.002));
    }, { passive: false });

    renderer.domElement.addEventListener('click', (e) => {
        if (Math.abs(dragDelta.x) + Math.abs(dragDelta.y) > 0.05) return;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(pins);
        if (hits.length > 0) {
            const pin = hits[0].object;
            if (activePin && activePin !== pin) activePin.scale.set(1, 1, 1);
            activePin = pin;
            pin.scale.set(1.6, 1.6, 1.6);
            const place = pin.userData.place;
            const target = latLngToVector3(THREE, place.coords[0], place.coords[1], GLOBE_RADIUS);
            targetGlobeRot = computeRotationToFace(target);
            window.dispatchEvent(new CustomEvent('globe:select', { detail: place }));
        }
    });

    function hideTooltip() {
        const tt = document.getElementById('globeTooltip');
        if (tt) tt.classList.remove('visible');
    }

    function showTooltip(place, m) {
        const tt = document.getElementById('globeTooltip');
        if (!tt) return;
        tt.querySelector('.tt-name').textContent = place.name;
        tt.querySelector('.tt-loc').textContent = `${place.city}, ${place.country}`;
        tt.querySelector('.tt-cat').textContent = place.category;
        tt.style.transform = `translate(${(m.x * 0.5 + 0.5) * 100}%, ${(-m.y * 0.5 + 0.5) * 100}%)`;
        tt.classList.add('visible');
    }

    function hoverPin(pin) {
        if (hoveredPin && hoveredPin !== pin) hoveredPin.scale.set(1, 1, 1);
        hoveredPin = pin;
        if (pin !== activePin) pin.scale.set(1.4, 1.4, 1.4);
        showTooltip(pin.userData.place, mouse);
        renderer.domElement.style.cursor = 'pointer';
    }

    // ============================================
    // ANIMATION
    // ============================================
    let targetGlobeRot = { x: 0, y: 0 };
    let currentRot = { x: 0, y: 0 };

    function computeRotationToFace(target) {
        const normalized = target.clone().normalize();
        const targetY = Math.asin(normalized.y);
        const targetX = Math.atan2(normalized.z, normalized.x);
        return { x: targetY, y: -targetX + Math.PI / 2 };
    }

    function animate(time) {
        const t = time * 0.001;

        currentRot.x += (targetGlobeRot.x - currentRot.x) * 0.05;
        currentRot.y += (targetGlobeRot.y - currentRot.y) * 0.05;

        globe.rotation.x = currentRot.x + dragDelta.y;
        globe.rotation.y = currentRot.y + dragDelta.x;

        if (!reduceMotion && !isDragging && !activePin && !hoveredPin) {
            targetGlobeRot.y += 0.0008;
        }

        pins.forEach(p => {
            if (p.userData.type === 'halo') {
                const phase = p.userData.basePhase + t * 1.5;
                const pulse = (Math.sin(phase) + 1) / 2;
                p.material.opacity = pulse * 0.25;
                const scale = 1 + pulse * 0.6;
                p.scale.set(scale, scale, scale);
            }
        });

        if (!isDragging) {
            raycaster.setFromCamera(mouse, camera);
            const hits = raycaster.intersectObjects(pins);
            if (hits.length > 0) {
                if (hoveredPin !== hits[0].object) {
                    if (hoveredPin) hoveredPin.scale.set(1, 1, 1);
                    hoverPin(hits[0].object);
                }
            } else if (hoveredPin) {
                hoveredPin.scale.set(1, 1, 1);
                hoveredPin = null;
                hideTooltip();
                renderer.domElement.style.cursor = 'grab';
            }
        }

        camera.position.z += (zoom - camera.position.z) * 0.1;

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    }
    let frameId = requestAnimationFrame(animate);

    function resize() {
        const w = container.clientWidth || 400;
        const h = container.clientHeight || 400;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) cancelAnimationFrame(frameId);
        else if (!reduceMotion) frameId = requestAnimationFrame(animate);
    });

    window.addEventListener('beforeunload', () => {
        cancelAnimationFrame(frameId);
        ro.disconnect();
        renderer.dispose();
        globeGeometry.dispose();
        globeMaterial.dispose();
    });
}

function latLngToVector3(THREE, lat, lng, radius) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return new THREE.Vector3(
        -(radius * Math.sin(phi) * Math.cos(theta)),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
    );
}