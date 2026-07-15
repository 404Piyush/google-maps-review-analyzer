// ============================================
// globe.js — Interactive Three.js globe with city pins
// - Acid-green atmosphere rim glow
// - Country outlines + latitude/longitude grid
// - Pins have a vertical light beam from the surface
// - Click pin → anchored popup (managed here), <Esc>/background closes
// - Drag-to-rotate, scroll-to-zoom, hover scales pin
// Exposes window.GlobeAPI for app.js (getPinScreenPos, setActivePin).
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
        THREE = await import('three');
    } catch (err) {
        console.error('[globe] failed to load three.js', err);
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
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1000);
    camera.position.z = 3.2;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const fallback = container.querySelector('.hero-3d-fallback');
    if (fallback) fallback.style.display = 'none';

    // ============================================
    // GLOBE — inner sphere
    // ============================================
    const GLOBE_R = 1.4;
    const sphereGeo = new THREE.SphereGeometry(GLOBE_R, 96, 96);
    // Ocean — deep teal-blue base (the "actual color of earth" on the water side)
    const sphereMat = new THREE.MeshBasicMaterial({
        color: 0x1f4d6b,
        transparent: false,
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(sphere);

    // ============================================
    // ATMOSPHERE — fresnel rim glow shader
    // (acid green on the rim of the sphere)
    // ============================================
    const atmosphereGeo = new THREE.SphereGeometry(GLOBE_R * 1.06, 64, 64);
    const atmosphereMat = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(0xc5f900) },
            coefficient: { value: 0.85 },
            power: { value: 4.0 },
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vPosition;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            uniform float coefficient;
            uniform float power;
            varying vec3 vNormal;
            void main() {
                float intensity = coefficient * pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), power);
                gl_FragColor = vec4(color, 1.0) * intensity;
            }
        `,
        blending: THREE.AdditiveBlending,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(atmosphereGeo, atmosphereMat);
    scene.add(atmosphere);

    // ============================================
    // COUNTRY OUTLINES (lazy fetch from world-atlas)
    // ============================================
    (async () => {
        const CDNS = [
            'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
            'https://unpkg.com/world-atlas@2/countries-110m.json',
        ];
        let topojsonClient;
        for (const url of CDNS) {
            try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 8000);
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(tid);
                if (!res.ok) continue;
                const topo = await res.json();
                if (!topojsonClient) topojsonClient = await import('https://esm.sh/topojson-client@3.1.0');
                const countries = topojsonClient.feature(topo, topo.objects.countries);

                // Landmass fill — build a 3D triangle fan per ring
                // (vertices on the sphere surface → visible from any angle)
                const fillMat = new THREE.MeshBasicMaterial({
                    color: 0xd9c89a,
                    transparent: false,
                    side: THREE.DoubleSide,
                });

                // Subdivide long ring edges on the sphere surface so adjacent triangles
                // don't span huge arcs (which would show as visible facets).
                // Returns array of [x,y,z] vertices on the sphere at radius R.
                function subdivideRing(ring, R, maxEdgeRad = 0.025) {
                    const out = [];
                    for (let i = 0; i < ring.length - 1; i++) {
                        const [lng1, lat1] = ring[i];
                        const [lng2, lat2] = ring[i + 1];
                        const p1 = latLngToCoords(lat1, lng1, R);
                        const p2 = latLngToCoords(lat2, lng2, R);
                        // Angle between the two points
                        const dot = (p1.x * p2.x + p1.y * p2.y + p1.z * p2.z) / (R * R);
                        const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
                        const steps = Math.max(1, Math.ceil(angle / maxEdgeRad));
                        for (let s = 0; s < steps; s++) {
                            const t = s / steps;
                            const sinA = Math.sin(angle);
                            const w1 = Math.sin((1 - t) * angle) / sinA;
                            const w2 = Math.sin(t * angle) / sinA;
                            out.push([w1 * p1.x + w2 * p2.x,
                                      w1 * p1.y + w2 * p2.y,
                                      w1 * p1.z + w2 * p2.z]);
                        }
                    }
                    return out;
                }

                // Build land geometry by fan-triangulating from the first vertex of the
                // heavily-subdivided ring. Vertices live on the sphere surface so the
                // fan triangles curve with the globe naturally.
                function buildLandGeometry(ring, R) {
                    if (!ring || ring.length < 3) return null;
                    const v = subdivideRing(ring, R);
                    if (v.length < 3) return null;

                    const positions = new Float32Array(v.length * 3);
                    for (let i = 0; i < v.length; i++) {
                        positions[i * 3]     = v[i][0];
                        positions[i * 3 + 1] = v[i][1];
                        positions[i * 3 + 2] = v[i][2];
                    }
                    const indices = [];
                    for (let i = 1; i < v.length - 1; i++) {
                        indices.push(0, i, i + 1);
                    }
                    const geo = new THREE.BufferGeometry();
                    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    geo.setIndex(indices);
                    return geo;
                }

                countries.features.forEach(c => {
                    const polys = c.geometry.type === 'MultiPolygon' ? c.geometry.coordinates : [c.geometry.coordinates];
                    polys.forEach(poly => {
                        // poly[0] is the outer ring; later rings are holes
                        const outerGeo = buildLandGeometry(poly[0], GLOBE_R * 1.002);
                        if (outerGeo) {
                            const m = new THREE.Mesh(outerGeo, fillMat);
                            sphere.add(m);
                        }
                        // Holes — skip for now (most countries don't have them in 110m)
                    });
                });

                // Country border — slerp-subdivided for smooth curves
                const lineMat = new THREE.LineBasicMaterial({
                    color: 0x6b5a36,
                    transparent: true,
                    opacity: 0.85,
                });
                function ringToPoints(ring) {
                    const pts = [];
                    for (let i = 0; i < ring.length - 1; i++) {
                        const [lng1, lat1] = ring[i];
                        const [lng2, lat2] = ring[i + 1];
                        const p1 = latLngToCoords(lat1, lng1, GLOBE_R * 1.003);
                        const p2 = latLngToCoords(lat2, lng2, GLOBE_R * 1.003);
                        const dot = (p1.x * p2.x + p1.y * p2.y + p1.z * p2.z) / (GLOBE_R * GLOBE_R * 1.003 * 1.003);
                        const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
                        const steps = Math.max(1, Math.ceil(angle / 0.04));
                        for (let s = 0; s < steps; s++) {
                            const t = s / steps;
                            const sinA = Math.sin(angle);
                            const w1 = Math.sin((1 - t) * angle) / sinA;
                            const w2 = Math.sin(t * angle) / sinA;
                            pts.push(new THREE.Vector3(
                                w1 * p1.x + w2 * p2.x,
                                w1 * p1.y + w2 * p2.y,
                                w1 * p1.z + w2 * p2.z
                            ));
                        }
                    }
                    return pts;
                }
                countries.features.forEach(c => {
                    const polys = c.geometry.type === 'MultiPolygon' ? c.geometry.coordinates : [c.geometry.coordinates];
                    polys.forEach(poly => {
                        poly.forEach(ring => {
                            const pts = ringToPoints(ring);
                            const geo = new THREE.BufferGeometry().setFromPoints(pts);
                            const line = new THREE.Line(geo, lineMat);
                            sphere.add(line);
                        });
                    });
                });
                return;
            } catch (e) { /* try next CDN */ }
        }
        console.warn('[globe] country outlines unavailable');
    })();

    // ============================================
    // LAT/LNG GRID (subtle)
    // ============================================
    const gridMat = new THREE.LineBasicMaterial({
        color: 0xc5f900,
        transparent: true,
        opacity: 0.06,
    });
    for (let i = 0; i <= 12; i++) {
        const phi = (i / 12) * Math.PI;
        const r = GLOBE_R * 1.0005;
        const pts = [];
        for (let j = 0; j <= 96; j++) {
            const t = (j / 96) * Math.PI * 2;
            pts.push(new THREE.Vector3(
                r * Math.sin(phi) * Math.cos(t),
                r * Math.cos(phi),
                r * Math.sin(phi) * Math.sin(t)
            ));
        }
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    for (let i = 0; i < 24; i++) {
        const t = (i / 24) * Math.PI * 2;
        const r = GLOBE_R * 1.0005;
        const pts = [];
        for (let j = 0; j <= 96; j++) {
            const phi = (j / 96) * Math.PI;
            pts.push(new THREE.Vector3(
                r * Math.sin(phi) * Math.cos(t),
                r * Math.cos(phi),
                r * Math.sin(phi) * Math.sin(t)
            ));
        }
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }

    // ============================================
    // PINS (each = dot + halo + vertical beam)
    // ============================================
    const pins = [];
    const pinGroup = new THREE.Group();
    sphere.add(pinGroup);

    PLACES.forEach((place, i) => {
        const surface = latLngToCoords(place.coords[0], place.coords[1], GLOBE_R * 1.001);
        const normal = new THREE.Vector3(surface.x, surface.y, surface.z).normalize();

        // Anchor (pivot) at the surface — pin + beam + halo all rotate together
        const pivot = new THREE.Group();
        pivot.position.set(surface.x, surface.y, surface.z);
        pivot.lookAt(0, 0, 0); // points outward (rotate Y faces world +Z is up)

        // Pin dot
        const dotGeo = new THREE.SphereGeometry(0.018, 16, 16);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xc5f900 });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.set(0, 0, 0);
        pivot.add(dot);

        // Inner halo (pulses)
        const haloGeo = new THREE.SphereGeometry(0.04, 16, 16);
        const haloMat = new THREE.MeshBasicMaterial({
            color: 0xc5f900,
            transparent: true,
            opacity: 0,
            side: THREE.BackSide,
        });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.position.set(0, 0, 0);
        pivot.add(halo);

        // Vertical beam (a thin line from surface upward in pivot local space)
        const beamPts = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 0.18),
        ];
        const beamGeo = new THREE.BufferGeometry().setFromPoints(beamPts);
        const beamMat = new THREE.LineBasicMaterial({
            color: 0xc5f900,
            transparent: true,
            opacity: 0.5,
        });
        const beam = new THREE.Line(beamGeo, beamMat);
        pivot.add(beam);

        // Beam top cap
        const capGeo = new THREE.SphereGeometry(0.012, 12, 12);
        const capMat = new THREE.MeshBasicMaterial({ color: 0xc5f900 });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(0, 0, 0.18);
        pivot.add(cap);

        pivot.userData = { place, dot, halo, beam, cap, type: 'pin', basePhase: i * 0.7 };
        pinGroup.add(pivot);
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
    let zoom = 3.2;

    renderer.domElement.style.touchAction = 'none';

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
    });
    renderer.domElement.addEventListener('pointerup', () => { isDragging = false; });
    renderer.domElement.addEventListener('pointerleave', () => {
        isDragging = false;
        unhoverPin();
    });
    renderer.domElement.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoom = Math.max(2.2, Math.min(5.5, zoom + e.deltaY * 0.002));
    }, { passive: false });
    renderer.domElement.addEventListener('click', (e) => {
        if (Math.abs(dragDelta.x) + Math.abs(dragDelta.y) > 0.05) return;
        raycaster.setFromCamera(mouse, camera);
        const hits = raycaster.intersectObjects(pins, true);
        if (hits.length > 0) {
            // Find which pin pivot the hit belongs to
            let pivot = hits[0].object;
            while (pivot && !pivot.userData.place) pivot = pivot.parent;
            if (pivot) {
                setActivePin(pivot.userData.place.id);
                window.dispatchEvent(new CustomEvent('globe:select', { detail: pivot.userData.place }));
            }
        } else if (activePinId) {
            // Clicked empty space → close
            setActivePin(null);
            window.dispatchEvent(new CustomEvent('globe:close'));
        }
    });

    function unhoverPin() {
        if (hoveredPin && hoveredPin !== pins.find(p => p.userData.place.id === activePinId)) {
            hoveredPin.userData.dot.scale.set(1, 1, 1);
            hoveredPin = null;
        }
    }

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

    // Expose API for app.js
    const pinScreenPositions = {}; // placeId → {x, y, onFront}
    function computePinScreenPositions() {
        pins.forEach(p => {
            const placeId = p.userData.place.id;
            const worldPos = new THREE.Vector3();
            p.getWorldPosition(worldPos);
            const cameraPos = camera.position;
            // On front if dot product with view direction is positive (i.e. Z > camera.z after rotation)
            const projected = worldPos.clone().project(camera);
            const x = (projected.x * 0.5 + 0.5) * width;
            const y = (-projected.y * 0.5 + 0.5) * height;
            // Check if pin is on visible side of globe (z > 0 in screen space means in front)
            // And not occluded by sphere center (simple check: dot(camera_to_pin, pin_normalized) > 0)
            const camToPin = new THREE.Vector3().subVectors(worldPos, cameraPos).normalize();
            const pinNormal = worldPos.clone().normalize();
            const onFront = camToPin.dot(pinNormal) < 0; // Looking at sphere from outside
            pinScreenPositions[placeId] = { x, y, onFront, worldPos };
        });
    }

    window.GlobeAPI = {
        getPinScreenPos(id) { return pinScreenPositions[id] || null; },
        setActivePin,
        getActivePinId() { return activePinId; },
        get PLACES() { return PLACES; },
        rotateTo(id) {
            const place = PLACES.find(p => p.id === id);
            if (!place) return;
            const target = latLngToCoords(place.coords[0], place.coords[1], GLOBE_R);
            // Compute rotation to bring point to camera-facing
            const normalized = new THREE.Vector3(target.x, target.y, target.z).normalize();
            targetGlobeRot.x = Math.asin(normalized.y);
            targetGlobeRot.y = Math.atan2(normalized.z, normalized.x) + Math.PI;
        },
        close() {
            setActivePin(null);
        },
    };

    // ============================================
    // ANIMATION
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

        // Pin animations
        pins.forEach(p => {
            const phase = p.userData.basePhase + t * 1.4;
            const pulse = (Math.sin(phase) + 1) / 2;
            p.userData.halo.material.opacity = pulse * 0.28;
            const haloScale = 1 + pulse * 0.8;
            p.userData.halo.scale.set(haloScale, haloScale, haloScale);
            // Beam pulses too
            p.userData.beam.material.opacity = 0.3 + pulse * 0.3;
            // Active pin: brighter, steady
            if (p.userData.place.id === activePinId) {
                p.userData.beam.material.opacity = 0.8;
                p.userData.cap.scale.set(1.4, 1.4, 1.4);
            } else {
                p.userData.cap.scale.set(1, 1, 1);
            }
        });

        // Hover detection
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
                unhoverPin();
                hoveredPin = foundPivot;
                if (hoveredPin.userData.place.id !== activePinId) {
                    hoveredPin.userData.dot.scale.set(1.5, 1.5, 1.5);
                }
                renderer.domElement.style.cursor = 'pointer';
            } else if (!foundPivot && hoveredPin) {
                unhoverPin();
                renderer.domElement.style.cursor = isDragging ? 'grabbing' : 'grab';
            } else if (foundPivot) {
                renderer.domElement.style.cursor = 'pointer';
            } else {
                renderer.domElement.style.cursor = isDragging ? 'grabbing' : 'grab';
            }
        }

        // Camera zoom
        camera.position.z += (zoom - camera.position.z) * 0.1;

        // Compute pin screen positions for app.js
        computePinScreenPositions();

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
        sphereGeo.dispose();
        sphereMat.dispose();
        atmosphereGeo.dispose();
    });
}

// ============================================
// Coordinate helpers
// ============================================
function latLngToCoords(lat, lng, r) {
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return {
        x: -(r * Math.sin(phi) * Math.cos(theta)),
        y: r * Math.cos(phi),
        z: r * Math.sin(phi) * Math.sin(theta),
    };
}

function latLngToXY(lat, lng, r) {
    // For 2D ShapeGeometry overlay (before extrusion to 3D)
    const phi = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    return {
        x: -(r * Math.sin(phi) * Math.cos(theta)),
        y: r * Math.cos(phi),
    };
}