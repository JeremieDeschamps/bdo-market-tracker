import axios from 'axios';

export function normalizeRegion(input) {
    const rawRegion = String(input || 'eu').toLowerCase().trim();
    return rawRegion === 'na' ? 'na' : 'eu';
}

export class MarketApiClient {
    constructor() {
        const region = normalizeRegion(process.env.BDO_REGION);
        this.baseUrl = `https://api.arsha.io/v2/${region}`;
        
        this.config = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        };

        console.log(`[MarketApiClient] Region: ${region.toUpperCase()} (${this.baseUrl})`);
    }

    async fetchItemData(itemId, retries = 4) {
        const url = `${this.baseUrl}/item?id=${itemId}`;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await axios.get(url, this.config);
                return response.data;
            } catch (error) {
                const status = error.response?.status;
                const isTransient = status === 429 || !status || status >= 500;
                const isLastAttempt = attempt === retries;

                if (!isTransient || isLastAttempt) {
                    console.error(`Erreur API (Item ${itemId}) :`, status || error.message);
                    return null;
                }

                const baseDelayMs = 800;
                const jitterMs = Math.floor(Math.random() * 250);
                const delayMs = (baseDelayMs * (attempt + 1)) + jitterMs;
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }

    async fetchCategory(mainCatId, subCatId, retries = 2) {
        const url = `${this.baseUrl}/category?mainCategory=${mainCatId}&subCategory=${subCatId}`;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await axios.get(url, this.config);
                return response.data;
            } catch (error) {
                const status = error.response?.status;
                const isTransient = !status || status >= 500;
                const isLastAttempt = attempt === retries;

                if (status === 400 || status === 404) {
                    return [];
                }

                if (!isTransient || isLastAttempt) {
                    if (status !== 400 && status !== 404) {
                        console.error(`Erreur API (${mainCatId}-${subCatId}) :`, status || error.message);
                    }
                    return null;
                }

                await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
            }
        }
    }
}