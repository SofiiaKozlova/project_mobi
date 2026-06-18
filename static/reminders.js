/* ============================================================
   reminders.js — Reminders page
   Depends on common.js
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    loadParks().then(() => loadAllParkTemps());

    const cmf = document.getElementById('comfortable-park-temp');
    const rec = document.getElementById('park-recommend-threshold');
    if (cmf) cmf.addEventListener('input', refreshComfortable);
    if (rec) rec.addEventListener('input', refreshRecommendation);

    document.addEventListener('temps-loaded', () => { refreshComfortable(); refreshRecommendation(); });
});

function refreshRecommendation() {
    const el = document.getElementById('park-recommend-list');
    const input = document.getElementById('park-recommend-threshold');
    if (!el || !input) return;
    if (bambergAvgTemp === null) { el.innerHTML = `<span class="reminder-empty">Loading temperatures…</span>`; return; }
    const threshold = parseFloat(input.value) || 2;
    const cooler = PARKS
        .map(p => ({ park: p, temp: parkTempCache[p.id], diff: bambergAvgTemp - parkTempCache[p.id] }))
        .filter(x => x.temp != null && x.diff >= threshold)
        .sort((a, b) => b.diff - a.diff);
    if (!cooler.length) {
        el.innerHTML = `<span class="reminder-empty">No parks are at least ${threshold}°C cooler than the Bamberg average (${bambergAvgTemp.toFixed(1)}°C) right now.</span>`;
        return;
    }
    el.innerHTML = cooler.map(x =>
        `<a class="reminder-item" href="/park/${x.park.id}">❄️ <strong>${x.park.name}</strong> is <strong>${x.diff.toFixed(1)}°</strong> cooler than the city average (${x.temp.toFixed(1)}°C vs ${bambergAvgTemp.toFixed(1)}°C)</a>`
    ).join('');
}

function refreshComfortable() {
    const el = document.getElementById('comfortable-park-list');
    const input = document.getElementById('comfortable-park-temp');
    if (!el || !input) return;
    if (bambergAvgTemp === null) { el.innerHTML = `<span class="reminder-empty">Loading temperatures…</span>`; return; }
    const ideal = parseFloat(input.value);
    if (isNaN(ideal)) { el.innerHTML = ''; return; }
    const cool = PARKS
        .map(p => ({ park: p, temp: parkTempCache[p.id] }))
        .filter(x => x.temp != null && x.temp <= ideal)
        .sort((a, b) => a.temp - b.temp);
    if (!cool.length) {
        el.innerHTML = `<span class="reminder-empty">No parks are currently at or below ${ideal}°C.</span>`;
        return;
    }
    el.innerHTML = cool.map(x =>
        `<a class="reminder-item small" href="/park/${x.park.id}">✓ <strong>${x.park.name}</strong> – ${x.temp.toFixed(1)}°C</a>`
    ).join('');
}
