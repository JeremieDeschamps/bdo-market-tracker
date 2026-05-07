import Database from 'better-sqlite3';
import { it } from 'node:test';

export class ItemRepository {
    constructor() {
        this.db = new Database('market.db');
        this.init();
    }

    init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS daily_prices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER,
                name TEXT,
                price INTEGER,
                min_price INTEGER,
                max_price INTEGER,
                stock INTEGER,
                record_date DATE DEFAULT (DATE('now')),
                UNIQUE(item_id, record_date)
            )
        `); 
    }

    saveDailySnapshot(item) {
        const upsertQuery = this.db.prepare(`
            INSERT INTO daily_prices (item_id, name, price, stock) 
            VALUES (?, ?, ?, ?)
            ON CONFLICT(item_id, record_date) 
            DO UPDATE SET price=excluded.price, stock=excluded.stock
        `);
        upsertQuery.run(item.id, item.name, item.currentPrice, item.currentStock);
    }

// Dans ItemRepository.js, ajoute cette méthode pour traiter par lots
saveBatch(items) {
    const upsertQuery = this.db.prepare(`
        INSERT INTO daily_prices (item_id, name, price, min_price, max_price, stock) 
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(item_id, record_date) 
        DO UPDATE SET 
            price = excluded.price,
            stock = excluded.stock,
            -- On ne met à jour min/max que si la nouvelle valeur n'est pas nulle
            min_price = COALESCE(NULLIF(excluded.min_price, 0), min_price),
            max_price = COALESCE(NULLIF(excluded.max_price, 0), max_price)
    `);

    const insertMany = this.db.transaction((items) => {
        for (const item of items) {
            upsertQuery.run(
                item.id,
                item.name,
                item.currentPrice,
                item.minPrice || item.currentPrice, // Si minPrice n'existe pas, on utilise currentPrice
                item.maxPrice || item.currentPrice, // Idem pour maxPrice
                item.currentStock
            );
        }
    });

    insertMany(items);
}

}