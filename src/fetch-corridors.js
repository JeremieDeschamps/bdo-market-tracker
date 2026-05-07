import { MarketApiClient } from './src/MarketApiClient.js';
import { ItemRepository } from './src/ItemRepository.js';

const api = new MarketApiClient();
const repo = new ItemRepository();

async function populateCorridors() {
    // On récupère tous les items qui n'ont pas encore de min/max
    const itemsToFix = repo.db.prepare("SELECT item_id, name FROM daily_prices WHERE min_price IS NULL OR min_price = 0").all();
    
    console.log(`🔧 Correction de ${itemsToFix.length} items...`);

    for (const item of itemsToFix) {
        const detail = await api.fetchItemData(item.item_id);
        if (detail) {
            // On met à jour l'item en base
            repo.db.prepare("UPDATE daily_prices SET min_price = ?, max_price = ? WHERE item_id = ?")
                   .run(detail.minPrice, detail.maxPrice, item.item_id);
            
            console.log(`✅ ${item.name} mis à jour.`);
        }
        // Très important : on attend 1 seconde pour ne pas se faire bannir
        await new Promise(r => setTimeout(r, 1000));
    }
}