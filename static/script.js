
//api
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

loadWeather();




//buttons






