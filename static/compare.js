/* ============================================================
   compare.js — Compare page
   Depends on common.js
   ============================================================ */

let compareSet = new Set();

document.addEventListener('DOMContentLoaded', () => {
    loadParks().then(() => {
        renderPicker();
        loadAllParkTemps();
        computeQuietness();
    });

    document.getElementById('btn-clear-compare').addEventListener('click', () => {
        compareSet.clear();
        renderPicker();
        renderComparison();
    });

    document.addEventListener('temps-loaded', renderComparison);
    document.addEventListener('quietness-computed', renderComparison);
});

function renderPicker() {
    const wrap = document.getElementById('compare-picker');
    wrap.innerHTML = PARKS.map(p => `
        <button class="compare-chip ${compareSet.has(p.id) ? 'selected' : ''}" data-id="${p.id}">
            <span class="chip-check">${compareSet.has(p.id) ? '✓' : '+'}</span>
            <span class="chip-name">${p.name}</span>
            <span class="chip-district">${p.district}</span>
        </button>`).join('');

    wrap.querySelectorAll('.compare-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            if (compareSet.has(id)) compareSet.delete(id);
            else compareSet.add(id);
            renderPicker();
            renderComparison();
        });
    });

    const n = compareSet.size;
    document.getElementById('compare-count-label').textContent = `${n} selected`;
}

function renderComparison() {
    const wrap = document.getElementById('compare-table');
    const n = compareSet.size;
    document.getElementById('compare-count-label').textContent = `${n} selected`;

    if (n < 2) {
        wrap.innerHTML = `<div class="empty-state visible">
            <div class="es-icon">📊</div>
            <h3>Nothing to compare yet</h3>
            <p>Select at least two parks above.</p>
        </div>`;
        return;
    }

    const parks = [...compareSet].map(id => getPark(id)).filter(Boolean);

    // live-temperature row
    const tempRow = parks.map(p => {
        const t = parkTempCache[p.id];
        const diff = (t != null && bambergAvgTemp != null) ? t - bambergAvgTemp : null;
        const diffTxt = diff != null ? ` <span class="${diff < 0 ? 'temp-cool' : 'temp-warm'}">(${diff >= 0 ? '+' : ''}${diff.toFixed(1)}°)</span>` : '';
        return `<td>${t != null ? `${t.toFixed(1)}°C${diffTxt}` : '—'}</td>`;
    }).join('');

    const conditionRows = CONDITION_KEYS.map(key => {
        const cells = parks.map(p => {
            const val = p.conditions[key] || 0;
            const fact = conditionFactLabel(p, key);
            return `<td>
                <div class="cmp-bar-wrap">
                    <div class="cmp-bar-bg"><div class="cmp-bar-fill" style="width:${val * 10}%"></div></div>
                    <span class="cmp-val">${val}/10</span>
                </div>
                ${fact ? `<span class="cmp-fact">${fact}</span>` : ''}
            </td>`;
        }).join('');
        return `<tr><th>${conditionIcon(key)} ${CONDITION_LABELS[key]}</th>${cells}</tr>`;
    }).join('');

    wrap.innerHTML = `
        <table class="compare-table">
            <thead>
                <tr><th></th>${parks.map(p => `<th><a href="/park/${p.id}" class="cmp-park-name">${p.name}</a><span class="cmp-park-district">${p.district}</span></th>`).join('')}</tr>
            </thead>
            <tbody>
                ${conditionRows}
                <tr class="cmp-temp-row"><th>🌡️ Live temperature</th>${tempRow}</tr>
            </tbody>
        </table>`;
}
