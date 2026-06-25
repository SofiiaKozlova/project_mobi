/* ============================================================
   explore.js — map, filters and park cards (Explore page only)
   Depends on common.js
   ============================================================ */

let activeConditions = new Set();
let activePoi = new Set(getPoiCategories());   // restore saved selection
let parkMarkers = {};
let userLocationMarker = null;
let map = null;

/* ─── MAP ─── */
function initMap() {
    const mapBounds = L.latLngBounds([49.833, 10.825], [49.972, 11.100]);
    map = L.map('map', {
        center: [49.8988, 10.8956], zoom: 14, minZoom: 12, maxZoom: 19,
        maxBounds: mapBounds, maxBoundsViscosity: 1.0
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Locate-me control
    const locateControl = L.control({ position: 'topleft' });
    locateControl.onAdd = function () {
        const c = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const b = L.DomUtil.create('a', '', c);
        b.href = '#'; b.title = 'Show my location'; b.innerHTML = '📍';
        Object.assign(b.style, { width: '34px', height: '34px', lineHeight: '34px', textAlign: 'center', fontSize: '18px', background: 'white', cursor: 'pointer' });
        L.DomEvent.disableClickPropagation(c);
        L.DomEvent.on(b, 'click', function (e) {
            L.DomEvent.stop(e);
            if (!navigator.geolocation) { alert('Geolocation is not supported by your browser.'); return; }
            b.style.opacity = '0.5';
            navigator.geolocation.getCurrentPosition(pos => {
                b.style.opacity = '1';
                const ll = [pos.coords.latitude, pos.coords.longitude];
                if (userLocationMarker) map.removeLayer(userLocationMarker);
                const icon = L.divIcon({ className: '', html: `<div style="width:18px;height:18px;background:#4a86e8;border:3px solid white;border-radius:50%;box-shadow:0 0 0 4px rgba(74,134,232,0.25)"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
                userLocationMarker = L.marker(ll, { icon, zIndexOffset: 1000 }).addTo(map).bindPopup('You are here');
                map.flyTo(ll, 16, { duration: 0.8 });
                setTimeout(() => userLocationMarker.openPopup(), 900);
            }, err => { b.style.opacity = '1'; alert('Could not get your location: ' + err.message); }, { enableHighAccuracy: true, timeout: 10000 });
        });
        return c;
    };
    locateControl.addTo(map);
}

function makeParkIcon(active = false) {
    const bg = active ? '#2d4a1e' : '#4a7c2f';
    return L.divIcon({
        className: '',
        html: `<div style="width:34px;height:34px;background:${bg};border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>`,
        iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -36]
    });
}

function initParkMarkers() {
    PARKS.forEach(park => {
        const m = L.marker([park.lat, park.lon], { icon: makeParkIcon(false) })
            .addTo(map)
            .bindPopup(`<b>${park.name}</b><br><span style="font-size:0.8em;color:#666">${park.district}</span><br><a href="/park/${park.id}">View details →</a>`);
        m.on('mouseover', () => m.openPopup());
        parkMarkers[park.id] = m;
    });
}

/* ─── WEATHER BANNER ─── */
function refreshWeatherBanner() {
    const el = document.getElementById('weather-banner-text');
    if (el && bambergWeather) el.textContent = `Bamberg right now: ${bambergWeather.temp}°C – ${bambergWeather.label}`;
}

/* ─── RADAR (4 conditions) ─── */
function drawRadar(canvas, conditions, active) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 22;
    ctx.clearRect(0, 0, W, H);
    const keys = CONDITION_KEYS, n = keys.length;
    const step = (Math.PI * 2) / n, start = -Math.PI / 2;
    const pt = (i, ratio) => ({ x: cx + Math.cos(start + i * step) * r * ratio, y: cy + Math.sin(start + i * step) * r * ratio });
    [0.25, 0.5, 0.75, 1].forEach(ratio => { ctx.beginPath(); keys.forEach((_, i) => { const p = pt(i, ratio); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.strokeStyle = 'rgba(90,107,82,0.15)'; ctx.lineWidth = 1; ctx.stroke(); });
    keys.forEach((_, i) => { const p = pt(i, 1); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y); ctx.strokeStyle = 'rgba(90,107,82,0.15)'; ctx.lineWidth = 1; ctx.stroke(); });
    ctx.beginPath(); keys.forEach((key, i) => { const p = pt(i, (conditions[key] || 0) / 10); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.fillStyle = 'rgba(122,182,72,0.2)'; ctx.fill(); ctx.strokeStyle = '#4a7c2f'; ctx.lineWidth = 1.5; ctx.stroke();
    active.forEach(key => { const i = keys.indexOf(key); if (i < 0) return; const v = (conditions[key] || 0) / 10, p = pt(i, v), ep = pt(i, 1); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ep.x, ep.y); ctx.strokeStyle = '#7ab648'; ctx.lineWidth = 2; ctx.stroke(); ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = '#4a7c2f'; ctx.fill(); });
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    keys.forEach((key, i) => { const p = pt(i, 1.3), on = active.has(key); ctx.fillStyle = on ? '#2d4a1e' : '#8a9b82'; ctx.font = (on ? 'bold ' : '') + '9px DM Sans, sans-serif'; ctx.fillText(CONDITION_LABELS[key], p.x, p.y); });
}

/* ─── SCORING ─── */
function parkScore(park) {
    if (!activeConditions.size) return null;
    let t = 0; activeConditions.forEach(k => { t += park.conditions[k] || 0; });
    return Math.round(t / activeConditions.size);
}

/* ─── RENDER ─── */
function renderAll() {
    const grid = document.getElementById('parks-grid');
    const empty = document.getElementById('empty-state');
    const fb = document.getElementById('filter-banner');
    const fbt = document.getElementById('filter-banner-text');
    if (!grid) return;

    let sorted = PARKS.map(p => ({ park: p, score: parkScore(p) }));
    if (activeConditions.size) {
        sorted.sort((a, b) => b.score - a.score);
        fbt.textContent = `Ranked by: ${[...activeConditions].map(k => CONDITION_LABELS[k]).join(', ')}`;
    } else {
        fbt.textContent = 'Showing all parks. Pick a condition to rank them.';
    }
    const visible = sorted.filter(({ score }) => !activeConditions.size || score >= 3);
    grid.innerHTML = '';
    if (!visible.length) { empty.classList.add('visible'); }
    else { empty.classList.remove('visible'); visible.forEach(({ park, score }) => renderCard(park, score, grid)); }
}

function renderCard(park, score, grid) {
    const card = document.createElement('a');
    card.className = 'park-card';
    card.href = `/park/${park.id}`;
    card.dataset.id = park.id;
    const badgeClass = score === null ? '' : score < 4 ? 'low' : score < 7 ? 'mid' : '';
    const pills = CONDITION_KEYS.map(key => {
        const val = park.conditions[key] || 0;
        const cls = val >= 7 ? 'good' : val <= 3 ? 'bad' : '';
        return `<span class="weather-pill ${cls}" title="${CONDITION_LABELS[key]}: ${val}/10">${conditionIcon(key)} ${CONDITION_LABELS[key]} ${val}/10</span>`;
    }).join('');
    const poiBadgesId = `poi-badges-${park.id}`;

    card.innerHTML = `
        <div class="park-header">
            <div>
                <div class="park-name">${park.name}</div>
                <div class="park-district">${park.district}</div>
            </div>
            ${score !== null ? `<div class="park-score-badge ${badgeClass}">${score}/10</div>` : ''}
        </div>
        <div class="park-radar radar-wrap"><canvas width="160" height="130" class="radar-canvas"></canvas></div>
        <div class="weather-pills">${pills}</div>
        <div class="park-poi"><div class="poi-row" id="${poiBadgesId}">
            <span class="poi-loading">Loading nearby places…</span>
        </div></div>`;

    drawRadar(card.querySelector('.radar-canvas'), park.conditions, activeConditions);
    grid.appendChild(card);

    fetchPOIs(park).then(poi => {
        const row = document.getElementById(poiBadgesId);
        if (!row) return;
        const html = Object.entries(poi).map(([cat, items]) => {
            if (!items.length) return '';
            const hidden = !activePoi.has(cat) ? 'hidden' : '';
            return `<span class="poi-badge ${cat} ${hidden}">${poiIcon(cat)} ${items.length} ${cat}</span>`;
        }).join('');
        row.innerHTML = html || '<span class="poi-loading">No POIs found nearby</span>';
    });
}

/* ─── FILTER BUTTONS ─── */
function syncPoiButtons() {
    document.querySelectorAll('.poi-filter-btn').forEach(b =>
        b.classList.toggle('active', activePoi.has(b.dataset.poi)));
}

function applyPoiVisibility() {
    document.querySelectorAll('.poi-badge').forEach(badge => {
        const cat = [...badge.classList].find(c => POI_COLORS[c]);
        if (cat) badge.classList.toggle('hidden', !activePoi.has(cat));
    });
}

function wireFilters() {
    document.getElementById('condition-filters').addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        const f = btn.dataset.filter;
        if (activeConditions.has(f)) { activeConditions.delete(f); btn.classList.remove('active'); }
        else { activeConditions.add(f); btn.classList.add('active'); }
        renderAll();
    });

    document.getElementById('poi-filters').addEventListener('click', e => {
        const btn = e.target.closest('.poi-filter-btn');
        if (!btn) return;
        const p = btn.dataset.poi;
        if (activePoi.has(p)) { activePoi.delete(p); btn.classList.remove('active'); }
        else { activePoi.add(p); btn.classList.add('active'); }
        setPoiCategories([...activePoi]);          // persist for the detail page
        applyPoiVisibility();
    });

    // POI distance slider
    const slider = document.getElementById('poi-radius');
    const label = document.getElementById('poi-radius-label');
    if (slider) {
        slider.value = getPoiRadius();
        if (label) label.textContent = `${slider.value} m`;
        slider.addEventListener('input', () => { if (label) label.textContent = `${slider.value} m`; });
        let t;
        slider.addEventListener('change', () => {
            clearTimeout(t);
            t = setTimeout(() => {
                setBatchRadius(parseInt(slider.value, 10));   // persist + force refetch
                const grid = document.getElementById('parks-grid');
                if (grid) grid.querySelectorAll('.poi-row').forEach(r => r.innerHTML = '<span class="poi-loading">Updating nearby places…</span>');
                fetchAllPOIs().then(renderAll);
            }, 250);
        });
    }

    document.getElementById('btn-reset').addEventListener('click', () => {
        activeConditions.clear();
        activePoi = new Set(POI_CATEGORIES);
        setPoiCategories([...activePoi]);
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        syncPoiButtons();
        renderAll();
    });
}

/* ─── BOOT ─── */
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    syncPoiButtons();          // reflect saved POI selection
    wireFilters();
    loadParks().then(() => {
        initParkMarkers();
        renderAll();                       // cards show immediately (with POI placeholders)
        fetchAllPOIs().then(renderAll);    // refill POI badges once loaded
        computeQuietness();                // quiet from roads (skipped if cache has it)
        loadAllParkTemps();
    });
});

document.addEventListener('header-weather-loaded', refreshWeatherBanner);
document.addEventListener('quietness-computed', () => renderAll());
