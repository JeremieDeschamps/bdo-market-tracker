import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ItemRepository } from '../src/ItemRepository.js';

function createTempDbPath() {
    return path.join(os.tmpdir(), `bdo-market-test-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

test('saveHistoryBatch inserts rows in price_history', () => {
    const dbPath = createTempDbPath();
    const repo = new ItemRepository(dbPath);

    const scannedAt = '2026-01-01T00:00:00.000Z';
    repo.saveHistoryBatch([
        {
            id: 1001,
            name: 'Item A',
            mainCategory: 1,
            subCategory: 1,
            currentPrice: 100,
            currentStock: 10
        },
        {
            id: 1002,
            name: 'Item B',
            mainCategory: 2,
            subCategory: 3,
            currentPrice: 200,
            currentStock: 20
        }
    ], scannedAt);

    const count = repo.db.prepare('SELECT COUNT(*) AS total FROM price_history').get();
    assert.equal(count.total, 2);

    repo.close();
    fs.rmSync(dbPath, { force: true });
});

test('getTopMovers returns deltas between base and latest snapshots', () => {
    const dbPath = createTempDbPath();
    const repo = new ItemRepository(dbPath);

    repo.saveHistoryBatch([
        {
            id: 2001,
            name: 'Item Up',
            mainCategory: 1,
            subCategory: 1,
            currentPrice: 100,
            currentStock: 10
        },
        {
            id: 2002,
            name: 'Item Down',
            mainCategory: 1,
            subCategory: 2,
            currentPrice: 500,
            currentStock: 10
        }
    ], '2026-01-01T00:00:00.000Z');

    repo.saveHistoryBatch([
        {
            id: 2001,
            name: 'Item Up',
            mainCategory: 1,
            subCategory: 1,
            currentPrice: 150,
            currentStock: 8
        },
        {
            id: 2002,
            name: 'Item Down',
            mainCategory: 1,
            subCategory: 2,
            currentPrice: 450,
            currentStock: 9
        }
    ], '2026-01-01T06:00:00.000Z');

    const movers = repo.getTopMovers('2026-01-01T03:00:00.000Z', 10);
    assert.equal(movers.length, 2);

    const up = movers.find((row) => row.itemId === 2001);
    const down = movers.find((row) => row.itemId === 2002);

    assert.equal(up.oldPrice, 100);
    assert.equal(up.newPrice, 150);
    assert.equal(up.delta, 50);

    assert.equal(down.oldPrice, 500);
    assert.equal(down.newPrice, 450);
    assert.equal(down.delta, -50);

    repo.close();
    fs.rmSync(dbPath, { force: true });
});
