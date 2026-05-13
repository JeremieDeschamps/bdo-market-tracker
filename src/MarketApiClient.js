import axios from 'axios';

export function normalizeRegion(input) {
    const rawRegion = String(input || 'eu').toLowerCase().trim();
    return rawRegion === 'na' ? 'na' : 'eu';
}

export class MarketApiClient {
    constructor() {
        const region = normalizeRegion(process.env.BDO_REGION);
        this.baseUrl = `https://api.arsha.io/v2/${region}`;
        this.requestTimeoutMs = Number.parseInt(process.env.API_TIMEOUT_MS || '20000', 10);
        this.categoryRetries = Number.parseInt(process.env.CATEGORY_RETRIES || '5', 10);
        this.categoryRetryBaseDelayMs = Number.parseInt(process.env.CATEGORY_RETRY_BASE_DELAY_MS || '900', 10);
        
        this.config = {
            timeout: Number.isFinite(this.requestTimeoutMs) ? this.requestTimeoutMs : 20000,
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
                const payload = response.data;
                const item = Array.isArray(payload)
                    ? payload.find((entry) => Number(entry.sid) === 0) || payload[0] || null
                    : payload;

                if (!item) {
                    return null;
                }

                return {
                    ...item,
                    minPrice: item.minPrice ?? item.priceMin ?? null,
                    maxPrice: item.maxPrice ?? item.priceMax ?? null,
                    currentPrice: item.currentPrice ?? item.basePrice ?? item.lastSoldPrice ?? 0
                };
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

    normalizeCategoryResponse(payload) {
        if (Array.isArray(payload)) {
            return payload;
        }

        const embeddedStatus = Number(payload?.status || 0);
        if (embeddedStatus >= 500) {
            throw new Error(`Gateway payload status ${embeddedStatus}`);
        }

        return [];
    }

    isCategoryNotFoundStatus(status) {
        return status === 400 || status === 404;
    }

    shouldRetryCategory(status) {
        return status === 429 || !status || status >= 500;
    }

    getCategoryRetryDelayMs(attempt) {
        const jitterMs = Math.floor(Math.random() * 300);
        return (this.categoryRetryBaseDelayMs * (attempt + 1)) + jitterMs;
    }

    async fetchCategory(mainCatId, subCatId, retries = this.categoryRetries) {
        const url = `${this.baseUrl}/category?mainCategory=${mainCatId}&subCategory=${subCatId}`;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await axios.get(url, this.config);
                return this.normalizeCategoryResponse(response.data);
            } catch (error) {
                const status = error.response?.status;
                const isLastAttempt = attempt === retries;

                if (this.isCategoryNotFoundStatus(status)) {
                    return [];
                }

                if (!this.shouldRetryCategory(status) || isLastAttempt) {
                    console.error(`Erreur API (${mainCatId}-${subCatId}) :`, status || error.message);
                    return null;
                }

                await new Promise((resolve) => setTimeout(resolve, this.getCategoryRetryDelayMs(attempt)));
            }
        }
    }
}