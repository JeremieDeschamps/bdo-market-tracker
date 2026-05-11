import express from 'express';
import { ItemRepository } from './ItemRepository.js';
import { parseWindowToHours } from './timeWindow.js';

const app = express();
const repo = new ItemRepository();
const port = process.env.PORT || 3000;

app.disable('x-powered-by');

app.use(express.json());
app.use(express.static('public'));

app.get('/api/overview', (_req, res) => {
    const latestDate = repo.getLatestRecordDate();
    const categories = repo.getCategoriesForLatestDate();

    const totalItems = categories.reduce((acc, category) => acc + category.itemCount, 0);
    const totalCategories = categories.length;

    res.json({
        latestDate,
        totalItems,
        totalCategories
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
    console.log(`UI server running on http://localhost:${port}`);
});
