# BDO Market Tracker

Application Node.js pour scanner le Market de Black Desert Online (Arsha API), stocker les snapshots de prix, et visualiser:
- les categories et items du dernier snapshot
- les tendances de prix (hausses/baisse) dans le temps

## Fonctionnalites

- Scan automatique du market (au demarrage + cron)
- Stockage quotidien des prix dans `daily_prices`
- Historique intraday dans `price_history`
- Cache des categories vides pour limiter les appels API inutiles
- Interface web:
- Dashboard categories/items
- Page `Price Movers` pour les tendances
- Region configurable (`EU` par defaut, `NA` possible)

## Prerequis

- Node.js 20+
- npm
- Windows PowerShell: utiliser `npm.cmd` (pas `npm`) si execution policy bloque les scripts

## Installation

```bash
npm.cmd install
```

## Lancement

### 1) Scanner (collecte des donnees)

```bash
npm.cmd run scan
```

Mode prudent (anti rate-limit):

```bash
npm.cmd run scan:safe
```

Comportement:
- Lance un scan immediat au demarrage
- Puis scan automatique 4 fois par jour (toutes les 6 heures)

### 1.b) Corridors min/max (une fois puis cache)

Les champs `min_price` / `max_price` sont des bornes d'item. Ils ne changent pratiquement pas et sont caches par item.

Commande d'enrichissement:

```bash
npm.cmd run corridors
```

Mode prudent (anti rate-limit):

```bash
npm.cmd run corridors:safe
```

Cette commande recupere les min/max manquants et les enregistre dans le cache `item_corridors`.

### 2) Interface web

Dans un autre terminal:

```bash
npm.cmd run ui
```

Acces:
- Dashboard: http://localhost:3000
- Trends: http://localhost:3000/trends.html

## Configuration

Variables d'environnement disponibles:

- `BDO_REGION`: `eu` (defaut) ou `na`
- `INTRADAY_SCAN_CRON`: expression cron du scan auto (defaut `0 */6 * * *`)

Exemples PowerShell:

```powershell
$env:BDO_REGION = "eu"
$env:INTRADAY_SCAN_CRON = "0 */6 * * *"
npm.cmd run scan
```

## Base de donnees

Le fichier SQLite est `market.db`.

Tables principales:
- `daily_prices`: snapshot journalier par item
- `price_history`: historique timestamped pour les tendances
- `item_corridors`: cache des min/max par item (persistant)
- `category_scan_state`: etat/cooldown des categories vides
- `category_labels`, `main_category_labels`: labels de categories

## Tests unitaires

Le projet utilise le runner natif `node:test`.

Lancer tous les tests:

```bash
npm.cmd test
```

Mode watch:

```bash
npm.cmd run test:watch
```

Contenu de la suite actuelle:
- tests de normalisation de region API
- tests de parsing des fenetres de tendances
- tests repository (insertion historique + calcul des movers)

## Architecture rapide

- `src/index.js`: orchestration scanner + cron
- `src/MarketApiClient.js`: client HTTP Arsha API
- `src/ItemRepository.js`: couche SQLite
- `src/ui-server.js`: serveur Express + endpoints JSON
- `public/`: interface web statique
- `test/`: tests unitaires

## Depannage

### Port 3000 deja utilise

Sous PowerShell:

```powershell
$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Stop-Process -Id $conn.OwningProcess -Force }
```

Puis relancer:

```bash
npm.cmd run ui
```

### L'UI ne montre pas de movers

La page Trends compare un etat recent avec un etat plus ancien.
Il faut donc:
- plusieurs scans
- un ecart de temps suffisant selon la fenetre choisie (6h, 24h, etc.)

## Licence

ISC
