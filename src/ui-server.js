import express from 'express';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { ItemRepository } from './ItemRepository.js';
import { parseWindowToHours } from './timeWindow.js';

const app = express();
const repo = new ItemRepository();
const port = process.env.PORT || 3000;
const PROJECT_ROOT = process.cwd();
const DB_PATH = path.join(PROJECT_ROOT, 'market.db');
const STORAGE_CACHE_TTL_MS = 5 * 60 * 1000;
let storageCache = {
    measuredAt: 0,
    projectSizeBytes: null,
    dbSizeBytes: null
};

app.disable('x-powered-by');

async function getDirectorySizeBytes(dirPath) {
    let total = 0;
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);

        if (entry.isSymbolicLink()) {
            continue;
        }

        if (entry.isDirectory()) {
            total += await getDirectorySizeBytes(entryPath);
            continue;
        }

        const entryStat = await stat(entryPath);
        total += entryStat.size;
    }

    return total;
}

async function getStorageStatsCached() {
    const now = Date.now();
    if ((now - storageCache.measuredAt) < STORAGE_CACHE_TTL_MS && storageCache.projectSizeBytes !== null) {
        return storageCache;
    }

    const [projectSizeBytes, dbStat] = await Promise.all([
        getDirectorySizeBytes(PROJECT_ROOT),
        stat(DB_PATH).catch(() => null)
    ]);

    storageCache = {
        measuredAt: now,
        projectSizeBytes,
        dbSizeBytes: dbStat ? dbStat.size : null
    };

    return storageCache;
}

app.use(express.json());
app.use(express.static('public'));

app.get('/api/overview', async (_req, res) => {
    const latestDate = repo.getLatestRecordDate();
    const categories = repo.getCategoriesForLatestDate();

    const totalItems = categories.reduce((acc, category) => acc + category.itemCount, 0);
    const totalCategories = categories.length;

    let projectSizeBytes = null;
    let dbSizeBytes = null;

    try {
        const storageStats = await getStorageStatsCached();
        projectSizeBytes = storageStats.projectSizeBytes;
        dbSizeBytes = storageStats.dbSizeBytes;
    } catch (error) {
        console.error('Storage stats error:', error.message);
    }

    res.json({
        latestDate,
        totalItems,
        totalCategories,
        projectSizeBytes,
        dbSizeBytes
    });
});

app.get('/api/categories', (_req, res) => {
    const categories = repo.getCategoriesForLatestDate();
    res.json(categories);
});

app.get('/api/categories/:main/:sub/items', (req, res) => {
    const main = Number.parseInt(req.params.main, 10);
    const sub = Number.parseInt(req.params.sub, 10);
    const limitParam = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 200;

    if (!Number.isInteger(main) || !Number.isInteger(sub)) {
        return res.status(400).json({ error: 'Invalid category identifiers.' });
    }

    const items = repo.getItemsByCategory(main, sub, limit);
    return res.json(items);
});

app.get('/api/items/search', (req, res) => {
    const query = typeof req.query.name === 'string' ? req.query.name : '';
    const limitParam = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 2000) : 500;

    if (!query.trim()) {
        return res.json([]);
    }

    const items = repo.searchItemsByName(query, limit);
    return res.json(items);
});

app.get('/api/trends/movers', (req, res) => {
    const hours = Math.min(parseWindowToHours(req.query.window), 24 * 14);
    const limitParam = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 2000) : 250;

    const cutoffDate = new Date(Date.now() - (hours * 60 * 60 * 1000));
    const movers = repo.getTopMovers(cutoffDate.toISOString(), limit);

    return res.json({
        windowHours: hours,
        cutoffIso: cutoffDate.toISOString(),
        total: movers.length,
        items: movers
    });
});

app.post('/api/main-categories/:main/label', (req, res) => {
    const main = Number.parseInt(req.params.main, 10);
    const label = typeof req.body?.label === 'string' ? req.body.label : '';

    if (!Number.isInteger(main)) {
        return res.status(400).json({ error: 'Invalid main category identifier.' });
    }

    repo.setMainCategoryLabel(main, label);
    return res.json({ ok: true });
});

app.listen(port, () => {
    console.log('UI server running');
    console.log(`http://localhost:${port}`);
    console.log(`http://localhost:${port}/trends.html`);
});
