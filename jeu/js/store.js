// Sauvegarde locale (navigateur) et règles de l'économie : remplace l'ancien serveur.
// La partie est enregistrée dans le localStorage du navigateur ; Réglages permet de l'exporter / importer.
import { buildDeck, validateDeck, RULES } from './engine.js';

const KEY = 'lorcana-pocket-sauvegarde';
export const ECO = {
  BOOSTER_PRICE: 100, FREE_PACK_HOURS: 6, FREE_PACK_MAX: 2, START_COINS: 200,
  WIN_REWARD: { easy: 50, normal: 80, hard: 130 }, LOSS_REWARD: 20,
  // Prix d'achat d'une carte à l'unité : prix du marché (1 $ = 20 pièces, un booster à 100 pièces valant environ 5 $),
  // avec un minimum selon la rareté ; sans prix connu, le prix de base de la rareté. Revente : 20 % du prix d'achat.
  PRICE_MIN: { Common: 10, Uncommon: 20, Rare: 40, Super_rare: 80, Legendary: 200, Epic: 400, Enchanted: 1000, Iconic: 2500, Promo: 100 },
  USD_TO_COINS: 20, PRICE_MAX: 5000, SELL_RATIO: 0.2,
  // Taux de tirage (en %) d'après les estimations de la communauté (Ravensburger ne publie pas de chiffres officiels) :
  // Légendaire ≈ 1 booster sur 4, Épique ≈ 1 par boîte de 24, Enchantée ≈ 1 booster sur 50, Iconique ≈ 1 sur 200.
  // Les deux emplacements « rare ou mieux » (cartes non foil) :
  RARE_SLOT: { Rare: 55, Super_rare: 32, Legendary: 13 },
  // L'emplacement foil : toutes raretés ; Épiques, Enchantées et Iconiques ne sortent que là.
  FOIL_SLOT: { Common: 44, Uncommon: 25, Rare: 15, Super_rare: 7, Legendary: 2.5, Epic: 4, Enchanted: 2, Iconic: 0.5 },
};
export const MYSTERY = 'mystere';

/** Prix en pièces d'une carte (achat à l'unité). */
export function cardPrice(c) {
  const min = ECO.PRICE_MIN[c.rarity] || 20;
  const market = c.usd ? Math.round(c.usd * ECO.USD_TO_COINS / 5) * 5 : 0;
  return Math.min(ECO.PRICE_MAX, Math.max(min, market));
}
export const sellPrice = c => Math.max(1, Math.round(cardPrice(c) * ECO.SELL_RATIO));
const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Super_rare', 'Legendary', 'Epic', 'Enchanted', 'Iconic'];
export const STARTERS = [['Amber', 'Amethyst'], ['Ruby', 'Sapphire'], ['Emerald', 'Steel']];

let cards = [], byId = new Map(), boosterSets = [];
export function initStore(allCards, sets) {
  cards = allCards; byId = new Map(cards.map(c => [c.id, c])); index = null;
  boosterSets = sets.filter(s => /^\d+$/.test(s.code)).map(s => s.code);
}

const fresh = () => ({ version: 2, name: 'Illumineur', coins: ECO.START_COINS, freePacks: ECO.FREE_PACK_MAX, freePacksAt: Date.now(),
  starter: null, wins: 0, losses: 0, collection: {}, decks: [], nextDeckId: 1, openings: 0, lang: 'fr', createdAt: Date.now() });

let save = null;
function load() {
  if (save) return save;
  try { save = JSON.parse(localStorage.getItem(KEY)) || null; } catch { save = null; }
  if (!save || typeof save !== 'object') save = fresh();
  const old = save.version || 1;
  save = { ...fresh(), ...save };
  if (old < 2) migrateTo60();
  return save;
}
// Passage aux règles officielles (60 cartes, 4 exemplaires) : le deck de départ devient un vrai deck
// de départ de 60 cartes (4 exemplaires de chaque carte, ajoutés à la collection) ; les autres decks restent à compléter.
function migrateTo60() {
  const p = save;
  const starter = p.decks.find(d => d.name.startsWith('Départ'));
  if (starter && starter.cards.length < RULES.DECK_SIZE) {
    const extra = [...starter.cards];
    for (const id of extra) { const q = p.collection[id] || [0, 0]; q[0]++; p.collection[id] = q; }
    starter.cards = [...starter.cards, ...extra];
  }
  p.version = 2;
  p.notice = 'Nouvelles règles : les decks font maintenant 60 cartes minimum, avec 4 exemplaires maximum par carte, comme dans le vrai jeu. '
    + (starter ? 'Ton deck de départ a été complété (4 exemplaires de chaque carte, ajoutés à ta collection). ' : '')
    + 'Tes autres decks sont à compléter : ouvre-les et touche « Compléter avec mes cartes ».';
  persist();
}

function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { console.warn('Sauvegarde impossible', e); } }

export const getLang = () => load().lang;

function refillFree() {
  const p = load(), period = ECO.FREE_PACK_HOURS * 3600e3;
  if (p.freePacks >= ECO.FREE_PACK_MAX) return;
  const gained = Math.floor((Date.now() - p.freePacksAt) / period);
  if (gained > 0) {
    p.freePacks = Math.min(ECO.FREE_PACK_MAX, p.freePacks + gained);
    p.freePacksAt = p.freePacks >= ECO.FREE_PACK_MAX ? Date.now() : p.freePacksAt + gained * period;
    persist();
  }
}

function profile() {
  refillFree();
  const p = load();
  return { name: p.name, coins: p.coins, freePacks: p.freePacks, nextFreePack: p.freePacks < ECO.FREE_PACK_MAX ? p.freePacksAt + ECO.FREE_PACK_HOURS * 3600e3 : null,
    starter: p.starter, wins: p.wins, losses: p.losses, lang: p.lang, collection: p.collection, notice: p.notice || null,
    decks: p.decks.map(d => ({ ...d, cards: [...d.cards] })), rules: { ...RULES, ...ECO }, starters: STARTERS };
}

function addCard(id, foil) {
  const c = load().collection;
  const q = c[id] || [0, 0];
  q[foil ? 1 : 0]++;
  c[id] = q;
}

function saveDeck(id, name, ids) {
  const p = load();
  let d = id && p.decks.find(x => x.id === id);
  if (id && !d) throw new Error('Deck introuvable');
  if (!d) { d = { id: p.nextDeckId++, name, cards: [] }; p.decks.push(d); }
  d.name = name; d.cards = [...ids];
  persist();
  return d.id;
}

const pick = list => list[Math.floor(Math.random() * list.length)];
function pickWeighted(keys, w) {
  const total = keys.reduce((n, k) => n + w[k], 0);
  let r = Math.random() * total;
  for (const k of keys) { r -= w[k]; if (r <= 0) return k; }
  return keys[keys.length - 1];
}

// Index set -> rareté -> cartes (hors promos)
let index = null;
function setIndex() {
  if (index) return index;
  index = {};
  for (const c of cards) if (c.rarity !== 'Promo' && boosterSets.includes(c.set_code)) ((index[c.set_code] ||= {})[c.rarity] ||= []).push(c);
  return index;
}

/**
 * Booster comme les vrais : 6 communes, 3 peu communes, 2 « rare ou mieux », 1 foil (toutes raretés).
 * set = code d'une extension, ou MYSTERY : chaque carte vient alors d'une extension tirée au hasard.
 */
function openBooster(set) {
  const idx = setIndex();
  const sets = set === MYSTERY ? boosterSets : [set];
  const has = r => sets.some(s => idx[s]?.[r]?.length);
  const draw = r => { const from = sets.filter(s => idx[s]?.[r]?.length); const s = pick(from); return pick(idx[s][r]); };
  const weighted = w => pickWeighted(Object.keys(w).filter(has), w);
  const out = [];
  for (let i = 0; i < 6; i++) out.push({ c: draw('Common'), foil: false });
  for (let i = 0; i < 3; i++) out.push({ c: draw('Uncommon'), foil: false });
  const rares = [weighted(ECO.RARE_SLOT), weighted(ECO.RARE_SLOT)].sort((a, b) => RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(b));
  for (const r of rares) out.push({ c: draw(r), foil: false });
  out.push({ c: draw(weighted(ECO.FOIL_SLOT)), foil: true });  // révélée en dernier
  return out.filter(x => x.c).map(x => ({ id: x.c.id, foil: x.foil }));
}

// Mêmes « routes » que l'ancien serveur, pour que l'interface n'ait pas à changer
const routes = {
  '/api/profile': () => profile(),

  '/api/starter': ({ index }) => {
    const p = load();
    if (p.starter) throw new Error('Deck de départ déjà choisi');
    const inks = STARTERS[index]; if (!inks) throw new Error('Choix invalide');
    const pool = cards.filter(c => c.set_code === '1' && ['Common', 'Uncommon', 'Rare'].includes(c.rarity));
    const ids = buildDeck(pool, inks);
    for (const id of ids) addCard(id, false);
    p.starter = inks.join('/');
    saveDeck(null, `Départ ${inks.join(' / ')}`, ids);
    return profile();
  },

  '/api/booster': ({ set, free }) => {
    refillFree();
    const p = load();
    if (set !== MYSTERY && !boosterSets.includes(String(set))) throw new Error('Set inconnu');
    if (free) { if (p.freePacks < 1) throw new Error('Aucun booster gratuit disponible'); }
    else if (p.coins < ECO.BOOSTER_PRICE) throw new Error('Pas assez de pièces');
    const pulled = openBooster(set === MYSTERY ? MYSTERY : String(set));
    if (free) { if (p.freePacks >= ECO.FREE_PACK_MAX) p.freePacksAt = Date.now(); p.freePacks--; }
    else p.coins -= ECO.BOOSTER_PRICE;
    const result = pulled.map(c => { const isNew = !p.collection[c.id]; addCard(c.id, c.foil); return { ...c, isNew }; });
    p.openings++;
    persist();
    return { cards: result, profile: profile() };
  },

  '/api/deck': ({ id, name, cards: ids }) => {
    if (!Array.isArray(ids)) throw new Error('Deck invalide');
    const rows = ids.map(c => byId.get(c)).filter(Boolean);
    const owned = {};
    for (const [cid, [q, f]] of Object.entries(load().collection)) { const fn = byId.get(cid)?.full_name; if (fn) owned[fn] = (owned[fn] || 0) + q + f; }
    const need = {}; for (const r of rows) need[r.full_name] = (need[r.full_name] || 0) + 1;
    const missing = Object.entries(need).filter(([fn, n]) => (owned[fn] || 0) < n).map(([fn]) => fn);
    if (missing.length) throw new Error(`Cartes non possédées : ${missing.join(', ')}`);
    const errs = validateDeck(rows).filter(e => !e.startsWith('Le deck doit contenir'));
    if (errs.length) throw new Error(errs.join(' '));
    const deckId = saveDeck(id || null, String(name || 'Mon deck').slice(0, 40), rows.map(r => r.id));
    return { id: deckId, profile: profile() };
  },

  '/api/deck/delete': ({ id }) => {
    const p = load(); p.decks = p.decks.filter(d => d.id !== id); persist();
    return profile();
  },

  '/api/battle': ({ won, difficulty }) => {
    const p = load();
    const reward = won ? (ECO.WIN_REWARD[difficulty] ?? ECO.WIN_REWARD.easy) : ECO.LOSS_REWARD;
    p.coins += reward; won ? p.wins++ : p.losses++;
    persist();
    return { reward, profile: profile() };
  },

  '/api/recycle': () => {
    const p = load();
    let coins = 0, count = 0;
    for (const [id, q] of Object.entries(p.collection)) if (q[0] > RULES.MAX_COPIES) {
      const extra = q[0] - RULES.MAX_COPIES;
      coins += extra * (byId.get(id) ? sellPrice(byId.get(id)) : 2); count += extra;
      q[0] = RULES.MAX_COPIES;
    }
    p.coins += coins; persist();
    return { coins, count, profile: profile() };
  },

  '/api/buy': ({ id }) => {
    const p = load(), c = byId.get(id);
    if (!c || !boosterSets.includes(c.set_code) && c.rarity === 'Promo') throw new Error('Carte introuvable');
    const price = cardPrice(c);
    if (p.coins < price) throw new Error(`Pas assez de pièces : il en faut ${price}`);
    p.coins -= price; addCard(id, false); persist();
    return { price, profile: profile() };
  },

  '/api/settings': ({ name, lang }) => {
    const p = load();
    if (name != null) { const n = String(name).trim().slice(0, 24); if (!n) throw new Error('Nom vide'); p.name = n; }
    if (lang) p.lang = lang === 'en' ? 'en' : 'fr';
    persist();
    return profile();
  },

  '/api/export': () => ({ file: JSON.stringify({ jeu: 'Lorcana Pocket', exportedAt: new Date().toISOString(), save: load() }, null, 1) }),

  '/api/import': ({ text }) => {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Fichier illisible'); }
    const s = data?.save;
    if (data?.jeu !== 'Lorcana Pocket' || !s || typeof s.collection !== 'object' || !Array.isArray(s.decks)) throw new Error('Ce fichier n\'est pas une sauvegarde Lorcana Pocket');
    save = { ...fresh(), ...s, version: s.version || 1 }; if (save.version < 2) migrateTo60(); else persist();
    return profile();
  },

  '/api/notice-seen': () => { load().notice = null; persist(); return profile(); },

  '/api/reset': () => { const lang = load().lang; save = { ...fresh(), lang }; persist(); return profile(); },
};

export async function localApi(path, body) {
  const fn = routes[path];
  if (!fn) throw new Error('Action inconnue');
  return structuredClone(fn(body || {}));
}
