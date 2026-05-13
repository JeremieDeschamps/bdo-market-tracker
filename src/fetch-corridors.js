import { MarketApiClient } from './MarketApiClient.js';
import { ItemRepository } from './ItemRepository.js';

const api = new MarketApiClient();
const repo = new ItemRepository();
const ITEM_REQUEST_DELAY_MS = Number.parseInt(process.env.ITEM_REQUEST_DELAY_MS || '900', 10);
const CORRIDORS_MODE = process.env.CORRIDORS_MODE || 'normal';
const HEARTBEAT_INTERVAL_MS = 15000;

function formatValue(value) {
    if (value === null || value === undefined || Number(value) === 0) {
        return '-';
    }

    return Number(value).toLocaleString('en-US');
}

function formatDelta(previousValue, nextValue) {
    if (previousValue === null || previousValue === undefined || Number(previousValue) === 0) {
        return 'new';
    }

    const delta = Number(nextValue) - Number(previousValue);
    if (delta === 0) {
        return '0';
    }

    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta.toLocaleString('en-US')}`;
}

async function populateCorridors() {
    // On récupère les items du dernier snapshot dont les corridors ne sont pas encore en cache.
    const itemsToFix = repo.db.prepare(`
        SELECT DISTINCT dp.item_id, dp.name
        FROM daily_prices dp
        LEFT JOIN item_corridors ic ON ic.item_id = dp.item_id
        WHERE dp.record_date = (SELECT MAX(record_date) FROM daily_prices)
          AND (
            ic.item_id IS NULL
            OR ic.min_price IS NULL
            OR ic.min_price = 0
            OR ic.max_price IS NULL
            OR ic.max_price = 0
          )
    `).all();

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let lastItemName = 'aucun';

    console.log(`[corridors] démarrage | mode=${CORRIDORS_MODE} | delay=${ITEM_REQUEST_DELAY_MS}ms | items=${itemsToFix.length}`);

    const heartbeat = setInterval(() => {
        console.log(`[corridors] actif | ${processed}/${itemsToFix.length} traités | maj=${updated} | skip=${skipped} | fail=${failed} | dernier=${lastItemName}`);
    }, HEARTBEAT_INTERVAL_MS);

    try {
        for (const item of itemsToFix) {
            lastItemName = item.name;
            const existingCorridor = repo.db.prepare(`
                SELECT min_price AS minPrice, max_price AS maxPrice
                FROM item_corridors
                WHERE item_id = ?
            `).get(item.item_id);
            const detail = await api.fetchItemData(item.item_id);

            if (detail && Number(detail.minPrice) > 0 && Number(detail.maxPrice) > 0) {
                repo.db.prepare(`
                    INSERT INTO item_corridors (item_id, name, min_price, max_price, updated_at)
                    VALUES (?, ?, ?, ?, datetime('now'))
                    ON CONFLICT(item_id)
                    DO UPDATE SET
                        name = excluded.name,
                        min_price = excluded.min_price,
                        max_price = excluded.max_price,
                        updated_at = excluded.updated_at
                `).run(item.item_id, item.name, detail.minPrice, detail.maxPrice);

                    repo.db.prepare(`
                        UPDATE daily_prices
                        SET min_price = ?, max_price = ?
                        WHERE item_id = ?
                          AND record_date = (SELECT MAX(record_date) FROM daily_prices)
                    `).run(detail.minPrice, detail.maxPrice, item.item_id);

                updated++;
                console.log(
                    `[corridors] ${processed + 1}/${itemsToFix.length} mis à jour | ${item.name}`
                    + ` | min ${formatValue(existingCorridor?.minPrice)} -> ${formatValue(detail.minPrice)} (Δ ${formatDelta(existingCorridor?.minPrice, detail.minPrice)})`
                    + ` | max ${formatValue(existingCorridor?.maxPrice)} -> ${formatValue(detail.maxPrice)} (Δ ${formatDelta(existingCorridor?.maxPrice, detail.maxPrice)})`
                );
            } else if (detail) {
                skipped++;
                console.log(
                    `[corridors] ${processed + 1}/${itemsToFix.length} ignoré | ${item.name}`
                    + ` | reçu min=${formatValue(detail.minPrice)} | max=${formatValue(detail.maxPrice)}`
                );
            } else {
                failed++;
                console.log(`[corridors] ${processed + 1}/${itemsToFix.length} échec | ${item.name} | requête API sans réponse utile`);
            }

            processed++;
            await new Promise((resolve) => setTimeout(resolve, Number.isFinite(ITEM_REQUEST_DELAY_MS) ? ITEM_REQUEST_DELAY_MS : 900));
        }
    } finally {
        clearInterval(heartbeat);
        console.log(`[corridors] terminé | total=${itemsToFix.length} | traités=${processed} | maj=${updated} | skip=${skipped} | fail=${failed}`);
        repo.close();
    }
}

await populateCorridors();