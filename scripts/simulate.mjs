// Simule des parties IA contre IA pour vérifier le moteur : node scripts/simulate.mjs [nombre]
import { readFileSync } from 'node:fs';
import { parseCard, newGame, aiNextAction, applyAction, buildDeck, validateDeck, INKS } from '../jeu/js/engine.js';

const { cards: rows } = JSON.parse(readFileSync(new URL('../jeu/data/cards.json', import.meta.url)));
for (const r of rows) { r.name = r.name_en; r.version = r.version_en; r.full_name = r.full_name_en; r.text = r.text_en; }
const byId = new Map(rows.map(r => [r.id, r]));
const uniq = [...new Map(rows.filter(r => /^\d+$/.test(r.set_code)).map(r => [r.full_name, r])).values()].map(parseCard);

// Couverture des effets : cartes dont toutes les capacités sont appliquées
const by = {};
for (const c of uniq) { const t = by[c.kind] ||= { total: 0, full: 0, legal: 0 }; t.total++; if (c.fullyHandled) t.full++; if (c.battleLegal) t.legal++; }
for (const [k, v] of Object.entries(by)) console.log(`${k.padEnd(10)} effets complets ${v.full}/${v.total} (${Math.round(v.full / v.total * 100)} %), jouables ${v.legal}`);

const N = +(process.argv[2] || 200);
const pool = rows.filter(r => /^\d+$/.test(r.set_code));
let wins = [0, 0], turns = 0, errors = 0, crashes = 0;
for (let g = 0; g < N; g++) {
  const pick = () => [...INKS].sort(() => Math.random() - .5).slice(0, 2);
  const decks = [pick(), pick()].map(inks => buildDeck(pool, inks).map(id => byId.get(id)));
  for (const d of decks) { const e = validateDeck(d); if (e.length) { console.log('Deck invalide', e); process.exit(1); } }
  try {
    const s = newGame(decks, { ai: [true, true] });
    let steps = 0;
    while (!s.over && steps < 4000) {
      const a = aiNextAction(s, g % 2 ? 'easy' : 'normal');
      const r = applyAction(s, a);
      if (!r.ok) { errors++; if (errors < 5) console.log('Action refusée', a.type, r.error); applyAction(s, { type: 'end' }); }
      steps++;
    }
    if (!s.over) { console.log('Partie bloquée', g); errors++; continue; }
    wins[s.winner]++; turns += s.turnNumber;
  } catch (e) { crashes++; if (crashes < 4) console.log('PLANTAGE', e.stack.split('\n').slice(0, 4).join(' | ')); }
}
console.log(`${N} parties, ${errors} actions refusées, ${crashes} plantages, tours moyens : ${(turns / Math.max(1, N - crashes)).toFixed(1)}, victoires`, wins);
