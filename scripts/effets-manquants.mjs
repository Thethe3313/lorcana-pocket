// Liste les capacités que le moteur ne sait pas encore appliquer, groupées par partie non comprise
// Usage : node scripts/effets-manquants.mjs [type: phrase|déclencheur|permanent|coût|corps] [mots-du-groupe] [nombre]
import { readFileSync } from 'node:fs';
import { parseCardText, diagnose } from '../jeu/js/effects.js';

const { cards: rows } = JSON.parse(readFileSync(new URL('../jeu/data/cards.json', import.meta.url)));
const uniq = [...new Map(rows.filter(r => /^\d+$/.test(r.set_code)).map(r => [r.full_name_en, r])).values()];
const [only, words, top] = [process.argv[2], +(process.argv[3] || 4), +(process.argv[4] || 60)];

const items = [];
for (const r of uniq) for (const line of parseCardText(r.text_en || '', r.card_type).unhandled) {
  const clean = line.replace(/^(?:[A-Z0-9'!?,.\-]+ )+(?=[A-Z][a-z]|\{|[a-z])/, '');
  items.push({ d: diagnose(r.card_type === 'Action' ? line : clean, r.card_type), name: r.full_name_en });
}
console.log(`${items.length} capacités non appliquées`);
const byType = {};
for (const { d } of items) { const t = d.split(':')[0]; byType[t] = (byType[t] || 0) + 1; }
console.log(byType);
const groups = new Map();
for (const { d, name } of items) {
  const [t, ...rest] = d.split(': '); if (only && t !== only) continue;
  const txt = rest.join(': ');
  const key = `${t}: ${txt.split(/\s+/).slice(0, words).join(' ')}`;
  const g = groups.get(key) || { n: 0, ex: [] }; g.n++; if (g.ex.length < 3) g.ex.push(`${txt.slice(0, 150)}  [${name}]`); groups.set(key, g);
}
for (const [k, g] of [...groups].sort((a, b) => b[1].n - a[1].n).slice(0, top)) console.log(`${String(g.n).padStart(4)}  ${k}\n        ${g.ex.join('\n        ')}`);
