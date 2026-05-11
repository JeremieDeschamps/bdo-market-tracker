import Database from 'better-sqlite3';

export class ItemRepository {
    constructor(dbPath = 'market.db') {
        this.db = new Database(dbPath);
        this.init();
    }

    init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS daily_prices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER,
                main_category INTEGER,
                sub_category INTEGER,
                name TEXT,
                price INTEGER,
                min_price INTEGER,
                max_price INTEGER,
                stock INTEGER,
                record_date DATE DEFAULT (DATE('now')),
                UNIQUE(item_id, record_date)
            )
        `); 

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS category_scan_state (
                main_category INTEGER,
                sub_category INTEGER,
                empty_streak INTEGER DEFAULT 0,
                last_result TEXT,
                last_checked_at TEXT,
                skip_until TEXT,
                PRIMARY KEY(main_category, sub_category)
            )
        `);
        
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS category_labels (
                main_category INTEGER,
                sub_category INTEGER,
                label TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY(main_category, sub_category)
            )
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS main_category_labels (
                main_category INTEGER PRIMARY KEY,
                label TEXT NOT NULL,
                updated_at TEXT DEFAULT (datetime('now'))
            )
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                main_category INTEGER,
                sub_category INTEGER,
                price INTEGER NOT NULL,
                stock INTEGER NOT NULL,
                scanned_at TEXT NOT NULL
            )
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS item_corridors (
                item_id INTEGER PRIMARY KEY,
                name TEXT,
                min_price INTEGER,
                max_price INTEGER,
                updated_at TEXT DEFAULT (datetime('now'))
            )
        `);

        this.ensureCategoryColumns();

        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_daily_prices_record_date ON daily_prices(record_date);
            CREATE INDEX IF NOT EXISTS idx_daily_prices_main_sub ON daily_prices(main_category, sub_category);
            CREATE INDEX IF NOT EXISTS idx_category_scan_skip_until ON category_scan_state(skip_until);
            CREATE INDEX IF NOT EXISTS idx_price_history_item_time ON price_history(item_id, scanned_at);
            CREATE INDEX IF NOT EXISTS idx_price_history_scanned_at ON price_history(scanned_at);
            CREATE INDEX IF NOT EXISTS idx_item_corridors_updated_at ON item_corridors(updated_at);
        `);
    }

    ensureCategoryColumns() {
        const columns = this.db.prepare(`PRAGMA table_info(daily_prices)`).all();
        const hasMainCategory = columns.some((col) => col.name === 'main_category');
        const hasSubCategory = columns.some((col) => col.name === 'sub_category');

        if (!hasMainCategory) {
            this.db.exec(`ALTER TABLE daily_prices ADD COLUMN main_category INTEGER`);
        }

        if (!hasSubCategory) {
            this.db.exec(`ALTER TABLE daily_prices ADD COLUMN sub_category INTEGER`);
        }
    }

    saveBatch(items) {
        const upsertQuery = this.db.prepare(`
            INSERT INTO daily_prices (item_id, main_category, sub_category, name, price, min_price, max_price, stock)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(item_id, record_date)
            DO UPDATE SET
                main_category = excluded.main_category,
                sub_category = excluded.sub_category,
                price = excluded.price,
                stock = excluded.stock,
                min_price = COALESCE(NULLIF(excluded.min_price, 0), min_price),
                max_price = COALESCE(NULLIF(excluded.max_price, 0), max_price)
        `);

            const corridorUpsertQuery = this.db.prepare(`
                INSERT INTO item_corridors (item_id, name, min_price, max_price, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'))
                ON CONFLICT(item_id)
                DO UPDATE SET
                name = excluded.name,
                min_price = COALESCE(NULLIF(excluded.min_price, 0), item_corridors.min_price),
                max_price = COALESCE(NULLIF(excluded.max_price, 0), item_corridors.max_price),
                updated_at = datetime('now')
            `);

        const insertMany = this.db.transaction((rows) => {
            for (const item of rows) {
                upsertQuery.run(
                    item.id,
                    item.mainCategory,
                    item.subCategory,
                    item.name,
                    item.currentPrice,
                    item.minPrice,
                    item.maxPrice,
                    item.currentStock
                );

                if ((item.minPrice && item.minPrice > 0) || (item.maxPrice && item.maxPrice > 0)) {
                    corridorUpsertQuery.run(item.id, item.name, item.minPrice, item.maxPrice);
                }
            }
        });

        insertMany(items);
    }

    saveHistoryBatch(items, scannedAtIso) {
        const insertQuery = this.db.prepare(`
            INSERT INTO price_history (
                item_id,
                name,
                main_category,
                sub_category,
                price,
                stock,
                scanned_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const insertMany = this.db.transaction((rows) => {
            for (const item of rows) {
                insertQuery.run(
                    item.id,
                    item.name,
                    item.mainCategory,
                    item.subCategory,
                    item.currentPrice,
                    item.currentStock,
                    scannedAtIso
                );
            }
        });

        insertMany(items);
    }

    getCategoriesForLatestDate() {
        const latestDateRow = this.db.prepare(`SELECT MAX(record_date) AS latestDate FROM daily_prices`).get();
        if (!latestDateRow?.latestDate) {
            return [];
        }

        return this.db.prepare(`
            SELECT
                dp.main_category AS mainCategory,
                dp.sub_category AS subCategory,
                ml.label AS mainLabel,
                cl.label AS label,
                COUNT(*) AS itemCount,
                ROUND(AVG(dp.price), 0) AS averagePrice
            FROM daily_prices dp
            LEFT JOIN main_category_labels ml
              ON ml.main_category = dp.main_category
            LEFT JOIN category_labels cl
              ON cl.main_category = dp.main_category
             AND cl.sub_category = dp.sub_category
            WHERE dp.record_date = ?
            GROUP BY dp.main_category, dp.sub_category, ml.label, cl.label
            ORDER BY dp.main_category ASC, dp.sub_category ASC
        `).all(latestDateRow.latestDate);
    }

    setMainCategoryLabel(mainCategory, label) {
        const normalized = (label || '').trim();

        if (!normalized) {
            this.db.prepare(`
                DELETE FROM main_category_labels
                WHERE main_category = ?
            `).run(mainCategory);
            return;
        }

        this.db.prepare(`
            INSERT INTO main_category_labels (main_category, label, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(main_category)
            DO UPDATE SET
                label = excluded.label,
                updated_at = excluded.updated_at
        `).run(mainCategory, normalized);
    }

    getItemsByCategory(mainCategory, subCategory, limit = 200) {
        const latestDateRow = this.db.prepare(`SELECT MAX(record_date) AS latestDate FROM daily_prices`).get();
        if (!latestDateRow?.latestDate) {
            return [];
        }

        return this.db.prepare(`
            SELECT
                item_id AS itemId,
                name,
                price,
                COALESCE(daily_prices.min_price, item_corridors.min_price) AS minPrice,
                COALESCE(daily_prices.max_price, item_corridors.max_price) AS maxPrice,
                stock,
                record_date AS recordDate
            FROM daily_prices
            LEFT JOIN item_corridors ON item_corridors.item_id = daily_prices.item_id
            WHERE record_date = ?
              AND main_category = ?
              AND sub_category = ?
            ORDER BY price DESC
            LIMIT ?
        `).all(latestDateRow.latestDate, mainCategory, subCategory, limit);
    }

    searchItemsByName(nameQuery, limit = 500) {
        const latestDateRow = this.db.prepare(`SELECT MAX(record_date) AS latestDate FROM daily_prices`).get();
        if (!latestDateRow?.latestDate) {
            return [];
        }

        const normalized = `%${String(nameQuery || '').trim()}%`;

        return this.db.prepare(`
            SELECT
                                daily_prices.item_id AS itemId,
                                daily_prices.main_category AS mainCategory,
                                daily_prices.sub_category AS subCategory,
                                daily_prices.name AS name,
                                daily_prices.price AS price,
                                COALESCE(daily_prices.min_price, item_corridors.min_price) AS minPrice,
                                COALESCE(daily_prices.max_price, item_corridors.max_price) AS maxPrice,
                                daily_prices.stock AS stock,
                                daily_prices.record_date AS recordDate
                        FROM daily_prices
                        LEFT JOIN item_corridors ON item_corridors.item_id = daily_prices.item_id
                        WHERE daily_prices.record_date = ?
                            AND LOWER(daily_prices.name) LIKE LOWER(?)
            ORDER BY price DESC
            LIMIT ?
        `).all(latestDateRow.latestDate, normalized, limit);
    }

    getTopMovers(cutoffIso, limit = 200) {
        return this.db.prepare(`
            WITH latest_per_item AS (
                SELECT item_id, MAX(scanned_at) AS latest_ts
                FROM price_history
                GROUP BY item_id
            ),
            base_per_item AS (
                SELECT item_id, MAX(scanned_at) AS base_ts
                FROM price_history
                WHERE scanned_at <= ?
                GROUP BY item_id
            )
            SELECT
                latest.item_id AS itemId,
                latest.name,
                latest.main_category AS mainCategory,
                latest.sub_category AS subCategory,
                base.price AS oldPrice,
                latest.price AS newPrice,
                (latest.price - base.price) AS delta,
                ROUND(((latest.price - base.price) * 100.0) / NULLIF(base.price, 0), 2) AS deltaPct,
                latest.stock,
                latest.scanned_at AS scannedAt
            FROM latest_per_item l
            JOIN price_history latest
                ON latest.item_id = l.item_id
               AND latest.scanned_at = l.latest_ts
            JOIN base_per_item b
                ON b.item_id = l.item_id
            JOIN price_history base
                ON base.item_id = b.item_id
               AND base.scanned_at = b.base_ts
            WHERE base.price > 0
              AND latest.price <> base.price
            ORDER BY ABS(deltaPct) DESC, ABS(delta) DESC
            LIMIT ?
        `).all(cutoffIso, limit);
    }

    getLatestRecordDate() {
        const row = this.db.prepare(`SELECT MAX(record_date) AS latestDate FROM daily_prices`).get();
        return row?.latestDate || null;
    }

    getSkippedCategories(nowIso) {
        return this.db.prepare(`
            SELECT main_category AS mainCategory, sub_category AS subCategory
            FROM category_scan_state
            WHERE skip_until IS NOT NULL
              AND datetime(skip_until) > datetime(?)
        `).all(nowIso);
    }

    markCategoryWithData(mainCategory, subCategory, checkedAtIso) {
        this.db.prepare(`
            INSERT INTO category_scan_state (main_category, sub_category, empty_streak, last_result, last_checked_at, skip_until)
            VALUES (?, ?, 0, 'data', ?, NULL)
            ON CONFLICT(main_category, sub_category)
            DO UPDATE SET
                empty_streak = 0,
                last_result = 'data',
                last_checked_at = excluded.last_checked_at,
                skip_until = NULL
        `).run(mainCategory, subCategory, checkedAtIso);
    }

    markCategoryEmpty(mainCategory, subCategory, checkedAtIso, cooldownAfter = 3, cooldownDays = 7) {
        this.db.prepare(`
            INSERT INTO category_scan_state (main_category, sub_category, empty_streak, last_result, last_checked_at, skip_until)
            VALUES (?, ?, 1, 'empty', ?, NULL)
            ON CONFLICT(main_category, sub_category)
            DO UPDATE SET
                empty_streak = empty_streak + 1,
                last_result = 'empty',
                last_checked_at = excluded.last_checked_at
        `).run(mainCategory, subCategory, checkedAtIso);

        const row = this.db.prepare(`
            SELECT empty_streak AS emptyStreak
            FROM category_scan_state
            WHERE main_category = ? AND sub_category = ?
        `).get(mainCategory, subCategory);

        if (row?.emptyStreak >= cooldownAfter) {
            this.db.prepare(`
                UPDATE category_scan_state
                SET skip_until = datetime(?, '+' || ? || ' days')
                WHERE main_category = ? AND sub_category = ?
            `).run(checkedAtIso, cooldownDays, mainCategory, subCategory);

            const updated = this.db.prepare(`
                SELECT skip_until AS skipUntil, empty_streak AS emptyStreak
                FROM category_scan_state
                WHERE main_category = ? AND sub_category = ?
            `).get(mainCategory, subCategory);

            return updated;
        }

        return {
            skipUntil: null,
            emptyStreak: row?.emptyStreak || 0
        };
    }

    close() {
        this.db.close();
    }

}