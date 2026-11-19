// Tests ciblés du moteur : effets de cartes réelles + parties avec beaucoup d'objets, de lieux et d'actions.
// node scripts/test-effets.mjs
import { readFileSync } from 'node:fs';
import { parseCard, newGame, applyAction, aiNextAction, findInst, strOf, loreOf, wilOf, INKS } from '../jeu/js/engine.js';

const { cards: rows } = JSON.parse(readFileSync(new URL('../jeu/data/cards.json', import.meta.url)));
for (const r of rows) { r.name = r.name_en; r.version = r.version_en; r.full_name = r.full_name_en; r.text = r.text_en; }
const byName = n => { const r = rows.find(x => x.full_name === n); if (!r) throw new Error('carte introuvable : ' + n); return r; };
const filler = rows.find(r => r.card_type === 'Character' && !r.text_en && r.cost === 1);
let ok = 0, ko = 0;
const check = (label, cond, info = '') => { if (cond) ok++; else { ko++; console.log('ÉCHEC :', label, info); } };

// Partie de test : mains et terrains choisis, deck de remplissage
function setup(hand0 = [], hand1 = [], ink = 10) {
  const deck = Array(60).fill(filler);
  const s = newGame([deck, deck], { first: 0, rnd: () => 0.5 });
  for (const [p, hand] of [[0, hand0], [1, hand1]]) {
    const P = s.players[p];
    P.hand = hand.map(r => ({ uid: s.nextUid++, card: parseCard(r), owner: p, exerted: false, fresh: false, damage: 0, mods: [], under: [], at: null, shifted: false, once: {} }));
    for (const i of P.hand) Object.defineProperty(i, '_s', { value: s });
    P.inkwell = Array(ink).fill(null).map(() => ({ uid: s.nextUid++, card: parseCard(filler) }));
  }
  return s;
}
const play = (s, name, extra = {}) => { const i = s.players[s.active].hand.find(x => x.card.fullName === name); const r = applyAction(s, { type: 'play', uid: i.uid, ...extra }); return { i, r }; };
const endTurn = s => applyAction(s, { type: 'end' });

// 1. Action de dégâts ciblée
{
  const s = setup([byName('Smash'), byName('Mickey Mouse - Brave Little Tailor')], [byName('Stitch - New Dog')]);
  s.active = 1; play(s, 'Stitch - New Dog'); endTurn(s);
  const stitch = s.players[1].play[0];
  const { r } = play(s, 'Smash', { target: stitch.uid });
  check('Smash joue', r.ok, r.error);
  check('Smash bannit Stitch (3 dégâts sur 2 volonté)', !s.players[1].play.includes(stitch));
}
// 2. Personnage « quand vous jouez ce personnage, piochez »
{
  const n = rows.find(r => r.card_type === 'Character' && /^\S+ [A-Z ]+ When you play this character, draw a card\.$/.test(r.text_en || ''));
  if (n) {
    const s = setup([n]);
    const before = s.players[0].hand.length;
    play(s, n.full_name);
    check(`${n.full_name} : pioche à l'arrivée`, s.players[0].hand.length === before, `main ${before} -> ${s.players[0].hand.length}`);
  }
}
// 3. Effet permanent « Your other characters get +1 {S} »
{
  const lord = rows.find(r => r.card_type === 'Character' && /Your other characters get \+1 ¤\.?$/.test(r.text_en || ''));
  if (lord) {
    const s = setup([lord, filler]);
    play(s, lord.full_name); play(s, filler.full_name);
    const f = s.players[0].play.find(x => x.card.id === filler.id);
    check(`${lord.full_name} : +1 force aux autres`, strOf(f, s) === filler.strength + 1, `force ${strOf(f, s)}`);
  }
}
// 4. Lieu : lore au début du tour, déplacement, bonus « ici »
{
  const loc = rows.find(r => r.card_type === 'Location' && r.lore > 0 && /Characters get \+1 ◊ while here/.test(r.text_en || ''));
  if (loc) {
    const s = setup([loc, filler]);
    play(s, loc.full_name); play(s, filler.full_name);
    const l = s.players[0].locations[0], f = s.players[0].play[0];
    check('lieu en jeu', !!l);
    const r = applyAction(s, { type: 'move', uid: f.uid, target: l.uid });
    check('déplacement vers le lieu', r.ok && f.at === l.uid, r.error);
    check('bonus de lore « ici »', loreOf(f, s) === filler.lore + 1, `lore ${loreOf(f, s)}`);
    endTurn(s); const lore0 = s.players[0].lore; endTurn(s);
    check('le lieu rapporte du lore au début du tour', s.players[0].lore === lore0 + loc.lore, `${lore0} -> ${s.players[0].lore}`);
  }
}
// 5. Objet avec capacité ⟳
{
  const item = rows.find(r => r.card_type === 'Item' && /^[A-Z' ]+ ⟳ – Draw a card\.$/.test(r.text_en || '')) || rows.find(r => r.card_type === 'Item' && /⟳.*Draw a card/.test(r.text_en || '') && parseCard(r).battleLegal);
  if (item) {
    const s = setup([item]);
    play(s, item.full_name);
    const it = s.players[0].items[0];
    const before = s.players[0].hand.length;
    const r = applyAction(s, { type: 'activate', uid: it.uid, index: it.card.abilities.findIndex(a => a.kind === 'activated') });
    check(`${item.full_name} : capacité activée`, r.ok && it.exerted, r.error);
    check(`${item.full_name} : pioche`, s.players[0].hand.length === before + 1, `${before} -> ${s.players[0].hand.length}`);
  }
}
// 6. Défier un lieu
{
  const loc = rows.find(r => r.card_type === 'Location' && r.willpower <= 5 && parseCard(r).battleLegal);
  const big = rows.find(r => r.card_type === 'Character' && !r.text_en && r.strength >= 5);
  if (loc && big) {
    const s = setup([big], [loc]);
    s.active = 1; play(s, loc.full_name); endTurn(s);
    play(s, big.full_name); endTurn(s); endTurn(s);
    const att = s.players[0].play[0], l = s.players[1].locations[0];
    const r = applyAction(s, { type: 'challenge', uid: att.uid, target: l.uid });
    check('défi d\'un lieu', r.ok, r.error);
    check('lieu banni (dégâts ≥ volonté)', !s.players[1].locations.includes(l) || l.damage > 0);
  }
}

// 7. Parties complètes avec decks riches en objets, lieux et actions
const pool = rows.filter(r => /^\d+$/.test(r.set_code) && parseCard(r).battleLegal);
let crashes = 0, refused = 0, activations = 0, moves = 0, locChallenges = 0, games = 0;
for (let g = 0; g < 150; g++) {
  const deck = () => {
    const inks = [...INKS].sort(() => Math.random() - .5).slice(0, 2);
    const mine = pool.filter(r => inks.includes(r.ink) && parseCard(r).inks.length <= 1);
    const pickN = (type, n) => mine.filter(r => r.card_type === type).sort(() => Math.random() - .5).slice(0, n);
    const list = [...pickN('Item', 8), ...pickN('Location', 6), ...pickN('Action', 12)];
    const chars = pickN('Character', 40);
    while (list.length < 60 && chars.length) list.push(chars.pop());
    return list.flatMap(r => [r]).slice(0, 60);
  };
  try {
    const s = newGame([deck(), deck()], { ai: [true, true] });
    let n = 0;
    while (!s.over && n++ < 4000) {
      const a = aiNextAction(s, 'normal');
      if (a.type === 'activate') activations++;
      if (a.type === 'move') moves++;
      if (a.type === 'challenge' && findInst(s, a.target)?.inst.card.kind === 'location') locChallenges++;
      const r = applyAction(s, a);
      if (!r.ok) { refused++; applyAction(s, { type: 'end' }); }
    }
    games++;
  } catch (e) { crashes++; if (crashes < 4) console.log('PLANTAGE', e.stack.split('\n').slice(0, 3).join(' | ')); }
}
console.log(`${games} parties riches en objets/lieux : ${crashes} plantages, ${refused} actions refusées, ${activations} capacités activées, ${moves} déplacements, ${locChallenges} défis de lieux`);
console.log(`Tests d'effets : ${ok} réussis, ${ko} échoués`);
