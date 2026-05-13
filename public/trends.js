const trendsBody = document.getElementById('trendsBody');
const trendsStatus = document.getElementById('trendsStatus');
const trendsRefreshStatus = document.getElementById('trendsRefreshStatus');
const windowSelect = document.getElementById('windowSelect');
const refreshButton = document.getElementById('refreshTrends');
const sortableHeaders = document.querySelectorAll('th[data-sort]');

const POLL_INTERVAL_MS = 60000;
let trendsPollId = null;
let currentRows = [];
const sortState = {
    field: null,
    direction: 'desc'
};

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

function updateRefreshStatus(message) {
    if (!trendsRefreshStatus) {
        return;
    }

    trendsRefreshStatus.textContent = message;
}

function getSortedRows(rows) {
    if (!sortState.field) {
        return rows;
    }

    const directionFactor = sortState.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
        const valueA = Number(a[sortState.field] || 0);
        const valueB = Number(b[sortState.field] || 0);
        return (valueA - valueB) * directionFactor;
    });
}

function updateSortHeaderIndicators() {
    for (const header of sortableHeaders) {
        const field = header.dataset.sort;
        if (!field) {
            continue;
        }

        const baseText = field === 'delta' ? 'Delta' : 'Delta %';
        if (sortState.field !== field) {
            header.textContent = baseText;
            continue;
        }

        header.textContent = `${baseText} ${sortState.direction === 'asc' ? '↑' : '↓'}`;
    }
}

function renderRows(rows) {
    trendsBody.innerHTML = '';

    const sortedRows = getSortedRows(rows);

    if (!sortedRows.length) {
        trendsBody.innerHTML = '<tr><td class="empty-state" colspan="9">No movers found for this window yet. Run more scans to build history.</td></tr>';
        return;
    }

    for (const row of sortedRows) {
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
        currentRows = payload.items || [];
        renderRows(currentRows);
        trendsStatus.textContent = `Showing ${formatNumber(payload.total)} movers over ${formatNumber(payload.windowHours)}h window`;
    } catch (error) {
        console.error(error);
        trendsStatus.textContent = 'Unable to load movers.';
        trendsBody.innerHTML = '<tr><td class="empty-state" colspan="9">Failed to load trends. Check server logs.</td></tr>';
    }
}

windowSelect.addEventListener('change', loadMovers);
refreshButton.addEventListener('click', loadMovers);

for (const header of sortableHeaders) {
    header.addEventListener('click', () => {
        const field = header.dataset.sort;
        if (!field) {
            return;
        }

        if (sortState.field === field) {
            sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortState.field = field;
            sortState.direction = 'desc';
        }

        updateSortHeaderIndicators();
        renderRows(currentRows);
    });
}

updateSortHeaderIndicators();

await loadMovers();
updateRefreshStatus(`Last refresh: ${new Date().toLocaleTimeString()} | Auto-refresh every 60s`);

trendsPollId = setInterval(async () => {
    try {
        await loadMovers();
        updateRefreshStatus(`Last refresh: ${new Date().toLocaleTimeString()} | Auto-refresh every 60s`);
    } catch (error) {
        console.error(error);
        updateRefreshStatus('Auto-refresh failed. Check server logs and retry.');
    }
}, POLL_INTERVAL_MS);
