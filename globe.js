// ============================================
// globe.js — MapLibre GL globe with OpenFreeMap
// - Real vector globe (continents, roads, water)
// - Acid-green pulsing markers at each place
// - MapLibre-native Popup (anchored correctly to the marker)
// - No place-name labels on the globe (they live in the popup only)
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
    let maplibregl;
    try {
        // maplibre-gl exports both as default and as window.maplibregl
        const mod = await import('maplibre-gl');
        maplibregl = mod.default || mod;
        // Also expose as global for popups attached programmatically
        if (!window.maplibregl) window.maplibregl = maplibregl;
    } catch (err) {
        console.error('[globe] failed to load maplibre-gl', err);
        return;
    }

    let map;
    try {
        map = new maplibregl.Map({
            container,
            style: 'https://tiles.openfreemap.org/styles/bright',
            center: [12, 28],
            zoom: 1.4,
            attributionControl: false,
            cooperativeGestures: false,
            centerClampedToGround: false,
            canvasContextAttributes: { antialias: true },
        });
    } catch (err) {
        console.error('[globe] map init failed', err);
        return;
    }

    // ============================================
    // Hide all symbol (label) layers + push territory fill brighter
    // ============================================
    map.on('load', () => {
        try {
            map.setProjection({ type: 'globe' });
        } catch (err) {
            console.warn('[globe] setProjection globe failed', err);
        }
        try {
            for (const layer of map.getStyle().layers) {
                if (layer.type === 'symbol') {
                    map.setLayoutProperty(layer.id, 'visibility', 'none');
                }
                // Make sea / land a bit richer
                if (layer.id === 'landcover' || layer.id === 'landuse') {
                    map.setPaintProperty(layer.id, layer.paint?.['fill-opacity'] !== undefined ? '' : '', '');
                }
            }
        } catch (e) { /* style may not be ready yet */ }

        // Optional: bump water color to match the editorial palette
        try {
            if (map.getLayer('water')) {
                map.setPaintProperty('water', 'fill-color', '#1a3a55');
            }
            if (map.getLayer('land')) {
                map.setPaintProperty('land', 'fill-color', '#1f1f1f');
            }
        } catch (e) { /* ignore */ }

        // Hide the fallback svg once map is rendered
        const fallback = container.querySelector('.hero-3d-fallback');
        if (fallback) fallback.style.display = 'none';
    });

    // ============================================
    // Navigation controls (compass + zoom)
    // ============================================
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: false }), 'top-right');
    map.addControl(new maplibregl.GlobeControl(), 'top-right');

    // ============================================
    // Custom acid-green pulsing marker
    // ============================================
    function makeMarkerEl(place) {
        const el = document.createElement('div');
        el.className = 'reatlas-marker';
        el.setAttribute('aria-label', `${place.name}, ${place.city}`);
        el.dataset.placeId = place.id;
        // Outer pulsing ring
        const ring = document.createElement('div');
        ring.className = 'reatlas-marker-ring';
        el.appendChild(ring);
        // Inner dot
        const dot = document.createElement('div');
        dot.className = 'reatlas-marker-dot';
        el.appendChild(dot);
        return el;
    }

    // Load places
    let PLACES = [];
    try {
        const m = await import('./globe-data.js');
        PLACES = m.PLACES || [];
    } catch (e) {
        console.warn('[globe] failed to load globe-data', e);
    }

    // ============================================
    // Popup helpers
    // ============================================
    function makeEmptyPopup(place) {
        return `
            <article class="reatlas-popup">
                <header class="reatlas-popup-head">
                    <span class="reatlas-popup-emoji" aria-hidden="true">${place.emoji || '📍'}</span>
                    <div>
                        <h3 class="reatlas-popup-name">${escapeHtml(place.name)}</h3>
                        <p class="reatlas-popup-loc">${escapeHtml([place.city, place.country].filter(Boolean).join(', '))}</p>
                    </div>
                    <button class="reatlas-popup-close" type="button" aria-label="Close">×</button>
                </header>
                <div class="reatlas-popup-loading">
                    <div class="reatlas-popup-spinner"></div>
                    <span>Scraping reviews…</span>
                </div>
            </article>
        `;
    }

    function renderContentPopup(place, allReviews, scrapedAt) {
        const pos = allReviews.filter(r => r.stars >= 4).length;
        const neu = allReviews.filter(r => r.stars === 3).length;
        const neg = allReviews.filter(r => r.stars <= 2).length;
        const total = allReviews.length || 1;
        const pct = (n) => `${(n / total) * 100}%`;
        return `
            <article class="reatlas-popup" data-place-id="${escapeHtml(place.id)}">
                <header class="reatlas-popup-head">
                    <span class="reatlas-popup-emoji" aria-hidden="true">${place.emoji || '📍'}</span>
                    <div>
                        <h3 class="reatlas-popup-name">${escapeHtml(place.name)}</h3>
                        <p class="reatlas-popup-loc">${escapeHtml([place.city, place.country].filter(Boolean).join(', '))}</p>
                    </div>
                    <button class="reatlas-popup-close" type="button" aria-label="Close">×</button>
                </header>
                <div class="reatlas-popup-meta">
                    <span class="reatlas-popup-rating">★ ${place.rating?.toFixed?.(1) ?? '–'}</span>
                    <span class="reatlas-popup-count">${allReviews.length} of ${(place.reviews_count_estimate || allReviews.length).toLocaleString()} reviews</span>
                </div>
                <div class="reatlas-popup-summary">
                    <div class="reatlas-popup-bar">
                        <div class="reatlas-popup-bar-pos" style="width:${pct(pos)}"></div>
                        <div class="reatlas-popup-bar-neu" style="width:${pct(neu)}"></div>
                        <div class="reatlas-popup-bar-neg" style="width:${pct(neg)}"></div>
                    </div>
                    <div class="reatlas-popup-bar-legend">
                        <span><i></i>Pos</span>
                        <span><i></i>Neu</span>
                        <span><i></i>Neg</span>
                    </div>
                </div>
                <a class="reatlas-popup-cta" href="/job.html?id=${encodeURIComponent(place.id)}" target="_blank" rel="noopener">
                    Open full report
                    <span aria-hidden="true">→</span>
                </a>
            </article>
        `;
    }

    function makeEmptyStatePopup(placeName) {
        return `
            <article class="reatlas-popup reatlas-popup-empty">
                <header class="reatlas-popup-head">
                    <div>
                        <h3 class="reatlas-popup-name">Not yet scraped</h3>
                        <p class="reatlas-popup-loc">No cached reviews for ${escapeHtml(placeName || 'this place')}</p>
                    </div>
                    <button class="reatlas-popup-close" type="button" aria-label="Close">×</button>
                </header>
                <p class="reatlas-popup-empty-text">
                    Run the local scraper and the report will appear here.
                </p>
                <a class="reatlas-popup-cta" href="https://github.com/404Piyush/google-maps-review-analyzer#readme" target="_blank" rel="noopener">
                    How scraping works <span aria-hidden="true">→</span>
                </a>
            </article>
        `;
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ============================================
    // Place pins with MapLibre markers
    // ============================================
    const markersById = {};
    const popupsById = {};
    // Marker ids that should ignore the next click (used so a click
    // event triggered while the popup is being closed doesn't
    // immediately re-open the same popup).
    const justClosedMarkers = new Set();

    // Our globe-data stores [lat, lng] (human reading order).
    // MapLibre setLngLat wants [lng, lat] (GeoJSON order). Swap before passing.
    const toLngLat = (place) => [place.coords[1], place.coords[0]];

    PLACES.forEach((place) => {
        const el = makeMarkerEl(place);
        const marker = new maplibregl.Marker({ element: el })
            .setLngLat(toLngLat(place))
            .addTo(map);

        // Popup anchored to the marker — MapLibre handles positioning
        const popup = new maplibregl.Popup({
            offset: 22,
            anchor: 'bottom',
            closeButton: false,
            closeOnClick: false,
            maxWidth: '320px',
            className: 'reatlas-popup-wrap',
        });

        marker.setPopup(popup);

        // Wire up marker click → dispatch globe:select so app.js can stream reviews
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();

            // If app.js just closed our popup, ignore this click
            // (the closing event occasionally triggers the marker's handler
            // via MapLibre's internal pointer routing)
            if (justClosedMarkers.has(place.id)) {
                justClosedMarkers.delete(place.id);
                return;
            }

            // Close any popup currently shown for this place
            // (avoid stacking if user double-clicks)
            const existing = popupsById[place.id];
            if (existing && existing.isOpen()) existing.remove();

            // Smoothly fly to the place
            map.flyTo({
                center: toLngLat(place),
                zoom: Math.max(map.getZoom(), 3.5),
                duration: 1200,
                essential: true,
            });

            // Notify app.js — it owns the popup lifecycle
            window.dispatchEvent(new CustomEvent('globe:select', { detail: { ...place, marker } }));
        });

        // Hover styling on marker
        el.addEventListener('mouseenter', () => el.classList.add('is-hover'));
        el.addEventListener('mouseleave', () => el.classList.remove('is-hover'));

        markersById[place.id] = marker;
        popupsById[place.id] = popup;
    });

    // ============================================
    // Public API for app.js
    // ============================================
    let activeId = null;

    // Tag markers with their place id so app.js can find them
    PLACES.forEach((place) => {
        if (markersById[place.id]) {
            markersById[place.id]._placeId = place.id;
            markersById[place.id]._place = place;
        }
    });

    function getAllMarkers() {
        return Object.values(markersById);
    }
    function getMarkerByPlaceId(id) {
        return markersById[id];
    }
    function getAllPopups() {
        return Object.values(popupsById);
    }

    window.GlobeAPI = {
        getActivePinId() { return activeId; },
        getPinScreenPos(_id) { return null; },
        markClosing(placeId) {
            if (!placeId) return;
            justClosedMarkers.add(placeId);
            // Drop the flag after 350ms — clicks after that are
            // legitimate new interactions.
            setTimeout(() => justClosedMarkers.delete(placeId), 350);
        },
        rotateTo(id) {
            const place = PLACES.find(p => p.id === id);
            if (place) map.flyTo({ center: toLngLat(place), zoom: 3.5, duration: 1200 });
        },
        updatePopupContent(place, reviews, scrapedAt) {
            const popup = popupsById[place.id];
            if (!popup) return;
            popup.setHTML(renderContentPopup(place, reviews, scrapedAt));
            bindPopupClose(popup);
        },
        updatePopupEmpty(placeName) {
            for (const id in popupsById) {
                try { popupsById[id].remove(); } catch {}
            }
        },
        showEmptyState(placeName, coords) {
            const c = coords || [map.getCenter().lng, map.getCenter().lat];
            const popup = new maplibregl.Popup({
                offset: 22,
                anchor: 'bottom',
                closeButton: false,
                closeOnClick: false,
                maxWidth: '320px',
                className: 'reatlas-popup-wrap',
            })
                .setLngLat(c)
                .setHTML(makeEmptyStatePopup(placeName))
                .addTo(map);
            bindPopupClose(popup);
            return popup;
        },
        close() {
            for (const id in popupsById) {
                try { popupsById[id].remove(); } catch {}
            }
        },
        getAllMarkers,
        getMarkerByPlaceId,
        getAllPopups,
        get PLACES() { return PLACES; },
        get map() { return map; },
    };

    // Tell app.js that the globe is ready
    window.dispatchEvent(new CustomEvent('globe:ready'));

    function bindPopupClose(popup) {
        // Each popup has its own close button. Bind a click handler.
        const el = popup.getElement();
        if (!el) return;
        const btn = el.querySelector('.reatlas-popup-close');
        if (btn) {
            btn.onclick = (e) => {
                e.stopPropagation();
                popup.remove();
            };
        }
    }
}
