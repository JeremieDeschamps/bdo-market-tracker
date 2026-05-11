import cron from 'node-cron';
import { MarketApiClient } from './MarketApiClient.js';
import { ItemRepository } from './ItemRepository.js';

const api = new MarketApiClient();
const repo = new ItemRepository();

const INTRADAY_SCAN_CRON = process.env.INTRADAY_SCAN_CRON || '0 */6 * * *';
const CATEGORY_REQUEST_DELAY_MS = Number.parseInt(process.env.CATEGORY_REQUEST_DELAY_MS || '500', 10);
let isScanRunning = false;

async function runMasterScan() {
    console.log(`--- [${new Date().toLocaleTimeString()}] DÉBUT DU SCAN TOTAL DU MARCHÉ ---`);
    let totalProcessed = 0;
    let skippedByCooldown = 0;
    let emptyCount = 0;
    let unavailableCount = 0;
    const nowIso = new Date().toISOString();

    const skippedRows = repo.getSkippedCategories(nowIso);
    const skippedSet = new Set(skippedRows.map((row) => `${row.mainCategory}-${row.subCategory}`));
    
    // On scanne les catégories principales (1 à 80)
    for (let main = 1; main <= 80; main++) {
        for (let sub = 1; sub <= 20; sub++) {
            const categoryKey = `${main}-${sub}`;
            if (skippedSet.has(categoryKey)) {
                skippedByCooldown++;
                continue;
            }

            const data = await api.fetchCategory(main, sub);
            
            if (data && data.length > 0) {
                // --- LOGIQUE DE CORRECTION DES PRIX ---
                // L'API d'Arsha utilise souvent 'pricePerOne' pour les listes
                const mappedData = data.map((item) => {
                    const currentPrice = item.pricePerOne || item.basePrice || item.currentPrice || 0;
                    const rawMinPrice = item.minPrice;
                    const rawMaxPrice = item.maxPrice;

                    return {
                        id: item.id || item.mainKey,
                        mainCategory: main,
                        subCategory: sub,
                        name: item.name,
                        currentPrice,
                        minPrice: Number.isFinite(Number(rawMinPrice)) && Number(rawMinPrice) > 0 ? Number(rawMinPrice) : null,
                        maxPrice: Number.isFinite(Number(rawMaxPrice)) && Number(rawMaxPrice) > 0 ? Number(rawMaxPrice) : null,
                        currentStock: item.count || item.currentStock || 0
                    };
                });

                console.log(`[Cat ${main}-${sub}] : ${mappedData.length} items (Ex: ${mappedData[0].name} @ ${mappedData[0].currentPrice} silver)`);
                // Sauvegarde par lot (Batch)
                repo.saveBatch(mappedData);
                repo.saveHistoryBatch(mappedData, new Date().toISOString());
                repo.markCategoryWithData(main, sub, nowIso);
                
                totalProcessed += mappedData.length;
            } else if (Array.isArray(data)) {
                const state = repo.markCategoryEmpty(main, sub, nowIso);
                emptyCount++;
                if (state.skipUntil) {
                    skippedSet.add(categoryKey);
                    console.log(`[Cat ${main}-${sub}] vide ${state.emptyStreak} fois, pause jusqu'au ${state.skipUntil}`);
                } else {
                    console.log(`[Cat ${main}-${sub}] : vide (${state.emptyStreak})`);
                }
            } else {
                unavailableCount++;
                console.log(`[Cat ${main}-${sub}] : indisponible (on réessaiera au prochain scan)`);
            }

            // Delai configurable pour limiter le risque de rate-limit.
            await new Promise((resolve) => setTimeout(resolve, Number.isFinite(CATEGORY_REQUEST_DELAY_MS) ? CATEGORY_REQUEST_DELAY_MS : 500));
        }
    }
    
    console.log(`\n--- SCAN TOTAL TERMINÉ : ${totalProcessed} ITEMS EN BASE ---`);
    console.log(`Résumé scan: ${emptyCount} catégories vides, ${unavailableCount} indisponibles, ${skippedByCooldown} sautées (cache vide).`);
}

async function triggerScan(reason) {
    if (isScanRunning) {
        console.log(`[${new Date().toLocaleTimeString()}] Scan ignoré (${reason}) : un scan est déjà en cours.`);
        return;
    }

    isScanRunning = true;
    try {
        console.log(`[${new Date().toLocaleTimeString()}] Lancement scan (${reason})`);
        await runMasterScan();
    } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] Erreur scan (${reason})`, error);
    } finally {
        isScanRunning = false;
    }
}

// Lancement immédiat
await triggerScan('startup');

// Planification automatique: 4 scans par jour (toutes les 6 heures).
cron.schedule(INTRADAY_SCAN_CRON, () => {
    triggerScan('intraday');
});
