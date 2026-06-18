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

        // recompute quiet from roads, then redraw the conditions grid
        computeQuietness();

        // POIs (needs all parks loaded so each node maps to its nearest park)
        fetchPOIs(park).then(renderPOIs);

        // live temperature + rain
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

function renderLive(park, lat, lon) {
    const el = document.getElementById('dp-live');
    if (!el) return;
    Promise.all([fetchRain(lat, lon), fetchParkTemp(park)]).then(([{ rain, prob }, temp]) => {
        const wet = rain > 0.1 || prob > 50;
        const tempLine = temp !== null
            ? `<div class="temp-line"><span class="rain-icon">🌡️</span><span><strong>${temp.toFixed(1)}°C</strong> at this park right now${bambergAvgTemp !== null ? ` <span class="temp-vs">(${(temp - bambergAvgTemp >= 0 ? '+' : '')}${(temp - bambergAvgTemp).toFixed(1)}° vs city avg)</span>` : ''}</span></div>`
            : '';
        el.innerHTML = tempLine +
            `<div class="rain-line ${wet ? 'wet' : 'dry'}"><span class="rain-icon">${wet ? '🌧️' : '☀️'}</span><span><strong>${rain.toFixed(1)} mm</strong> now · <strong>${prob}%</strong> chance this hour — ${wet ? 'Bring an umbrella' : 'Looks dry'}</span></div>`;
    });
}

function renderPOIs(poi) {
    const el = document.getElementById('dp-poi');
    if (!el) return;
    let html = '';
    for (const [cat, items] of Object.entries(poi)) {
        if (!items.length) continue;
        const color = POI_COLORS[cat];
        if (cat === 'transit') {
            html += `<div class="detail-poi-category"><div class="detail-poi-cat-name">${poiIcon('transit')} Public transport</div>`;
            items.forEach(item => {
                // combined stop: lines + how many platforms (directions)
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
    el.innerHTML = html || '<p class="poi-loading">No points of interest found within 400 m.</p>';
}
