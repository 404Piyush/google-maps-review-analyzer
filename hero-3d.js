// ============================================
// hero-3d.js — Three.js wireframe icosahedron (lazy-loaded)
// ============================================
const container = document.getElementById('hero3d');
if (!container) {
    console.warn('[hero-3d] container missing');
} else {
    // Lazy-load only when hero is in viewport
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            observer.disconnect();
            init3D(container);
        }
    }, { rootMargin: '200px' });
    observer.observe(container);
}

async function init3D(container) {
    // Dynamic import — Three.js only loads when needed
    let THREE;
    try {
        THREE = await import('three');
    } catch (err) {
        console.error('[hero-3d] failed to load three.js', err);
        return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 4.2;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Hide fallback now that canvas is mounted
    const fallback = container.querySelector('.hero-3d-fallback');
    if (fallback) fallback.style.display = 'none';

    // Wireframe icosahedron (main object)
    const geometry = new THREE.IcosahedronGeometry(1.6, 1);
    const wireMaterial = new THREE.LineBasicMaterial({
        color: 0x0a0a0a,
        transparent: true,
        opacity: 0.85,
    });
    const wireframe = new THREE.LineSegments(
        new THREE.WireframeGeometry(geometry),
        wireMaterial
    );
    scene.add(wireframe);

    // Filled ghost mesh (very transparent) for depth
    const fillMaterial = new THREE.MeshBasicMaterial({
        color: 0xc5f900,
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
    });
    const fillMesh = new THREE.Mesh(geometry, fillMaterial);
    scene.add(fillMesh);

    // Outer wireframe sphere for additional depth
    const outerGeometry = new THREE.IcosahedronGeometry(2.0, 0);
    const outerWire = new THREE.LineSegments(
        new THREE.WireframeGeometry(outerGeometry),
        new THREE.LineBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.15 })
    );
    scene.add(outerWire);

    // Particle accents (small dots on vertices)
    const vertices = geometry.attributes.position;
    const dotsGeometry = new THREE.BufferGeometry();
    const dotsPositions = new Float32Array(vertices.count * 3);
    for (let i = 0; i < vertices.count; i++) {
        dotsPositions[i * 3] = vertices.getX(i);
        dotsPositions[i * 3 + 1] = vertices.getY(i);
        dotsPositions[i * 3 + 2] = vertices.getZ(i);
    }
    dotsGeometry.setAttribute('position', new THREE.BufferAttribute(dotsPositions, 3));
    const dotsMaterial = new THREE.PointsMaterial({
        color: 0xc5f900,
        size: 0.06,
        sizeAttenuation: true,
    });
    const dots = new THREE.Points(dotsGeometry, dotsMaterial);
    scene.add(dots);

    // Mouse tracking
    const targetRot = { x: 0, y: 0 };
    const currentRot = { x: 0, y: 0 };
    container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        targetRot.x = ((e.clientY - rect.top) / rect.height - 0.5) * 0.4;
        targetRot.y = ((e.clientX - rect.left) / rect.width - 0.5) * 0.4;
    });
    container.addEventListener('mouseleave', () => {
        targetRot.x = 0;
        targetRot.y = 0;
    });

    // Resize handler
    function resize() {
        const w = container.clientWidth || 400;
        const h = container.clientHeight || 400;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // Animation
    let frameId;
    function animate(time) {
        frameId = requestAnimationFrame(animate);
        const t = time * 0.001;

        // Smooth follow mouse
        currentRot.x += (targetRot.x - currentRot.x) * 0.05;
        currentRot.y += (targetRot.y - currentRot.y) * 0.05;

        if (!reduceMotion) {
            wireframe.rotation.x = currentRot.x + t * 0.15;
            wireframe.rotation.y = currentRot.y + t * 0.2;
            fillMesh.rotation.copy(wireframe.rotation);
            dots.rotation.copy(wireframe.rotation);

            // Slow counter-rotation for outer shell
            outerWire.rotation.x = -t * 0.08;
            outerWire.rotation.y = -t * 0.12;
        }

        renderer.render(scene, camera);
    }
    animate(0);

    // Pause on tab hide to save battery
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancelAnimationFrame(frameId);
        } else if (!reduceMotion) {
            animate(performance.now());
        }
    });

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
        cancelAnimationFrame(frameId);
        ro.disconnect();
        renderer.dispose();
        geometry.dispose();
        wireMaterial.dispose();
        fillMaterial.dispose();
        outerGeometry.dispose();
        dotsGeometry.dispose();
        dotsMaterial.dispose();
    });
}