import test from 'node:test';
import assert from 'node:assert/strict';

import { MarketApiClient, normalizeRegion } from '../src/MarketApiClient.js';
import axios from 'axios';

test('normalizeRegion defaults to eu for empty/unknown values', () => {
    assert.equal(normalizeRegion(undefined), 'eu');
    assert.equal(normalizeRegion(''), 'eu');
    assert.equal(normalizeRegion('asia'), 'eu');
});

test('normalizeRegion accepts eu and na in any case', () => {
    assert.equal(normalizeRegion('eu'), 'eu');
    assert.equal(normalizeRegion('EU'), 'eu');
    assert.equal(normalizeRegion(' na '), 'na');
});

test('MarketApiClient builds baseUrl from BDO_REGION', () => {
    const previous = process.env.BDO_REGION;

    process.env.BDO_REGION = 'na';
    const naClient = new MarketApiClient();
    assert.equal(naClient.baseUrl, 'https://api.arsha.io/v2/na');

    process.env.BDO_REGION = 'eu';
    const euClient = new MarketApiClient();
    assert.equal(euClient.baseUrl, 'https://api.arsha.io/v2/eu');

    process.env.BDO_REGION = 'invalid';
    const fallbackClient = new MarketApiClient();
    assert.equal(fallbackClient.baseUrl, 'https://api.arsha.io/v2/eu');

    if (previous === undefined) {
        delete process.env.BDO_REGION;
    } else {
        process.env.BDO_REGION = previous;
    }
});

test('fetchItemData normalizes priceMin and priceMax into minPrice and maxPrice', async () => {
    const originalGet = axios.get;
    axios.get = async () => ({
        data: [
            {
                id: 4001,
                sid: 0,
                name: 'Iron Ore',
                basePrice: 2220,
                priceMin: 300,
                priceMax: 3000,
                currentStock: 123
            },
            {
                id: 4001,
                sid: 8,
                name: 'Iron Ore',
                basePrice: 9999,
                priceMin: 111,
                priceMax: 222
            }
        ]
    });

    try {
        const client = new MarketApiClient();
        const item = await client.fetchItemData(4001, 0);

        assert.equal(item.minPrice, 300);
        assert.equal(item.maxPrice, 3000);
        assert.equal(item.currentPrice, 2220);
    } finally {
        axios.get = originalGet;
    }
});
