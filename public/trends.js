const trendsBody = document.getElementById('trendsBody');
const trendsStatus = document.getElementById('trendsStatus');
const windowSelect = document.getElementById('windowSelect');
const refreshButton = document.getElementById('refreshTrends');

function formatNumber(value) {
    return Number(value || 0).toLocaleString('en-US');
}

function formatSignedNumber(value) {
    const n = Number(value || 0);
    if (n > 0) {
        return `+${formatNumber(n)}`;
    }
    return formatNumber(n);
}

function formatSignedPercent(value) {
    const n = Number(value || 0);
    if (n > 0) {
        return `+${n.toFixed(2)}%`;
    }
    return `${n.toFixed(2)}%`;
}

function formatDateTime(value) {
    if (!value) {
        return '-';
    }

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
        return value;
    }

    return d.toLocaleString();
}

function renderRows(rows) {
    trendsBody.innerHTML = '';

    if (!rows.length) {
        trendsBody.innerHTML = '<tr><td class="empty-state" colspan="9">No movers found for this window yet. Run more scans to build history.</td></tr>';
        return;
    }

    for (const row of rows) {
        const tr = document.createElement('tr');
        const delta = Number(row.delta || 0);
        const deltaPct = Number(row.deltaPct || 0);
        const deltaClass = delta >= 0 ? 'trend-pos' : 'trend-neg';
        const deltaPctClass = deltaPct >= 0 ? 'trend-pos' : 'trend-neg';

        tr.innerHTML = `
            <td>${row.itemId}</td>
            <td>${row.name}</td>
            <td>${row.mainCategory}/${row.subCategory}</td>
            <td>${formatNumber(row.oldPrice)}</td>
            <td>${formatNumber(row.newPrice)}</td>
            <td class="${deltaClass}">${formatSignedNumber(delta)}</td>
            <td class="${deltaPctClass}">${formatSignedPercent(deltaPct)}</td>
            <td>${formatNumber(row.stock)}</td>
            <td>${formatDateTime(row.scannedAt)}</td>
        `;
        trendsBody.appendChild(tr);
    }
}

async function loadMovers() {
    const windowValue = windowSelect.value;
    trendsStatus.textContent = `Loading movers for ${windowValue}...`;
    trendsBody.innerHTML = '<tr><td class="empty-state" colspan="9">Loading...</td></tr>';

    try {
        const response = await fetch(`/api/trends/movers?window=${encodeURIComponent(windowValue)}&limit=500`);
        if (!response.ok) {
            throw new Error(`API failed with status ${response.status}`);
        }

        const payload = await response.json();
        renderRows(payload.items || []);
        trendsStatus.textContent = `Showing ${formatNumber(payload.total)} movers over ${formatNumber(payload.windowHours)}h window`;
    } catch (error) {
        console.error(error);
        trendsStatus.textContent = 'Unable to load movers.';
        trendsBody.innerHTML = '<tr><td class="empty-state" colspan="9">Failed to load trends. Check server logs.</td></tr>';
    }
}

windowSelect.addEventListener('change', loadMovers);
refreshButton.addEventListener('click', loadMovers);

await loadMovers();
