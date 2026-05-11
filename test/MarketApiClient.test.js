import test from 'node:test';
import assert from 'node:assert/strict';

import { MarketApiClient, normalizeRegion } from '../src/MarketApiClient.js';

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

    if (typeof previous === 'undefined') {
        delete process.env.BDO_REGION;
    } else {
        process.env.BDO_REGION = previous;
    }
});
