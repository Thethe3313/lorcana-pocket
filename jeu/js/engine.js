// Moteur de combat Lorcana (règles simplifiées) + IA.
// Module pur, sans DOM : utilisé par le navigateur, le serveur (decks de départ) et les tests.

export const RULES = { LORE_TO_WIN: 20, DECK_SIZE: 30, MAX_COPIES: 2, MAX_INKS: 2, HAND_START: 7 };
export const INKS = ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'];

// ---------------------------------------------------------------- Analyse des cartes

const stripReminder = t => (t || '').replace(/\([^)]*\)?/g, '').replace(/[ \t]+/g, ' ').trim();
const num = s => (s === 'a' || s === 'an' ? 1 : Number(s));

// Traduit une phrase d'effet en objet. Renvoie null si la phrase n'est pas gérée.
function parseSentence(raw) {
  let s = raw.trim().replace(/[.!]$/, '').replace(/^then,?\s*/i, '').replace(/’/g, "'").trim();
  let optional = false, m;
  if ((m = s.match(/^you may (.+)$/i))) { optional = true; s = m[1]; }
  const E = o => ({ optional, filter: {}, ...o });
  const who = w => (w ? 'opp' : 'any');

  if ((m = s.match(/^deal (\d+) damage to chosen (opposing )?(damaged )?character(?: or location)?$/i)))
    return E({ kind: 'damage', amount: +m[1], target: who(m[2]), filter: m[3] ? { damaged: true } : {} });
  if ((m = s.match(/^deal (\d+) damage to each opposing character$/i)))
    return E({ kind: 'damageAllOpp', amount: +m[1] });
  if ((m = s.match(/^draw (a|\d+) cards?$/i))) return E({ kind: 'draw', amount: num(m[1]) });
  if ((m = s.match(/^(?:you )?gain (\d+) lore$/i))) return E({ kind: 'gainLore', amount: +m[1] });
  if ((m = s.match(/^each opponent loses (\d+) lore$/i))) return E({ kind: 'oppLoseLore', amount: +m[1] });
  if ((m = s.match(/^banish chosen (opposing )?(damaged )?character(?: with (\d+) \{S\} or less)?$/i)))
    return E({ kind: 'banish', target: who(m[1]), filter: { damaged: !!m[2], maxStr: m[3] != null ? +m[3] : undefined } });
  if ((m = s.match(/^banish all (opposing )?characters$/i))) return E({ kind: 'banishAll', oppOnly: !!m[1] });
  if ((m = s.match(/^return chosen (opposing )?character(?:, item, or location| or item)?(?: with cost (\d+) or less)? to (?:their player's|its player's|your) hand$/i)))
    return E({ kind: 'return', target: who(m[1]), filter: { maxCost: m[2] != null ? +m[2] : undefined } });
  if ((m = s.match(/^exert chosen (opposing )?(damaged )?character$/i)))
    return E({ kind: 'exert', target: who(m[1]), filter: m[2] ? { damaged: true } : {} });
  if ((m = s.match(/^remove up to (\d+) damage from chosen character(?: of yours)?$/i)))
    return E({ kind: 'heal', amount: +m[1], target: 'own' });
  if ((m = s.match(/^remove all damage from chosen character(?: of yours)?$/i)))
    return E({ kind: 'heal', amount: 99, target: 'own' });
  if ((m = s.match(/^remove up to (\d+) damage from each of your characters$/i)))
    return E({ kind: 'healAll', amount: +m[1] });
  if ((m = s.match(/^(?:give )?chosen (opposing )?character(?: of yours)? (?:gets )?([+-]\d+) \{S\} this turn$/i)))
    return E({ kind: 'buffStr', amount: +m[2], target: m[1] ? 'opp' : (+m[2] > 0 ? 'own' : 'any') });
  if ((m = s.match(/^chosen character(?: of yours)? gets \+(\d+) \{L\} this turn$/i)))
    return E({ kind: 'buffLore', amount: +m[1], target: 'own' });
  if ((m = s.match(/^chosen character(?: of yours)? gains (Rush|Evasive|Ward|Challenger \+\d+|Resist \+\d+)(?: and (Rush|Evasive|Ward|Challenger \+\d+|Resist \+\d+))? this turn$/i)))
    return E({ kind: 'grant', target: 'own', grants: [m[1], m[2]].filter(Boolean) });
  if ((m = s.match(/^ready chosen character(?: of yours)?$/i))) return E({ kind: 'ready', target: 'own' });
  if ((m = s.match(/^each opponent chooses and discards a card$/i))) return E({ kind: 'oppDiscard' });
  if ((m = s.match(/^each opponent chooses and banishes one of their characters$/i))) return E({ kind: 'oppBanishOwn' });
  if ((m = s.match(/^each opponent chooses and exerts one of their ready characters$/i))) return E({ kind: 'oppExertOwn' });
  return null;
}

function parseEffects(text) {
  const sentences = stripReminder(text).split(/(?<=[.!])\s+/).map(x => x.trim()).filter(Boolean);
  if (!sentences.length) return null;
  const effects = sentences.map(parseSentence);
  if (effects.some(e => !e)) return null;
  if (effects.filter(e => e.target).length > 1) return null; // une seule cible par carte, pour rester simple
  return effects;
}

const cache = new Map();

/** Transforme une ligne de la base (ou de /api/cards) en carte de jeu. */
export function parseCard(row) {
  if (cache.has(row.id)) return cache.get(row.id);
  const types = Array.isArray(row.types) ? row.types : JSON.parse(row.types || '[]');
  const kwList = (Array.isArray(row.keywords) ? row.keywords : (row.keywords || '').split(',')).map(k => k.trim().toLowerCase()).filter(Boolean);
  // Le moteur lit le texte anglais ; les symboles LorcanaJSON sont ramenés à la notation {I} {S} {L} {W} {E}
  const SYM = { '⬡': '{I}', '¤': '{S}', '◊': '{L}', '⛉': '{W}', '⟳': '{E}', '’': "'", '‘': "'", '“': '"', '”': '"' };
  const lines = (row.text_en ?? row.text ?? '').replace(/[⬡¤◊⛉⟳’‘“”]/g, ch => SYM[ch]).split('\n').map(l => l.trim()).filter(Boolean);
  const kw = {};
  for (const k of ['evasive', 'rush', 'ward', 'bodyguard', 'reckless', 'support', 'vanish', 'alert']) if (kwList.includes(k)) kw[k] = true;
  const abilities = []; // capacités actives (traduites)
  let ignored = 0;
  for (const line of lines) {
    let m;
    if ((m = line.match(/^Shift (\d+)/))) { kw.shift = +m[1]; continue; }
    if ((m = line.match(/^Challenger \+(\d+)/))) { kw.challenger = +m[1]; continue; }
    if ((m = line.match(/^Resist \+(\d+)/))) { kw.resist = +m[1]; continue; }
    if ((m = line.match(/^Singer (\d+)/))) { kw.singer = +m[1]; continue; }
    if ((m = line.match(/^Sing Together (\d+)/))) { kw.singTogether = +m[1]; continue; }
    if (/^(Evasive|Rush|Ward|Bodyguard|Reckless|Support|Vanish|Alert|Boost|Shift)\b/.test(line) && line.length < 220 && !/When|Whenever/.test(line.split('(')[0])) continue;
    if ((m = line.match(/When you play this character, (.+)$/))) {
      const fx = parseEffects(m[1]);
      if (fx) { abilities.push({ trigger: 'play', effects: fx, label: line.split(' When ')[0] }); continue; }
    }
    if ((m = line.match(/Whenever this character quests, (.+)$/))) {
      const fx = parseEffects(m[1]);
      if (fx) { abilities.push({ trigger: 'quest', effects: fx, label: line.split(' Whenever ')[0] }); continue; }
    }
    if (types[0] !== 'Character') continue;
    ignored++;
  }
  const kind = (types[0] || '').toLowerCase();
  const isSong = types.includes('Song');
  let effects = null;
  if (kind === 'action') {
    const body = lines.filter(l => !/^Sing Together/.test(l)).join(' ');
    effects = parseEffects(body);
  }
  const card = {
    id: row.id, name: row.name, version: row.version, fullName: row.full_name || (row.version ? `${row.name} - ${row.version}` : row.name),
    kind, types, isSong, ink: row.ink, inks: Array.isArray(row.inks) ? row.inks : JSON.parse(row.inks || '[]'),
    cost: row.cost ?? 0, inkable: !!row.inkwell, str: row.strength ?? 0, wil: row.willpower ?? 0, lore: row.lore ?? 0,
    rarity: row.rarity, text: row.text, set: row.set_code, number: row.collector_number,
    kw, abilities, effects, ignoredAbilities: ignored,
  };
  card.battleLegal = kind === 'character' || (kind === 'action' && !!effects);
  cache.set(row.id, card);
  return card;
}

// ---------------------------------------------------------------- Utilitaires

const shuffle = (a, rnd = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const other = i => 1 - i;
export const inkAvailable = P => P.inkwell.length - P.inkUsed;
const kwOf = (inst, k) => inst.card.kw[k] || inst.tmp[k] || 0;
const numKw = (inst, k) => (inst.card.kw[k] || 0) + (inst.tmp[k] || 0);
export const strOf = inst => Math.max(0, inst.card.str + (inst.tmp.str || 0));
export const loreOf = inst => Math.max(0, inst.card.lore + (inst.tmp.lore || 0));
export const wilOf = inst => inst.card.wil;
const all = s => [...s.players[0].play, ...s.players[1].play];
export const findInst = (s, uid) => {
  for (const P of s.players) for (const z of ['hand', 'play', 'deck', 'discard', 'inkwell']) {
    const x = P[z].find(i => i.uid === uid); if (x) return { inst: x, P, zone: z };
  }
  return null;
};
const log = (s, p, text) => { s.log.push({ p, text, turn: s.turnNumber }); };
const cardValue = c => c.kind === 'character' ? c.lore * 2.2 + c.str * 0.9 + c.wil * 0.7 + (c.kw.evasive ? 1.2 : 0) + (c.kw.ward ? 0.6 : 0) + c.abilities.length * 0.8 : c.cost * 0.8;
const instValue = i => cardValue(i.card) + loreOf(i);

// ---------------------------------------------------------------- Création de partie

/**
 * @param decks [cardRows0, cardRows1] listes de lignes de cartes (30 chacune)
 * @param opts { names, ai: [bool,bool], first, rnd }
 */
export function newGame(decks, opts = {}) {
  const rnd = opts.rnd || Math.random;
  const s = { players: [], active: 0, turnNumber: 1, over: false, winner: null, reason: null, log: [], nextUid: 1, ai: opts.ai || [false, true] };
  decks.forEach((rows, p) => {
    const deck = shuffle(rows.map(r => mkInst(s, parseCard(r), p)), rnd);
    s.players.push({ name: opts.names?.[p] || `Joueur ${p + 1}`, deck, hand: [], play: [], inkwell: [], discard: [], lore: 0, inkUsed: 0, inked: false });
  });
  for (const P of s.players) for (let i = 0; i < RULES.HAND_START; i++) P.hand.push(P.deck.pop());
  s.active = opts.first ?? (rnd() < 0.5 ? 0 : 1);
  log(s, s.active, `${s.players[s.active].name} commence.`);
  startTurn(s, true);
  return s;
}

function mkInst(s, card, owner) {
  return { uid: s.nextUid++, card, owner, exerted: false, fresh: false, damage: 0, tmp: {}, under: [] };
}

function startTurn(s, first = false) {
  const P = s.players[s.active];
  P.inkUsed = 0; P.inked = false;
  for (const i of P.play) { i.exerted = false; i.fresh = false; }
  if (!first) draw(s, s.active, 1);
}

function draw(s, p, n) {
  const P = s.players[p];
  for (let k = 0; k < n; k++) {
    if (!P.deck.length) return lose(s, p, `${P.name} n'a plus de cartes à piocher.`);
    P.hand.push(P.deck.pop());
  }
}

function lose(s, p, reason) {
  if (s.over) return;
  s.over = true; s.winner = other(p); s.reason = reason; log(s, p, reason);
}

function gainLore(s, p, n) {
  const P = s.players[p];
  P.lore += n;
  if (P.lore >= RULES.LORE_TO_WIN && !s.over) { s.over = true; s.winner = p; s.reason = `${P.name} atteint ${RULES.LORE_TO_WIN} lore !`; log(s, p, s.reason); }
}

function banish(s, inst, why = 'est banni') {
  const P = s.players[inst.owner];
  const idx = P.play.indexOf(inst);
  if (idx < 0) return;
  P.play.splice(idx, 1);
  P.discard.push(...inst.under, resetInst(inst));
  inst.under = [];
  log(s, inst.owner, `${inst.card.fullName} ${why}.`);
}

function resetInst(i) { i.exerted = false; i.fresh = false; i.damage = 0; i.tmp = {}; return i; }

function dealDamage(s, inst, n) {
  const dmg = Math.max(0, n - numKw(inst, 'resist'));
  inst.damage += dmg;
  if (inst.damage >= wilOf(inst)) banish(s, inst);
  return dmg;
}

// ---------------------------------------------------------------- Effets

function targetsFor(s, p, eff) {
  if (!eff?.target) return [];
  let pool = eff.target === 'opp' ? s.players[other(p)].play : eff.target === 'own' ? s.players[p].play : all(s);
  return pool.filter(i => {
    if (i.owner !== p && kwOf(i, 'ward')) return false;
    const f = eff.filter || {};
    if (f.damaged && !i.damage) return false;
    if (f.maxStr != null && strOf(i) > f.maxStr) return false;
    if (f.maxCost != null && i.card.cost > f.maxCost) return false;
    return true;
  }).map(i => i.uid);
}

const targetedEffect = effects => (effects || []).find(e => e.target);

function applyEffects(s, p, effects, targetUid, sourceName) {
  const opp = other(p);
  for (const e of effects) {
    if (s.over) return;
    let t = null;
    if (e.target) {
      const valid = targetsFor(s, p, e);
      if (targetUid != null && valid.includes(targetUid)) t = findInst(s, targetUid).inst;
      else if (!e.optional && valid.length) t = findInst(s, aiPickTarget(s, p, e, valid)).inst;
      if (!t) continue;
    }
    switch (e.kind) {
      case 'damage': log(s, p, `${sourceName} inflige ${e.amount} dégât(s) à ${t.card.fullName}.`); dealDamage(s, t, e.amount); break;
      case 'damageAllOpp': log(s, p, `${sourceName} inflige ${e.amount} dégât(s) à chaque personnage adverse.`); [...s.players[opp].play].forEach(i => dealDamage(s, i, e.amount)); break;
      case 'draw': draw(s, p, e.amount); log(s, p, `${s.players[p].name} pioche ${e.amount} carte(s).`); break;
      case 'gainLore': log(s, p, `${s.players[p].name} gagne ${e.amount} lore.`); gainLore(s, p, e.amount); break;
      case 'oppLoseLore': s.players[opp].lore = Math.max(0, s.players[opp].lore - e.amount); log(s, p, `${s.players[opp].name} perd ${e.amount} lore.`); break;
      case 'banish': banish(s, t, `est banni par ${sourceName}`); break;
      case 'banishAll': for (const P of (e.oppOnly ? [s.players[opp]] : s.players)) [...P.play].forEach(i => banish(s, i)); break;
      case 'return': {
        const P = s.players[t.owner]; P.play.splice(P.play.indexOf(t), 1); P.discard.push(...t.under); t.under = [];
        P.hand.push(resetInst(t)); log(s, p, `${t.card.fullName} retourne dans la main de ${P.name}.`); break;
      }
      case 'exert': t.exerted = true; log(s, p, `${t.card.fullName} est épuisé.`); break;
      case 'heal': t.damage = Math.max(0, t.damage - e.amount); log(s, p, `${t.card.fullName} est soigné.`); break;
      case 'healAll': s.players[p].play.forEach(i => { i.damage = Math.max(0, i.damage - e.amount); }); log(s, p, `Les personnages de ${s.players[p].name} sont soignés.`); break;
      case 'buffStr': t.tmp.str = (t.tmp.str || 0) + e.amount; log(s, p, `${t.card.fullName} : ${e.amount > 0 ? '+' : ''}${e.amount} force ce tour.`); break;
      case 'buffLore': t.tmp.lore = (t.tmp.lore || 0) + e.amount; log(s, p, `${t.card.fullName} : +${e.amount} lore ce tour.`); break;
      case 'grant': for (const g of e.grants) {
        const m = g.match(/^(\w+)(?: \+(\d+))?$/); const k = m[1].toLowerCase();
        t.tmp[k] = m[2] ? (t.tmp[k] || 0) + +m[2] : true;
      } log(s, p, `${t.card.fullName} gagne ${e.grants.join(' et ')} ce tour.`); break;
      case 'ready': t.exerted = false; log(s, p, `${t.card.fullName} est redressé.`); break;
      case 'oppDiscard': {
        const H = s.players[opp].hand; if (!H.length) break;
        H.sort((a, b) => cardValue(a.card) - cardValue(b.card));
        const d = H.shift(); s.players[opp].discard.push(d); log(s, p, `${s.players[opp].name} défausse ${d.card.fullName}.`); break;
      }
      case 'oppBanishOwn': {
        const pl = [...s.players[opp].play].sort((a, b) => instValue(a) - instValue(b));
        if (pl[0]) banish(s, pl[0]); break;
      }
      case 'oppExertOwn': {
        const pl = s.players[opp].play.filter(i => !i.exerted).sort((a, b) => instValue(a) - instValue(b));
        if (pl[0]) { pl[0].exerted = true; log(s, p, `${pl[0].card.fullName} est épuisé.`); } break;
      }
    }
    // Vanish : banni quand un adversaire le choisit pour une action
    if (t && t.owner !== p && kwOf(t, 'vanish') && s.players[t.owner].play.includes(t)) banish(s, t, 'disparaît (Vanish)');
  }
}

// ---------------------------------------------------------------- Règles : que peut-on faire ?

const isMyTurn = (s, p) => !s.over && s.active === p;

export function canInk(s, p, uid) {
  const P = s.players[p]; const i = P.hand.find(x => x.uid === uid);
  return isMyTurn(s, p) && !P.inked && !!i && i.card.inkable;
}

export function canQuest(s, p, uid) {
  const i = s.players[p].play.find(x => x.uid === uid);
  return isMyTurn(s, p) && !!i && !i.exerted && !i.fresh && !kwOf(i, 'reckless');
}

function canAttack(s, p, i) {
  return isMyTurn(s, p) && i.owner === p && !i.exerted && (!i.fresh || kwOf(i, 'rush'));
}

function rawChallengeable(att, def) {
  return def.exerted && (!kwOf(def, 'evasive') || kwOf(att, 'evasive') || kwOf(att, 'alert'));
}

export function challengeTargets(s, p, uid) {
  const att = s.players[p].play.find(x => x.uid === uid);
  if (!att || !canAttack(s, p, att)) return [];
  const opp = s.players[other(p)].play.filter(d => rawChallengeable(att, d));
  const guards = opp.filter(d => kwOf(d, 'bodyguard'));
  return (guards.length ? guards : opp).map(d => d.uid);
}

/** Toutes les façons de jouer une carte de la main. */
export function playOptions(s, p, uid) {
  const P = s.players[p]; const i = P.hand.find(x => x.uid === uid);
  if (!i || !isMyTurn(s, p) || !i.card.battleLegal) return [];
  const c = i.card, ink = inkAvailable(P), out = [];
  if (c.cost <= ink) out.push({ mode: 'normal', cost: c.cost });
  if (c.kind === 'character' && c.kw.shift != null && c.kw.shift <= ink)
    for (const base of P.play.filter(b => b.card.name === c.name))
      out.push({ mode: 'shift', cost: c.kw.shift, shiftOnto: base.uid });
  if (c.isSong) {
    const need = c.cost;
    for (const sg of P.play.filter(x => !x.exerted && !x.fresh && Math.max(x.card.cost, x.card.kw.singer || 0) >= need))
      out.push({ mode: 'sing', cost: 0, singer: sg.uid });
  }
  return out;
}

/** Effet nécessitant une cible quand on joue / quête avec cette carte. */
export function pendingTargetEffect(card, trigger) {
  if (trigger === 'play' && card.kind === 'action') return targetedEffect(card.effects);
  const ab = card.abilities.find(a => a.trigger === trigger && targetedEffect(a.effects));
  return ab ? targetedEffect(ab.effects) : null;
}

export function effectTargets(s, p, eff) { return targetsFor(s, p, eff); }

// ---------------------------------------------------------------- Actions

/**
 * Applique une action. a = {type:'ink'|'play'|'quest'|'challenge'|'end', uid, target, mode, shiftOnto, singer}
 * Renvoie {ok, error?}
 */
export function applyAction(s, a) {
  if (s.over) return { ok: false, error: 'Partie terminée' };
  const p = s.active, P = s.players[p];
  switch (a.type) {
    case 'ink': {
      if (!canInk(s, p, a.uid)) return { ok: false, error: 'Impossible de mettre cette carte dans l\'encrier' };
      const i = P.hand.find(x => x.uid === a.uid);
      P.hand.splice(P.hand.indexOf(i), 1); P.inkwell.push(i); P.inked = true;
      log(s, p, `${P.name} ajoute une carte à son encrier.`);
      return { ok: true };
    }
    case 'play': {
      const opt = playOptions(s, p, a.uid).find(o => o.mode === (a.mode || 'normal') && (o.shiftOnto == null || o.shiftOnto === a.shiftOnto) && (o.singer == null || o.singer === a.singer));
      if (!opt) return { ok: false, error: 'Impossible de jouer cette carte' };
      const i = P.hand.find(x => x.uid === a.uid), c = i.card;
      P.hand.splice(P.hand.indexOf(i), 1);
      P.inkUsed += opt.cost;
      if (opt.mode === 'sing') {
        const sg = P.play.find(x => x.uid === opt.singer); sg.exerted = true;
        log(s, p, `${sg.card.fullName} chante ${c.fullName}.`);
      }
      if (c.kind === 'action') {
        if (opt.mode !== 'sing') log(s, p, `${P.name} joue ${c.fullName}.`);
        applyEffects(s, p, c.effects, a.target, c.name);
        P.discard.push(i);
        return { ok: true };
      }
      // personnage
      if (opt.mode === 'shift') {
        const base = P.play.find(x => x.uid === opt.shiftOnto);
        P.play[P.play.indexOf(base)] = i;
        i.under = [...base.under, resetInst({ ...base, under: [] })];
        i.damage = base.damage; i.exerted = base.exerted; i.fresh = base.fresh;
        log(s, p, `${P.name} joue ${c.fullName} par Shift sur ${base.card.fullName}.`);
      } else {
        i.fresh = true; i.exerted = false; i.damage = 0;
        P.play.push(i);
        log(s, p, `${P.name} joue ${c.fullName}.`);
      }
      for (const ab of c.abilities.filter(x => x.trigger === 'play')) applyEffects(s, p, ab.effects, a.target, c.name);
      return { ok: true };
    }
    case 'quest': {
      if (!canQuest(s, p, a.uid)) return { ok: false, error: 'Ce personnage ne peut pas quêter' };
      const i = P.play.find(x => x.uid === a.uid);
      i.exerted = true;
      const l = loreOf(i);
      log(s, p, `${i.card.fullName} part en quête : +${l} lore.`);
      if (kwOf(i, 'support')) {
        const mate = P.play.filter(x => x !== i && !x.exerted).sort((x, y) => strOf(y) - strOf(x))[0];
        if (mate && strOf(i) > 0) { mate.tmp.str = (mate.tmp.str || 0) + strOf(i); log(s, p, `Soutien : ${mate.card.fullName} gagne +${strOf(i)} force.`); }
      }
      gainLore(s, p, l);
      for (const ab of i.card.abilities.filter(x => x.trigger === 'quest')) applyEffects(s, p, ab.effects, a.target, i.card.name);
      return { ok: true };
    }
    case 'challenge': {
      if (!challengeTargets(s, p, a.uid).includes(a.target)) return { ok: false, error: 'Défi impossible' };
      const att = P.play.find(x => x.uid === a.uid), def = findInst(s, a.target).inst;
      att.exerted = true;
      const dmgToDef = strOf(att) + numKw(att, 'challenger'), dmgToAtt = strOf(def);
      log(s, p, `${att.card.fullName} défie ${def.card.fullName} (${dmgToDef} contre ${dmgToAtt}).`);
      dealDamage(s, def, dmgToDef);
      dealDamage(s, att, dmgToAtt);
      return { ok: true };
    }
    case 'end': {
      for (const Q of s.players) for (const i of Q.play) i.tmp = {};
      log(s, p, `${P.name} termine son tour.`);
      s.active = other(p); s.turnNumber++;
      startTurn(s);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Action inconnue' };
}

// ---------------------------------------------------------------- IA

function aiPickTarget(s, p, eff, valid) {
  const insts = valid.map(u => findInst(s, u).inst);
  const mine = i => i.owner === p;
  const score = i => {
    switch (eff.kind) {
      case 'damage': if (mine(i)) return -100; return (wilOf(i) - i.damage <= eff.amount ? 10 + instValue(i) : instValue(i) * 0.3);
      case 'banish': case 'return': return mine(i) ? -100 : instValue(i) + i.card.cost;
      case 'exert': return mine(i) ? -100 : (i.exerted ? -5 : strOf(i) + loreOf(i));
      case 'heal': return mine(i) ? i.damage * 2 + instValue(i) * 0.1 : -100;
      case 'buffStr': return (eff.amount > 0) === mine(i) ? strOf(i) + (i.exerted ? -3 : 0) : -100;
      case 'buffLore': return mine(i) && !i.exerted && !i.fresh ? 5 : -1;
      case 'grant': return mine(i) ? (i.exerted ? 0 : 3) + strOf(i) : -100;
      case 'ready': return mine(i) ? (i.exerted ? loreOf(i) * 3 : -2) : -100;
      default: return 0;
    }
  };
  insts.sort((a, b) => score(b) - score(a));
  return insts[0]?.uid;
}

function effectsValue(s, p, effects) {
  let v = 0;
  for (const e of effects || []) {
    const valid = targetsFor(s, p, e);
    const best = valid.length ? findInst(s, aiPickTarget(s, p, e, valid)).inst : null;
    const isOpp = best && best.owner !== p;
    switch (e.kind) {
      case 'damage': if (isOpp) v += wilOf(best) - best.damage <= e.amount ? 4 + instValue(best) : 1; break;
      case 'damageAllOpp': v += s.players[other(p)].play.reduce((n, i) => n + (wilOf(i) - i.damage <= e.amount ? 3 + instValue(i) : 0.5), 0); break;
      case 'draw': v += e.amount * 2; break;
      case 'gainLore': v += e.amount * 2.5; break;
      case 'oppLoseLore': v += Math.min(e.amount, s.players[other(p)].lore) * 2.5; break;
      case 'banish': case 'return': if (isOpp) v += 3 + instValue(best); break;
      case 'banishAll': {
        const me = s.players[p].play.reduce((n, i) => n + instValue(i), 0), them = s.players[other(p)].play.reduce((n, i) => n + instValue(i), 0);
        v += e.oppOnly ? them : them - me; break;
      }
      case 'exert': if (isOpp && !best.exerted) v += 2; break;
      case 'heal': if (best && best.owner === p) v += Math.min(best.damage, e.amount); break;
      case 'healAll': v += 0.5; break;
      case 'oppDiscard': v += s.players[other(p)].hand.length ? 2 : 0; break;
      case 'oppBanishOwn': v += s.players[other(p)].play.length ? 4 : 0; break;
      case 'oppExertOwn': v += 1; break;
      default: v += 0.3;
    }
  }
  return v;
}

/** Choisit la prochaine action de l'IA. difficulty : 'easy' | 'normal' */
export function aiNextAction(s, difficulty = 'normal') {
  const p = s.active, P = s.players[p], O = s.players[other(p)];
  const easy = difficulty === 'easy';
  const rnd = Math.random;

  // 1. Encrier
  if (!P.inked) {
    const inkables = P.hand.filter(i => i.card.inkable);
    if (inkables.length && (P.inkwell.length < 7 || P.hand.length > 4)) {
      const ink = P.inkwell.length;
      const pick = (easy ? shuffle([...inkables]) : inkables.sort((a, b) => {
        // On encre d'abord les cartes injouables avant longtemps, puis les moins utiles
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
    if (c.kind === 'character') {
      v = cardValue(c) + c.cost * 1.2 + (o.mode === 'shift' ? 3 : 0);
      for (const ab of c.abilities.filter(a => a.trigger === 'play')) v += effectsValue(s, p, ab.effects);
    } else {
      v = effectsValue(s, p, c.effects) * 1.3;
      if (o.mode === 'sing') { const sg = P.play.find(x => x.uid === o.singer); v -= loreOf(sg) * 1.5; v += c.cost * 0.8; }
    }
    if (v > 1.5) plays.push({ v: v + (easy ? rnd() * 6 : 0), a: { type: 'play', uid: i.uid, ...o, target: undefined } });
  }
  plays.sort((x, y) => y.v - x.v);
  if (plays.length) {
    const a = plays[0].a;
    const c = P.hand.find(x => x.uid === a.uid).card;
    const eff = pendingTargetEffect(c, 'play');
    if (eff) { const valid = targetsFor(s, p, eff); if (valid.length) a.target = aiPickTarget(s, p, eff, valid); }
    return a;
  }

  // 3. Défis
  const potentialLore = P.play.filter(i => canQuest(s, p, i.uid)).reduce((n, i) => n + loreOf(i), 0);
  const racing = P.lore + potentialLore >= RULES.LORE_TO_WIN;
  if (!racing && !(easy && rnd() < 0.5)) {
    let best = null;
    for (const att of P.play) for (const tu of challengeTargets(s, p, att.uid)) {
      const def = findInst(s, tu).inst;
      const toDef = strOf(att) + numKw(att, 'challenger') - numKw(def, 'resist');
      const toAtt = strOf(def) - numKw(att, 'resist');
      const kills = def.damage + toDef >= wilOf(def), dies = att.damage + toAtt >= wilOf(att);
      let v = (kills ? 3 + instValue(def) + loreOf(def) * 1.5 : toDef * 0.3) - (dies ? 2 + instValue(att) : toAtt * 0.2);
      if (canQuest(s, p, att.uid)) v -= loreOf(att) * 1.4;
      if (kwOf(att, 'reckless')) v += 3;
      if (!best || v > best.v) best = { v, a: { type: 'challenge', uid: att.uid, target: tu } };
    }
    if (best && best.v > 0.5) return best.a;
  }

  // 4. Quêtes
  const q = P.play.filter(i => canQuest(s, p, i.uid)).sort((a, b) => loreOf(b) - loreOf(a))[0];
  if (q) {
    const a = { type: 'quest', uid: q.uid };
    const eff = pendingTargetEffect(q.card, 'quest');
    if (eff) { const valid = targetsFor(s, p, eff); if (valid.length) a.target = aiPickTarget(s, p, eff, valid); }
    return a;
  }
  return { type: 'end' };
}

// ---------------------------------------------------------------- Construction de decks

/** Vérifie un deck (liste de lignes de cartes). Renvoie la liste des problèmes. */
export function validateDeck(rows) {
  const errs = [];
  const cards = rows.map(parseCard);
  if (cards.length !== RULES.DECK_SIZE) errs.push(`Le deck doit contenir exactement ${RULES.DECK_SIZE} cartes (${cards.length} actuellement).`);
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
export function buildDeck(pool, inks, { rnd = Math.random, available = null } = {}) {
  const ok = pool.map(parseCard).filter(c => c.battleLegal && c.inks.length <= 1 && inks.includes(c.ink));
  // un seul exemplaire de chaque nom complet (préférer la version la moins rare)
  const byName = new Map();
  for (const c of ok) if (!byName.has(c.fullName)) byName.set(c.fullName, c);
  const candidates = [...byName.values()];
  const curve = { 1: 3, 2: 6, 3: 6, 4: 5, 5: 4, 6: 3, 7: 3 };
  const deck = [];
  const copies = c => Math.min(RULES.MAX_COPIES, available ? (available[c.fullName] || 0) : RULES.MAX_COPIES);
  const add = c => { const n = Math.min(copies(c) - deck.filter(x => x.fullName === c.fullName).length, RULES.DECK_SIZE - deck.length); for (let k = 0; k < n; k++) deck.push(c); };
  const score = c => cardValue(c) / Math.max(1, c.cost) + (c.kind === 'character' ? 1 : 0) + (c.inkable ? 0.6 : 0) + rnd() * 1.5;
  for (const [cost, want] of Object.entries(curve)) {
    const bucket = candidates.filter(c => (+cost === 7 ? c.cost >= 7 : c.cost === +cost)).sort((a, b) => score(b) - score(a));
    const start = deck.length;
    for (const c of bucket) { if (deck.length - start >= want) break; add(c); }
  }
  // compléter si besoin
  const rest = candidates.sort((a, b) => score(b) - score(a));
  for (const c of rest) { if (deck.length >= RULES.DECK_SIZE) break; add(c); }
  return deck.slice(0, RULES.DECK_SIZE).map(c => c.id);
}
