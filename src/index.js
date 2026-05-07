import cron from 'node-cron';
import { MarketApiClient } from './MarketApiClient.js';
import { ItemRepository } from './ItemRepository.js';

const api = new MarketApiClient();
const repo = new ItemRepository();

async function runMasterScan() {
    console.log(`--- [${new Date().toLocaleTimeString()}] DÉBUT DU SCAN TOTAL DU MARCHÉ ---`);
    let totalProcessed = 0;
    
    // On scanne les catégories principales (1 à 80)
    for (let main = 1; main <= 80; main++) {
        let emptySubCount = 0;
        
        for (let sub = 1; sub <= 20; sub++) {
            const data = await api.fetchCategory(main, sub);
            
            if (data && data.length > 0) {
                // --- LOGIQUE DE CORRECTION DES PRIX ---
                // L'API d'Arsha utilise souvent 'pricePerOne' pour les listes
                const mappedData = data.map(item => ({
                    id: item.id || item.mainKey,
                    name: item.name,
                    currentPrice: item.pricePerOne || item.basePrice || item.currentPrice || 0,
                    minPrice: item.minPrice || item.pricePerOne || item.basePrice || item.currentPrice || 0,
                    maxPrice: item.maxPrice || item.pricePerOne || item.basePrice || item.currentPrice || 0,
                    currentStock: item.count || item.currentStock || 0
                }));

                console.log(`✅ [Cat ${main}-${sub}] : ${mappedData.length} items (Ex: ${mappedData[0].name} @ ${mappedData[0].currentPrice} silver)`);
                console.log("DEBUG ITEM:", data[0]); // Affiche le premier item brut pour vérification
                // Sauvegarde par lot (Batch)
                repo.saveBatch(mappedData);
                
                totalProcessed += mappedData.length;
                emptySubCount = 0; 
            } else {
                emptySubCount++;
            }

            // Arrête de scanner cette catégorie Main s'il y a 3 vides de suite
            if (emptySubCount >= 3) break;

            // Délai pour ne pas brusquer l'API
            await new Promise(r => setTimeout(r, 350));
        }
    }
    
    console.log(`\n--- SCAN TOTAL TERMINÉ : ${totalProcessed} ITEMS EN BASE ---`);
}

// Lancement immédiat
runMasterScan();

// Planification : Chaque jour à minuit
cron.schedule('0 0 * * *', () => {
    runMasterScan();
});