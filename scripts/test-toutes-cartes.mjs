// Fait jouer chaque carte au moins une fois (decks de 60 cartes pris dans l'ordre de la base, IA contre IA)
// et signale les plantages ou parties bloquées. Usage : node scripts/test-toutes-cartes.mjs [tours]
import { readFileSync } from 'node:fs';
import { parseCard, newGame, aiNextAction, applyAction } from '../jeu/js/engine.js';

const { cards: rows } = JSON.parse(readFileSync(new URL('../jeu/data/cards.json', import.meta.url)));
for (const r of rows) { r.name = r.name_en; r.version = r.version_en; r.full_name = r.full_name_en; r.text = r.text_en; }
const legal = [...new Map(rows.filter(r => /^\d+$/.test(r.set_code)).map(r => [r.full_name, r])).values()].filter(r => parseCard(r).battleLegal);
const rounds = +(process.argv[2] || 3);
let games = 0, crashes = 0, stuck = 0, refused = 0;
const bad = new Map();
for (let round = 0; round < rounds; round++) {
  const pool = [...legal].sort(() => Math.random() - 0.5);
  for (let i = 0; i < pool.length; i += 30) {
    const chunk = pool.slice(i, i + 30);
    while (chunk.length < 30) chunk.push(legal[Math.floor(Math.random() * legal.length)]);
    const deck = [...chunk, ...chunk];
    const other = [...legal].sort(() => Math.random() - 0.5).slice(0, 30);
    games++;
    try {
      const s = newGame([deck, [...other, ...other]], { ai: [true, true] });
      let n = 0;
      while (!s.over && n < 5000) {
        const a = aiNextAction(s, 'hard');
        const r = applyAction(s, a);
        if (!r.ok) { refused++; applyAction(s, { type: 'end' }); }
        n++;
      }
      if (!s.over) stuck++;
    } catch (e) {
      crashes++;
      const where = e.stack.split('\n').slice(0, 3).join(' | ');
      for (const c of chunk) bad.set(c.full_name, where);
      if (crashes < 6) console.log('PLANTAGE', where);
    }
  }
}
console.log(`${legal.length} cartes jouables, ${games} parties : ${crashes} plantages, ${stuck} bloquées, ${refused} actions refusées`);
if (crashes) console.log('Cartes présentes dans les parties plantées (extrait) :', [...bad.keys()].slice(0, 30).join(' ; '));
