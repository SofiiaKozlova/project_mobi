// for all buttons. 

/* ============================================================
   BUTTONS — all event listeners for interactive UI elements
   Depends on: script.js (must load first)
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    // Weather filter buttons
    document.getElementById('weather-filters').addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (!btn) return;
        const f = btn.dataset.filter;
        if (activeWeather.has(f)) {
            activeWeather.delete(f);
            btn.classList.remove('active');
        } else {
            activeWeather.add(f);
            btn.classList.add('active');
        }
        renderAll();
    });

    // POI filter buttons
    document.getElementById('poi-filters').addEventListener('click', e => {
        const btn = e.target.closest('.poi-filter-btn');
        if (!btn) return;
        const p = btn.dataset.poi;
        if (activePoi.has(p)) { activePoi.delete(p); btn.classList.remove('active'); }
        else { activePoi.add(p); btn.classList.add('active'); }
        document.querySelectorAll('.poi-badge').forEach(badge => {
            const cat = [...badge.classList].find(c => POI_COLORS[c]);
            if (cat) badge.classList.toggle('hidden', !activePoi.has(cat));
        });
    });

    // Compare: open modal
    document.getElementById('btn-open-compare').addEventListener('click', openCompare);

    // Compare: close modal (X button)
    document.getElementById('btn-close-compare').addEventListener('click', () => {
        document.getElementById('compare-overlay').classList.remove('visible');
    });

    // Compare: close modal (click outside)
    document.getElementById('compare-overlay').addEventListener('click', e => {
        if (e.target === document.getElementById('compare-overlay')) {
            document.getElementById('compare-overlay').classList.remove('visible');
        }
    });

    // Detail panel: close button
    document.getElementById('btn-detail-close').addEventListener('click', closeDetail);

    // Detail panel: close on click outside
    document.addEventListener('pointerdown', e => {
        const panel = document.getElementById('detail-panel');
        if (!panel.classList.contains('visible')) return;
        if (e.target.closest('#detail-panel, .park-card, .leaflet-marker-icon, .leaflet-marker-pane, .leaflet-interactive, .leaflet-control, .locate-btn')) return;
        closeDetail();
    });

    // Park Recommendation Reminder input
    const recInput = document.getElementById('park-recommend-threshold');
    if (recInput) recInput.addEventListener('input', () => refreshRecommendationReminder());

    // Comfortable Park Reminder input
    const cmfInput = document.getElementById('comfortable-park-temp');
    if (cmfInput) cmfInput.addEventListener('input', () => refreshRecommendationReminder());

    // Reset all filters
    document.getElementById('btn-reset').addEventListener('click', () => {
        activeWeather.clear();
        activePoi = new Set(['transit', 'food', 'shopping', 'sightseeing', 'playground']);
        compareSet.clear();
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.poi-filter-btn').forEach(b => b.classList.add('active'));
        closeDetail();
        document.getElementById('filter-banner').classList.remove('visible');
        renderAll();
    });
});