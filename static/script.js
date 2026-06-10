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
   CoolPark Bamberg — main application logic
   ─────────────────────────────────────────────────────────────
   POI data: live from Overpass API (OpenStreetMap, no key)
   Weather:  live from Open-Meteo (no key)
   Rain:     per-park from Open-Meteo current+hourly (no key)
   Quietness: auto-computed from Overpass road proximity (no key)
   Bus lines: OSM route_ref tags + VGN deep link (no key)
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
    icecream: '#f4b183',
    sightseeing: '#27ae60',
    playground: '#e91e8c'
};

const PARKS = [
    {
        id: 'hain',
        name: 'Hain',
        district: 'Inselstadt - south, along the Regnitz',
        desc: "Bamberg's beloved 48-hectare riverside park in the south of the Inselstadt. Ancient plane trees provide dense canopy, making it ideal on hot summer days. Contains a botanical garden, a pond, and the Leinritt towpath along the Regnitz.",
        lat: 49.8767, lon: 10.9029,
        weather: {shade: 9, breeze: 6, rain_shelter: 3, warmth: 4, quiet: 7, open_space: 6}
    },
    {
        id: 'erba',
        name: 'ERBA-Park',
        district: 'Gaustadt - north, former Landesgartenschau 2012',
        desc: " A 13.5-hectare park on the northern tip of the Regnitz Island, built on the former ERBA cotton-mill site for the 2012 Bavarian State Garden Show. Five playgrounds, open lawns, a sculpture park, and breezy waterfront on both Regnitz arms.",
        lat: 49.9013, lon: 10.8794,
        weather: {shade: 4, breeze: 9, rain_shelter: 2, warmth: 6, quiet: 5, open_space: 10}
    },
    {
        id: 'rosengarten',
        name: 'Rosengarten',
        district: 'Bergstadt - Neue Residenz courtyard',
        desc: "A baroque rose garden in the inner courtyard of the Neue Residenz, redesigned in 1733 by Balthasar Neumann. Around 4,500 roses in 48 varieties, framed by linden trees and box hedges. Stunning views over the Altstadt and Kloster Michelsberg.",
        lat: 49.8915, lon: 10.8830,
        weather: {shade: 5, breeze: 7, rain_shelter: 2, warmth: 8, quiet: 8, open_space: 4}
    },
    {
        id: 'michelsberg',
        name: 'Michelsberg gardens',
        district: 'Bergstadt - St. Michael monastery hill',
        desc: "The terraced gardens of the former Benedictine monastery of St. Michael offer sweeping views across the city's red rooftops and the cathedral. The walled garden is quiet and partly shaded, with a herb garden and old monastery orchards.",
        lat: 49.8932, lon: 10.8775,
        weather: {shade: 6, breeze: 7, rain_shelter: 4, warmth: 6, quiet: 9, open_space: 5}
    },
    {
        id: 'volkspark',
        name: 'Volkspark (Nordpark)',
        district: 'Gaustadt - northwest',
        desc: "Bamberg's newest large green space, developed north of the ERBA-Park. Extensive sports and play facilities, open meadows, and good cycling connections along the Regnitz. Popular with families and sports clubs.",
        lat: 49.9082, lon: 10.8791,
        weather: {shade: 3, breeze: 8, rain_shelter: 2, warmth: 7, quiet: 5, open_space: 9}
    },
    {
        id: 'domberg',
        name: 'Domplatz & cathedral gardens',
        district: 'Bergstadt - cathedral hill',
        desc: "The open square and green terraces around Bamberg's UNESCO-listed cathedral. Well-maintained paths wind past hedges with views over the Regnitz valley. Partially sheltered from wind by the old episcopal buildings.",
        lat: 49.8908, lon: 10.8825,
        weather: {shade: 2, breeze: 9, rain_shelter: 1, warmth: 8, quiet: 7, open_space: 9}
    },
    {
        id: 'leinritt',
        name: 'Leinritt meadows',
        district: 'Along the Regnitz - north park towpath',
        desc: "The historic Leinritt towpath runs along the Regnitz north of the Hain. Flat, open meadows loved by cyclists, joggers and kite-flyers. Virtually no shade, but a constant river breeze and clear views of Klein-Venedig.",
        lat: 49.8850, lon: 10.8930,
        weather: {shade: 2, breeze: 9, rain_shelter: 1, warmth: 8, quiet: 7, open_space: 9}
    },
    {
        id: 'hauptsmoor',
        name: 'Hauptsmoorwald',
        district: 'East Bamberg - city forest',
        desc: "Bamberg's extensive city forest east of the centre. Tall pines and oaks create almost total canopy - cool even in high summer. Many walking and cycling trails, picnic spots, and a forester's lodge.",
        lat: 49.8870, lon: 10.9460,
        weather: {shade: 10, breeze: 3, rain_shelter: 6, warmth: 2, quiet: 9, open_space: 3}
    },
    {
        id: 'jakobsberg',
        name: 'Jakobsberg & vineyards',
        district: 'West Bamberg - hillside vineyard paths',
        desc: "South-facing hillside vineyard paths west of the old town. Sunny and warm with a constant gentle breeze from the exposed slope. Terraced trails lead up towards the Altenburg fortress with panoramic views.",
        lat: 49.8946, lon: 10.8758,
        weather: {shade: 3, breeze: 7, rain_shelter: 2, warmth: 10, quiet: 8, open_space: 7}
    },
    {
        id: 'seehof',
        name: 'Schlosspark Seehof',
        district: 'Memmelsdorf - 4 km north of Bamberg',
        desc: "A 21.9-hectare baroque palace park, once one of Germany's most famous rococo gardens. The Bavarian State owns it and has restored the cascades and parterres. Open April-October. Classical concerts held here in summer.",
        lat: 49.9316, lon: 10.9522,
        weather: {shade: 6, breeze: 5, rain_shelter: 3, warmth: 7, quiet: 9, open_space: 7}
    },
    {
        id: 'altenburg', 
        name: 'Altenburg castle park',
        district: 'West Bamberg – Altenburg hill, 386 m',
        desc: "The wooded grounds around Bamberg's medieval Altenburg fortress, perched on the highest of the city's seven hills. Shaded forest paths wind up to breathtaking panoramic views over the Regnitz valley and the Steigerwald.",
        lat: 49.8836, lon: 10.8625,
        weather: {shade:8, breeze:9, rain_shelter:5, warmth:4, quiet:10, open_space:4}
    },
    {
        id: 'stephansberg', 
        name: 'Stephansberg vineyard terraces',
        district: 'Bergstadt – terraced southeast hillside',
        desc: "South-facing vineyard terraces on the Stephansberg slope above the old town. Quiet stepped paths between historic wine cellars and the Stephanskirche, with sun-drenched benches and far-reaching views toward the Hauptsmoorwald.",
        lat: 49.8895, lon: 10.8990,
        weather: {shade:3, breeze:6, rain_shelter:2, warmth:9, quiet:8, open_space:5}
    },
    {
        id: 'amkranen', 
        name: 'Am Kranen promenade',
        district: 'Inselstadt – riverfront promenade',
        desc: "The lively riverside promenade along the Regnitz between the Kettenbrücke and the Markusbrücke. Lined with willows and benches, it offers views across to the old fishermen's houses of Klein-Venedig. Popular with students and evening strollers.",
        lat: 49.8923, lon: 10.8865,
        weather: {shade:4, breeze:8, rain_shelter:1, warmth:7, quiet:5, open_space:7}
    }
];

/* STATE */
let activeWeather = new Set();
let activePoi = new Set([
    'transit',
    'food',
    'icecream',
    'sightseeing',
    'playground'
]);
let compareSet = new Set();
let openDetailId = null;
let parkMarkers = {};
let userLocationMarker = null;
let currentPoiCircles  = [];

/* MAP SETUP */

// Restrict the map to the Bamberg area
const mapBounds = L.latLngBounds(
    [49.833, 10.825], // Southwest corner (below Babenberger Viertel)
    [49.972, 11.100]  // Northeast corner (Kemmern area)
);

const map = L.map('map', {
    center: [49.8988, 10.8956],
    zoom: 14,
    minZoom: 12,
    maxZoom: 19,

    // Prevent users from dragging outside the defined area
    maxBounds: mapBounds,
    maxBoundsViscosity: 1.0
});

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

/* Locate-me button */
const locateControl = L.control({position: 'topleft'});
locateControl.onAdd = function() {
    const c = L.DomUtil.create('div','leaflet-bar leaflet-control');
    const b = L.DomUtil.create('a','',c);
    b.href='#'; b.title='Show my location'; b.innerHTML='📍';
    Object.assign(b.style, {width:'34px',height:'34px',lineHeight:'34px',textAlign:'center',fontSize:'18px',background:'white',cursor:'pointer'});
    L.DomEvent.disableClickPropagation(c);
    L.DomEvent.on(b,'click',function(e){
        L.DomEvent.stop(e);
        if(!navigator.geolocation){alert('Geolocation not supported');return;}
        b.style.opacity='0.5';
        navigator.geolocation.getCurrentPosition(pos=>{
            b.style.opacity='1';
            const ll=[pos.coords.latitude,pos.coords.longitude];
            if(userLocationMarker) map.removeLayer(userLocationMarker);
            const icon = L.divIcon({className:'',html:`<div style="width:18px;height:18px;background:#4a86e8;border:3px solid white;border-radius:50%;box-shadow:0 0 0 4px rgba(74,134,232,0.25)"></div>`,iconSize:[18,18],iconAnchor:[9,9]});
            userLocationMarker = L.marker(ll,{icon,zIndexOffset:1000}).addTo(map).bindPopup('You are here');
            map.flyTo(ll,16,{duration:0.8});
            setTimeout(()=>userLocationMarker.openPopup(),900);
        },err=>{b.style.opacity='1';alert('Could not get location: '+err.message);},{enableHighAccuracy:true,timeout:10000});
    });
    return c;
};
locateControl.addTo(map);

// Fit the map to the defined boundaries
// map.fitBounds(mapBounds);

/* SPECIAL BUTTON FOR LOCATING YOUR OWN POSITION */
// Add a custom "my location" button to the map
// Store the user's location marker
/* let userLocationMarker = null;
const locateControl = L.control({ position: 'topleft' });

locateControl.onAdd = function () {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    const button = L.DomUtil.create('a', '', container);

    button.href = '#';
    button.title = 'Show my location';
    button.innerHTML = '📍';

    button.style.width = '34px';
    button.style.height = '34px';
    button.style.lineHeight = '34px';
    button.style.textAlign = 'center';
    button.style.fontSize = '18px';
    button.style.background = 'white';
    button.style.cursor = 'pointer';

    // Prevent map interactions when clicking the button
    L.DomEvent.disableClickPropagation(container);

    L.DomEvent.on(button, 'click', function (e) {
        L.DomEvent.stop(e);

        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser.');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            function (position) {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;

                // Remove the previous location marker
                if (userLocationMarker) {
                    map.removeLayer(userLocationMarker);
                }

                // Add a new location marker
                userLocationMarker = L.marker([lat, lon])
                    .addTo(map)
                    .bindPopup('You are here');

                // Stop any current animation
                map.stop();

                // Smoothly move and zoom to the user's location
                map.flyTo([lat, lon], 18, {
                    animate: true,
                    duration: 1.5
                });

                // Open the popup after the map finishes moving
                setTimeout(() => {
                    userLocationMarker.openPopup();
                }, 1500);
            },
            function (error) {
                console.error(error);
                alert('Could not get your location.');
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });

    return container;
};

locateControl.addTo(map);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map); */

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
        const m = L.marker([park.lat,park.lon],{icon:makeParkIcon(false)})
            .addTo(map)
            .bindTooltip(`<b>${park.name}</b><br><span style="font-size:0.8em;color:#666">${park.district}</span>`,{direction:'top',offset:[0,-36],className:'park-tooltip'});
        m.on('click',()=>{openDetail(park.id);map.flyTo([park.lat,park.lon],16,{duration:0.8});});
        parkMarkers[park.id] = m;
    });
}

/* function initParkMarkers() {
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
} */

function setActiveMarker(id) {
    Object.entries(parkMarkers).forEach(([pid, m]) => m.setIcon(makeParkIcon(pid === id)));
}

/* live weather banner - open-meteo */
/* async function loadWeather() {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=49.89&longitude=10.89&current_weather=true';
    try {
        const data = await (await fetch(url)).json();
        const { temperature: temp, weathercode: code } = data.current_weather;
        document.getElementById('weather-banner-text').innerText = `Bamberg right now: ${temp}°C - ${wmoLabel(code)}`;
        document.getElementById('weather-banner').classList.add('visible');
    } catch (e) {
        console.error('Weather error:', e);
    }
} */

async function loadWeather() {
    try {
        const data = await(await fetch('https://api.open-meteo.com/v1/forecast?latitude=49.89&longitude=10.89&current_weather=true')).json();
        const {temperature:temp,weathercode:code} = data.current_weather;
        document.getElementById('weather-banner-text').innerText = `Bamberg right now: ${temp}°C – ${wmoLabel(code)}`;
        document.getElementById('weather-banner').classList.add('visible');
    } catch(e){console.error('Weather error:',e);}
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
    return new Date().toLocaleString('sv-SE',{timeZone:'Europe/Berlin'}).slice(0,13).replace(' ','T')+':00';
}

const rainCache = {};
async function fetchRain(lat,lon) {
    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if(rainCache[key]) return rainCache[key];
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=precipitation&hourly=precipitation,precipitation_probability&timezone=Europe/Berlin&forecast_days=1`;
        const data = await(await fetch(url)).json();
        const rain = data.current?.precipitation ?? 0;
        const hour = getBerlinHourISO();
        const idx = (data.hourly?.time||[]).findIndex(t=>t.startsWith(hour));
        const prob = idx>=0 ? data.hourly.precipitation_probability[idx] : 0;
        const r = {rain,prob};
        rainCache[key] = r;
        return r;
    } catch(e){console.warn('Rain fetch failed:',e);return {rain:0,prob:0};}
}

/* async function loadRainMap () {
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
} */

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

        node["amenity"="ice_cream"](around:${r},${lat},${lon});
        node["shop"="ice_cream"](around:${r},${lat},${lon});

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

function capitalize(s){return s?s.charAt(0).toUpperCase()+s.slice(1).replace(/_/g,' '):s;}

function classifyNode(node) {
    const t = node.tags || {};

    if (t.highway==='bus_stop'||t.public_transport==='platform'||t.public_transport==='stop_position')
        return 'transit';

    if (['restaurant', 'cafe', 'biergarten'].includes(t.amenity))
        return 'food';

    if (t.amenity==='ice_cream'||t.shop==='ice_cream')
        return 'icecream';

    if (t.leisure === 'playground')
        return 'playground';

    if (t.tourism || t.historic)
        return 'sightseeing';

    return null;
}

/* function nodeName(node) {
    const t = node.tags || {};
    return t.name || t['name:en'] || t.amenity || t.shop || t.tourism || t.historic || 'Unnamed';
} */

function nodeName(node) {
    const t=node.tags||{};
    if(t.name) return t.name;
    if(t['name:de']) return t['name:de'];
    if(t['name:en']) return t['name:en'];
    if(t.historic&&t.historic!=='yes') return `${capitalize(t.historic)} (unnamed)`;
    if(t.tourism&&t.tourism!=='yes') return `${capitalize(t.tourism)} (unnamed)`;
    if(t.shop&&t.shop!=='yes') return `${capitalize(t.shop)} (unnamed)`;
    if(t.amenity) return `${capitalize(t.amenity)} (unnamed)`;
    if(t.leisure==='playground') return 'Playground (unnamed)';
    if(t.highway==='bus_stop') return 'Bus stop (unnamed)';
    return 'Unnamed place';
}

function busLines(node) {
    const ref = (node.tags||{}).route_ref||'';
    return ref?ref.split(/[;,]/).map(s=>s.trim()).filter(Boolean):[];
}
function vgnLiveUrl(name) {
    return `https://www.vgn.de/verbindungen/?vgn3_dm_input=${encodeURIComponent(name+', Bamberg')}`;
}

// Cache so we don't re-fetch when detail panel re-opens
const poiCache = {};

async function fetchPOIs(park){
    if (poiCache[park.id]) return poiCache[park.id];
    const poi = {
    transit: [],
    food: [],
    icecream: [],
    sightseeing: [],
    playground: []
};
    try {
        const data = await(await fetch(overpassUrl(park.lat,park.lon))).json();
        data.elements.forEach(node=>{
            const cat=classifyNode(node);
            if(!cat) return;
            const dist=Math.round(haversine(park.lat,park.lon,node.lat,node.lon));
            const entry = {name:nodeName(node),dist:distLabel(dist),_dist:dist,lat:node.lat,lon:node.lon};
            if(cat==='transit'){entry.lines=busLines(node);entry.rawName=(node.tags&&node.tags.name)||'';}
            poi[cat].push(entry);
        });

        // sort by distance, keep top 3 per category
        Object.keys(poi).forEach(cat => {
            poi[cat].sort((a,b) => a._dist - b._dist);
            poi[cat] = poi[cat].slice(0,3).map(({_dist,...rest}) => rest);
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
    return { transit:'🚌', food:'🍽️', shopping:'🍦', sightseeing:'🏛️', playground:'🛝' }[cat] || '•';
}

/* RADAR CHART */
function drawRadar(canvas, weatherData, activeFilters) {
    const ctx=canvas.getContext('2d');
    const W=canvas.width,H=canvas.height,cx=W/2,cy=H/2,r=Math.min(W,H)/2-22;
    ctx.clearRect(0,0,W,H);
    const keys=Object.keys(WEATHER_LABELS),n=keys.length;
    const step=(Math.PI*2)/n,start=-Math.PI/2;
    const pt=(i,ratio)=>({x:cx+Math.cos(start+i*step)*r*ratio,y:cy+Math.sin(start+i*step)*r*ratio});
    [0.25,0.5,0.75,1].forEach(ratio=>{ctx.beginPath();keys.forEach((_,i)=>{const p=pt(i,ratio);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.strokeStyle='rgba(90,107,82,0.15)';ctx.lineWidth=1;ctx.stroke();});
    keys.forEach((_,i)=>{const p=pt(i,1);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(p.x,p.y);ctx.strokeStyle='rgba(90,107,82,0.15)';ctx.lineWidth=1;ctx.stroke();});
    ctx.beginPath();keys.forEach((key,i)=>{const p=pt(i,(weatherData[key]||0)/10);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.fillStyle='rgba(122,182,72,0.2)';ctx.fill();ctx.strokeStyle='#4a7c2f';ctx.lineWidth=1.5;ctx.stroke();
    activeFilters.forEach(key=>{const i=keys.indexOf(key);if(i<0)return;const v=(weatherData[key]||0)/10,p=pt(i,v),ep=pt(i,1);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(ep.x,ep.y);ctx.strokeStyle='#7ab648';ctx.lineWidth=2;ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fillStyle='#4a7c2f';ctx.fill();});
    ctx.textAlign='center';ctx.textBaseline='middle';
    keys.forEach((key,i)=>{const p=pt(i,1.28),active=activeFilters.has(key);ctx.fillStyle=active?'#2d4a1e':'#8a9b82';ctx.font=(active?'bold ':'')+'9px DM Sans, sans-serif';ctx.fillText(WEATHER_LABELS[key],p.x,p.y);});
};

/*    // Grid rings
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
        const v=(weatherData[key]||0)/10, p=pt(i,v), ep=pt(i,1);
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
} */

/* SCORING */
function parkScore(park) {
    if(!activeWeather.size) return null;
    let t=0; activeWeather.forEach(k=>{t+=park.weather[k]||0;});
    return Math.round(t/activeWeather.size);
}

/* RENDER - cards */
function renderAll() {
    const grid=document.getElementById('parks-grid');
    const empty=document.getElementById('empty-state');
    const fb=document.getElementById('filter-banner');
    const fbt=document.getElementById('filter-banner-text');
    let sorted=PARKS.map(p=>({park:p,score:parkScore(p)}));
    if(activeWeather.size){
        sorted.sort((a,b)=>b.score-a.score);
        fbt.textContent=`Ranked by: ${[...activeWeather].map(k=>WEATHER_LABELS[k]).join(', ')}`;
        fb.classList.add('visible');
    } else { fb.classList.remove('visible'); }
    const visible=sorted.filter(({score})=>!activeWeather.size||score>=3);
    grid.innerHTML='';
    if(!visible.length){empty.classList.add('visible');}
    else{empty.classList.remove('visible');visible.forEach(({park,score})=>renderCard(park,score,grid));}
    document.getElementById('btn-open-compare').disabled=compareSet.size<2;
    document.getElementById('compare-count').textContent=compareSet.size;
}

function renderCard(park, score, grid) {
    const card = document.createElement('div');
    card.className = 'park-card' + (compareSet.has(park.id) ? ' compare-selected' : '');
    card.dataset.id = park.id;
    let badgeClass = score === null ? '' : score < 4 ? 'low' : score < 7 ? 'mid' : '';
    const pills = Object.entries(park.weather).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([key,val]) => {
        const cls = val>=7?'good':val<=3?'bad':'';
        return `<span class="weather-pill ${cls}" title="${WEATHER_LABELS[key]}: ${val}/10">${weatherIcon(key)} ${WEATHER_LABELS[key]} ${val}/10</span>`;
    }).join('');

    // POI badges show a loading spinner, filled after fetch
    const poiBadgesId = `poi-badges-${park.id}`;
    card.innerHTML = `
        <div class="card-compare-check ${compareSet.has(park.id)?'checked':''}" data-id="${park.id}" title="Add to compare">
            ${compareSet.has(park.id)?'✓':'+'}
        </div>
        <div class="park-header">
            <div>
                <div class="park-name">${park.name}</div>
                <div class="park-district">${park.district}</div>
            <div>
            ${score!==null?`<div class="park-score-badge ${badgeClass}">${score}/10</div>`:''}
        </div>
        <div class="park-radar radar-wrap">
            <canvas width="160" height="130" class="radar-canvas"></canvas>
        </div>
        <div class="weather-pills">${pills}</div>
        <div class="park-poi"><div class="poi-row" id="${poiBadgesId}">
            <span style="font-size:0.72rem;color:#aaa">Loading nearby places...</span>
        </div></div>
    `;

    drawRadar(card.querySelector('.radar-canvas'), park.weather, activeWeather);
    card.addEventListener('click', e => {
        if (e.target.closest('.card-compare-check')) return;
        openDetail(park.id);
        map.flyTo([park.lat, park.lon], 16, {duration: 0.8});
    });
    card.querySelector('.card-compare-check').addEventListener('click',e => {
        e.stopPropagation(); toggleCompare(park.id);
    });
    grid.appendChild(card);

    // Fetch POIs async and fill in badges
    fetchPOIs(park).then(poi => {
        const row = document.getElementById(poiBadgesId);
        if (!row) return;
        const html = Object.entries(poi).map(([cat, items]) => {
            if (!items.length) return '';
            const hidden = !activePoi.has(cat) ? 'hidden' : '';
            return `<span class="poi-badge ${cat} ${hidden}">${poiIcon(cat)} ${items.length} ${cat}</span>`;
        }).join('');
        row.innerHTML = html || '<span style="font-size:0.72rem;color:#aaa">No POIs found nearby</span>';
    });
}

/* ─── POI MAP CIRCLES ─── */
function clearPoiCircles(){currentPoiCircles.forEach(c=>map.removeLayer(c));currentPoiCircles=[];}
function drawPoiCircles(poi) {
    clearPoiCircles();
    Object.entries(poi).forEach(([cat,items])=>{
        if(!activePoi.has(cat)) return;
        items.forEach(item=>{
            if(item.lat==null||item.lon==null) return;
            const c=L.circleMarker([item.lat,item.lon],{radius:7,weight:2,color:'white',fillColor:POI_COLORS[cat],fillOpacity:0.9})
                .addTo(map).bindTooltip(`${poiIcon(cat)} ${item.name}`,{direction:'top'});
            currentPoiCircles.push(c);
        });
    });
}

/* DETAIL PANEL */
function openDetail(id) {
    const park = PARKS.find(p => p.id === id);
    
    if (!park) return;
        const feedbackLink = document.getElementById("feedback-link");

    if (feedbackLink) {
        feedbackLink.href = `/feedback?park=${park.id}`;
    }
    openDetailId = id;
    setActiveMarker(id);

    document.getElementById('dp-name').textContent = park.name;
    document.getElementById('dp-district').textContent = park.district;
    document.getElementById('dp-desc').textContent = park.desc;
    // Google Maps links (walking + transit)
    const navEl=document.getElementById('dp-nav');
    if(navEl){
        const walk=`https://www.google.com/maps/dir/?api=1&destination=${park.lat},${park.lon}&travelmode=walking`;
        const transit=`https://www.google.com/maps/dir/?api=1&destination=${park.lat},${park.lon}&travelmode=transit`;
        navEl.innerHTML=`<a class="gmaps-link" href="${walk}" target="_blank" rel="noopener">🚶 Walking directions</a> <a class="gmaps-link" href="${transit}" target="_blank" rel="noopener">🚌 Public transport</a>`;
    }
    document.getElementById('dp-weather').innerHTML = Object.entries(park.weather).map(([key,val]) => `
        <div class="detail-weather-item">
            <div class="dwi-label">${weatherIcon(key)} ${WEATHER_LABELS[key]}</div>
            <div class="dwi-bar"><div class="dwi-fill" style="width:${val*10}%"></div></div>
            <div class="dwi-val">${val}/10</div>
        </div>`).join('');

    // Per-park rain
    const rainEl=document.getElementById('dp-rain');
    if(rainEl){
        rainEl.innerHTML='<span style="color:#aaa">Loading rain forecast…</span>';
        fetchRain(park.lat,park.lon).then(({rain,prob})=>{
            const wet=rain>0.1||prob>50;
            rainEl.innerHTML=`<div class="rain-line ${wet?'wet':'dry'}"><span class="rain-icon">${wet?'🌧️':'☀️'}</span><span><strong>${rain.toFixed(1)} mm</strong> now · <strong>${prob}%</strong> chance this hour — ${wet?'Bring an umbrella':'Looks dry'}</span></div>`;
        });
    }

    // Show leading state, then fill POIs
    const poiEl = document.getElementById('dp-poi');
    poiEl.innerHTML = '<p style="font-size:0.8rem;color:#aaa">Fetching nearby places from OpenStreetMap...</p>';

    fetchPOIs(park).then(poi => {
        drawPoiCircles(poi);
        let html='';
        for(const [cat,items] of Object.entries(poi)){
            if(!items.length) continue;
            if(!activePoi.has(cat)) continue; // only show selected POI categories
            const color=POI_COLORS[cat];
            if(cat==='transit'){
                html+=`<div class="detail-poi-category"><div class="detail-poi-cat-name">${poiIcon('transit')} Public transport</div>`;
                items.forEach(item=>{
                    const linesHtml=item.lines&&item.lines.length
                        ?`<div class="transit-lines">Lines: ${item.lines.map(l=>`<span class="bus-line">${l}</span>`).join(' ')}</div>`
                        :`<div class="transit-lines transit-lines-none">No line info on OpenStreetMap</div>`;
                    const href=item.rawName?vgnLiveUrl(item.rawName):'https://www.vgn.de/verbindungen/';
                    html+=`<div class="detail-poi-item transit-stop"><div class="detail-poi-dot" style="background:${color}"></div><div style="flex:1;min-width:0"><div><strong>${item.name}</strong> <span class="detail-poi-dist">${item.dist}</span></div>${linesHtml}<a class="vgn-link" href="${href}" target="_blank" rel="noopener">📅 Live departures on vgn.de →</a></div></div>`;
                });
                html+=`</div>`;
            } else {
                html+=`<div class="detail-poi-category"><div class="detail-poi-cat-name">${poiIcon(cat)} ${capitalize(cat)}</div>${items.map(item=>`<div class="detail-poi-item"><div class="detail-poi-dot" style="background:${color}"></div>${item.name}<span class="detail-poi-dist">${item.dist}</span></div>`).join('')}</div>`;
            }
        }
        poiEl.innerHTML = html || '<p style="font-size:0.8rem;color:#aaa">No points of interest found within 400m.</p>';
    });
    document.getElementById('detail-panel').classList.add('visible');
    document.querySelector('.app').classList.add('detail-open');
}

function closeDetail() {
    document.getElementById('detail-panel').classList.remove('visible');
    document.querySelector('.app').classList.remove('detail-open');
    clearPoiCircles();
    setActiveMarker(null);
    openDetailId = null;
}

/* COMPARE */
function toggleCompare(id) {
    if (compareSet.has(id)) {
        compareSet.delete(id);
    } else {
        if (compareSet.size >= 2) {
            const [oldest] = compareSet;
            compareSet.delete(oldest);
        }
        compareSet.add(id);
    }
    renderAll();
}

function openCompare() {
    if (compareSet.size < 2) return;
    const parks = [...compareSet].map(id => PARKS.find(p => p.id === id));
    // Temperature difference section
    let tempDiffHtml='';
    if(parks.length===2){
        const wDiff=parks[0].weather.warmth-parks[1].weather.warmth;
        const warmer=wDiff>0?parks[0]:wDiff<0?parks[1]:null;
        tempDiffHtml=warmer
            ?`<div class="compare-temp-diff">🌡️ <strong>${warmer.name}</strong> is roughly ${Math.abs(wDiff)} point${Math.abs(wDiff)>1?'s':''} warmer (sun exposure)</div>`
            :`<div class="compare-temp-diff">🌡️ Both parks have similar warmth</div>`;
    }
    document.getElementById('compare-grid').innerHTML = parks.map(park => `
        <div class="compare-park-col">
            <div class="compare-park-name">${park.name}</div>
            ${Object.entries(park.weather).map(([key,val]) => `
                <div class="compare-stat-row">
                    <span class="compare-stat-label">${weatherIcon(key)} ${WEATHER_LABELS[key]}</span>
                    <div class="compare-stat-bar-wrap">
                        <div class="compare-stat-bar-bg">
                            <div class="compare-stat-bar-fill" style="width:${val*10}%"></div>
                        </div>
                        <span class="compare-stat-val">${val}</span>
                    </div>
                </div>`).join('')}
        </div>`).join('');
    document.getElementById('compare-overlay').classList.add('visible');
}

/* ─── AUTOMATED QUIETNESS ─── */
async function computeQuietness() {
    try {
        const q=`[out:json][timeout:15];way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|secondary)$"](49.83,10.78,49.96,10.99);out geom;`;
        const data=await(await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`)).json();
        const roads=data.elements||[];
        PARKS.forEach(park=>{
            let minDist=Infinity;
            roads.forEach(way=>{if(!way.geometry)return;for(let i=0;i<way.geometry.length;i+=3){const pt=way.geometry[i];const d=haversine(park.lat,park.lon,pt.lat,pt.lon);if(d<minDist)minDist=d;}});
            let score;
            if(minDist<40)score=1;else if(minDist<80)score=Math.round(2+(minDist-40)/40);else if(minDist<200)score=Math.round(4+((minDist-80)/120)*2);else if(minDist<400)score=Math.round(7+((minDist-200)/200));else score=Math.min(10,Math.round(8+(minDist-400)/300));
            park.weather.quiet=Math.min(10,Math.max(1,score));
        });
        console.log('Quietness scores computed from road proximity');
        renderAll();
    } catch(e){console.warn('Quietness computation failed — keeping manual scores:',e);}
}

//functions
initParkMarkers();
loadWeather();
renderAll();
computeQuietness();