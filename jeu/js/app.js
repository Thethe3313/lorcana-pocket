import { parseCard, validateDeck, buildDeck, RULES, INKS } from './engine.js';
import { renderBattle, stopBattle } from './battle.js';
import { localApi, initStore, getLang } from './store.js';

// ---------------------------------------------------------------- État global
// sets : extensions vendues en boosters (1, 2, 3…) ; allSets : toutes, y compris les quêtes
export const S = { cards: [], byId: new Map(), sets: [], allSets: [], profile: null, lang: 'fr' };
const $ = (sel, el = document) => el.querySelector(sel);
const view = $('#view');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Super_rare', 'Legendary', 'Epic', 'Enchanted', 'Iconic', 'Promo'];
export const RARITY_FR = { Common: 'Commune', Uncommon: 'Peu commune', Rare: 'Rare', Super_rare: 'Super rare', Legendary: 'Légendaire', Epic: 'Épique', Enchanted: 'Enchantée', Iconic: 'Iconique', Promo: 'Promo' };
export const INK_FR = { Amber: 'Ambre', Amethyst: 'Améthyste', Emerald: 'Émeraude', Ruby: 'Rubis', Sapphire: 'Saphir', Steel: 'Acier' };
const TYPE_FR = { Character: 'Personnage', Action: 'Action', Item: 'Objet', Location: 'Lieu' };

export async function api(path, body) {
  const data = await localApi(path, body);
  if (data.profile) setProfile(data.profile);
  else if (data.collection) setProfile(data);
  return data;
}

function setProfile(p) {
  S.profile = p;
  $('#coins b').textContent = p.coins;
  $('#free-packs b').textContent = p.freePacks;
}

export function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), ms);
}

// ---------------------------------------------------------------- Rendu d'une carte

export function cardHTML(c, o = {}) {
  const cls = ['card', o.foil && 'foil', o.unowned && 'unowned', o.cls, o.rarityCls && `r-${c.rarity}`].filter(Boolean).join(' ');
  // Cadre généré : affiché sous l'image, visible seulement si l'image ne charge pas (hors connexion, image absente)
  const ink = c.ink || c.inks?.[0] || 'Steel';
  const stats = c.card_type === 'Character' ? `<div class="st"><span>⚔${c.strength ?? 0}</span><span>🛡${c.willpower ?? 0}</span><span>◆${c.lore ?? 0}</span></div>` : '';
  const frame = `<div class="cframe" style="--ink: var(--${ink})"><div class="cost">${c.cost ?? ''}</div><div class="art">${esc((c.name || '?')[0])}</div>
    <div class="nm">${stats}${esc(c.name)}<small>${esc(c.version || TYPE_FR[c.card_type] || '')}</small></div><div class="tx">${esc(c.text || '')}</div></div>`;
  const src = !o.full && c.thumb ? c.thumb : c.image_path;
  const img = src ? `<img loading="${o.eager ? 'eager' : 'lazy'}" decoding="async" src="${esc(src)}" alt="${esc(c.full_name)}" onerror="this.remove()">` : '';
  return `<div class="${cls}" ${o.attrs || ''} data-id="${esc(c.id)}">${frame}${img}${o.extra || ''}</div>`;
}

const owned = id => { const q = S.profile.collection[id]; return q ? q[0] + q[1] : 0; };
const ownedFoil = id => S.profile.collection[id]?.[1] || 0;

export function showCard(id) {
  const c = S.byId.get(id), pc = parseCard(c);
  const m = $('#modal');
  const active = pc.abilities.map(a => a.label).filter(Boolean);
  const battle = c.card_type === 'Character'
    ? `Oui${active.length ? ` — capacité(s) active(s) : ${esc(active.join(', '))}` : pc.ignoredAbilities ? ' (ses capacités spéciales ne sont pas encore gérées)' : ''}`
    : c.card_type === 'Action' ? (pc.battleLegal ? 'Oui — effet géré automatiquement' : 'Non (effet pas encore géré)') : 'Non (objets et lieux pas encore gérés)';
  m.innerHTML = `<button class="close-x" aria-label="Fermer">✕</button>
    <div class="modal-body">
      <div class="tilt">${cardHTML(c, { full: true, foil: ownedFoil(id) > 0, eager: true })}</div>
      <div class="card-info">
        <h1>${esc(c.name)}</h1><div class="muted">${esc(c.version || '')}</div>
        <div class="kv">
          <span>Type</span><span>${esc((c.types || []).map(t => TYPE_FR[t] || t).join(' · '))}</span>
          <span>Encre</span><span>${esc((c.inks?.length ? c.inks : [c.ink]).map(i => INK_FR[i] || i).join(' / '))} ${c.inkwell ? '· peut aller dans l\'encrier' : ''}</span>
          <span>Coût</span><span>${c.cost ?? '–'}</span>
          ${c.card_type === 'Character' ? `<span>Stats</span><span>⚔ ${c.strength} · 🛡 ${c.willpower} · ◆ ${c.lore} lore</span>` : ''}
          <span>Rareté</span><span>${RARITY_FR[c.rarity] || c.rarity}</span>
          <span>Set</span><span>${esc(S.allSets.find(s => s.code === c.set_code)?.name || c.set_code)} · n°${esc(c.collector_number)}</span>
          <span>Possédée</span><span>${owned(id)} ${ownedFoil(id) ? `(dont ${ownedFoil(id)} foil)` : ''}</span>
          <span>En combat</span><span>${battle}</span>
        </div>
        ${c.text ? `<div class="txt">${esc(c.text)}</div>` : ''}
        ${c.flavor_text ? `<p class="muted"><i>${esc(c.flavor_text)}</i></p>` : ''}
      </div>
    </div>`;
  m.classList.remove('hidden');
  const tilt = $('.tilt .card', m);
  m.onmousemove = e => {
    const r = tilt.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    if (Math.abs(x) < .8 && Math.abs(y) < .8) tilt.style.transform = `rotateY(${x * 18}deg) rotateX(${-y * 18}deg)`;
  };
  m.onclick = e => { if (e.target === m || e.target.closest('.close-x')) closeModal(); };
}
export function closeModal() { const m = $('#modal'); m.classList.add('hidden'); m.innerHTML = ''; m.onmousemove = null; }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ---------------------------------------------------------------- Accueil : deck de départ + boosters

const setCards = code => S.cards.filter(c => c.set_code === code && c.rarity !== 'Promo');
function featured(code) {
  const cs = setCards(code).filter(c => c.image_path && c.card_type === 'Character');
  return cs.find(c => c.rarity === 'Legendary') || cs.find(c => c.rarity === 'Super_rare') || cs[0];
}
let selectedSet = null;

function renderHome() {
  const p = S.profile;
  if (!p.starter) return renderStarter();
  const uniq = Object.keys(p.collection).length;
  const nextFree = p.nextFreePack ? Math.max(0, p.nextFreePack - Date.now()) : 0;
  const fmt = ms => { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
  selectedSet ??= [...S.sets].reverse().find(s => featured(s.code))?.code || S.sets[0]?.code;
  view.innerHTML = `
    <div class="hero">
      <div><h1>Bonjour, ${esc(p.name)} ✦</h1><div class="muted">Ouvre des boosters, complète ta collection et affronte l'IA.</div></div>
      <div class="stats">
        <div class="stat"><b>${uniq}</b>cartes uniques</div>
        <div class="stat"><b>${p.wins}</b>victoires</div>
        <div class="stat"><b>${p.freePacks}</b>${p.freePacks ? 'booster(s) gratuit(s)' : `gratuit dans ${fmt(nextFree)}`}</div>
      </div>
    </div>
    <div class="panel row" style="margin:14px 0">
      <div><b id="sel-name"></b><div class="muted" style="font-size:.85rem">6 cartes : 3 communes, 2 peu communes, 1 rare ou mieux</div></div>
      <span class="spacer"></span>
      <button class="btn gold" id="open-free" ${p.freePacks ? '' : 'disabled'}>🎁 Ouvrir gratuitement</button>
      <button class="btn" id="open-paid" ${p.coins >= p.rules.BOOSTER_PRICE ? '' : 'disabled'}>Ouvrir — ${p.rules.BOOSTER_PRICE} 🪙</button>
    </div>
    <div class="packs">${S.sets.slice().reverse().map(s => {
      const f = featured(s.code), all = setCards(s.code), have = all.filter(c => owned(c.id)).length;
      return `<div class="pack ${s.code === selectedSet ? 'selected' : ''}" data-set="${esc(s.code)}" style="--h:${(Number(s.code) * 47) % 360}">
        <div class="crimp top"></div><div class="num">SET ${esc(s.code)}</div><span class="prog">${have}/${all.length}</span>
        <div class="art">${f ? `<img src="${esc(f.thumb || f.image_path)}" onerror="this.remove()" alt="">` : '<div class="card-back" style="width:100%;height:100%"></div>'}</div>
        <div class="title">${esc(s.name)}</div><div class="crimp bot"></div></div>`;
    }).join('')}</div>`;
  const upd = () => { $('#sel-name').textContent = `Booster : ${S.sets.find(s => s.code === selectedSet)?.name}`; };
  upd();
  view.querySelectorAll('.pack').forEach(el => el.onclick = () => {
    selectedSet = el.dataset.set; view.querySelectorAll('.pack').forEach(x => x.classList.toggle('selected', x === el)); upd();
  });
  $('#open-free').onclick = () => openPack(true);
  $('#open-paid').onclick = () => openPack(false);
}

function renderStarter() {
  const p = S.profile;
  view.innerHTML = `<div class="setup">
    <div><h1>Bienvenue, Illumineur !</h1><p class="muted">Choisis ton deck de départ (cartes du set 1 « ${esc(S.allSets.find(s => s.code === '1')?.name)} »). Il sera ajouté à ta collection, prêt à combattre. Tu reçois aussi ${p.freePacks} boosters gratuits et ${p.coins} pièces.</p></div>
    <div class="choice-grid">${p.starters.map((inks, i) => `<div class="panel choice" data-i="${i}">
      <h2 style="margin-top:0">${inks.map(k => `<span class="ink-dot" style="background:var(--${k})"></span> ${INK_FR[k]}`).join(' & ')}</h2>
      <div class="muted">${{ 0: 'Soutien et contrôle : chanteurs, soins et effets magiques.', 1: 'Agression et objets : défis rapides et pioche.', 2: 'Esquive et force brute : personnages insaisissables et robustes.' }[i]}</div>
      <div class="row" style="margin-top:10px;--card-w:70px">${S.cards.filter(c => c.set_code === '1' && inks.includes(c.ink) && c.rarity === 'Rare' && c.card_type === 'Character').slice(0, 3).map(c => cardHTML(c)).join('')}</div>
    </div>`).join('')}</div></div>`;
  view.querySelectorAll('.choice').forEach(el => el.onclick = async () => {
    try { await api('/api/starter', { index: +el.dataset.i }); toast('Deck de départ ajouté ! Ouvre tes boosters gratuits.'); renderHome(); }
    catch (e) { toast(e.message); }
  });
}

async function openPack(free) {
  let data;
  try { data = await api('/api/booster', { set: selectedSet, free }); } catch (e) { return toast(e.message); }
  const set = S.sets.find(s => s.code === selectedSet), f = featured(selectedSet);
  const ov = document.createElement('div');
  ov.className = 'opening';
  ov.innerHTML = `<div class="pack" style="--h:${(Number(selectedSet) * 47) % 360}"><div class="crimp top"></div><div class="num">SET ${esc(selectedSet)}</div>
    <div class="art">${f ? `<img src="${esc(f.thumb || f.image_path)}" onerror="this.remove()" alt="">` : '<div class="card-back" style="width:100%;height:100%"></div>'}</div><div class="title">${esc(set.name)}</div><div class="crimp bot"></div></div>
    <div class="muted">Clique sur le booster pour l'ouvrir</div>`;
  document.body.appendChild(ov);
  const order = data.cards; // la carte rare est révélée en dernier
  let i = -1;
  const next = () => {
    i++;
    if (i >= order.length) return summary();
    const c = S.byId.get(order[i].id);
    ov.innerHTML = `<div class="rarity-tag" style="color:${['Legendary', 'Epic', 'Enchanted', 'Iconic'].includes(c.rarity) ? 'var(--gold)' : 'var(--muted)'}">${RARITY_FR[c.rarity]}${order[i].foil ? ' · FOIL ✨' : ''}${order[i].isNew ? ' · NOUVELLE !' : ''}</div>
      <div class="reveal-stack">${cardHTML(c, { full: true, eager: true, foil: order[i].foil, rarityCls: true })}</div>
      <div class="muted">${i + 1} / ${order.length} — clique pour continuer</div>`;
    $('.reveal-stack', ov).onclick = next;
  };
  const summary = () => {
    ov.innerHTML = `<h1>Ton booster</h1><div class="summary">${order.map((x, k) => cardHTML(S.byId.get(x.id), { foil: x.foil, attrs: `style="animation-delay:${k * 70}ms"`, extra: x.isNew ? '<span class="badge-new">NOUVEAU</span>' : '' })).join('')}</div>
      <div class="row"><button class="btn gold" id="again">Encore un</button><button class="btn" id="done">Terminer</button></div>`;
    $('#done', ov).onclick = () => { ov.remove(); renderHome(); };
    const canAgain = S.profile.freePacks > 0 || S.profile.coins >= S.profile.rules.BOOSTER_PRICE;
    $('#again', ov).disabled = !canAgain;
    $('#again', ov).onclick = () => { ov.remove(); openPack(S.profile.freePacks > 0); };
    ov.querySelectorAll('.card').forEach(el => el.onclick = () => showCard(el.dataset.id));
  };
  $('.pack', ov).onclick = () => { $('.pack', ov).classList.add('torn'); setTimeout(next, 450); };
}

// ---------------------------------------------------------------- Collection

const F = { set: null, inks: new Set(), rarity: '', type: '', owned: 'all', q: '' };
function renderCollection() {
  F.set ??= S.sets[0]?.code;
  const p = S.profile;
  const totalUniq = Object.keys(p.collection).length;
  view.innerHTML = `
    <div class="row"><h1>Collection</h1><span class="spacer"></span>
      <span class="muted">${totalUniq} / ${S.cards.length} cartes uniques</span>
      <button class="btn small" id="recycle" title="Échange les exemplaires au-delà de ${RULES.MAX_COPIES} contre des pièces (foils conservés)">♻ Recycler les doublons</button></div>
    <div class="set-tabs" id="set-tabs">${[...S.sets.map(s => [s.code, `${s.code}. ${s.name}`]), ['promo', 'Quêtes des Illumineurs'], ['all', 'Tout']].map(([k, n]) => `<span class="chip ${F.set === k ? 'on' : ''}" data-set="${esc(k)}">${esc(n)}</span>`).join('')}</div>
    <div id="set-progress" style="margin:10px 0"></div>
    <div class="filters">
      ${INKS.map(k => `<span class="chip ${F.inks.has(k) ? 'on' : ''}" data-ink="${k}"><span class="ink-dot" style="background:var(--${k})"></span>${INK_FR[k]}</span>`).join('')}
      <select id="f-type"><option value="">Tous types</option>${Object.entries(TYPE_FR).map(([k, v]) => `<option value="${k}" ${F.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select id="f-rar"><option value="">Toutes raretés</option>${RARITIES.map(r => `<option value="${r}" ${F.rarity === r ? 'selected' : ''}>${RARITY_FR[r]}</option>`).join('')}</select>
      <select id="f-own"><option value="all">Toutes</option><option value="owned" ${F.owned === 'owned' ? 'selected' : ''}>Possédées</option><option value="missing" ${F.owned === 'missing' ? 'selected' : ''}>Manquantes</option></select>
      <input type="search" id="f-q" placeholder="Rechercher…" value="${esc(F.q)}">
    </div>
    <div class="card-grid" id="grid"></div>`;
  const draw = () => {
    const inSet = c => F.set === 'all' ? true : F.set === 'promo' ? !/^\d+$/.test(c.set_code) : c.set_code === F.set;
    const base = S.cards.filter(inSet);
    const have = base.filter(c => owned(c.id)).length;
    $('#set-progress').innerHTML = `<div class="row" style="justify-content:space-between"><span class="muted">Progression</span><b>${have} / ${base.length}</b></div><div class="progress"><i style="width:${base.length ? have / base.length * 100 : 0}%"></i></div>`;
    const q = F.q.toLowerCase();
    const list = base.filter(c => (!F.inks.size || (c.inks?.length ? c.inks : [c.ink]).some(i => F.inks.has(i)))
      && (!F.rarity || c.rarity === F.rarity) && (!F.type || c.card_type === F.type)
      && (F.owned === 'all' || (F.owned === 'owned') === owned(c.id) > 0)
      && (!q || `${c.full_name} ${c.text || ''}`.toLowerCase().includes(q)));
    $('#grid').innerHTML = list.length ? list.map(c => cardHTML(c, { unowned: !owned(c.id), foil: ownedFoil(c.id) > 0, extra: owned(c.id) ? `<span class="qty">×${owned(c.id)}</span>` : '' })).join('') : '<p class="muted">Aucune carte.</p>';
  };
  draw();
  $('#set-tabs').onclick = e => { const k = e.target.closest('[data-set]')?.dataset.set; if (k) { F.set = k; renderCollection(); } };
  view.querySelectorAll('[data-ink]').forEach(el => el.onclick = () => { F.inks.has(el.dataset.ink) ? F.inks.delete(el.dataset.ink) : F.inks.add(el.dataset.ink); el.classList.toggle('on'); draw(); });
  $('#f-type').onchange = e => { F.type = e.target.value; draw(); };
  $('#f-rar').onchange = e => { F.rarity = e.target.value; draw(); };
  $('#f-own').onchange = e => { F.owned = e.target.value; draw(); };
  $('#f-q').oninput = e => { F.q = e.target.value; draw(); };
  $('#grid').onclick = e => { const id = e.target.closest('.card')?.dataset.id; if (id) showCard(id); };
  $('#recycle').onclick = async () => {
    try { const r = await api('/api/recycle', {}); toast(r.count ? `${r.count} doublon(s) recyclé(s) : +${r.coins} 🪙` : 'Aucun doublon à recycler'); draw(); }
    catch (e) { toast(e.message); }
  };
}

// ---------------------------------------------------------------- Decks

const ownedByName = () => {
  const m = {};
  for (const [id, [q, f]] of Object.entries(S.profile.collection)) { const c = S.byId.get(id); if (c) m[c.full_name] = (m[c.full_name] || 0) + q + f; }
  return m;
};
const deckInks = ids => [...new Set(ids.flatMap(id => { const c = S.byId.get(id); return c.inks?.length ? c.inks : [c.ink]; }).filter(Boolean))];
const inkDots = inks => inks.map(k => `<span class="ink-dot" style="background:var(--${k})" title="${INK_FR[k]}"></span>`).join(' ');
export const deckErrors = ids => validateDeck(ids.map(id => S.byId.get(id)));

function renderDecks() {
  const decks = S.profile.decks;
  view.innerHTML = `<div class="row"><h1>Mes decks</h1><span class="spacer"></span>
      <button class="btn" id="auto">✨ Deck automatique</button><button class="btn gold" id="new">+ Nouveau deck</button></div>
    <p class="muted">Format Pocket : ${RULES.DECK_SIZE} cartes, ${RULES.MAX_COPIES} exemplaires max par carte, ${RULES.MAX_INKS} encres max. Seuls les personnages et les actions dont l'effet est géré sont jouables.</p>
    <div class="deck-list">${decks.map(d => {
      const errs = deckErrors(d.cards), cover = S.byId.get(d.cards.map(id => S.byId.get(id)).sort((a, b) => b.cost - a.cost)[0]?.id);
      return `<div class="panel deck-tile" data-id="${d.id}"><div class="cover">${cover ? cardHTML(cover) : '<div class="card-back"></div>'}</div>
        <div><b>${esc(d.name)}</b><div>${inkDots(deckInks(d.cards))}</div><div class="${errs.length ? 'errs' : 'muted'}">${d.cards.length}/${RULES.DECK_SIZE} cartes ${errs.length ? '· incomplet' : '· prêt ✔'}</div></div></div>`;
    }).join('') || '<p class="muted">Aucun deck pour l\'instant.</p>'}</div>`;
  $('#new').onclick = () => editDeck({ id: null, name: 'Nouveau deck', cards: [] });
  $('#auto').onclick = autoDeck;
  view.querySelectorAll('.deck-tile').forEach(el => el.onclick = () => editDeck(structuredClone(decks.find(d => d.id === +el.dataset.id))));
}

function autoDeck() {
  const m = $('#modal');
  const have = ownedByName();
  const ownedRows = S.cards.filter(c => owned(c.id));
  const count = inks => { const ids = buildDeck(ownedRows, inks, { available: have }); return ids.length; };
  const pairs = [];
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) pairs.push([INKS[a], INKS[b]]);
  m.innerHTML = `<div class="panel" style="max-width:560px"><h2 style="margin-top:0">Deck automatique</h2><p class="muted">Choisis deux encres : le deck est construit avec les cartes de ta collection.</p>
    <div class="choice-grid" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">${pairs.map(pr => { const n = count(pr); return `<button class="btn" data-p="${pr.join(',')}" ${n < RULES.DECK_SIZE ? 'disabled' : ''}>${inkDots(pr)} ${pr.map(k => INK_FR[k]).join(' / ')}<br><small class="muted">${n}/${RULES.DECK_SIZE} cartes dispo.</small></button>`; }).join('')}</div>
    <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn" id="cancel">Annuler</button></div></div>`;
  m.classList.remove('hidden');
  m.onclick = async e => {
    if (e.target === m || e.target.id === 'cancel') return closeModal();
    const b = e.target.closest('[data-p]'); if (!b) return;
    const inks = b.dataset.p.split(',');
    const ids = buildDeck(ownedRows, inks, { available: have });
    closeModal();
    try { await api('/api/deck', { name: `Auto ${inks.map(k => INK_FR[k]).join(' / ')}`, cards: ids }); toast('Deck créé !'); renderDecks(); }
    catch (err) { toast(err.message); }
  };
}

function editDeck(deck) {
  const have = ownedByName();
  const DF = { inks: new Set(), cost: '', q: '' };
  const ownedRows = S.cards.filter(c => owned(c.id) && c.battle);
  // une seule entrée par nom complet (la version possédée la plus commune)
  const pool = [...new Map(ownedRows.map(c => [c.full_name, c])).values()].sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  const inDeck = fn => deck.cards.filter(id => S.byId.get(id).full_name === fn).length;
  view.innerHTML = `<div class="row"><button class="btn small" id="back">← Decks</button><input type="text" id="dname" value="${esc(deck.name)}" style="flex:1;max-width:320px">
      <span class="spacer"></span>${deck.id ? '<button class="btn danger small" id="del">Supprimer</button>' : ''}<button class="btn gold" id="save">Enregistrer</button></div>
    <div class="filters">${INKS.map(k => `<span class="chip" data-ink="${k}"><span class="ink-dot" style="background:var(--${k})"></span>${INK_FR[k]}</span>`).join('')}
      <select id="dcost"><option value="">Tous coûts</option>${[1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}">${n === 7 ? '7+' : n}</option>`).join('')}</select>
      <input type="search" id="dq" placeholder="Rechercher…"></div>
    <div class="editor"><div class="card-grid pool" id="pool"></div><div class="panel deck-side" id="side"></div></div>`;
  const drawPool = () => {
    const q = DF.q.toLowerCase();
    const list = pool.filter(c => (!DF.inks.size || DF.inks.has(c.ink)) && (!DF.cost || (DF.cost === '7' ? c.cost >= 7 : c.cost === +DF.cost)) && (!q || `${c.full_name} ${c.text || ''}`.toLowerCase().includes(q)));
    $('#pool').innerHTML = list.map(c => {
      const n = inDeck(c.full_name), max = Math.min(RULES.MAX_COPIES, have[c.full_name] || 0);
      return cardHTML(c, { cls: n >= max ? 'maxed' : '', extra: `<span class="add-badge">${n}/${max} ${c.active ? '⚡' : ''}</span>` });
    }).join('') || '<p class="muted">Aucune carte jouable en combat ne correspond.</p>';
  };
  const drawSide = () => {
    const groups = {};
    for (const id of deck.cards) { const c = S.byId.get(id); (groups[c.full_name] ||= { c, n: 0 }).n++; }
    const lines = Object.values(groups).sort((a, b) => a.c.cost - b.c.cost || a.c.name.localeCompare(b.c.name));
    const curve = [1, 2, 3, 4, 5, 6, 7].map(k => deck.cards.filter(id => { const c = S.byId.get(id).cost; return k === 7 ? c >= 7 : c === k; }).length);
    const max = Math.max(1, ...curve);
    const errs = deckErrors(deck.cards);
    const inkable = deck.cards.filter(id => S.byId.get(id).inkwell).length;
    $('#side').innerHTML = `<div class="row"><b>${deck.cards.length} / ${RULES.DECK_SIZE}</b><span>${inkDots(deckInks(deck.cards))}</span><span class="spacer"></span><span class="muted" style="font-size:.8rem">${inkable} encrables</span></div>
      <div class="curve">${curve.map((n, k) => `<div style="height:${n / max * 100}%"><span>${k === 6 ? '7+' : k + 1}</span></div>`).join('')}</div><div style="height:14px"></div>
      ${errs.length ? `<div class="errs">${errs.map(esc).join('<br>')}</div>` : '<div style="color:var(--ok)">Deck valide ✔</div>'}
      <div style="margin-top:8px">${lines.map(({ c, n }) => `<div class="deck-line" data-fn="${esc(c.full_name)}" title="Retirer un exemplaire"><span class="c">${c.cost}</span><span class="ink-dot" style="background:var(--${c.ink || 'Steel'})"></span><span class="n">${esc(c.full_name)}</span><b>×${n}</b></div>`).join('') || '<p class="muted">Clique sur une carte pour l\'ajouter.</p>'}</div>`;
  };
  drawPool(); drawSide();
  $('#pool').onclick = e => {
    const id = e.target.closest('.card')?.dataset.id; if (!id) return;
    const c = S.byId.get(id), max = Math.min(RULES.MAX_COPIES, have[c.full_name] || 0);
    if (inDeck(c.full_name) >= max) return toast('Nombre maximum d\'exemplaires atteint');
    if (deck.cards.length >= RULES.DECK_SIZE) return toast(`Le deck est complet (${RULES.DECK_SIZE} cartes)`);
    const inks = new Set([...deckInks(deck.cards), c.ink]);
    if (inks.size > RULES.MAX_INKS) return toast(`${RULES.MAX_INKS} encres maximum par deck`);
    deck.cards.push(id); drawPool(); drawSide();
  };
  $('#pool').oncontextmenu = e => { const id = e.target.closest('.card')?.dataset.id; if (id) { e.preventDefault(); showCard(id); } };
  $('#side').onclick = e => {
    const fn = e.target.closest('[data-fn]')?.dataset.fn; if (!fn) return;
    const idx = deck.cards.findLastIndex(id => S.byId.get(id).full_name === fn);
    if (idx >= 0) deck.cards.splice(idx, 1); drawPool(); drawSide();
  };
  view.querySelectorAll('[data-ink]').forEach(el => el.onclick = () => { DF.inks.has(el.dataset.ink) ? DF.inks.delete(el.dataset.ink) : DF.inks.add(el.dataset.ink); el.classList.toggle('on'); drawPool(); });
  $('#dcost').onchange = e => { DF.cost = e.target.value; drawPool(); };
  $('#dq').oninput = e => { DF.q = e.target.value; drawPool(); };
  $('#back').onclick = renderDecks;
  $('#save').onclick = async () => {
    try { const r = await api('/api/deck', { id: deck.id, name: $('#dname').value, cards: deck.cards }); deck.id = r.id; toast('Deck enregistré'); renderDecks(); }
    catch (e) { toast(e.message); }
  };
  if (deck.id) $('#del').onclick = async () => { if (confirm('Supprimer ce deck ?')) { await api('/api/deck/delete', { id: deck.id }); renderDecks(); } };
}

// ---------------------------------------------------------------- Routeur

// ---------------------------------------------------------------- Réglages

function renderSettings() {
  const p = S.profile;
  view.innerHTML = `<div class="setup">
    <h1>Réglages</h1>
    <div class="panel"><h2 style="margin-top:0">Nom de joueur</h2>
      <div class="row"><input type="text" id="pname" value="${esc(p.name)}" maxlength="24"><button class="btn" id="save-name">Enregistrer</button></div></div>
    <div class="panel"><h2 style="margin-top:0">Langue des cartes</h2>
      <div class="row">${[['fr', '🇫🇷 Français'], ['en', '🇬🇧 English']].map(([k, n]) => `<span class="chip ${p.lang === k ? 'on' : ''}" data-lang="${k}" style="cursor:pointer;padding:8px 14px">${n}</span>`).join('')}</div>
      <p class="muted">Noms, textes et visuels des cartes. Les cartes pas encore traduites restent en anglais. Les effets en combat sont toujours calculés à partir du texte officiel anglais.</p></div>
    <div class="panel"><h2 style="margin-top:0">Ma sauvegarde</h2>
      <p class="muted">La partie est enregistrée dans ce navigateur, sur cet appareil. Pour la passer sur un autre appareil (ordinateur ↔ téléphone) : exporte-la ici, puis importe le fichier sur l'autre.</p>
      <div class="row"><button class="btn" id="export">⬇ Exporter ma partie</button><label class="btn">⬆ Importer une partie<input type="file" id="import" accept=".json,application/json" hidden></label>
        <span class="spacer"></span><button class="btn danger" id="reset">Recommencer à zéro</button></div></div>
    <div class="panel muted" style="font-size:.85rem">Données des cartes : <a href="https://lorcanajson.org" target="_blank" rel="noopener" style="color:var(--gold)">LorcanaJSON</a>. Visuels chargés depuis le site officiel de Ravensburger.
      Disney Lorcana, ses cartes et ses illustrations appartiennent à Disney et Ravensburger ; ce jeu est un projet de fan non officiel, gratuit et sans publicité.</div>
  </div>`;
  $('#save-name').onclick = async () => { try { await api('/api/settings', { name: $('#pname').value }); toast('Nom enregistré'); } catch (e) { toast(e.message); } };
  view.querySelectorAll('[data-lang]').forEach(el => el.onclick = async () => {
    if (el.dataset.lang === p.lang) return;
    await api('/api/settings', { lang: el.dataset.lang });
    location.reload();
  });
  $('#export').onclick = async () => {
    const { file } = await localApi('/api/export');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([file], { type: 'application/json' }));
    a.download = `lorcana-pocket-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('#import').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    if (!confirm('Remplacer ta partie actuelle par celle du fichier ?')) return;
    try { await api('/api/import', { text: await f.text() }); toast('Partie importée !'); location.reload(); } catch (err) { toast(err.message); }
  };
  $('#reset').onclick = async () => {
    if (!confirm('Effacer toute ta collection, tes decks et tes pièces pour recommencer ?')) return;
    await api('/api/reset'); location.hash = '#home'; route();
  };
}

const routes = { home: renderHome, collection: renderCollection, decks: renderDecks, battle: () => renderBattle(view), settings: renderSettings };
function route() {
  const tab = (location.hash.slice(1) || 'home');
  document.body.classList.remove('in-battle');
  stopBattle(); view.onclick = null; view.oncontextmenu = null;
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  closeModal();
  window.scrollTo(0, 0);
  (routes[tab] || renderHome)();
}
window.addEventListener('hashchange', route);

(async () => {
  view.innerHTML = '<p class="muted">Chargement des cartes…</p>';
  let data;
  try { data = await (await fetch('data/cards.json')).json(); }
  catch { view.innerHTML = '<p class="errs">Impossible de charger les cartes. Vérifie ta connexion puis recharge la page.</p>'; return; }
  // Champs affichés selon la langue choisie (repli sur l'anglais pour les cartes non traduites)
  S.lang = getLang();
  const L = S.lang === 'fr';
  S.cards = data.cards.map(c => {
    const fr = L && c.name_fr;
    return { ...c,
      name: fr ? c.name_fr : c.name_en, version: fr ? c.version_fr : c.version_en, full_name: fr ? c.full_name_fr : c.full_name_en,
      text: fr ? c.text_fr : c.text_en, flavor_text: fr ? c.flavor_fr : c.flavor_en,
      image_path: (fr ? c.img_fr : c.img_en) || c.img_en, thumb: (fr ? c.thumb_fr : c.thumb_en) || c.thumb_en,
      battle: null };
  });
  for (const c of S.cards) { const pc = parseCard(c); c.battle = pc.battleLegal; c.active = pc.abilities.length > 0 || pc.kind === 'action'; }
  S.byId = new Map(S.cards.map(c => [c.id, c]));
  S.allSets = data.sets.map(s => ({ ...s, name: L ? s.name_fr : s.name_en }));
  S.sets = S.allSets.filter(s => /^\d+$/.test(s.code));
  document.documentElement.lang = S.lang;
  initStore(S.cards, S.allSets);
  await api('/api/profile');
  route();
  setInterval(async () => { if (!document.body.classList.contains('in-battle')) await api('/api/profile').catch(() => {}); }, 60000);
})();
