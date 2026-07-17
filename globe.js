// ============================================
// globe.js — Cartoon Earth with hand-drawn continents
// Rendered via CanvasTexture (procedurally drawn from world-atlas)
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
    let THREE;
    try {
        const mod = await import('three');
        THREE = mod.default || mod;
    } catch (err) {
        console.error('[globe] failed to load three.js', err);
        return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const width = container.clientWidth || 480;
    const height = container.clientHeight || 480;

    // ============================================
    // SCENE
    // ============================================
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 1000);
    camera.position.z = 3.4;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const fallback = container.querySelector('.hero-3d-fallback');
    if (fallback) fallback.style.display = 'none';

    // ============================================
    // CARTOON EARTH via CanvasTexture
    // Equirectangular layout: 2:1 aspect (lng -180..180, lat 90..-90)
    // ============================================
    const TW = 2048, TH = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = TW; canvas.height = TH;
    const ctx = canvas.getContext('2d');

    // Helper: project lng/lat to canvas px
    const project = (lng, lat) => ({
        x: ((lng + 180) / 360) * TW,
        y: ((90 - lat) / 180) * TH,
    });

    // Base: ocean with vertical gradient (lighter at top, darker at bottom)
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, TH);
    oceanGrad.addColorStop(0.00, '#6cb0d8');
    oceanGrad.addColorStop(0.45, '#4f93bf');
    oceanGrad.addColorStop(0.85, '#3a7aa5');
    oceanGrad.addColorStop(1.00, '#2a6e8f');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, TW, TH);

    // Subtle wave / horizon band (a lighter strip near the equator for depth)
    const horizon = ctx.createLinearGradient(0, TH * 0.35, 0, TH * 0.65);
    horizon.addColorStop(0, 'rgba(255,255,255,0)');
    horizon.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    horizon.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, TH * 0.35, TW, TH * 0.30);

    // Continents — load topojson, draw filled polygons with hand-drawn outlines
    let topo = null;
    const topoCDNS = [
        'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
        'https://unpkg.com/world-atlas@2/countries-110m.json',
    ];
    let topoClient = null;
    for (const url of topoCDNS) {
        try {
            const ctl = new AbortController();
            const tid = setTimeout(() => ctl.abort(), 6000);
            const res = await fetch(url, { signal: ctl.signal });
            clearTimeout(tid);
            if (res.ok) { topo = await res.json(); break; }
        } catch (e) { /* try next */ }
    }

    if (topo) {
        try {
            const topoMod = await import('https://esm.sh/topojson-client@3.1.0');
            topoClient = topoMod.feature || topoMod.default?.feature;
        } catch { /* ignore — no continents */ }

        if (topoClient) {
            const countries = topoClient(topo, topo.objects.countries);

            // Outer waterline (light blue rim around continents)
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.fillStyle = '#aac9d8'; // light watery halo around continents
            ctx.lineWidth = 14;

            countries.features.forEach(c => {
                const polys = c.geometry.type === 'MultiPolygon' ? c.geometry.coordinates : [c.geometry.coordinates];
                polys.forEach(poly => {
                    if (poly.length < 1) return;
                    // Outer halos (light watery edge)
                    poly.forEach(ring => {
                        ctx.beginPath();
                        ring.forEach(([lng, lat], i) => {
                            const p = project(lng, lat);
                            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
                        });
                        ctx.closePath();
                        ctx.stroke();
                    });
                });
            });

            // Continent fill — light yellow-green
            ctx.fillStyle = '#a8c444';
            countries.features.forEach(c => {
                const polys = c.geometry.type === 'MultiPolygon' ? c.geometry.coordinates : [c.geometry.coordinates];
                polys.forEach(poly => {
                    if (poly.length < 1) return;
                    const fillOuter = (ring) => {
                        ctx.beginPath();
                        ring.forEach(([lng, lat], i) => {
                            const p = project(lng, lat);
                            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
                        });
                        ctx.closePath();
                        ctx.fill();
                    };
                    fillOuter(poly[0]);
                    // Cut holes (subsequent rings in same poly)
                    for (let i = 1; i < poly.length; i++) {
                        ctx.save();
                        ctx.globalCompositeOperation = 'destination-out';
                        fillOuter(poly[i]);
                        ctx.restore();
                    }
                });
            });

            // Thin black outlines on top of fills for cartoon crispness
            ctx.strokeStyle = '#0a0a0a';
            ctx.lineWidth = 2.5;
            countries.features.forEach(c => {
                const polys = c.geometry.type === 'MultiPolygon' ? c.geometry.coordinates : [c.geometry.coordinates];
                polys.forEach(poly => {
                    poly.forEach(ring => {
                        ctx.beginPath();
                        ring.forEach(([lng, lat], i) => {
                            const p = project(lng, lat);
                            if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
                        });
                        ctx.closePath();
                        ctx.stroke();
                    });
                });
            });
        }
    }

    // Subtle graticule (latitude/longitude lines)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let lng = -180; lng <= 180; lng += 30) {
        const p = project(lng, 0);
        ctx.beginPath();
        ctx.moveTo(p.x, 0);
        ctx.lineTo(p.x, TH);
        ctx.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
        const p = project(0, lat);
        ctx.beginPath();
        ctx.moveTo(0, p.y);
        ctx.lineTo(TW, p.y);
        ctx.stroke();
    }

    // Mask the south + north edge of the canvas with ocean so any
    // polygons that touch lat=-90/90 don't draw a thick line at the
    // canvas edge. This eliminates the visible "seam" at the south
    // pole of the globe.
    const edgeMask = ctx.createLinearGradient(0, TH - 24, 0, TH);
    edgeMask.addColorStop(0, 'rgba(0,0,0,0)');
    edgeMask.addColorStop(1, '#2a6e8f');
    ctx.fillStyle = edgeMask;
    ctx.fillRect(0, TH - 24, TW, 24);
    const topMask = ctx.createLinearGradient(0, 0, 0, 24);
    topMask.addColorStop(0, '#2a6e8f');
    topMask.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topMask;
    ctx.fillRect(0, 0, TW, 24);

    // Use canvas as texture
    const earthTex = new THREE.CanvasTexture(canvas);
    earthTex.colorSpace = THREE.SRGBColorSpace;
    earthTex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);

    const GLOBE_R = 1.4;
    const sphereGeo = new THREE.SphereGeometry(GLOBE_R, 96, 96);
    const sphere = new THREE.Mesh(
        sphereGeo,
        new THREE.MeshBasicMaterial({ map: earthTex })
    );
    scene.add(sphere);

    // ============================================
    // PLACE PINS
    // ============================================
    const pins = [];
    let { PLACES } = await import('./globe-data.js').catch(() => ({ PLACES: [] }));

    function latLngToCoords(lat, lng, r) {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lng + 180) * Math.PI / 180;
        return {
            x: -(r * Math.sin(phi) * Math.cos(theta)),
            y: r * Math.cos(phi),
            z: r * Math.sin(phi) * Math.sin(theta),
        };
    }

    PLACES.forEach((place, i) => {
        const surface = latLngToCoords(place.coords[0], place.coords[1], GLOBE_R * 1.005);
        const pivot = new THREE.Group();
        pivot.position.set(surface.x, surface.y, surface.z);
        pivot.lookAt(0, 0, 0);

        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.018, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xef4444 })
        );
        pivot.add(dot);

        const halo = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0, side: THREE.BackSide })
        );
        pivot.add(halo);

        const beamPts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0.18)];
        const beamMat = new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.5 });
        const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints(beamPts), beamMat);
        pivot.add(beam);

        const cap = new THREE.Mesh(
            new THREE.SphereGeometry(0.012, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0xef4444 })
        );
        cap.position.set(0, 0, 0.18);
        pivot.add(cap);

        pivot.userData = { place, dot, halo, beam, cap, type: 'pin', basePhase: i * 0.7 };
        sphere.add(pivot);
        pins.push(pivot);
    });

    // ============================================
    // INTERACTION
    // ============================================
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let hoveredPin = null;
    let activePinId = null;
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let dragDelta = { x: 0, y: 0 };
    let zoom = 3.4;

    renderer.domElement.style.touchAction = 'none';
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
        if (hoveredPin) {
            hoveredPin.userData.dot.scale.set(1, 1, 1);
            hoveredPin = null;
        }
        renderer.domElement.style.cursor = 'grab';
    });
    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoom = Math.max(2.0, Math.min(5.5, zoom + e.deltaY * 0.002));
    }, { passive: false });

    // Capture-phase click guard: swallow the click if it hits a recently-closed marker
    const suppressJustClosedClick = (e) => {
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(pins, true);
        if (hits.length === 0) return;
        let pivot = hits[0].object;
        while (pivot && !pivot.userData.place) pivot = pivot.parent;
        if (pivot && justClosedMarkers.has(pivot.userData.place.id)) {
            e.stopImmediatePropagation();
            e.preventDefault();
            justClosedMarkers.delete(pivot.userData.place.id);
        }
    };
    renderer.domElement.addEventListener('click', suppressJustClosedClick, { capture: true });

    renderer.domElement.addEventListener('click', (e) => {
        if (Math.abs(dragDelta.x) + Math.abs(dragDelta.y) > 0.05) return;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(pins, true);
        if (hits.length > 0) {
            let pivot = hits[0].object;
            while (pivot && !pivot.userData.place) pivot = pivot.parent;
            if (pivot) {
                setActivePin(pivot.userData.place.id);
                window.dispatchEvent(new CustomEvent('globe:select', { detail: pivot.userData.place }));
            }
        } else if (activePinId) {
            setActivePin(null);
            window.dispatchEvent(new CustomEvent('globe:close'));
        }
    });

    function setActivePin(id) {
        pins.forEach(p => {
            if (p.userData.place.id === id) {
                p.userData.dot.scale.set(1.6, 1.6, 1.6);
            } else if (p.userData.place.id !== activePinId) {
                p.userData.dot.scale.set(1, 1, 1);
            }
        });
        activePinId = id;
    }

    // ============================================
    // PUBLIC API
    // ============================================
    const pinScreenPositions = {};
    function computePinScreenPositions() {
        pins.forEach(p => {
            const placeId = p.userData.place.id;
            const worldPos = new THREE.Vector3();
            p.getWorldPosition(worldPos);
            const projected = worldPos.clone().project(camera);
            const x = (projected.x * 0.5 + 0.5) * width;
            const y = (-projected.y * 0.5 + 0.5) * height;
            const camToPin = new THREE.Vector3().subVectors(worldPos, camera.position).normalize();
            const pinNormal = worldPos.clone().normalize();
            const onFront = camToPin.dot(pinNormal) < 0;
            pinScreenPositions[placeId] = { x, y, onFront, worldPos };
        });
    }

    let justClosedMarkers = new Set();
    function markClosing(placeId) {
        if (!placeId) return;
        justClosedMarkers.add(placeId);
        setTimeout(() => justClosedMarkers.delete(placeId), 350);
    }

    window.GlobeAPI = {
        getActivePinId() { return activePinId; },
        getPinScreenPos(id) { return pinScreenPositions[id] || null; },
        rotateTo(id) {
            const place = PLACES.find(p => p.id === id);
            if (!place) return;
            const target = latLngToCoords(place.coords[0], place.coords[1], GLOBE_R);
            const normalized = new THREE.Vector3(target.x, target.y, target.z).normalize();
            targetGlobeRot.x = Math.asin(normalized.y);
            targetGlobeRot.y = Math.atan2(normalized.z, normalized.x) + Math.PI;
        },
        markClosing,
        getAllMarkers() { return pins; },
        getMarkerByPlaceId(id) { return pins.find(p => p.userData.place.id === id); },
        get PLACES() { return PLACES; },
    };

    window.dispatchEvent(new CustomEvent('globe:ready', { detail: { version: 'three.js + canvas-texture cartoon earth' } }));

    // ============================================
    // ANIMATION LOOP
    // ============================================
    let targetGlobeRot = { x: 0, y: 0 };
    let currentRot = { x: 0, y: 0 };

    function animate(time) {
        const t = time * 0.001;

        currentRot.x += (targetGlobeRot.x - currentRot.x) * 0.05;
        currentRot.y += (targetGlobeRot.y - currentRot.y) * 0.05;

        sphere.rotation.x = currentRot.x + dragDelta.y;
        sphere.rotation.y = currentRot.y + dragDelta.x;

        if (!reduceMotion && !isDragging && !activePinId && !hoveredPin) {
            targetGlobeRot.y += 0.0006;
        }

        pins.forEach(p => {
            const phase = p.userData.basePhase + t * 1.4;
            const pulse = (Math.sin(phase) + 1) / 2;
            p.userData.halo.material.opacity = pulse * 0.28;
            const haloScale = 1 + pulse * 0.8;
            p.userData.halo.scale.set(haloScale, haloScale, haloScale);
            p.userData.beam.material.opacity = 0.3 + pulse * 0.3;
            if (p.userData.place.id === activePinId) {
                p.userData.beam.material.opacity = 0.8;
                p.userData.cap.scale.set(1.4, 1.4, 1.4);
            } else {
                p.userData.cap.scale.set(1, 1, 1);
            }
        });

        if (!isDragging) {
            raycaster.setFromCamera(mouse, camera);
            const hits = raycaster.intersectObjects(pins, true);
            let foundPivot = null;
            if (hits.length > 0) {
                let o = hits[0].object;
                while (o && !o.userData.place) o = o.parent;
                if (o) foundPivot = o;
            }
            if (foundPivot && foundPivot !== hoveredPin) {
                if (hoveredPin && hoveredPin.userData.place.id !== activePinId) {
                    hoveredPin.userData.dot.scale.set(1, 1, 1);
                }
                hoveredPin = foundPivot;
                if (hoveredPin.userData.place.id !== activePinId) {
                    hoveredPin.userData.dot.scale.set(1.5, 1.5, 1.5);
                }
                renderer.domElement.style.cursor = 'pointer';
            } else if (!foundPivot && hoveredPin) {
                if (hoveredPin.userData.place.id !== activePinId) {
                    hoveredPin.userData.dot.scale.set(1, 1, 1);
                }
                hoveredPin = null;
                renderer.domElement.style.cursor = 'grab';
            }
        }

        camera.position.z += (zoom - camera.position.z) * 0.1;

        computePinScreenPositions();

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    }

    let frameId = requestAnimationFrame(animate);

    function resize() {
        const w = container.clientWidth || 480;
        const h = container.clientHeight || 480;
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
        sphereGeo.dispose();
        if (sphere.material) sphere.material.dispose();
    });
}
