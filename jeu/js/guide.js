// Guide d'un deck : explique simplement comment le jouer (style, encrier, combos, plan de jeu, cartes clés).
// Tout est déduit des cartes du deck et des règles du moteur de combat.
import { parseCard, RULES } from './engine.js';

// Noms officiels français des mots-clés
export const KW_FR = { evasive: 'Insaisissable', rush: 'Charge', ward: "Hors d'atteinte", bodyguard: 'Rempart', reckless: 'Combattant',
  support: 'Soutien', vanish: 'Dissipation', alert: 'Agilité', shift: 'Alter', challenger: 'Offensif', resist: 'Résistance',
  singer: 'Mélomane', singTogether: "À l'unisson" };
export const kwLabel = (k, v) => (v === true ? KW_FR[k] || k : `${KW_FR[k] || k} ${k === 'challenger' || k === 'resist' ? '+' : ''}${v}`);

const REMOVAL = ['damage', 'damageAllOpp', 'banish', 'banishAll', 'return', 'exert', 'oppBanishOwn'];
const value = c => c.kind === 'character' ? c.lore * 2.2 + c.str * 0.9 + c.wil * 0.7 + (c.kw.evasive ? 1.2 : 0) + (c.kw.ward ? 0.6 : 0) + c.abilities.length * 0.8 : 2 + c.cost * 0.5;
const fx = c => [...(c.effects || []), ...c.abilities.flatMap(a => a.effects)];

/**
 * @param rows lignes de cartes du deck (avec les champs d'affichage : name, full_name, text…)
 * @returns { style, ink, combos, plan, keys, warnings, stats }
 */
export function deckGuide(rows) {
  // une entrée par carte différente
  const by = new Map();
  for (const r of rows) {
    const k = r.full_name;
    if (!by.has(k)) by.set(k, { row: r, c: parseCard(r), n: 0 });
    by.get(k).n++;
  }
  const all = [...by.values()];
  const chars = all.filter(x => x.c.kind === 'character');
  const nChars = chars.reduce((s, x) => s + x.n, 0) || 1;
  const sum = f => all.reduce((s, x) => s + f(x) * x.n, 0);
  const avgLore = chars.reduce((s, x) => s + x.c.lore * x.n, 0) / nChars;
  const avgStr = chars.reduce((s, x) => s + x.c.str * x.n, 0) / nChars;
  const evasive = sum(x => x.c.kw.evasive ? 1 : 0);
  const removal = sum(x => fx(x.c).some(e => REMOVAL.includes(e.kind)) ? 1 : 0);
  const inkable = sum(x => x.c.inkable ? 1 : 0);
  const total = rows.length;
  const avgCost = sum(x => x.c.cost) / total;
  const name = x => x.row.full_name;
  const short = x => x.row.name;
  const list = xs => xs.map(name);

  // ---------------------------------------------------------------- Style
  const questScore = avgLore * 1.6 + evasive * 0.12;
  const fightScore = avgStr * 0.8 + removal * 0.3 + sum(x => x.c.kw.challenger ? 1 : 0) * 0.15;
  let style;
  if (questScore > fightScore + 0.4) style = { icon: '◆', title: 'Course au lore',
    text: `Ton deck gagne en <b>envoyant ses personnages en quête</b> le plus souvent possible (${avgLore.toFixed(1)} lore en moyenne par personnage${evasive ? `, ${evasive} carte(s) ${KW_FR.evasive}` : ''}). Pose des personnages tôt, quête à chaque tour, et ne défie que si c'est sans risque ou pour arrêter un gros quêteur adverse.` };
  else if (fightScore > questScore + 0.4) style = { icon: '⚔', title: 'Contrôle et défis',
    text: `Ton deck est fait pour <b>se battre</b> (force moyenne ${avgStr.toFixed(1)}${removal ? `, ${removal} carte(s) qui éliminent ou gênent l'adversaire` : ''}). Élimine les personnages adverses qui quêtent, garde le plateau sous contrôle, puis gagne la course au lore quand l'adversaire n'a plus rien.` };
  else style = { icon: '⚖', title: 'Équilibré',
    text: `Ton deck sait <b>quêter et se battre</b>. Règle simple : quête avec tes personnages qui rapportent beaucoup de lore, et défie avec les plus costauds quand un personnage adverse épuisé peut être banni sans perdre le tien.` };

  // ---------------------------------------------------------------- Encrier
  const sortedCosts = rows.map(r => parseCard(r).cost).sort((a, b) => a - b);
  const target = Math.min(7, Math.max(4, sortedCosts[Math.floor(sortedCosts.length * 0.85)] || 5));
  const inkFirst = all.filter(x => x.c.inkable).sort((a, b) => (value(a.c) + (a.c.battleLegal ? 0 : -20)) - (value(b.c) + (b.c.battleLegal ? 0 : -20))).slice(0, 4);
  const keepers = all.filter(x => x.c.battleLegal && x.c.inkable).sort((a, b) => value(b.c) - value(a.c)).slice(0, 4).filter(x => !inkFirst.includes(x));
  const notInkable = all.filter(x => !x.c.inkable);
  const ink = {
    target,
    text: `Mets <b>une carte dans l'encrier à chaque tour</b> jusqu'à avoir environ <b>${target} encres</b> (de quoi jouer tes cartes les plus chères), puis seulement si ta main est pleine de cartes que tu ne peux pas jouer.`,
    first: list(inkFirst),
    keep: list(keepers),
    never: list(notInkable),
  };

  // ---------------------------------------------------------------- Combos
  const combos = [];
  const add = (icon, title, text, cards) => { if (!combos.some(c => c.title === title)) combos.push({ icon, title, text, cards }); };
  // Alter (Shift)
  for (const x of all.filter(x => x.c.kw.shift != null)) {
    const base = all.find(y => y !== x && y.c.name === x.c.name);
    if (base) add('⬆', `Alter : ${short(x)}`,
      `Joue d'abord <b>${name(base)}</b>, puis pose <b>${name(x)}</b> par-dessus avec Alter pour <b>${x.c.kw.shift} encres</b> au lieu de ${x.c.cost}. Si ${short(base)} était déjà en jeu depuis un tour, la nouvelle version peut agir tout de suite.`, [base.row.id, x.row.id]);
  }
  // Chansons
  for (const s of all.filter(x => x.c.isSong && x.c.battleLegal)) {
    const singers = chars.filter(y => Math.max(y.c.cost, y.c.kw.singer || 0) >= s.c.cost).sort((a, b) => a.c.lore - b.c.lore).slice(0, 2);
    if (singers.length) add('🎵', `Chanson gratuite : ${short(s)}`,
      `Au lieu de payer ${s.c.cost} encres, fais chanter <b>${singers.map(name).join('</b> ou <b>')}</b> (il doit être en jeu depuis un tour ; il s'épuise et ne quête pas ce tour). Idéal avec un personnage qui rapporte peu de lore.`, [s.row.id, ...singers.map(y => y.row.id)]);
  }
  // Redresser après une quête
  const readiers = all.filter(x => fx(x.c).some(e => e.kind === 'ready'));
  const bestQuester = chars.slice().sort((a, b) => b.c.lore - a.c.lore)[0];
  for (const r of readiers) if (bestQuester) add('🔄', `Double quête avec ${short(r)}`,
    `Envoie <b>${name(bestQuester)}</b> en quête (+${bestQuester.c.lore} lore), puis joue <b>${name(r)}</b> pour le redresser : il peut quêter une deuxième fois dans le même tour.`, [bestQuester.row.id, r.row.id]);
  // Bonus de lore
  for (const b of all.filter(x => fx(x.c).some(e => e.kind === 'buffLore'))) if (bestQuester) add('✨', `Lore bonus : ${short(b)}`,
    `Utilise <b>${name(b)}</b> sur un personnage qui va quêter ce tour (par exemple <b>${short(bestQuester)}</b>) pour gagner encore plus de lore.`, [b.row.id, bestQuester.row.id]);
  // Dégâts puis défi
  const pingers = all.filter(x => fx(x.c).some(e => e.kind === 'damage' || e.kind === 'damageAllOpp'));
  const fighters = chars.filter(x => x.c.kw.challenger || x.c.str >= 3).sort((a, b) => (b.c.str + (b.c.kw.challenger || 0)) - (a.c.str + (a.c.kw.challenger || 0)));
  if (pingers.length && fighters.length) add('💥', 'Abîmer puis achever',
    `Inflige des dégâts avec <b>${pingers.slice(0, 2).map(name).join('</b> ou <b>')}</b>, puis termine le personnage adverse en le défiant avec <b>${name(fighters[0])}</b> : il est banni et ton personnage prend moins de risques.`, [...pingers.slice(0, 2).map(x => x.row.id), fighters[0].row.id]);
  // Soutien
  const supporters = chars.filter(x => x.c.kw.support);
  if (supporters.length && fighters.length) add('🤝', `${KW_FR.support} : quête puis défi`,
    `Quand <b>${name(supporters[0])}</b> part en quête, sa force s'ajoute à ton meilleur personnage encore prêt pour le reste du tour : enchaîne avec un défi de <b>${short(fighters[0])}</b> pour bannir un plus gros personnage.`, [supporters[0].row.id, fighters[0].row.id]);
  // Rempart
  const guards = chars.filter(x => x.c.kw.bodyguard), questers = chars.filter(x => x.c.lore >= 2 && !x.c.kw.bodyguard);
  if (guards.length && questers.length) add('🛡', `${KW_FR.bodyguard} : protège tes quêteurs`,
    `Tant que <b>${name(guards[0])}</b> est épuisé en jeu, l'adversaire doit le défier en premier : ça protège tes personnages qui rapportent beaucoup de lore comme <b>${short(questers[0])}</b>.`, [guards[0].row.id, questers[0].row.id]);
  // Insaisissable
  const ev = chars.filter(x => x.c.kw.evasive).sort((a, b) => b.c.lore - a.c.lore);
  if (ev.length >= 2) add('🕊', `${KW_FR.evasive} : les quêteurs intouchables`,
    `Seuls les personnages ${KW_FR.evasive} peuvent défier <b>${ev.slice(0, 3).map(short).join(', ')}</b> : envoie-les en quête à chaque tour, ils risquent très peu.`, ev.slice(0, 3).map(x => x.row.id));
  // Charge
  const rushers = chars.filter(x => x.c.kw.rush);
  if (rushers.length) add('⚡', `${KW_FR.rush} : défier tout de suite`,
    `<b>${rushers.slice(0, 2).map(name).join('</b> et <b>')}</b> peuvent défier le tour où ils arrivent : garde-les pour punir un personnage adverse qui vient de quêter.`, rushers.slice(0, 2).map(x => x.row.id));

  // ---------------------------------------------------------------- Plan de jeu
  const byCost = (lo, hi) => all.filter(x => x.c.battleLegal && x.c.cost >= lo && x.c.cost <= hi).sort((a, b) => value(b.c) - value(a.c)).slice(0, 3).map(short);
  const early = byCost(1, 2), mid = byCost(3, 4), late = byCost(5, 99);
  const plan = [
    { when: 'Tours 1 et 2', text: `Encre une carte à chaque tour. ${early.length ? `Joue tes petits personnages (<b>${early.join('</b>, <b>')}</b>) pour pouvoir quêter dès le tour suivant.` : 'Tu as peu de cartes pas chères : concentre-toi sur l\'encrier.'}` },
    { when: 'Tours 3 et 4', text: `${mid.length ? `Pose tes cartes à 3-4 encres (<b>${mid.join('</b>, <b>')}</b>). ` : ''}Commence à quêter avec tout ce qui est prêt, et défie les personnages adverses épuisés qui rapportent beaucoup de lore.` },
    { when: 'Tours 5 et plus', text: `${late.length ? `Sors tes grosses cartes (<b>${late.join('</b>, <b>')}</b>). ` : ''}Garde un ou deux personnages costauds pour défier les quêteurs adverses, et continue de quêter avec les autres.` },
    { when: 'Fin de partie', text: `Compte : si tes personnages prêts peuvent t'amener à ${RULES.LORE_TO_WIN} lore ce tour, <b>quête avec tout le monde</b> sans défier. Si c'est l'adversaire qui est proche de ${RULES.LORE_TO_WIN}, élimine en priorité ses personnages qui rapportent le plus.` },
  ];

  // ---------------------------------------------------------------- Cartes clés
  const keys = all.filter(x => x.c.battleLegal).sort((a, b) => value(b.c) * (1 + 0.2 * b.n) - value(a.c) * (1 + 0.2 * a.n)).slice(0, 4).map(x => {
    const why = [];
    if (x.c.kind === 'character') {
      if (x.c.lore >= 2) why.push(`rapporte ${x.c.lore} lore par quête`);
      if (x.c.str >= 4) why.push(`${x.c.str} de force pour les défis`);
      const kws = Object.entries(x.c.kw).filter(([k]) => KW_FR[k] && k !== 'singTogether').map(([k, v]) => kwLabel(k, v));
      if (kws.length) why.push(kws.join(', '));
      if (x.c.abilities.length) why.push(`capacité « ${x.c.abilities.map(a => a.label).filter(Boolean).join(', ') || 'spéciale'} » appliquée en combat`);
    } else why.push('effet appliqué automatiquement en combat');
    return { id: x.row.id, name: name(x), n: x.n, why: why.join(' · ') || 'solide pour son coût' };
  });

  // ---------------------------------------------------------------- Points faibles
  const warnings = [];
  if (total < RULES.DECK_SIZE) warnings.push(`Le deck n'a que ${total} cartes sur ${RULES.DECK_SIZE} : complète-le pour pouvoir combattre.`);
  if (inkable / total < 0.7) warnings.push(`Seulement ${inkable} cartes sur ${total} peuvent aller dans l'encrier : tu risques de manquer d'encre. Vise au moins ${Math.ceil(total * 0.7)} cartes encrables.`);
  if (avgCost > 4) warnings.push(`Le deck est cher (coût moyen ${avgCost.toFixed(1)}) : les premiers tours seront lents, ajoute des cartes à 1-2 encres si tu peux.`);
  if (!removal) warnings.push(`Aucune carte pour éliminer les personnages adverses en dehors des défis : face à des personnages ${KW_FR.evasive}, tu devras gagner la course au lore.`);
  if (chars.length && nChars < total * 0.6) warnings.push(`Peu de personnages (${nChars}) : ce sont eux qui rapportent le lore, garde-en au moins ${Math.ceil(total * 0.6)}.`);

  return { style, ink, combos: combos.slice(0, 6), plan, keys, warnings,
    stats: { total, inkable, avgCost, avgLore, avgStr, evasive, removal, chars: nChars } };
}
