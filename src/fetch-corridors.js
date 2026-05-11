import { MarketApiClient } from './MarketApiClient.js';
import { ItemRepository } from './ItemRepository.js';

const api = new MarketApiClient();
const repo = new ItemRepository();
const ITEM_REQUEST_DELAY_MS = Number.parseInt(process.env.ITEM_REQUEST_DELAY_MS || '900', 10);

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
    
    console.log(`Correction de ${itemsToFix.length} items...`);

    for (const item of itemsToFix) {
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
            
            console.log(`${item.name} mis à jour.`);
        }

        // Delai configurable pour limiter le risque de rate-limit.
        await new Promise((resolve) => setTimeout(resolve, Number.isFinite(ITEM_REQUEST_DELAY_MS) ? ITEM_REQUEST_DELAY_MS : 900));
    }

    console.log('Enrichissement des corridors terminé.');
    repo.close();
}

await populateCorridors();