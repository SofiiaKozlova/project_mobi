/* ============================================================
   CoolPark Bamberg — common.js
   Shared logic loaded on EVERY page (loads first).
   ─────────────────────────────────────────────────────────────
   - Park data is fetched once from /api/parks (single source of
     truth = data/parks.json) and cached.
   - POI data: live from Overpass API (OpenStreetMap, no key).
   - Bus stops sharing a name are COMBINED into one entry.
   - Temperatures: Netatmo (via our backend) then Open-Meteo.
   - Quietness: auto-computed from road proximity.
   Page scripts call:  CP.loadParks().then(parks => { ... });
   ============================================================ */

/* ─── Conditions (the 4 we keep) ─── */
const CONDITION_LABELS = {
    shade: 'Shade',
    quiet: 'Quiet',
    benches: 'Benches',
    park_size: 'Park size'
};
const CONDITION_ICONS = {
    shade: '🌳', quiet: '🤫', benches: '🪑', park_size: '🏞️'
};
const CONDITION_KEYS = Object.keys(CONDITION_LABELS);

const POI_COLORS = {
    transit: '#4a86e8',
    food: '#e67e22',
    icecream: '#f4b183',
    sightseeing: '#27ae60',
    playground: '#e91e8c'
};

/* ─── Shared mutable state ─── */
let PARKS = [];
const poiCache = {};
const parkTempCache = {};
let bambergAvgTemp = null;
let allPoisLoaded = false;
let _poiFetchPromise = null;
let _parksPromise = null;

/* ============================================================
   PARK DATA — fetched once, cached
   ============================================================ */
function loadParks() {
    if (_parksPromise) return _parksPromise;
    _parksPromise = fetch('/api/parks')
        .then(r => r.json())
        .then(data => {
            PARKS = Array.isArray(data) ? data : [];
            return PARKS;
        })
        .catch(e => {
            console.error('Could not load parks:', e);
            PARKS = [];
            return PARKS;
        });
    return _parksPromise;
}

function getPark(id) {
    return PARKS.find(p => p.id === id);
}

/* ============================================================
   GEO / FORMAT HELPERS
   ============================================================ */
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000, toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distLabel(metres) {
    return metres < 50 ? 'in park'
         : metres < 1000 ? `${Math.round(metres)}m`
         : `${(metres / 1000).toFixed(1)}km`;
}

function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : s;
}

function conditionIcon(key) { return CONDITION_ICONS[key] || '•'; }
function poiIcon(cat) {
    return { transit: '🚌', food: '🍽️', icecream: '🍦', sightseeing: '🏛️', playground: '🛝' }[cat] || '•';
}

/* Raw fact label for a condition (shown on the detail page). */
function conditionFactLabel(park, key) {
    const f = park.facts || {};
    if (key === 'benches') return f.bench_count != null ? `${f.bench_count} benches` : null;
    if (key === 'park_size') return f.area_ha != null ? `${f.area_ha} ha` : null;
    return null;
}

/* ============================================================
   POI FETCH — Overpass (OpenStreetMap)
   ============================================================ */
const POI_CATEGORIES = ['transit', 'food', 'icecream', 'sightseeing', 'playground'];

// Overpass node selectors per category
const POI_SELECTORS = {
    transit:     ['["highway"="bus_stop"]', '["public_transport"="platform"]'],
    food:        ['["amenity"~"restaurant|cafe|biergarten"]'],
    icecream:    ['["amenity"="ice_cream"]', '["shop"="ice_cream"]'],
    sightseeing: ['["tourism"~"attraction|museum|viewpoint"]', '["historic"]'],
    playground:  ['["leisure"="playground"]']
};

/* ─── Shared POI preferences (persist across pages via localStorage) ─── */
const POI_RADIUS_DEFAULT = 400;
function getPoiRadius() {
    const v = parseInt(localStorage.getItem('cp_poi_radius'), 10);
    return Number.isFinite(v) ? v : POI_RADIUS_DEFAULT;
}
function setPoiRadius(m) { localStorage.setItem('cp_poi_radius', String(m)); }

function getPoiCategories() {
    try {
        const v = JSON.parse(localStorage.getItem('cp_poi_categories'));
        if (Array.isArray(v)) return v.filter(c => POI_CATEGORIES.includes(c));
    } catch (e) { /* ignore */ }
    return [...POI_CATEGORIES];           // default: all selected
}
function setPoiCategories(arr) {
    localStorage.setItem('cp_poi_categories', JSON.stringify(arr));
}

let OSM_RADIUS = getPoiRadius();          // batch radius (Explore page)

function buildBatchOverpassQuery() {
    const cats = [
        '["highway"="bus_stop"]',
        '["public_transport"="platform"]',
        '["amenity"~"restaurant|cafe|biergarten"]',
        '["amenity"="ice_cream"]',
        '["shop"="ice_cream"]',
        '["tourism"~"attraction|museum|viewpoint"]',
        '["historic"]',
        '["leisure"="playground"]'
    ];
    const stmts = [];
    for (const c of cats) {
        for (const p of PARKS) {
            stmts.push(`node${c}(around:${OSM_RADIUS},${p.lat},${p.lon})`);
        }
    }
    return `[out:json][timeout:30];(${stmts.join(';')};);out body;`;
}

function fetchAllPOIs() {
    if (allPoisLoaded) return Promise.resolve();
    if (_poiFetchPromise) return _poiFetchPromise;
    _poiFetchPromise = _doFetchAllPOIs();
    return _poiFetchPromise;
}

async function _doFetchAllPOIs() {
    const blank = () => ({ transit: [], food: [], icecream: [], sightseeing: [], playground: [] });
    try {
        const q = buildBatchOverpassQuery();
        const resp = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'data=' + encodeURIComponent(q)
        });
        const data = await resp.json();

        PARKS.forEach(p => { if (!poiCache[p.id]) poiCache[p.id] = blank(); });

        (data.elements || []).forEach(node => {
            const cat = classifyNode(node);
            if (!cat) return;
            let bestPark = null, bestDist = Infinity;
            PARKS.forEach(p => {
                const d = haversine(p.lat, p.lon, node.lat, node.lon);
                if (d < bestDist && d <= OSM_RADIUS) { bestDist = d; bestPark = p; }
            });
            if (!bestPark) return;
            const entry = { name: nodeName(node), dist: distLabel(Math.round(bestDist)), _dist: bestDist, lat: node.lat, lon: node.lon };
            if (cat === 'transit') { entry.lines = busLines(node); entry.rawName = (node.tags && node.tags.name) || ''; }
            poiCache[bestPark.id][cat].push(entry);
        });

        // Sort, COMBINE transit stops by name, cap at 3 per category
        PARKS.forEach(p => {
            const cache = poiCache[p.id];
            Object.keys(cache).forEach(cat => {
                cache[cat].sort((a, b) => a._dist - b._dist);
                if (cat === 'transit') cache[cat] = combineTransitStops(cache[cat]);
                cache[cat] = cache[cat].slice(0, 3).map(({ _dist, ...rest }) => rest);
            });
        });

        allPoisLoaded = true;
        console.log(`POIs loaded: ${(data.elements || []).length} nodes`);
    } catch (e) {
        console.warn('Batch POI fetch failed:', e);
        PARKS.forEach(p => { if (!poiCache[p.id]) poiCache[p.id] = blank(); });
        allPoisLoaded = true;
    }
}

/* ─── Combine bus stops that share a name into ONE entry ───
   OSM lists each platform/direction as its own node, so the same
   stop ("Bamberg Spinnerei") shows up 2-3 times at slightly
   different distances. We merge them: keep the nearest distance,
   union all served lines, and remember how many platforms there
   are (each platform is usually one direction of travel). */
function combineTransitStops(stops) {
    const groups = new Map();
    for (const s of stops) {
        const key = (s.rawName || s.name || '').trim().toLowerCase()
                        || `__unnamed_${s.lat},${s.lon}`;
        if (!groups.has(key)) {
            groups.set(key, {
                name: s.name,
                rawName: s.rawName,
                dist: s.dist,
                _dist: s._dist,
                lat: s.lat,
                lon: s.lon,
                lines: [...(s.lines || [])],
                platforms: 1
            });
        } else {
            const g = groups.get(key);
            g.platforms += 1;
            (s.lines || []).forEach(l => { if (!g.lines.includes(l)) g.lines.push(l); });
            if (s._dist < g._dist) { g._dist = s._dist; g.dist = s.dist; g.lat = s.lat; g.lon = s.lon; }
        }
    }
    // numeric-aware line sort: 901 before 9010, "N1" after numbers
    const out = [...groups.values()];
    out.forEach(g => g.lines.sort((a, b) => {
        const na = parseInt(a, 10), nb = parseInt(b, 10);
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        return String(a).localeCompare(String(b));
    }));
    out.sort((a, b) => a._dist - b._dist);
    return out;
}

function classifyNode(node) {
    const t = node.tags || {};
    if (t.highway === 'bus_stop' || t.public_transport === 'platform' || t.public_transport === 'stop_position')
        return 'transit';
    if (['restaurant', 'cafe', 'biergarten'].includes(t.amenity)) return 'food';
    if (t.amenity === 'ice_cream' || t.shop === 'ice_cream') return 'icecream';
    if (t.leisure === 'playground') return 'playground';
    if (t.tourism || t.historic) return 'sightseeing';
    return null;
}

function nodeName(node) {
    const t = node.tags || {};
    if (t.name) return t.name;
    if (t['name:de']) return t['name:de'];
    if (t['name:en']) return t['name:en'];
    if (t.historic && t.historic !== 'yes') return `${capitalize(t.historic)} (unnamed)`;
    if (t.tourism && t.tourism !== 'yes') return `${capitalize(t.tourism)} (unnamed)`;
    if (t.shop && t.shop !== 'yes') return `${capitalize(t.shop)} (unnamed)`;
    if (t.amenity) return `${capitalize(t.amenity)} (unnamed)`;
    if (t.leisure === 'playground') return 'Playground (unnamed)';
    if (t.highway === 'bus_stop') return 'Bus stop (unnamed)';
    return 'Unnamed place';
}

function busLines(node) {
    const ref = (node.tags || {}).route_ref || '';
    return ref ? ref.split(/[;,]/).map(s => s.trim()).filter(Boolean) : [];
}

function gmapsPoiUrl(name, lat, lon) {
    const q = name && !name.includes('(unnamed)') ? `${name}, Bamberg` : `${lat},${lon}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function fetchPOIs(park) {
    const blank = { transit: [], food: [], icecream: [], sightseeing: [], playground: [] };
    if (allPoisLoaded) return Promise.resolve(poiCache[park.id] || blank);
    return fetchAllPOIs().then(() => poiCache[park.id] || blank);
}

/* Change the Explore batch radius and force a refetch on next call. */
function setBatchRadius(metres) {
    OSM_RADIUS = metres;
    setPoiRadius(metres);
    allPoisLoaded = false;
    _poiFetchPromise = null;
    for (const k of Object.keys(poiCache)) delete poiCache[k];
}

/* ─── Per-park POI fetch (detail page) ───
   Queries ONLY the requested categories around one park, and keeps
   widening the radius (×1.6 each step, up to ~3 km) until at least one
   POI is found — so a park never shows an empty list. */
async function fetchPOIsForPark(park, { categories, radius } = {}) {
    categories = (categories && categories.length) ? categories : [...POI_CATEGORIES];
    let r = radius || getPoiRadius();
    const MAX_R = 3200;
    const blank = () => { const o = {}; categories.forEach(c => o[c] = []); return o; };

    while (true) {
        const result = await _fetchParkOnce(park, categories, r);
        const total = Object.values(result).reduce((s, a) => s + a.length, 0);
        if (total > 0 || r >= MAX_R) {
            result._radiusUsed = r;
            return result;
        }
        r = Math.min(MAX_R, Math.round(r * 1.6));
    }
}

async function _fetchParkOnce(park, categories, radius) {
    const out = {}; categories.forEach(c => out[c] = []);
    const selectors = [];
    categories.forEach(cat => (POI_SELECTORS[cat] || []).forEach(sel =>
        selectors.push(`node${sel}(around:${radius},${park.lat},${park.lon})`)));
    const q = `[out:json][timeout:30];(${selectors.join(';')};);out body;`;
    try {
        const resp = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'data=' + encodeURIComponent(q)
        });
        const data = await resp.json();
        (data.elements || []).forEach(node => {
            const cat = classifyNode(node);
            if (!cat || !categories.includes(cat)) return;
            const d = haversine(park.lat, park.lon, node.lat, node.lon);
            if (d > radius) return;
            const entry = { name: nodeName(node), dist: distLabel(Math.round(d)), _dist: d, lat: node.lat, lon: node.lon };
            if (cat === 'transit') { entry.lines = busLines(node); entry.rawName = (node.tags && node.tags.name) || ''; }
            out[cat].push(entry);
        });
        categories.forEach(cat => {
            out[cat].sort((a, b) => a._dist - b._dist);
            if (cat === 'transit') out[cat] = combineTransitStops(out[cat]);
            out[cat] = out[cat].slice(0, 3).map(({ _dist, ...rest }) => rest);
        });
    } catch (e) {
        console.warn('Per-park POI fetch failed:', e);
    }
    return out;
}

/* ============================================================
   LIVE TEMPERATURE  (Netatmo via backend → Open-Meteo fallback)
   ============================================================ */
async function loadAllParkTemps() {
    try {
        try {
            const resp = await fetch('/api/microclimate?lat=49.89&lon=10.89&radius=8000');
            if (resp.ok) {
                const { stations } = await resp.json();
                if (stations && stations.length) {
                    PARKS.forEach(p => {
                        let best = null, bestD = Infinity;
                        stations.forEach(s => {
                            const d = haversine(p.lat, p.lon, s.lat, s.lon);
                            if (d < bestD) { bestD = d; best = s; }
                        });
                        if (best) parkTempCache[p.id] = best.temperature;
                    });
                }
            }
        } catch (e) { /* Netatmo unavailable → Open-Meteo */ }

        const missing = PARKS.filter(p => parkTempCache[p.id] === undefined);
        if (missing.length) {
            const lats = missing.map(p => p.lat).join(',');
            const lons = missing.map(p => p.lon).join(',');
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current_weather=true&timezone=Europe/Berlin`;
            const data = await (await fetch(url)).json();
            const results = Array.isArray(data) ? data : [data];
            results.forEach((d, i) => {
                if (i < missing.length) parkTempCache[missing[i].id] = d.current_weather?.temperature ?? null;
            });
        }
    } catch (e) {
        console.warn('Batch temp fetch failed, trying individual:', e);
        await Promise.all(PARKS.map(async p => {
            if (parkTempCache[p.id] !== undefined) return;
            try {
                const d = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current_weather=true`)).json();
                parkTempCache[p.id] = d.current_weather?.temperature ?? null;
            } catch (e2) { parkTempCache[p.id] = null; }
        }));
    }

    const valid = PARKS.map(p => parkTempCache[p.id]).filter(t => t != null);
    if (valid.length) bambergAvgTemp = valid.reduce((a, b) => a + b, 0) / valid.length;
    document.dispatchEvent(new CustomEvent('temps-loaded'));
}

async function fetchParkTemp(park) {
    if (parkTempCache[park.id] !== undefined) return parkTempCache[park.id];
    await new Promise(r => setTimeout(r, 1500));
    return parkTempCache[park.id] ?? null;
}

/* ─── Live rain for one park (detail page) ─── */
const rainCache = {};
function getBerlinHourISO() {
    return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 13).replace(' ', 'T');
}
async function fetchRain(lat, lon) {
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (rainCache[key]) return rainCache[key];
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=precipitation&hourly=precipitation,precipitation_probability&timezone=Europe/Berlin&forecast_days=1`;
        const data = await (await fetch(url)).json();
        const rain = data.current?.precipitation ?? 0;
        const hour = getBerlinHourISO();
        const idx = (data.hourly?.time || []).findIndex(t => t.startsWith(hour));
        const prob = idx >= 0 ? data.hourly.precipitation_probability[idx] : 0;
        const r = { rain, prob };
        rainCache[key] = r;
        return r;
    } catch (e) { console.warn('Rain fetch failed:', e); return { rain: 0, prob: 0 }; }
}

/* ============================================================
   AUTOMATED QUIETNESS  (road proximity → 1-10)
   ============================================================ */
async function computeQuietness() {
    // If the OSM cache already provides Quiet, don't override it client-side.
    if (PARKS.some(p => (p.data_source || {}).quiet === 'osm')) return;
    try {
        const q = `[out:json][timeout:15];way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|secondary)$"](49.83,10.78,49.96,10.99);out geom;`;
        const data = await (await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`)).json();
        const roads = data.elements || [];
        PARKS.forEach(park => {
            let minDist = Infinity;
            roads.forEach(way => {
                if (!way.geometry) return;
                for (let i = 0; i < way.geometry.length; i += 3) {
                    const pt = way.geometry[i];
                    const d = haversine(park.lat, park.lon, pt.lat, pt.lon);
                    if (d < minDist) minDist = d;
                }
            });
            let score;
            if (minDist < 40) score = 1;
            else if (minDist < 80) score = Math.round(2 + (minDist - 40) / 40);
            else if (minDist < 200) score = Math.round(4 + ((minDist - 80) / 120) * 2);
            else if (minDist < 400) score = Math.round(7 + ((minDist - 200) / 200));
            else score = Math.min(10, Math.round(8 + (minDist - 400) / 300));
            if (park.conditions) park.conditions.quiet = Math.min(10, Math.max(1, score));
        });
        document.dispatchEvent(new CustomEvent('quietness-computed'));
    } catch (e) { console.warn('Quietness computation failed — keeping seed scores:', e); }
}

/* ============================================================
   HEADER WEATHER CHIP  (every page)
   ============================================================ */
function wmoLabel(code) {
    if (code === 0) return 'Clear sky ☀️';
    if (code <= 3) return 'Partly cloudy ⛅';
    if (code <= 49) return 'Foggy 🌫️';
    if (code <= 67) return 'Rainy 🌧️';
    if (code <= 77) return 'Snowy ❄️';
    if (code <= 82) return 'Showers 🌦️';
    if (code <= 99) return 'Thunderstorm ⛈️';
    return 'Variable 🌤️';
}

let bambergWeather = null;
async function loadHeaderWeather() {
    try {
        const data = await (await fetch('https://api.open-meteo.com/v1/forecast?latitude=49.89&longitude=10.89&current_weather=true')).json();
        const { temperature: temp, weathercode: code } = data.current_weather;
        bambergWeather = { temp, code, label: wmoLabel(code) };
        const chip = document.getElementById('header-weather');
        if (chip) chip.textContent = `🌤️ ${temp}°C`;
        document.dispatchEvent(new CustomEvent('header-weather-loaded'));
    } catch (e) { console.warn('Header weather failed:', e); }
}

// Header weather runs on every page automatically.
document.addEventListener('DOMContentLoaded', loadHeaderWeather);
