import { newGame, applyAction, aiNextAction, playOptions, canInk, canQuest, challengeTargets, pendingTargetEffect, effectTargets,
  inkAvailable, strOf, loreOf, wilOf, findInst, buildDeck, RULES, INKS } from './engine.js';
import { S, api, cardHTML, esc, toast, showCard, deckErrors, INK_FR } from './app.js';
import { kwLabel } from './guide.js';

const $ = (sel, el = document) => el.querySelector(sel);
const DIFF = { easy: 'Facile', normal: 'Normal', hard: 'Difficile' };
// Cartes que l'IA peut utiliser selon la difficulté
const AI_POOL = {
  easy: c => c.set_code === '1' && ['Common', 'Uncommon'].includes(c.rarity),
  normal: c => ['1', '2', '3'].includes(c.set_code) && ['Common', 'Uncommon', 'Rare'].includes(c.rarity),
  hard: c => /^\d+$/.test(c.set_code),
};
const DIFF_INFO = { easy: 'IA imprudente, cartes du set 1', normal: 'IA tactique, cartes des sets 1 à 3', hard: 'IA tactique, toutes les cartes' };
let setup = { deckId: null, diff: 'normal', auto: false, fast: true };

// Partie en cours : une seule à la fois ; quitter l'écran de combat l'arrête
let current = null;
export function stopBattle() { current = null; }

export function renderBattle(view) {
  stopBattle();
  const decks = S.profile.decks.filter(d => !deckErrors(d.cards).length);
  if (!decks.some(d => d.id === setup.deckId)) setup.deckId = decks[0]?.id ?? null;
  const R = S.profile.rules;
  view.innerHTML = `<div class="setup">
    <div><h1>Combat contre l'IA</h1><p class="muted">Premier à ${RULES.LORE_TO_WIN} lore. Mets une carte par tour dans ton encrier, joue des personnages, envoie-les en quête ou défie les personnages épuisés de l'adversaire.</p></div>
    <div class="panel"><h2 style="margin-top:0">1. Ton deck</h2>
      ${decks.length ? `<div class="choice-grid">${decks.map(d => `<div class="panel choice ${d.id === setup.deckId ? 'on' : ''}" data-deck="${d.id}"><b>${esc(d.name)}</b><div>${[...new Set(d.cards.map(id => S.byId.get(id).ink).filter(Boolean))].map(k => `<span class="ink-dot" style="background:var(--${k})"></span> ${INK_FR[k]}`).join(' ')}</div></div>`).join('')}</div>`
        : `<p class="muted">Aucun deck valide. <a href="#decks" style="color:var(--gold)">Crée un deck de ${RULES.DECK_SIZE} cartes</a>.</p>`}
    </div>
    <div class="panel"><h2 style="margin-top:0">2. Difficulté</h2><div class="row">${Object.entries(DIFF).map(([k, n]) => `<span class="chip ${setup.diff === k ? 'on' : ''}" data-diff="${k}" style="cursor:pointer;padding:8px 14px;display:block;border-radius:12px"><b>${n}</b> · victoire +${R.WIN_REWARD[k]} 🪙<br><small class="muted">${DIFF_INFO[k]}</small></span>`).join('')}</div></div>
    <div class="panel"><h2 style="margin-top:0">3. Mode</h2><div class="row">
      <span class="chip ${setup.auto ? '' : 'on'}" data-auto="0" style="cursor:pointer;padding:8px 14px">🎮 Je joue</span>
      <span class="chip ${setup.auto ? 'on' : ''}" data-auto="1" style="cursor:pointer;padding:8px 14px">🤖 Combat automatique</span></div>
      <p class="muted" style="margin-bottom:0">En automatique, l'ordinateur joue tes tours à ta place (même niveau que l'IA normale). Tu gagnes les pièces comme d'habitude, et tu peux reprendre la main à tout moment avec le bouton 🤖 Auto.</p></div>
    <button class="btn gold" id="go" ${decks.length ? '' : 'disabled'} style="font-size:1.1rem;padding:14px">⚔️ Lancer le combat</button>
    <details class="panel"><summary><b>Règles du combat</b></summary><ul class="muted">
      <li><b>Encrier</b> : une fois par tour, place une carte marquée ◆encrable face cachée ; chaque carte de l'encrier fournit 1 encre par tour.</li>
      <li><b>Jouer</b> : paye le coût en encre. Un personnage qui vient d'arriver « sèche » (💤) : il ne peut ni quêter ni défier ce tour (sauf Rush).</li>
      <li><b>Quêter</b> : épuise un personnage pour gagner sa valeur de lore ◆.</li>
      <li><b>Défier</b> : épuise un personnage pour attaquer un personnage adverse <i>épuisé</i>. Chacun inflige sa force ⚔ à l'autre ; un personnage dont les dégâts atteignent sa volonté 🛡 est banni.</li>
      <li><b>Chansons</b> : un personnage sec de coût suffisant peut s'épuiser pour chanter une chanson gratuitement. <b>Alter</b> : joue une version améliorée par-dessus un personnage du même nom.</li>
      <li>Mots-clés gérés : Insaisissable, Charge, Hors d'atteinte, Rempart, Combattant, Soutien, Offensif, Résistance, Mélomane, Alter, Dissipation. Les capacités ⚡ s'appliquent automatiquement ; les autres textes sont ignorés.</li>
    </ul></details></div>`;
  view.querySelectorAll('[data-deck]').forEach(el => el.onclick = () => { setup.deckId = +el.dataset.deck; renderBattle(view); });
  view.querySelectorAll('[data-diff]').forEach(el => el.onclick = () => { setup.diff = el.dataset.diff; renderBattle(view); });
  view.querySelectorAll('[data-auto]').forEach(el => el.onclick = () => { setup.auto = el.dataset.auto === '1'; renderBattle(view); });
  const go = $('#go', view); if (go) go.onclick = () => start(view);
}

function start(view) {
  const deck = S.profile.decks.find(d => d.id === setup.deckId);
  const aiInks = [...INKS].sort(() => Math.random() - .5).slice(0, 2);
  const aiPool = S.cards.filter(AI_POOL[setup.diff]);
  const aiDeck = buildDeck(aiPool, aiInks).map(id => S.byId.get(id));
  const G = newGame([deck.cards.map(id => S.byId.get(id)), aiDeck], { names: [S.profile.name, `IA ${DIFF[setup.diff]}`], ai: [false, true] });
  document.body.classList.add('in-battle');
  current = new BattleUI(view, G, setup.diff);
  current.boot();
}

class BattleUI {
  constructor(view, G, diff) { Object.assign(this, { view, G, diff, sel: null, targeting: null, busy: false, flash: new Set(), ended: false, auto: setup.auto }); }

  // Délai entre deux actions affichées (plus court en mode rapide)
  delay(a) { const base = a.type === 'end' ? 250 : a.type === 'ink' ? 450 : 850; return setup.fast && this.auto ? Math.round(base / 3) : base; }

  boot() {
    this.view.onclick = e => this.click(e);
    // Échap : refermer la carte agrandie
    const onKey = e => { if (current !== this) return document.removeEventListener('keydown', onKey); if (e.key === 'Escape' && this.zoom) { this.zoom = false; this.render(); } };
    document.addEventListener('keydown', onKey);
    this.view.oncontextmenu = e => { const id = e.target.closest('.card')?.dataset.id; if (id) { e.preventDefault(); showCard(id); } };
    this.render();
    if (this.G.active === 1) setTimeout(() => this.runAI(), 900);
    else if (this.auto) setTimeout(() => this.runMe(), 700);
  }

  row(inst) { return S.byId.get(inst.card.id); }

  slot(inst, mine) {
    const G = this.G, t = this.targeting;
    const canAct = mine && !this.busy && !t && G.active === 0 && (canQuest(G, 0, inst.uid) || challengeTargets(G, 0, inst.uid).length);
    const targetable = t?.valid.includes(inst.uid);
    const cls = ['slot', inst.exerted && 'exerted', canAct && 'can-act', targetable && 'targetable', targetable && mine && 'friendly',
      this.sel?.uid === inst.uid && 'selected', this.flash.has(inst.uid) && 'flash'].filter(Boolean).join(' ');
    const kw = Object.keys(inst.card.kw).filter(k => !['shift', 'singer', 'singTogether'].includes(k));
    return `<div class="${cls}" data-uid="${inst.uid}" title="${esc(inst.card.fullName)}${kw.length ? ' — ' + kw.map(k => kwLabel(k, inst.card.kw[k])).join(', ') : ''}">
      ${cardHTML(this.row(inst))}
      ${inst.damage ? `<span class="dmg">-${inst.damage}</span>` : ''}${inst.fresh ? '<span class="zz" title="Sèche : ne peut pas agir ce tour">💤</span>' : ''}
      <div class="chips"><span title="Force">⚔${strOf(inst)}</span><span title="Volonté restante">🛡${wilOf(inst) - inst.damage}</span><span title="Lore">◆${loreOf(inst)}</span></div></div>`;
  }

  bar(p) {
    const P = this.G.players[p], avail = inkAvailable(P);
    const drops = Array.from({ length: P.inkwell.length }, (_, i) => `<span class="drop ${i < avail ? '' : 'used'}"></span>`).join('');
    return `<div class="side-bar">
      <span class="who">${p === this.G.active ? '▶ ' : ''}${esc(P.name)}</span>
      <div class="lore"><b>◆ ${P.lore}/${RULES.LORE_TO_WIN}</b><div class="progress"><i style="width:${Math.min(100, P.lore / RULES.LORE_TO_WIN * 100)}%"></i></div></div>
      <span class="zone-count" title="Encre disponible / totale">Encre ${avail}/${P.inkwell.length}</span><div class="inks">${drops}</div>
      <span class="spacer"></span>
      ${p === 1 ? `<div class="opp-hand" title="Main adverse">${'<div class="card-back"></div>'.repeat(Math.min(P.hand.length, 10))}</div><span class="zone-count">${P.hand.length} en main</span>` : ''}
      <span class="zone-count">🂠 ${P.deck.length} · 🗑 ${P.discard.length}</span></div>`;
  }

  render() {
    if (current !== this) return;
    const G = this.G, me = G.players[0], opp = G.players[1], t = this.targeting;
    if (t || !this.sel) this.zoom = false;
    const myTurn = G.active === 0 && !G.over;
    const hand = me.hand.map(i => {
      const playable = myTurn && !this.busy && (playOptions(G, 0, i.uid).length || canInk(G, 0, i.uid));
      const cls = [playable && 'playable', this.sel?.uid === i.uid && 'selected'].filter(Boolean).join(' ');
      return cardHTML(this.row(i), { cls, attrs: `data-uid="${i.uid}"`, eager: true });
    }).join('');
    this.view.innerHTML = `<div class="board" style="grid-template-rows:auto 1fr auto 1fr auto auto">
      ${this.bar(1)}
      <div class="zone">${opp.play.map(i => this.slot(i, false)).join('') || '<span class="muted">Aucun personnage adverse</span>'}</div>
      <div class="mid">
        <span class="turn-banner">${G.over ? 'Fin de partie' : myTurn ? `Ton tour (${Math.ceil(G.turnNumber / 2)})${this.auto ? ' · 🤖 auto' : ''}` : 'Tour de l\'IA…'}</span>
        <div class="log" id="log">${G.log.slice(-8).map(l => `<div>${l.p === 0 ? '🟢' : '🔴'} ${esc(l.text)}</div>`).join('')}</div>
        <button class="btn small danger" data-act="quit">Abandonner</button>
        <button class="btn small ${this.auto ? 'gold' : ''}" data-act="auto" title="L'ordinateur joue tes tours à ta place">🤖 Auto ${this.auto ? 'ON' : 'OFF'}</button>
        ${this.auto ? `<button class="btn small" data-act="speed" title="Vitesse du mode auto">${setup.fast ? '⏩ Rapide' : '▶ Normal'}</button>` : ''}
        <button class="btn gold" data-act="end" ${myTurn && !this.busy && !t ? '' : 'disabled'}>Fin du tour ⏭</button>
      </div>
      <div class="zone">${me.play.map(i => this.slot(i, true)).join('') || '<span class="muted">Joue des personnages depuis ta main</span>'}</div>
      ${this.bar(0)}
      <div class="hand">${hand}</div>
    </div>
    ${t ? `<div class="targeting-bar">🎯 ${esc(t.prompt)} ${t.optional ? '<button class="btn small" data-act="skip">Passer</button>' : ''}<button class="btn small" data-act="cancel">Annuler</button></div>` : ''}
    ${this.sel && !t ? this.panel() : ''}`;
    const log = $('#log', this.view); if (log) log.scrollTop = log.scrollHeight;
    // Chevauchement des cartes en main : elles tiennent toujours dans la largeur de l'écran
    const handEl = $('.hand', this.view), n = me.hand.length;
    if (handEl && n > 1) {
      const w = parseFloat(getComputedStyle(handEl).getPropertyValue('--card-w')) || 100;
      const avail = handEl.clientWidth - 24;
      handEl.style.setProperty('--ov', `${Math.min(6, Math.floor((avail - w) / (n - 1) - w))}px`);
    }
    this.flash.clear();
  }

  panel() {
    const p = this.panelParts(); if (!p) return '';
    const { inst, btns, kw, abil, info } = p;
    if (this.zoom) return this.zoomView(p);
    return `<div class="action-panel"><div class="zoomable" data-act="zoom" title="Agrandir la carte">${cardHTML(this.row(inst), { full: true, eager: true })}<span class="zoom-hint">🔍</span></div>
      <div class="btns">${btns.join('')}
      ${kw ? `<div class="info">Mots-clés : ${esc(kw)}</div>` : ''}${abil ? `<div class="info">⚡ Capacité active : ${esc(abil)}</div>` : ''}
      ${info ? `<div class="info">${esc(info)}</div>` : ''}
      <div class="row" style="gap:6px"><button class="btn small" data-act="zoom" style="flex:1">🔍 Agrandir</button><button class="btn small" data-act="close" style="flex:1">Fermer</button></div></div></div>`;
  }

  // Carte en grand : visuel, texte lisible, état en jeu et les mêmes actions ; « Retour » revient au plateau
  zoomView({ inst, zone, btns, kw, abil, info }) {
    const row = this.row(inst);
    const where = { hand: 'Dans ta main', play: inst.owner === 0 ? 'En jeu (toi)' : 'En jeu (adversaire)' }[zone] || '';
    const stats = row.card_type === 'Character'
      ? `<div class="zstats"><span>⚔ ${strOf(inst)} force</span><span>🛡 ${wilOf(inst) - inst.damage}/${wilOf(inst)} volonté</span><span>◆ ${loreOf(inst)} lore</span><span>💧 coût ${row.cost}</span></div>`
      : `<div class="zstats"><span>💧 coût ${row.cost}</span></div>`;
    return `<div class="battle-zoom">
      <div class="ztop"><button class="btn" data-act="unzoom">← Retour</button><span class="muted">${esc(where)}</span></div>
      <div class="zbody">
        <div class="zcard">${cardHTML(row, { full: true, eager: true })}</div>
        <div class="zinfo">
          <h2>${esc(row.name)}</h2>${row.version ? `<div class="muted">${esc(row.version)}</div>` : ''}
          ${stats}
          ${inst.damage ? `<div class="info" style="color:var(--danger)">${inst.damage} dégât(s) sur ce personnage</div>` : ''}
          ${row.text ? `<div class="ztext">${esc(row.text)}</div>` : ''}
          ${kw ? `<div class="info">Mots-clés : ${esc(kw)}</div>` : ''}${abil ? `<div class="info">⚡ Capacité active en combat : ${esc(abil)}</div>` : ''}
          ${info ? `<div class="info">${esc(info)}</div>` : ''}
          <div class="zbtns">${btns.join('')}</div>
        </div>
      </div></div>`;
  }

  panelParts() {
    const G = this.G, { uid } = this.sel;
    const f = findInst(G, uid); if (!f) { this.sel = null; return null; }
    const { inst, zone } = f, mine = inst.owner === 0, myTurn = G.active === 0 && !G.over && !this.busy;
    const btns = [];
    const c = inst.card;
    if (mine && zone === 'hand' && myTurn) {
      for (const o of playOptions(G, 0, uid)) {
        if (o.mode === 'normal') btns.push(`<button class="btn gold" data-play='${JSON.stringify(o)}'>Jouer (${o.cost} encre)</button>`);
        if (o.mode === 'shift') btns.push(`<button class="btn" data-play='${JSON.stringify(o)}'>Alter sur ${esc(findInst(G, o.shiftOnto).inst.card.fullName)} (${o.cost})</button>`);
        if (o.mode === 'sing') btns.push(`<button class="btn" data-play='${JSON.stringify(o)}'>🎵 Chanter avec ${esc(findInst(G, o.singer).inst.card.name)}</button>`);
      }
      if (canInk(G, 0, uid)) btns.push(`<button class="btn" data-act="ink">💧 Mettre dans l'encrier</button>`);
    }
    if (mine && zone === 'play' && myTurn) {
      if (canQuest(G, 0, uid)) btns.push(`<button class="btn gold" data-act="quest">◆ Quêter (+${loreOf(inst)} lore)</button>`);
      if (challengeTargets(G, 0, uid).length) btns.push(`<button class="btn" data-act="challenge">⚔ Défier…</button>`);
    }
    let info = '';
    if (zone === 'hand' && !c.battleLegal) info = 'Effet non géré en combat : cette carte ne peut servir que d\'encre.';
    else if (zone === 'hand' && !c.inkable) info = 'Cette carte ne peut pas aller dans l\'encrier.';
    if (zone === 'play') {
      if (inst.fresh) info = 'Ce personnage sèche : il pourra agir au prochain tour' + (c.kw.rush ? ' (Rush : il peut déjà défier).' : '.');
      else if (inst.exerted) info = 'Épuisé : il se redressera au début du tour de son propriétaire.';
    }
    const kw = Object.entries(c.kw).filter(([k]) => k !== 'singTogether').map(([k, v]) => kwLabel(k, v)).join(', ');
    const abil = c.abilities.map(a => a.label).filter(Boolean).join(', ');
    return { inst, zone, btns, kw, abil, info };
  }

  click(e) {
    const G = this.G;
    const actBtn = e.target.closest('[data-act]'), playBtn = e.target.closest('[data-play]');
    if (actBtn) return this.button(actBtn.dataset.act);
    if (playBtn) return this.play(JSON.parse(playBtn.dataset.play));
    const el = e.target.closest('[data-uid]');
    if (!el) return;
    const uid = +el.dataset.uid;
    if (this.targeting) {
      if (this.targeting.valid.includes(uid)) { const t = this.targeting; this.targeting = null; t.done(uid); }
      return;
    }
    this.sel = this.sel?.uid === uid ? null : { uid };
    this.zoom = false;
    this.render();
  }

  button(act) {
    const G = this.G;
    switch (act) {
      case 'close': this.sel = null; this.zoom = false; return this.render();
      case 'zoom': this.zoom = true; return this.render();
      case 'unzoom': this.zoom = false; return this.render();
      case 'cancel': this.targeting = null; return this.render();
      case 'skip': { const t = this.targeting; this.targeting = null; return t.done(undefined); }
      case 'end': this.sel = null; this.do({ type: 'end' }); return this.runAI();
      case 'auto':
        this.auto = setup.auto = !this.auto;
        this.sel = null; this.zoom = false; this.targeting = null;
        if (this.auto && G.active === 0 && !this.busy) return this.runMe();
        return this.render();
      case 'speed': setup.fast = !setup.fast; return this.render();
      case 'quit':
        if (!G.over && confirm('Abandonner la partie ?')) { document.body.classList.remove('in-battle'); this.view.onclick = null; location.hash = '#battle'; renderBattle(this.view); }
        return;
      case 'ink': return this.do({ type: 'ink', uid: this.sel.uid });
      case 'quest': {
        const uid = this.sel.uid, inst = findInst(G, uid).inst;
        return this.withTarget(pendingTargetEffect(inst.card, 'quest'), target => this.do({ type: 'quest', uid, target }));
      }
      case 'challenge': {
        const uid = this.sel.uid;
        this.targeting = { prompt: 'Choisis un personnage adverse épuisé à défier', valid: challengeTargets(G, 0, uid), optional: false, done: target => this.do({ type: 'challenge', uid, target }) };
        return this.render();
      }
    }
  }

  play(o) {
    const uid = this.sel.uid, card = findInst(this.G, uid).inst.card;
    this.withTarget(pendingTargetEffect(card, 'play'), target => this.do({ type: 'play', uid, ...o, target }));
  }

  withTarget(eff, done) {
    const valid = eff ? effectTargets(this.G, 0, eff) : [];
    if (!eff || !valid.length) return done(undefined);
    const what = { damage: `infliger ${eff.amount} dégât(s)`, banish: 'bannir', return: 'renvoyer en main', exert: 'épuiser', heal: 'soigner', buffStr: `${eff.amount > 0 ? '+' : ''}${eff.amount} force`, buffLore: `+${eff.amount} lore`, grant: `donner ${eff.grants?.join(' et ')}`, ready: 'redresser' }[eff.kind] || 'cibler';
    this.targeting = { prompt: `Choisis un personnage : ${what}`, valid, optional: eff.optional, done };
    this.sel = null;
    this.render();
  }

  do(a) {
    this.zoom = false; // après une action, on revient au plateau pour voir le résultat
    const r = applyAction(this.G, a);
    if (!r.ok) toast(r.error);
    [a.uid, a.target].forEach(u => u != null && this.flash.add(u));
    // on garde la sélection seulement si le personnage peut encore agir
    const still = a.uid != null && findInst(this.G, a.uid);
    if (!still || still.zone !== 'play' || (!canQuest(this.G, 0, a.uid) && !challengeTargets(this.G, 0, a.uid).length)) this.sel = null;
    this.render();
    this.checkEnd();
  }

  // Mode auto : l'ordinateur joue le tour du joueur, une action à la fois
  runMe() {
    if (current !== this) return;
    const G = this.G;
    if (!this.auto || G.over || G.active !== 0) { this.busy = false; this.render(); return this.checkEnd(); }
    this.busy = true;
    const a = aiNextAction(G, 'normal');
    if (!applyAction(G, a).ok) applyAction(G, { type: 'end' });
    [a.uid, a.target].forEach(u => u != null && this.flash.add(u));
    this.render();
    setTimeout(() => (a.type === 'end' ? this.runAI() : this.runMe()), this.delay(a));
  }

  runAI() {
    if (current !== this) return;
    const G = this.G;
    if (G.over || G.active !== 1) {
      this.busy = false; this.render();
      if (this.auto && !G.over) return setTimeout(() => this.runMe(), 400);
      return this.checkEnd();
    }
    this.busy = true;
    const a = aiNextAction(G, this.diff);
    const r = applyAction(G, a);
    if (!r.ok) applyAction(G, { type: 'end' });
    [a.uid, a.target].forEach(u => u != null && this.flash.add(u));
    this.render();
    setTimeout(() => this.runAI(), this.delay(a));
  }

  async checkEnd() {
    const G = this.G;
    if (!G.over || this.ended) return;
    this.ended = true;
    const won = G.winner === 0;
    let reward = 0;
    try { reward = (await api('/api/battle', { won, difficulty: this.diff })).reward; } catch (e) { toast(e.message); }
    const ov = document.createElement('div');
    ov.className = 'end-screen';
    ov.innerHTML = `<h1>${won ? 'Victoire !' : 'Défaite…'}</h1><p>${esc(G.reason || '')}</p><p class="pill">+${reward} 🪙</p>
      <div class="row"><button class="btn gold" id="again">Rejouer</button><button class="btn" id="back">Retour</button></div>`;
    document.body.appendChild(ov);
    const leave = () => { ov.remove(); document.body.classList.remove('in-battle'); this.view.onclick = null; this.view.oncontextmenu = null; };
    $('#again', ov).onclick = () => { leave(); start(this.view); };
    $('#back', ov).onclick = () => { leave(); renderBattle(this.view); };
  }
}
