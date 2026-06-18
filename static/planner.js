/* ============================================================
   planner.js — meet-in-the-middle park finder
   Depends on common.js
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    loadParks();
    const button = document.getElementById('btn-plan-date');
    if (!button) return;

    button.addEventListener('click', async () => {
        const person1 = document.getElementById('person1-input').value.trim();
        const person2 = document.getElementById('person2-input').value.trim();
        const results = document.getElementById('date-results');

        if (!person1 || !person2) {
            results.innerHTML = `<p class="planner-error">Please enter both locations.</p>`;
            return;
        }

        results.innerHTML = `<p class="poi-loading">Finding the midpoint…</p>`;
        await loadParks();

        const [p1, p2] = await Promise.all([geocodeLocation(person1), geocodeLocation(person2)]);
        if (!p1 || !p2) {
            results.innerHTML = `<p class="planner-error">Couldn't find one of those locations. Try a street or district name in Bamberg.</p>`;
            return;
        }

        renderDateResults(findMeetingParks(p1, p2));
    });
});

async function geocodeLocation(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Bamberg, Germany')}`;
    try {
        const data = await (await fetch(url)).json();
        if (!data.length) return null;
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    } catch (e) { return null; }
}

function findMeetingParks(person1, person2) {
    const midpoint = { lat: (person1.lat + person2.lat) / 2, lon: (person1.lon + person2.lon) / 2 };
    return PARKS
        .map(park => ({ park, distance: haversine(midpoint.lat, midpoint.lon, park.lat, park.lon) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5);
}

function renderDateResults(results) {
    const container = document.getElementById('date-results');
    container.innerHTML = `
        <div class="planner-results-grid">
            ${results.map(({ park, distance }) => `
                <a class="planner-card" href="/park/${park.id}">
                    <div class="planner-card-name">${park.name}</div>
                    <div class="planner-card-district">${park.district}</div>
                    <div class="planner-card-dist">${Math.round(distance)} m from the midpoint</div>
                    <div class="weather-pills">
                        ${CONDITION_KEYS.map(k => `<span class="weather-pill">${conditionIcon(k)} ${CONDITION_LABELS[k]} ${park.conditions[k]}/10</span>`).join('')}
                    </div>
                </a>`).join('')}
        </div>`;
}
