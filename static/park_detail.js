/* ============================================================
   park_detail.js — single park page
   Depends on common.js
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('.detail-page');
    if (!root) return;
    const id = root.dataset.parkId;
    const lat = parseFloat(root.dataset.lat);
    const lon = parseFloat(root.dataset.lon);

    loadParks().then(() => {
        const park = getPark(id);
        if (!park) return;

        renderConditions(park);
        computeQuietness();   // only runs if the OSM cache didn't provide Quiet

        // POIs — only the categories selected on the Explore tab, within the
        // chosen radius, widening automatically until at least one is found.
        const categories = getPoiCategories();
        const radius = getPoiRadius();
        const poiEl = document.getElementById('dp-poi');
        if (!categories.length) {
            poiEl.innerHTML = '<p class="poi-loading">No point-of-interest types are selected. Pick some on the Explore tab.</p>';
        } else {
            poiEl.innerHTML = '<span class="poi-loading">Fetching nearby places from OpenStreetMap…</span>';
            fetchPOIsForPark(park, { categories, radius }).then(poi => renderPOIs(poi, radius));
        }

        loadAllParkTemps();
        renderLive(park, lat, lon);
    });

    document.addEventListener('quietness-computed', () => {
        const park = getPark(id);
        if (park) renderConditions(park);
    });
    document.addEventListener('temps-loaded', () => {
        const park = getPark(id);
        if (park) renderLive(park, lat, lon);
    });
});

function renderConditions(park) {
    const el = document.getElementById('dp-conditions');
    if (!el) return;
    el.innerHTML = CONDITION_KEYS.map(key => {
        const val = park.conditions[key] || 0;
        const fact = conditionFactLabel(park, key);
        return `
        <div class="detail-weather-item">
            <div class="dwi-label">${conditionIcon(key)} ${CONDITION_LABELS[key]}</div>
            <div class="dwi-bar"><div class="dwi-fill" style="width:${val * 10}%"></div></div>
            <div class="dwi-val">${val}/10${fact ? `<span class="dwi-fact">${fact}</span>` : ''}</div>
        </div>`;
    }).join('');
}

/* ─── Live conditions: temperature + rain (clean layout) ─── */
function renderLive(park, lat, lon) {
    const el = document.getElementById('dp-live');
    if (!el) return;
    Promise.all([fetchRain(lat, lon), fetchParkTemp(park)]).then(([{ rain, prob }, temp]) => {
        const wet = rain > 0.1 || prob > 50;

        let tempBlock = '';
        if (temp !== null && temp !== undefined) {
            let note = '';
            if (bambergAvgTemp !== null) {
                const diff = temp - bambergAvgTemp;
                if (Math.abs(diff) < 0.3) note = 'About the same as the city average';
                else if (diff < 0) note = `${Math.abs(diff).toFixed(1)}° cooler than the city average`;
                else note = `${diff.toFixed(1)}° warmer than the city average`;
            }
            tempBlock = `
                <div class="live-temp">
                    <span class="live-temp-value">${temp.toFixed(1)}°C</span>
                    <span class="live-temp-caption">now at this park</span>
                </div>
                ${note ? `<div class="live-note">${note}</div>` : ''}`;
        }

        const rainBlock = `
            <div class="live-rain ${wet ? 'wet' : 'dry'}">
                <span class="live-rain-icon">${wet ? '🌧️' : '☀️'}</span>
                <span><strong>${rain.toFixed(1)} mm</strong> now · <strong>${prob}%</strong> chance this hour — ${wet ? 'bring an umbrella' : 'looks dry'}</span>
            </div>`;

        el.innerHTML = tempBlock + rainBlock;
    });
}

function renderPOIs(poi, radius) {
    const el = document.getElementById('dp-poi');
    if (!el) return;
    const radiusUsed = poi._radiusUsed || radius;
    let html = '';
    for (const [cat, items] of Object.entries(poi)) {
        if (cat.startsWith('_') || !items.length) continue;
        const color = POI_COLORS[cat];
        if (cat === 'transit') {
            html += `<div class="detail-poi-category"><div class="detail-poi-cat-name">${poiIcon('transit')} Public transport</div>`;
            items.forEach(item => {
                const linesHtml = item.lines && item.lines.length
                    ? `<div class="transit-lines">Lines: ${item.lines.map(l => `<span class="bus-line">${l}</span>`).join(' ')}</div>`
                    : `<div class="transit-lines transit-lines-none">No line info on OpenStreetMap</div>`;
                const platformsHtml = item.platforms > 1
                    ? `<div class="transit-platforms">${item.platforms} platforms (both directions)</div>` : '';
                const gmapsHref = gmapsPoiUrl(item.rawName || item.name, item.lat, item.lon);
                const vgnHref = item.rawName
                    ? `https://www.vgn.de/fahrplan/abfahrtsmonitor/?stop=${encodeURIComponent(item.rawName)}`
                    : 'https://www.vgn.de/abfahrten/';
                html += `<div class="detail-poi-item transit-stop">
                    <div class="detail-poi-dot" style="background:${color}"></div>
                    <div style="flex:1;min-width:0">
                        <div><a href="${gmapsHref}" target="_blank" rel="noopener" class="poi-link-inline"><strong>${item.name}</strong></a> <span class="detail-poi-dist">${item.dist}</span></div>
                        ${linesHtml}${platformsHtml}
                        <div class="transit-actions">
                            <a class="vgn-link" href="${gmapsHref}" target="_blank" rel="noopener">📍 Google Maps</a>
                            <a class="vgn-link" href="${vgnHref}" target="_blank" rel="noopener">🌐 VGN departures</a>
                        </div>
                    </div></div>`;
            });
            html += `</div>`;
        } else {
            html += `<div class="detail-poi-category"><div class="detail-poi-cat-name">${poiIcon(cat)} ${capitalize(cat)}</div>${items.map(item => {
                const url = gmapsPoiUrl(item.name, item.lat, item.lon);
                return `<a class="detail-poi-item poi-link" href="${url}" target="_blank" rel="noopener" title="Open in Google Maps">
                    <div class="detail-poi-dot" style="background:${color}"></div>
                    <span class="poi-name">${item.name}</span>
                    <span class="detail-poi-dist">${item.dist}</span>
                </a>`;
            }).join('')}</div>`;
        }
    }
    if (!html) {
        el.innerHTML = `<p class="poi-loading">No selected points of interest found within ${(radiusUsed/1000).toFixed(1)} km.</p>`;
        return;
    }
    const note = radiusUsed > radius
        ? `<p class="poi-radius-note">Nearest selected places (widened to ${radiusUsed} m to find some).</p>`
        : `<p class="poi-radius-note">Within ${radiusUsed} m.</p>`;
    el.innerHTML = note + html
    ;
    
}
document.addEventListener("DOMContentLoaded", () => {

const btn = document.getElementById("toggle-feedback");
const list = document.getElementById("feedback-list");

if (!btn || !list) return;

btn.addEventListener("click", () => {

    if (list.style.display === "none") {
        list.style.display = "block";
        btn.textContent = "Hide feedback";
    } else {
        list.style.display = "none";
        btn.textContent = "Show feedback";
    }

});

});