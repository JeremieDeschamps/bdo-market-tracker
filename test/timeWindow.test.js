import test from 'node:test';
import assert from 'node:assert/strict';

import { parseWindowToHours } from '../src/timeWindow.js';

test('parseWindowToHours parses hours correctly', () => {
    assert.equal(parseWindowToHours('6h'), 6);
    assert.equal(parseWindowToHours('24h'), 24);
    assert.equal(parseWindowToHours(' 12H '), 12);
});

test('parseWindowToHours parses days correctly', () => {
    assert.equal(parseWindowToHours('1d'), 24);
    assert.equal(parseWindowToHours('7d'), 168);
});

test('parseWindowToHours falls back to 24 for invalid input', () => {
    assert.equal(parseWindowToHours(''), 24);
    assert.equal(parseWindowToHours('abc'), 24);
    assert.equal(parseWindowToHours('-1h'), 24);
    assert.equal(parseWindowToHours('0h'), 24);
});
