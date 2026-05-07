import Database from "better-sqlite3";

const db = new Database('market.db');
console.log('---ANALYSE DU MARCHÉ---');
const stats = db.prepare(`
    SELECT name, price, stock
    FROM daily_prices
    WHERE stock > 0
    ORDER BY price DESC
    LIMIT 10
`).all();

console.log('Top 10 des items les plus chers en stock :');
console.table(stats);

//Item en rupture
const shortages = db.prepare(`
    SELECT name, price
    FROM daily_prices
    WHERE stock = 0
    AND price > 5000000
    LIMIT 10
`).all();

console.log('\n rupture de stock (prix > 5M) :');
console.table(shortages);