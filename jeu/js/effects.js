// Traduction du texte (anglais) des cartes en capacités utilisables par le moteur de combat.
// Grammaire : [déclencheur / condition], [coût] - phrases d'effet « verbe + cible » enchaînées.
// Une capacité dont une phrase n'est pas comprise est ignorée en entier (jamais d'effet à moitié appliqué).

const SYM = { '⬡': '{I}', '¤': '{S}', '◊': '{L}', '⛉': '{W}', '⟳': '{E}', '’': "'", '‘': "'", '“': '"', '”': '"', '—': '-', '–': '-' };
export const normalize = t => (t || '').replace(/[⬡¤◊⛉⟳’‘“”—–]/g, ch => SYM[ch]);
const num = s => (s == null ? 1 : /^(a|an|one)$/i.test(s) ? 1 : s === 'two' ? 2 : s === 'three' ? 3 : Number(s));
const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
const KW = ['Evasive', 'Rush', 'Ward', 'Bodyguard', 'Reckless', 'Support', 'Vanish', 'Alert', 'Resist', 'Challenger', 'Singer'];
const KW_RE = String.raw`(?:Evasive|Rush|Ward|Bodyguard|Reckless|Support|Vanish|Alert|Resist \+\d+|Challenger \+\d+|Singer \d+)`;
const kwObj = s => { const m = s.match(/^(\w+)(?: \+?(\d+))?$/); return { kw: m[1].toLowerCase(), v: m[2] ? +m[2] : true }; };
const STAT = { S: 'str', W: 'wil', L: 'lore' };

// ------------------------------------------------------------------ Cibles
const CLS = String.raw`(?:[A-Z][\w'-]*(?: [A-Z][\w'-]*)*(?:,? (?:and |or )?[A-Z][\w'-]*(?: [A-Z][\w'-]*)*)* )`;
const FILT = String.raw`(?: with (?:cost \d+ or (?:less|more)|\d+ \{[SWL]\} or (?:less|more)|a cost of \d+ or (?:less|more)|Evasive|Bodyguard|Reckless|damage|no damage))?(?: named [A-Z][^.,]*?)?(?: here)?(?: each)?`;
const NOUN = String.raw`(?:characters?, items?,? (?:or|and/or) locations?|characters? (?:or|and/or) locations?|characters? or items?|items? or locations?|locations? or items?|characters?|items?|locations?)`;
const TGT = String.raw`(?:this (?:character|item|location)|them|they|he|she|it|him|her|that character|the chosen character|the challenging character|the challenged character|(?:up to \d+ |any number of )?(?:another |other )?chosen (?:opposing )?(?:damaged |exerted |ready )?(?:opposing )?${CLS}?${NOUN}(?: of yours)?${FILT}|(?:each|all) (?:other )?(?:opposing )?(?:damaged |exerted |ready )?${CLS}?characters?${FILT}|(?:all |each of )?your (?:other )?(?:exerted |damaged |ready )?${CLS}?characters${FILT}|one of your (?:other )?(?:${CLS})?(?:characters|items|locations)|an opposing (?:damaged )?character|another (?:chosen )?character)`;
const splitCls = s => s.split(/,? (?:and |or )|, /).map(x => x.trim()).filter(Boolean);

function target(s) {
  s = s.trim();
  if (/^this (character|item|location)$/.test(s)) return { sel: 'self' };
  if (/^(them|they|he|she|it|him|her|that character|the chosen character)$/.test(s)) return { sel: 'it' };
  if (s === 'the challenging character') return { sel: 'challenger' };
  if (s === 'the challenged character') return { sel: 'challenged' };
  const t = { sel: 'chosen', side: 'any', types: ['character'], f: {} };
  let m;
  if ((m = s.match(/^up to (\d+) /))) { t.upTo = +m[1]; s = s.slice(m[0].length); }
  if (s.startsWith('any number of ')) { t.upTo = 99; s = s.slice(14); }
  if (/^(all |each of )?your /.test(s)) { t.sel = 'each'; t.side = 'own'; s = s.replace(/^(all |each of )?your /, ''); }
  if (/^(each|all) /.test(s)) { t.sel = 'each'; s = s.replace(/^(each|all) /, ''); }
  if ((m = s.match(/^one of your (other )?/))) { t.side = 'own'; if (m[1]) t.f.other = true; s = s.slice(m[0].length); }
  if (s.startsWith('an opposing ')) { t.side = 'opp'; s = s.slice(12); }
  if (/^another (chosen )?character$/.test(s)) { t.f.other = true; return t; }
  if (/^(another|other) /.test(s)) { t.f.other = true; s = s.replace(/^(another|other) /, ''); }
  s = s.replace(/^chosen /, '');
  if (s.startsWith('opposing ')) { t.side = 'opp'; s = s.slice(9); }
  if ((m = s.match(/^(damaged|exerted|ready) /))) { t.f[m[1]] = true; s = s.slice(m[0].length); }
  if (s.startsWith('opposing ')) { t.side = 'opp'; s = s.slice(9); }
  if (s.startsWith('other ')) { t.f.other = true; s = s.slice(6); }
  if ((m = s.match(/^((?:[A-Z][\w'-]*(?: [A-Z][\w'-]*)*)(?:,? (?:and |or )?[A-Z][\w'-]*(?: [A-Z][\w'-]*)*)*) (?=character)/))) {
    t.f.cls = splitCls(m[1]); s = s.slice(m[0].length);
  }
  if ((m = s.match(new RegExp(`^${NOUN}`)))) {
    const n = m[0];
    t.types = ['character', 'item', 'location'].filter(x => n.includes(x));
    s = s.slice(n.length);
  } else return null;
  if (s.startsWith(' of yours')) { t.side = 'own'; s = s.slice(9); }
  if ((m = s.match(/^ with (?:a )?cost (?:of )?(\d+) or (less|more)/))) { t.f[m[2] === 'less' ? 'maxCost' : 'minCost'] = +m[1]; s = s.slice(m[0].length); }
  if ((m = s.match(/^ with (\d+) \{([SWL])\} or (less|more)/))) { t.f[`${m[3] === 'less' ? 'max' : 'min'}${STAT[m[2]]}`] = +m[1]; s = s.slice(m[0].length); }
  if ((m = s.match(/^ with (Evasive|Bodyguard|Reckless)/))) { t.f.kw = m[1].toLowerCase(); s = s.slice(m[0].length); }
  if (s.startsWith(' with no damage')) { t.f.undamaged = true; s = s.slice(15); }
  if (s.startsWith(' with damage')) { t.f.damaged = true; s = s.slice(12); }
  if (s.endsWith(' each')) s = s.slice(0, -5);
  if (s.endsWith(' here')) { t.f.here = true; s = s.slice(0, -5); }
  if ((m = s.match(/^ named (.+)$/))) { t.f.named = m[1].trim(); s = ''; }
  return s.trim() ? null : t;
}

// ------------------------------------------------------------------ Durées
const DUR = String.raw`(?: (this turn|for the rest of this turn|until the start of your next turn|during their next turn|during its next turn|until the end of (?:the|this) turn))?`;
const dur = s => (!s ? null : /until the start of your next turn/.test(s) ? 'untilYourNext' : /during (their|its) next turn/.test(s) ? 'theirNext' : 'turn');

// ------------------------------------------------------------------ Phrases d'effet
const T = `(${TGT})`;
const TYPEWORD = String.raw`((?:[A-Z][\w'-]* (?:or [A-Z][\w'-]* )?)?(?:character|action|item|song|location))`;
// Filtres d'une carte de la défausse : « with cost 3 or less », « that isn't a song card », « named X »…
function cardFilter(str) {
  const f = {};
  let r = (str || '').trim(), m;
  while (r) {
    if ((m = r.match(/^with (?:a )?cost (?:of )?(\d+) or less/))) f.maxCost = +m[1];
    else if ((m = r.match(/^with (\d+) \{([SW])\} or more/))) f[m[2] === 'S' ? 'minStr' : 'minWil'] = +m[1];
    else if ((m = r.match(/^with (Support|Singer|Bodyguard|Evasive|Rush|Ward|Reckless|Shift)/))) f.kw = m[1].toLowerCase();
    else if ((m = r.match(/^that isn't a song card/))) f.notSong = true;
    else if ((m = r.match(/^named (.+)$/))) { f.named = m[1].trim(); m[0] = r; }
    else return null;
    r = r.slice(m[0].length).trim();
  }
  return f;
}
const perOf = (str, x = 1) => { const per = parseCounter(str); return per ? { per, x } : null; };

const RULES = [
  // payer de l'encre pendant un effet (« you may pay 2 {I} to … »)
  ['pay (\\d+) \\{I\\}', m => ({ k: 'payInk', n: +m[1] })],
  // dégâts « pour chaque », compteurs de dégâts (sans Résistance)
  [`deal (\\d+) damage each to ${T}`, m => ({ k: 'damage', n: +m[1], t: target(m[2]) })],
  [`put (a|\\d+) damage counters? on ${T}`, m => ({ k: 'damage', n: num(m[1]), t: target(m[2]), noResist: true })],
  [`deal damage to ${T} equal to the number of (.+)`, m => { const n = perOf(m[2]); return n && { k: 'damage', n, t: target(m[1]) }; }],
  ['(?:you )?gain lore equal to the number of (.+)', m => { const n = perOf(m[1]); return n && { k: 'lore', n }; }],
  ['(?:you )?gain (\\d+) lore for each (.+)', m => { const n = perOf(m[2], +m[1]); return n && { k: 'lore', n }; }],
  ['draw (a|\\d+) cards? for each (.+)', m => { const n = perOf(m[2], num(m[1])); return n && { k: 'draw', n }; }],
  // défausse ciblée : « chosen opponent reveals their hand and discards a non-character card of your choice »
  ['(?:chosen|each) opponent reveals (?:their|his|her) hand(?: and discards (?:a|an) (non-character|song|action|item|character|location) card of your choice)?', m => (m[1] ? { k: 'discard', n: 1, who: 'opp', filter: m[1], pick: true } : { k: 'noop' })],
  // cartes de la défausse, avec filtres
  [`return (a|an|another|up to \\d+) ${TYPEWORD} cards?((?: (?:with [^.]+?|that isn't a song card|named [^.]+?))*?)(?: each)? from your discard (?:to|into) your hand`, m => {
    const f = cardFilter(m[3]); return f && { k: 'recur', type: m[2], n: /\d/.test(m[1]) ? +m[1].match(/\d+/)[0] : 1, f };
  }],
  [`play (?:a|an) ${TYPEWORD}(?: card)?((?: with [^.]+?)?)( from your discard)? for free`, m => {
    const f = cardFilter(m[2]); return f && { k: 'playFree', type: m[1], max: f.maxCost ?? 99, f, fromDiscard: !!m[3] };
  }],
  // déplacements gratuits vers un lieu
  ['move (a character of yours|him|her|this character|them) to (?:a|one of your) locations? for free', m => ({ k: 'moveFree', n: 1, self: m[1] !== 'a character of yours' })],
  ['move (?:him|her) and one of your other characters to the same location for free', () => ({ k: 'moveFree', n: 2, self: true })],
  ['move up to (\\d+) (?:characters of yours|of your characters) to the same location for free', m => ({ k: 'moveFree', n: +m[1] })],
  ['move any number of your characters to the same location for free', () => ({ k: 'moveFree', n: 99 })],
  // carte révélée : la jouer gratuitement, ou prendre toutes celles d'un type
  [`if it's (?:a|an) ${TYPEWORD} card, (?:you may |they may )?play (?:it|that character|that card|them) for free(?: and (?:they|it|she|he) enters? play exerted)?`, m => ({ k: 'pickPlay', type: m[1], exerted: /exerted/.test(m[0]) })],
  [`reveal any number of ${TYPEWORD} cards(?: named [^.]+?)? and put them in(?:to)? your hand`, m => ({ k: 'pick', type: m[1], all: true })],
  [`put each ${TYPEWORD} card((?: with [^.]+?)?) into your hand`, m => { const f = cardFilter(m[2]); return f && { k: 'pick', type: m[1], all: true, f }; }],
  // meule
  ['put the top (card|\\d+ cards) of your deck into your discard', m => ({ k: 'mill', n: parseInt(m[1]) || 1 })],
  ['each opponent puts the top (card|\\d+ cards) of their deck into their discard', m => ({ k: 'mill', n: parseInt(m[1]) || 1, who: 'opp' })],
  [`${T} gains? (${KW_RE}) and gets? ([+-]\\d+) \\{([SWL])\\}${DUR}`, m => ({ k: 'mod', t: target(m[1]), mods: [[STAT[m[4]], +m[3]]], kws: [kwObj(m[2])], dur: dur(m[5]) || 'turn' })],
  [`give ${T} (${KW_RE})(?: and (${KW_RE}))?${DUR}`, m => ({ k: 'grant', t: target(m[1]), kws: [m[2], m[3]].filter(Boolean).map(kwObj), dur: dur(m[4]) || 'turn' })],
  ['have (?:each|chosen) opponent choose and discard (a|\\d+) cards?', m => ({ k: 'discard', n: num(m[1]), who: 'opp' })],
  ['you and another chosen player each draw (a|\\d+) cards?', m => ({ k: 'draw', n: num(m[1]), who: 'all' })],
  ['you and another chosen player each get (\\d+) ink drops?', m => ({ k: 'inkDrop', n: +m[1] })],
  ['(?:you may )?draw cards until you have the same number', () => ({ k: 'drawTo', match: 'opp' })],
  ['draw until you have (\\d+) cards in your hand', m => ({ k: 'drawTo', n: +m[1] })],
  ['opponents can\'t play (actions|items|actions or items) until the start of your next turn', m => ({ k: 'lockPlay', types: m[1].split(' or ').map(x => x.replace(/s$/, '')) })],
  ['banish (?:her|him|this character) or return another (?:(\\d+) )?chosen characters? of yours to your hand', m => ({ k: 'choose', options: [
    [{ k: 'banish', t: { sel: 'self' } }],
    [{ k: 'return', t: { sel: 'chosen', side: 'own', types: ['character'], f: { other: true }, upTo: m[1] ? +m[1] : 1 } }]] })],
  // dégâts, bannissement, renvoi
  [`deal (\\d+) damage to ${T}`, m => ({ k: 'damage', n: +m[1], t: target(m[2]) })],
  [`deal damage to ${T} equal to (?:their|its|this character's) \\{S\\}`, m => ({ k: 'damage', n: 'selfStr', t: target(m[1]) })],
  [`banish ${T}`, m => ({ k: 'banish', t: target(m[1]) })],
  [`return ${T} to (?:their|its|your|his|her) (?:player's |players' )?hands?`, m => ({ k: 'return', t: target(m[1]) })],
  [`return that card to your hand`, () => ({ k: 'recurIt' })],
  [`put ${T} into (?:their|its|your) (?:player's )?inkwell facedown(?: and exerted)?`, m => ({ k: 'toInk', t: target(m[1]) })],
  [`shuffle ${T} into (?:their|its) (?:player's )?deck`, m => ({ k: 'tuck', t: target(m[1]) })],
  [`put ${T} on the bottom of (?:their|its) (?:player's )?deck`, m => ({ k: 'tuck', t: target(m[1]) })],
  // épuiser / redresser
  [`exert ${T}`, m => ({ k: 'exert', t: target(m[1]) })],
  [`ready ${T}`, m => ({ k: 'ready', t: target(m[1]) })],
  // statistiques et mots-clés temporaires
  [`${T} gets? ([+-]\\d+) \\{([SWL])\\}(?: and ([+-]\\d+) \\{([SWL])\\})?${DUR}`, m => ({ k: 'mod', t: target(m[1]), mods: [[STAT[m[3]], +m[2]], ...(m[4] ? [[STAT[m[5]], +m[4]]] : [])], dur: dur(m[6]) || 'turn' })],
  [`${T} gets? ([+-]\\d+) \\{([SWL])\\} and gains? (${KW_RE})${DUR}`, m => ({ k: 'mod', t: target(m[1]), mods: [[STAT[m[3]], +m[2]]], kws: [kwObj(m[4])], dur: dur(m[5]) || 'turn' })],
  [`${T} gets? ([+-]\\d+) \\{([SWL])\\}${DUR} for each (.+)`, m => { const per = parseCounter(m[5]); return per && { k: 'mod', t: target(m[1]), mods: [[STAT[m[3]], +m[2]]], per, dur: dur(m[4]) || 'turn' }; }],
  [`give ${T} ([+-]\\d+) \\{([SWL])\\}${DUR}`, m => ({ k: 'mod', t: target(m[1]), mods: [[STAT[m[3]], +m[2]]], dur: dur(m[4]) || 'turn' })],
  [`${T} gains? (${KW_RE})(?: and (${KW_RE}))?${DUR}`, m => ({ k: 'grant', t: target(m[1]), kws: [m[2], m[3]].filter(Boolean).map(kwObj), dur: dur(m[4]) || 'turn' })],
  [`${T} (?:can't|cannot) (quest|challenge|ready|quest or challenge)${DUR}`, m => ({ k: 'restrict', t: target(m[1]), what: m[2], dur: dur(m[3]) || 'turn' })],
  [`${T} (?:can't|doesn't|don't) ready at the start of (?:their|its|his|her) next turn`, m => ({ k: 'restrict', t: target(m[1]), what: 'readyNext', dur: 'theirNext' })],
  [`${T} can challenge ready characters this turn`, m => ({ k: 'grant', t: target(m[1]), kws: [{ kw: 'challengeReady', v: true }], dur: 'turn' })],
  // soins
  [`remove (?:up to )?(\\d+) damage from ${T}`, m => ({ k: 'heal', n: +m[1], t: target(m[2]) })],
  [`remove all damage from ${T}`, m => ({ k: 'heal', n: 99, t: target(m[1]) })],
  [`move (?:up to )?(\\d+) damage counters? from ${T} to ${T}`, m => ({ k: 'moveDamage', n: +m[1], t: target(m[2]), t2: target(m[3]) })],
  // pioche, défausse, lore
  [`draw (a|\\d+) cards?, then choose and discard (a|\\d+) cards?`, m => ({ k: 'loot', n: num(m[1]), n2: num(m[2]) })],
  [`draw (a|\\d+) cards?`, m => ({ k: 'draw', n: num(m[1]) })],
  [`(each player|each opponent|that player|its player|their player|chosen opponent|chosen player)(?: may)? draws? (a|\\d+) cards?`, m => ({ k: 'draw', n: num(m[2]), who: /each player/.test(m[1]) ? 'all' : /opponent/.test(m[1]) ? 'opp' : 'targetOwner' })],
  [`each player draws (\\d+) cards and gains (\\d+) lore`, m => ({ k: 'draw', n: +m[1], who: 'all', lore: +m[2] })],
  [`(?:you )?choose and discard (a|\\d+) cards?`, m => ({ k: 'discard', n: num(m[1]), who: 'you' })],
  [`(each opponent|chosen opponent|each player|the challenging player)(?: may)? chooses? and discards? (a|\\d+) cards?`, m => ({ k: 'discard', n: num(m[2]), who: m[1] === 'each player' ? 'all' : 'opp' })],
  [`(?:you )?gain (\\d+) lore`, m => ({ k: 'lore', n: +m[1] })],
  [`(?:its|their|that) player gains (\\d+) lore`, m => ({ k: 'loreOwner', n: +m[1] })],
  [`(?:each|chosen) opponent loses (\\d+) lore`, m => ({ k: 'oppLore', n: +m[1] })],
  [`(?:you )?get (\\d+) ink drops?`, m => ({ k: 'inkDrop', n: +m[1] })],
  // encrier
  [`(?:you )?put the top (card|\\d+ cards) of your deck into your inkwell facedown(?: and exerted)?`, m => ({ k: 'ramp', n: m[1] === 'card' ? 1 : parseInt(m[1]) })],
  [`each player puts the top (card|\\d+ cards) of their deck into their inkwell facedown(?: and exerted)?`, m => ({ k: 'ramp', n: m[1] === 'card' ? 1 : parseInt(m[1]), who: 'all' })],
  [`put (?:a|any) card from your hand into your inkwell facedown(?: and exerted)?`, () => ({ k: 'inkFromHand' })],
  [`(?:you may )?ink an additional card`, () => ({ k: 'extraInk' })],
  // cartes de la défausse / du deck
  [`return (?:a|an|up to \\d+) ${TYPEWORD} cards?(?: named [^.]+?)? from your discard to your hand`, m => ({ k: 'recur', type: m[1] })],
  [`return this card to your hand`, () => ({ k: 'returnSelfCard' })],
  [`put this card into your inkwell facedown(?: and exerted)?`, () => ({ k: 'selfToInk' })],
  [`ready all cards in your inkwell`, () => ({ k: 'readyInk' })],
  [`(?:your characters|characters) can't be challenged${DUR}`, m => ({ k: 'grant', t: { sel: 'each', side: 'own', types: ['character'], f: {} }, kws: [{ kw: 'unchallengeable', v: true }], dur: dur(m[1]) || 'untilYourNext' })],
  [`look at the top (card|\\d+ cards) of your deck(?: and put them back in any order)?`, m => ({ k: 'look', n: parseInt(m[1]) || 1 })],
  [`reveal the top (card|\\d+ cards)(?: of your deck)?`, m => ({ k: 'look', n: parseInt(m[1]) || 1 })],
  [`(?:reveal|put|choose) (?:a|an|one|up to \\d+) ${TYPEWORD}? ?cards?(?: with cost \\d+ or less)?(?: (?:from among them )?and put (?:it|them) into your hand| into your hand)`, m => ({ k: 'pick', type: m[1] || 'any' })],
  [`put (?:one|it|that card) into your hand(?: and the other (?:on the (?:top|bottom) of your deck|into your inkwell facedown and exerted)| and the rest on the bottom of your deck(?: in any order)?)?`, () => ({ k: 'pick', type: 'any' })],
  [`put revealed ${TYPEWORD} cards into your hand`, m => ({ k: 'pick', type: m[1], all: true })],
  [`if it's (?:a|an) ${TYPEWORD} card, (?:you may |they may )?put (?:it|that card) into (?:your|their) hand`, m => ({ k: 'pick', type: m[1] })],
  [`search your deck for (?:a|an) ${TYPEWORD} card(?: named [^,]+)?, reveal that card to all players, and put it into your hand`, m => ({ k: 'tutorDeck', type: m[1] })],
  // jouer gratuitement, réductions
  [`play (?:a|an) ${TYPEWORD} with cost (\\d+) or less for free`, m => ({ k: 'playFree', type: m[1], max: +m[2] })],
  [`you pay (\\d+) \\{I\\} less for the next ((?:[A-Z][\\w'-]* )+(?:or (?:[A-Z][\\w'-]* )+)?)?(character|item|action|location|song) you play this turn`, m => ({ k: 'discount', n: +m[1], type: `${m[2] || ''}${m[3]}` })],
  // effets de masse
  [`banish all (opposing )?characters`, m => ({ k: 'banish', t: { sel: 'each', side: m[1] ? 'opp' : 'any', types: ['character'], f: {} } })],
  [`ready all your characters`, () => ({ k: 'ready', t: { sel: 'each', side: 'own', types: ['character'], f: {} } })],
  [`exert all opposing (damaged )?characters`, m => ({ k: 'exert', t: { sel: 'each', side: 'opp', types: ['character'], f: m[1] ? { damaged: true } : {} } })],
  [`each opponent chooses and banishes one of their characters`, () => ({ k: 'oppChoose', what: 'banish' })],
  [`each opponent chooses and exerts one of their ready characters`, () => ({ k: 'oppChoose', what: 'exert' })],
  [`each opponent chooses one of their characters and deals (\\d+) damage to (?:them|it)`, m => ({ k: 'oppChoose', what: 'damage', n: +m[1] })],
  [`each opponent chooses one of their characters and returns that card to their hand`, () => ({ k: 'oppChoose', what: 'return' })],
  [`each player discards their hand and draws (\\d+) cards`, m => ({ k: 'wheel', n: +m[1] })],
  // fins de tour
  [`at the end of (?:the|your|this) turn, banish (them|it|him|her|this character)`, m => ({ k: 'delayedBanish', t: target(m[1]) })],
  // phrases sans effet de jeu ici (ordre du deck, mélange)
  [`(?:then, )?(?:put|place) the rest (?:on the bottom of your deck|into your discard|back on the top of your deck)(?: in any order| in a random order)?`, () => ({ k: 'noop' })],
  [`(?:then, )?shuffle your deck`, () => ({ k: 'noop' })],
  [`otherwise, (?:they )?put it on (?:either )?the (top|bottom)( or the (?:top|bottom))? of (?:your|their) deck`, m => ({ k: 'lookBack', top: m[1] === 'top' && !m[2] })],
  [`put (?:it|them) (?:back )?on (?:either )?the (?:top|bottom)(?: or the (?:top|bottom))? of your deck(?: in any order)?`, () => ({ k: 'noop' })],
  [`put one on the top of your deck and the other on the bottom`, () => ({ k: 'noop' })],
  [`this damage can't be reduced by Resist`, () => ({ k: 'noop' })],
  [`if (?:a|an) [^,]+ is chosen, [^.]+ instead`, () => ({ k: 'noop' })],
];
const COMPILED = RULES.map(([re, f]) => [new RegExp(`^${re}$`), f]);

// Conditions reconnues (« While … », « If … »)
export function parseCond(s) {
  s = lc(s.trim()).replace(/^it's /, 'it is ');
  let m;
  if (/^this character has no damage$/.test(s)) return { c: 'noDamage' };
  if (/^this character (?:has damage|is damaged)$/.test(s)) return { c: 'damaged' };
  if (/^this character is exerted$/.test(s)) return { c: 'exerted' };
  if (/^(?:this character|it|he|she|they) (?:is|are) at a location$/.test(s)) return { c: 'atLocation' };
  // ce qui s'est passé pendant le tour
  if ((m = s.match(/^you played (another|a|an) ((?:[A-Z][\w'-]* )*)(character|song|action|item|location) this turn$/)))
    return { c: 'played', type: (m[2] + m[3]).trim(), other: m[1] === 'another', n: 1 };
  if ((m = s.match(/^you didn't play (?:a|an) (character|song|action|item|location) this turn$/))) return { c: 'played', type: m[1], n: 1, not: true };
  if ((m = s.match(/^you've played (\d+) or more (characters|songs|actions|items|cards) this turn$/))) return { c: 'played', type: m[2] === 'cards' ? 'any' : m[2].replace(/s$/, ''), n: +m[1] };
  if (/^a character was banished this turn$/.test(s)) return { c: 'banishedThisTurn' };
  if (/^there's a card under (?:him|her|it|this character|them)$/.test(s)) return { c: 'under' };
  if ((m = s.match(/^you have (?:a|an) (exerted |damaged )?((?:[A-Z][\w'-]* )*(?:or [A-Z][\w'-]* )?)character here$/))) return { c: 'charHere', state: m[1]?.trim() || null, cls: m[2].trim() ? m[2].trim().split(' or ') : null };
  if ((m = s.match(/^you have (?:a|an) (character|item|action|song|location) card in your discard$/))) return { c: 'discardHas', type: m[1] };
  if ((m = s.match(/^(?:an|chosen) opponent has (\d+) or more (ready |exerted |damaged )?characters in play$/))) return { c: 'oppChars', n: +m[1], state: m[2]?.trim() || null };
  if (/^an opponent has 0 lore$/.test(s)) return { c: 'oppLoreMax', n: 0 };
  if (/^an opponent has more characters in play than you$/.test(s)) return { c: 'oppMoreChars' };
  if (/^chosen opponent has more cards in their hand than you$/.test(s)) return { c: 'oppMoreHand' };
  if ((m = s.match(/^you have (\d+) or more characters here$/))) return { c: 'charHere', n: +m[1] };
  // l'adversaire
  if ((m = s.match(/^an opponent has (?:a|an) (exerted |damaged )?(character|item|location) in play$/))) return { c: 'oppHas', what: m[2], state: m[1]?.trim() || null };
  if (/^an opposing damaged character is in play$/.test(s)) return { c: 'oppDamaged' };
  if (/^(?:an opponent has|one or more opponents have) no cards in (?:their|his|her) hands?$/.test(s)) return { c: 'oppHandMax', n: 0 };
  if ((m = s.match(/^an opponent has (\d+) or more lore$/))) return { c: 'oppLoreMin', n: +m[1] };
  if ((m = s.match(/^this character has (\d+) \{S\} or more$/))) return { c: 'selfStrMin', n: +m[1] };
  if ((m = s.match(/^you have (\d+) or more cards in your discard$/))) return { c: 'discardMin', n: +m[1] };
  if (/^you have more items in play than each opponent$/.test(s)) return { c: 'moreItems' };
  if ((m = s.match(/^you have characters named (.+) and (.+) in play$/))) return { c: 'namedAll', names: [m[1], m[2]] };
  if ((m = s.match(/^you have (?:a character|any characters) in play with (\d+) \{S\} or more$/))) return { c: 'charStrMin', n: +m[1] };
  if ((m = s.match(/^you have (a|an|another) ((?:[A-Z][\w'-]* )+)character or (?:a |an )?((?:[A-Z][\w'-]* )+)character in play$/)))
    return { c: 'chars', n: 1, cls: [m[2].trim(), m[3].trim()], other: m[1] === 'another' };
  if ((m = s.match(/^you have (a|an|another) ((?:[A-Z][\w'-]* )+or (?:[A-Z][\w'-]* )+)character in play$/)))
    return { c: 'chars', n: 1, cls: m[2].trim().split(' or '), other: m[1] === 'another' };
  if ((m = s.match(/^you have (?:a|another) character with (\d+) \{([SW])\} or more in play$/))) return { c: 'charStatMin', stat: m[2], n: +m[1], other: /another/.test(s) };
  if (/^it is your turn$/.test(s)) return { c: 'yourTurn' };
  if (/^you have no cards in your hand$/.test(s)) return { c: 'handMax', n: 0 };
  if ((m = s.match(/^you have (\d+) or (more|fewer) cards in your hand$/))) return { c: m[2] === 'more' ? 'handMin' : 'handMax', n: +m[1] };
  if ((m = s.match(/^you have (\d+) or more cards in your inkwell$/))) return { c: 'inkMin', n: +m[1] };
  if (/^you have another character in play$/.test(s)) return { c: 'chars', n: 1, other: true };
  if ((m = s.match(/^you have (\d+) or more (other )?characters in play$/))) return { c: 'chars', n: +m[1], other: !!m[2] };
  if ((m = s.match(/^you have (\d+) or more (other )?((?:[A-Z][\w'-]* ?)+) characters in play$/))) return { c: 'chars', n: +m[1], other: !!m[2], cls: m[3].trim() };
  if ((m = s.match(/^you have (a|an|another) ((?:[A-Z][\w'-]* ?)+) character in play$/))) return { c: 'chars', n: 1, cls: m[2].trim(), other: m[1] === 'another' };
  if ((m = s.match(/^you have (?:a|another) character named (.+) in play$/))) return { c: 'named', name: m[1] };
  if ((m = s.match(/^you have (?:an|(\d+) or more) items? in play$/))) return { c: 'items', n: m[1] ? +m[1] : 1 };
  if (/^you have a location in play$/.test(s)) return { c: 'locations', n: 1 };
  if ((m = s.match(/^you have (?:a|another) character with (Singer|Evasive|Bodyguard|Support|Reckless|Rush|Ward) in play$/))) return { c: 'charsKw', kw: m[1].toLowerCase(), other: /another/.test(s) };
  if (/^an opposing character has damage$/.test(s)) return { c: 'oppDamaged' };
  if (/^an opponent has more cards in their hand than you$/.test(s)) return { c: 'oppMoreHand' };
  if (/^an opponent has more lore than you$/.test(s)) return { c: 'oppMoreLore' };
  if (/^an opponent has more cards in their inkwell than you$/.test(s)) return { c: 'oppMoreInk' };
  if (/^you have no other characters in play$/.test(s)) return { c: 'charsMax', n: 0 };
  if (/^this is your first turn and you're not the first player$/.test(s)) return { c: 'firstTurnSecond' };
  if (/^you used Shift to play (?:him|her|them|it|this character)$/.test(s)) return { c: 'shifted' };
  if (/^you have a character here$/.test(s)) return { c: 'charHere' };
  return null;
}

/** Traduit une phrase d'effet. Renvoie un objet effet, ou null si non compris. */
function parseSentence(raw) {
  let s = lc(raw.trim().replace(/^[•\-]\s*/, '').replace(/[.!]+$/, '').trim());
  let opt = false, cond = null, ifDo = false, m;
  s = s.replace(/^then,?\s+/, '');
  if ((m = s.match(/^if you do,\s*(.+)$/))) { ifDo = true; s = m[1]; }
  if (/^if .+ (?:is|are) chosen, .+ instead$/.test(s)) return { k: 'noop' };
  // « If it's a song card, you may play it for free » : phrase complète, pas une condition
  if (/^if it's /.test(s)) for (const [re, f] of COMPILED) { const mm = s.match(re); if (mm) { const e = f(mm); return e && (!('t' in e) || e.t) ? { ...e, ...(ifDo ? { ifDo } : {}) } : null; } }
  if ((m = s.match(/^if ([^,]+),\s*(.+)$/))) { cond = parseCond(m[1]); if (!cond) return null; s = m[2]; }
  if ((m = s.match(/^(?:you may|they may|that player may)\s+(.+)$/))) { opt = true; s = m[1]; }
  s = lc(s);
  for (const [re, f] of COMPILED) {
    const mm = s.match(re);
    if (!mm) continue;
    const e = f(mm);
    if (!e || (('t' in e) && !e.t) || (('t2' in e) && !e.t2)) return null;
    if (opt) e.opt = true;
    if (cond) e.cond = cond;
    if (ifDo) e.ifDo = true;
    return e;
  }
  return null;
}

// Phrase composée : « draw a card and gain 1 lore », « deal 2 damage to X to draw 2 cards »
const VERB = String.raw`(?:you )?(?:gain|draw|deal|banish|ready|exert|return|put|remove|each opponent|chosen opponent|look|play|move|get|give|pay)`;
const RE_TO = new RegExp(String.raw`^(.+?) to (${VERB}\b.+)$`);
const RE_AND = new RegExp(String.raw`,? and (?=${VERB}\b)|, (?=${VERB}\b)`);
function parseCompound(s) {
  const one = parseSentence(s);
  if (one) return [one];
  const base = lc(s.trim().replace(/[.!]+$/, ''));
  // « … to <verbe> … » : la première partie est le prix de la seconde
  let m = base.match(RE_TO);
  if (m) {
    const a = parseSentence(m[1]), b = parseCompound(m[2]);
    if (a && b) return [a, ...b.map(e => ({ ...e, ifDo: true }))];
  }
  // un « you may » / « if … » en tête s'applique à toute la phrase
  m = base.match(/^((?:if [^,]+,\s*)?(?:you may )?)(.*)$/);
  const lead = m[1], parts = m[2].split(RE_AND);
  if (parts.length > 1) {
    const fx = parts.map(p => parseSentence(lead + p));
    if (fx.every(Boolean)) return fx;
  }
  return null;
}

/** Corps d'une capacité : suite de phrases, éventuellement « Choose one: • … • … ». */
export function parseBody(text) {
  const s = text.replace(/\s+/g, ' ').trim();
  const m = s.match(/^[Cc]hoose one(?: of the following)?:\s*(.+)$/);
  if (m) {
    const opts = m[1].split(/\s*•\s*/).map(x => x.trim()).filter(Boolean).map(o => parseBody(o));
    return opts.length && opts.every(Boolean) ? [{ k: 'choose', options: opts }] : null;
  }
  const parts = s.split(/(?<=[.!])\s+(?=[A-Z•]|you |they |if |then )|\s*•\s*/).map(x => x.trim()).filter(Boolean);
  const sentences = parts.flatMap(p => (/^draw .*, then choose and discard/i.test(p) ? [p] : p.split(/,\s+then,?\s+/i)));
  const out = [];
  for (const sn of sentences) {
    const fx = parseCompound(sn);
    if (!fx) return null;
    for (const e of fx) if (e.k !== 'noop') out.push(e);
  }
  // « Look at the top N … » sans carte à prendre = simple réorganisation du deck : sans effet ici
  return out.filter((e, i) => !(e.k === 'look' && !out.slice(i + 1).some(x => x.k === 'pick' || x.k === 'pickPlay')));
}

// ------------------------------------------------------------------ Capacités permanentes
const SUBJ = String.raw`(this character|this location|this item|he|she|they|it|your (?:other )?(?:exerted |damaged )?${CLS}?characters(?: named [^,.]+?)?(?: with (?:Evasive|Rush|Ward|Bodyguard|Reckless|Support|Alert|Singer))?|opposing characters(?: with (?:Evasive|Rush|Ward|Bodyguard|Reckless|Support|Alert|Singer))?|characters|your items|your locations)`;

function subject(s) {
  if (['this character', 'this location', 'this item', 'he', 'she', 'they', 'it'].includes(s)) return { who: 'self' };
  if (s === 'opposing characters') return { who: 'opp' };
  if (/^opposing characters with \w+$/.test(s)) return { who: 'opp', f: { kw: s.split(' ').pop().toLowerCase() } };
  if (s === 'characters') return { who: 'here' };
  if (/^your items/.test(s)) return { who: 'ownItems' };
  if (/^your locations/.test(s)) return { who: 'ownLocations' };
  const t = { who: 'own', f: {} };
  let r = s.replace(/^your /, ''), m;
  if ((m = r.match(/ with (\w+)$/))) { t.f.kw = m[1].toLowerCase(); r = r.slice(0, -m[0].length); }
  if (r.startsWith('other ')) { t.f.other = true; r = r.slice(6); }
  if ((m = r.match(/^(exerted|damaged) /))) { t.f[m[1]] = true; r = r.slice(m[0].length); }
  if ((m = r.match(/^characters named (.+)$/))) { t.f.named = m[1]; return t; }
  if ((m = r.match(/^(.+) characters$/))) t.f.cls = splitCls(m[1]);
  return t;
}

// « for each … » : compteur
function parseCounter(s) {
  let m;
  if ((m = s.trim().match(/^(?:the number of )?opposing (damaged |exerted )?characters?(?: in play)?$/))) return { n: 'charsF', side: 'opp', state: m[1]?.trim() || null };
  s = s.trim().replace(/^the number of /, '').replace(/^your /, '').replace(/\bcharacters\b/, 'character').replace(/\bitems\b/, 'item')
    .replace(/\blocations\b/, 'location').replace(/\bcards\b/, 'card').replace(/ in play$/, ' you have in play').replace(/ you have you have/, ' you have');
  if (/^card in (?:your opponents'|each opponent's|an opponent's|opponents') hands?$/.test(s)) return { n: 'oppHand' };
  if (/^1 damage on (?:this character|him|her|it|them)$/.test(s)) return { n: 'selfDamage' };
  if ((m = s.match(/^((?:[A-Z][\w'-]* )*)(character|item|action|song|location) card in your discard$/))) return { n: 'discardType', type: (m[1] + m[2]).trim() };
  if (/^location you have in play$/.test(s)) return { n: 'locations' };
  if (/^card under (?:him|her|it|this character|them)$/.test(s)) return { n: 'under' };
  if ((m = s.match(/^other character named (.+) you have in play$/))) return { n: 'charsF', side: 'own', other: true, named: m[1] };
  if ((m = s.match(/^(opposing )?(damaged |exerted )?character in play$/)) && m[1]) return { n: 'charsF', side: 'opp', state: m[2]?.trim() || null };
  if ((m = s.match(/^(other )?(damaged |exerted )?((?:[A-Z][\w'-]* )*)character(?: with (Bodyguard|Evasive|Support|Rush|Ward|Reckless|Singer))? you have (?:in play|here)$/)))
    return { n: 'charsF', side: 'own', other: !!m[1], state: m[2]?.trim() || null, cls: m[3].trim() || null, kw: m[4]?.toLowerCase() || null, here: / here$/.test(s) };
  if ((m = s.match(/^(damaged |exerted )?character (?:opponents have|you have here|here)(?: in play)?$/)))
    return { n: 'charsF', side: /opponents/.test(s) ? 'opp' : 'own', state: m[1]?.trim() || null, here: /here/.test(s) };
  if (/^character here$/.test(s)) return { n: 'charsF', side: 'own', here: true };
  if (/^card in your hand$/.test(s)) return { n: 'hand' };
  if (/^other character you have in play$/.test(s)) return { n: 'otherChars' };
  if (/^character you have in play$/.test(s)) return { n: 'chars' };
  if ((m = s.match(/^other ((?:[A-Z][\w'-]* ?)+) character you have in play$/))) return { n: 'otherChars', cls: m[1].trim() };
  if (/^item you have in play$/.test(s)) return { n: 'items' };
  if (/^damage on (?:this character|him|her|it)$/.test(s)) return { n: 'selfDamage' };
  if (/^card in your discard$/.test(s)) return { n: 'discard' };
  if (/^opposing character$/.test(s)) return { n: 'oppChars' };
  if (/^exerted character opponents have in play$/.test(s)) return { n: 'oppExerted' };
  return null;
}

const RE_MOD_KW = new RegExp(String.raw`^${SUBJ} gets? ([+-]\d+) \{([SWL])\} and gains? (${KW_RE})$`);
const RE_MOD = new RegExp(String.raw`^${SUBJ} gets? ([+-]\d+) \{([SWL])\}(?: and ([+-]\d+) \{([SWL])\})?(?: for each (.+))?$`);
const RE_GRANT_MOD = new RegExp(String.raw`^${SUBJ} gains? (${KW_RE}) and gets? ([+-]\d+) \{([SWL])\}$`);
const RE_GRANT = new RegExp(String.raw`^${SUBJ} gains? (${KW_RE})(?: and (${KW_RE}))?$`);

function parseStatic(s) {
  let m, cond = null, yourTurn = false;
  s = lc(s.replace(/[.!]+$/, '').trim());
  if ((m = s.match(/^during your turn,\s*(.+)$/))) { yourTurn = true; s = lc(m[1]); }
  let oppTurn = false;
  if ((m = s.match(/^during (?:an opponent's turn|opponents' turns|each opponent's turn),\s*(.+)$/))) { oppTurn = true; s = lc(m[1]); }
  // règles de construction de deck et options sans effet en combat
  if (/^you may have (?:up to \d+ copies of .+|any number of cards named .+) in your deck$/.test(s)) return { st: 'noop' };
  if (/^this character may enter play exerted$/.test(s)) return { st: 'noop' };
  if ((m = s.match(/^you can't play this character unless (.+)$/))) { const c = parseCond(m[1]); return c ? { st: 'playUnless', cond: c } : null; }
  if ((m = s.match(/^for each (.+?), you pay (\d+) \{I\} less to play this character$/))) {
    const per = parseCounter(m[1]); return per ? { st: 'costLess', n: +m[2], what: 'this character', per } : null;
  }
  if ((m = s.match(/^while ([^,]+),\s*(.+)$/))) { cond = parseCond(m[1]); if (!cond) return null; s = lc(m[2]); }
  else if ((m = s.match(/^if ([^,]+),\s*(this character (?:can't|gets|gains) .+|(?:your|opposing) .+ (?:get|gain|can't) .+)$/))) { cond = parseCond(m[1]); if (!cond) return null; s = lc(m[2]); }
  if ((m = s.match(/^this character can't be challenged by ((?:[A-Z][\w'-]* )+)characters$/))) return { st: 'protect', subj: { who: 'self' }, cls: m[1].trim(), cond, yourTurn, oppTurn };
  if ((m = s.match(/^this character can't be challenged by characters with (\d+) \{S\} or (?:more|greater)$/))) return { st: 'protect', subj: { who: 'self' }, minStr: +m[1], cond, yourTurn, oppTurn };
  if ((m = s.match(/^(.+?) while (?:it's |it is )?here$/)) || (m = s.match(/^while here,\s*(.+)$/))) { s = lc(m[1]); cond = { c: 'here' }; }
  if ((m = s.match(/^characters named (.+?) (gets? .+|gains? .+)$/))) { s = `characters ${m[2]}`; cond = { ...(cond || { c: 'always' }), named: m[1] }; }
  const wrap = x => ({ ...x, cond, yourTurn, oppTurn });
  if ((m = s.match(RE_GRANT_MOD))) return wrap({ st: 'mod', subj: subject(m[1]), mods: [[STAT[m[4]], +m[3]]], kws: [kwObj(m[2])] });
  if ((m = s.match(RE_MOD_KW))) return wrap({ st: 'mod', subj: subject(m[1]), mods: [[STAT[m[3]], +m[2]]], kws: [kwObj(m[4])] });
  if ((m = s.match(RE_MOD))) {
    const per = m[6] ? parseCounter(m[6]) : null;
    if (m[6] && !per) return null;
    return wrap({ st: 'mod', subj: subject(m[1]), mods: [[STAT[m[3]], +m[2]], ...(m[4] ? [[STAT[m[5]], +m[4]]] : [])], per });
  }
  if ((m = s.match(RE_GRANT))) return wrap({ st: 'grant', subj: subject(m[1]), kws: [m[2], m[3]].filter(Boolean).map(kwObj) });
  if ((m = s.match(/^this character can't (challenge or quest|quest or challenge|quest|challenge|be challenged|ready|ready at the start of your turn|\{E\} to sing songs)(?: unless (.+))?$/))) {
    if (m[1] === 'ready at the start of your turn') m[1] = 'ready';
    if (m[1] === 'challenge or quest') m[1] = 'quest or challenge';
    let unless = null;
    if (m[2]) { unless = parseCond(m[2]); if (!unless) return null; }
    return wrap({ st: 'cant', subj: { who: 'self' }, what: m[1].startsWith('{E}') ? 'sing' : m[1], unless });
  }
  if ((m = s.match(/^opposing characters can't (quest|challenge)$/))) return wrap({ st: 'cant', subj: { who: 'opp' }, what: m[1] });
  if ((m = s.match(/^characters with cost (\d+) or less can't challenge (this character|your characters)$/)))
    return wrap({ st: 'protect', subj: m[2] === 'this character' ? { who: 'self' } : { who: 'own', f: {} }, maxCost: +m[1] });
  if (/^this character can challenge ready characters$/.test(s)) return wrap({ st: 'grant', subj: { who: 'self' }, kws: [{ kw: 'challengeReady', v: true }] });
  if (/^this (?:character|item|location) enters play exerted$/.test(s)) return wrap({ st: 'entersExerted' });
  if (/^characters can't be challenged$/.test(s)) return wrap({ st: 'cant', subj: { who: 'here' }, what: 'be challenged' });
  if ((m = s.match(/^your (?:((?:[A-Z][\w'-]* ?)+) )?characters(?: named (.+?))? may move here for free$/))) return wrap({ st: 'freeMove', cls: m[1]?.trim() || null, named: m[2] || null });
  if ((m = s.match(/^if (.+?), you pay (\d+) \{I\} less to play (characters|items|actions|songs|locations)$/))) {
    const c = parseCond(m[1]); if (!c) return null;
    return { st: 'costLess', n: +m[2], what: m[3], cond: c, yourTurn };
  }
  if ((m = s.match(/^this character enters play with (\d+) damage$/))) return wrap({ st: 'entersDamaged', n: +m[1] });
  if ((m = s.match(/^you pay (\d+) \{I\} less to play (this character|(?:[A-Z][\w'-]* )*characters?(?: named [^.]+)?|items|actions|songs|locations)$/)))
    return wrap({ st: 'costLess', n: +m[1], what: m[2] });
  if ((m = s.match(/^if (.+?), you pay (\d+) \{I\} less to play this character$/))) {
    const c = parseCond(m[1]); if (!c) return null;
    return { st: 'costLess', n: +m[2], what: 'this character', cond: c, yourTurn };
  }
  if (/^you may ink an additional card$/.test(s)) return wrap({ st: 'extraInk' });
  if (/^this character can't be challenged$/.test(s)) return wrap({ st: 'cant', subj: { who: 'self' }, what: 'be challenged' });
  return null;
}

// ------------------------------------------------------------------ Déclencheurs
const TRIGGERS = [
  [/^when you play this (?:character|item|location) and whenever (?:he|she|they|it) quests$/, () => [{ on: 'play' }, { on: 'quest' }]],
  [/^when you play this (?:character|item|location)$/, () => [{ on: 'play' }]],
  [/^whenever this character quests$/, () => [{ on: 'quest' }]],
  [/^whenever (this character or )?one of your (other )?((?:[A-Z][\w'-]* )*)characters quests$/, m => [{ on: 'anyQuest', other: !!m[2] && !m[1], cls: m[3]?.trim() || null }]],
  [/^whenever a character quests while here$/, () => [{ on: 'questHere' }]],
  [/^whenever this character challenges(?: another character| a character| a location)?$/, () => [{ on: 'challenge' }]],
  [/^when(?:ever)? this character is challenged$/, () => [{ on: 'challenged' }]],
  [/^whenever this character sings a song$/, () => [{ on: 'sing' }]],
  [/^whenever this character moves to a location$/, () => [{ on: 'move' }]],
  [/^whenever you play this or another ((?:[A-Z][\w'-]* )*)character$/, m => [{ on: 'play' }, { on: 'youPlay', type: 'character', cls: m[1].trim() || null }]],
  [/^whenever one of your characters is challenged$/, () => [{ on: 'allyChallenged' }]],
  [/^whenever this character banishes another character in a challenge$/, () => [{ on: 'banishInChallenge' }]],
  [/^when this character is (?:challenged and )?banished(?: in a challenge)?$/, m => [{ on: 'banished', inChallenge: /challenge/.test(m[0]) }]],
  [/^when this character challenges and is banished$/, () => [{ on: 'banished', inChallenge: true }]],
  [/^when this item is banished$/, () => [{ on: 'banished' }]],
  [/^whenever a character is (?:challenged and )?banished(?: in a challenge)? while here$/, () => [{ on: 'banishedHere' }]],
  [/^whenever this character quests while at a location$/, () => [{ on: 'quest', atLocation: true }]],
  [/^whenever one of your (other )?((?:[A-Z][\w'-]* )*)characters is banished(?: in a challenge)?$/, m => [{ on: 'allyBanished', other: !!m[1], cls: m[2]?.trim() || null, inChallenge: /challenge/.test(m[0]) }]],
  [/^whenever (?:another|an opposing|an opponent's) character is banished(?: in a challenge)?$/, m => [{ on: 'anyBanished', side: /opposing|opponent/.test(m[0]) ? 'opp' : 'any' }]],
  [/^at the start of your turn$/, () => [{ on: 'startTurn' }]],
  [/^at the end of your turn$/, () => [{ on: 'endTurn' }]],
  [/^whenever you play (?:a|an|another) ((?:[A-Z][\w'-]* )*)(character|action|song|item|location)(?: with cost (\d+) or less)?(?: named [^,]+)?$/, m => [{ on: 'youPlay', type: m[2], cls: m[1]?.trim() || null, maxCost: m[3] ? +m[3] : null }]],
  [/^whenever you play this character or another ((?:[A-Z][\w'-]* )*)character$/, m => [{ on: 'play' }, { on: 'youPlay', type: 'character', cls: m[1].trim() || null }]],
  [/^whenever you play a second action in a turn$/, () => [{ on: 'youPlay', type: 'action', second: true }]],
  [/^whenever an opponent plays a (character|song|action)$/, m => [{ on: 'oppPlay', type: m[1] }]],
  [/^whenever you ready this character$/, () => [{ on: 'readied' }]],
  [/^whenever you play an action that isn't a song$/, () => [{ on: 'youPlay', type: 'action', notSong: true }]],
  [/^whenever you play a card$/, () => [{ on: 'youPlay', type: 'any' }]],
  [/^whenever a character moves here$/, () => [{ on: 'moveHere' }]],
  [/^whenever an item is banished$/, () => [{ on: 'anyBanished', kind: 'item' }]],
  [/^whenever (?:he|she|this character) challenges a damaged character$/, () => [{ on: 'challenge', defDamaged: true }]],
  [/^whenever (?:he|she|this character) challenges (?:a|an) ((?:[A-Z][\w'-]* )+)character$/, m => [{ on: 'challenge', defCls: m[1].trim() }]],
  [/^whenever this character quests or challenges$/, () => [{ on: 'quest' }, { on: 'challenge' }]],
  [/^when you play this character and at the start of your turn$/, () => [{ on: 'play' }, { on: 'startTurn' }]],
  [/^when you play this character and whenever (?:he|she)(?:'s| is) challenged$/, () => [{ on: 'play' }, { on: 'challenged' }]],
  [/^whenever one of your other characters banishes another character in a challenge$/, () => [{ on: 'banishInChallenge', any: true, other: true }]],
  [/^whenever an opposing character quests$/, () => [{ on: 'anyQuest', side: 'opp' }]],
  [/^whenever you play (?:a|an|another) ((?:[A-Z][\w'-]* )*)character with (Bodyguard|Evasive|Rush|Ward|Support|Singer|Reckless)$/, m => [{ on: 'youPlay', type: 'character', cls: m[1].trim() || null, kw: m[2].toLowerCase() }]],
  [/^whenever you play (?:a|an|another) character with (\d+) \{S\} or more$/, m => [{ on: 'youPlay', type: 'character', minStr: +m[1] }]],
  [/^whenever one of your (other )?(items|locations) is banished$/, m => [{ on: 'allyBanished', kind: m[2].replace(/s$/, '') }]],
  [/^whenever you remove (?:1 or more )?damage from (?:one of your characters|a character)$/, () => [{ on: 'healed' }]],
  [/^whenever this character deals damage to another character in a challenge$/, () => [{ on: 'challengeDamage' }]],
  [/^when(?:ever)? this character moves to a location$/, () => [{ on: 'move' }]],
  [/^whenever (?:he|she|it|they) quests?$/, () => [{ on: 'quest' }]],
  [/^whenever (?:he|she|they) challenges?(?: another character| a character)?$/, () => [{ on: 'challenge' }]],
  [/^whenever (?:a character of yours|one of your characters) named (.+) quests$/, m => [{ on: 'anyQuest', named: m[1] }]],
  [/^whenever (this character or )?one of your (other )?((?:[A-Z][\w'-]* )*)characters challenges(?: another character| a character)?$/, m => [{ on: 'challenge', any: true, other: !!m[2] && !m[1], cls: m[3]?.trim() || null }]],
  [/^whenever this character challenges a damaged character$/, () => [{ on: 'challenge', defDamaged: true }]],
  [/^whenever this character banishes (?:a|another) character in a challenge$/, () => [{ on: 'banishInChallenge' }]],
  [/^when(?:ever)? this (?:character|item|location) (?:is banished|leaves play)$/, m => [{ on: /leaves/.test(m[0]) ? 'left' : 'banished' }]],
  [/^when you play this (?:character|item|location) and when (?:he|she|it|they) leaves? play$/, () => [{ on: 'play' }, { on: 'left' }]],
  [/^whenever you remove 1 or more damage from one of your characters$/, () => [{ on: 'healed' }]],
  [/^whenever a card is put into your inkwell$/, () => [{ on: 'inked' }]],
  [/^whenever you draw a card$/, () => [{ on: 'drew' }]],
  [/^whenever this character takes damage$/, () => [{ on: 'damaged', self: true }]],
  [/^whenever an opposing character takes damage$/, () => [{ on: 'damaged', side: 'opp' }]],
  [/^whenever one of your (other )?characters with (Bodyguard|Evasive|Support|Rush|Ward|Reckless) is banished(?: in a challenge)?$/, m => [{ on: 'allyBanished', other: !!m[1], kw: m[2].toLowerCase(), inChallenge: /challenge/.test(m[0]) }]],
];

function parseAbility(s, cardType) {
  let m;
  s = lc(s.trim());
  if (!s) return null;
  if (cardType === 'Action') {
    s = s.replace(/^sing Together \d+\s*/i, '');
    const fx = parseBody(s);
    return fx && fx.length ? { kind: 'action', effects: fx } : null;
  }
  // Capacité activée : « {E}, 2 {I}, Banish this item - effet »
  const COST = String.raw`(?:\{E\}|\d+ \{I\}|\{I\}|[Bb]anish this (?:item|character)|[Bb]anish one of your (?:other )?items|[Cc]hoose and discard (?:a|an) (?:\w+ )?card|[Dd]iscard a card)`;
  if ((m = s.match(new RegExp(String.raw`^(${COST}(?:,\s*${COST})*)\s*-\s*(.+)$`)))) {
    const cost = { exert: /\{E\}/.test(m[1]), ink: +(m[1].match(/(\d+) \{I\}/)?.[1] || (/\{I\}/.test(m[1]) ? 1 : 0)), banish: /anish this/.test(m[1]),
      banishItem: /anish one of your/.test(m[1]), discard: /iscard/.test(m[1]) };
    const fx = parseBody(m[2]);
    return fx ? { kind: 'activated', cost, effects: fx.length ? fx : [{ k: 'noop' }] } : null;
  }
  // « Once during your turn, … » / « During your turn, whenever … »
  let once = false, yourTurn = false;
  if ((m = s.match(/^once (?:during your turn|per turn|per your turn),\s*(.+)$/))) { once = true; s = lc(m[1]); }
  if ((m = s.match(/^during your turn,\s*(when(?:ever)? .+)$/))) { yourTurn = true; s = m[1]; }
  let oppTurn = false;
  if ((m = s.match(/^during (?:an opponent's turn|opponents' turns|each opponent's turn),\s*(when(?:ever)? .+)$/))) { oppTurn = true; s = m[1]; }
  if ((m = s.match(/^((?:when|whenever|at the (?:start|end) of)[^,]+),\s*(.+)$/))) {
    const trig = TRIGGERS.find(([re]) => re.test(m[1]));
    if (!trig) return null;
    const ons = trig[1](m[1].match(trig[0]));
    const fx = parseBody(m[2]);
    return fx ? { kind: 'triggered', ons, effects: fx.length ? fx : [{ k: 'noop' }], once, yourTurn, oppTurn } : null;
  }
  if ((m = s.match(/^this character may enter play exerted to (.+)$/))) {
    const fx = parseBody(m[1]);
    return fx && fx.length ? { kind: 'triggered', ons: [{ on: 'play' }], effects: [{ k: 'exert', t: { sel: 'self' }, opt: true }, ...fx.map(e => ({ ...e, ifDo: true }))], once, yourTurn } : null;
  }
  const st = parseStatic(s);
  if (st) return { kind: 'static', ...st, yourTurn: st.yourTurn || yourTurn };
  return null;
}

/** Outil de suivi (scripts/effets-manquants.mjs) : quelle partie d'une capacité n'est pas comprise. */
export function diagnose(s, cardType) {
  s = lc(s.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim());
  const body = b => {
    const parts = b.split(/(?<=[.!])\s+(?=[A-Z•]|you |they |if |then )|\s*•\s*/).map(x => x.trim()).filter(Boolean);
    const bad = parts.flatMap(p => p.split(/,\s+then,?\s+/i)).find(p => !parseCompound(p));
    return bad ? `phrase: ${lc(bad.replace(/[.!]+$/, ''))}` : 'corps (choix ou autre)';
  };
  if (cardType === 'Action') return body(s);
  let m;
  if ((m = s.match(/^(.*?(?:\{E\}|\{I\}|[Bb]anish this \w+|[Dd]iscard [^-]+?|one of your \w+))\s+-\s+(.+)$/))) return /^((\{E\}|\d+ \{I\}|banish this (item|character)),?\s*)+$/i.test(m[1]) ? body(m[2]) : `coût: ${m[1]}`;
  s = s.replace(/^once (?:during|per) your turn,\s*/, '').replace(/^during your turn,\s*(?=when)/, '');
  if ((m = s.match(/^((?:when|whenever|at the (?:start|end) of)[^,]+),\s*(.+)$/))) {
    return TRIGGERS.some(([re]) => re.test(m[1])) ? body(m[2]) : `déclencheur: ${m[1]}`;
  }
  return `permanent: ${s}`;
}

/**
 * Analyse le texte complet d'une carte.
 * @returns { keywords, abilities: [{kind:'triggered'|'static'|'activated'|'action', …, label}], unhandled: [lignes non comprises] }
 */
export function parseCardText(textEn, cardType) {
  const lines = normalize(textEn).split('\n').map(l => l.trim()).filter(Boolean);
  const keywords = {}, abilities = [], unhandled = [];
  for (const line of lines) {
    let m;
    // mots-clés
    if ((m = line.match(/^(?:[A-Z][\w'-]* )*Shift (\d+)/))) { keywords.shift = +m[1]; continue; }
    if ((m = line.match(/^Challenger \+(\d+)/))) { keywords.challenger = +m[1]; continue; }
    if ((m = line.match(/^Resist \+(\d+)/))) { keywords.resist = +m[1]; continue; }
    if ((m = line.match(/^Singer (\d+)/))) { keywords.singer = +m[1]; continue; }
    if ((m = line.match(/^Sing Together (\d+)/)) && cardType !== 'Action') { keywords.singTogether = +m[1]; continue; }
    if ((m = line.match(/^Boost (\d+)/))) { keywords.boost = +m[1]; continue; }
    if (/^(Evasive|Rush|Ward|Bodyguard|Reckless|Support|Vanish|Alert)\b/.test(line) && !/\b(When|Whenever)\b/.test(line.split('(')[0])) {
      for (const k of KW) if (new RegExp(`^${k}\\b`).test(line)) keywords[k.toLowerCase()] = true;
      continue;
    }
    if (/^(?:[A-Z][\w'-]* )*Shift:/.test(line)) continue; // Alter avec un coût autre que de l'encre : ignoré
    const clean = line.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    if (!clean) continue; // ligne de rappel seule (ex. chanson)
    if (cardType === 'Action') {
      if ((m = clean.match(/^Sing Together (\d+)\s*/))) keywords.singTogether = +m[1];
      if (!clean.replace(/^Sing Together \d+\s*/, '')) continue;
      const ab = parseAbility(clean.replace(/^Sing Together \d+\s*/, ''), 'Action');
      if (ab) abilities.push({ ...ab, label: null, text: line }); else unhandled.push(line);
      continue;
    }
    // nom de la capacité en majuscules
    const toks = clean.split(' ');
    let i = 0;
    while (i < toks.length - 1 && /[A-Z]/.test(toks[i]) && toks[i] === toks[i].toUpperCase() && !/^\{|^\d/.test(toks[i])) i++;
    const label = toks.slice(0, i).join(' ').replace(/,$/, '');
    const ab = parseAbility(toks.slice(i).join(' '), cardType);
    if (ab) abilities.push({ ...ab, label: label || null, text: line }); else unhandled.push(line);
  }
  // une action en plusieurs paragraphes = une seule capacité
  if (cardType === 'Action' && abilities.length > 1) {
    abilities.splice(0, abilities.length, { kind: 'action', effects: abilities.flatMap(a => a.effects), label: null });
  }
  return { keywords, abilities, unhandled };
}
