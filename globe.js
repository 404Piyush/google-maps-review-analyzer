// ============================================
// globe.js — Three.js Earth + single texture
// - One image load (CDN-cached) → instant globe
// - Acid-green pulsing markers, vertical beams
// - HTML popups anchored to pin screen positions
// - Popups smoothly track pin as you drag/rotate
// Exposes window.GlobeAPI for app.js
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
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;

    // ============================================
    // SCENE
    // ============================================
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1000);
    camera.position.z = 3.0;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const fallback = container.querySelector('.hero-3d-fallback');
    if (fallback) fallback.style.display = 'none';

    // ============================================
    // EARTH — single texture, applied to a sphere
    // Texture source: jsdelivr CDN of threejs example assets
    // ============================================
    const GLOBE_R = 1.4;
    const sphereGeo = new THREE.SphereGeometry(GLOBE_R, 96, 96);
    let sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x1f4d6b }); // ocean fallback
    const sphere = new THREE.Mesh(sphereGeo, sphereMaterial);
    scene.add(sphere);

    // Try to load the Earth texture (best-effort, ocean-blue fallback if it fails)
    try {
        const texLoader = new THREE.TextureLoader();
        const tex = await new Promise((resolve, reject) => {
            texLoader.load(
                'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r158/examples/textures/planets/earth_atmos_2048.jpg',
                (t) => resolve(t),
                undefined,
                (e) => reject(e)
            );
            setTimeout(() => reject(new Error('texture load timeout')), 8000);
        });
        tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
        sphere.material = new THREE.MeshBasicMaterial({ map: tex });
        sphereMaterial.dispose();
    } catch (e) {
        console.warn('[globe] earth texture unavailable, using ocean blue', e);
    }

    // ============================================
    // ATMOSPHERE — thin fresnel rim for depth
    // ============================================
    const atmosphereGeo = new THREE.SphereGeometry(GLOBE_R * 1.04, 64, 64);
    const atmosphereMat = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: new THREE.Color(0xc5f900) },
            coefficient: { value: 0.85 },
            power: { value: 4.0 },
        },
        vertexShader: `
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
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

        // Dot
        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.018, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xc5f900 })
        );
        pivot.add(dot);

        // Halo (animated)
        const halo = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xc5f900, transparent: true, opacity: 0, side: THREE.BackSide })
        );
        pivot.add(halo);

        // Vertical beam
        const beamPts = [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, 0.18),
        ];
        const beamMat = new THREE.LineBasicMaterial({ color: 0xc5f900, transparent: true, opacity: 0.5 });
        const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints(beamPts), beamMat);
        pivot.add(beam);

        // Beam cap
        const cap = new THREE.Mesh(
            new THREE.SphereGeometry(0.012, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0xc5f900 })
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
    let zoom = 3.0;

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

    // Run before the main click handler: if this click is on a marker
    // that was just closed, swallow it so the close actually sticks.
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
                const biz = pivot.userData.place;
                window.dispatchEvent(new CustomEvent('globe:select', { detail: biz }));
            }
        } else if (activePinId) {
            setActivePin(null);
            window.dispatchEvent(new CustomEvent('globe:close'));
        }
    });

    // ============================================
    // PUBLIC API — exposes pin positions for HTML popups
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

    window.dispatchEvent(new CustomEvent('globe:ready', { detail: { version: 'three.js + earth texture' } }));

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

        // Pin animations
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
        if (sphere.material) sphere.material.dispose();
        if (sphere.material && sphere.material.map) sphere.material.map.dispose();
        atmosphereGeo.dispose();
        atmosphereMat.dispose();
    });
}