// Importe toutes les cartes Disney Lorcana depuis l'API publique Lorcast (https://lorcast.com/docs/api)
// dans une base SQLite (data/lorcana.db) et télécharge les visuels des cartes (images/).
//
// Usage :
//   node scripts/import-lorcana.mjs              -> données + images (taille "normal")
//   node scripts/import-lorcana.mjs --no-images  -> données uniquement
//   node scripts/import-lorcana.mjs --size=large -> images en grande taille (small|normal|large)
//
// Relançable : les images déjà présentes ne sont pas retéléchargées, les cartes sont mises à jour (UPSERT).

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.lorcast.com/v0';
const args = process.argv.slice(2);
const WITH_IMAGES = !args.includes('--no-images');
const SIZE = (args.find(a => a.startsWith('--size=')) || '--size=normal').split('=')[1];
const DELAY_MS = 110; // Lorcast demande ~10 requêtes/s maximum

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'lorcana-tcg-db-import/1.0' } });
    if (res.ok) return res.json();
    if (attempt >= 4) throw new Error(`${res.status} ${url}`);
    await sleep(1000 * attempt);
  }
}

// ---------- Schéma ----------
mkdirSync(join(ROOT, 'data'), { recursive: true });
const db = new DatabaseSync(join(ROOT, 'data', 'lorcana.db'));
db.exec(`
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS sets (
  id             TEXT PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  released_at    TEXT,
  prereleased_at TEXT,
  card_count     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cards (
  id               TEXT PRIMARY KEY,
  set_id           TEXT NOT NULL REFERENCES sets(id),
  set_code         TEXT NOT NULL,
  collector_number TEXT NOT NULL,
  name             TEXT NOT NULL,
  version          TEXT,              -- sous-titre ("On Human Legs")
  full_name        TEXT NOT NULL,     -- "Ariel - On Human Legs"
  layout           TEXT,
  card_type        TEXT,              -- type principal : Character, Action, Item, Location...
  types            TEXT,              -- JSON, ex. ["Action","Song"]
  ink              TEXT,              -- Amber, Amethyst, Emerald, Ruby, Sapphire, Steel (NULL si bicolore)
  inks             TEXT,              -- JSON pour les cartes bicolores
  cost             INTEGER,
  inkwell          INTEGER,           -- 1 = peut aller dans l'encrier
  strength         INTEGER,
  willpower        INTEGER,
  lore             INTEGER,
  move_cost        INTEGER,           -- lieux
  rarity           TEXT,
  text             TEXT,
  flavor_text      TEXT,
  illustrators     TEXT,              -- JSON
  lang             TEXT,
  released_at      TEXT,
  legal_core       TEXT,
  legal_infinity   TEXT,
  price_usd        REAL,
  price_usd_foil   REAL,
  image_url_small  TEXT,
  image_url_normal TEXT,
  image_url_large  TEXT,
  image_url_official TEXT,            -- visuel officiel Ravensburger (via lorcana-api.com), si disponible
  image_path       TEXT,              -- chemin local relatif à la racine du projet
  image_source     TEXT,              -- 'ravensburger' ou 'lorcast'
  raw_json         TEXT NOT NULL,     -- réponse API complète, pour ne rien perdre
  updated_at       TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cards_set    ON cards(set_code, collector_number);
CREATE INDEX IF NOT EXISTS idx_cards_ink    ON cards(ink);
CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards(rarity);
CREATE INDEX IF NOT EXISTS idx_cards_type   ON cards(card_type);
CREATE INDEX IF NOT EXISTS idx_cards_name   ON cards(name);

-- Tables de liaison pour filtrer facilement (deck builder, recherche)
CREATE TABLE IF NOT EXISTS card_inks            (card_id TEXT REFERENCES cards(id) ON DELETE CASCADE, ink TEXT,            PRIMARY KEY (card_id, ink));
CREATE TABLE IF NOT EXISTS card_types           (card_id TEXT REFERENCES cards(id) ON DELETE CASCADE, type TEXT,           PRIMARY KEY (card_id, type));
CREATE TABLE IF NOT EXISTS card_classifications (card_id TEXT REFERENCES cards(id) ON DELETE CASCADE, classification TEXT, PRIMARY KEY (card_id, classification));
CREATE TABLE IF NOT EXISTS card_keywords        (card_id TEXT REFERENCES cards(id) ON DELETE CASCADE, keyword TEXT,        PRIMARY KEY (card_id, keyword));

-- ---------- Tables du jeu (façon Pokémon TCG : boosters, collection, decks) ----------
-- Taux de tirage par rareté dans un booster (modifiables pour l'équilibrage du jeu)
CREATE TABLE IF NOT EXISTS rarity_weights (
  rarity     TEXT PRIMARY KEY,
  sort_order INTEGER NOT NULL,
  weight     REAL NOT NULL           -- poids relatif de tirage
);

CREATE TABLE IF NOT EXISTS players (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  coins      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collection (
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  card_id   TEXT REFERENCES cards(id),
  quantity  INTEGER NOT NULL DEFAULT 0,
  foil_qty  INTEGER NOT NULL DEFAULT 0,
  first_obtained_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, card_id)
);

CREATE TABLE IF NOT EXISTS decks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id  INTEGER REFERENCES players(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deck_cards (
  deck_id  INTEGER REFERENCES decks(id) ON DELETE CASCADE,
  card_id  TEXT REFERENCES cards(id),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 4),  -- max 4 exemplaires en Lorcana
  PRIMARY KEY (deck_id, card_id)
);

CREATE TABLE IF NOT EXISTS booster_openings (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  set_code  TEXT,
  card_ids  TEXT NOT NULL,           -- JSON des cartes tirées
  opened_at TEXT DEFAULT (datetime('now'))
);

-- Vue pratique pour le deck builder : un deck Lorcana = 60 cartes min, 2 encres max
CREATE VIEW IF NOT EXISTS deck_summary AS
SELECT d.id AS deck_id, d.name, SUM(dc.quantity) AS total_cards,
       (SELECT COUNT(DISTINCT ci.ink) FROM deck_cards x JOIN card_inks ci ON ci.card_id = x.card_id WHERE x.deck_id = d.id) AS ink_count
FROM decks d LEFT JOIN deck_cards dc ON dc.deck_id = d.id
GROUP BY d.id;
`);

db.exec(`INSERT OR IGNORE INTO rarity_weights (rarity, sort_order, weight) VALUES
  ('Common',1,60),('Uncommon',2,25),('Rare',3,9),('Super_rare',4,4),('Legendary',5,1.5),
  ('Epic',6,0.3),('Enchanted',7,0.15),('Iconic',8,0.05),('Promo',9,0);`);

// ---------- Import ----------
const upsertSet = db.prepare(`INSERT INTO sets (id, code, name, released_at, prereleased_at)
  VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code, name=excluded.name,
  released_at=excluded.released_at, prereleased_at=excluded.prereleased_at`);

const cardCols = ['id','set_id','set_code','collector_number','name','version','full_name','layout','card_type','types','ink','inks',
  'cost','inkwell','strength','willpower','lore','move_cost','rarity','text','flavor_text','illustrators','lang','released_at',
  'legal_core','legal_infinity','price_usd','price_usd_foil','image_url_small','image_url_normal','image_url_large','image_path','raw_json'];
const upsertCard = db.prepare(`INSERT INTO cards (${cardCols.join(',')}) VALUES (${cardCols.map(() => '?').join(',')})
  ON CONFLICT(id) DO UPDATE SET ${cardCols.filter(c => c !== 'id' && c !== 'image_path').map(c => `${c}=excluded.${c}`).join(', ')},
  image_path = COALESCE(excluded.image_path, cards.image_path), updated_at = datetime('now')`);
const setImagePath = db.prepare(`UPDATE cards SET image_path = ?, image_source = ? WHERE id = ?`);
const delLinks = ['card_inks','card_types','card_classifications','card_keywords'].map(t => db.prepare(`DELETE FROM ${t} WHERE card_id = ?`));
const insInk   = db.prepare(`INSERT OR IGNORE INTO card_inks VALUES (?,?)`);
const insType  = db.prepare(`INSERT OR IGNORE INTO card_types VALUES (?,?)`);
const insClass = db.prepare(`INSERT OR IGNORE INTO card_classifications VALUES (?,?)`);
const insKw    = db.prepare(`INSERT OR IGNORE INTO card_keywords VALUES (?,?)`);

const num = v => (v === null || v === undefined || v === '' ? null : Number(v));
const img = c => c.image_uris?.digital ?? {};
const safe = s => String(s).replace(/[^a-zA-Z0-9_-]/g, '_');

const sets = (await getJson(`${API}/sets`)).results;
console.log(`${sets.length} sets trouvés`);

for (const s of sets) {
  upsertSet.run(s.id, s.code, s.name, s.released_at ?? null, s.prereleased_at ?? null);
  await sleep(DELAY_MS);
  const cards = await getJson(`${API}/sets/${encodeURIComponent(s.code)}/cards`);
  db.exec('BEGIN');
  for (const c of cards) {
    const types = c.type ?? [];
    const inks = c.inks ?? (c.ink ? [c.ink] : []);
    upsertCard.run(
      c.id, s.id, s.code, String(c.collector_number), c.name, c.version ?? null,
      c.version ? `${c.name} - ${c.version}` : c.name, c.layout ?? null, types[0] ?? null, JSON.stringify(types),
      c.ink ?? null, JSON.stringify(inks), num(c.cost), c.inkwell ? 1 : 0, num(c.strength), num(c.willpower), num(c.lore),
      num(c.move_cost), c.rarity ?? null, c.text ?? null, c.flavor_text ?? null, JSON.stringify(c.illustrators ?? []),
      c.lang ?? null, c.released_at ?? null, c.legalities?.core ?? null, c.legalities?.infinity ?? null,
      num(c.prices?.usd), num(c.prices?.usd_foil), img(c).small ?? null, img(c).normal ?? null, img(c).large ?? null,
      null, JSON.stringify(c));
    for (const d of delLinks) d.run(c.id);
    inks.forEach(i => insInk.run(c.id, i));
    types.forEach(t => insType.run(c.id, t));
    (c.classifications ?? []).forEach(k => insClass.run(c.id, k));
    (c.keywords ?? []).forEach(k => insKw.run(c.id, k));
  }
  db.prepare(`UPDATE sets SET card_count = ? WHERE id = ?`).run(cards.length, s.id);
  db.exec('COMMIT');
  console.log(`  [${s.code}] ${s.name} : ${cards.length} cartes`);
}

// ---------- Visuels officiels Ravensburger ----------
// cards.lorcast.io peut être filtré par certains réseaux : on privilégie les images officielles
// référencées par lorcana-api.com (sets principaux), et Lorcast sert de solution de secours.
try {
  const bulk = await getJson('https://api.lorcana-api.com/bulk/cards');
  const setOfficial = db.prepare(`UPDATE cards SET image_url_official = ? WHERE set_code = ? AND collector_number = ?`);
  db.exec('BEGIN');
  let matched = 0;
  for (const b of bulk) if (b.Image && b.Set_Num != null && b.Card_Num != null)
    matched += Number(setOfficial.run(b.Image, String(b.Set_Num), String(b.Card_Num)).changes);
  db.exec('COMMIT');
  console.log(`
${matched} cartes associées à un visuel officiel Ravensburger`);
} catch (e) {
  console.warn(`lorcana-api.com indisponible (${e.message}), images Lorcast uniquement`);
}

// ---------- Téléchargement des images ----------
if (WITH_IMAGES) {
  const rows = db.prepare(`SELECT id, set_code, collector_number, image_url_official, image_url_${SIZE} AS lorcast, image_path FROM cards`).all();
  const imageJobs = [];
  for (const r of rows) {
    if (r.image_path && existsSync(join(ROOT, r.image_path))) continue;
    const base = `images/${safe(r.set_code)}/${safe(r.collector_number)}_${r.id}`;
    const sources = [];
    if (r.image_url_official) sources.push({ src: 'ravensburger', url: r.image_url_official, path: `${base}.jpg` });
    if (r.lorcast) sources.push({ src: 'lorcast', url: r.lorcast, path: `${base}.${r.lorcast.split('?')[0].split('.').pop()}` });
    const existing = sources.find(x => existsSync(join(ROOT, x.path)));
    if (existing) { setImagePath.run(existing.path, existing.src, r.id); continue; }
    if (sources.length) imageJobs.push({ id: r.id, sources });
  }
  console.log(`
${imageJobs.length} images à télécharger...`);
  let done = 0, failed = 0, i = 0;
  const errors = {};
  const worker = async () => {
    while (i < imageJobs.length) {
      const job = imageJobs[i++];
      let ok = false;
      for (const s of job.sources) {
        try {
          const res = await fetch(s.url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const full = join(ROOT, s.path);
          mkdirSync(dirname(full), { recursive: true });
          writeFileSync(full, Buffer.from(await res.arrayBuffer()));
          setImagePath.run(s.path, s.src, job.id);
          ok = true;
          break;
        } catch (e) {
          const k = `${s.src}: ${e.cause?.code || e.message}`;
          errors[k] = (errors[k] || 0) + 1;
        }
      }
      ok ? done++ : failed++;
      if ((done + failed) % 250 === 0) console.log(`  ${done + failed}/${imageJobs.length}`);
      await sleep(DELAY_MS);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(`Images : ${done} téléchargées, ${failed} sans image`);
  if (Object.keys(errors).length) console.log('Erreurs rencontrées :', errors);
}

// ---------- Export JSON (pratique pour un front-end web) ----------
const all = db.prepare(`SELECT id, set_code, collector_number, name, version, full_name, card_type, types, ink, inks, cost, inkwell,
  strength, willpower, lore, move_cost, rarity, text, flavor_text, image_path, image_source, image_url_official, image_url_normal FROM cards
  ORDER BY set_code, CAST(collector_number AS INTEGER), collector_number`).all()
  .map(r => ({ ...r, types: JSON.parse(r.types), inks: JSON.parse(r.inks), inkwell: !!r.inkwell }));
writeFileSync(join(ROOT, 'data', 'cards.json'), JSON.stringify(all, null, 1));

const total = db.prepare('SELECT COUNT(*) n FROM cards').get().n;
console.log(`\nTerminé : ${total} cartes dans data/lorcana.db (+ data/cards.json)`);
db.close();
