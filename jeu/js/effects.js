// Traduction du texte (anglais) des cartes en capacités utilisables par le moteur de combat.
// Grammaire : [déclencheur / condition], [coût] - phrases d'effet « verbe + cible » enchaînées.
// Une capacité dont une phrase n'est pas comprise est ignorée en entier (jamais d'effet à moitié appliqué).

const SYM = { '⬡': '{I}', '¤': '{S}', '◊': '{L}', '⛉': '{W}', '⟳': '{E}', '’': "'", '‘': "'", '“': '"', '”': '"', '—': '-', '–': '-' };
export const normalize = t => (t || '').replace(/[⬡¤◊⛉⟳’‘“”—–]/g, ch => SYM[ch]);
const num = s => (s == null ? 1 : /^(a|an|one)$/i.test(s) ? 1 : s === 'two' ? 2 : s === 'three' ? 3 : Number(s));
const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
const KW = ['Evasive', 'Rush', 'Ward', 'Bodyguard', 'Reckless', 'Support', 'Vanish', 'Alert', 'Resist', 'Challenger', 'Singer'];
const KW_RE = String.raw`(?:Adventurous|Evasive|Rush|Ward|Bodyguard|Reckless|Support|Vanish|Alert|Resist \+\d+|Challenger \+\d+|Singer \d+)`;
const kwObj = s => { const m = s.match(/^(\w+)(?: \+?(\d+))?$/); return { kw: m[1].toLowerCase(), v: m[2] ? +m[2] : true }; };
const STAT = { S: 'str', W: 'wil', L: 'lore' };

// ------------------------------------------------------------------ Cibles
const CLS = String.raw`(?:[A-Z][\w'-]*(?: [A-Z][\w'-]*)*(?:,? (?:and |or )?[A-Z][\w'-]*(?: [A-Z][\w'-]*)*)* )`;
const FILT = String.raw`(?: with (?:cost \d+(?! or)|Singer|Boost|Ward|Rush|Support|cost \d+ or (?:less|more)|\d+ \{[SWL]\} or (?:less|more)|a cost of \d+ or (?:less|more)|Evasive|Bodyguard|Reckless|damage|no damage))?(?: without (?:Evasive|Bodyguard|Ward))?(?: with a card under them)?(?: who was challenged this turn)?(?: not named [A-Z][^.,]*?)?(?: named [A-Z][^.,]*?)?(?: here| at a location)?(?: each)?`;
const NOUN = String.raw`(?:locations? or characters?|characters?, items?,? (?:or|and/or) locations?|characters? (?:or|and/or) locations?|characters? or items?|items? or locations?|locations? or items?|characters?|items?|locations?)`;
const TGT = String.raw`(?:this (?:character|item|location)|them|they|those characters|he|she|it|him|her|that character|the chosen character|the exerted character|the other character|a character of theirs|chosen ${CLS}of yours|the challenging character|the challenged character|(?:up to \d+ |any number of )?(?:another |other )?chosen (?:other )?(?:opposing )?(?:damaged |exerted |ready )?(?:opposing )?${CLS}?${NOUN}(?: of yours)?${FILT}|(?:each|all) (?:other )?(?:opposing )?(?:damaged |exerted |ready )?${CLS}?characters?${FILT}|(?:all |each of )?your (?:other )?(?:exerted |damaged |ready )?${CLS}?characters${FILT}|one of your (?:other )?(?:${CLS})?(?:characters|items|locations)(?: or (?:characters|items|locations))?|that location|an opposing (?:damaged )?character|another (?:chosen )?character)`;
const splitCls = s => s.split(/,? (?:and |or )|, /).map(x => x.trim()).filter(Boolean);

function target(s) {
  s = s.trim();
  if (/^this (character|item|location)$/.test(s)) return { sel: 'self' };
  if (/^(he|she|him|her)$/.test(s)) return { sel: 'it', selfFallback: true };
  if (/^(them|they|those characters|it|that character|the chosen character|the exerted character)$/.test(s)) return { sel: 'it' };
  if (s === 'the other character') return { sel: 'otherMoved' };
  if (s === 'that location') return { sel: 'loc' };
  if (s === 'a character of theirs') return { sel: 'chosen', side: 'opp', types: ['character'], f: {} };
  let mm;
  if ((mm = s.match(/^chosen ((?:[A-Z][\w'-]* )+)of yours$/))) return { sel: 'chosen', side: 'own', types: ['character'], f: { cls: [mm[1].trim()] } };
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
  if ((m = s.match(/^ with (Evasive|Bodyguard|Reckless|Singer|Boost|Ward|Rush|Support)/))) { t.f.kw = m[1].toLowerCase(); s = s.slice(m[0].length); }
  if ((m = s.match(/^ with cost (\d+)(?! or)/))) { t.f.maxCost = t.f.minCost = +m[1]; s = s.slice(m[0].length); }
  if (s.startsWith(' with no damage')) { t.f.undamaged = true; s = s.slice(15); }
  if (s.startsWith(' with damage')) { t.f.damaged = true; s = s.slice(12); }
  if (s.endsWith(' each')) s = s.slice(0, -5);
  if (s.endsWith(' who was challenged this turn')) { t.f.challengedTurn = true; s = s.slice(0, -29); }
  if (s.endsWith(' with a card under them')) { t.f.hasUnder = true; s = s.slice(0, -23); }
  { const w = s.match(/ without (Evasive|Bodyguard|Ward)$/); if (w) { t.f.notKw = w[1].toLowerCase(); s = s.slice(0, -w[0].length); } }
  { const w = s.match(/ not named (.+)$/); if (w) { t.f.notNamed = w[1]; s = s.slice(0, -w[0].length); } }
  if (s.endsWith(' at a location')) { t.f.atLoc = true; s = s.slice(0, -14); }
  if (s.endsWith(' here')) { t.f.here = true; s = s.slice(0, -5); }
  if ((m = s.match(/^ named (.+)$/))) { t.f.named = m[1].trim(); s = ''; }
  return s.trim() ? null : t;
}

// ------------------------------------------------------------------ Durées
const DUR = String.raw`(?: (this turn|for the rest of this turn|until the start of your next turn|during their next turn|during its next turn|until the end of (?:the|this) turn))?`;
const dur = s => (!s ? null : /until the start of your next turn/.test(s) ? 'untilYourNext' : /during (their|its) next turn/.test(s) ? 'theirNext' : 'turn');

// ------------------------------------------------------------------ Phrases d'effet
const T = `(${TGT})`;
const TYPEWORD = String.raw`((?:[A-Z][\w'-]* )*(?:or (?:[A-Z][\w'-]* )+)?(?:character|action|item|song|location))`;
// « a character card with Singer or a song card », « a non-character card or a character card named Kevin » → liste de { type, f }
function typeExpr(str) {
  const out = [];
  // « a character, item, or location card with cost 6 or less »
  let lm = str.match(/^(?:(?:a|an) )?((?:\w+, )+)(?:or |and\/or )(\w+) cards?((?: with .+)?)$/);
  if (lm) { const f = cardFilter(lm[3]); if (!f) return null; return [...lm[1].split(', ').filter(Boolean), lm[2]].map(type => ({ type, f })); }
  lm = str.match(/^(?:a|an) (character|item|action|song|location) or (character|item|action|song|location) card((?: with .+)?)$/);
  if (lm) { const f = cardFilter(lm[3]); if (!f) return null; return [lm[1], lm[2]].map(type => ({ type, f })); }
  for (let part of str.split(/ or (?=(?:a|an) |named )/)) {
    part = part.trim().replace(/^(?:a|an) /, '');
    let m;
    if ((m = part.match(/^named (.+)$/))) { out.push({ type: 'any', f: { named: m[1] } }); continue; }
    if (/^non-character card$/.test(part)) { out.push({ type: 'any', notChar: true }); continue; }
    if ((m = part.match(/^((?:[A-Z][\w'-]* )*(?:or (?:[A-Z][\w'-]* )+)?)(character|action|item|song|location)? ?cards?((?: (?:with|named) .+?)*)(?: or named (.+))?$/))) {
      const f = cardFilter(m[3]); if (!f) return null;
      const type = (m[1] + (m[2] || 'card')).trim();
      out.push({ type, f });
      if (m[4]) out.push({ type: 'any', f: { named: m[4] } });
      continue;
    }
    return null;
  }
  return out.length ? out : null;
}

// Filtres d'une carte de la défausse : « with cost 3 or less », « that isn't a song card », « named X »…
function cardFilter(str) {
  const f = {};
  let r = (str || '').trim(), m;
  while (r) {
    if ((m = r.match(/^with (?:a )?cost (?:of )?(\d+) or less/))) f.maxCost = +m[1];
    else if ((m = r.match(/^with cost (\d+)(?! or)/))) { f.maxCost = f.minCost = +m[1]; }
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
  ['(?:this character|he|she|they) takes? no damage from (?:the challenge|challenges this turn)', () => ({ k: 'grant', t: { sel: 'self' }, kws: [{ kw: 'noChallengeDamage', v: true }], dur: 'turn' })],
  ['each opponent with more lore than you loses (\\d+) lore', m => ({ k: 'oppLore', n: +m[1], cond: { c: 'oppMoreLore' } })],
  ['exert all cards in your inkwell', () => ({ k: 'exertInk' })],
  ['discard your hand', () => ({ k: 'discardHand' })],
  ['draw a card from the bottom of your deck', () => ({ k: 'draw', n: 1 })],
  ['choose and discard a card or banish (?:this (?:character|item)|him|her)', () => ({ k: 'choose', options: [[{ k: 'discard', n: 1, who: 'you' }], [{ k: 'banish', t: { sel: 'self' } }]] })],
  [`(?:you )?gain lore equal to the (\\{L\\}|damage) (?:of|on) ${T}`, m => ({ k: 'loreFrom', stat: m[1] === 'damage' ? 'damage' : 'lore', t: target(m[2]) })],
  ['shuffle this card into your deck', () => ({ k: 'tuckSelf' })],
  ['put the top card of your deck facedown under (him|her|it|them|this character|this location|one of your characters or locations with Boost)', m => ({ k: 'putUnder', self: !/one of your/.test(m[1]) })],
  [`${T} can't challenge and must quest(?: if able)? during their next turn(?: if able)?`, m => ({ k: 'restrict', t: target(m[1]), what: 'challenge', dur: 'theirNext' })],
  ['look at (?:chosen opponent\'s|each opponent\'s) hand', () => ({ k: 'noop' })],
  [`remove (\\d+) damage each from ${T}`, m => ({ k: 'heal', n: +m[1], t: target(m[2]) })],
  ['(?:if you used Shift to play (?:him|her|them|this character), )?search your deck for any card, put that card into your hand', () => ({ k: 'tutorDeck', type: 'any' })],
  ['put that card (?:from your discard )?into your inkwell facedown and exerted', () => ({ k: 'itToInk' })],
  [`(?:you )?gain lore equal to (?:that location's \\{L\\})`, () => ({ k: 'loreFrom', stat: 'location' })],
  [`(?:you )?gain lore equal to (${TGT})'s \\{L\\}`, m => ({ k: 'loreFrom', stat: 'lore', t: target(m[1]) })],
  [`choose (${TGT}) and gain lore equal to their \\{L\\}`, m => { const t = target(m[1].replace(/^a character/, 'chosen character')); return { k: 'loreFrom', stat: 'lore', t }; }],
  ['choose one of your characters and ready them', () => ({ k: 'ready', t: { sel: 'chosen', side: 'own', types: ['character'], f: {} } })],
  ['(?:each|chosen) opponent chooses and exerts one of their characters', () => ({ k: 'oppChoose', what: 'exert' })],
  ['(?:each|chosen) opponent chooses one of their characters and (returns that card to their hand|puts that card on the bottom of their deck)', m => ({ k: 'oppChoose', what: /hand/.test(m[1]) ? 'return' : 'tuck' })],
  ['move (?:one of your other characters|this character and up to 1 of your other characters) to that location for free', m => ({ k: 'moveFree', n: /this character/.test(m[0]) ? 2 : 1, self: /this character/.test(m[0]), other: !/this character/.test(m[0]), there: true })],
  [`search your deck for (?:a|an) ${TYPEWORD} card((?: with [^.]+?)?) and reveal (?:that card|it) to all players`, m => { const f = cardFilter(m[2]); return f && { k: 'tutorDeck', type: m[1], f, top: true }; }],
  ['shuffle your deck and put that card on top of it', () => ({ k: 'noop' })],
  [`${T} gains? (?:(${KW_RE}) and )?"When this character is banished in a challenge, (?:you may )?return this card to your hand"${DUR}`, m => ({ k: 'grant', t: target(m[1]), kws: [...(m[2] ? [kwObj(m[2])] : []), { kw: 'returnOnBanish', v: true }], dur: dur(m[3]) || 'turn' })],
  ['put all cards from your hand into your inkwell facedown and exerted', () => ({ k: 'handToInk' })],
  [`${T} gains? (${KW_RE}) and (${KW_RE}) and can challenge ready characters${DUR}`, m => ({ k: 'grant', t: target(m[1]), kws: [kwObj(m[2]), kwObj(m[3]), { kw: 'challengeReady', v: true }], dur: dur(m[4]) || 'turn' })],
  [`${T} may challenge ready characters this turn`, m => ({ k: 'grant', t: target(m[1]), kws: [{ kw: 'challengeReady', v: true }], dur: 'turn' })],
  [`put (?:a|an) ${TYPEWORD} card from your discard into your inkwell facedown(?: and exerted)?`, m => ({ k: 'discardToInk', type: m[1] })],
  [`put (?:a|an) ${TYPEWORD} card from your discard on the top of your deck`, m => ({ k: 'recur', type: m[1], n: 1, top: true })],
  ['shuffle all ((?:[A-Z][\\w\'-]* )*)(?:character )?cards from your discard into your deck', m => ({ k: 'shuffleBack', cls: m[1].trim() || null })],
  ['return this card from your discard to your hand', () => ({ k: 'returnSelfCard' })],
  ['chosen opponent reveals (?:their|his|her) hand and discards a (non-character|song|action|item|character) card of their choice', m => ({ k: 'discard', n: 1, who: 'opp', filter: m[1], pick: true, theirs: true })],
  ['you pay (\\d+) \\{I\\} less for the next action or item you play this turn', m => ({ k: 'discount', n: +m[1], type: 'any', types: ['action', 'item'] })],
  [`until the start of your next turn, ${T} can't challenge and must quest if able`, m => ({ k: 'restrict', t: target(m[1]), what: 'challenge', dur: 'untilYourNext' })],
  ['ready all your characters and deal (\\d+) damage to each of them', m => ({ k: 'readyAll', n: +m[1] })],
  ['for each (.+?), (?:you may )?draw a card', m => { const n = perOf(m[1]); return n && { k: 'draw', n }; }],
  ['(they|this character|he|she) may move (?:to a location|there) for free', m => ({ k: 'moveFree', n: 1, it: m[1] === 'they', self: m[1] !== 'they', there: /there/.test(m[0]) })],
  ["the challenging character's player discards all cards in their hand", () => ({ k: 'discardHand', who: 'opp' })],
  ['banish all (opposing )?(items|locations)', m => ({ k: 'banish', t: { sel: 'each', side: m[1] ? 'opp' : 'any', types: [m[2].replace(/s$/, '')], f: {} } })],
  [`${T} can't be challenged${DUR}`, m => ({ k: 'grant', t: target(m[1]), kws: [{ kw: 'unchallengeable', v: true }], dur: dur(m[2]) || 'untilYourNext' })],
  ['(?:each|chosen) opponent discards all cards in their hand', () => ({ k: 'discardHand', who: 'opp' })],
  ['(?:then, )?(?:each opponent|chosen opponent|that player) discards a card at random', () => ({ k: 'discard', n: 1, who: 'opp', random: true })],
  ['(?:this turn, )?you may ink an additional card(?: this turn)?', () => ({ k: 'extraInk' })],
  ['deal (\\d+) damage to each character in play', m => ({ k: 'damage', n: +m[1], t: {"sel":"each","side":"any","types":["character"],"f":{}} })],
  ['each player exerts all the cards in their inkwell', () => ({ k: 'exertInk', all: true })],
  ['each opponent puts the top (card|\\d+ cards) of their deck into their inkwell facedown and exerted', m => ({ k: 'ramp', n: parseInt(m[1]) || 1, who: 'opp' })],
  ['put (\\d+) into your hand and the rest on the bottom of your deck(?: in any order)?', m => ({ k: 'pick', type: 'any', n: +m[1] })],
  ['ready this character after the challenge', () => ({ k: 'ready', t: { sel: 'self' } })],
  [`${T} gains? ((?:${KW_RE}, )+(?:and )?${KW_RE})${DUR}`, m => ({ k: 'grant', t: target(m[1]), kws: m[2].split(/, (?:and )?/).map(kwObj), dur: dur(m[3]) || 'turn' })],
  ['put up to (\\d+) cards from your discard into your inkwell facedown and exerted', m => ({ k: 'discardToInk', type: 'any', n: +m[1] })],
  [`deal (\\d+) damage to ${T} for each (.+)`, m => { const n = perOf(m[3], +m[1]); return n && { k: 'damage', n, t: target(m[2]) }; }],
  ['your other characters gain "This character can challenge ready characters" this turn', () => ({ k: 'grant', t: {"sel":"each","side":"own","types":["character"],"f":{"other":true}}, kws: [{ kw: 'challengeReady', v: true }], dur: 'turn' })],
  [`${T} gets ([+-]\\d+) \\{S\\} and gains "This character takes no damage from challenges"${DUR}`, m => ({ k: 'mod', t: target(m[1]), mods: [['str', +m[2]]], kws: [{ kw: 'noChallengeDamage', v: true }], dur: dur(m[3]) || 'turn' })],
  ['look at (?:the cards in your inkwell|the top card of each opponent\'s deck)', () => ({ k: 'noop' })],
  ['return (\\d+) cards at random from your inkwell to your hand', m => ({ k: 'inkToHand', n: +m[1] })],
  ['put (a card|all the cards) (?:from|in) your hand on the bottom of your deck(?: in any order)?', m => ({ k: 'handToBottom', all: /all/.test(m[1]) })],
  [`draw cards equal to the damage on ${T}`, m => ({ k: 'drawFrom', t: target(m[1]) })],
  ['opposing damaged characters gain Reckless during their next turn', () => ({ k: 'grant', t: {"sel":"each","side":"opp","types":["character"],"f":{"damaged":true}}, kws: [{ kw: 'reckless', v: true }], dur: 'theirNext' })],
  // choisir sans autre effet : la suite parle de « they / that character / the chosen character »
  [`(?:for each opposing player, )?(?:you may )?choose ((?:a|an) (?:exerted )?(?:character|location)(?: of yours)?|${TGT})`, m => { const t = /of theirs$/.test(m[1]) ? target(m[1]) : target(m[1].replace(/^(?:a|an) (exerted )?(character|location)/, 'chosen $1$2').replace(/^an opposing character$/, 'chosen opposing character')); return t && { k: 'mark', t }; }],
  // effets liés à la carte source (« while this item is in play »)
  [`(?:they|that character) can't (challenge or quest|quest or challenge|quest|challenge) while this (?:item|location|character) is in play`, m => ({ k: 'restrict', t: { sel: 'it' }, what: 'quest or challenge', dur: 'whileSrc' })],
  [`while this (?:item|location|character) is in play, that (?:character|location) (?:gains (${KW_RE})|can't ready at the start of their turn)`, m => (m[1] ? { k: 'grant', t: { sel: 'it' }, kws: [kwObj(m[1])], dur: 'whileSrc' } : { k: 'restrict', t: { sel: 'it' }, what: 'ready', dur: 'whileSrc' })],
  ['banish all other characters with the same name as that character', () => ({ k: 'banishSameName', exceptIt: true })],
  [`(banish|exert) (${TGT}) and all other (?:opposing )?(?:characters|items or locations) with the same name`, m => ({ k: m[1], t: target(m[2]), sameName: true })],
  // capacités données (« gains "Whenever this character challenges…, draw a card" this turn »)
  [`${T} (?:gets ([+-]\\d+) \\{S\\} and )?gains? (?:(${KW_RE}) and )?"([^"]+)"${DUR}`, m => { const inner = m[4].replace(/\.$/, ''); const ab = /^this character can challenge ready characters$/i.test(inner) ? { kind: 'static', st: 'challengeReadyIf', any: true } : /^this character takes no damage from challenges$/i.test(inner) ? null : parseAbility(inner, 'Character');
    if (/^this character takes no damage from challenges$/i.test(inner)) return { k: 'grant', t: target(m[1]), str: m[2] ? +m[2] : 0, kws: [...(m[3] ? [kwObj(m[3])] : []), { kw: 'noChallengeDamage', v: true }], dur: dur(m[5]) || 'turn' };
    return ab && { k: 'grantAb', t: target(m[1]), str: m[2] ? +m[2] : 0, kws: m[3] ? [kwObj(m[3])] : [], ab: { ...ab, text: m[4], label: null }, dur: dur(m[5]) || 'turn' }; }],
  [`${T} gains (${KW_RE}) and the (\\w+) classification${DUR}`, m => ({ k: 'grant', t: target(m[1]), kws: [kwObj(m[2])], cls: m[3], dur: dur(m[4]) || 'turn' })],
  [`${T} gains Singer and counts as having \\+(\\d+) cost to sing songs${DUR}`, m => ({ k: 'grantSinger', t: target(m[1]), n: +m[2], dur: dur(m[3]) || 'turn' })],
  [`${T} takes no damage while challenging${DUR}`, m => ({ k: 'grant', t: target(m[1]), kws: [{ kw: 'noChallengeDamage', v: true }], dur: dur(m[2]) || 'turn' })],
  [`${T} gets ([+-]\\d+) \\{S\\} and can't \\{E\\} to sing songs${DUR}`, m => ({ k: 'mod', t: target(m[1]), mods: [['str', +m[2]]], restrictSing: true, dur: dur(m[3]) || 'turn' })],
  // force / volonté « égale à »
  [`${T} gets \\+\\{S\\} equal to (their \\{W\\}|this character's \\{S\\}|the \\{S\\} of ${TGT})${DUR}`, m => ({ k: 'modFrom', t: target(m[1]), sign: 1, from: /their/.test(m[2]) ? 'targetWil' : /this character/.test(m[2]) ? 'selfStr' : 'otherStr', ...(/the \{S\} of/.test(m[2]) ? { t2: target(m[2].replace(/^the \{S\} of /, '')) } : {}), dur: dur(m[3]) || 'turn' })],
  [`each of your other characters gets \\+\\{S\\} equal to this character's \\{S\\}${DUR}`, m => ({ k: 'modFrom', t: { sel: 'each', side: 'own', types: ['character'], f: { other: true } }, sign: 1, from: 'selfStr', dur: dur(m[1]) || 'turn' })],
  [`${T} loses \\{S\\} equal to (this character's \\{L\\}|that number)${DUR}`, m => ({ k: 'modFrom', t: target(m[1]), sign: -1, from: /that number/.test(m[2]) ? 'num' : 'selfLore', dur: dur(m[3]) || 'turn' })],
  ['count the number of characters you have in play', () => ({ k: 'countChars' })],
  ['you pay that amount of \\{I\\} less for the next character you play this turn', () => ({ k: 'discount', n: 'num', type: 'character' })],
  // dégâts « égaux à »
  [`deal damage equal to this character's \\{S\\} to ${T}`, m => ({ k: 'damage', n: 'selfStr', t: target(m[1]) })],
  [`(?:deal that much damage|deal the same amount of damage) to ${T}`, m => ({ k: 'damage', n: 'evAmount', t: target(m[1]) })],
  ['deal (\\d+) damage to each opposing character and location', m => ({ k: 'damage', n: +m[1], t: { sel: 'each', side: 'opp', types: ['character', 'location'], f: {} } })],
  ['deal (\\d+) damage to each opposing character with Evasive and each opposing location with Evasive', m => ({ k: 'damage', n: +m[1], t: { sel: 'each', side: 'opp', types: ['character', 'location'], f: { kw: 'evasive' } } })],
  // lore
  ['each opponent gains (\\d+) lore', m => ({ k: 'loreOpp', n: +m[1] })],
  ['each player loses (\\d+) lore', m => ({ k: 'allLoseLore', n: +m[1] })],
  ['each player gets (\\d+) ink drops? and gains (\\d+) lore', m => ({ k: 'inkDrop', n: +m[1], who: 'all', lore: +m[2] })],
  ['each player gets (\\d+) ink drops?', m => ({ k: 'inkDrop', n: +m[1], who: 'all' })],
  ['(?:all|each) opponents? loses? (\\d+) lore and you gain lore equal to the lore lost(?: this way)?', m => ({ k: 'drain', n: +m[1] })],
  [`each opponent loses lore equal to the damage on ${T}, to a maximum of (\\d+) lore each`, m => ({ k: 'oppLoreFrom', t: target(m[1]), max: +m[2] })],
  ['gain lore equal to (?:her|his|their|this character\'s) \\{S\\}, to a maximum of (\\d+) lore', m => ({ k: 'loreFrom', stat: 'selfStr', max: +m[1] })],
  ['gain lore equal to the cost of one of your items in play', () => ({ k: 'loreFrom', stat: 'itemCost' })],
  // pioche
  ['draw cards equal to that location\'s \\{L\\}', () => ({ k: 'drawFrom', stat: 'atLoc' })],
  ['choose and discard that many cards', () => ({ k: 'discard', n: 'drawn', who: 'you' })],
  // défausse, mains
  ['(?:the challenging player|each opponent|chosen opponent) may choose and discard a card', () => ({ k: 'oppMayDiscard' })],
  ['for each opponent who doesn\'t, (.+)', m => { const fx = parseSentence(m[1].replace(/^you /, '')); return fx && { ...fx, cond: { c: 'oppDeclined' } }; }],
  ['if they don\'t, (.+)', m => { const fx = parseSentence(m[1].replace(/^you /, '')); return fx && { ...fx, cond: { c: 'oppDeclined' } }; }],
  ['chosen opponent reveals their hand and discards each non-character card revealed this way', () => ({ k: 'discard', n: 99, who: 'opp', filter: 'non-character', pick: true, all: true })],
  ['each opponent chooses and discards a card for each card that was under (?:him|her|them)', () => ({ k: 'discard', n: 'underWas', who: 'opp' })],
  ['each opponent chooses and discards either 2 cards or 1 action card', () => ({ k: 'lucifer' })],
  ['chosen player reveals their hand', () => ({ k: 'noop' })],
  ['(?:if they have more than (\\d+) cards in their hand, )?they (?:choose and )?discard (?:cards )?until they have (\\d+)(?: cards in their hand)?', m => ({ k: 'handLimit', n: +m[2] })],
  ['if they have fewer than (\\d+) cards in their hand, they draw until they have (\\d+)', m => ({ k: 'handFill', n: +m[2] })],
  // jeu à plusieurs
  ['each player chooses (one|\\d+) of their characters and puts them into their inkwell facedown and exerted', m => ({ k: 'eachToInk', n: num(m[1]) })],
  ['each player may put up to (\\d+) cards from their discard into their inkwell facedown and exerted', m => ({ k: 'discardToInk', type: 'any', n: +m[1], who: 'all' })],
  ['each player may reveal a character card from their hand and play it for free', () => ({ k: 'playFree', type: 'character', max: 99, who: 'all' })],
  ['each player shuffles all character cards from their discard into their deck', () => ({ k: 'shuffleBack', who: 'all' })],
  ['(?:each opponent|chosen opponent) may put the top card of their deck into their inkwell facedown and exerted', () => ({ k: 'ramp', n: 1, who: 'opp' })],
  ['its player puts the top card of their deck into their inkwell facedown and exerted', () => ({ k: 'ramp', n: 1, who: 'itOwner' })],
  ['that player may play a character from their discard for free', () => ({ k: 'playFree', type: 'character', max: 99, fromDiscard: true, who: 'itOwner' })],
  ['characters can\'t exert to sing songs until the start of your next turn', () => ({ k: 'lockPlay', types: ['sing'], all: true })],
  ['each opponent can\'t ready more than 1 of their characters at the start of their next turn', () => ({ k: 'readyLimit', n: 1 })],
  ['exert all your characters not named (.+)', m => ({ k: 'exert', t: { sel: 'each', side: 'own', types: ['character'], f: { notNamed: m[1] } } })],
  ['banish all characters with \\{S\\} equal to or less than the \\{S\\} he had in play', () => ({ k: 'banish', t: { sel: 'each', side: 'any', types: ['character'], f: { maxstrSelf: true } } })],
  ['banish any number of your items, then draw a card for each item banished this way', () => ({ k: 'banishItemsDraw' })],
  ['return a card from your discard to your hand', () => ({ k: 'recur', type: 'any', n: 1 })],
  ['put a card from chosen player\'s discard on the bottom of their deck', () => ({ k: 'noop' })],
  ['ready them', () => ({ k: 'ready', t: { sel: 'it' } })],
  ['gain lore equal to the discarded character\'s \\{L\\}', () => ({ k: 'loreFrom', stat: 'itCardLore' })],
  ['play a character with the same name as this character for free', () => ({ k: 'playFree', type: 'character', max: 99, sameNameSelf: true })],
  ['otherwise, put it into your hand', () => ({ k: 'noop' })],
  ['(?:then, )?(?:put|place) the rest on the top of your deck(?: in any order)?', () => ({ k: 'noop' })],
  ['(?:you may )?(?:banish this location to )?play a character from your discard for free', () => ({ k: 'playFree', type: 'character', max: 99, fromDiscard: true })],
  [`move all damage from ${T} to ${T}`, m => ({ k: 'moveDamage', n: 99, t: target(m[1]), t2: target(m[2]) })],
  ['deal (them|him|her) (\\d+) damage', m => ({ k: 'damage', n: +m[2], t: { sel: 'it' } })],
  ['move them to another location for free', () => ({ k: 'moveFree', n: 1, it: true, another: true })],
  ['you pay (\\d+) \\{I\\} less for the next card you play with that name this turn', m => ({ k: 'discount', n: +m[1], type: 'any', named: 'pair' })],
  ['ready (?:him|her)', () => ({ k: 'ready', t: { sel: 'self' } })],
  ['reveal the top card of their deck', () => ({ k: 'revealTop', who: 'itOwner' })],
  ['put the rest (?:in|into) your discard', () => ({ k: 'lookBack', discard: true })],
  ['otherwise, put it (?:in|into) your discard', () => ({ k: 'lookBack', discard: true })],
  ['play it as if it were in your hand', () => ({ k: 'playLooked' })],
  ['draw that many cards', () => ({ k: 'noop' })],
  ['discard (a|\\d+) cards?', m => ({ k: 'discard', n: num(m[1]), who: 'you' })],
  [`give ${T} ([+-]\\d+) \\{([SWL])\\} and (${KW_RE})${DUR}`, m => ({ k: 'mod', t: target(m[1]), mods: [[STAT[m[3]], +m[2]]], kws: [kwObj(m[4])], dur: dur(m[5]) || 'turn' })],
  [`give ${T} the (\\w+) classification${DUR}`, m => ({ k: 'grant', t: target(m[1]), kws: [], cls: m[2], dur: dur(m[3]) || 'turn' })],
  [`give that character (${KW_RE}) and "When this character is banished in a challenge, return this card to your hand"${DUR}`, m => ({ k: 'grant', t: { sel: 'it' }, kws: [kwObj(m[1]), { kw: 'returnOnBanish', v: true }], dur: dur(m[2]) || 'turn' })],
  ['move (him|her|chosen character from here) to another location for free', m => ({ k: 'moveFree', n: 1, self: /him|her/.test(m[1]), hereChar: /here/.test(m[1]), another: true })],
  ['they draw until they have (\\d+)(?: cards in their hand)?', m => ({ k: 'handFill', n: +m[1] })],
  ['draw a card for each damage counter moved this way', () => ({ k: 'draw', n: { per: { n: 'movedDamage' }, x: 1 } })],
  ['gain 1 lore for each item card moved this way', () => ({ k: 'lore', n: { per: { n: 'discardedWay' }, x: 1 } })],
  ['put (\\d+) cards from your discard on the bottom of your deck(?: in any order)? or banish (?:her|him)', m => ({ k: 'choose', options: [[{ k: 'discardBottom', n: +m[1], exact: true }], [{ k: 'banish', t: { sel: 'self' } }]] })],
  ['play (?:this card|this character|it|her|him) from your discard(?: for free)?', m => ({ k: 'playSelfDiscard', free: /free/.test(m[0]) })],
  ['play a song with cost equal to or less than the exerted character\'s cost for free', () => ({ k: 'playFree', type: 'song', max: 'itCost' })],
  ['play a character with cost up to (\\d+) more than the banished character for free', m => ({ k: 'playFree', type: 'character', max: 'itCostPlus', plus: +m[1] })],
  ['play a character with the same name as the banished character for free', () => ({ k: 'playFree', type: 'character', max: 99, sameNameIt: true })],
  ['play that song again from your discard for free', () => ({ k: 'playIt', free: true })],
  ['(?:then, )?put that (?:action )?card on the bottom of your deck(?: instead of into your discard)?', () => ({ k: 'itToBottom' })],
  ['put that card into your hand and shuffle the rest into your deck', () => ({ k: 'noop' })],
  ['(?:then, )?choose up to \\d+ cards from chosen opponent\'s discard and shuffle them into their deck', () => ({ k: 'noop' })],
  ['put (?:it|one) (?:on either the top or the bottom of|on top of|on the top of) their deck(?: or into their discard| and the rest on the bottom of their deck(?: in any order)?)?', () => ({ k: 'noop' })],
  ['look at the top (?:card|\\d+ cards) of chosen player\'s deck', () => ({ k: 'noop' })],
  ['put chosen character with Bodyguard or item into their player\'s inkwell facedown and exerted', () => ({ k: 'toInk', t: { sel: 'chosen', side: 'any', types: ['character', 'item'], f: { bodyguardOrItem: true } } })],
  ['put any number of cards from under your characters and locations into your inkwell facedown and exerted', () => ({ k: 'underToInk' })],
  ['put a character card from your discard under this item faceup', () => ({ k: 'discardUnder' })],
  ['this turn, you may play characters from under this item', () => ({ k: 'playFromUnder' })],
  ['put all cards that were under (?:him|her) under another chosen character or location of yours facedown', () => ({ k: 'moveUnderWas' })],
  ['play those characters from your discard for free', () => ({ k: 'playUnderWas' })],
  ['return all character cards with that name from your discard to your hand', () => ({ k: 'recurNamed' })],
  ['put it into your hand and gain (\\d+) lore', m => ({ k: 'pick', named: true, gain: +m[1] })],
  ['if it\'s the named card, put it into your hand and gain (\\d+) lore', m => ({ k: 'pick', named: true, gain: +m[1] })],
  ['if it\'s the named card, put it into your inkwell facedown and exerted', () => ({ k: 'lookToInk', named: true })],
  ['if that item costs (\\d+) or less, you may play it for free instead and it enters play exerted', m => ({ k: 'pickedPlay', max: +m[1] })],
  ['if that card is (?:a|an) (.+?), they may play it for free', m => { const any = typeExpr('a ' + m[1].replace(/ card$/, '') + ' card'); return any && { k: 'pickPlay', any, everyone: true }; }],
  ['otherwise, they put it on the bottom of their deck', () => ({ k: 'noop' })],
  ['also banish ${TGT}', () => null],
  [`also banish ${T}`, m => ({ k: 'banish', t: target(m[1]) })],
  ['each player draws (\\d+) cards, then discards (\\d+) cards at random', m => ({ k: 'eachDrawDiscard', n: +m[1], d: +m[2] })],
  [`choose an opposing character and deal (\\d+) damage to them for each action card discarded this way`, m => ({ k: 'damage', n: { per: { n: 'discardedActions' }, x: +m[1] }, t: { sel: 'chosen', side: 'opp', types: ['character'], f: {} } })],
  ['choose (\\d+) characters of yours', m => ({ k: 'markOwn', n: +m[1] })],
  ['if one of them is cost (\\d+) or less, return both to your hand', m => ({ k: 'returnMarked', maxCost: +m[1] })],
  ['chosen opponent chooses 3 of their characters and returns one of those cards to their hand, puts one on the bottom of their deck, and puts one on the top of their deck', () => ({ k: 'scatter' })],
  ['they reveal their hand and discard a card of your choice', () => ({ k: 'discard', n: 1, who: 'opp', filter: 'any', pick: true })],
  ['they get (\\d+) ink drops?', m => ({ k: 'inkDropOpp', n: +m[1] })],
  ['(?:you )?draw a card and get (\\d+) ink drops?', m => ({ k: 'drawDrops', n: +m[1] })],
  ['banish any number of chosen opposing characters with total \\{S\\} (\\d+) or less', m => ({ k: 'banishTotal', n: +m[1] })],
  ['move them to that location for free', () => ({ k: 'moveFree', n: 99, singers: true, there: true })],
  ['ready chosen character', () => ({ k: 'ready', t: { sel: 'chosen', side: 'own', types: ['character'], f: {} } })],
  ['shuffle chosen card from your discard into your deck\\. reveal the top card of your deck\\. if it has the same name as the chosen card, you may play the revealed card for free', () => ({ k: 'weKnow' })],
  ['if it has the same name as the chosen card, you may play the revealed card for free', () => ({ k: 'weKnow' })],
  ['put the top card of your deck into your discard\\. if its card type is:.+', () => ({ k: 'jackjack' })],
  ['for the rest of this turn, you may play characters from your discard', () => ({ k: 'playFromDiscardTurn' })],
  ['if you do, they enter play exerted and you can\'t play characters with the same name as characters you played this way this turn', () => ({ k: 'noop' })],
  ['look at the cards in your inkwell and then you may return one to your hand', () => ({ k: 'inkToHandBest' })],
  ['if you do either, (.+)', m => { const e = parseSentence(m[1]); return e && { ...e, ifDo: true }; }],
  [`draw cards equal to the \\{S\\} of ${T}`, m => ({ k: 'drawFrom', stat: 'targetStr', t: target(m[1]) })],
  ['draw 2 cards unless that character\'s player puts that card on the bottom of their deck', () => ({ k: 'hadesDeal' })],
  ['put any number of cards from your hand on the bottom of your deck(?: in any order)?\\. if you do, draw that number of cards plus 1', () => ({ k: 'cycle' })],
  ['draw that number of cards plus 1', () => ({ k: 'cycle' })],
  ['characters can\'t challenge until the start of your next turn', () => ({ k: 'lockPlay', types: ['challenge'], all: true })],
  ['choose another character and reveal a character card in your hand', () => ({ k: 'rapunzelReveal' })],
  ['if they have the same name, draw a card', () => ({ k: 'noop' })],
  ['you may deal (\\d+) damage to chosen character for each item card put into your discard this way', m => ({ k: 'damage', n: { per: { n: 'milledItems' }, x: +m[1] }, t: { sel: 'chosen', side: 'any', types: ['character'], f: {} }, opt: true })],
  ['deal (\\d+) damage to chosen character for each item card put into your discard this way', m => ({ k: 'damage', n: { per: { n: 'milledItems' }, x: +m[1] }, t: { sel: 'chosen', side: 'any', types: ['character'], f: {} } })],
  ['choose and discard a card with ◉ to play this character for free and he enters play exerted', () => ({ k: 'stitchRevive' })],
  ['draw a card for each card that was under them', () => ({ k: 'draw', n: { per: { n: 'itUnderWas' }, x: 1 } })],
  // deck / défausse : déplacements de cartes
  ['put (\\d+|a|an|all|up to \\d+) ((?:[A-Z][\\w\'-]* )*)(character |item |action |song |location )?cards?(?: named ([^.]+?))? from your discard on the bottom of your deck(?: in any order)?', m => ({ k: 'discardBottom', n: /all/.test(m[1]) ? 99 : /\\d/.test(m[1]) ? +m[1].match(/\\d+/)[0] : 1, kind: m[3]?.trim() || null, cls: m[2].trim() || null, named: m[4] || null, exact: /^\\d+$/.test(m[1]) })],
  ['(?:you may )?put (\\d+) cards? from your hand on the top of your deck(?: in any order)?', m => ({ k: 'handToTop', n: +m[1] })],
  ['put any number of cards from your hand on the bottom of your deck(?: in any order)?', () => ({ k: 'noop' })],
  ['put (?:1|one) on the top of your deck and the rest on the bottom(?: in any order)?', () => ({ k: 'noop' })],
  ['put any number of them on the top or the bottom of your deck(?: in any order)?', () => ({ k: 'noop' })],
  ['put it on either the top of your deck or into your discard', () => ({ k: 'noop' })],
  ['put it on the bottom of your deck instead of into your discard', () => ({ k: 'noop' })],
  ['put that card on either the top or the bottom of your deck', () => ({ k: 'noop' })],
  ['put that card into your hand and shuffle your deck', () => ({ k: 'topToHand' })],
  ['put this card (?:from your discard )?on the (top|bottom) of your deck', m => ({ k: 'selfToDeck', top: m[1] === 'top' })],
  ['(?:you may )?(?:shuffle (?:a|chosen) card from (?:any|chosen player\'s|your) discard into (?:its player\'s|their|your) deck|put up to \\d+ cards from chosen player\'s discard on the bottom of their deck(?: in any order)?|look at the top (?:card|\\d+ cards) of chosen player\'s deck)', () => ({ k: 'noop' })],
  ['put (?:a|an) (location|character|item|action) card from chosen player\'s discard on the bottom of their deck', m => ({ k: 'oppDiscardBottom', n: 1, kind: m[1] })],
  ['choose (\\d+) cards from chosen opponent\'s discard and put them on the bottom of their deck', m => ({ k: 'oppDiscardBottom', n: +m[1] })],
  // jouer depuis main / défausse / encrier
  [`play (?:a|an) ${TYPEWORD} from your hand or discard(?: with cost (\\d+) or less)? for free(, exerted)?`, m => ({ k: 'playFree', type: m[1], max: m[2] ? +m[2] : 99, either: true, exerted: !!m[3] })],
  ['play a card with cost (\\d+) or less for free', m => ({ k: 'playFree', type: 'any', max: +m[1] })],
  ['play a ((?:[A-Z][\\w\'-]* )*)character from there for free', m => ({ k: 'playFree', type: (m[1] + 'character').trim(), max: 99, fromInk: true })],
  ['play a character with the same cost or less for free', () => ({ k: 'playFree', type: 'character', max: 'itCost' })],
  ['play a character with the same name as that character for free', () => ({ k: 'playFree', type: 'character', max: 99, sameNameIt: true })],
  ['play (?:that character|him|her|it) for free', () => ({ k: 'playIt', free: true })],
  ['play that character from your discard', () => ({ k: 'playIt', free: false })],
  ['play it', () => ({ k: 'playLooked' })],
  ['play a character from their discard for free', () => ({ k: 'playFree', type: 'character', max: 99, fromDiscard: true, who: 'itOwner' })],
  ['(?:play or )?shift a ((?:[A-Z][\\w\'-]* )*)character(?: with cost (\\d+) or less)? (?:from your discard )?for free', m => ({ k: 'playFree', type: (m[1] + 'character').trim(), max: m[2] ? +m[2] : 99, either: /discard/.test(m[0]) })],
  // révéler / prendre selon une liste de types
  ['(?:reveal )?(?:up to (\\d+) )?(.+?) and put (?:it|them) in(?:to)? your hand', m => { const parts = m[2].split(/ and up to \d+ /); const any = parts.flatMap(p => typeExpr(p.replace(/^(?:any number of |up to \d+ )/, '')) || [null]); if (any.includes(null) || !any.length) return null; return { k: 'pick', any, n: parts.length > 1 ? parts.length : (m[1] ? +m[1] : /any number/.test(m[2]) ? 99 : 1), each: parts.length > 1 }; }],
  ['(?:reveal )?(?:a|an) (.+?) and play it for free', m => { const any = typeExpr(m[1]); return any && { k: 'pickPlay', any }; }],
  ['if it\'s (.+?), (?:you may |they may )?play (?:it|that \\w+|them) for free(?: and (?:they|it|she|he) enters? play exerted)?', m => { const any = typeExpr(m[1]); return any && { k: 'pickPlay', any, exerted: /exerted/.test(m[0]) }; }],
  ['search your deck for (.+?)(?:,| and) reveal (?:it|that card)(?: to all players)?(?:,? and put it in(?:to)? your hand)?', m => { const any = typeExpr(m[1]); return any && { k: 'tutorDeck', any, type: 'any', top: !/hand/.test(m[0]) }; }],
  ['reveal cards from the top of your deck until you reveal (?:a|an) (.+?)', m => { const any = typeExpr(m[1]); return any && { k: 'revealUntil', any }; }],
  // révélations de tous les joueurs
  ['(?:each|chosen) opponent reveals the top card of their deck', () => ({ k: 'revealTop', who: 'opp' })],
  ['each player (?:shuffles their deck and then )?reveals the top card(?: of their deck)?', () => ({ k: 'revealTop', who: 'all' })],
  ['put the card with the highest cost revealed this way, or each card tied for highest cost, into its player\'s hand', () => ({ k: 'pickHighest' })],
  ['draw a card for each different ink symbol on cards revealed this way', () => ({ k: 'drawInks' })],
  ['each player who reveals a character card may play that character for free', () => ({ k: 'pickPlay', type: 'character', everyone: true })],
  ['otherwise, (?:they )?put (?:it|the revealed cards) on the bottom of (?:their|their player\'s) decks?', () => ({ k: 'noop' })],
  ['put the rest on the bottom of their players\' decks', () => ({ k: 'noop' })],
  // nommer une carte
  ['name a card', () => ({ k: 'nameCard' })],
  ['if it\'s the named card, put (?:that card|it) into your hand', () => ({ k: 'pick', named: true })],
  ['if it\'s the named card, (?:you may )?play it for free', () => ({ k: 'pickPlay', type: 'any', named: true })],
  // dégâts déplacés
  [`move 1 damage counter from each damaged character you have in play to ${TGT}`, () => ({ k: 'moveDamageAll', t2: { sel: 'chosen', side: 'opp', types: ['character'], f: {} } })],
  ['move all damage counters from all other characters to that character', () => ({ k: 'moveDamageAll', all: true, t2: { sel: 'it' } })],
  [`move all damage from ${T} to this character`, m => ({ k: 'moveDamage', n: 99, t: target(m[1]), t2: { sel: 'self' } })],
  // sous les cartes
  ['put all cards from under (?:her|him|it|them|this location) into your hand', () => ({ k: 'underToHand' })],
  ['return all cards under (?:it|her|him|them) to your hand', () => ({ k: 'underToHand' })],
  [`put all cards from under ${T} on the bottom of their player's deck in a random order`, m => ({ k: 'clearUnder', t: target(m[1]) })],
  ['put the top card of your deck (?:under (?:this location|him|her|them) facedown|facedown under (?:this location|them))', m => ({ k: 'putUnder', self: !/them/.test(m[0]), it: /them/.test(m[0]) })],
  ['put a card from the top of your deck facedown under each of your other characters', () => ({ k: 'putUnderEach' })],
  ['put this character facedown under one of your characters or locations with Boost', () => ({ k: 'selfUnder' })],
  // encrier
  ['put all characters with cost (\\d+) or less into their players\' inkwells facedown and exerted', m => ({ k: 'toInk', t: { sel: 'each', side: 'any', types: ['character'], f: { maxCost: +m[1] } } })],
  ['put one into your inkwell facedown and exerted(?:,? and the other|, one) .+', () => ({ k: 'lookToInk' })],
  ['put one on either the top or the bottom of your deck and the other into your inkwell facedown and exerted', () => ({ k: 'lookToInk' })],
  ['put a card from your discard into your inkwell facedown and exerted', () => ({ k: 'discardToInk', type: 'any', n: 1 })],
  ['put all ((?:[A-Z][\\w\'-]* )*)character cards from your discard into your inkwell facedown and exerted', m => ({ k: 'discardToInk', type: (m[1] + 'character').trim(), n: 99 })],
  ['that player puts the top card of their deck into their inkwell facedown(?: and exerted)?', () => ({ k: 'ramp', n: 1, who: 'itOwner' })],
  ['each player with more than (\\d+) cards in their inkwell returns cards at random from their inkwell to their hand until they have \\d+ cards in their inkwell', m => ({ k: 'inkTrim', n: +m[1] })],
  // mains
  ['(?:then, )?each player with fewer than (\\d+) cards in their hand draws until they have \\d+', m => ({ k: 'handFill', n: +m[1], who: 'all' })],
  ['the player or players with the most cards in their hands? (?:chooses|choose) and discards? (a|\\d+) cards?', m => ({ k: 'discardMost', n: num(m[1]) })],
  ['discards? (a|\\d+) cards? at random', m => ({ k: 'discard', n: num(m[1]), who: 'you', random: true, self: true })],
  ['they choose and discard (a|\\d+) cards?', m => ({ k: 'discard', n: num(m[1]), who: 'opp' })],
  ['otherwise, choose and discard any number of cards(?: and draw that many)?', () => ({ k: 'noop' })],
  ['draw until you have (\\d+) cards in your hand', m => ({ k: 'drawTo', n: +m[1] })],
  [`choose and discard (?:a|an) (.+?)(?: from your hand)?`, m => { const any = typeExpr(m[1]); return any && { k: 'discardType', any }; }],
  ['choose and discard any number of item cards', () => ({ k: 'discardType', any: [{ type: 'item', f: {} }], all: true })],
  ['gain 1 lore for each item card discarded this way', () => ({ k: 'lore', n: { per: { n: 'discardedWay' }, x: 1 } })],
  ['reveal a song card in your hand', () => ({ k: 'handHas', type: 'song' })],
  // divers
  ['banish any number of your items', () => ({ k: 'banishItemsDraw' })],
  ['draw a card for each item banished this way', () => ({ k: 'noop' })],
  [`banish one of your characters with Reckless to banish chosen character with less \\{S\\} than that character`, () => ({ k: 'divebomb' })],
  ['choose a character of yours and gain lore equal to their \\{L\\}', () => ({ k: 'loreFrom', stat: 'lore', t: { sel: 'chosen', side: 'own', types: ['character'], f: {} } })],
  ['choose any number of players', () => ({ k: 'noop' })],
  [`(?:chosen player|you) draws? a card for each (.+)`, m => { const n = perOf(m[1]); return n && { k: 'draw', n }; }],
  ['for each character that sang this song, draw a card and gain 1 lore', () => ({ k: 'drawLorePer', per: { n: 'singers' } })],
  [`for each of your characters named (.+?) in play, return a chosen opposing character, item, or location with cost (\\d+) or less to their player's hand`, m => ({ k: 'return', t: { sel: 'chosen', side: 'opp', types: ['character', 'item', 'location'], f: { maxCost: +m[2] }, upToPer: { n: 'charsF', side: 'own', named: m[1] } } })],
  [`for each 1 damage removed this way, you pay (\\d+) \\{I\\} less for the next character you play this turn`, m => ({ k: 'discount', n: { per: { n: 'healedWay' }, x: +m[1] }, type: 'character' })],
  [`(?:they|he|she) can also challenge ready characters this turn`, () => ({ k: 'grant', t: { sel: 'it' }, kws: [{ kw: 'challengeReady', v: true }], dur: 'turn' })],
  [`(?:they|he|she|that character) can't ready at the start of their next turn unless they're at a location`, () => ({ k: 'restrict', t: { sel: 'it' }, what: 'readyNext', dur: 'theirNext', unlessAtLoc: true })],
  [`that location gains (${KW_RE})${DUR}`, m => ({ k: 'grant', t: { sel: 'loc' }, kws: [kwObj(m[1])], dur: dur(m[2]) || 'turn' })],
  ['the challenging character gets ([+-]\\d+) \\{S\\} this turn unless their player pays (\\d+) \\{I\\}', m => ({ k: 'taxOrMod', n: +m[1], pay: +m[2] })],
  ['you gain (\\d+) lore unless their player pays (\\d+) \\{I\\}', m => ({ k: 'loreUnlessPay', n: +m[1], pay: +m[2] })],
  ['the next character you play this turn enters play exerted and gains (\\w+) until the start of your next turn', m => ({ k: 'nextCharMod', kw: m[1].toLowerCase() })],
  [`they gain (${KW_RE}) during that challenge`, m => ({ k: 'grant', t: { sel: 'it' }, kws: [kwObj(m[1])], dur: 'turn' })],
  ['move to a location for free', () => ({ k: 'moveFree', n: 1, it: true })],
  ['move (?:him|her) to a .+? location for free', () => ({ k: 'moveFree', n: 1, self: true })],
  [`${T} gets? ([+-]\\d+) \\{([SWL])\\} and loses (\\w+)${DUR}`, m => ({ k: 'mod', t: target(m[1]), mods: [[STAT[m[3]], +m[2]]], loseKw: m[4].toLowerCase(), dur: dur(m[5]) || 'turn' })],
  [`until the start of your next turn, ${T} gains Reckless(?: and, .+)?`, m => ({ k: 'grant', t: target(m[1]), kws: [{ kw: 'reckless', v: true }], dur: 'untilYourNext' })],
  ['until the start of your next turn, the next time they would be dealt damage they take no damage instead', () => ({ k: 'grant', t: { sel: 'it' }, kws: [{ kw: 'shieldOnce', v: true }], dur: 'untilYourNext' })],
  ['the next time they challenge a character this turn, gain (\\d+) lore', m => ({ k: 'turnTrigger', ons: [{ on: 'challenge', itOnly: true }], effects: [{ k: 'lore', n: +m[1] }], once: true })],
  [`add (?:his|her|their) \\{W\\} to ${T}'s \\{S\\} this turn`, m => ({ k: 'modFrom', t: target(m[1].replace(/^another chosen character$/, 'another chosen character')), sign: 1, from: 'selfWil', dur: 'turn' })],
  ['pay (\\d+) \\{I\\} and banish this item', m => ({ k: 'payInk', n: +m[1], banishSelf: true })],
  ['(?:you )?pay (\\d+) \\{I\\} less for the next (item|character|action) you play this turn', m => ({ k: 'discount', n: +m[1], type: m[2] })],
  ['you pay (\\d+) \\{I\\} less for the next character (?:you shift this turn|named (.+?) you play this turn)', m => ({ k: 'discount', n: +m[1], type: 'character', named: m[2] || null })],
  [`your ((?:[A-Z][\\w'-]* )*)characters gain (${KW_RE}) and can challenge ready characters this turn`, m => ({ k: 'grant', t: { sel: 'each', side: 'own', types: ['character'], f: m[1].trim() ? { cls: [m[1].trim()] } : {} }, kws: [kwObj(m[2]), { kw: 'challengeReady', v: true }], dur: 'turn' })],
  [`your characters and locations gain (${KW_RE})${DUR}`, m => ({ k: 'grant', t: { sel: 'each', side: 'own', types: ['character', 'location'], f: {} }, kws: [kwObj(m[1])], dur: dur(m[2]) || 'turn' })],
  ['your characters get \\+(\\d+) \\{S\\} while challenging a location this turn', m => ({ k: 'grant', t: { sel: 'each', side: 'own', types: ['character'], f: {} }, kws: [{ kw: 'locChallenger', v: +m[1] }], dur: 'turn' })],
  [`\\{E\\} ${T}`, m => ({ k: 'exert', t: target(m[1]) })],
  [`draw cards equal to that character's \\{L\\}`, () => ({ k: 'drawFrom', stat: 'itLore' })],
  [`deal damage equal to their \\{S\\} to ${T}`, m => ({ k: 'damage', n: 'itStr', t: target(m[1]) })],
  [`gain lore equal to the \\{L\\} of a character card in your discard`, () => ({ k: 'loreFrom', stat: 'discardLore' })],
  ['ready (?:a character here|chosen character with Boost)', m => ({ k: 'ready', t: { sel: 'chosen', side: 'own', types: ['character'], f: /here/.test(m[0]) ? { here: true } : { kw: 'boost' } } })],
  ['ready each character you removed damage from this way', () => ({ k: 'ready', t: { sel: 'healedList' } })],
  ['remove up to (\\d+) damage total from any number of your characters', m => ({ k: 'healTotal', n: +m[1] })],
  ['return a song card you played this turn with cost (\\d+) or less from your discard to your hand', m => ({ k: 'recur', type: 'song', n: 1, f: { maxCost: +m[1] } })],
  [`return chosen item with cost equal to or less than this character's \\{S\\} to its player's hand`, () => ({ k: 'return', t: { sel: 'chosen', side: 'any', types: ['item'], f: { maxCostSelfStr: true } } })],
  ['return that card to its player\'s hand', () => ({ k: 'recurIt', anyOwner: true })],
  [`shuffle another chosen character card into their player's deck`, () => ({ k: 'tuck', t: { sel: 'chosen', side: 'any', types: ['character'], f: { other: true } } })],
  ['put the top (\\d+) cards of chosen player\'s deck into their discard', m => ({ k: 'mill', n: +m[1], who: 'opp' })],
  ['draw a card for each card discarded', () => ({ k: 'draw', n: { per: { n: 'evCards' }, x: 1 } })],
  ['shift a character from your discard for free', () => ({ k: 'shiftFromDiscard' })],
  ['look at the top card of chosen player\'s deck', () => ({ k: 'noop' })],
  ['look at a number of cards from the top of your deck equal to the number of cards under (?:him|her)', () => ({ k: 'look', n: { per: { n: 'under' }, x: 1 } })],
  ['reveal a number of cards from the top of your deck equal to the number of cards under (?:him|her)', () => ({ k: 'look', n: { per: { n: 'under' }, x: 1 } })],
  [`${T} counts? as having \\+(\\d+) cost to sing songs${DUR}`, m => ({ k: 'grantSinger', t: target(m[1]), n: +m[2], dur: dur(m[3]) || 'turn' })],
  ['if you used Shift to play this character, you may draw (\\d+) cards when he enters play', m => ({ k: 'draw', n: +m[1], cond: { c: 'shifted' } })],
  ['(?:for the rest of this turn, )?(whenever [^,]+?)(?: this turn)?, (.+)', m => { const tr = TRIGGERS.find(([re]) => re.test(m[1])); const fx = tr && parseBody(m[2]); return fx && fx.length ? { k: 'turnTrigger', ons: tr[1](m[1].match(tr[0])), effects: fx } : null; }],
  ['(?:you may )?play (?:her|him|this character|it) and (?:she|he|it|they) enters? play exerted', () => ({ k: 'playSelfDiscard' })],
  ['(?:you may )?reveal the top card of your deck\\. if you do, you may play it\\. otherwise, put it into your discard', () => ({ k: 'revealPlayPay' })],
  ['if you do, you may play it', () => ({ k: 'revealPlayPay' })],
  ['otherwise, put it into your discard', () => ({ k: 'noop' })],
  ['for the rest of this turn, they take no damage from challenges and can\'t quest', () => ({ k: 'grant', t: { sel: 'each', side: 'own', types: ['character'], f: {} }, kws: [{ kw: 'noChallengeDamage', v: true }], restrictQuest: true, dur: 'turn' })],
  ['they discard their hands and draw (\\d+) cards each', m => ({ k: 'wheelSelf', n: +m[1] })],
  [`play (?:a|an) ${TYPEWORD} from your hand or discard with cost (\\d+) or less for free, exerted`, m => ({ k: 'playFree', type: m[1], max: +m[2], exerted: true, either: true })],
  // dégâts / soins au moment d'un défi ou d'une quête (« ready this character after the challenge » déjà vu)
  ['(?:he|she|this character) takes no damage from the challenge', () => ({ k: 'grant', t: { sel: 'self' }, kws: [{ kw: 'noChallengeDamage', v: true }], dur: 'turn' })],
  ['if it\'s (.+?), (?:you may |they may )?(?:reveal it and )?put (?:it|that card) into (?:your|their) hand( and repeat this effect)?(?: to gain (\\d+) lore)?', m => { const any = typeExpr(m[1]); return any && { k: 'pick', any, repeat: !!m[2], gain: m[3] ? +m[3] : 0 }; }],
  // dégâts, bannissement, renvoi
  [`deal (\\d+) damage to ${T}`, m => ({ k: 'damage', n: +m[1], t: target(m[2]) })],
  [`deal damage to ${T} equal to (?:their|its|this character's) \\{S\\}`, m => ({ k: 'damage', n: 'selfStr', t: target(m[1]) })],
  [`banish ${T}`, m => ({ k: 'banish', t: target(m[1]) })],
  [`return ${T} to (?:their|its|your|his|her) (?:player's |players' )?hands?`, m => ({ k: 'return', t: target(m[1]) })],
  [`return that card to your hand`, () => ({ k: 'recurIt' })],
  [`put ${T} into (?:their|its|your) (?:player's )?inkwell facedown(?: and exerted)?`, m => ({ k: 'toInk', t: target(m[1]) })],
  [`shuffle ${T} into (?:their|its) (?:player's )?deck`, m => ({ k: 'tuck', t: target(m[1]) })],
  [`put ${T} on the bottom of (?:their|its) (?:player's |players' )?decks?(?: in any order)?`, m => ({ k: 'tuck', t: target(m[1]) })],
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
  [`move (?:up to )?(\\d+) damage(?: counters?)? from ${T} to ${T}`, m => ({ k: 'moveDamage', n: +m[1], t: target(m[2]), t2: target(m[3]) })],
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
  [`(?:reveal|put|choose) (a|an|one|up to \\d+) ${TYPEWORD}? ?cards?( with (?:cost \\d+ or less|Singer|Support|Bodyguard))?(?: (?:from among them )?and put (?:it|them) into your hand| into your hand)`, m => ({ k: 'pick', type: m[2] || 'any', n: /\d/.test(m[1]) ? +m[1].match(/\d+/)[0] : 1, f: m[3] ? cardFilter(m[3].trim()) : undefined })],
  [`put (?:one|it|that card) into your hand(?: and the other (?:on the (?:top|bottom) of your deck|into your inkwell facedown and exerted)| and the rest on the bottom of your deck(?: in any order)?)?`, () => ({ k: 'pick', type: 'any' })],
  [`put (?:all )?revealed ${TYPEWORD} cards into your hand`, m => ({ k: 'pick', type: m[1], all: true })],
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
  if (/ and /.test(s) && !/^you have (?:characters named|a .+ character and a)/.test(s)) {
    const parts = s.split(/ and (?=you |none |this |it |he |she |they |an? |the |there )/);
    if (parts.length > 1) { const cs = parts.map(p => parseCond(p)); if (cs.every(Boolean)) return { c: 'all', list: cs }; }
  }
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
  if (/^you have a character in play with more \{S\} than each opposing character(?: in play)?$/.test(s)) return { c: 'strongest' };
  if (/^you have a character or location in play with a card under them$/.test(s)) return { c: 'anyUnder' };
  if (/^you have an ink drop$/.test(s)) return { c: 'inkDrop' };
  if ((m = s.match(/^this character has (\d+) or more damage$/))) return { c: 'selfDamageMin', n: +m[1] };
  if ((m = s.match(/^the moved character is a ((?:[A-Z][\w'-]* )*[A-Z][\w'-]*)(?: character)?$/))) return { c: 'itCls', cls: [m[1].trim()] };
  if ((m = s.match(/^(?:an?|any) ((?:[A-Z][\w'-]* )+)(?:character )?cards? (?:is|was|were) (?:discarded|moved) this way$/))) return { c: 'itCls', cls: [m[1].trim()], moved: /moved/.test(s) };
  if ((m = s.match(/^any ((?:[A-Z][\w'-]* )+)cards were moved this way$/))) return { c: 'movedCls', cls: m[1].trim() };
  if ((m = s.match(/^you discarded a ((?:[A-Z][\w'-]* )*)(character|location|item|action|song) card(?: this way)?$/))) return { c: 'itType', type: (m[1] + m[2]).trim() };
  if (/^the banished item is named (.+)$/.test(s)) return { c: 'itNamed', name: s.match(/named (.+)$/)[1] };
  if (/^there was an exerted character here$/.test(s)) return { c: 'hadExertedHere' };
  if (/^it has the same name as another card in your discard$/.test(s)) return { c: 'evNameInDiscard' };
  if (/^this character is being challenged$/.test(s)) return { c: 'beingChallenged' };
  if (/^any of the cards that were under them are character cards$/.test(s)) return { c: 'underWasChar' };
  if ((m = s.match(/^(\d+) or more characters of yours are exerted$/))) return { c: 'chars', n: +m[1], exerted: true };
  if (/^a damaged character is in play$/.test(s)) return { c: 'anyDamaged' };
  if (/^another character in play has damage$/.test(s)) return { c: 'anyDamaged', other: true };
  if ((m = s.match(/^there are (\d+) or more characters with damage in play$/))) return { c: 'anyDamaged', n: +m[1] };
  if ((m = s.match(/^an opponent has a (song|character|action|item|location) card in their discard$/))) return { c: 'oppDiscardHas', type: m[1] };
  if (/^challenging a damaged character$/.test(s)) return { c: 'challengingDamaged' };
  if (/^this character has a card under (?:him|her|it|them)$/.test(s)) return { c: 'under' };
  if ((m = s.match(/^you have (\d+) or more other characters in play with (\d+) \{S\} or more$/))) return { c: 'charStatMin', stat: 'S', n: +m[2], count: +m[1], other: true };
  if ((m = s.match(/^you have (\d+) items named (.+) in play$/))) return { c: 'itemsNamed', n: +m[1], name: m[2] };
  if ((m = s.match(/^you have an item named (.+) in play$/))) return { c: 'itemsNamed', n: 1, name: m[1] };
  if ((m = s.match(/^you have (\d+) or more (song|character|action|item|location) cards in your discard$/))) return { c: 'discardTypeMin', n: +m[1], type: m[2] };
  if (/^you have a character in play with the highest cost, or tied for highest cost$/.test(s)) return { c: 'highestCost' };
  if (/^you have more cards in your inkwell than each opposing player$/.test(s)) return { c: 'moreInk' };
  if (/^you have only 1 character here$/.test(s)) return { c: 'charHere', exactly: 1 };
  if (/^you have a character in play with damage$/.test(s)) return { c: 'ownDamaged' };
  if ((m = s.match(/^one of your ((?:[A-Z][\w'-]* )+)characters was banished this turn$/))) return { c: 'banishedClsTurn', cls: m[1].trim() };
  if ((m = s.match(/^a character named (.+) was banished this turn$/))) return { c: 'banishedNamedTurn', name: m[1] };
  if (/^an opposing character was banished in a challenge this turn$/.test(s)) return { c: 'oppTurnEvent', what: 'banished' };
  if ((m = s.match(/^you've played (\d+) or more (actions|characters|songs|items) this turn$/))) return { c: 'played', type: m[2].replace(/s$/, ''), n: +m[1] };
  if (/^you've played a song this turn$/.test(s)) return { c: 'played', type: 'song', n: 1 };
  if (/^you got an ink drop this turn$/.test(s)) return { c: 'gotDrop' };
  if (/^you put a card under (?:him|her|it|them) this turn$/.test(s)) return { c: 'putUnderTurn' };
  if (/^you have no cards in your hand$/.test(s)) return { c: 'handMax', n: 0 };
  if ((m = s.match(/^(?:a|an) ((?:[A-Z][\w'-]* )+(?:or (?:[A-Z][\w'-]* )+)?)character is chosen$/)) || (m = s.match(/^the chosen character is a ((?:[A-Z][\w'-]* )+)character$/))) return { c: 'itCls', cls: m[1].trim().split(' or ') };
  if ((m = s.match(/^(?:a|the chosen) character named (.+) is chosen$/)) || (m = s.match(/^the chosen character is named (.+)$/)) || (m = s.match(/^that character is named (.+)$/))) return { c: 'itNamed', name: m[1] };
  if (/^that character has damage$/.test(s)) return { c: 'itDamaged' };
  if ((m = s.match(/^they're a ((?:[A-Z][\w'-]* )+)character$/))) return { c: 'itCls', cls: [m[1].trim()] };
  if ((m = s.match(/^that card is a ((?:[A-Z][\w'-]* )+)character card$/)) || (m = s.match(/^you returned a ((?:[A-Z][\w'-]* )+)character this way$/))) return { c: 'itCls', cls: [m[1].trim()] };
  if (/^(?:that character|he|she|they) had a card under (?:them|him|her)$/.test(s)) return { c: 'underWas' };
  if (/^there's a card under that character$/.test(s)) return { c: 'itUnder' };
  if ((m = s.match(/^(?:a|an) ((?:[A-Z][\w'-]* )+(?:or (?:[A-Z][\w'-]* )+)?)character is in play$/))) return { c: 'anyCls', cls: m[1].trim().split(' or ') };
  if ((m = s.match(/^you have any (?:characters )?in play with (\d+) \{S\} or more$/))) return { c: 'charStrMin', n: +m[1] };
  if ((m = s.match(/^you have (\d+) or more exerted characters in play$/))) return { c: 'chars', n: +m[1], exerted: true };
  if ((m = s.match(/^you have (\d+) or more ((?:[A-Z][\w'-]* )+)character cards in your discard$/))) return { c: 'discardCls', n: +m[1], cls: m[2].trim() };
  if ((m = s.match(/^you have a (?:character )?card named (.+) in your discard$/))) return { c: 'discardNamed', name: m[1] };
  if ((m = s.match(/^there's a (character|song|action|item|location) card in your discard$/))) return { c: 'discardHas', type: m[1] };
  if ((m = s.match(/^you have a ((?:[A-Z][\w'-]* )+)character and a ((?:[A-Z][\w'-]* )+)character in play$/))) return { c: 'all', list: [{ c: 'chars', n: 1, cls: m[1].trim() }, { c: 'chars', n: 1, cls: m[2].trim() }] };
  if ((m = s.match(/^you have a character named (.+) here$/))) return { c: 'charHere', named: m[1] };
  if ((m = s.match(/^you played (\d+) or more (characters|actions|songs|items|cards) this turn$/))) return { c: 'played', type: m[2] === 'cards' ? 'any' : m[2].replace(/s$/, ''), n: +m[1] };
  if ((m = s.match(/^you've played a character with cost (\d+) or more this turn$/))) return { c: 'played', type: 'character', n: 1, minCost: +m[1] };
  if (/^a character quested this turn$/.test(s)) return { c: 'didTurn', what: 'quested' };
  if (/^it(?:'s| is) the second challenge this turn$/.test(s)) return { c: 'didTurn', what: 'challenged', exactly: 2 };
  if (/^it(?:'s| is) the second card they've drawn this turn$/.test(s)) return { c: 'nthDraw', n: 2, opp: true };
  if (/^it(?:'s| is) the second card you've put into your inkwell this turn$/.test(s)) return { c: 'nthInk', n: 2 };
  if ((m = s.match(/^they have more than (\d+) cards in their hand$/))) return { c: 'evHandMin', n: +m[1] + 1 };
  if ((m = s.match(/^they have fewer than (\d+) cards in their hand$/))) return { c: 'evHandMax', n: +m[1] - 1 };
  if ((m = s.match(/^the challenging character has (\d+) \{S\} or more$/))) return { c: 'evAttStr', n: +m[1] };
  if (/^the item you played has a different name than each other item you have in play$/.test(s)) return { c: 'uniqueItem' };
  if ((m = s.match(/^you have a location named (.+) in play$/))) return { c: 'locNamed', name: m[1] };
  if ((m = s.match(/^you've put a card under (?:her|him|it|them|one of your characters or locations) this turn$/))) return { c: 'putUnderTurn', any: /one of your/.test(s) };
  if ((m = s.match(/^(?:1 or more cards have|a card) left a player's discard this turn$/))) return { c: 'leftDiscardTurn' };
  if (/^there's a character with Evasive here$/.test(s)) return { c: 'charHereKw', kw: 'evasive' };
  if (/^you have a character here$/.test(s)) return { c: 'charHere' };
  if ((m = s.match(/^(\d+) or more (?:other )?cards were put into your discard this turn$/))) return { c: 'discardTurn', n: +m[1] };
  if (/^you discarded a card this turn$/.test(s)) return { c: 'discardTurn', n: 1 };
  if ((m = s.match(/^(\d+) or more characters sang this song$/))) return { c: 'singers', n: +m[1] };
  if (/^a character sang this song$/.test(s)) return { c: 'singers', n: 1 };
  if (/^(?:he|she)'s at a location$/.test(s)) return { c: 'atLocation' };
  if (/^this card is in your discard$/.test(s)) return { c: 'always' };
  if (/^(?:he|she|it|they) (?:has|have) no damage$/.test(s)) return { c: 'noDamage' };
  if ((m = s.match(/^you have fewer than (\d+) cards in your hand$/))) return { c: 'handMax', n: +m[1] - 1 };
  if (/^you didn't put any cards into your inkwell this turn$/.test(s)) return { c: 'noInkTurn' };
  if (/^you removed an ink drop to play (?:her|him|them|it|this character|this action)$/.test(s)) return { c: 'usedDrop' };
  if (/^all cards in your inkwell are exerted$/.test(s)) return { c: 'inkSpent' };
  if (/^one of your characters took damage this turn$/.test(s)) return { c: 'ownTurnEvent', what: 'damaged' };
  if ((m = s.match(/^you have (\d+) or more other exerted characters in play$/))) return { c: 'chars', n: +m[1], other: true, exerted: true };
  if ((m = s.match(/^a character of yours (challenged|quested) this turn$/))) return { c: 'didTurn', what: m[1] };
  if ((m = s.match(/^none of your characters (challenged|quested) this turn$/))) return { c: 'didTurn', what: m[1], not: true };
  if (/^no other character has quested this turn$/.test(s)) return { c: 'didTurn', what: 'quested', not: true, other: true };
  if (/^an opposing character was banished in a challenge this turn$/.test(s)) return { c: 'oppTurnEvent', what: 'banished' };
  if (/^an opposing character took damage this turn$/.test(s)) return { c: 'oppTurnEvent', what: 'damaged' };
  if (/^you have another exerted character in play$/.test(s)) return { c: 'chars', n: 1, other: true, exerted: true };
  if ((m = s.match(/^this character is exerted and (.+)$/)) || (m = s.match(/^this character is exerted, (.+)$/))) { const c2 = parseCond(m[1]); return c2 && { c: 'all', list: [{ c: 'exerted' }, c2] }; }
  if (/^you don't have a ((?:[A-Z][\w'-]* )+)character in play$/.test(s)) return { c: 'chars', n: 1, cls: s.match(/a (.+) character/)[1], not: true };
  if (/^you removed damage this way$/.test(s)) return { c: 'healedWay' };
  if (/^you removed (?:1 or more )?damage from (?:one of your characters|a character) this turn$/.test(s)) return { c: 'healedTurn' };
  if (/^you have more cards in your hand than each opponent$/.test(s)) return { c: 'moreHand' };
  if (/^a character was banished in a challenge this turn$/.test(s)) return { c: 'banishedThisTurn' };
  if (/^being challenged$/.test(s)) return { c: 'beingChallenged' };
  if ((m = s.match(/^you have an exerted character named (.+) in play$/))) return { c: 'named', name: m[1], exerted: true };
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
  let s = lc(raw.replace('__unless', '').trim().replace(/^[•\-]\s*/, '').replace(/[.!]+$/, '').trim());
  let opt = false, cond = null, ifDo = false, m;
  s = s.replace(/^then,?\s+/, '');
  if ((m = s.match(/^if you do(?: either)?,\s*(.+)$/))) { ifDo = true; s = m[1]; }
  if ((m = s.match(/^if you do and ([^,]+),\s*(.+)$/))) { ifDo = true; cond = parseCond(m[1]); if (!cond) return null; s = m[2]; }
  if (/^if .+ (?:is|are) chosen, .+ instead$/.test(s) || /^if you (?:removed an ink drop|used shift) .+ instead$/i.test(s)) return { k: 'noop' };
  // « If it's a song card, you may play it for free » : phrase complète, pas une condition
  if (/^if it's /.test(s)) for (const [re, f] of COMPILED) { const mm = s.match(re); if (mm) { const e = f(mm); if (e && (!('t' in e) || e.t)) return { ...e, ...(ifDo ? { ifDo } : {}) }; } }
  // condition en tête ; si elle n'est pas reconnue, la phrase entière peut encore correspondre à une règle
  if (!cond && !/^if they don't, /.test(s) && (m = s.match(/^if ([^,]+),\s*(.+)$/))) { const c = parseCond(m[1]); if (c) { cond = c; s = m[2]; } }
  if ((m = s.match(/^(?:you may|they may|that player may|their player may)\s+(.+)$/))) { opt = true; s = m[1]; }
  s = lc(s);
  for (const [re, f] of COMPILED) {
    const mm = s.match(re);
    if (!mm) continue;
    const e = f(mm);
    if (!e || (('t' in e) && !e.t) || (('t2' in e) && !e.t2)) continue;
    if (opt) e.opt = true;
    if (cond) e.cond = cond;
    if (ifDo) e.ifDo = true;
    return e;
  }
  // « X unless Y » : X sauf si la condition est vraie
  if (!raw.includes('__unless') && (m = s.match(/^(.+) unless (.+)$/))) {
    const c = parseCond(m[2]); const e = c && parseSentence(m[1] + '__unless');
    if (e) { e.cond = e.cond ? { c: 'all', list: [e.cond, { c: 'not', of: c }] } : { c: 'not', of: c }; return e; }
  }
  return null;
}

// Phrase composée : « draw a card and gain 1 lore », « deal 2 damage to X to draw 2 cards »
const VERB = String.raw`(?:you )?(?:gain|draw|deal|banish|ready|exert|return|put|remove|each opponent|chosen opponent|look|play|move|get|give|pay|have|discard|shuffle|reveal)`;
const RE_TO = new RegExp(String.raw`^(.+?) to (${VERB}\b.+)$`);
const RE_AND = new RegExp(String.raw`(?<!choose),? and (?=${VERB}\b)|, (?=${VERB}\b)| and (?=chosen )| and (?=they gain )`);
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
  const both = s.match(/^[Cc]hoose one of the following\. If ([^,]+), choose both instead:\s*(.+)$/);
  if (both) {
    const c = parseCond(both[1]);
    const opts = both[2].split(/\s*•\s*/).map(x => x.trim()).filter(Boolean).map(o => parseBody(o));
    return c && opts.length && opts.every(Boolean) ? [{ k: 'choose', options: opts, both: c }] : null;
  }
  const yn = s.match(/^[Cc]hosen opponent chooses (?:YES! or NO!|one):\s*•\s*(?:YES! )?(.+?)\s*•\s*(?:NO! )?(.+)$/);
  if (yn) {
    const opts = [yn[1], yn[2]].map(o => parseBody(o.replace(/^They choose a character of theirs and put that card on the bottom of their deck\.?$/, 'Each opponent chooses one of their characters and puts that card on the bottom of their deck.')));
    return opts.every(Boolean) ? [{ k: 'choose', options: opts, oppChooses: true }] : null;
  }
  const pc = s.match(/^[Yy]ou may pay (\d+) \{I\} to choose one:\s*(.+)$/);
  if (pc) { const inner = parseBody('Choose one: ' + pc[2]); return inner ? [{ k: 'payInk', n: +pc[1], opt: true }, ...inner.map(e => ({ ...e, ifDo: true }))] : null; }
  const m = s.match(/^(?:[Yy]ou may )?[Cc]hoose one(?: of the following)?:\s*(.+)$/);
  if (m) {
    const opts = m[1].split(/\s*•\s*/).map(x => x.trim()).filter(Boolean).map(o => parseBody(o));
    return opts.length && opts.every(Boolean) ? [{ k: 'choose', options: opts }] : null;
  }
  const parts = s.split(/(?<=[.!])\s+(?=[A-Z•]|you |they |if |then )|\s*•\s*/).map(x => x.trim()).filter(Boolean);
  const thenNext = new Set();
  const sentences = parts.flatMap(p => { const xs = /^draw .*, then choose and discard/i.test(p) ? [p] : p.split(/,\s+then,?\s+/i); xs.slice(1).forEach(x => thenNext.add(x)); return xs; });
  const out = [];
  for (const sn of sentences) {
    const ins = lc(sn.replace(/[.!]+$/, '')).match(/^if (.+?), (.+?) (?:this turn )?instead$/);
    if (ins && out.length) {
      const c = parseCond(ins[1]);
      let alt = c && parseCompound(ins[2].replace(/ this turn$/, ''));
      if (!alt && c) alt = parseCompound(ins[2] + ' this turn') || parseCompound(ins[2] + ' to them') || parseCompound(ins[2] + ' from them');
      if (c && alt && alt.length === 1) { let k = out.length - 1; for (let j = out.length - 1; j >= 0; j--) if (out[j].k === alt[0].k) { k = j; break; } out[k] = { ...out[k], alt: { cond: c, e: alt[0] } }; continue; }
    }
    const ow = lc(sn).match(/^otherwise, (.+)$/);
    const prevCond = [...out].reverse().find(e => e.cond)?.cond;
    if (ow && prevCond && !/put it|put the|choose and discard any number/.test(ow[1])) {
      const fx2 = parseCompound(ow[1]);
      if (fx2) { for (const e of fx2) out.push({ ...e, cond: { c: 'not', of: prevCond } }); continue; }
    }
    const fx = parseCompound(sn);
    if (!fx) return null;
    // « …, then … » après un « you may … to … » : la suite dépend aussi du paiement
    const chain = thenNext.has(sn) && out.length && out[out.length - 1].ifDo;
    for (const e of fx) if (e.k !== 'noop') out.push(chain && !e.ifDo ? { ...e, ifDo: true } : e);
  }
  // « Look at the top N … » sans carte à prendre = simple réorganisation du deck : sans effet ici
  return out.filter((e, i) => !(e.k === 'look' && !out.slice(i + 1).some(x => x.k === 'pick' || x.k === 'pickPlay')));
}

// ------------------------------------------------------------------ Capacités permanentes
const SUBJ = String.raw`(this character|this location|this item|he|she|they|it|your (?:other )?(?:exerted |damaged )?${CLS}?characters(?: named [^,.]+?)?(?: with (?:Evasive|Rush|Ward|Bodyguard|Reckless|Support|Alert|Singer))?|opposing (?:${CLS})?characters(?: with (?:Evasive|Rush|Ward|Bodyguard|Reckless|Support|Alert|Singer))?|characters|your items|your locations)`;

function subject(s) {
  if (['this character', 'this location', 'this item', 'he', 'she', 'they', 'it'].includes(s)) return { who: 'self' };
  if (s === 'opposing characters') return { who: 'opp' };
  if (/^opposing characters with \w+$/.test(s)) return { who: 'opp', f: { kw: s.split(' ').pop().toLowerCase() } };
  if (/^opposing .+ characters$/.test(s)) return { who: 'opp', f: { cls: splitCls(s.slice(9, -11)) } };
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
    .replace(/\blocations\b/, 'location').replace(/\bcards\b/, 'card');
  if (!/ have /.test(s)) s = s.replace(/ in play$/, ' you have in play');
  if (/^card in (?:your opponents'|each opponent's|an opponent's|opponents') hands?$/.test(s)) return { n: 'oppHand' };
  if (/^1 damage on (?:this character|him|her|it|them)$/.test(s)) return { n: 'selfDamage' };
  if (/^1 damage removed this way$/.test(s)) return { n: 'healedWay' };
  if (/^1 damage removed$/.test(s)) return { n: 'evAmount' };
  if (/^1 lore lost this way$/.test(s)) return { n: 'lostWay' };
  if (/^character you moved$/.test(s)) return { n: 'movedWay' };
  if (/^character that sang this song$/.test(s)) return { n: 'singers' };
  if (/^different ink type of characters? you have in play$/.test(s)) return { n: 'inkTypes' };
  if (/^1 damage on opposing character$/.test(s)) return { n: 'oppDamageTotal' };
  if (/^card in your inkwell$/.test(s)) return { n: 'inkCount' };
  if (/^opposing character banished in a challenge this turn$/.test(s)) return { n: 'oppBanishedChallenge' };
  if ((m = s.match(/^other ((?:[A-Z][\w'-]* )+)character you have in play$/))) return { n: 'charsF', side: 'own', other: true, cls: m[1].trim() };
  if ((m = s.match(/^opposing character with (\d+) \{S\}$/))) return { n: 'charsF', side: 'opp', strExact: +m[1] };
  if ((m = s.match(/^(?:of your )?((?:[A-Z][\w'-]* )+)character you have in play$/))) return { n: 'charsF', side: 'own', cls: m[1].trim() };
  if ((m = s.match(/^((?:[A-Z][\w'-]* )*)(character|item|action|song|location) card in your discard$/))) return { n: 'discardType', type: (m[1] + m[2]).trim() };
  if (/^location you have in play$/.test(s)) return { n: 'locations' };
  if ((m = s.match(/^item named (.+) you have in play$/))) return { n: 'itemsNamed', named: m[1] };
  if (/^item with a different name you have in play$/.test(s)) return { n: 'itemsDistinct' };
  if (/^card under (?:him|her|it|this character|them)$/.test(s)) return { n: 'under' };
  if ((m = s.match(/^other character named (.+) you have in play$/))) return { n: 'charsF', side: 'own', other: true, named: m[1] };
  if ((m = s.match(/^(opposing )?(damaged |exerted )?character in play$/)) && m[1]) return { n: 'charsF', side: 'opp', state: m[2]?.trim() || null };
  if ((m = s.match(/^(other )?(damaged |exerted |undamaged |ready )?((?:[A-Z][\w'-]* )*)character(?: with (Bodyguard|Evasive|Support|Rush|Ward|Reckless|Singer))? you have (?:in play|here)$/)))
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
  // « While … , <effet permanent> » / « If … , <effet permanent> » : condition générique, l'effet est lu à part
  for (let k = s.indexOf(','); /^(?:while|if) /.test(s) && k > 0; k = s.indexOf(',', k + 1)) {
    const c = parseCond(s.slice(0, k).replace(/^(?:while|if) /, '')); const rest = s.slice(k + 1).trim();
    const inner = c && rest && (parseStatic(rest) || parseStatic(rest.replace(/ this turn$/, '')));
    if (inner) return { ...inner, cond: inner.cond && inner.cond.c !== 'here' ? { c: 'all', list: [c, inner.cond] } : c, yourTurn: inner.yourTurn || yourTurn, oppTurn: inner.oppTurn || oppTurn };
  }
  if ((m = s.match(/^(?:while|if) ([^,]+),\s*(.+)$/))) {
    const c = parseCond(m[1]);
    const inner = c && parseStatic(m[2].replace(/ this turn$/, ''));
    if (inner) return { ...inner, cond: inner.cond && inner.cond.c !== 'here' ? { c: 'all', list: [c, inner.cond] } : c, yourTurn: inner.yourTurn || yourTurn, oppTurn: inner.oppTurn || oppTurn };
  }
  // « While this character is exerted, if you have …, … » : deux conditions
  if ((m = s.match(/^while ([^,]+),\s*if ([^,]+),\s*(.+)$/))) {
    const c1 = parseCond(m[1]), c2 = parseCond(m[2]);
    if (!c1 || !c2) return null;
    const inner = parseStatic(m[3]);
    return inner ? { ...inner, cond: { c: 'all', list: [c1, c2] } } : null;
  }
  if ((m = s.match(/^this character also counts as being named (.+) for shift$/i))) return { st: 'shiftName', name: m[1] };
  if ((m = s.match(/^you (?:may )?pay (\d+) \{I\} less to move (your characters|this character) to a location$/))) return { st: 'moveLess', n: +m[1], self: m[2] === 'this character' };
  if ((m = s.match(/^you pay (\d+) \{I\} less to play characters using their shift ability$/i))) return { st: 'shiftLess', n: +m[1] };
  if (/^all cards in your hand count as having/.test(s)) return { st: 'allInkable' };
  if (/^this character enters play exerted and can't ready at the start of your turn$/.test(s)) return { st: 'cant', subj: { who: 'self' }, what: 'ready', entersExerted: true, cond: null };
  if ((m = s.match(/^((?:[A-Za-z][\w'-]* )*?)characters gain (?:(\w+) and )?"([^"]+)" while here$/))) { const ab = parseAbility(m[3].replace(/\.$/, ''), 'Character'); const cls = m[1].trim() ? [m[1].trim().charAt(0).toUpperCase() + m[1].trim().slice(1)] : null; return ab ? { st: 'grantAb', subj: { who: 'here', f: { cls } }, ab: { ...ab, text: m[3], label: null }, kws: m[2] ? [kwObj(m[2])] : undefined } : null; }
  if ((m = s.match(/^your items named (.+?) gain "([^"]+)"$/))) { const ab = parseAbility(m[2].replace(/\.$/, ''), 'Item'); return ab ? { st: 'grantAb', subj: { who: 'ownItems', f: { named: m[1] } }, ab: { ...ab, text: m[2], label: null } } : null; }
  if ((m = s.match(/^(?:this character|he|she) gets ([+-]\d+) \{([SWL])\}, ([+-]\d+) \{([SWL])\}, and ([+-]\d+) \{([SWL])\}$/))) return { st: 'mod', subj: { who: 'self' }, mods: [[STAT[m[2]], +m[1]], [STAT[m[4]], +m[3]], [STAT[m[6]], +m[5]]] };
  if ((m = s.match(/^(?:this character|he|she) gets ([+-]\d+) \{([SWL])\} and gains "([^"]+)"$/))) { const ab = parseAbility(m[3].replace(/\.$/, ''), 'Character'); return ab ? { st: 'mod', subj: { who: 'self' }, mods: [[STAT[m[2]], +m[1]]], grantAb: { ...ab, text: m[3], label: null } } : null; }
  if (/^this character takes no damage from challenges$/.test(s)) return { st: 'grant', subj: { who: 'self' }, kws: [{ kw: 'noChallengeDamage', v: true }] };
  if (/^this location gains Evasive$/.test(s)) return { st: 'grant', subj: { who: 'self' }, kws: [{ kw: 'evasive', v: true }] };
  if (/^this character gains Challenger \+(\d+) and can challenge ready characters$/.test(s)) return { st: 'grant', subj: { who: 'self' }, kws: [kwObj(s.match(/Challenger \+\d+/)[0]), { kw: 'challengeReady', v: true }] };
  if (/^this character gains Rush$/.test(s)) return { st: 'grant', subj: { who: 'self' }, kws: [{ kw: 'rush', v: true }] };
  if ((m = s.match(/^(?:characters|your characters named (.+?)) counts? as having \+(\d+) cost to sing songs(?: while here)?$/))) return { st: 'singBonus', n: +m[2], named: m[1] || null, here: /while here/.test(s) };
  if (/^during challenges, your characters deal damage with their \{W\} instead of their \{S\}$/.test(s)) return { st: 'wilDamage' };
  if (/^the first time this character would take damage, she takes no damage instead$/.test(s)) return { st: 'firstDamageImmune' };
  if (/^your characters' \{S\} can't be reduced below their printed value$/.test(s)) return { st: 'strFloor' };
  if (/^if you used Shift to play this character, you may draw (\d+) cards when he enters play$/.test(s)) return { st: 'noop', shiftDraw: +s.match(/draw (\d+)/)[1] };
  if (/^this character gains Shift 0 \{I\}$/.test(s)) return { st: 'shiftZero' };
  if ((m = s.match(/^(?:this location|this character) gets ([+-]\d+) \{([SWL])\} for each other location you have in play$/))) return { st: 'mod', subj: { who: 'self' }, mods: [[STAT[m[2]], +m[1]]], per: { n: 'locations', minus: 1 } };
  if (/^your other locations can't be challenged$/.test(s)) return { st: 'cant', subj: { who: 'ownLocations', f: { other: true } }, what: 'be challenged' };
  if (/^each opposing player can't gain lore unless one of their characters has challenged this turn$/.test(s)) return { st: 'noLoreUnlessChallenged' };
  if (/^you pay (\d+) \{I\} less to move a character of yours here$/.test(s)) return { st: 'moveLessHere', n: +s.match(/\d+/)[0] };
  if ((m = s.match(/^your ((?:[A-Z][\w'-]* )+)characters lose the (.+) ability$/i))) return { st: 'loseAbility', cls: m[1].trim(), label: m[2].toUpperCase() };
  if ((m = s.match(/^you may (exert (\d+) items of yours|put a ((?:[A-Z][\w'-]* )*)character card from your discard on the bottom of your deck|banish chosen item of yours) to play this character for free$/))) return { st: 'altFree', exertItems: m[2] ? +m[2] : 0, discardCls: m[3] !== undefined ? m[3].trim() : null, banishItem: /banish chosen item/.test(m[1]) };
  if ((m = s.match(/^you may put (\d+) character cards from your discard on the bottom of your deck in any order to shift this character for free$/))) return { st: 'altShift', n: +m[1] };
  if (/^for each item card in your discard, you pay 1 \{I\} less to play this character using her Shift ability$/.test(s)) return { st: 'shiftPer', per: { n: 'discardType', type: 'item' } };
  if ((m = s.match(/^for each character you have here, you pay 1 \{I\} less for the first action you play each turn$/))) return { st: 'firstActionLessHere' };
  if (/^you can ink cards from your discard$/.test(s)) return { st: 'inkFromDiscard' };
  if ((m = s.match(/^(opposing characters can't exert to sing songs) and (your .+)$/))) { const a = parseStatic(m[1].replace(/can't exert to sing songs/, "can't {E} to sing songs")) || { st: 'cant', subj: { who: 'opp' }, what: 'sing' }; const b = parseStatic(m[2]); return b ? { st: 'multi', parts: [a, b] } : null; }
  // « … while here » appliqué à certaines classes : « Hunny characters get +1 {L} while here »
  if ((m = s.match(/^((?:[A-Za-z][\w'-]* )*?)(?:[Cc]haracters)(?: with (\w+))? (gets? .+|gains? .+) while here$/)) && !/^your /i.test(s) && (m[1].trim() || m[2])) {
    const inner = parseStatic('characters ' + m[3] + ' while here');
    const cls = m[1].trim() ? m[1].trim().replace(/^rESEARCH & DEVELOPMENT /i, '').split(/ and /).map(x => x.charAt(0).toUpperCase() + x.slice(1)) : null;
    return inner ? { ...inner, subj: { who: 'here', f: { cls, kw: m[2]?.toLowerCase() } } } : null;
  }
  if ((m = s.match(/^(.+) while (?!here)(.+)$/)) && !/^while /.test(s)) { const c = parseCond(m[2]); const inner = c && parseStatic(m[1]); if (inner) return { ...inner, cond: c }; }
  if ((m = s.match(/^for each (.+?), (this character (?:gets|gains) .+)$/))) {
    const per = parseCounter(m[1]); if (!per) return null;
    const mm = m[2].match(/^this character (?:gains (\w+ \+\d+) and )?gets ([+-]\d+) \{([SWL])\}$/) || m[2].match(/^this character gains (\w+ \+\d+)$/);
    if (!mm) { const inner = parseStatic(m[2]); return inner && inner.st === 'mod' ? { ...inner, per } : null; }
    return { st: 'mod', subj: { who: 'self' }, mods: mm[2] ? [[STAT[mm[3]], +mm[2]]] : [], kws: mm[1] ? [kwObj(mm[1])] : [], per, perKw: true };
  }
  if ((m = s.match(/^this character gains (Resist \+\d+) for each (.+)$/))) { const per = parseCounter(m[2]); return per && { st: 'mod', subj: { who: 'self' }, mods: [], kws: [kwObj(m[1])], per, perKw: true }; }
  if (/^damage counters can't be removed$/.test(s)) return { st: 'noHeal' };
  if ((m = s.match(/^damaged characters can't challenge (this character|your characters)$/))) return { st: 'protect', subj: m[1] === 'this character' ? { who: 'self' } : { who: 'own', f: {} }, attDamaged: true };
  if ((m = s.match(/^your locations can't be challenged by characters with cost (\d+) or less$/))) return { st: 'protect', subj: { who: 'ownLocations' }, maxCost: +m[1] };
  if ((m = s.match(/^(?:during your turn, )?this character can't be dealt damage(?: unless (?:he|she)'s being challenged)?$/))) return { st: 'noDamage', subj: { who: 'self' }, unlessChallenged: /unless/.test(s) };
  if ((m = s.match(/^your other ((?:[A-Z][\w'-]* )+)characters can't be dealt damage unless they're being challenged$/))) return { st: 'noDamage', subj: { who: 'own', f: { other: true, cls: [m[1].trim()] } }, unlessChallenged: true };
  if ((m = s.match(/^your characters with (\d+) \{S\} or more can't be dealt damage$/))) return { st: 'noDamage', subj: { who: 'own', f: { minStr: +m[1] } } };
  if (/^if an effect would cause you to discard one or more cards(?: from your hand)?, you don't discard$/.test(s)) return { st: 'noDiscard' };
  if (/^each turn, only one character can challenge$/.test(s)) return { st: 'oneChallenger' };
  if ((m = s.match(/^opponents need (\d+) lore to win the game$/))) return { st: 'loreToWin', n: +m[1] };
  if (/^opposing characters with Singer enter play with 1 damage$/.test(s)) return { st: 'oppEnterDamaged', kw: 'singer' };
  if (/^opposing characters with Rush enter play exerted$/.test(s)) return { st: 'oppEnterExerted', kw: 'rush', kind: 'character' };
  if (/^opposing items enter play exerted$/.test(s)) return { st: 'oppEnterExerted', kind: 'item' };
  if (/^opposing items can't ready at the start of their players' turns$/.test(s)) return { st: 'cant', subj: { who: 'oppItems' }, what: 'ready' };
  if (/^other characters can't exert to sing songs$/.test(s)) return { st: 'cant', subj: { who: 'all', f: { other: true } }, what: 'sing' };
  if (/^this character can't sing songs without Sing Together$/i.test(s)) return { st: 'soloSingBan' };
  if (/^this character can't gain Evasive$/.test(s)) return { st: 'noKw', subj: { who: 'self' }, kw: 'evasive' };
  if (/^all characters lose Rush and can't gain Rush$/.test(s)) return { st: 'noKw', subj: { who: 'all', f: {} }, kw: 'rush' };
  if ((m = s.match(/^this character can't quest or challenge unless (you pay 1 \{I\}|.+)$/))) {
    if (/pay/.test(m[1])) return { st: 'questTax', n: 1 };
    const c = parseCond(m[1]); return c && { st: 'cant', subj: { who: 'self' }, what: 'quest or challenge', unless: c };
  }
  if ((m = s.match(/^this character enters play exerted unless (.+)$/))) { const c = parseCond(m[1]); return c && { st: 'entersExerted', unless: c }; }
  if (/^each player pays (\d+) \{I\} more to play actions or items$/.test(s)) return { st: 'costMore', n: +s.match(/\d+/)[0], kinds: ['action', 'item'] };
  if (/^skip your turn's draw step$/i.test(s)) return { st: 'skipDraw' };
  if (/^(?:each opponent|each player) plays with the top card of their deck face ?up$/.test(s)) return { st: 'noop' };
  if (/^you may only have \d+ copies of .+ in your deck$/.test(s) || /^you can have other .+ characters in your deck regardless of ink type$/.test(s)) return { st: 'noop' };
  if (/^you (?:can|may play any character with) shift (?:any character )?on (?:top of )?this character(?: as if this character had any name)?$/i.test(s)) return { st: 'shiftName', name: '*' };
  if ((m = s.match(/^you pay (\d+) \{I\} less to shift a character on top of this character$/))) return { st: 'shiftOntoLess', n: +m[1] };
  if (/^opponents can't choose your items for abilities or effects$/.test(s)) return { st: 'itemWard' };
  if (/^opponents must choose this character for actions and abilities if able$/.test(s)) return { st: 'taunt' };
  if (/^if this character would be banished, put them into your inkwell facedown and exerted instead\.?$/.test(s)) return { st: 'banishToInk' };
  if ((m = s.match(/^(?:during your turn, )?(?:if (.+?), )?you (?:may|can) play this (?:character|item|card) for free(?: if (.+))?$/))) { const c = m[1] || m[2] ? parseCond(m[1] || m[2]) : { c: 'always' }; return c && { st: 'freeIf', cond: c, yourTurn: /^during your turn/.test(s) }; }
  if ((m = s.match(/^you may play items named (.+) for free$/))) return { st: 'costLess', n: 99, what: `items named ${m[1]}` };
  if ((m = s.match(/^if (.+?), you pay (\d+) \{I\} less to play this (?:item|location)$/))) { const c = parseCond(m[1]); return c && { st: 'costLess', n: +m[2], what: 'this character', cond: c }; }
  if (/^you pay 1 \{I\} less for the next character you play this turn$/.test(s)) return { st: 'firstCharLess', n: 1 };
  if ((m = s.match(/^your ((?:[A-Z][\w'-]* )+)characters can move here for free$/)) || (m = s.match(/^your (exerted) characters can move here for free$/))) return { st: 'freeMove', cls: m[1] === 'exerted' ? null : m[1].trim(), exerted: m[1] === 'exerted' };
  if (/^your locations and characters at locations gain Resist \+(\d+)$/.test(s)) return { st: 'grant', subj: { who: 'ownLocOrAtLoc' }, kws: [kwObj(s.match(/Resist \+\d+/)[0])] };
  if ((m = s.match(/^your characters at locations get ([+-]\d+) \{([SWL])\}$/))) return { st: 'mod', subj: { who: 'own', f: { atLoc: true } }, mods: [[STAT[m[2]], +m[1]]] };
  if ((m = s.match(/^your (other )?(?:(\w+) )?characters with (\d+) \{S\} or more get ([+-]\d+) \{([SWL])\}$/))) return { st: 'mod', subj: { who: 'own', f: { other: !!m[1], ink: m[2] || null, minStr: +m[3] } }, mods: [[STAT[m[5]], +m[4]]] };
  if ((m = s.match(/^your characters not named (.+) can't ready at the start of your turn$/))) return { st: 'cant', subj: { who: 'own', f: { notNamed: m[1] } }, what: 'ready' };
  if ((m = s.match(/^your other characters gain the (\w+) classification$/)) || (m = s.match(/^all opposing characters gain the (\w+) classification$/))) return { st: 'grantCls', subj: /opposing/.test(s) ? { who: 'opp' } : { who: 'own', f: { other: true } }, cls: m[1] };
  if ((m = s.match(/^your ((?:[A-Z][\w'-]* )+)characters that have a card under them gain (\w+) and (\w+)$/))) return { st: 'grant', subj: { who: 'own', f: { cls: [m[1].trim()], hasUnder: true } }, kws: [kwObj(m[2]), kwObj(m[3])] };
  if ((m = s.match(/^your ((?:[A-Z][\w'-]* )+)locations get ([+-]\d+) \{([SWL])\}$/))) return { st: 'mod', subj: { who: 'ownLocations', f: { nameHas: m[1].trim() } }, mods: [[STAT[m[3]], +m[2]]] };
  if ((m = s.match(/^opposing characters with cost (\d+) or less can't challenge$/))) return { st: 'cant', subj: { who: 'opp', f: { maxCost: +m[1] } }, what: 'challenge' };
  if ((m = s.match(/^each opposing character with cost (\d+) or less gets ([+-]\d+) \{([SWL])\}$/))) return { st: 'mod', subj: { who: 'opp', f: { maxCost: +m[1] } }, mods: [[STAT[m[3]], +m[2]]] };
  if ((m = s.match(/^(?:opposing|each opposing) damaged characters? (gains? .+|gets? .+)$/))) { const inner = parseStatic('opposing characters ' + m[1].replace(/^gain\b/, 'gain').replace(/^gets\b/, 'get')); return inner ? { ...inner, subj: { who: 'opp', f: { damaged: true } } } : null; }
  if ((m = s.match(/^(king and queen|(?:[A-Z][\w'-]* )+)characters can't quest$/i))) return { st: 'cant', subj: { who: 'all', f: { cls: m[1].trim().split(/ and /i).map(x => x.charAt(0).toUpperCase() + x.slice(1)) } }, what: 'quest' };
  if ((m = s.match(/^this character gets ([+-]\d+) \{([SWL])\}, ([+-]\d+) \{([SWL])\}, and ([+-]\d+) \{([SWL])\}$/))) return { st: 'mod', subj: { who: 'self' }, mods: [[STAT[m[2]], +m[1]], [STAT[m[4]], +m[3]], [STAT[m[6]], +m[5]]] };
  if ((m = s.match(/^the challenging character gets ([+-]\d+) \{S\}$/))) return { st: 'mod', subj: { who: 'challenger' }, mods: [['str', +m[1]]] };
  if ((m = s.match(/^opponents can't play actions(?: with cost (\d+) or more)?$/))) return { st: 'lockOpp', types: ['action'], minCost: m[1] ? +m[1] : 0 };
  if (/^cards enter opponents' inkwells exerted$/.test(s)) return { st: 'oppInkExerted' };
  if ((m = s.match(/^(?:they|those characters) get ([+-]\d+) \{([SWL])\} and ([+-]\d+) \{([SWL])\}$/))) return { st: 'mod', subj: { who: 'here', f: {} }, mods: [[STAT[m[2]], +m[1]], [STAT[m[4]], +m[3]]] };
  if ((m = s.match(/^all characters at that location get ([+-]\d+) \{([SWL])\} and gain (\w+)$/))) return { st: 'mod', subj: { who: 'sameLoc' }, mods: [[STAT[m[2]], +m[1]]], kws: [kwObj(m[3])] };
  if ((m = s.match(/^that character gains (Resist \+\d+)$/))) return { st: 'grant', subj: { who: 'own', f: { atLoc: true } }, kws: [kwObj(m[1])] };
  if ((m = s.match(/^your items gain (\w+)$/))) return { st: 'grant', subj: { who: 'ownItems' }, kws: [kwObj(m[1])] };
  // règles de construction de deck et options sans effet en combat
  if (/^you may have (?:up to \d+ copies of .+|any number of cards named .+) in your deck$/.test(s)) return { st: 'noop' };
  if (/^this character may enter play exerted$/.test(s)) return { st: 'noop' };
  if ((m = s.match(/^you can't play this character unless (.+)$/))) { const c = parseCond(m[1]); return c ? { st: 'playUnless', cond: c } : null; }
  if ((m = s.match(/^for each (.+?), you pay (\d+) \{I\} less to play this character$/))) {
    const per = parseCounter(m[1]); return per ? { st: 'costLess', n: +m[2], what: 'this character', per } : null;
  }
  if ((m = s.match(/^while one of your ((?:[A-Z][\w'-]* )+)characters is at a location, that character gains (Resist \+\d+)$/))) return { st: 'grant', subj: { who: 'own', f: { cls: [m[1].trim()], atLoc: true } }, kws: [kwObj(m[2])], cond: null };
  if ((m = s.match(/^while ([^,]+),\s*(.+)$/))) { cond = parseCond(m[1]); if (!cond) return null; s = lc(m[2]); }
  else if ((m = s.match(/^if ([^,]+),\s*(this character (?:can't|gets|gains) .+|(?:your|opposing) .+ (?:get|gain|can't) .+)$/))) { cond = parseCond(m[1]); if (!cond) return null; s = lc(m[2]); }
  if ((m = s.match(/^this character can't be challenged by ((?:[A-Z][\w'-]* )+)characters$/))) return { st: 'protect', subj: { who: 'self' }, cls: m[1].trim(), cond, yourTurn, oppTurn };
  if ((m = s.match(/^this character can't be challenged by characters with (\d+) \{S\} or (?:more|greater)$/))) return { st: 'protect', subj: { who: 'self' }, minStr: +m[1], cond, yourTurn, oppTurn };
  if ((m = s.match(/^(.+?) while (?:it's |it is )?here$/)) || (m = s.match(/^while here,\s*(.+)$/))) { s = lc(m[1]); cond = { c: 'here' }; }
  if ((m = s.match(/^characters named (.+?) (gets? .+|gains? .+)$/))) { s = `characters ${m[2]}`; cond = { ...(cond || { c: 'always' }), named: m[1] }; }
  const wrap = x => ({ ...x, cond, yourTurn, oppTurn });
  if ((m = s.match(new RegExp(String.raw`^${SUBJ} gains? "([^"]+)"$`)))) { const ab = parseAbility(m[2].replace(/\.$/, ''), 'Character'); return ab ? wrap({ st: 'grantAb', subj: subject(m[1]), ab: { ...ab, text: m[2], label: null } }) : null; }
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
  if ((m = s.match(new RegExp(String.raw`^${SUBJ} can't (quest|challenge)$`)))) return wrap({ st: 'cant', subj: subject(m[1]), what: m[2] });
  if (/^this character can't move to locations$/.test(s)) return wrap({ st: 'cant', subj: { who: 'self' }, what: 'move' });
  if (/^you can't lose lore$/.test(s)) return wrap({ st: 'noLoreLoss' });
  if (/^opposing characters can't ready at the start of their turn$/.test(s)) return wrap({ st: 'cant', subj: { who: 'opp' }, what: 'ready' });
  if ((m = s.match(new RegExp(String.raw`^${SUBJ} can't be challenged$`)))) return wrap({ st: 'cant', subj: subject(m[1]), what: 'be challenged' });
  if ((m = s.match(/^characters with cost (\d+) or less can't challenge (this character|your characters)$/)))
    return wrap({ st: 'protect', subj: m[2] === 'this character' ? { who: 'self' } : { who: 'own', f: {} }, maxCost: +m[1] });
  if ((m = s.match(/^this character can challenge ready (damaged |(?:[A-Z][\w'-]* )+)characters$/))) return wrap({ st: 'challengeReadyIf', damaged: m[1] === 'damaged ', cls: m[1] === 'damaged ' ? null : m[1].trim() });
  if (/^this character can quest the turn (?:he|she|it|they)(?:'s| is| are) played$/.test(s)) return wrap({ st: 'questFresh' });
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
  [/^whenever they draw a card while this character is exerted$/, () => [{ on: 'drew', side: 'opp', srcExerted: true }]],
  [/^whenever one of your characters with Reckless challenges another character$/, () => [{ on: 'challenge', any: true, kw: 'reckless' }]],
  [/^when this card is put into your discard from your deck$/, () => [{ on: 'milledSelf' }]],
  [/^when you discard this card$/, () => [{ on: 'discardedSelf' }]],
  [/^the first time a ((?:[A-Z][\w'-]* )+)character moves here each turn$/, m => [{ on: 'moveHere', cls: m[1].trim() }]],
  [/^when(?:ever)? an opponent plays a (character|song|action|item)$/, m => [{ on: 'oppPlay', type: m[1] }]],
  [/^when this character quests$/, () => [{ on: 'quest' }]],
  [/^when you move a character here from a location$/, () => [{ on: 'moveHere', fromLoc: true }]],
  [/^when(?:ever)? you put a card into your inkwell$/, () => [{ on: 'inked' }]],
  [/^when you shift this character$/, () => [{ on: 'play', shifted: true }]],
  [/^when you play a ((?:[A-Z][\w'-]* )+)character on this card$/, () => [{ on: 'shiftedOnto' }]],
  [/^when you play this character and whenever he banishes another character in a challenge during your turn$/, () => [{ on: 'play' }, { on: 'banishInChallenge', yourTurnOnly: true }]],
  [/^whenever a ((?:[A-Z][\w'-]* )+)character is banished$/, m => [{ on: 'anyBanished', cls: m[1].trim() }]],
  [/^whenever a ((?:[A-Z][\w'-]* )+)character quests while here$/, m => [{ on: 'questHere', cls: m[1].trim() }]],
  [/^whenever a character of yours is challenged while this character is exerted$/, () => [{ on: 'allyChallenged', srcExerted: true }]],
  [/^whenever a character with (\d+) \{S\} or more challenges another character while here$/, m => [{ on: 'challenge', here: true, minStr: +m[1] }]],
  [/^whenever a damaged character challenges another character$/, () => [{ on: 'challenge', anySide: true, attDamaged: true }]],
  [/^whenever another character is played$/, () => [{ on: 'youPlay', type: 'character', anySide: true }, { on: 'oppPlay', type: 'character' }]],
  [/^whenever another character of yours enters play exerted$/, () => [{ on: 'youPlay', type: 'character', entersExerted: true }]],
  [/^whenever one of your (other )?((?:[A-Z][\w'-]* )+)characters banishes another character in a challenge$/, m => [{ on: 'banishInChallenge', any: true, other: !!m[1], cls: m[2].trim() }]],
  [/^whenever one of your ((?:[A-Z][\w'-]* )+)characters is challenged$/, m => [{ on: 'allyChallenged', cls: m[1].trim() }]],
  [/^whenever one of your ((?:[A-Z][\w'-]* )+)characters challenges a damaged character$/, m => [{ on: 'challenge', any: true, cls: m[1].trim(), defDamaged: true }]],
  [/^whenever one of your ((?:[A-Z][\w'-]* )*)characters quests while at a location$/, m => [{ on: 'anyQuest', cls: m[1].trim() || null, atLocation: true }]],
  [/^whenever one of your characters with (\d+) \{S\} or more quests$/, m => [{ on: 'anyQuest', minStr: +m[1] }]],
  [/^whenever one of your (other )?characters is returned to your hand from play$/, m => [{ on: 'returned', other: !!m[1], side: 'own' }]],
  [/^whenever one of your opponents' characters, items, or locations is returned to their hand from play$/, () => [{ on: 'returned', side: 'opp' }]],
  [/^whenever this character quests and whenever he sings a song for the first time each turn$/, () => [{ on: 'quest' }, { on: 'sing' }]],
  [/^whenever this character quests while (?:he|she) has (\d+) \{S\} or more$/, m => [{ on: 'quest', minStrSelf: +m[1] }]],
  [/^whenever this character sings a song with Sing Together$/i, () => [{ on: 'sing', together: true }]],
  [/^whenever you discard (?:a|1 or more) (character )?cards?$/, m => [{ on: 'discarded', side: 'own', type: m[1] ? 'character' : null }]],
  [/^whenever your opponent discards 1 or more cards$/, () => [{ on: 'discarded', side: 'opp' }]],
  [/^whenever you pay (\d+) \{I\} or less to play a (card|character|non-character)$/, m => [{ on: 'youPlay', type: m[2] === 'character' ? 'character' : 'any', notChar: m[2] === 'non-character', maxPaid: +m[1] }]],
  [/^whenever you play this or another (item|character|location)$/, m => [{ on: 'play' }, { on: 'youPlay', type: m[1] }]],
  [/^whenever you put 1 or more cards into your discard from your deck$/, () => [{ on: 'milled' }]],
  [/^whenever you remove an ink drop$/, () => [{ on: 'dropUsed' }]],
  [/^whenever you return a ((?:[A-Z][\w'-]* )*)character card from your discard to your hand$/, m => [{ on: 'recurred', cls: m[1].trim() || null }]],
  [/^whenever you use the Boost ability of a character$/, () => [{ on: 'boosted' }]],
  [/^whenever a card leaves your discard$/, () => [{ on: 'leftDiscard' }]],
  [/^whenever an opponent chooses this character for an action or ability$/, () => [{ on: 'chosenByOpp' }]],
  [/^whenever an opponent draws a card during their turn$/, () => [{ on: 'drew', side: 'opp' }]],
  [/^whenever they draw a card$/, () => [{ on: 'drew', side: 'opp' }]],
  [/^whenever one of your actions deals damage to an opposing character$/, () => [{ on: 'actionDamage' }]],
  [/^whenever one of your characters is chosen for Support$/, () => [{ on: 'supportChosen' }]],
  [/^whenever one of your characters or locations with a card under them is challenged$/, () => [{ on: 'allyChallenged', hasUnder: true }]],
  [/^whenever one of your ((?:[A-Z][\w'-]* )+)characters takes damage$/, m => [{ on: 'damaged', side: 'own', cls: m[1].trim() }]],
  [/^whenever an opposing character challenges$/, () => [{ on: 'challenge', side: 'opp' }]],
  [/^whenever a location is challenged and banished$/, () => [{ on: 'anyBanished', kind: 'location', inChallenge: true }]],
  [/^whenever one of your other characters quests$/, () => [{ on: 'anyQuest', other: true }]],
  [/^whenever one or more of your characters sings? a song$/, () => [{ on: 'sing', any: true }]],
  [/^whenever this character becomes exerted$/, () => [{ on: 'exerts' }]],
  [/^whenever an opposing character (?:is|becomes) exerted$/, () => [{ on: 'exerts', side: 'opp' }]],
  [/^whenever this character challenges another character with (\d+) \{S\} or less$/, m => [{ on: 'challenge', defMaxStr: +m[1] }]],
  [/^whenever an opposing ((?:[A-Z][\w'-]* )+)character is banished$/, m => [{ on: 'anyBanished', side: 'opp', cls: m[1].trim() }]],
  [/^whenever a character here challenges another character$/, () => [{ on: 'challenge', here: true }]],
  [/^whenever you put a card into your inkwell$/, () => [{ on: 'inked' }]],
  [/^whenever you put a card under one of your other characters$/, () => [{ on: 'putUnder', any: true, other: true }]],
  [/^whenever this character challenges a character with (\d+) \{S\} or less$/, m => [{ on: 'challenge', defMaxStr: +m[1] }]],
  [/^whenever a character with cost (\d+) or less is banished$/, m => [{ on: 'anyBanished', maxCost: +m[1] }]],
  [/^whenever you play an action while this character is exerted$/, () => [{ on: 'youPlay', type: 'action', srcExerted: true }]],
  [/^whenever you play a character or location with Boost$/, () => [{ on: 'youPlay', type: 'any', kw: 'boost' }]],
  [/^whenever you play a (second|third) action(?: in a turn)?$/, m => [{ on: 'youPlay', type: 'action', nth: m[1] === 'second' ? 2 : 3 }]],
  [/^whenever this character or one of your characters named (.+) challenges another character$/, m => [{ on: 'challenge', any: true, named: m[1], orSelf: true }]],
  [/^whenever you put a card under (this character|one of your characters or locations)$/, m => [{ on: 'putUnder', any: m[1] !== 'this character' }]],
  [/^whenever one of your (other )?characters sings a song$/, m => [{ on: 'sing', any: true, other: !!m[1] }]],
  [/^whenever one of your characters banishes another character in a challenge$/, () => [{ on: 'banishInChallenge', any: true }]],
  [/^whenever one of your characters challenges a damaged character$/, () => [{ on: 'challenge', any: true, defDamaged: true }]],
  [/^whenever this character exerts$/, () => [{ on: 'exerts' }]],
  [/^whenever you move a character(?: with (\d+) \{S\} or more)? here$/, m => [{ on: 'moveHere', minStr: m[1] ? +m[1] : null }]],
  [/^whenever a character is challenged while here$/, () => [{ on: 'challengedHere' }]],
  [/^whenever a character banishes another character in a challenge while here$/, () => [{ on: 'banishInChallenge', here: true }]],
  [/^at the end of each (opponent's|player's) turn$/, m => [{ on: 'endTurn', side: m[1] === "player's" ? 'any' : 'opp' }]],
  [/^when you play this character and whenever you play a (character|location|item|action|song)$/, m => [{ on: 'play' }, { on: 'youPlay', type: m[1] }]],
  [/^whenever one of your (other )?((?:[A-Z][\w'-]* )*)characters is challenged and banished$/, m => [{ on: 'allyBanished', other: !!m[1], cls: m[2]?.trim() || null, inChallenge: true }]],
  [/^when you shift a character on top of (?:her|him|this character)$/, () => [{ on: 'shiftedOnto' }]],
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
    // Remember Me : jouer des personnages depuis la défausse, un seul exemplaire de chaque nom
    if (/^for the rest of this turn, you may play characters from your discard\. if you do, they enter play exerted and you can't play characters with the same name as characters you played this way this turn\.?$/i.test(s)) return { kind: 'action', effects: [{ k: 'playFromDiscardTurn', nameLock: true }] };
    const fx = parseBody(s);
    return fx ? { kind: 'action', effects: fx.length ? fx : [{ k: 'noop' }] } : null;
  }
  // Jack-Jack : « If its card type is: • character … • action or item … • location … »
  if (/^at the start of your turn, you may put the top card of your deck into your discard\. if its card type is:/i.test(s)) return { kind: 'triggered', ons: [{ on: 'startTurn' }], effects: [{ k: 'jackjack', opt: true }] };
  // « While you have 3 or more characters here, you may banish this location to play a character from your discard for free. »
  if ((m = s.match(/^while ([^,]+), you may banish this location to (play a character from your discard for free)\.?$/))) { const c = parseCond(m[1]); return c && { kind: 'activated', cost: { ink: 0, banish: true }, cond: c, effects: [{ k: 'playFree', type: 'character', max: 99, fromDiscard: true }] }; }
  // « If you have a character named Maui in play, you may use this item's Shapeshift ability for free. »
  if ((m = s.match(/^if ([^,]+), you may use this item's (\w+) ability for free\.?$/))) { const c = parseCond(m[1]); return c && { kind: 'static', st: 'freeAbility', label: m[2].toUpperCase(), cond: c }; }
  // Tod : « Twice during your turn, whenever this character is chosen for an action or an item's ability, you may ready him. »
  if (/^twice during your turn, whenever this character is chosen for an action or an item's ability, you may ready (?:him|her)\.?$/.test(s)) return { kind: 'triggered', ons: [{ on: 'chosenByCard' }], effects: [{ k: 'ready', t: { sel: 'self' }, opt: true }], yourTurn: true, twice: true };
  // Baymax : « If you would get an ink drop, you may put the top card of your deck into your inkwell facedown and exerted instead. »
  if (/^if you would get an ink drop, you may put the top card of your deck into your inkwell facedown and exerted instead\.?$/i.test(s)) return { kind: 'static', st: 'dropToRamp' };
  // Les cœurs vaillants : « Remember Me » / Roi Cornu : jouer des personnages depuis la défausse
  if ((m = s.match(/^while ([^,]+), you may play characters from your discard\. if you do, they enter play exerted\.?(?: \(you pay all costs\.\))?$/i))) { const c = parseCond(m[1]); return c && { kind: 'static', st: 'playFromDiscard', cond: c }; }
  // Sugar Rush Speedway : « Once per turn, you may {E} chosen character here and deal them 1 damage to move them to another location for free. »
  if (/^once per turn, you may \{E\} chosen character here and deal them (\d+) damage to move them to another location for free\.?$/i.test(s)) { const n = +s.match(/deal them (\d+)/)[1]; return { kind: 'activated', cost: { ink: 0 }, once: true, effects: [{ k: 'speedway', n }] }; }
  // « The first time a Floodborn character moves here each turn, … » : déclencheur une fois par tour
  if ((m = s.match(/^(?:during your turn, )?the first time (a ((?:[A-Z][\w'-]* )+)character moves here each turn|you move a character here), (.+)$/))) {
    const fx = parseBody(m[3]);
    return fx && fx.length ? { kind: 'triggered', ons: [{ on: 'moveHere', cls: m[2]?.trim() || null }], effects: fx, once: true, yourTurn: /^during your turn/.test(s) } : null;
  }
  if (/^whenever one of your other characters would be dealt damage, put that many damage counters on this character instead\.?$/.test(s)) return { kind: 'static', st: 'redirectDamage' };
  // Capacité activée : « {E}, 2 {I}, Banish this item - effet »
  const COST = String.raw`(?:\{E\} one of your (?:[A-Z][\w'-]* )?(?:characters|items)|[Rr]eveal 2 cards with the same name in your hand|\{E\}|\d+ \{I\}|\{I\}|[Bb]anish (?:one of your (?:other )?characters|chosen character of yours|\d+ of your items)|[Dd]eal \d+ damage to this character|[Cc]hoose and discard a character card|[Bb]anish this (?:item|character)|[Bb]anish one of your (?:other )?items|[Cc]hoose and discard (?:a|an) (?:\w+ )?card|[Dd]iscard a card)`;
  if ((m = s.match(new RegExp(String.raw`^(${COST}(?:,\s*${COST})*)\s*-\s*(.+)$`)))) {
    const cost = { exert: /\{E\}(?!\s*one)/.test(m[1]), ink: +(m[1].match(/(\d+) \{I\}/)?.[1] || (/\{I\}/.test(m[1]) ? 1 : 0)), banish: /anish this/.test(m[1]),
      banishItem: /anish one of your (?:other )?items/.test(m[1]) ? 1 : +(m[1].match(/anish (\d+) of your items/)?.[1] || 0), discard: /iscard/.test(m[1]),
      exertOther: /\{E\} one of your items/.test(m[1]) ? 'item' : /\{E\} one of your (?:[A-Z][\w'-]* )?characters/.test(m[1]) ? 'character' : null, exertCls: m[1].match(/\{E\} one of your ([A-Z][\w'-]*) characters/)?.[1] || null,
      discardChar: /[Cc]hoose and discard a character card/.test(m[1]), revealPair: /[Rr]eveal 2 cards with the same name/.test(m[1]),
      banishChar: /anish (?:one of your (?:other )?characters|chosen character of yours)/.test(m[1]), selfDamage: +(m[1].match(/eal (\d+) damage to this character/)?.[1] || 0) };
    const fx = parseBody(m[2]);
    return fx ? { kind: 'activated', cost, effects: fx.length ? fx : [{ k: 'noop' }] } : null;
  }
  // « Once during your turn, … » / « During your turn, whenever … »
  let once = false, yourTurn = false;
  if ((m = s.match(/^once (?:during your turn|per turn|per your turn),\s*(.+)$/))) { once = true; s = lc(m[1]); }
  if ((m = s.match(/^during your turn,\s*((?:while [^,]+,\s*)?when(?:ever)? .+)$/))) { yourTurn = true; s = m[1]; }
  let oppTurn = false, abCond = null;
  if ((m = s.match(/^during (?:an opponent's turn|opponents' turns|each opponent's turn),\s*((?:while [^,]+,\s*)?when(?:ever)? .+)$/))) { oppTurn = true; s = m[1]; }
  if ((m = s.match(/^while ([^,]+),\s*(when(?:ever)? .+)$/))) { abCond = parseCond(m[1]); if (!abCond) return null; s = m[2]; }
  if (/^(?:when|whenever|at the (?:start|end) of)/.test(s)) {
    for (let k = s.indexOf(','); k > 0; k = s.indexOf(',', k + 1)) {
      const head = s.slice(0, k), tail = s.slice(k + 1).trim();
      if (TRIGGERS.some(([re]) => re.test(head))) { m = [s, head, tail]; break; }
    }
  }
  if (m && /^(?:when|whenever|at the (?:start|end) of)/.test(m[1] || '') || (m = s.match(/^((?:when|whenever|at the (?:start|end) of)[^,]+),\s*(.+)$/))) {
    const trig = TRIGGERS.find(([re]) => re.test(m[1]));
    if (!trig) return null;
    const ons = trig[1](m[1].match(trig[0]));
    const fx = parseBody(m[2]);
    return fx ? { kind: 'triggered', ons, effects: fx.length ? fx : [{ k: 'noop' }], once, yourTurn, oppTurn, abCond } : null;
  }
  if ((m = s.match(/^this character may enter play exerted to (.+)$/))) {
    const fx = parseBody(m[1]);
    return fx && fx.length ? { kind: 'triggered', ons: [{ on: 'play' }], effects: [{ k: 'exert', t: { sel: 'self' }, opt: true }, ...fx.map(e => ({ ...e, ifDo: true }))], once, yourTurn } : null;
  }
  if (once && !/^(when|whenever|at the)/.test(s)) {
    const fx = parseBody(s);
    if (fx && fx.length) return { kind: 'activated', cost: { ink: 0 }, once: true, effects: fx.map((e, i) => (i === 0 && e.opt ? { ...e, opt: false } : e)) };
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
    if (/^Adventurous\b/.test(line)) { keywords.adventurous = true; continue; }
    if (/^(Evasive|Rush|Ward|Bodyguard|Reckless|Support|Vanish|Alert)\b/.test(line) && !/\b(When|Whenever)\b/.test(line.split('(')[0])) {
      for (const k of KW) if (new RegExp(`^${k}\\b`).test(line)) keywords[k.toLowerCase()] = true;
      continue;
    }
    if ((m = line.match(/^Shift Remove (\d+) ink drops/))) { keywords.shiftDrops = +m[1]; continue; }
    if (/^(?:[A-Z][\w'-]* )*Shift:/.test(line)) continue; // Alter avec un coût autre que de l'encre : ignoré
    const clean = line.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    if (!clean) continue; // ligne de rappel seule (ex. chanson)
    if (cardType === 'Action') {
      // « During your turn, when you discard this card, you may play it from your discard. » à la fin du texte d'une action
      { const k = clean.search(/During your turn, when you discard this card, you may play it from your discard\.?/);
        if (k > 0) {
          abilities.push({ kind: 'triggered', ons: [{ on: 'discardedSelf' }], effects: [{ k: 'playSelfDiscard', free: false }], yourTurn: true, label: null, text: line });
          const ab = parseAbility(clean.slice(0, k).trim(), 'Action');
          if (ab) abilities.push({ ...ab, label: null, text: line }); else unhandled.push(line);
          continue;
        } }
      const cl = lc(clean.replace(/[.]$/, ''));
      if ((m = cl.match(/^you can't play this action unless (.+)$/)) && parseCond(m[1])) { abilities.push({ kind: 'static', st: 'playUnless', cond: parseCond(m[1]), label: null, text: line }); continue; }
      if (/^during your turn, when you discard this card, you may play it from your discard$/.test(cl)) { abilities.push({ kind: 'triggered', ons: [{ on: 'discardedSelf' }], effects: [{ k: 'playSelfDiscard', free: false }], yourTurn: true, label: null, text: line }); continue; }
      if ((m = cl.match(/^for each (.+?), you pay (\d+) \{I\} less to play this action$/)) && parseCounter(m[1])) { abilities.push({ kind: 'static', st: 'costLess', n: +m[2], what: 'this character', per: parseCounter(m[1]), label: null, text: line }); continue; }
      if ((m = cl.match(/^if (.+?), you pay (\d+) \{I\} less to play this action$/)) && parseCond(m[1])) { abilities.push({ kind: 'static', st: 'costLess', n: +m[2], what: 'this character', cond: parseCond(m[1]), label: null, text: line }); continue; }
      if ((m = clean.match(/^Sing Together (\d+)\s*/))) keywords.singTogether = +m[1];
      if (!clean.replace(/^Sing Together \d+\s*/, '')) continue;
      const ab = parseAbility(clean.replace(/^Sing Together \d+\s*/, ''), 'Action');
      if (ab) abilities.push({ ...ab, label: null, text: line }); else unhandled.push(line);
      continue;
    }
    // nom de la capacité en majuscules
    const toks = clean.split(' ');
    let i = 0;
    if (/^[\d,]{4,}$/.test(toks[0]) && /^[A-Z]{2,}/.test(toks[1] || '')) i = 1;
  while (i < toks.length - 1 && (/[A-Z]/.test(toks[i]) || toks[i] === '&') && toks[i] === toks[i].toUpperCase() && !/^\{|^\d/.test(toks[i])) i++;
    const label = toks.slice(0, i).join(' ').replace(/,$/, '');
    const ab = parseAbility(toks.slice(i).join(' '), cardType);
    if (ab) abilities.push({ ...ab, label: label || null, text: line }); else unhandled.push(line);
  }
  // une action en plusieurs paragraphes = une seule capacité
  if (cardType === 'Action' && abilities.filter(a => a.kind === 'action').length > 1) {
    const st = abilities.filter(a => a.kind !== 'action');
    abilities.splice(0, abilities.length, { kind: 'action', effects: abilities.filter(a => a.kind === 'action').flatMap(a => a.effects), label: null }, ...st);
  }
  return { keywords, abilities, unhandled };
}
