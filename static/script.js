/* ============================================================
   AUTOMATION NOTE
   ─────────────────────────────────────────────────────────────
   POI data (bus stops, restaurants, shops near each park) is
   fetched live from the Overpass API — the free query engine
   for OpenStreetMap. No API key needed.
 
   Weather SCORES (shade, breeze etc.) can't be fully automated
   because they reflect the park's physical character (tree cover,
   openness, shelter from buildings). They are set manually below.
   However, the live temperature banner IS automated via Open-Meteo.
 
   To add a new park: add one object to the PARKS array with:
     id, name, district, desc, lat, lon, weather{}
   The POIs will be fetched automatically from OpenStreetMap.
   ============================================================ */
 
/* ============================================================
   DATA — parks with manually-set weather scores
   ============================================================ */
const WEATHER_LABELS = {
    shade: 'Shade',
    breeze: 'Breeze',
    rain_shelter: 'Rain shelter',
    warmth: 'Warmth',
    quiet: 'Quiet',
    open_space: 'Open space'
};

const POI_COLORS = {
    transit: '#4a86e8',
    food: '#e67e22',
    shopping: '#9b59b6',
    sightseeing: '#27ae60',
    playground: '#e91e8c'
};

const PARKS = [
    {
        id: 'hain',
        name: 'Hain',
        district: 'Inselstadt - south, along the Regnitz',
        desc: "Bamberg's beloved 48-hectare riverside park in the south of the Inselstadt. Ancient plane trees provide dense canopy, making it ideal on hot summer days. Contains a botanical garden, a pond, and the Leinritt towpath along the Regnitz.",
        lat: 49.8880, lon: 10.8880,
        weather: {shade: 9, breeze: 6, rain_shelter: 3, warmth: 4, quiet: 7, open_space: 6}
    },
    {
        id: 'erba',
        name: 'ERBA-Park',
        district: 'Gaustadt - north, former Landesgartenschau 2012',
        desc: " A 13.5-hectare park on the northern tip of the Regnitz Island, built on the former ERBA cotton-mill site for the 2012 Bavarian State Garden Show. Five playgrounds, open lawns, a sculpture park, and breezy waterfront on both Regnitz arms.",
        lat: 49.9012, lan: 10.8798,
        weather: {shade: 4, breeze: 9, rain_shelter: 2, warmth: 6, quiet: 5, open_space: 10}
    },
    {
        id: 'rosengarten',
        name: 'Rosengarten',
        district: 'Bergstadt - Neue Residenz courtyard',
        desc: "A baroque rose garden in the inner courtyard of the Neue Residenz, redesigned in 1733 by Balthasar Neumann. Around 4,500 roses in 48 varieties, framed by linden trees and box hedges. Stunning views over the Altstadt and Kloster Michelsberg.",
        lat: 49.8991, lon: 10.8930,
        weather: {shade: 5, breeze: 7, rain_shelter: 2, warmth: 8, quiet: 8, open_space: 4}
    },
    {
        id: 'michelsberg',
        name: 'Michelsberg gardens',
        district: 'Bergstadt - St. Michael monastery hill',
        desc: "The terraced gardens of the former Benedictine monastery of St. Michael offer sweeping views across the city's red rooftops and the cathedral. The walled garden is quiet and partly shaded, with a herb garden and old monastery orchards.",
        lat: 49.8970, lon: 10.8895,
        weather: {shade: 6, breeze: 7, rain_shelter: 4, warmth: 6, quiet: 9, open_space: 5}
    },
    {
        id: 'volkspark',
        name: 'Volkspark (Nordpark)',
        district: 'Gaustadt - northwest',
        desc: "Bamberg's newest large green space, developed north of the ERBA-Park. Extensive sports and play facilities, open meadows, and good cycling connections along the Regnitz. Popular with families and sports clubs.",
        lat: 49.9060, lon: 10.8820,
        weather: {shade: 3, breeze: 8, rain_shelter: 2, warmth: 7, quiet: 5, open_space: 9}
    },
    {
        id: 'domberg',
        name: 'Domplatz & cathedral gardens',
        district: 'Bergstadt - cathedral hill',
        desc: "The open square and green terraces around Bamberg's UNESCO-listed cathedral. Well-maintained paths wind past hedges with views over the Regnitz valley. Partially sheltered from wind by the old episcopal buildings.",
        lat: 49.8988, lon: 10.8921,
        weather: {shade: 2, breeze: 9, rain_shelter: 1, warmth: 8, quiet: 7, open_space: 9}
    },
    {
        id: 'leinritt',
        name: 'Leinritt meadows',
        district: 'Along the Regnitz - north park towpath',
        desc: "The historic Leinritt towpath runs along the Regnitz north of the Hain. Flat, open meadows loved by cyclists, joggers and kite-flyers. Virtually no shade, but a constant river breeze and clear views of Klein-Venedig.",
        lat: 49.8930, lon: 10.8840,
        weather: {shade: 2, breeze: 9, rain_shelter: 1, warmth: 8, quiet: 7, open_space: 9}
    },
    {
        id: 'hauptsmoor',
        name: 'Hauptsmoorwald',
        distirct: 'East Bamberg - city forest',
        desc: "Bamberg's extensive city forest east of the centre. Tall pines and oaks create almost total canopy - cool even in high summer. Many walking and cycling trails, picnic spots, and a forester's lodge.",
        lat: 49.8920, lon: 10.9310,
        weather: {shade: 10, breeze: 3, rain_shelter: 6, warmth: 2, quiet: 9, open_space: 3}
    },
    {
        id: 'jacobsberg',
        name: 'Jakobsberg & vineyards',
        district: 'West Bamberg - hillside vienyard paths',
        desc: "South-facing hillside vineyard paths west of the old town. Sunny and warm with a constant gentle breeze from the exposed slope. Terraced trails lead up towards the Altenburg fortress with panoramic views.",
        lat: 49.8945, lon: 10.8791,
        weather: {shade: 3, breeze: 7, rain_shelter: 2, warmth: 10, quiet: 8, open_space: 7}
    },
    {
        id: 'seehof',
        name: 'Schlosspark Seehof',
        district: 'Memmelsdorf - 4 km north of Bamberg',
        desc: "A 21.9-hectare baroque palace park, once one of Germany's most famous rococo gardens. The Bavarian State owns it and has restored the cascades and parterres. Open April-October. Classical concerts held here in summer.",
        lat: 49.9340, lon: 10.9050,
        weather: {shade: 6, breeze: 5, rain_shelter: 3, warmth: 7, quiet: 9, open_space: 7}
    }
];

/* STATE */
let activeWeather = new Set();
let activePoi = new Set(['transit', 'food', 'shopping', 'sightseeing', 'playground']);
let compareSet = new Set();
let openDetailId = null;
let parkMarkers = {};

/* MAP SETUP */
const map = L.map('map').setView([49.8988, 10.8956], 14);

L.titleLayer('https://title.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="hhtps://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

function makeParkIcon(active = false) {
    const bg = active ? '#2d4a1e' : '#4a7c2f';
    return L.divIcon({
        className: '',
        html: `<div style="
            width:34px;height:34px;
            background:${bg};
            border:3px solid white;
            border-radius:50% 50% 50% 0;
            transform:rotate(-45deg);
            box-shadow:0 2px 8px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 34],
        popupAnchor: [0, -36]
    });
}

function initParkMarkers() {
    PARKS.forEach(park => {
        const marker = L.marker([park.lat, park.lon], {icon: makeParkIcon(false)})
            .addTo(map)
            .bindTooltip(`<b>${park.name}</b><br><span style="font-size:0.8em;color#666">${park.district}</span>`, {
                direction: 'top', offset: [0, -36], className: 'park-tooltip'
            });
        marker.on('click', () => {
            openDetail(park.id);
            map.flyTo([park.lat, park.lon], 16, {duration: 0.8});
        });
        parkMarkers[park.id] = marker;
    });
}

function setActiveMarker(id) {
    Object.entries(parkMarkers).forEach(([pid, m]) => m.setIcon(makeParkIcon(pid === id)));
}

/* live weather banner - open-meteo */
async function loadWeather() {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=49.89&longitude=10.89&current_weather=true';
    try {
        const data = await (await fetch(url)).json();
        const { temperature: temp, weathercode: code } = data.current_weather;
        document.getElementById('score-banner-text').innerText = `Bamberg right now: ${temp}°C - ${wmoLabel(code)}`;
        document.getElementById('score-banner').classList.add('visible');
    } catch (e) {
        console.error('Weather error:', e);
    }
}

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

/* LIVE RAIN OVERLAY - open-meteo hourly */
function getBerlinHour() {
    return new Date().toLocaleString('sv-SE', {timeZone: 'Europe/Berlin'}).slice(0,13) + ':00:00';
}

const RAIN_POINTS = [
    {name: 'Centre', lat: 49.890, lon: 10.890},
    {name: 'North', lat: 49.910, lon: 10.890},
    {name: 'South', lat: 49.870, lon: 10.890},
    {name: 'West', lat: 49.890, lon: 10.860},
    {name: 'East', lat: 49.890, lon: 10.920}
];

async function loadRainMap () {
    const hour = getBerlinHour();
    for (const pt of RAIN_POINTS) {
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${pt.lat}&longitude=${pt.lon}&hourly=precipitation,precipitation_probability&timezone=Europe/Berlin`;
            const data = await (await fetch(url)).json();
            const idx = data.hourly.time.indexOf(hour);
            const rain = idx >= 0 ? data.hourly.precipitation[idx] : 0;
            const prob = idx >= 0 ? data.hourly.precipitation_probability[idx] : 0;
            L.circleMarker([pt.lat, pt.lon], {
                radius: 14, weight: 2,
                color: 'white',
                fillColor: (rain > 0.1 || prob > 50) ? '#4a86e8' : '#7ab648',
                fillOpacity: 0.5
            }).addTo(map).bindPopup(`<b>${pt.name}</b><br>${rain} mm · ${prob}% chance`);
        } catch(e) {console.error('Rain error:', e);}
    }
}

/* ============================================================
   AUTOMATED POI FETCH — Overpass API (OpenStreetMap, no key)
 
   For each park we query OSM for real nearby:
   - Bus stops      (highway=bus_stop)
   - Restaurants / cafés (amenity=restaurant|cafe|biergarten)
   - Shops          (shop=*)
   - Sights         (tourism=attraction|museum|viewpoint|historic)
   - Playgrounds    (leisure=playground)
 
   Results are ranked by distance and capped at 3 per category.
   ============================================================ */
const OSM_RADIUS = 400; //metres around park centre

function overpassUrl(lat, lon) {
    const r = OSM_RADIUS;
    const q = `
    [out:json][timeout:10];
    (
        node["highway"="bus_stop"](around:${r},${lat},${lon});
        node["amenity"~"restaurant|cafe|biergarten"](around:${r},${lat},${lon});
        node["shop"](around:${r},${lat},${lon});
        node["tourism"~"attraction|museum|viewpoint"](around:${r},${lat},${lon});
        node["historic"](around:${r},${lat},${lon});
        node["leisure"="playground"](around:${r},${lat},${lon});
    );
    out body;`;
    return `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`;
}

function distLabel(metres) {
    return metres < 50 ? 'in park' : metres < 1000 ? `${Math.round(metres)}m` : `${(metres/1000).toFixed(1)}km`;
}

function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000, toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function classifyNode(node) {
    const t = node.tag || {};
    if (t.highway === 'bus_stop') return 'transit';
    if (['restaurant','cafe','biergarten'].includes(t.amenity)) return 'food';
    if (t.shop) return 'shopping';
    if (t.leisure === 'playground') return 'playground';
    if (t.tourism || t.historic) return 'sightseeing';
    return null;
}

function nodeName(node) {
    const t = node.tags || {};
    return t.name || t['name:en'] || t.amenity || t.shop || t.tourism || t.historic || 'Unnamed';
}

// Cache so we don't re-fetch when detail panel re-opens
const poiCache = {};

async function fetchPOIs(park){
    if (poiCache[park.id]) return poiCache[park.id];
    const poi = {transit: [], food: [], shopping: [], sightseeing: [], playground: []};
    try {
        const res = await fetch(overpassUrl(park.lat, park.lon));
        const data = await res.json();
        data.elements.forEach(node => {
            const cat = classifyNode(node);
            if (!cat) return;
            const dist = Math.round(haversine(park.lat, park.lon, node.lat, node.lon));
            poi[cat].push({name: nodeName(node), dist: distLabel(dist), _dist: dist});
        });

        // sort by distance, keep top 3 per category
        Object.keys(poi).forEach(cat => {
            poi[cat].sort((a,b) => a._dist - b._dist);
            poi[cat] = poi[cat].slice(0,3).map(({name, dist}) => ({name, dist}));
        });
    } catch (e) {
        console.warn(`POI fetch failed for ${park.name}:`, e);
    }

    poiCache[park.id] = poi;
    return poi;
}

/* HELPERS */
function weatherIcon(key) {
    return { shade:'🌳', breeze:'💨', rain_shelter:'☔', warmth:'☀️', quiet:'🤫', open_space:'🏞️' }[key] || '•';
}

function poiIcon(cat) {
    return { transit:'🚌', food:'🍽️', shopping:'🛍️', sightseeing:'🏛️', playground:'🛝' }[cat] || '•';
}

/* RADAR CHART */
function drawRadar(canvas, weatherData, activeFilters) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W/2, cy = H/2, r = Math.min(W,H)/2 -22;
    ctx.clearRect(0,0,W,H);
    const keys = Object.keys(WEATHER_LABELS);
    const n = keys.length;
    const step = (Math.PI*2)/n, start = -Math.PI/2;
    const pt = (i, ratio) => ({
        x: cx + Math.cos(start + i*step)*r*ratio,
        y: cy + Math.sin(start + i*step)*r*ratio
    });

    // Grid rings
    [0.25,0.5,0.75,1].forEach(ratio => {
        ctx.beginPath();
        keys.forEach((_, i) => {const p=pt(i, ratio); i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});
        ctx.closePath(); ctx.strokeStyle='rgba(90,107,82,0.15)'; ctx.lineWidth=1; ctx.stroke();
    });

    // Spokes
    keys.forEach((_,i) => {
        const p=pt(i,1); ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(p.x,p.y);
        ctx.strokeStyle='rgba(90,107,82,0.15)'; ctx.lineWidth=1; ctx.stroke();
    });

    // Data polygon
    ctx.beginPath();
    keys.forEach((key,i) => {const p=pt(i,(weatherData[key]||0)/10); i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});
    ctx.closePath(); ctx.fillStyle='rgba(122,182,72,0.2)'; ctx.fill();
    ctx.strokeStyle='#4a7c2f'; ctx.lineWidth=1.5; ctx.stroke();

    // Active filter highlights
    activeFilters.forEach(key => {
        const i = keys.indexOf(key); if(i<0) return;
        const v=(weatherdata[key]||0)/10, p=pt(i,v), ep=pt(i,1);
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(ep.x,ep.y);
        ctx.strokeStyle='#7ab648'; ctx.lineWidth=2; ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2); ctx.fillStyle='#4a7c2f'; ctx.fill();
    });

    // Labels
    ctx.textAlign='center'; ctx.textBaseline='middle';
    keys.forEach((key,i) => {
        const p=pt(i,1.28), active=activeFilters.has(key);
        ctx.fillStyle=active?'#2d4a1e':'#8a9b82';
        ctx.font=(active?'bold ':'')+'9px DM Sans, sans-serif';
        ctx.fillText(WEATHER_LABELS[key],p.x,p.y);
    });
}

/* //api
//This function fetches the current temperature for Bamberg (center) and displays it in the banner on the page.
async function loadWeather() {
    const lat = 49.89;
    const lon = 10.89;

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;

    try {
        const res = await fetch(url);
        const data = await res.json();

        const temp = data.current_weather.temperature;


        document.getElementById("score-banner-text").innerText =
            `Current temperature in Bamberg: ${temp}°C`;

        document.getElementById("score-banner").classList.add("visible");
    } catch (errordydydydududu) {
        console.error(errordydydydududu);
    }
}


//coordinate of our city
const bamberg = [49.89, 10.89];
const map = L.map("map").setView(bamberg, 13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
}).addTo(map);
//locations
const points = [
    { name: "Center", lat: 49.89, lon: 10.89 },
    { name: "North", lat: 49.905, lon: 10.89 },
    { name: "South", lat: 49.875, lon: 10.89 },
    { name: "West", lat: 49.89, lon: 10.865 },
    { name: "East", lat: 49.89, lon: 10.915 }
];
//This function gets the current time in the Berlin timezone and formats it to match the time format used by the Open-Meteo API.
//  It allows to find the correct hourly weather data for the current hour.
function getBerlinCurrentHour() {
    const berlinTime = new Date().toLocaleString("sv-SE", {
        timeZone: "Europe/Berlin"
    });
    return berlinTime.slice(0, 13) + ":00:00";
}
//This function fetches rain data for multiple locations and displays them on the map as colored markers 
// to show where it is raining and where it is not.
async function loadRainMap() {
    const currentHour = getBerlinCurrentHour();

    for (const point of points) {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lon}&hourly=precipitation,precipitation_probability&timezone=Europe/Berlin`;

        try {
            const res = await fetch(url);
            const data = await res.json();

            const index = data.hourly.time.indexOf(currentHour);

            const rain = index >= 0 ? data.hourly.precipitation[index] : 0;
            const prob = index >= 0 ? data.hourly.precipitation_probability[index] : 0;

            const isRain = rain > 0.1 || prob > 50;
            const color = isRain ? "blue" : "green";

            L.circleMarker([point.lat, point.lon], {
                radius: 11,
                color: color,
                fillColor: color,
                fillOpacity: 0.7,
                weight: 3
            })
            .addTo(map)
            .bindPopup(`<b>${point.name}</b><br>Rain: ${rain} mm<br>Chance: ${prob}%`);

        } catch (lol) {
            console.error("Rain map error:", lol);
        }
    }
} */





//functions
initParkmarkers();
loadWeather();
loadRainMap();
renderAll();