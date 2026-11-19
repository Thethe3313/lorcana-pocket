// Vérifie que le guide se génère sans erreur sur des decks variés : node scripts/test-guide.mjs
import { readFileSync } from 'node:fs';
import { buildDeck, INKS } from '../jeu/js/engine.js';
import { deckGuide } from '../jeu/js/guide.js';
const { cards: rows } = JSON.parse(readFileSync(new URL('../jeu/data/cards.json', import.meta.url)));
for (const r of rows) { r.name = r.name_fr || r.name_en; r.version = r.version_fr || r.version_en; r.full_name = r.full_name_fr || r.full_name_en; r.text = r.text_fr || r.text_en; }
const byId = new Map(rows.map(r => [r.id, r]));
const pool = rows.filter(r => /^\d+$/.test(r.set_code));
let n = 0;
for (let i = 0; i < INKS.length; i++) for (let j = i + 1; j < INKS.length; j++) {
  const g = deckGuide(buildDeck(pool, [INKS[i], INKS[j]]).map(id => byId.get(id)));
  n++;
  if (i === 0 && j < 3) console.log(INKS[i], INKS[j], '|', g.style.title, '| combos :', g.combos.map(c => c.title).join(' ; ') || 'aucun', '| faiblesses :', g.warnings.length);
}
console.log(n, 'guides générés sans erreur');
