// Simule des parties IA contre IA pour vérifier le moteur : node scripts/simulate.mjs [nombre]
import { readFileSync } from 'node:fs';
import { parseCard, newGame, aiNextAction, applyAction, buildDeck, validateDeck, INKS } from '../jeu/js/engine.js';

const { cards: rows } = JSON.parse(readFileSync(new URL('../jeu/data/cards.json', import.meta.url)));
for (const r of rows) { r.name = r.name_en; r.version = r.version_en; r.full_name = r.full_name_en; r.text = r.text_en; }
const byId = new Map(rows.map(r => [r.id, r]));
const cards = rows.map(parseCard);

const stat = k => cards.filter(c => c.kind === k);
const acts = stat('action');
console.log(`Personnages : ${stat('character').length} (dont ${stat('character').filter(c => c.abilities.length).length} avec capacité active)`);
console.log(`Actions jouables : ${acts.filter(c => c.battleLegal).length}/${acts.length}`);

const N = +(process.argv[2] || 200);
const pool = rows.filter(r => /^\d+$/.test(r.set_code));
let wins = [0, 0], turns = 0, errors = 0;
for (let g = 0; g < N; g++) {
  const pick = () => [...INKS].sort(() => Math.random() - .5).slice(0, 2);
  const decks = [pick(), pick()].map(inks => buildDeck(pool, inks).map(id => byId.get(id)));
  for (const d of decks) { const e = validateDeck(d); if (e.length) { console.log('Deck invalide', e); process.exit(1); } }
  const s = newGame(decks, { ai: [true, true] });
  let steps = 0;
  while (!s.over && steps < 3000) {
    const a = aiNextAction(s, g % 2 ? 'easy' : 'normal');
    const r = applyAction(s, a);
    if (!r.ok) { errors++; console.log('Action refusée', a, r.error); applyAction(s, { type: 'end' }); }
    steps++;
  }
  if (!s.over) { console.log('Partie bloquée', g); errors++; continue; }
  wins[s.winner]++; turns += s.turnNumber;
}
console.log(`${N} parties, ${errors} erreurs, tours moyens : ${(turns / N).toFixed(1)}, victoires`, wins);
