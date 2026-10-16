// Recherche du meilleur deck avec les cartes possédées, par simulation de parties (exécuté dans un Web Worker).
// 1. Un deck par combinaison d'encres (et par encre seule), testé contre une série de decks de référence.
// 2. Les meilleurs sont améliorés carte par carte : on garde un échange s'il fait gagner au moins autant de parties.
// 3. Le deck retenu est rejoué sur de nouvelles parties pour donner un taux de victoire honnête.
// Les parties sont tirées avec des graines fixes, pour comparer deux decks sur exactement les mêmes situations.
import { parseCard, newGame, applyAction, aiNextAction, buildDeck, INKS, RULES } from './engine.js';

// Générateur pseudo-aléatoire reproductible (mulberry32)
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

let stopped = false;
self.onmessage = ({ data }) => {
  if (data.type === 'stop') { stopped = true; return; }
  if (data.type === 'start') { stopped = false; run(data); }
};

function play(deckRows, oppRows, seed) {
  const s = newGame([deckRows, oppRows], { rnd: rng(seed), first: seed % 2, ai: [true, true] });
  let n = 0;
  while (!s.over && n++ < 3000) if (!applyAction(s, aiNextAction(s, 'normal')).ok) applyAction(s, { type: 'end' });
  return s.winner === 0;
}

function run({ owned, available, gauntletPool, inksFilter, budget }) {
  const byId = new Map([...owned, ...gauntletPool].map(r => [r.id, r]));
  const toRows = ids => ids.map(id => byId.get(id));
  const keyOf = id => parseCard(byId.get(id)).fullName;
  const t0 = Date.now();
  let games = 0;
  const progress = (p, text) => self.postMessage({ type: 'progress', p: Math.min(1, p), text, games });

  // Decks de référence : moitié niveau « Normal » (sets 1 à 3), moitié « Difficile » (tous les sets)
  const normalPool = gauntletPool.filter(r => ['1', '2', '3'].includes(r.set_code) && ['Common', 'Uncommon', 'Rare'].includes(r.rarity));
  const refPairs = [['Amber', 'Steel'], ['Amethyst', 'Ruby'], ['Emerald', 'Sapphire'], ['Amber', 'Amethyst'], ['Ruby', 'Sapphire'], ['Emerald', 'Steel']];
  const gauntlet = refPairs.map((pr, i) => toRows(buildDeck(i % 2 ? gauntletPool : normalPool, pr, { rnd: rng(100 + i) })));

  const evaluate = (ids, n, seedBase) => {
    const rows = toRows(ids);
    let w = 0;
    for (let k = 0; k < n; k++) { if (play(rows, gauntlet[k % gauntlet.length], seedBase + k)) w++; games++; }
    return w;
  };

  // ---- 1. Combinaisons d'encres
  const combos = [];
  const inks = inksFilter?.length ? inksFilter : INKS;
  if (inksFilter?.length === 2) combos.push(inksFilter);
  else {
    for (const a of inks) combos.push([a]);
    for (let i = 0; i < INKS.length; i++) for (let j = i + 1; j < INKS.length; j++) {
      const pr = [INKS[i], INKS[j]];
      if (!inksFilter?.length || pr.some(x => inksFilter.includes(x))) combos.push(pr);
    }
  }
  const N1 = budget.phase1, N2 = budget.phase2, ITER = budget.iterations, NF = budget.final;
  const results = [];
  combos.forEach((pr, i) => {
    if (stopped) return;
    const ids = buildDeck(owned, pr, { available, rnd: rng(7 + i) });
    if (ids.length < RULES.DECK_SIZE) return;
    const w = evaluate(ids, N1, 1000);
    results.push({ inks: pr, ids, rate: w / N1 });
    progress((i + 1) / combos.length * 0.35, `Test des combinaisons d'encres (${i + 1}/${combos.length})`);
  });
  if (!results.length) return self.postMessage({ type: 'done', error: `Pas assez de cartes jouables : il faut au moins ${RULES.DECK_SIZE} cartes d'une ou deux encres.` });
  results.sort((a, b) => b.rate - a.rate);

  // ---- 2. Amélioration carte par carte des meilleurs decks
  const finalists = results.slice(0, budget.finalists);
  finalists.forEach((f, fi) => {
    let ids = [...f.ids], wins = evaluate(ids, N2, 5000);
    const candidates = owned.filter(r => { const c = parseCard(r); return c.battleLegal && c.inks.length <= 1 && f.inks.includes(c.ink); });
    const names = [...new Map(candidates.map(r => [parseCard(r).fullName, r])).values()];
    const r = rng(42 + fi);
    for (let it = 0; it < ITER && !stopped; it++) {
      const count = {}; for (const id of ids) count[keyOf(id)] = (count[keyOf(id)] || 0) + 1;
      const options = names.filter(c => (count[parseCard(c).fullName] || 0) < Math.min(RULES.MAX_COPIES, available[parseCard(c).fullName] || 0));
      if (!options.length) break;
      const out = Math.floor(r() * ids.length), add = options[Math.floor(r() * options.length)];
      const next = [...ids]; next[out] = add.id;
      const w = evaluate(next, N2, 5000);
      if (w >= wins) { ids = next; wins = w; }
      progress(0.35 + ((fi + (it + 1) / ITER) / finalists.length) * 0.55, `Amélioration du deck ${f.inks.join(' / ')} (essai ${it + 1}/${ITER})`);
    }
    f.ids = ids; f.tuned = wins / N2;
  });

  // ---- 3. Taux de victoire final, sur des parties jamais vues
  progress(0.92, 'Vérification du deck retenu…');
  for (const f of finalists) f.final = evaluate(f.ids, NF, 90000) / NF;
  finalists.sort((a, b) => b.final - a.final);
  const best = finalists[0];
  self.postMessage({
    type: 'done', ids: best.ids, inks: best.inks, rate: best.final, games, seconds: Math.round((Date.now() - t0) / 1000), stopped,
    ranking: results.map(x => ({ inks: x.inks, rate: x.rate })),
    finalists: finalists.map(x => ({ inks: x.inks, start: x.rate, final: x.final })),
  });
}
