// Convertit la partie de l'ancienne version (base SQLite, serveur Node) en fichier à importer dans le jeu (Réglages → Importer).
// Les cartes sont retrouvées par set + numéro (identifiants Lorcast -> LorcanaJSON).
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';

const db = new DatabaseSync(new URL('../data/lorcana.db', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), { readOnly: true });
const { cards } = JSON.parse(readFileSync(new URL('../jeu/data/cards.json', import.meta.url)));
// version "normale" de chaque carte (pas les promos qui partagent le même numéro)
const byNum = new Map();
for (const c of cards) { const k = `${c.set_code}/${c.collector_number}`; if (!byNum.has(k) || byNum.get(k).rarity === 'Promo') byNum.set(k, c); }
const p = db.prepare('SELECT * FROM players ORDER BY id LIMIT 1').get();
if (!p) { console.log('Aucune partie à convertir.'); process.exit(0); }
const map = id => { const r = db.prepare('SELECT set_code, collector_number FROM cards WHERE id = ?').get(id); return r && byNum.get(`${r.set_code}/${r.collector_number}`)?.id; };
const collection = {}; let lost = 0;
for (const r of db.prepare('SELECT card_id, quantity, foil_qty FROM collection WHERE player_id = ?').all(p.id)) {
  const id = map(r.card_id); if (!id) { lost++; continue; }
  const q = collection[id] || [0, 0]; q[0] += r.quantity; q[1] += r.foil_qty; collection[id] = q;
}
const decks = db.prepare('SELECT id, name FROM decks WHERE player_id = ?').all(p.id).map((d, i) => ({
  id: i + 1, name: d.name,
  cards: db.prepare('SELECT card_id, quantity FROM deck_cards WHERE deck_id = ?').all(d.id).flatMap(r => { const id = map(r.card_id); return id ? Array(r.quantity).fill(id) : []; }),
}));
const save = { version: 1, name: p.name, coins: p.coins, freePacks: p.free_packs, freePacksAt: p.free_packs_at || Date.now(), starter: p.starter,
  wins: p.wins, losses: p.losses, collection, decks, nextDeckId: decks.length + 1, openings: db.prepare('SELECT COUNT(*) n FROM booster_openings').get().n,
  lang: 'fr', createdAt: Date.parse(p.created_at + 'Z') || Date.now() };
const out = new URL('../ma-partie-lorcana.json', import.meta.url);
writeFileSync(out, JSON.stringify({ jeu: 'Lorcana Pocket', exportedAt: new Date().toISOString(), save }, null, 1));
console.log(`Partie convertie : ${Object.keys(collection).length} cartes, ${decks.length} deck(s), ${p.coins} pièces${lost ? `, ${lost} carte(s) introuvable(s)` : ''} -> ma-partie-lorcana.json`);
