// Moteur de combat Lorcana + IA.
// Module pur, sans DOM : utilisé par le navigateur, l'optimiseur (Web Worker) et les tests en Node.
// Les capacités des cartes sont traduites par effects.js ; ce fichier les applique pendant la partie.
import { parseCardText } from './effects.js';

// Règles officielles de construction : au moins 60 cartes, 4 exemplaires maximum d'une même carte, 1 ou 2 encres
export const RULES = { LORE_TO_WIN: 20, DECK_SIZE: 60, MAX_COPIES: 4, MAX_INKS: 2, HAND_START: 7 };
export const INKS = ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'];

// ---------------------------------------------------------------- Analyse des cartes

const cache = new Map();
const arr = v => (Array.isArray(v) ? v : JSON.parse(v || '[]'));

/** Transforme une ligne de carte (cards.json) en carte de jeu. */
export function parseCard(row) {
  if (cache.has(row.id)) return cache.get(row.id);
  const types = arr(row.types);
  const kind = (row.card_type || types[0] || '').toLowerCase();
  const typeEn = kind ? kind[0].toUpperCase() + kind.slice(1) : '';
  const parsed = parseCardText(row.text_en ?? row.text ?? '', typeEn);
  const kw = { ...parsed.keywords };
  for (const k of (Array.isArray(row.keywords) ? row.keywords : String(row.keywords || '').split(',')).map(x => x.trim().toLowerCase()))
    if (['evasive', 'rush', 'ward', 'bodyguard', 'reckless', 'support', 'vanish', 'alert'].includes(k)) kw[k] = true;
  const abilities = parsed.abilities;
  // Boost N : une fois par tour, payer N pour glisser la carte du dessus du deck sous ce personnage ou ce lieu
  if (parsed.keywords.boost != null) abilities.push({ kind: 'activated', cost: { ink: parsed.keywords.boost }, once: true, label: 'Boost', text: 'Boost', effects: [{ k: 'putUnder', self: true }] });
  const card = {
    id: row.id, name: row.name, version: row.version, fullName: row.full_name || (row.version ? `${row.name} - ${row.version}` : row.name),
    nameEn: row.name_en || row.name, cls: arr(row.classifications),
    kind, types, isSong: types.includes('Song'), ink: row.ink, inks: arr(row.inks),
    cost: row.cost ?? 0, inkable: !!row.inkwell, str: row.strength ?? 0, wil: row.willpower ?? 0, lore: row.lore ?? 0, moveCost: row.move_cost ?? 0,
    rarity: row.rarity, text: row.text, set: row.set_code, number: row.collector_number,
    kw, abilities, unhandled: parsed.unhandled.length,
    effects: kind === 'action' ? (abilities.find(a => a.kind === 'action')?.effects || null) : null,
  };
  card.ignoredAbilities = card.unhandled;
  card.battleLegal = kind === 'character' || (kind === 'action' ? !!card.effects && !card.unhandled : !card.unhandled);
  card.fullyHandled = !card.unhandled && (kind !== 'action' || !!card.effects);
  cache.set(row.id, card);
  return card;
}

// ---------------------------------------------------------------- Utilitaires

const shuffle = (a, rnd = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const other = i => 1 - i;
const log = (s, p, text) => { s.log.push({ p, text, turn: s.turnNumber }); };
const inPlay = P => [...P.play, ...P.items, ...P.locations];
const allInPlay = s => [...inPlay(s.players[0]), ...inPlay(s.players[1])];
const zoneOf = inst => (inst.card.kind === 'item' ? 'items' : inst.card.kind === 'location' ? 'locations' : 'play');
export const inkAvailable = P => P.inkwell.length - P.inkUsed + (P.inkDrops || 0);
export const findInst = (s, uid) => {
  for (const P of s.players) for (const z of ['hand', 'play', 'items', 'locations', 'deck', 'discard', 'inkwell']) {
    const x = P[z].find(i => i.uid === uid); if (x) return { inst: x, P, zone: z };
  }
  return null;
};
const isInPlay = (s, inst) => inPlay(s.players[inst.owner]).includes(inst);
let clsGuard = false;
const hasCls = (inst, list) => !list || [].concat(list).some(c => inst.card.cls.includes(c) || inst.card.cls.includes(c.replace(/s$/, '')) || (inst.mods || []).some(m => m.cls === c) || grantedCls(inst, c));
function grantedCls(inst, c) {
  const s = inst._s; if (!s || clsGuard) return false;
  clsGuard = true;
  try { return statics(s).some(({ src, ab }) => ab.st === 'grantCls' && ab.cls === c && appliesTo(s, src, ab.subj, inst)); } finally { clsGuard = false; }
}
const typeMatch = (card, type) => {
  if (!type || type === 'any' || type === 'card') return true;
  const parts = type.split(' ');
  const base = parts.pop(), cls = parts.join(' ');
  const okBase = base === 'song' ? card.isSong : card.kind === base;
  return okBase && (!cls || cls.split(' or ').some(x => card.cls.includes(x)));
};
// mots-clés imprimés ou donnés par un effet (sans les effets permanents : évite les boucles entre cartes)
const ownKw = (i, k) => !!(i.card.kw[k] || i.mods.some(m => m.kw === k));
// force sans les effets permanents (pour les conditions, même raison)
const baseStr = i => i.card.str + i.mods.filter(m => m.stat === 'str').reduce((n, m) => n + m.n, 0);
export const cardValue = c => c.kind === 'character'
  ? c.lore * 2.2 + c.str * 0.9 + c.wil * 0.7 + (c.kw.evasive ? 1.2 : 0) + (c.kw.ward ? 0.6 : 0) + c.abilities.length * 0.9
  : c.kind === 'location' ? 1.5 + c.lore * 2 + c.wil * 0.2 + c.abilities.length * 0.6 : 1 + c.cost * 0.7 + c.abilities.length * 0.5;

// ---------------------------------------------------------------- Effets permanents, conditions

/** Capacités d'une carte en jeu : imprimées, données par un effet (« gains "…" this turn ») ou par un effet permanent. */
function abilitiesOf(s, inst) {
  if (!isInPlay(s, inst) && inst._lastAbs) return inst._lastAbs;
  const extra = (inst.mods || []).filter(m => m.ab).map(m => m.ab);
  for (const src of allInPlay(s)) for (const ab of src.card.abilities)
    if (ab.kind === 'static' && ab.st === 'grantAb' && staticActive(s, src, ab) && appliesTo(s, src, ab.subj, inst, ab.cond)) extra.push(ab.ab);
  return extra.length ? [...inst.card.abilities, ...extra] : inst.card.abilities;
}

function statics(s) {
  const out = [];
  for (const src of allInPlay(s)) for (const ab of src.card.abilities) if (ab.kind === 'static') out.push({ src, ab });
  return out;
}

function count(s, p, what, src) {
  const P = s.players[p];
  switch (what.n) {
    case 'hand': return P.hand.length;
    case 'chars': return P.play.length;
    case 'otherChars': return P.play.filter(i => i !== src && hasCls(i, what.cls)).length;
    case 'items': return P.items.length;
    case 'selfDamage': return src.damage;
    case 'discard': return P.discard.length;
    case 'oppChars': return s.players[other(p)].play.length;
    case 'oppExerted': return s.players[other(p)].play.filter(i => i.exerted).length;
    case 'oppHand': return s.players[other(p)].hand.length;
    case 'evAmount': return what._ctx?.ev?.amount || 0;
    case 'oppDamageTotal': return s.players[other(p)].play.reduce((n, i) => n + i.damage, 0);
    case 'inkCount': return P.inkwell.length;
    case 'oppBanishedChallenge': return (s.players[other(p)].turnHits || []).filter(x => x === 'banished').length;
    case 'lostWay': return what._ctx?.lost || 0;
    case 'movedWay': return what._ctx?.moved || 0;
    case 'singers': return (what._ctx?.src?._singers || []).length;
    case 'inkTypes': return new Set(P.play.flatMap(i => i.card.inks.length ? i.card.inks : [i.card.ink])).size;
    case 'itemsNamed': return P.items.filter(i => i.card.nameEn === what.named).length;
    case 'itemsDistinct': return new Set(P.items.map(i => i.card.nameEn)).size;
    case 'healedWay': return what._ctx?.healedAmt || 0;
    case 'under': return src?.under?.length || 0;
    case 'locations': return P.locations.length;
    case 'discardType': return P.discard.filter(x => typeMatch(x.card, what.type)).length;
    case 'charsF': return (what.side === 'opp' ? s.players[other(p)] : P).play.filter(i => (!what.other || i !== src) && (!what.cls || hasCls(i, what.cls))
      && (!what.kw || ownKw(i, what.kw)) && (!what.named || i.card.nameEn === what.named) && (what.strExact == null || strOf(i, s) === what.strExact) && (what.state !== 'damaged' || i.damage > 0) && (what.state !== 'exerted' || i.exerted) && (what.state !== 'undamaged' || !i.damage) && (what.state !== 'ready' || !i.exerted) && (!what.here || (src && i.at === src.uid))).length;
  }
  return 0;
}

// Nombre d'un effet : fixe, ou « pour chaque … » ({ per, x })
const amount = (s, p, n, src, ctx) => (typeof n === 'object' && n ? n.x * count(s, p, { ...n.per, _ctx: ctx }, src) : n);

function condOk(s, src, c, ctx = {}) {
  if (!c) return true;
  const p = src.owner, P = s.players[p], O = s.players[other(p)];
  const chars = P.play.filter(i => !c.other || i !== src);
  switch (c.c) {
    case 'always': return true;
    case 'noDamage': return !src.damage;
    case 'damaged': return src.damage > 0;
    case 'exerted': return src.exerted;
    case 'atLocation': return !!src.at;
    case 'yourTurn': return s.active === p;
    case 'handMax': return P.hand.length <= c.n;
    case 'handMin': return P.hand.length >= c.n;
    case 'inkMin': return P.inkwell.length >= c.n;
    case 'chars': { const ok = chars.filter(i => (!c.cls || hasCls(i, c.cls)) && (!c.exerted || i.exerted)).length >= c.n; return c.not ? !ok : ok; }
    case 'didTurn': { const l = (P.turnLog || []).filter(x => x.what === c.what && (!c.other || x.inst !== src)); return c.exactly ? l.length === c.exactly : c.not ? !l.length : l.length > 0; }
    case 'oppTurnEvent': return (O.turnHits || []).includes(c.what);
    case 'ownTurnEvent': return (P.turnHits || []).includes(c.what);
    case 'usedDrop': return !!src.usedDrop;
    case 'itCls': return !!ctx.it && hasCls(ctx.it, c.cls);
    case 'itNamed': return !!ctx.it && ctx.it.card.nameEn === c.name;
    case 'itDamaged': return !!ctx.it && ctx.it.damage > 0;
    case 'itUnder': return !!ctx.it && ctx.it.under?.length > 0;
    case 'underWas': return ((ctx.banishedCard || src)._underWas || 0) > 0;
    case 'anyCls': return allInPlay(s).some(i => i.card.kind === 'character' && hasCls(i, c.cls));
    case 'discardCls': return P.discard.filter(x => x.card.kind === 'character' && hasCls(x, c.cls)).length >= c.n;
    case 'discardNamed': return P.discard.some(x => x.card.nameEn === c.name);
    case 'discardTurn': return P.discard.length - (P.discardStart ?? P.discard.length) >= c.n;
    case 'singers': return (src._singers || []).length >= c.n;
    case 'oppDeclined': return !!ctx.oppDeclined;
    case 'anyDamaged': return allInPlay(s).filter(i => i.card.kind === 'character' && i.damage > 0 && (!c.other || i !== src)).length >= (c.n || 1);
    case 'ownDamaged': return P.play.some(i => i.damage > 0);
    case 'oppDiscardHas': return O.discard.some(x => typeMatch(x.card, c.type));
    case 'challengingDamaged': return s.inChallenge?.attacker === src && s.inChallenge.defender.damage > 0;
    case 'itemsNamed': return P.items.filter(i => i.card.nameEn === c.name).length >= c.n;
    case 'discardTypeMin': return P.discard.filter(x => typeMatch(x.card, c.type)).length >= c.n;
    case 'highestCost': { const top = Math.max(0, ...allInPlay(s).filter(i => i.card.kind === 'character').map(i => i.card.cost)); return P.play.some(i => i.card.cost === top); }
    case 'moreInk': return P.inkwell.length > O.inkwell.length;
    case 'banishedClsTurn': return (P.banishedTurnList || []).some(x => hasCls(x, c.cls));
    case 'banishedNamedTurn': return [...(P.banishedTurnList || []), ...(O.banishedTurnList || [])].some(x => x.card.nameEn === c.name);
    case 'gotDrop': return !!P.gotDropTurn;
    case 'putUnderTurn': return src.putUnderTurn === s.turnNumber;
    case 'noInkTurn': return !P.inked;
    case 'inkSpent': return P.inkwell.length - P.inkUsed <= 0;
    case 'charsMax': return P.play.filter(i => i !== src).length <= c.n;
    // mots-clés imprimés ou donnés par un effet (pas les effets permanents, pour éviter les boucles entre deux cartes)
    case 'charsKw': return chars.some(i => i.card.kw[c.kw] || i.mods.some(m => m.kw === c.kw));
    case 'named': return P.play.some(i => i !== src && i.card.nameEn === c.name && (!c.exerted || i.exerted));
    case 'items': return P.items.length >= c.n;
    case 'locations': return P.locations.length >= c.n;
    case 'oppMoreHand': return O.hand.length > P.hand.length;
    case 'oppMoreLore': return O.lore > P.lore;
    case 'oppMoreInk': return O.inkwell.length > P.inkwell.length;
    case 'oppDamaged': return O.play.some(i => i.damage > 0);
    case 'firstTurnSecond': return s.turnNumber === 2;
    case 'shifted': return !!(ctx.shifted ?? src.shifted);
    case 'charHere': if (c.exactly) return P.play.filter(i => i.at === src.uid).length === c.exactly;
      return P.play.filter(i => i.at === src.uid && (!c.named || i.card.nameEn === c.named) && (!c.exerted || i.exerted) && (c.state !== 'exerted' || i.exerted) && (c.state !== 'damaged' || i.damage > 0) && (!c.cls || hasCls(i, c.cls))).length >= (c.n || 1);
    case 'discardHas': return P.discard.some(x => typeMatch(x.card, c.type));
    case 'oppChars': return O.play.filter(i => (c.state !== 'ready' || !i.exerted) && (c.state !== 'exerted' || i.exerted) && (c.state !== 'damaged' || i.damage > 0)).length >= c.n;
    case 'oppLoreMax': return O.lore <= c.n;
    case 'all': return c.list.every(x => condOk(s, src, x, ctx));
    case 'strongest': { const best = Math.max(0, ...O.play.map(baseStr)); return P.play.some(i => baseStr(i) > best); }
    case 'anyUnder': return [...P.play, ...P.locations].some(i => i.under?.length);
    case 'inkDrop': return (P.inkDrops || 0) > 0;
    case 'healedWay': return (ctx.healedAmt || 0) > 0;
    case 'healedTurn': return !!P.healedTurn;
    case 'moreHand': return P.hand.length > O.hand.length;
    case 'beingChallenged': return s.inChallenge?.defender === src;
    case 'oppMoreChars': return O.play.length > P.play.length;
    case 'under': return (src.under?.length || 0) > 0;
    case 'here': return true; // traité par le sujet
    case 'played': {
      const n = (P.playedList || []).filter(x => typeMatch(x.card, c.type) && (!c.other || x !== src) && (!c.minCost || x.card.cost >= c.minCost)).length;
      return c.not ? n < c.n : n >= c.n;
    }
    case 'banishedThisTurn': return (s.banishedTurn || 0) > 0;
    case 'oppHas': return O[c.what === 'character' ? 'play' : c.what + 's'].some(i => (c.state !== 'exerted' || i.exerted) && (c.state !== 'damaged' || i.damage > 0));
    case 'oppHandMax': return O.hand.length <= c.n;
    case 'oppLoreMin': return O.lore >= c.n;
    case 'selfStrMin': return baseStr(src) >= c.n;
    case 'discardMin': return P.discard.length >= c.n;
    case 'moreItems': return P.items.length > O.items.length;
    case 'namedAll': return c.names.every(n => P.play.some(i => i.card.nameEn === n));
    case 'charStrMin': return P.play.some(i => baseStr(i) >= c.n);
    case 'charStatMin': return chars.filter(i => (c.stat === 'S' ? baseStr(i) : i.card.wil) >= c.n).length >= (c.count || 1);
  }
  return false;
}

// Le sujet d'un effet permanent s'applique-t-il à cette carte ?
function appliesTo(s, src, subj, inst, cond) {
  if (!subj) return false;
  const f = subj.f || {};
  switch (subj.who) {
    case 'self': return inst === src;
    case 'opp': return inst.card.kind === 'character' && inst.owner !== src.owner && (!f.kw || ownKw(inst, f.kw)) && (!f.cls || hasCls(inst, f.cls))
      && (f.maxCost == null || inst.card.cost <= f.maxCost) && (!f.damaged || inst.damage > 0);
    case 'all': return inst.card.kind === 'character' && (!f.other || inst !== src) && (!f.cls || hasCls(inst, f.cls));
    case 'here': return inst.card.kind === 'character' && inst.at === src.uid && (!cond?.named || inst.card.nameEn === cond.named) && (!f.cls || hasCls(inst, f.cls)) && (!f.kw || ownKw(inst, f.kw));
    case 'sameLoc': return inst.card.kind === 'character' && !!src.at && inst.at === src.at;
    case 'challenger': return s.inChallenge?.defender === src && s.inChallenge.attacker === inst;
    case 'ownItems': return inst.card.kind === 'item' && inst.owner === src.owner;
    case 'oppItems': return inst.card.kind === 'item' && inst.owner !== src.owner;
    case 'ownLocations': return inst.card.kind === 'location' && inst.owner === src.owner && (!f.nameHas || inst.card.nameEn.includes(f.nameHas));
    case 'ownLocOrAtLoc': return inst.owner === src.owner && (inst.card.kind === 'location' || (inst.card.kind === 'character' && !!inst.at));
    case 'own':
      return inst.card.kind === 'character' && inst.owner === src.owner && (!f.other || inst !== src)
        && (!f.cls || hasCls(inst, f.cls)) && (!f.named || inst.card.nameEn === f.named)
        && (!f.exerted || inst.exerted) && (!f.damaged || inst.damage > 0) && (!f.kw || ownKw(inst, f.kw))
        && (!f.atLoc || !!inst.at) && (!f.ink || inst.card.inks.includes(f.ink) || inst.card.ink === f.ink) && (!f.minStr || baseStr(inst) >= f.minStr)
        && (!f.notNamed || inst.card.nameEn !== f.notNamed) && (!f.hasUnder || inst.under?.length > 0);
  }
  return false;
}

const staticActive = (s, src, ab) => (!ab.yourTurn || s.active === src.owner) && (!ab.oppTurn || s.active !== src.owner) && (!ab.cond || ab.cond.c === 'here' || condOk(s, src, ab.cond));

function modOf(s, inst, stat) {
  let n = 0;
  for (const m of inst.mods) if (m.stat === stat) n += m.n;
  for (const { src, ab } of statics(s)) {
    if (ab.st !== 'mod' || !staticActive(s, src, ab) || !appliesTo(s, src, ab.subj, inst, ab.cond)) continue;
    const mult = ab.per ? count(s, src.owner, ab.per, src) : 1;
    if (!ab.mods) continue;
    for (const [st, v] of ab.mods) if (st === stat) n += v * mult;
  }
  return n;
}
export const strOf = (inst, s = inst._s) => Math.max(0, inst.card.str + (s ? modOf(s, inst, 'str') : 0));
export const wilOf = (inst, s = inst._s) => Math.max(0, inst.card.wil + (s ? modOf(s, inst, 'wil') : 0));
export const loreOf = (inst, s = inst._s) => Math.max(0, inst.card.lore + (s ? modOf(s, inst, 'lore') : 0));

function kwOf(s, inst, k) {
  const base = inst.card.kw[k];
  let v = typeof base === 'number' ? base : base ? true : 0;
  const add = x => { if (typeof x === 'number') v = (typeof v === 'number' ? v : 0) + x; else if (x && !v) v = true; };
  for (const m of inst.mods) if (m.kw === k) add(m.v);
  for (const { src, ab } of statics(s)) {
    if (!staticActive(s, src, ab) || !appliesTo(s, src, ab.subj, inst, ab.cond)) continue;
    if (ab.kws) for (const g of ab.kws) if (g.kw === k) add(ab.perKw && typeof g.v === 'number' ? g.v * count(s, src.owner, ab.per, src) : g.v);
  }
  for (const { src, ab } of statics(s)) if (ab.st === 'noKw' && ab.kw === k && appliesTo(s, src, ab.subj, inst)) return 0;
  if (k === 'challenge' || k === 'rush') return v;
  return v;
}
const numKw = (s, inst, k) => { const v = kwOf(s, inst, k); return typeof v === 'number' ? v : 0; };

function restricted(s, inst, what) {
  if (inst.mods.some(m => m.restrict === what || (m.restrict === 'quest or challenge' && (what === 'quest' || what === 'challenge')))) return true;
  for (const { src, ab } of statics(s)) {
    if (ab.st !== 'cant' || !(ab.what === what || (ab.what === 'quest or challenge' && (what === 'quest' || what === 'challenge'))) || !staticActive(s, src, ab) || !appliesTo(s, src, ab.subj, inst, ab.cond)) continue;
    if (ab.unless && condOk(s, src, ab.unless)) continue;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- Création de partie

/**
 * @param decks [lignesDeck0, lignesDeck1]
 * @param opts { names, ai: [bool,bool], first, rnd }
 */
export function newGame(decks, opts = {}) {
  const rnd = opts.rnd || Math.random;
  const s = { players: [], active: 0, turnNumber: 1, over: false, winner: null, reason: null, log: [], nextUid: 1, ai: opts.ai || [false, true], pending: [], rnd };
  decks.forEach((rows, p) => {
    const deck = shuffle(rows.map(r => mkInst(s, parseCard(r), p)), rnd);
    s.players.push({ name: opts.names?.[p] || `Joueur ${p + 1}`, deck, hand: [], play: [], items: [], locations: [], inkwell: [], discard: [],
      lore: 0, inkUsed: 0, inked: 0, inkDrops: 0, discounts: [], played: {}, extraInk: 0 });
  });
  for (const P of s.players) for (let i = 0; i < RULES.HAND_START; i++) P.hand.push(P.deck.pop());
  s.active = opts.first ?? (rnd() < 0.5 ? 0 : 1);
  log(s, s.active, `${s.players[s.active].name} commence.`);
  startTurn(s, true);
  return s;
}

function mkInst(s, card, owner) {
  const i = { uid: s.nextUid++, card, owner, exerted: false, fresh: false, damage: 0, mods: [], under: [], at: null, shifted: false, once: {} };
  Object.defineProperty(i, '_s', { value: s, enumerable: false, writable: true });
  return i;
}
function resetInst(i) { i.exerted = false; i.fresh = false; i.damage = 0; i.mods = []; i.at = null; i.shifted = false; i.once = {}; return i; }

const expire = (s, when, p) => { for (const i of allInPlay(s)) i.mods = i.mods.filter(m => !(m.exp.when === when && m.exp.player === p)); };

function startTurn(s, first = false) {
  const p = s.active, P = s.players[p];
  expire(s, 'start', p);
  s.locks = (s.locks || []).filter(l => l.by !== p);
  P.inkUsed = 0; P.inked = 0; P.inkDrops = 0; P.discounts = []; P.played = {}; P.playedList = []; P.extraInk = 0; P.healedTurn = false; P.turnLog = []; P.discardStart = P.discard.length; s.turnTriggers = []; P.gotDropTurn = false; for (const Q of s.players) Q.banishedTurnList = []; for (const Q of s.players) Q.turnHits = []; s.banishedTurn = 0;
  // Redressement
  let readyLeft = P.readyLimit ?? 99; P.readyLimit = null;
  for (const i of [...P.play, ...P.items]) {
    let skip = i.mods.some(m => m.restrict === 'readyNext') || restricted(s, i, 'ready');
    if (!skip && i.exerted && i.card.kind === 'character') { if (readyLeft <= 0) skip = true; else readyLeft--; }
    i.mods = i.mods.filter(m => m.restrict !== 'readyNext');
    if (!skip && i.exerted) { i.exerted = false; fire(s, 'readied', { inst: i }); }
    i.fresh = false; i.once = {};
  }
  for (const l of P.locations) l.once = {};
  // Lieux : lore au début du tour
  for (const l of P.locations) { const n = loreOf(l, s); if (n) { log(s, p, `${l.card.fullName} rapporte ${n} lore.`); gainLore(s, p, n); } }
  fire(s, 'startTurn', { player: p });
  for (const c of [...P.discard]) for (const ab of c.card.abilities)
    if (ab.kind === 'triggered' && /in your discard/i.test(ab.text || '') && ab.ons.some(o => o.on === 'startTurn') && !s.over) resolve(s, p, ab.effects, { src: c, banishedCard: c, label: ab.label });
  if (!first && !s.over && !statics(s).some(({ src, ab }) => ab.st === 'skipDraw' && src.owner === p)) draw(s, p, 1);
}

function endTurnCleanup(s) {
  const p = s.active;
  s.turnTriggers = [];
  fire(s, 'endTurn', { player: p });
  for (const d of s.pending.filter(x => x.at === 'end')) if (isInPlay(s, d.inst)) banish(s, d.inst, 'est banni (fin du tour)');
  s.pending = s.pending.filter(x => x.at !== 'end');
  expire(s, 'end', p);
}

function draw(s, p, n) {
  const P = s.players[p];
  for (let k = 0; k < n; k++) {
    if (!P.deck.length) return lose(s, p, `${P.name} n'a plus de cartes à piocher.`);
    P.hand.push(P.deck.pop());
    fire(s, 'drew', { player: p });
  }
}

function lose(s, p, reason) {
  if (s.over) return;
  s.over = true; s.winner = other(p); s.reason = reason; log(s, p, reason);
}

function gainLore(s, p, n) {
  if (n <= 0) return;
  const P = s.players[p];
  P.lore += n;
  const need = Math.max(RULES.LORE_TO_WIN, ...statics(s).filter(({ src, ab }) => ab.st === 'loreToWin' && src.owner !== p).map(({ ab }) => ab.n));
  if (P.lore >= need && !s.over) { s.over = true; s.winner = p; s.reason = `${P.name} atteint ${RULES.LORE_TO_WIN} lore !`; log(s, p, s.reason); }
}

function leavePlay(s, inst) {
  const P = s.players[inst.owner];
  const z = P[zoneOf(inst)], idx = z.indexOf(inst);
  if (idx < 0) return false;
  z.splice(idx, 1);
  if (inst.card.kind === 'location') for (const c of P.play) if (c.at === inst.uid) c.at = null;
  inst._underWas = inst.under.length;
  P.discard.push(...inst.under); inst.under = [];
  for (const i of allInPlay(s)) if (i.mods.some(m => m.exp?.uid === inst.uid)) i.mods = i.mods.filter(m => m.exp?.uid !== inst.uid);
  return true;
}

function banish(s, inst, why = 'est banni', ctx = {}) {
  if (inst.card.abilities.some(ab => ab.st === 'banishToInk') && isInPlay(s, inst)) {
    const Q = s.players[inst.owner]; if (leavePlay(s, inst)) { Q.inkwell.push(resetInst(inst)); log(s, inst.owner, `${inst.card.fullName} part dans l'encrier au lieu d'être banni.`); fire(s, 'left', { inst }); } return;
  }
  const at = inst.at, back = ctx.inChallenge && kwOf(s, inst, 'returnOnBanish');
  inst._lastAbs = abilitiesOf(s, inst); inst._lastStr = strOf(inst, s);
  if (!leavePlay(s, inst)) return;
  s.players[inst.owner].discard.push(resetInst(inst));
  log(s, inst.owner, `${inst.card.fullName} ${why}.`);
  if (inst.card.kind === 'character') { s.banishedTurn = (s.banishedTurn || 0) + 1; (s.players[inst.owner].banishedTurnList ||= []).push(inst); if (ctx.inChallenge) (s.players[inst.owner].turnHits ||= []).push('banished'); }
  fire(s, 'banished', { inst, inChallenge: !!ctx.inChallenge, challenger: ctx.challenger, at });
  fire(s, 'left', { inst });
  if (back) { const P = s.players[inst.owner], k = P.discard.indexOf(inst); if (k >= 0) { P.discard.splice(k, 1); P.hand.push(inst); log(s, inst.owner, `${inst.card.fullName} retourne dans la main.`); } }
}

function dealDamage(s, inst, n, ctx = {}) {
  if (n <= 0 || !isInPlay(s, inst)) return 0;
  for (const { src, ab } of statics(s)) if (ab.st === 'noDamage' && staticActive(s, src, ab) && appliesTo(s, src, ab.subj, inst) && !(ab.unlessChallenged && ctx.inChallenge && s.lastChallenge?.defender === inst)) return 0;
  const dmg = Math.max(0, n - (ctx.noResist ? 0 : numKw(s, inst, 'resist')));
  inst.damage += dmg;
  if (inst.damage >= wilOf(inst, s)) banish(s, inst, ctx.inChallenge ? 'est banni au combat' : 'est banni', ctx);
  if (dmg) { (s.players[inst.owner].turnHits ||= []).push('damaged'); fire(s, 'damaged', { inst, amount: dmg }); }
  return dmg;
}

// ---------------------------------------------------------------- Déclencheurs

function fire(s, on, ev) {
  if (s.over || (s._depth || 0) > 12) return;
  s._depth = (s._depth || 0) + 1;
  try { fireInner(s, on, ev); } finally { s._depth--; }
}
const BANISH_ONS = ['allyBanished', 'anyBanished', 'banishedHere'];
function fireInner(s, on, ev) {
  const jobs = [];
  const consider = (src, extra = {}) => {
    for (const ab of abilitiesOf(s, src)) {
      if (ab.kind !== 'triggered') continue;
      if (ab.yourTurn && s.active !== src.owner) continue;
      if (ab.oppTurn && s.active === src.owner) continue;
      if (ab.abCond && !condOk(s, src, ab.abCond)) continue;
      if (ab.once && src.once[ab.text]) continue;
      for (const t of ab.ons) if ((t.on === on || (on === 'banished' && BANISH_ONS.includes(t.on))) && triggerMatches(s, t, src, ev)) { jobs.push({ src, ab, ctx: { ...extra } }); break; }
    }
  };
  if (on === 'banished' || on === 'left') {
    consider(ev.inst, { banishedCard: ev.inst });
    for (const src of allInPlay(s)) consider(src, { it: ev.inst });
  } else for (const src of allInPlay(s)) consider(src);
  for (const tt of s.turnTriggers || []) consider(tt.src);
  for (const { src, ab, ctx } of jobs) {
    if (s.over) return;
    if (ab.once) src.once[ab.text] = true;
    resolve(s, src.owner, ab.effects, { src, ev, ...ctx, it: ctx.it || ev.it, label: ab.label });
  }
}

function triggerMatches(s, t, src, ev) {
  const mine = x => x && x.owner === src.owner;
  switch (t.on) {
    case 'play': return ev.inst === src;
    case 'quest': return ev.inst === src && (!t.atLocation || !!src.at) && (!t.minStrSelf || strOf(src, s) >= t.minStrSelf);
    case 'anyQuest': if (t.side === 'opp') return ev.inst.owner !== src.owner;
      if ((t.atLocation && !ev.inst.at) || (t.minStr && strOf(ev.inst, s) < t.minStr)) return false;
      return mine(ev.inst) && (!t.other || ev.inst !== src) && hasCls(ev.inst, t.cls || null) && (!t.named || ev.inst.card.nameEn === t.named);
    case 'questHere': return ev.inst.at === src.uid && (!t.cls || hasCls(ev.inst, t.cls));
    case 'challenge':
      if (t.anySide) return !t.attDamaged || ev.attacker.damage > 0;
      if (t.side === 'opp') return ev.attacker.owner !== src.owner;
      if (t.here) return ev.attacker.at === src.uid && (!t.minStr || strOf(ev.attacker, s) >= t.minStr);
      if (t.any) return mine(ev.attacker) && (!t.other || ev.attacker !== src) && hasCls(ev.attacker, t.cls || null) && (!t.named || ev.attacker === src || ev.attacker.card.nameEn === t.named) && (!t.defDamaged || ev.defender.damage > 0);
      return ev.attacker === src && (!t.defDamaged || ev.defender.damage > 0) && (!t.defCls || hasCls(ev.defender, t.defCls)) && (t.defMaxStr == null || strOf(ev.defender, s) <= t.defMaxStr);
    case 'challenged': return ev.defender === src;
    case 'shiftedOnto': return false; // traité au moment de l'Alter
    case 'allyChallenged': return mine(ev.defender) && (ev.defender.card.kind === 'character' || (t.hasUnder && ev.defender.card.kind === 'location')) && (!t.srcExerted || src.exerted) && (!t.cls || hasCls(ev.defender, t.cls)) && (!t.hasUnder || ev.defender.under?.length > 0);
    case 'banishInChallenge': if (t.here) return ev.defenderBanished && ev.attacker.at === src.uid;
      if (t.yourTurnOnly && s.active !== src.owner) return false;
      if (t.cls && !hasCls(ev.attacker, t.cls)) return false;
      return (t.any ? mine(ev.attacker) && (!t.other || ev.attacker !== src) : ev.attacker === src) && ev.defenderBanished;
    case 'banished': return ev.inst === src && (!t.inChallenge || ev.inChallenge);
    case 'allyBanished': return ev.inst !== src && mine(ev.inst) && ev.inst.card.kind === (t.kind || 'character') && (!t.other || ev.inst !== src) && hasCls(ev.inst, t.cls || null) && (!t.kw || ownKw(ev.inst, t.kw)) && (!t.inChallenge || ev.inChallenge);
    case 'anyBanished': return ev.inst !== src && ev.inst.card.kind === (t.kind || 'character') && (!t.inChallenge || ev.inChallenge) && (t.maxCost == null || ev.inst.card.cost <= t.maxCost) && (!t.cls || hasCls(ev.inst, t.cls)) && (t.side !== 'opp' || ev.inst.owner !== src.owner);
    case 'banishedHere': return ev.at === src.uid;
    case 'startTurn': return ev.player === src.owner;
    case 'endTurn': return t.side === 'any' || (t.side === 'opp' ? ev.player !== src.owner : ev.player === src.owner);
    case 'youPlay':
      if ((!mine(ev.inst) && !t.anySide) || ev.inst === src) return false;
      if (!typeMatch(ev.inst.card, t.type) || (t.cls && !hasCls(ev.inst, t.cls)) || (t.maxCost != null && ev.inst.card.cost > t.maxCost)) return false;
      if ((t.kw && !ownKw(ev.inst, t.kw)) || (t.minStr && ev.inst.card.str < t.minStr) || (t.notSong && ev.inst.card.isSong)) return false;
      if ((t.notChar && ev.inst.card.kind === 'character') || (t.maxPaid != null && (ev.paid ?? ev.inst.card.cost) > t.maxPaid) || (t.entersExerted && !ev.inst.exerted)) return false;
      if (t.srcExerted && !src.exerted) return false;
      if (t.nth) return s.players[src.owner].played.action === t.nth;
      return !t.second || s.players[src.owner].played.action === 2;
    case 'oppPlay': return ev.inst.owner !== src.owner && typeMatch(ev.inst.card, t.type);
    case 'readied': return ev.inst === src;
    case 'sing': if (t.together && !ev.together) return false;
      return t.any ? mine(ev.singer) && (!t.other || ev.singer !== src) : ev.singer === src;
    case 'putUnder': return t.any ? mine(ev.inst) && (!t.other || ev.inst !== src) : ev.inst === src;
    case 'move': return ev.inst === src;
    case 'left': return ev.inst === src;
    case 'challengeDamage': return ev.attacker === src;
    case 'moveHere': return ev.location === src && (!t.minStr || strOf(ev.inst, s) >= t.minStr) && (!t.fromLoc || !!ev.from);
    case 'returned': return t.side === 'opp' ? ev.inst.owner !== src.owner : mine(ev.inst) && (!t.other || ev.inst !== src);
    case 'discarded': return (t.side === 'opp' ? ev.player !== src.owner : ev.player === src.owner) && (!t.type || ev.cards.some(c => c.card.kind === t.type));
    case 'milled': case 'dropUsed': case 'leftDiscard': return ev.player === src.owner;
    case 'recurred': return ev.player === src.owner && ev.card.card.kind === 'character' && (!t.cls || hasCls(ev.card, t.cls));
    case 'boosted': return mine(ev.inst);
    case 'chosenByOpp': return ev.inst === src;
    case 'actionDamage': return mine(ev.inst);
    case 'supportChosen': return mine(ev.inst);
    case 'exerts': return t.side === 'opp' ? ev.inst.owner !== src.owner && ev.inst.card.kind === 'character' : ev.inst === src;
    case 'challengedHere': return ev.defender.at === src.uid;
    case 'healed': return mine(ev.inst);
    case 'inked': return ev.player === src.owner;
    case 'drew': return t.side === 'opp' ? ev.player !== src.owner && s.active === ev.player : ev.player === src.owner;
    case 'damaged': if (t.side === 'own') return mine(ev.inst) && ev.inst.card.kind === 'character' && (!t.cls || hasCls(ev.inst, t.cls));
      return t.self ? ev.inst === src : ev.inst.owner !== src.owner && ev.inst.card.kind === 'character';
  }
  return false;
}

// ---------------------------------------------------------------- Résolution des effets

function candidates(s, p, t, ctx) {
  const src = ctx.src;
  let pool;
  const types = t.types || ['character'];
  const sides = t.side === 'opp' ? [s.players[other(p)]] : t.side === 'own' ? [s.players[p]] : s.players;
  pool = sides.flatMap(P => [...(types.includes('character') ? P.play : []), ...(types.includes('item') ? P.items : []), ...(types.includes('location') ? P.locations : [])]);
  const f = t.f || {};
  const taunts = t.sel === 'chosen' ? pool.filter(i => i.owner !== p && i.card.abilities.some(ab => ab.st === 'taunt')) : [];
  if (taunts.length) pool = taunts;
  return pool.filter(i => {
    if (t.sel === 'chosen' && i.owner !== p && kwOf(s, i, 'ward')) return false;
    if (t.sel === 'chosen' && i.owner !== p && i.card.kind === 'item' && statics(s).some(({ src, ab }) => ab.st === 'itemWard' && src.owner === i.owner)) return false;
    if (f.other && i === src) return false;
    if (f.damaged && !i.damage) return false;
    if (f.undamaged && i.damage) return false;
    if (f.exerted && !i.exerted) return false;
    if (f.ready && i.exerted) return false;
    if (f.maxCost != null && i.card.cost > f.maxCost) return false;
    if (f.minCost != null && i.card.cost < f.minCost) return false;
    if (f.maxstr != null && strOf(i, s) > f.maxstr) return false;
    if (f.minstr != null && strOf(i, s) < f.minstr) return false;
    if (f.cls && !hasCls(i, f.cls)) return false;
    if (f.named && i.card.nameEn !== f.named.replace(/\s*$/, '')) return false;
    if (f.kw && !kwOf(s, i, f.kw)) return false;
    if (f.here && (!src || i.at !== src.uid)) return false;
    if (f.atLoc && !i.at) return false;
    if (f.notKw && kwOf(s, i, f.notKw)) return false;
    if (f.hasUnder && !i.under?.length) return false;
    if (f.notNamed && i.card.nameEn === f.notNamed) return false;
    if (f.challengedTurn && i.challengedTurn !== s.turnNumber) return false;
    if (f.maxstrSelf && strOf(i, s) > (src?._lastStr ?? src?.card.str ?? 0)) return false;
    return true;
  });
}

/** Cibles possibles d'un effet (pour l'interface). */
export function effectTargets(s, p, eff, srcUid = null) {
  if (!eff?.t || eff.t.sel !== 'chosen') return [];
  const src = srcUid != null ? findInst(s, srcUid)?.inst : null;
  return candidates(s, p, eff.t, { src }).map(i => i.uid);
}

function targetsFor(s, p, e, ctx, chosen) {
  const t = e.t;
  if (!t) return [];
  switch (t.sel) {
    case 'self': return ctx.src && isInPlay(s, ctx.src) ? [ctx.src] : [];
    case 'it': return ctx.them?.length ? ctx.them.filter(i => isInPlay(s, i)) : ctx.it && isInPlay(s, ctx.it) ? [ctx.it] : [];
    case 'otherMoved': return ctx.otherMoved && isInPlay(s, ctx.otherMoved) ? [ctx.otherMoved] : [];
    case 'challenger': return ctx.ev?.attacker && isInPlay(s, ctx.ev.attacker) ? [ctx.ev.attacker] : [];
    case 'challenged': return ctx.ev?.defender && isInPlay(s, ctx.ev.defender) ? [ctx.ev.defender] : [];
    case 'each': return candidates(s, p, t, ctx);
  }
  const valid = candidates(s, p, t, ctx);
  if (!valid.length) return [];
  const n = t.upTo || 1;
  if (chosen != null && !ctx.usedChoice) {
    const c = valid.find(i => i.uid === chosen);
    if (c) { ctx.usedChoice = true; return n > 1 ? [c, ...aiPick(s, p, e, valid.filter(i => i !== c), n - 1)] : [c]; }
  }
  return aiPick(s, p, e, valid, n);
}

function expiry(s, p, inst, d, src) {
  if (d === 'whileSrc') return { when: 'never', uid: src?.uid };
  if (d === 'untilYourNext') return { when: 'start', player: p };
  if (d === 'theirNext') return { when: 'end', player: inst.owner };
  return { when: 'end', player: s.active };
}

// Filtres d'une carte hors du jeu (défausse, main)
const filterOk = (x, f) => !f || ((f.maxCost == null || x.card.cost <= f.maxCost) && (!f.minStr || x.card.str >= f.minStr) && (!f.minWil || x.card.wil >= f.minWil)
  && (!f.kw || x.card.kw[f.kw] != null && x.card.kw[f.kw] !== false) && (!f.notSong || !x.card.isSong) && (!f.named || x.card.nameEn === f.named));

const noDiscard = (s, q) => statics(s).some(({ src, ab }) => ab.st === 'noDiscard' && src.owner === q && staticActive(s, src, ab));
function chooseCardsToDiscard(P, n) {
  P.hand.sort((a, b) => cardValue(a.card) - cardValue(b.card));
  return P.hand.splice(0, Math.min(n, P.hand.length));
}

/** Applique une liste d'effets. chosen = cible choisie par le joueur pour le premier effet ciblé. */
function resolve(s, p, effects, ctx, chosen) {
  const P = s.players[p], O = s.players[other(p)];
  ctx.lastDone = true;
  const src = ctx.src;
  for (let e of effects) {
    if (s.over) return;
    if (e.ifDo && !ctx.lastDone) continue;
    if (e.cond && !condOk(s, src || { owner: p, damage: 0, mods: [] }, e.cond, ctx)) { ctx.lastDone = false; continue; }
    if (e.opt && chosen == null) {
      const after = []; for (let j = effects.indexOf(e) + 1; j < effects.length && effects[j].ifDo; j++) after.push(effects[j]);
      if (effectValue(s, p, [e, ...after], ctx) <= 0) { ctx.lastDone = false; continue; }
    }
    const tg = e.t ? targetsFor(s, p, e, ctx, chosen) : [];
    if (e.t?.sel === 'chosen') for (const t of tg) if (t.owner !== p) fire(s, 'chosenByOpp', { inst: t });
    if (e.t && !tg.length && e.k !== 'moveDamage') { ctx.lastDone = false; continue; }
    if (tg.length === 1) { ctx.it = tg[0]; ctx.them = null; } else if (tg.length > 1) ctx.them = tg;
    if (e.alt && condOk(s, src || { owner: p, damage: 0, mods: [] }, e.alt.cond, ctx)) e = { ...e.alt.e, t: e.t, opt: e.opt };
    ctx.lastDone = true;
    const name = ctx.label || src?.card?.name || '';
    switch (e.k) {
      case 'damage': if (src?.card?.kind === 'action' && tg.some(t => t.owner !== p && t.card.kind === 'character')) ctx.actionHit = true;
        for (const t of tg) { const n = e.n === 'selfStr' ? strOf(src, s) : e.n === 'evAmount' ? (ctx.ev?.amount || 0) : amount(s, p, e.n, src, ctx); log(s, p, `${name} : ${n} dégât(s) à ${t.card.fullName}.`); dealDamage(s, t, n, { noResist: e.noResist }); } break;
      case 'payInk': {
        if (inkAvailable(P) < e.n) { ctx.lastDone = false; break; }
        const d = Math.min(P.inkDrops || 0, e.n); P.inkDrops -= d; P.inkUsed += e.n - d; log(s, p, `${P.name} paie ${e.n} encre (${name}).`); break;
      }
      case 'banish': if (e.sameName && tg[0]) for (const x of allInPlay(s).filter(i => i !== tg[0] && i.card.kind === tg[0].card.kind && i.card.nameEn === tg[0].card.nameEn)) tg.push(x);
        for (const t of tg) banish(s, t, `est banni (${name})`); break;
      case 'return': for (const t of tg) {
        const Q = s.players[t.owner]; if (!leavePlay(s, t)) break;
        Q.hand.push(resetInst(t)); log(s, p, `${t.card.fullName} retourne dans la main de ${Q.name}.`); fire(s, 'left', { inst: t }); fire(s, 'returned', { inst: t });
      } break;
      case 'toInk': for (const t of tg) { const Q = s.players[t.owner]; if (leavePlay(s, t)) { Q.inkwell.push(resetInst(t)); if (s.active === t.owner) Q.inkUsed++; log(s, p, `${t.card.fullName} part dans l'encrier de ${Q.name}.`); } } break;
      case 'tuck': for (const t of tg) { const Q = s.players[t.owner]; if (leavePlay(s, t)) { Q.deck.unshift(resetInst(t)); log(s, p, `${t.card.fullName} retourne sous le deck de ${Q.name}.`); } } break;
      case 'exert': if (e.sameName && tg[0]) for (const x of O.play.filter(i => i !== tg[0] && i.card.nameEn === tg[0].card.nameEn)) tg.push(x);
        for (const t of tg) { t.exerted = true; log(s, p, `${t.card.fullName} est épuisé.`); fire(s, 'exerts', { inst: t }); } break;
      case 'ready': for (const t of tg) { t.exerted = false; log(s, p, `${t.card.fullName} est redressé.`); fire(s, 'readied', { inst: t }); } break;
      case 'mod': for (const t of tg) {
        const mult = e.per ? count(s, p, e.per, t) : 1;
        for (const [stat, n] of e.mods) t.mods.push({ stat, n: n * mult, exp: expiry(s, p, t, e.dur, src) });
        for (const g of e.kws || []) t.mods.push({ kw: g.kw, v: g.v, exp: expiry(s, p, t, e.dur, src) });
        if (e.restrictSing) t.mods.push({ restrict: 'sing', exp: expiry(s, p, t, e.dur, src) });
        log(s, p, `${t.card.fullName} : ${e.mods.map(([st, n]) => `${n > 0 ? '+' : ''}${n} ${{ str: 'force', wil: 'volonté', lore: 'lore' }[st]}`).join(', ')}.`);
        if (wilOf(t, s) <= t.damage && t.card.kind === 'character') banish(s, t);
      } break;
      case 'grant': for (const t of tg) { for (const g of e.kws) t.mods.push({ kw: g.kw, v: g.v, exp: expiry(s, p, t, e.dur, src) }); if (e.cls) t.mods.push({ cls: e.cls, exp: expiry(s, p, t, e.dur, src) }); if (e.str) t.mods.push({ stat: 'str', n: e.str, exp: expiry(s, p, t, e.dur, src) }); if (e.restrictQuest) t.mods.push({ restrict: 'quest', exp: expiry(s, p, t, e.dur, src) }); } if (tg.length) log(s, p, `${tg.length > 1 ? 'Des personnages' : tg[0].card.fullName} gagne(nt) ${e.kws.map(g => g.kw).join(', ')}.`); break;
      case 'restrict': for (const t of tg) { t.mods.push({ restrict: e.what, exp: expiry(s, p, t, e.dur, src) }); } if (tg.length) log(s, p, `${tg.map(t => t.card.name).join(', ')} : restriction (${e.what}).`); break;
      case 'heal': { if (statics(s).some(({ ab }) => ab.st === 'noHeal')) break; let healed = null; for (const t of tg) { const before = t.damage; t.damage = Math.max(0, t.damage - e.n); if (before !== t.damage) { ctx.healedAmt = (ctx.healedAmt || 0) + before - t.damage; if (t.owner === p) P.healedTurn = true; log(s, p, `${t.card.fullName} est soigné.`); if (t.owner === p && t.card.kind === 'character') healed = t; } } if (healed) fire(s, 'healed', { inst: healed, amount: ctx.healedAmt }); break; }
      case 'moveDamage': {
        const from = targetsFor(s, p, { ...e, t: e.t }, ctx, chosen)[0];
        const to = targetsFor(s, p, { ...e, t: e.t2 }, { ...ctx, usedChoice: true }, null)[0];
        if (!from || !to || from === to) { ctx.lastDone = false; break; }
        const n = Math.min(e.n, from.damage); from.damage -= n; log(s, p, `${n} dégât(s) déplacé(s) de ${from.card.name} vers ${to.card.name}.`); dealDamage(s, to, n);
        break;
      }
      case 'draw': {
        const who = e.who === 'all' ? [0, 1] : e.who === 'opp' ? [other(p)] : e.who === 'targetOwner' ? [ctx.it ? ctx.it.owner : other(p)] : [p];
        const n = amount(s, p, e.n, src, ctx); ctx.drawn = n;
        for (const q of who) { draw(s, q, n); if (e.lore) gainLore(s, q, e.lore); }
        log(s, p, `${who.map(q => s.players[q].name).join(' et ')} pioche(nt) ${n} carte(s).`);
        break;
      }
      case 'loot': { draw(s, p, e.n); const d = chooseCardsToDiscard(P, e.n2); P.discard.push(...d); if (d.length) fire(s, 'discarded', { player: p, cards: d }); } log(s, p, `${P.name} pioche ${e.n} carte(s) puis en défausse ${e.n2}.`); break;
      case 'discard': {
        const who = e.who === 'all' ? [0, 1] : e.who === 'opp' ? [other(p)] : [p];
        if (e.pick) { // défausse choisie par le joueur de l'effet, parmi les cartes du bon type
          const okAll = O.hand.filter(x => (e.filter === 'non-character' ? x.card.kind !== 'character' : typeMatch(x.card, e.filter))).sort((a, b) => (e.theirs ? 1 : -1) * (cardValue(a.card) - cardValue(b.card)));
          const go = e.all ? okAll : okAll.slice(0, 1);
          for (const ok of go) { O.hand.splice(O.hand.indexOf(ok), 1); O.discard.push(ok); log(s, p, `${O.name} défausse ${ok.card.name}.`); }
          if (!go.length) ctx.lastDone = false;
          break;
        }
        if (e.n === 'drawn' || e.n === 'underWas') { const n = e.n === 'drawn' ? (ctx.drawn || 0) : ((ctx.banishedCard || src)?._underWas || 0); const Q = e.who === 'opp' ? O : P; const d = chooseCardsToDiscard(Q, n); Q.discard.push(...d); if (d.length) log(s, p, `${Q.name} défausse ${d.length} carte(s).`); break; }
        if (e.random) { const Q = O; for (let k = 0; k < e.n && Q.hand.length; k++) { const c = Q.hand.splice(Math.floor(s.rnd() * Q.hand.length), 1)[0]; Q.discard.push(c); log(s, p, `${Q.name} défausse ${c.card.name} au hasard.`); } break; }
        for (const q of who) { const Q = s.players[q]; if (noDiscard(s, q) && q !== p) continue; const d = chooseCardsToDiscard(Q, e.n); if (d.length) fire(s, 'discarded', { player: q, cards: d }); Q.discard.push(...d); if (d.length) log(s, p, `${Q.name} défausse ${d.map(x => x.card.name).join(', ')}.`); }
        if (e.who === 'you' && !P.hand.length) ctx.lastDone = true;
        break;
      }
      case 'lore': { const n = amount(s, p, e.n, src, ctx); log(s, p, `${P.name} gagne ${n} lore (${name}).`); gainLore(s, p, n); break; }
      case 'loreOwner': gainLore(s, ctx.it ? ctx.it.owner : p, e.n); break;
      case 'oppLore': if (statics(s).some(x => x.ab.st === 'noLoreLoss' && x.src.owner !== p && s.active === p)) break;
        ctx.lost = Math.min(e.n, O.lore); O.lore = Math.max(0, O.lore - e.n); log(s, p, `${O.name} perd ${e.n} lore.`); break;
      case 'inkDrop': P.gotDropTurn = true; if (e.who === 'all') { O.inkDrops = (O.inkDrops || 0) + e.n; if (e.lore) { gainLore(s, p, e.lore); gainLore(s, other(p), e.lore); } }
        P.inkDrops = (P.inkDrops || 0) + e.n; log(s, p, `${P.name} gagne ${e.n} encre pour ce tour.`); break;
      case 'ramp': for (const q of e.who === 'all' ? [0, 1] : e.who === 'opp' ? [other(p)] : e.who === 'itOwner' ? [ctx.it ? ctx.it.owner : other(p)] : [p]) {
        const Q = s.players[q];
        for (let k = 0; k < e.n && Q.deck.length; k++) { Q.inkwell.push(Q.deck.pop()); if (s.active === q) Q.inkUsed++; }
        log(s, p, `${Q.name} ajoute ${e.n} carte(s) du deck à son encrier.`); fire(s, 'inked', { player: q });
      } break;
      case 'inkFromHand': if (P.hand.length) { P.inkwell.push(...chooseCardsToDiscard(P, 1)); log(s, p, `${P.name} ajoute une carte de sa main à son encrier.`); } break;
      case 'extraInk': P.extraInk++; break;
      case 'readyInk': P.inkUsed = 0; log(s, p, `${P.name} redresse son encrier.`); break;
      case 'recur': {
        const got = P.discard.filter(x => typeMatch(x.card, e.type) && filterOk(x, e.f)).sort((a, b) => cardValue(b.card) - cardValue(a.card)).slice(0, e.n || 1);
        if (got.length) fire(s, 'leftDiscard', { player: p });
        for (const c of got) { P.discard.splice(P.discard.indexOf(c), 1); if (e.top) { P.deck.push(c); continue; } P.hand.push(c); fire(s, 'recurred', { card: c, player: p }); log(s, p, `${P.name} récupère ${c.card.fullName} dans sa défausse.`); }
        if (!got.length) ctx.lastDone = false;
        break;
      }
      case 'recurIt': { const c = ctx.it; const i = c ? s.players[c.owner].discard.indexOf(c) : -1; if (i >= 0 && c.owner === p) { P.discard.splice(i, 1); P.hand.push(c); log(s, p, `${c.card.fullName} retourne dans la main.`); } break; }
      case 'returnSelfCard': { const c = ctx.banishedCard || src; const i = P.discard.indexOf(c); if (i >= 0) { P.discard.splice(i, 1); P.hand.push(c); log(s, p, `${c.card.fullName} retourne dans la main.`); } break; }
      case 'selfToInk': { const c = ctx.banishedCard || src; const i = P.discard.indexOf(c); if (i >= 0) { P.discard.splice(i, 1); P.inkwell.push(c); log(s, p, `${c.card.fullName} part dans l'encrier.`); } break; }
      case 'look': ctx.looked = P.deck.splice(Math.max(0, P.deck.length - e.n)).reverse(); break;
      case 'pick': {
        const pool = ctx.looked || [];
        const match = x => (e.any ? e.any.some(o => (o.notChar ? x.card.kind !== 'character' : typeMatch(x.card, o.type)) && filterOk(x, o.f)) : typeMatch(x.card, e.type));
        if (e.repeat) { let got = 0; while (P.deck.length && match(P.deck[P.deck.length - 1])) { P.hand.push(P.deck.pop()); got++; } const c = pool.find(match); if (c) { pool.splice(pool.indexOf(c), 1); P.hand.push(c); got++; } if (got) log(s, p, `${P.name} ajoute ${got} carte(s) à sa main.`); else ctx.lastDone = false; break; }
        const ok = pool.filter(match).sort((a, b) => cardValue(b.card) - cardValue(a.card));
        const take = (e.all ? ok : ok.slice(0, e.n || 1)).filter(x => filterOk(x, e.f));
        for (const c of take) { pool.splice(pool.indexOf(c), 1); P.hand.push(c); }
        if (take.length) { log(s, p, `${P.name} ajoute ${take.map(c => c.card.name).join(', ')} à sa main.`); if (e.gain) gainLore(s, p, e.gain); } else ctx.lastDone = false;
        break;
      }
      case 'tutorDeck': {
        const c = P.deck.filter(x => typeMatch(x.card, e.type) && filterOk(x, e.f)).sort((a, b) => cardValue(b.card) - cardValue(a.card))[0];
        if (c) { P.deck.splice(P.deck.indexOf(c), 1); shuffle(P.deck, s.rnd); if (e.top) P.deck.push(c); else P.hand.push(c); log(s, p, `${P.name} cherche ${c.card.fullName} dans son deck${e.top ? ' et le met sur le dessus' : ''}.`); } else ctx.lastDone = false;
        break;
      }
      case 'playFree': {
        if (e.who === 'all' || e.who === 'itOwner') { const q = e.who === 'itOwner' ? (ctx.it ? ctx.it.owner : other(p)) : other(p); const Q = s.players[q]; const z = e.fromDiscard ? Q.discard : Q.hand;
          const c2 = z.filter(x => typeMatch(x.card, e.type) && x.card.cost <= e.max && x.card.battleLegal).sort((a, b) => b.card.cost - a.card.cost)[0];
          if (c2) { z.splice(z.indexOf(c2), 1); Q.hand.push(c2); log(s, p, `${Q.name} joue ${c2.card.fullName} gratuitement.`); putIntoPlay(s, q, c2, {}); }
          if (e.who === 'itOwner') break; }
        const zone = e.either ? [...P.hand, ...P.discard] : e.fromDiscard ? P.discard : P.hand;
        const c = zone.filter(x => typeMatch(x.card, e.type) && x.card.cost <= e.max && x.card.battleLegal && filterOk(x, e.f)).sort((a, b) => b.card.cost - a.card.cost || cardValue(b.card) - cardValue(a.card))[0];
        if (c) { if (P.discard.includes(c)) { P.discard.splice(P.discard.indexOf(c), 1); P.hand.push(c); } log(s, p, `${P.name} joue ${c.card.fullName} gratuitement${e.fromDiscard ? ' depuis sa défausse' : ''}.`); putIntoPlay(s, p, c, {}); if (e.exerted && isInPlay(s, c)) c.exerted = true; } else ctx.lastDone = false;
        break;
      }
      case 'discount': P.discounts.push({ n: e.n === 'num' ? (ctx.num || 0) : amount(s, p, e.n, src, ctx), type: e.type, types: e.types }); break;
      case 'lookBack': ctx.lookTop = e.top; break;
      case 'mark': break;
      case 'turnTrigger': (s.turnTriggers ||= []).push({ src: { uid: -1, owner: p, card: { abilities: [{ kind: 'triggered', ons: e.ons, effects: e.effects, label: name, text: 'turn' }] }, once: {}, mods: [], damage: 0 } }); break;
      case 'banishSameName': { const ref = ctx.it; if (!ref) break; for (const t of allInPlay(s).filter(i => i !== ref && i.card.kind === 'character' && i.card.nameEn === ref.card.nameEn)) banish(s, t, `est banni (${name})`); break; }
      case 'grantAb': for (const t of tg) { t.mods.push({ ab: e.ab, exp: expiry(s, p, t, e.dur, src) }); if (e.str) t.mods.push({ stat: 'str', n: e.str, exp: expiry(s, p, t, e.dur, src) }); for (const g of e.kws || []) t.mods.push({ kw: g.kw, v: g.v, exp: expiry(s, p, t, e.dur, src) }); log(s, p, `${t.card.fullName} gagne une capacité (${name}).`); } break;
      case 'grantSinger': for (const t of tg) t.mods.push({ singAs: t.card.cost + e.n, exp: expiry(s, p, t, e.dur, src) }); break;
      case 'modFrom': {
        const base = e.from === 'targetWil' ? null : e.from === 'selfStr' ? strOf(src, s) : e.from === 'selfLore' ? loreOf(src, s) : e.from === 'num' ? (ctx.num || 0)
          : e.from === 'otherStr' ? (targetsFor(s, p, { ...e, t: e.t2 }, { ...ctx, usedChoice: true }, null)[0] ? strOf(targetsFor(s, p, { ...e, t: e.t2 }, { ...ctx, usedChoice: true }, null)[0], s) : 0) : 0;
        for (const t of tg) { const n = e.sign * (base ?? wilOf(t, s)); if (n) t.mods.push({ stat: 'str', n, exp: expiry(s, p, t, e.dur, src) }); log(s, p, `${t.card.fullName} : ${n > 0 ? '+' : ''}${n} force.`); }
        break;
      }
      case 'countChars': ctx.num = P.play.length; break;
      case 'loreOpp': gainLore(s, other(p), e.n); log(s, p, `${O.name} gagne ${e.n} lore.`); break;
      case 'allLoseLore': for (const Q of s.players) Q.lore = Math.max(0, Q.lore - e.n); log(s, p, `Chaque joueur perd ${e.n} lore.`); break;
      case 'drain': { if (statics(s).some(x => x.ab.st === 'noLoreLoss' && x.src.owner !== p && s.active === p)) break; const lost = Math.min(e.n, O.lore); O.lore -= lost; gainLore(s, p, lost); log(s, p, `${O.name} perd ${lost} lore, ${P.name} les gagne.`); break; }
      case 'oppLoreFrom': { const lost = Math.min(e.max, tg[0]?.damage || 0, O.lore); O.lore -= lost; ctx.lost = lost; log(s, p, `${O.name} perd ${lost} lore.`); break; }
      case 'oppMayDiscard': {
        const worst = [...O.hand].sort((a, b) => cardValue(a.card) - cardValue(b.card))[0];
        if (worst && cardValue(worst.card) < 4) { O.hand.splice(O.hand.indexOf(worst), 1); O.discard.push(worst); log(s, p, `${O.name} défausse ${worst.card.name}.`); ctx.oppDeclined = false; }
        else { ctx.oppDeclined = true; log(s, p, `${O.name} refuse de défausser.`); }
        break;
      }
      case 'lucifer': {
        const act = O.hand.filter(x => x.card.kind === 'action').sort((a, b) => cardValue(a.card) - cardValue(b.card))[0];
        const two = [...O.hand].sort((a, b) => cardValue(a.card) - cardValue(b.card)).slice(0, 2);
        const lose = act && (two.length < 2 || cardValue(act.card) < two.reduce((n, x) => n + cardValue(x.card), 0)) ? [act] : two;
        for (const c of lose) { O.hand.splice(O.hand.indexOf(c), 1); O.discard.push(c); }
        log(s, p, `${O.name} défausse ${lose.map(c => c.card.name).join(', ')}.`); break;
      }
      case 'handLimit': { const Q = s.players[ctx.ev?.player ?? other(p)]; const n = Q.hand.length - e.n; if (n > 0) { Q.discard.push(...chooseCardsToDiscard(Q, n)); log(s, p, `${Q.name} défausse jusqu'à ${e.n} cartes.`); } break; }
      case 'handFill': { const q = ctx.ev?.player ?? other(p); const n = e.n - s.players[q].hand.length; if (n > 0) draw(s, q, n); break; }
      case 'eachToInk': for (const Q of s.players) { const pick = [...Q.play].sort((a, b) => instValue(s, a) - instValue(s, b)).slice(0, e.n); for (const t of pick) if (leavePlay(s, t)) { Q.inkwell.push(resetInst(t)); if (s.active === s.players.indexOf(Q)) Q.inkUsed++; } } log(s, p, `Chaque joueur met ${e.n} personnage(s) dans son encrier.`); break;
      case 'readyLimit': O.readyLimit = e.n; break;
      case 'banishItemsDraw': { const go = P.items.filter(i => cardValue(i.card) < 3 && i !== src); for (const i of go) banish(s, i, 'est sacrifié'); if (go.length) draw(s, p, go.length); log(s, p, `${P.name} sacrifie ${go.length} objet(s) et pioche autant.`); break; }
      case 'revealPlayPay': {
        const c = P.deck[P.deck.length - 1]; if (!c) break;
        const cost = c.card.battleLegal ? playCost(s, p, c) : 99;
        if (cost <= inkAvailable(P) && c.card.cost > 0) { P.deck.pop(); P.hand.push(c); const d = Math.min(P.inkDrops || 0, cost); P.inkDrops -= d; P.inkUsed += cost - d; log(s, p, `${P.name} révèle et joue ${c.card.fullName}.`); putIntoPlay(s, p, c, {}); }
        else { P.deck.pop(); P.discard.push(c); log(s, p, `${P.name} révèle ${c.card.name} et le défausse.`); }
        break;
      }
      case 'wheelSelf': P.discard.push(...P.hand.splice(0)); draw(s, p, e.n); log(s, p, `${P.name} défausse sa main et pioche ${e.n} cartes.`); break;
      case 'playSelfDiscard': {
        const c = ctx.banishedCard || src; const k = P.discard.indexOf(c);
        if (k < 0 || !c.card.battleLegal) { ctx.lastDone = false; break; }
        const cost = playCost(s, p, c); if (cost > inkAvailable(P)) { ctx.lastDone = false; break; }
        const d = Math.min(P.inkDrops || 0, cost); P.inkDrops -= d; P.inkUsed += cost - d;
        P.discard.splice(k, 1); P.hand.push(c); log(s, p, `${P.name} rejoue ${c.card.fullName} depuis sa défausse.`); putIntoPlay(s, p, c, {}); c.exerted = true; break;
      }
      case 'discardToInk': if (e.who === 'all') { const q0 = O.discard.sort((a, b) => cardValue(a.card) - cardValue(b.card)).splice(0, e.n || 1); O.inkwell.push(...q0); } {
        const got = P.discard.filter(x => typeMatch(x.card, e.type)).sort((a, b) => cardValue(a.card) - cardValue(b.card)).slice(0, e.n || 1);
        if (!got.length) { ctx.lastDone = false; break; }
        for (const c of got) { P.discard.splice(P.discard.indexOf(c), 1); P.inkwell.push(c); if (s.active === p) P.inkUsed++; }
        log(s, p, `${got.length} carte(s) passent de la défausse à l'encrier.`); fire(s, 'inked', { player: p }); break;
      }
      case 'inkToHand': { for (let k = 0; k < e.n && P.inkwell.length; k++) { const c = P.inkwell.splice(Math.floor(s.rnd() * P.inkwell.length), 1)[0]; P.hand.push(c); } P.inkUsed = Math.min(P.inkUsed, P.inkwell.length); log(s, p, `${P.name} reprend ${e.n} carte(s) de son encrier.`); break; }
      case 'handToBottom': { const cards = e.all ? P.hand.splice(0) : chooseCardsToDiscard(P, 1); P.deck.unshift(...cards); log(s, p, `${P.name} place ${cards.length} carte(s) sous son deck.`); break; }
      case 'drawFrom': { const n = e.stat === 'atLoc' ? (src?.at ? loreOf(findInst(s, src.at).inst, s) : 0) : tg[0]?.damage || 0; if (n) { draw(s, p, n); log(s, p, `${P.name} pioche ${n} carte(s).`); } else ctx.lastDone = false; break; }
      case 'shuffleBack': if (e.who === 'all') { const b0 = O.discard.filter(x => x.card.kind === 'character'); for (const c of b0) O.discard.splice(O.discard.indexOf(c), 1); O.deck.push(...b0); shuffle(O.deck, s.rnd); } {
        const back = P.discard.filter(x => x.card.kind === 'character' && (!e.cls || hasCls(x, e.cls) || x.card.nameEn.includes(e.cls)));
        for (const c of back) P.discard.splice(P.discard.indexOf(c), 1);
        P.deck.push(...back); shuffle(P.deck, s.rnd); log(s, p, `${P.name} remélange ${back.length} carte(s) de sa défausse dans son deck.`); break;
      }
      case 'readyAll': for (const t of [...P.play]) { t.exerted = false; t.mods.push({ restrict: 'quest', exp: { when: 'end', player: p } }); dealDamage(s, t, e.n); } log(s, p, `${P.name} redresse tous ses personnages.`); break;
      case 'handToInk': { const n = P.hand.length; P.inkwell.push(...P.hand.splice(0)); if (s.active === p) P.inkUsed += n; log(s, p, `${P.name} met toute sa main (${n}) dans son encrier.`); if (n) fire(s, 'inked', { player: p }); break; }
      case 'itToInk': {
        const c = ctx.it || ctx.banishedCard; const Q = c && s.players[c.owner]; const k = Q ? Q.discard.indexOf(c) : -1;
        if (k < 0 || c.owner !== p) { ctx.lastDone = false; break; }
        Q.discard.splice(k, 1); Q.inkwell.push(c); if (s.active === p) P.inkUsed++; log(s, p, `${c.card.fullName} part dans l'encrier.`); fire(s, 'inked', { player: p }); break;
      }
      case 'putUnder': {
        const host = e.self ? src : [...P.play, ...P.locations].filter(i => i.card.kw.boost != null).sort((a, b) => cardValue(b.card) - cardValue(a.card))[0];
        if (!host || !isInPlay(s, host) || !P.deck.length) { ctx.lastDone = false; break; }
        host.under.push(P.deck.pop()); host.putUnderTurn = s.turnNumber; log(s, p, `${P.name} glisse une carte sous ${host.card.fullName}.`);
        if (ctx.label === 'Boost') fire(s, 'boosted', { inst: host });
        fire(s, 'putUnder', { inst: host }); break;
      }
      case 'exertInk': P.inkUsed = P.inkwell.length; if (e.all) O.inkUsed = O.inkwell.length; log(s, p, `${P.name} épuise son encrier.`); break;
      case 'discardHand': { const Q = e.who === 'opp' ? O : P; Q.discard.push(...Q.hand.splice(0)); log(s, p, `${Q.name} défausse sa main.`); break; }
      case 'loreFrom': { const t = e.stat === 'location' ? ctx.ev?.location : e.stat === 'selfStr' || e.stat === 'itemCost' ? src : tg[0]; if (!t) { ctx.lastDone = false; break; }
        let n = e.stat === 'damage' ? t.damage : e.stat === 'selfStr' ? strOf(src, s) : e.stat === 'itemCost' ? Math.max(0, ...P.items.map(i => i.card.cost)) : loreOf(t, s); if (e.max) n = Math.min(n, e.max); log(s, p, `${P.name} gagne ${n} lore (${name}).`); gainLore(s, p, n); break; }
      case 'tuckSelf': {
        const c = ctx.banishedCard || src;
        if (isInPlay(s, c)) { leavePlay(s, c); P.deck.push(resetInst(c)); } else { const k = P.discard.indexOf(c); if (k < 0) { ctx.lastDone = false; break; } P.discard.splice(k, 1); P.deck.push(c); }
        shuffle(P.deck, s.rnd); log(s, p, `${c.card.fullName} est mélangé dans le deck.`); break;
      }
      case 'lockPlay': (s.locks ||= []).push({ player: e.all ? 'all' : other(p), by: p, types: e.types }); log(s, p, `${O.name} ne peut plus jouer d'${e.types.map(t => ({ action: 'actions', item: 'objets' }[t])).join(' ni d\'')} jusqu'au prochain tour de ${P.name}.`); break;
      case 'drawTo': { const n = Math.max(0, (e.match === 'opp' ? O.hand.length : e.n) - P.hand.length); if (n) { draw(s, p, n); log(s, p, `${P.name} pioche ${n} carte(s).`); } else ctx.lastDone = false; break; }
      case 'pickPlay': {
        const c = (ctx.looked || []).find(x => typeMatch(x.card, e.type) && x.card.battleLegal);
        if (!c) { ctx.lastDone = false; break; }
        ctx.looked.splice(ctx.looked.indexOf(c), 1); P.hand.push(c);
        log(s, p, `${P.name} révèle ${c.card.fullName} et le joue gratuitement.`);
        putIntoPlay(s, p, c, {}); if (e.exerted && isInPlay(s, c)) c.exerted = true;
        break;
      }
      case 'mill': { const Q = e.who === 'opp' ? O : P; const n = Math.min(e.n, Q.deck.length); const milled = Q.deck.splice(Q.deck.length - n); Q.discard.push(...milled); if (n) fire(s, 'milled', { player: s.players.indexOf(Q), cards: milled }); log(s, p, `${Q.name} défausse ${n} carte(s) du dessus de son deck.`); break; }
      case 'moveFree': {
        const l = e.there && ctx.ev?.location ? ctx.ev.location : [...P.locations].sort((a, b) => loreOf(b, s) - loreOf(a, s))[0];
        if (!l) { ctx.lastDone = false; break; }
        const who = (e.it ? (ctx.it && isInPlay(s, ctx.it) ? [ctx.it] : []) : P.play).filter(i => i.at !== l.uid).sort((a, b) => (b === src) - (a === src) || a.exerted - b.exerted || loreOf(b, s) - loreOf(a, s));
        const go = (e.self ? who.filter(i => i === src).concat(who.filter(i => i !== src)) : e.other ? who.filter(i => i !== src) : who).slice(0, e.n);
        ctx.moved = go.length; ctx.otherMoved = go.find(i => i !== src) || null;
        for (const i of go) { i.at = l.uid; log(s, p, `${i.card.fullName} se rend à ${l.card.fullName}.`); fire(s, 'move', { inst: i, location: l }); fire(s, 'moveHere', { inst: i, location: l }); }
        if (!go.length) ctx.lastDone = false;
        break;
      }
      case 'oppChoose': {
        const pool = O.play.filter(i => e.what !== 'exert' || !i.exerted).sort((a, b) => instValue(s, a) - instValue(s, b));
        const t = pool[0];
        if (!t) break;
        if (e.what === 'banish') banish(s, t, 'est banni (choix de son propriétaire)');
        else if (e.what === 'exert') { t.exerted = true; log(s, p, `${t.card.fullName} est épuisé.`); }
        else if (e.what === 'damage') dealDamage(s, t, e.n);
        else if (e.what === 'return') { if (leavePlay(s, t)) O.hand.push(resetInst(t)); }
        else if (e.what === 'tuck') { if (leavePlay(s, t)) O.deck.unshift(resetInst(t)); }
        break;
      }
      case 'wheel': for (const Q of s.players) { Q.discard.push(...Q.hand.splice(0)); } draw(s, 0, e.n); draw(s, 1, e.n); log(s, p, `Chaque joueur défausse sa main et pioche ${e.n} cartes.`); break;
      case 'delayedBanish': for (const t of tg) s.pending.push({ at: 'end', inst: t }); break;
      case 'choose': {
        if (e.both && condOk(s, src || { owner: p, damage: 0, mods: [] }, e.both, ctx)) { for (const o of e.options) resolve(s, p, o, ctx, chosen); break; }
        const best = e.options.map(o => ({ o, v: effectValue(s, p, o, ctx) })).sort((a, b) => (e.oppChooses ? a.v - b.v : b.v - a.v))[0];
        if (best) resolve(s, p, best.o, ctx, chosen);
        break;
      }
    }
  }
  // cartes regardées et non prises : sous le deck
  if (ctx.looked?.length) { if (ctx.lookTop) P.deck.push(...ctx.looked); else P.deck.unshift(...ctx.looked); ctx.looked = null; }
}

// ---------------------------------------------------------------- Règles : que peut-on faire ?

const isMyTurn = (s, p) => !s.over && s.active === p;
const inkLimit = (s, P) => 1 + P.extraInk + statics(s).filter(({ src, ab }) => ab.st === 'extraInk' && src.owner === s.players.indexOf(P) && staticActive(s, src, ab)).length;

export function canInk(s, p, uid) {
  const P = s.players[p]; const i = P.hand.find(x => x.uid === uid);
  return isMyTurn(s, p) && P.inked < inkLimit(s, P) && !!i && (i.card.inkable || statics(s).some(({ src, ab }) => ab.st === 'allInkable' && src.owner === p));
}

export function canQuest(s, p, uid) {
  const i = s.players[p].play.find(x => x.uid === uid);
  if (i && i.card.abilities.some(ab => ab.st === 'questTax') && inkAvailable(s.players[p]) < 1) return false;
  return isMyTurn(s, p) && !!i && !i.exerted && (!i.fresh || i.card.abilities.some(ab => ab.st === 'questFresh')) && !kwOf(s, i, 'reckless') && !restricted(s, i, 'quest');
}

function canAttack(s, p, i) {
  if (i.card.kw.adventurous) return false;
  if (statics(s).some(({ ab }) => ab.st === 'oneChallenger') && (s.players[p].turnLog || []).some(x => x.what === 'challenged')) return false;
  if (i.card.abilities.some(ab => ab.st === 'questTax') && inkAvailable(s.players[p]) < 1) return false;
  return isMyTurn(s, p) && i.owner === p && i.card.kind === 'character' && !i.exerted && (!i.fresh || kwOf(s, i, 'rush')) && !restricted(s, i, 'challenge');
}

function canBeChallengedBy(s, att, def) {
  for (const { src, ab } of statics(s)) if (ab.st === 'protect' && staticActive(s, src, ab) && appliesTo(s, src, ab.subj, def)
    && (ab.attDamaged ? att.damage > 0 : ab.maxCost != null ? att.card.cost <= ab.maxCost : ab.cls ? hasCls(att, ab.cls) : strOf(att, s) >= ab.minStr)) return false;
  if (def.card.kind === 'location') return true;
  if (!def.exerted && !kwOf(s, att, 'challengeReady') && !abilitiesOf(s, att).some(ab => ab.st === 'challengeReadyIf' && (ab.any || (ab.damaged ? def.damage > 0 : hasCls(def, ab.cls))))) return false;
  if (kwOf(s, def, 'evasive') && !kwOf(s, att, 'evasive') && !kwOf(s, att, 'alert')) return false;
  if (kwOf(s, def, 'unchallengeable') || restricted(s, def, 'be challenged')) return false;
  for (const { src, ab } of statics(s)) if (ab.st === 'protect' && staticActive(s, src, ab) && appliesTo(s, src, ab.subj, def) && (ab.maxCost != null ? att.card.cost <= ab.maxCost : ab.cls ? hasCls(att, ab.cls) : strOf(att, s) >= ab.minStr)) return false;
  return true;
}

export function challengeTargets(s, p, uid) {
  const att = s.players[p].play.find(x => x.uid === uid);
  if (!att || !canAttack(s, p, att)) return [];
  const O = s.players[other(p)];
  const chars = O.play.filter(d => canBeChallengedBy(s, att, d));
  const guards = chars.filter(d => kwOf(s, d, 'bodyguard') && d.exerted);
  return [...(guards.length ? guards : chars), ...O.locations.filter(l => canBeChallengedBy(s, att, l))].map(d => d.uid);
}

// Coût à payer pour jouer une carte (réductions comprises)
function playCost(s, p, inst) {
  const P = s.players[p], c = inst.card;
  let cost = c.cost;
  for (const d of P.discounts) if ((d.types ? d.types.includes(c.kind) : typeMatch(c, d.type))) { cost -= d.n; break; }
  for (const { src, ab } of statics(s)) {
    if (ab.st !== 'costLess' || src.owner !== p) continue;
    if (ab.cond && ab.cond.c !== 'here' && !condOk(s, src, ab.cond)) continue;
    const w = ab.what;
    if (w === 'this character' ? false : !(w === 'characters' ? c.kind === 'character' : w === 'items' ? c.kind === 'item' : w === 'actions' ? c.kind === 'action'
      : w === 'songs' ? c.isSong : w === 'locations' ? c.kind === 'location'
      : / named /.test(w) ? (c.kind === w.split(' ')[0].replace(/s$/, '') && c.nameEn === w.replace(/^\w+ named /, '')) : typeMatch(c, w.replace(/s$/, '')))) continue;
    cost -= ab.n;
  }
  for (const { ab } of statics(s)) if (ab.st === 'costMore' && ab.kinds.includes(c.kind)) cost += ab.n;
  if (c.kind === 'character' && !(P.playedList || []).some(x => x.card.kind === 'character'))
    for (const { src, ab } of statics(s)) if (ab.st === 'firstCharLess' && src.owner === p) cost -= ab.n;
  if (c.abilities.some(ab => ab.st === 'freeIf' && (!ab.yourTurn || s.active === p) && condOk(s, { ...inst, owner: p }, ab.cond))) return 0;
  // réduction écrite sur la carte elle-même (« If you have a character named X in play, you pay 2 less to play this character »)
  for (const ab of c.abilities) if (ab.kind === 'static' && ab.st === 'costLess' && ab.what === 'this character' && condOk(s, { ...inst, owner: p }, ab.cond)) cost -= ab.n * (ab.per ? count(s, p, ab.per, inst) : 1);
  return Math.max(0, cost);
}

/** Toutes les façons de jouer une carte de la main. */
export function playOptions(s, p, uid) {
  const P = s.players[p]; const i = P.hand.find(x => x.uid === uid);
  if (!i || !isMyTurn(s, p) || !i.card.battleLegal) return [];
  if (i.card.abilities.some(ab => ab.kind === 'static' && ab.st === 'playUnless' && !condOk(s, { ...i, owner: p }, ab.cond))) return [];
  if ((s.locks || []).some(l => l.player === p && l.types.includes(i.card.kind))) return [];
  if (statics(s).some(({ src, ab }) => ab.st === 'lockOpp' && src.owner !== p && ab.types.includes(i.card.kind) && i.card.cost >= ab.minCost && staticActive(s, src, ab))) return [];
  const c = i.card, ink = inkAvailable(P), out = [];
  const cost = playCost(s, p, i);
  if (cost <= ink) out.push({ mode: 'normal', cost });
  if (c.kind === 'character' && c.kw.shift != null)
    for (const base of P.play.filter(b => (b.card.nameEn === c.nameEn || b.card.abilities.some(ab => ab.st === 'shiftName' && (ab.name === c.nameEn || ab.name === '*'))) && b.card.id !== c.id)) {
      const less = statics(s).filter(({ src, ab }) => ab.st === 'shiftLess' && src.owner === p).reduce((n, { ab }) => n + ab.n, 0) + base.card.abilities.filter(ab => ab.st === 'shiftOntoLess').reduce((n, ab) => n + ab.n, 0);
      const cost = Math.max(0, c.kw.shift - less);
      if (cost <= ink) out.push({ mode: 'shift', cost, shiftOnto: base.uid });
    }
  if (c.isSong) {
    const singers = (s.locks || []).some(l => (l.player === p || l.player === 'all') && l.types.includes('sing')) ? [] : P.play.filter(x => !x.exerted && !x.fresh && !restricted(s, x, 'sing'));
    const singVal = x => Math.max(x.card.cost, numKw(s, x, 'singer'), ...x.mods.filter(m => m.singAs).map(m => m.singAs));
    for (const sg of singers.filter(x => singVal(x) >= c.cost && !x.card.abilities.some(ab => ab.st === 'soloSingBan'))) out.push({ mode: 'sing', cost: 0, singer: sg.uid });
    if (c.kw.singTogether && !out.some(o => o.mode === 'sing')) {
      const group = [];
      for (const x of singers.sort((a, b) => loreOf(a, s) - loreOf(b, s) || singVal(b) - singVal(a))) {
        if (group.reduce((n, g) => n + singVal(g), 0) >= c.kw.singTogether) break;
        group.push(x);
      }
      if (group.reduce((n, g) => n + singVal(g), 0) >= c.kw.singTogether) out.push({ mode: 'singTogether', cost: 0, singers: group.map(g => g.uid) });
    }
  }
  return out;
}

/** Capacités activables (⟳) d'un objet ou d'un personnage en jeu. */
export function activateOptions(s, p, uid) {
  const P = s.players[p]; const i = inPlay(P).find(x => x.uid === uid);
  if (!i || !isMyTurn(s, p)) return [];
  return abilitiesOf(s, i).map((ab, index) => ({ ab, index })).filter(({ ab }) => {
    if (ab.kind !== 'activated') return false;
    if (ab.once && i.once[ab.text]) return false;
    const c = ab.cost;
    if (c.exert && (i.exerted || (i.card.kind === 'character' && i.fresh))) return false;
    if (c.ink > inkAvailable(P)) return false;
    if (c.banishItem && P.items.filter(x => x !== i).length === 0) return false;
    if (c.discard && !P.hand.length) return false;
    if (c.banishItem > 1 && P.items.filter(x => x !== i).length < c.banishItem) return false;
    if (c.exertOther && !(c.exertOther === 'item' ? P.items : P.play).some(x => x !== i && !x.exerted && !(x.card.kind === 'character' && x.fresh))) return false;
    if (c.banishChar && !P.play.some(x => x !== i)) return false;
    return true;
  }).map(({ ab, index }) => ({ index, cost: ab.cost, label: ab.label, text: ab.text }));
}

/** Lieux où un personnage peut aller, avec le coût. */
export function moveOptions(s, p, uid) {
  const P = s.players[p]; const i = P.play.find(x => x.uid === uid);
  if (!i || !isMyTurn(s, p) || restricted(s, i, 'move')) return [];
  return P.locations.filter(l => i.at !== l.uid).map(l => {
    let cost = l.card.moveCost;
    for (const { src, ab } of statics(s)) if (ab.st === 'moveLess' && src.owner === p && (!ab.self || src === i)) cost = Math.max(0, cost - ab.n);
    for (const ab of l.card.abilities) if (ab.kind === 'static' && ab.st === 'freeMove' && (!ab.cls || hasCls(i, ab.cls)) && (!ab.named || i.card.nameEn === ab.named) && (!ab.exerted || i.exerted)) cost = 0;
    return { location: l.uid, cost };
  }).filter(o => o.cost <= inkAvailable(P));
}

/** Effet nécessitant une cible quand on joue / quête / active (pour l'interface). */
export function pendingTargetEffect(card, trigger, index = null) {
  const firstTargeted = list => {
    for (const e of list || []) {
      if (e.k === 'choose') continue;
      if (e.t && e.t.sel === 'chosen') return e;
    }
    return null;
  };
  if (trigger === 'activate') return firstTargeted(card.abilities[index]?.effects);
  if (trigger === 'play' && card.kind === 'action') return firstTargeted(card.effects);
  for (const ab of card.abilities) if (ab.kind === 'triggered' && ab.ons.some(o => o.on === trigger)) { const e = firstTargeted(ab.effects); if (e) return e; }
  return null;
}

// ---------------------------------------------------------------- Actions

function putIntoPlay(s, p, inst, { shiftOnto = null } = {}) {
  const P = s.players[p], c = inst.card;
  const hi = P.hand.indexOf(inst); if (hi >= 0) P.hand.splice(hi, 1);
  P.played[c.kind] = (P.played[c.kind] || 0) + 1;
  (P.playedList ||= []).push(inst);
  if (c.kind === 'action') {
    const actx = { src: inst, label: c.name };
    resolve(s, p, c.effects || [], actx, inst._chosen);
    if (actx.actionHit) fire(s, 'actionDamage', { inst });
    P.discard.push(inst);
    fire(s, 'youPlay', { inst });
    fire(s, 'oppPlay', { inst });
    return;
  }
  resetInst(inst);
  if (shiftOnto) {
    const base = P.play.find(x => x.uid === shiftOnto);
    P.play[P.play.indexOf(base)] = inst;
    inst.under = [...base.under, resetInst({ ...base, under: [] })];
    inst.damage = base.damage; inst.exerted = base.exerted; inst.fresh = base.fresh; inst.at = base.at; inst.shifted = true;
    for (const ab of base.card.abilities) if (ab.kind === 'triggered' && ab.ons.some(o => o.on === 'shiftedOnto')) resolve(s, p, ab.effects, { src: inst, label: ab.label });
  } else {
    P[zoneOf(inst)].push(inst);
    inst.fresh = c.kind === 'character';
    for (const ab of c.abilities) if (ab.kind === 'static' && (ab.st === 'entersExerted' || ab.entersExerted) && !(ab.unless && condOk(s, inst, ab.unless))) inst.exerted = true;
    for (const { src, ab } of statics(s)) if (src.owner !== p && staticActive(s, src, ab)) {
      if (ab.st === 'oppEnterDamaged' && ownKw(inst, ab.kw)) inst.damage = Math.max(inst.damage, 1);
      if (ab.st === 'oppEnterExerted' && c.kind === ab.kind && (!ab.kw || ownKw(inst, ab.kw))) inst.exerted = true;
    }
    for (const ab of c.abilities) if (ab.kind === 'static' && ab.st === 'entersDamaged') inst.damage = ab.n;
  }
  const chosen = inst._chosen; inst._chosen = undefined;
  for (const ab of c.abilities) if (ab.kind === 'triggered' && ab.ons.some(o => o.on === 'play' && (!o.shifted || inst.shifted))) {
    if (ab.once && inst.once[ab.text]) continue;
    resolve(s, p, ab.effects, { src: inst, label: ab.label, shifted: inst.shifted }, chosen);
  }
  fire(s, 'youPlay', { inst, paid: inst._paid });
  fire(s, 'oppPlay', { inst });
}

/**
 * Applique une action. a = {type:'ink'|'play'|'quest'|'challenge'|'activate'|'move'|'end', uid, target, mode, shiftOnto, singer, index}
 * Renvoie {ok, error?}
 */
export function applyAction(s, a) {
  if (s.over) return { ok: false, error: 'Partie terminée' };
  const p = s.active, P = s.players[p];
  switch (a.type) {
    case 'ink': {
      if (!canInk(s, p, a.uid)) return { ok: false, error: 'Impossible de mettre cette carte dans l\'encrier' };
      const i = P.hand.find(x => x.uid === a.uid);
      P.hand.splice(P.hand.indexOf(i), 1); P.inkwell.push(i); P.inked++;
      if (statics(s).some(({ src, ab }) => ab.st === 'oppInkExerted' && src.owner !== p && staticActive(s, src, ab))) P.inkUsed++;
      log(s, p, `${P.name} ajoute une carte à son encrier.`);
      fire(s, 'inked', { player: p });
      return { ok: true };
    }
    case 'play': {
      const opt = playOptions(s, p, a.uid).find(o => o.mode === (a.mode || 'normal') && (o.shiftOnto == null || o.shiftOnto === a.shiftOnto) && (o.singer == null || o.singer === a.singer));
      if (!opt) return { ok: false, error: 'Impossible de jouer cette carte' };
      const i = P.hand.find(x => x.uid === a.uid), c = i.card;
      // paiement
      if (opt.mode === 'normal') { const d = P.discounts.findIndex(x => (x.types ? x.types.includes(c.kind) : typeMatch(c, x.type))); if (d >= 0) P.discounts.splice(d, 1); }
      let cost = opt.cost;
      const fromDrops = Math.min(P.inkDrops || 0, cost); P.inkDrops -= fromDrops; cost -= fromDrops;
      P.inkUsed += cost; i.usedDrop = fromDrops > 0; i._paid = opt.cost; if (fromDrops) fire(s, 'dropUsed', { player: p });
      if (opt.mode === 'sing' || opt.mode === 'singTogether') {
        const sg = opt.mode === 'sing' ? [opt.singer] : opt.singers;
        i._singers = sg.map(u => P.play.find(y => y.uid === u));
        for (const u of sg) { const x = P.play.find(y => y.uid === u); x.exerted = true; fire(s, 'exerts', { inst: x }); fire(s, 'sing', { singer: x, together: opt.mode === 'singTogether' }); }
        log(s, p, `${sg.map(u => findInst(s, u).inst.card.name).join(' et ')} chante${sg.length > 1 ? 'nt' : ''} ${c.fullName}.`);
      } else log(s, p, `${P.name} joue ${c.fullName}${opt.mode === 'shift' ? ` par Alter sur ${findInst(s, opt.shiftOnto).inst.card.fullName}` : ''}.`);
      i._chosen = a.target;
      putIntoPlay(s, p, i, { shiftOnto: opt.mode === 'shift' ? opt.shiftOnto : null });
      return { ok: true };
    }
    case 'quest': {
      if (!canQuest(s, p, a.uid)) return { ok: false, error: 'Ce personnage ne peut pas quêter' };
      const i = P.play.find(x => x.uid === a.uid);
      if (i.card.abilities.some(ab => ab.st === 'questTax')) P.inkUsed++;
      i.exerted = true; (P.turnLog ||= []).push({ what: 'quested', inst: i }); fire(s, 'exerts', { inst: i });
      const l = loreOf(i, s);
      log(s, p, `${i.card.fullName} part en quête : +${l} lore.`);
      if (kwOf(s, i, 'support')) {
        const mate = P.play.filter(x => x !== i && !x.exerted).sort((x, y) => strOf(y, s) - strOf(x, s))[0];
        if (mate && strOf(i, s) > 0) { mate.mods.push({ stat: 'str', n: strOf(i, s), exp: { when: 'end', player: p } }); log(s, p, `Soutien : ${mate.card.fullName} gagne +${strOf(i, s)} force.`); fire(s, 'supportChosen', { inst: mate }); }
      }
      gainLore(s, p, l);
      if (s.over) return { ok: true };
      for (const ab of abilitiesOf(s, i)) if (ab.kind === 'triggered' && ab.ons.some(o => o.on === 'quest' && (!o.atLocation || i.at))) {
        if (ab.once && i.once[ab.text]) continue;
        if (ab.once) i.once[ab.text] = true;
        resolve(s, p, ab.effects, { src: i, label: ab.label }, a.target);
      }
      fire(s, 'anyQuest', { inst: i });
      if (i.at) fire(s, 'questHere', { inst: i });
      return { ok: true };
    }
    case 'challenge': {
      if (!challengeTargets(s, p, a.uid).includes(a.target)) return { ok: false, error: 'Défi impossible' };
      const att = P.play.find(x => x.uid === a.uid), def = findInst(s, a.target).inst;
      if (att.card.abilities.some(ab => ab.st === 'questTax')) P.inkUsed++;
      att.exerted = true; (P.turnLog ||= []).push({ what: 'challenged', inst: att }); fire(s, 'exerts', { inst: att });
      const isLoc = def.card.kind === 'location';
      fire(s, 'challenge', { attacker: att, defender: def });
      if (!isInPlay(s, att) || !isInPlay(s, def)) return { ok: true };
      def.challengedTurn = s.turnNumber;
      fire(s, 'challenged', { attacker: att, defender: def });
      fire(s, 'allyChallenged', { attacker: att, defender: def });
      if (def.at) fire(s, 'challengedHere', { attacker: att, defender: def });
      if (!isInPlay(s, att) || !isInPlay(s, def)) return { ok: true };
      s.inChallenge = { attacker: att, defender: def }; s.lastChallenge = { attacker: att, defender: def };
      const toDef = strOf(att, s) + (isLoc ? 0 : numKw(s, att, 'challenger'));
      const toAtt = isLoc || kwOf(s, att, 'noChallengeDamage') ? 0 : strOf(def, s);
      s.inChallenge = null;
      log(s, p, `${att.card.fullName} défie ${def.card.fullName} (${toDef} contre ${toAtt}).`);
      const dealt = dealDamage(s, def, toDef, { inChallenge: true, challenger: att });
      if (dealt && !isLoc) fire(s, 'challengeDamage', { attacker: att, defender: def, amount: dealt });
      const defBanished = !isInPlay(s, def);
      if (toAtt) dealDamage(s, att, toAtt, { inChallenge: true, challenger: def });
      if (defBanished && !isLoc) fire(s, 'banishInChallenge', { attacker: att, defender: def, defenderBanished: true });
      return { ok: true };
    }
    case 'activate': {
      const opt = activateOptions(s, p, a.uid).find(o => o.index === a.index);
      if (!opt) return { ok: false, error: 'Capacité indisponible' };
      const i = inPlay(P).find(x => x.uid === a.uid), ab = abilitiesOf(s, i)[a.index], c = ab.cost;
      if (ab.once) i.once[ab.text] = true;
      if (c.exert) { i.exerted = true; fire(s, 'exerts', { inst: i }); }
      let ink = c.ink || 0; const fromDrops = Math.min(P.inkDrops || 0, ink); P.inkDrops -= fromDrops; P.inkUsed += ink - fromDrops;
      if (c.discard) P.discard.push(...chooseCardsToDiscard(P, 1));
      for (let k = 0; k < (c.banishItem || 0); k++) { const it = P.items.filter(x => x !== i).sort((a2, b2) => cardValue(a2.card) - cardValue(b2.card))[0]; if (it) banish(s, it, 'est sacrifié'); }
      if (c.exertOther) { const x = (c.exertOther === 'item' ? P.items : P.play).filter(y => y !== i && !y.exerted && !(y.card.kind === 'character' && y.fresh)).sort((a2, b2) => cardValue(a2.card) - cardValue(b2.card))[0]; if (x) { x.exerted = true; fire(s, 'exerts', { inst: x }); } }
      if (c.banishChar) { const x = P.play.filter(y => y !== i).sort((a2, b2) => instValue(s, a2) - instValue(s, b2))[0]; if (x) banish(s, x, 'est sacrifié'); }
      if (c.selfDamage) dealDamage(s, i, c.selfDamage);
      log(s, p, `${i.card.fullName} utilise « ${ab.label || 'capacité'} ».`);
      if (c.banish) banish(s, i, 'est banni pour son effet');
      resolve(s, p, ab.effects, { src: i, label: ab.label }, a.target);
      return { ok: true };
    }
    case 'move': {
      const opt = moveOptions(s, p, a.uid).find(o => o.location === a.target);
      if (!opt) return { ok: false, error: 'Déplacement impossible' };
      const i = P.play.find(x => x.uid === a.uid), l = P.locations.find(x => x.uid === a.target);
      const from = i.at; P.inkUsed += opt.cost; i.at = l.uid;
      log(s, p, `${i.card.fullName} se rend à ${l.card.fullName}.`);
      fire(s, 'move', { inst: i, location: l });
      fire(s, 'moveHere', { inst: i, location: l, from });
      return { ok: true };
    }
    case 'end': {
      endTurnCleanup(s);
      if (s.over) return { ok: true };
      log(s, p, `${P.name} termine son tour.`);
      s.active = other(p); s.turnNumber++;
      startTurn(s);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Action inconnue' };
}

// ---------------------------------------------------------------- IA

const instValue = (s, i) => (i.card.kind === 'character' ? cardValue(i.card) + loreOf(i, s) + strOf(i, s) * 0.3 : cardValue(i.card));

function aiPick(s, p, e, valid, n = 1) {
  const mine = i => i.owner === p;
  const score = i => {
    const v = instValue(s, i);
    switch (e.k) {
      case 'damage': { const d = e.n === 'selfStr' ? 3 : e.n; if (mine(i)) return -100; return wilOf(i, s) - i.damage <= d ? 10 + v : v * 0.3; }
      case 'banish': case 'return': case 'toInk': case 'tuck': return mine(i) ? -50 - v : v + i.card.cost;
      case 'exert': return mine(i) ? -20 : (i.exerted ? -5 : strOf(i, s) + loreOf(i, s));
      case 'restrict': return mine(i) ? -20 : loreOf(i, s) * 2 + strOf(i, s);
      case 'heal': return mine(i) ? i.damage * 2 + v * 0.1 : -100;
      case 'mod': {
        const good = e.mods.reduce((t, [, x]) => t + x, 0) > 0;
        return good === mine(i) ? (mine(i) ? (i.exerted ? 0 : 3) + loreOf(i, s) + strOf(i, s) * 0.5 : v) : -100;
      }
      case 'grant': return mine(i) ? (i.exerted ? 0 : 3) + strOf(i, s) : (e.kws.some(g => g.kw === 'reckless') ? v : -100);
      case 'ready': return mine(i) ? (i.exerted ? loreOf(i, s) * 3 + 1 : -2) : -100;
      case 'moveDamage': return mine(i) ? i.damage * 3 : -100;
      default: return mine(i) ? 1 : 0;
    }
  };
  return [...valid].sort((a, b) => score(b) - score(a)).filter(i => score(i) > -50 || n === 1 && !valid.some(x => score(x) > -50)).slice(0, n);
}

/** Valeur estimée d'une liste d'effets pour le joueur p (positive = bon pour lui). */
function effectValue(s, p, effects, ctx = {}) {
  let v = 0;
  const O = s.players[other(p)], P = s.players[p];
  for (const e of effects || []) {
    if (e.cond && ctx.src && !condOk(s, ctx.src, e.cond, ctx)) continue;
    const valid = e.t ? (e.t.sel === 'chosen' ? candidates(s, p, e.t, ctx) : targetsFor(s, p, e, { ...ctx }, null)) : [];
    const best = valid.length && e.t?.sel === 'chosen' ? aiPick(s, p, e, valid, 1)[0] : null;
    const opp = x => x && x.owner !== p;
    switch (e.k) {
      case 'damage': if (e.t.sel === 'each') v += valid.reduce((n, i) => n + (opp(i) ? (wilOf(i, s) - i.damage <= (e.n === 'selfStr' ? 2 : e.n) ? 3 + instValue(s, i) : 0.6) : -1.5), 0);
        else if (opp(best)) v += wilOf(best, s) - best.damage <= (e.n === 'selfStr' ? 2 : e.n) ? 4 + instValue(s, best) : 1; break;
      case 'banish': if (e.t.sel === 'each') v += valid.reduce((n, i) => n + (opp(i) ? 1 : -1) * instValue(s, i), 0); else if (opp(best)) v += 3 + instValue(s, best); else if (best) v -= instValue(s, best); else v -= valid.filter(i => !opp(i)).reduce((n, i) => n + instValue(s, i), 0); break;
      case 'return': case 'toInk': case 'tuck': if (e.t.sel === 'each') v += valid.reduce((n, i) => n + (opp(i) ? 1 : -0.5) * instValue(s, i), 0); else if (opp(best)) v += 2 + instValue(s, best) * 0.8; else if (best) v -= 1 + instValue(s, best) * 0.3; else v -= valid.filter(i => !opp(i)).reduce((n, i) => n + instValue(s, i) * 0.5, 0); break;
      case 'exert': v += valid.filter(i => opp(i) && !i.exerted).length * 1.5; break;
      case 'ready': v += valid.filter(i => !opp(i) && i.exerted).reduce((n, i) => n + loreOf(i, s) * 1.5 + 0.5, 0); break;
      case 'mod': { const tot = e.mods.reduce((n, [st, x]) => n + x * (st === 'lore' ? 2 : 0.6), 0); v += Math.abs(tot) * Math.max(1, e.t.sel === 'each' ? valid.length : 1) * (valid.length ? 1 : 0); break; }
      case 'grant': v += valid.length ? 1 : 0; break;
      case 'restrict': v += valid.filter(opp).length * 1.2; break;
      case 'heal': v += valid.filter(i => !opp(i)).reduce((n, i) => n + Math.min(i.damage, e.n), 0) * 0.6; break;
      case 'moveDamage': v += 1; break;
      case 'draw': v += e.who === 'opp' ? -e.n : e.who === 'all' ? 0.3 : e.n * 2; break;
      case 'loot': v += 0.8; break;
      case 'discard': v += e.who === 'opp' ? (O.hand.length ? 2 : 0) : e.who === 'all' ? 0.3 : -1.5 * e.n; break;
      case 'lore': v += e.n * 2.5; break;
      case 'oppLore': v += Math.min(e.n, O.lore) * 2.3; break;
      case 'inkDrop': case 'ramp': v += e.n * 1.2; break;
      case 'readyInk': v += P.inkUsed * 0.6; break;
      case 'recur': case 'recurIt': case 'returnSelfCard': case 'tutorDeck': case 'pick': v += 1.8; break;
      case 'playFree': case 'pickPlay': v += 3; break;
      case 'moveFree': v += P.locations.length ? 1 : -1; break;
      case 'mill': v += e.who === 'opp' ? 0.3 : -0.2; break;
      case 'discount': v += e.n * 0.7; break;
      case 'oppChoose': v += O.play.length ? 3 : 0; break;
      case 'choose': v += Math.max(...e.options.map(o => effectValue(s, p, o, ctx))); break;
      case 'delayedBanish': v -= 2; break;
      case 'payInk': v -= e.n * 0.8 + (inkAvailable(P) < e.n ? 50 : 0); break;
      case 'noop': case 'lookBack': break;
      case 'itToInk': v += 1.2; break;
      case 'mark': case 'countChars': break;
      case 'grantAb': v += valid.length ? 1.5 : 0; break;
      case 'grantSinger': v += 0.5; break;
      case 'modFrom': v += valid.length ? 1.5 : 0; break;
      case 'loreOpp': v -= e.n * 2.5; break;
      case 'allLoseLore': v += (Math.min(e.n, O.lore) - Math.min(e.n, P.lore)) * 2.3; break;
      case 'drain': v += Math.min(e.n, O.lore) * 4.5; break;
      case 'oppLoreFrom': v += Math.min(e.max, best?.damage || 0, O.lore) * 2.3; break;
      case 'oppMayDiscard': v += O.hand.length ? 1 : 0; break;
      case 'lucifer': v += O.hand.length ? 2.5 : 0; break;
      case 'handLimit': case 'handFill': v += 0.5; break;
      case 'eachToInk': v += (O.play.length ? 2 : 0) - (P.play.length ? 2 : 0); break;
      case 'readyLimit': v += O.play.filter(i => i.exerted).length > 1 ? 2 : 0; break;
      case 'banishItemsDraw': v += P.items.filter(i => cardValue(i.card) < 3).length * 0.8; break;
      case 'revealPlayPay': case 'playSelfDiscard': v += 2; break;
      case 'wheelSelf': v += P.hand.length < 3 ? 2 : -1; break;
      case 'turnTrigger': v += 1.5; break;
      case 'handToInk': v += P.inkwell.length < 7 ? P.hand.length * 0.6 - 1 : -P.hand.length; break;
      case 'putUnder': { const host = e.self ? ctx.src : P.play.find(i => i.card.kw.boost != null);
        const cares = host && host.card.abilities.some(ab => JSON.stringify(ab).includes('under') && ab.label !== 'Boost');
        v += !host || P.deck.length < 8 ? -1 : cares ? (host.under.length ? 2.2 : 3.5) : 0.2; break; }
      case 'exertInk': v -= Math.max(0, inkAvailable(P)) * 0.5; break;
      case 'discardHand': v += e.who === 'opp' ? O.hand.length * 1.2 : -P.hand.length * 1.2; break;
      case 'discardToInk': v += P.discard.some(x => typeMatch(x.card, e.type)) ? 1.5 : 0; break;
      case 'shuffleBack': v += 0.2; break;
      case 'inkToHand': v -= 1; break;
      case 'handToBottom': v -= e.all ? P.hand.length : 0.3; break;
      case 'drawFrom': v += (best?.damage || 0) * 1.8; break;
      case 'readyAll': v += P.play.filter(i => i.exerted).length * 1.5 - P.play.length * 0.8; break;
      case 'loreFrom': v += e.stat === 'location' ? 3 : best ? (e.stat === 'damage' ? best.damage : loreOf(best, s)) * 2.5 : 0; break;
      case 'tuckSelf': v -= ctx.src && isInPlay(s, ctx.src) ? instValue(s, ctx.src) : 0; break;
      case 'lockPlay': v += 1.5; break;
      case 'drawTo': v += Math.max(0, (e.match === 'opp' ? O.hand.length : e.n) - P.hand.length) * 2; break;
      default: v += 0.3;
    }
  }
  return v;
}

const triggered = (c, on) => c.abilities.filter(ab => ab.kind === 'triggered' && ab.ons.some(o => o.on === on)).flatMap(ab => ab.effects);

/** Choisit la prochaine action de l'IA. difficulty : 'easy' | 'normal' | 'hard' */
export function aiNextAction(s, difficulty = 'normal') {
  const p = s.active, P = s.players[p], O = s.players[other(p)];
  const easy = difficulty === 'easy';
  const rnd = s.rnd || Math.random;

  // 1. Encrier
  if (P.inked < inkLimit(s, P)) {
    const inkables = P.hand.filter(i => i.card.inkable);
    if (inkables.length && (P.inkwell.length < 7 || P.hand.length > 4)) {
      const ink = P.inkwell.length;
      const pick = (easy ? shuffle([...inkables], rnd) : inkables.sort((a, b) => {
        const fa = a.card.cost > ink + 3 ? 1 : 0, fb = b.card.cost > ink + 3 ? 1 : 0;
        if (fa !== fb) return fb - fa;
        return (cardValue(a.card) + (a.card.battleLegal ? 0 : -50)) - (cardValue(b.card) + (b.card.battleLegal ? 0 : -50));
      }))[0];
      return { type: 'ink', uid: pick.uid };
    }
  }

  // 2. Jouer des cartes
  const plays = [];
  for (const i of P.hand) for (const o of playOptions(s, p, i.uid)) {
    const c = i.card;
    let v;
    if (c.kind === 'action') {
      v = effectValue(s, p, c.effects, { src: i }) * 1.3;
      if (o.mode === 'sing') { const sg = P.play.find(x => x.uid === o.singer); v -= loreOf(sg, s) * 1.5; v += c.cost * 0.8; }
      if (o.mode === 'singTogether') { v -= o.singers.reduce((n, u) => n + loreOf(findInst(s, u).inst, s), 0) * 1.5; v += c.cost * 0.8; }
    } else {
      v = cardValue(c) + c.cost * 1.1 + (o.mode === 'shift' ? 3 : 0) + effectValue(s, p, triggered(c, 'play'), { src: i, shifted: o.mode === 'shift' });
      if (c.kind === 'location') v += P.play.length ? 1 : -1;
    }
    if (v > 1.5) plays.push({ v: v + (easy ? rnd() * 6 : 0), a: { type: 'play', uid: i.uid, ...o, target: undefined } });
  }
  plays.sort((x, y) => y.v - x.v);
  if (plays.length) {
    const a = plays[0].a;
    const card = P.hand.find(x => x.uid === a.uid).card;
    const eff = pendingTargetEffect(card, 'play');
    if (eff) { const valid = candidates(s, p, eff.t, {}); const b = aiPick(s, p, eff, valid, 1)[0]; if (b) a.target = b.uid; }
    return a;
  }

  // 3. Capacités activables (objets surtout)
  for (const i of inPlay(P)) for (const o of activateOptions(s, p, i.uid)) {
    const ab = abilitiesOf(s, i)[o.index];
    let v = effectValue(s, p, ab.effects, { src: i }) - (o.cost.ink || 0) * 0.8 - (o.cost.banish ? cardValue(i.card) * 0.5 : 0) - (o.cost.discard ? 1.5 : 0);
    if (i.card.kind === 'character' && o.cost.exert) v -= canQuest(s, p, i.uid) ? loreOf(i, s) * 2 : 0;
    if (v > 1.2 && !(easy && rnd() < 0.5)) {
      const a = { type: 'activate', uid: i.uid, index: o.index };
      const eff = pendingTargetEffect(i.card, 'activate', o.index);
      if (eff) { const b = aiPick(s, p, eff, candidates(s, p, eff.t, { src: i }), 1)[0]; if (b) a.target = b.uid; }
      return a;
    }
  }

  // 4. Déplacements vers un lieu (bonus « ici »)
  if (!easy) for (const i of P.play) for (const o of moveOptions(s, p, i.uid)) {
    const l = findInst(s, o.location).inst;
    const gain = l.card.abilities.filter(ab => ab.kind === 'static' && ab.cond?.c === 'here' && ab.st === 'mod').reduce((n, ab) => n + ab.mods.reduce((m, [st, x]) => m + x * (st === 'lore' ? 2.5 : 0.5), 0), 0);
    if (gain - o.cost * 0.8 > 0.8) return { type: 'move', uid: i.uid, target: o.location };
  }

  // 5. Défis
  const potentialLore = P.play.filter(i => canQuest(s, p, i.uid)).reduce((n, i) => n + loreOf(i, s), 0);
  const racing = P.lore + potentialLore >= RULES.LORE_TO_WIN;
  if (!racing && !(easy && rnd() < 0.5)) {
    let best = null;
    for (const att of P.play) for (const tu of challengeTargets(s, p, att.uid)) {
      const def = findInst(s, tu).inst, isLoc = def.card.kind === 'location';
      const toDef = strOf(att, s) + (isLoc ? 0 : numKw(s, att, 'challenger')) - numKw(s, def, 'resist');
      const toAtt = isLoc ? 0 : strOf(def, s) - numKw(s, att, 'resist');
      const kills = def.damage + toDef >= wilOf(def, s), dies = att.damage + toAtt >= wilOf(att, s);
      let v = (kills ? 3 + instValue(s, def) + loreOf(def, s) * 1.5 : toDef * 0.3) - (dies ? 2 + instValue(s, att) : toAtt * 0.2);
      if (canQuest(s, p, att.uid)) v -= loreOf(att, s) * 1.4;
      if (kwOf(s, att, 'reckless')) v += 3;
      if (!best || v > best.v) best = { v, a: { type: 'challenge', uid: att.uid, target: tu } };
    }
    if (best && best.v > 0.5) return best.a;
  }

  // 6. Quêtes
  const q = P.play.filter(i => canQuest(s, p, i.uid)).sort((a, b) => loreOf(b, s) - loreOf(a, s))[0];
  if (q) {
    const a = { type: 'quest', uid: q.uid };
    const eff = pendingTargetEffect(q.card, 'quest');
    if (eff) { const b = aiPick(s, p, eff, candidates(s, p, eff.t, { src: q }), 1)[0]; if (b) a.target = b.uid; }
    return a;
  }
  return { type: 'end' };
}

// ---------------------------------------------------------------- Construction de decks

/** Vérifie un deck (liste de lignes de cartes). Renvoie la liste des problèmes. */
export function validateDeck(rows) {
  const errs = [];
  const cards = rows.map(parseCard);
  if (cards.length < RULES.DECK_SIZE) errs.push(`Le deck doit contenir au moins ${RULES.DECK_SIZE} cartes (${cards.length} actuellement).`);
  const byName = {};
  for (const c of cards) byName[c.fullName] = (byName[c.fullName] || 0) + 1;
  for (const [n, q] of Object.entries(byName)) if (q > RULES.MAX_COPIES) errs.push(`${n} : ${RULES.MAX_COPIES} exemplaires maximum.`);
  const inks = new Set(cards.flatMap(c => c.inks.length ? c.inks : [c.ink]).filter(Boolean));
  if (inks.size > RULES.MAX_INKS) errs.push(`${RULES.MAX_INKS} encres maximum (${[...inks].join(', ')}).`);
  const illegal = cards.filter(c => !c.battleLegal);
  if (illegal.length) errs.push(`Cartes non jouables en combat : ${[...new Set(illegal.map(c => c.fullName))].join(', ')}.`);
  return errs;
}

/** Construit un deck valide à partir d'un ensemble de cartes disponibles (lignes), pour 1 ou 2 encres. */
export function buildDeck(pool, inks, { rnd = Math.random, available = null, start = [] } = {}) {
  const ok = pool.map(parseCard).filter(c => c.battleLegal && c.inks.length <= 1 && inks.includes(c.ink));
  // un seul exemplaire de chaque nom complet
  const byName = new Map();
  for (const c of ok) if (!byName.has(c.fullName)) byName.set(c.fullName, c);
  const candidates2 = [...byName.values()];
  const curve = { 1: 6, 2: 12, 3: 12, 4: 10, 5: 8, 6: 6, 7: 6 }; // 60 cartes
  const deck = start.map(parseCard); // cartes déjà choisies (pour compléter un deck)
  const copies = c => Math.min(RULES.MAX_COPIES, available ? (available[c.fullName] || 0) : RULES.MAX_COPIES);
  const add = c => { const n = Math.min(copies(c) - deck.filter(x => x.fullName === c.fullName).length, RULES.DECK_SIZE - deck.length); for (let k = 0; k < n; k++) deck.push(c); };
  const score = c => cardValue(c) / Math.max(1, c.cost) + (c.kind === 'character' ? 1 : 0) + (c.inkable ? 0.6 : 0) + (c.fullyHandled ? 0.3 : 0) + rnd() * 1.5;
  for (const [cost, want] of Object.entries(curve)) {
    const bucket = candidates2.filter(c => (+cost === 7 ? c.cost >= 7 : c.cost === +cost)).sort((a, b) => score(b) - score(a));
    const inBucket = () => deck.filter(x => (+cost === 7 ? x.cost >= 7 : x.cost === +cost)).length;
    for (const c of bucket) { if (inBucket() >= want) break; add(c); }
  }
  const rest = candidates2.sort((a, b) => score(b) - score(a));
  for (const c of rest) { if (deck.length >= RULES.DECK_SIZE) break; add(c); }
  return deck.slice(0, Math.max(RULES.DECK_SIZE, start.length)).map(c => c.id);
}
