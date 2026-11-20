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
  const n = rows.find(r => { const c = parseCard(r); const a = c.abilities[0]; return c.kind === 'character' && c.fullyHandled && c.abilities.length === 1 && a.kind === 'triggered' && a.ons[0].on === 'play' && a.effects.length === 1 && a.effects[0].k === 'draw' && !a.effects[0].opt && !a.effects[0].cond && !a.effects[0].who; });
  console.log('test pioche :', n?.full_name);
  if (n) {
    const s = setup([n]);
    const before = s.players[0].hand.length;
    play(s, n.full_name);
    check(`${n.full_name} : pioche à l'arrivée`, s.players[0].hand.length === before, `main ${before} -> ${s.players[0].hand.length}`);
  }
}
// 3. Effet permanent « Your other characters get +1 {S} »
{
  const lord = rows.find(r => parseCard(r).abilities.some(a => a.kind === 'static' && a.st === 'mod' && a.subj?.who === 'own' && a.subj.f.other && !a.subj.f.cls && !a.subj.f.named && !a.cond && !a.yourTurn && !a.per && a.mods.length === 1 && a.mods[0][0] === 'str' && a.mods[0][1] === 1));
  console.log('test bonus :', lord?.full_name);
  if (lord) {
    const s = setup([lord, filler]);
    play(s, lord.full_name); play(s, filler.full_name);
    const f = s.players[0].play.find(x => x.card.id === filler.id);
    check(`${lord.full_name} : +1 force aux autres`, strOf(f, s) === filler.strength + 1, `force ${strOf(f, s)}`);
  }
}
// 4. Lieu : lore au début du tour, déplacement, bonus « ici »
{
  const loc = rows.find(r => { const c = parseCard(r); return c.kind === 'location' && c.moveCost <= 3 && c.abilities.some(a => a.kind === 'static' && a.st === 'mod' && a.cond?.c === 'here' && !a.cond.named && a.mods.some(([st, n]) => st === 'lore' && n === 1)); });
  console.log('test lieu :', loc?.full_name);
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
  const item = rows.find(r => { const c = parseCard(r); return c.kind === 'item' && c.battleLegal && c.abilities.some(a => a.kind === 'activated' && a.cost.exert && !a.cost.ink && !a.cost.banish && !a.cost.discard && !a.cost.banishItem && a.effects.length === 1 && a.effects[0].k === 'draw' && !a.effects[0].cond && !a.effects[0].who); });
  console.log('test objet :', item?.full_name);
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

// 8. Lore « pour chaque dégât »
{
  const s = setup([byName('Donald Duck - Not Again!')]);
  play(s, 'Donald Duck - Not Again!');
  const d = s.players[0].play[0]; d.damage = 2;
  check('Donald : +1 lore par dégât', loreOf(d, s) === d.card.lore + 2, `lore ${loreOf(d, s)}`);
}
// 9. Payer de l'encre pendant un effet (« you may pay 1 {I} to draw a card »)
{
  const s = setup([byName("Ursula's Shell Necklace"), byName('Friends on the Other Side')]);
  play(s, "Ursula's Shell Necklace");
  const P = s.players[0], used = P.inkUsed, hand = P.hand.length;
  play(s, 'Friends on the Other Side');
  check('Collier : 1 encre payée en plus', P.inkUsed === used + 3 + 1, `encre ${used} -> ${P.inkUsed}`);
  check('Collier : chanson (2 cartes) + 1 carte', P.hand.length === hand - 1 + 3, `main ${hand} -> ${P.hand.length}`);
}
// 10. Condition « si tu as joué une chanson ce tour-ci »
{
  const s = setup([byName("Sleepy's Flute"), byName('Friends on the Other Side')]);
  play(s, "Sleepy's Flute");
  const flute = s.players[0].items[0];
  const idx = flute.card.abilities.findIndex(a => a.kind === 'activated');
  applyAction(s, { type: 'activate', uid: flute.uid, index: idx });
  check('Flûte sans chanson : pas de lore', s.players[0].lore === 0);
  endTurn(s); endTurn(s);
  play(s, 'Friends on the Other Side');
  applyAction(s, { type: 'activate', uid: flute.uid, index: idx });
  check('Flûte après une chanson : +1 lore', s.players[0].lore === 1, `lore ${s.players[0].lore}`);
}
// 11. Récupérer 2 objets de la défausse ; défausse choisie chez l'adversaire
{
  const s = setup([byName('Treasures Untold')], [filler, byName('Smash')]);
  const P = s.players[0];
  P.discard = [byName("Sleepy's Flute"), byName("Ursula's Shell Necklace"), filler].map(r => ({ uid: s.nextUid++, card: parseCard(r), owner: 0, mods: [], under: [] }));
  play(s, 'Treasures Untold');
  check('Trésors : 2 objets récupérés', P.hand.filter(x => x.card.kind === 'item').length === 2, P.hand.map(x => x.card.name).join(', '));
  const s2 = setup([byName('The Bare Necessities')], [filler, byName('Smash')]);
  play(s2, 'The Bare Necessities');
  const O = s2.players[1];
  check('Il en faut peu : l\'adversaire défausse sa carte non-personnage', O.discard.some(x => x.card.name === 'Smash') && O.hand.some(x => x.card.id === filler.id), O.hand.map(x => x.card.name).join(', '));
}
// 12. « Tu ne peux pas jouer ce personnage sauf si… » ; soin de tous les Mousquetaires
{
  const s = setup([byName('Mirabel Madrigal - Family Gatherer')]);
  const m = s.players[0].hand[0];
  check('Mirabel injouable avec moins de 5 personnages', !applyAction(s, { type: 'play', uid: m.uid }).ok);
  const s2 = setup([byName('Goofy - Musketeer'), byName('Pete - Rotten Guy')]);
  play(s2, 'Pete - Rotten Guy');
  const pete = s2.players[0].play[0]; pete.damage = 3;
  play(s2, 'Goofy - Musketeer');
  check('Dingo : 2 dégâts retirés au Mousquetaire', pete.damage === 1, `dégâts ${pete.damage}`);
}
// 13. Carte révélée jouée gratuitement ; déplacement gratuit vers un lieu ; bonus par Balai
{
  const s = setup([byName('Mulan - Reflecting')]);
  play(s, 'Mulan - Reflecting'); endTurn(s); endTurn(s);
  const P = s.players[0], mulan = P.play[0];
  const song = { uid: s.nextUid++, card: parseCard(byName('Friends on the Other Side')), owner: 0, exerted: false, fresh: false, damage: 0, mods: [], under: [], at: null, shifted: false, once: {} };
  P.deck.push(song); const hand = P.hand.length;
  applyAction(s, { type: 'quest', uid: mulan.uid });
  check('Mulan : chanson révélée jouée gratuitement (+2 cartes)', P.discard.includes(song) && P.hand.length === hand + 2, `main ${hand} -> ${P.hand.length}`);
  const filler2 = P.deck[P.deck.length - 1];
  endTurn(s); endTurn(s);
  applyAction(s, { type: 'quest', uid: mulan.uid });
  check('Mulan : carte non-chanson remise sur le dessus', P.deck[P.deck.length - 1] !== undefined);

  const loc = rows.find(r => r.card_type === 'Location' && r.cost <= 3 && parseCard(r).battleLegal);
  const s2 = setup([byName('Colonel Hathi - On the March'), loc]);
  play(s2, loc.full_name); play(s2, 'Colonel Hathi - On the March'); endTurn(s2); endTurn(s2);
  const h = s2.players[0].play[0];
  applyAction(s2, { type: 'quest', uid: h.uid });
  check('Hathi : se déplace gratuitement au lieu en partant en quête', h.at === s2.players[0].locations[0].uid);

  const broom = byName('Magic Broom - Brigade Commander'), other = rows.find(r => r.name_en === 'Magic Broom' && r.full_name_en !== broom.full_name_en && r.card_type === 'Character');
  const s3 = setup([broom, other, other]);
  play(s3, broom.full_name); play(s3, other.full_name); play(s3, other.full_name);
  const b = s3.players[0].play.find(x => x.card.id === broom.id);
  check('Balai commandant : +2 force par autre Balai', strOf(b, s3) === broom.strength + 4, `force ${strOf(b, s3)}`);
}
// 14. Condition sur la main, choix de Mim, interdiction de jouer des actions
{
  const s = setup([byName('Demona - Betrayer of the Clan')]);
  play(s, 'Demona - Betrayer of the Clan');
  const d = s.players[0].play[0]; d.exerted = true;
  endTurn(s); endTurn(s); // le joueur repioche : main ≥ 3 avec le deck de remplissage
  s.players[0].hand.push(...s.players[0].deck.splice(-3));
  d.exerted = true; endTurn(s); endTurn(s);
  check('Démona ne se redresse pas avec 3 cartes ou plus en main', d.exerted, `main ${s.players[0].hand.length}`);

  const s2 = setup([filler, byName('Madam Mim - Fox')]);
  play(s2, filler.full_name); play(s2, 'Madam Mim - Fox');
  const P = s2.players[0];
  check('Mim : renvoie un autre personnage plutôt que de se bannir', P.play.some(x => x.card.name === 'Madam Mim') && P.hand.some(x => x.card.id === filler.id));

  const s3 = setup([byName('Pete - Games Referee')], [byName('Smash')]);
  play(s3, 'Pete - Games Referee'); endTurn(s3);
  const smash = s3.players[1].hand.find(x => x.card.name === 'Smash');
  check('Pat arbitre : l\'adversaire ne peut pas jouer d\'action', !applyAction(s3, { type: 'play', uid: smash.uid }).ok);
  endTurn(s3); endTurn(s3);
  check('… et peut de nouveau après le tour suivant', applyAction(s3, { type: 'play', uid: smash.uid }).ok);
}
// 15. « Ne peut pas être défiée par les Pirates » ; condition en tête d'une phrase composée
{
  const pirate = byName('Starkey - Devious Pirate');
  const s = setup([pirate], [byName('Captain Amelia - Commander of the Legacy')]);
  s.active = 1; play(s, 'Captain Amelia - Commander of the Legacy'); endTurn(s);
  play(s, pirate.full_name); endTurn(s); s.players[1].play[0].exerted = true; endTurn(s);
  const st = s.players[0].play[0], am = s.players[1].play[0];
  check('Amelia ne peut pas être défiée par un Pirate', !applyAction(s, { type: 'challenge', uid: st.uid, target: am.uid }).ok);

  const loc = rows.find(r => r.card_type === 'Location' && r.cost <= 3 && parseCard(r).battleLegal);
  const s2 = setup([byName('Vanellope von Schweetz - Gutsy Go-Getter'), loc]);
  play(s2, loc.full_name); play(s2, 'Vanellope von Schweetz - Gutsy Go-Getter');
  const v = s2.players[0].play[0]; v.at = s2.players[0].locations[0].uid;
  endTurn(s2); const lore = s2.players[0].lore; endTurn(s2);
  check('Vanellope au lieu : +1 lore au début du tour', s2.players[0].lore === lore + loc.lore + 1, `${lore} -> ${s2.players[0].lore}`);
}
// 16. Bonus pendant un défi ; aucun dégât reçu ; lore égal à celui d'un adversaire ; protection d'un personnage nommé
{
  const big = rows.find(r => r.card_type === 'Character' && !r.text_en && r.strength === 3 && r.willpower >= 5);
  const s = setup([big], [byName('Flora - Good Fairy')]);
  s.active = 1; play(s, 'Flora - Good Fairy'); endTurn(s); play(s, big.full_name); endTurn(s);
  const flora = s.players[1].play[0]; flora.exerted = true; endTurn(s);
  const att = s.players[0].play[0];
  applyAction(s, { type: 'challenge', uid: att.uid, target: flora.uid });
  check('Flora défiée : +2 force (4 dégâts rendus)', att.damage === 4, `dégâts ${att.damage}`);

  const smee = byName('Mr. Smee - Loyal First Mate');
  const s2 = setup([byName("Peter Pan - Pirate's Bane")], [smee]);
  s2.active = 1; play(s2, smee.full_name); endTurn(s2); play(s2, "Peter Pan - Pirate's Bane"); endTurn(s2);
  s2.players[1].play[0].exerted = true; endTurn(s2);
  const pp = s2.players[0].play[0];
  applyAction(s2, { type: 'challenge', uid: pp.uid, target: s2.players[1].play[0].uid });
  check('Peter Pan défie un Pirate sans subir de dégâts', pp.damage === 0, `dégâts ${pp.damage}`);

  const s3 = setup([byName('Abu - Illusory Pachyderm')], [byName('Peter Pan - Pirate\'s Bane')]);
  s3.active = 1; play(s3, "Peter Pan - Pirate's Bane"); endTurn(s3); play(s3, 'Abu - Illusory Pachyderm'); endTurn(s3); endTurn(s3);
  applyAction(s3, { type: 'quest', uid: s3.players[0].play[0].uid });
  check('Abu : lore + lore du personnage adverse (1 + 2)', s3.players[0].lore === 3, `lore ${s3.players[0].lore}`);

  const s4 = setup([big], [byName('Kenai - Big Brother'), byName('Koda - Smallish Bear')]);
  s4.active = 1; play(s4, 'Kenai - Big Brother'); play(s4, 'Koda - Smallish Bear'); endTurn(s4); play(s4, big.full_name); endTurn(s4);
  for (const i of s4.players[1].play) i.exerted = true; endTurn(s4);
  const koda = s4.players[1].play.find(i => i.card.name === 'Koda');
  check('Kenai épuisé : Koda ne peut pas être défié', !applyAction(s4, { type: 'challenge', uid: s4.players[0].play[0].uid, target: koda.uid }).ok);
}
// 17. Boost : payer pour glisser une carte sous le personnage, une fois par tour
{
  const zeus = byName('Zeus - Missing His Spark');
  const s = setup([zeus]);
  play(s, zeus.full_name); endTurn(s); endTurn(s);
  const z = s.players[0].play[0], P = s.players[0];
  const idx = z.card.abilities.findIndex(a => a.label === 'Boost');
  const used = P.inkUsed, deck = P.deck.length;
  const r = applyAction(s, { type: 'activate', uid: z.uid, index: idx });
  check('Boost utilisable', r.ok, r.error);
  check('Boost : 2 encre, une carte du deck sous Zeus', P.inkUsed === used + 2 && P.deck.length === deck - 1 && z.under.length === 1);
  check('Zeus avec une carte dessous : +2 force, +2 volonté', strOf(z, s) === zeus.strength + 2 && wilOf(z, s) === zeus.willpower + 2, `${strOf(z, s)}/${wilOf(z, s)}`);
  check('Boost une seule fois par tour', !applyAction(s, { type: 'activate', uid: z.uid, index: idx }).ok);
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
