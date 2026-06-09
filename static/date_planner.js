document.addEventListener("DOMContentLoaded", function () {

    const button = document.getElementById("btn-plan-date");

    if (!button) return;

    button.addEventListener("click", async function () {

        const person1 = document.getElementById("person1-input").value.trim();
        const person2 = document.getElementById("person2-input").value.trim();

        if (!person1 || !person2) {
            alert("Please enter both locations.");
            return;
        }

        const p1 = await geocodeLocation(person1);
        const p2 = await geocodeLocation(person2);

        if (!p1 || !p2) {
            alert("Could not find one of the locations.");
            return;
        }

        const results = findMeetingParks(p1, p2);

        renderDateResults(results);
    });

});
// Convert address to coordinates
async function geocodeLocation(query) {

    const searchQuery = `${query}, Bamberg, Germany`;

    const url =
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.length) {
        return null;
    }

    return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
    };
}
function findMeetingParks(person1, person2) {

    const midpoint = {
        lat: (person1.lat + person2.lat) / 2,
        lon: (person1.lon + person2.lon) / 2
    };

    return PARKS
        .map(park => {

            const distanceToMiddle =
                haversine(
                    midpoint.lat,
                    midpoint.lon,
                    park.lat,
                    park.lon
                );

            return {
                park,
                distance: distanceToMiddle
            };

        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5);
}
function renderDateResults(results) {

    const container =
        document.getElementById("date-results");

    container.innerHTML = `
        <div class="date-result">
            <strong>Best parks between both people:</strong>
            <br><br>

            ${results.map(item => `
                ${item.park.name}
                (${Math.round(item.distance)} m)
            `).join("<br>")}
        </div>
    `;
}
function haversine(lat1, lon1, lat2, lon2) {

    const R = 6371000; // Earth radius in meters

    const toRad = deg => deg * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}