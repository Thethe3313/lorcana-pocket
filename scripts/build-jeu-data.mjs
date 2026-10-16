// Construit jeu/data/cards.json à partir de LorcanaJSON (https://lorcanajson.org), en français et en anglais.
// Le texte anglais sert au moteur de combat (analyse des effets), le français à l'affichage.
// Si data/lorcana.db existe, ajoute aussi les noms, textes et images en français à la base SQLite.
// Usage : node scripts/build-jeu-data.mjs
import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const get = async lang => {
  const res = await fetch(`https://lorcanajson.org/files/current/${lang}/allCards.json`);
  if (!res.ok) throw new Error(`LorcanaJSON ${lang} : HTTP ${res.status}`);
  return res.json();
};
const [en, fr] = await Promise.all([get('en'), get('fr')]);
const frById = new Map(fr.cards.map(c => [c.id, c]));

const RARITY = { 'Super Rare': 'Super_rare', Special: 'Promo' };
const inksOf = color => (color ? color.split('-') : []);
// Un paragraphe par capacité, sans les retours à la ligne de mise en page de la carte
const unwrap = s => s.replace(/\s*\n\s*/g, ' ');
const textOf = c => (c.fullTextSections?.length ? c.fullTextSections.map(unwrap).join('\n') : (c.fullText || ''));
const flavorOf = c => (c.flavorText ? unwrap(c.flavorText) : null);

const cards = en.cards.map(e => {
  const f = frById.get(e.id);
  const inks = inksOf(e.color);
  const types = [e.type, ...(e.subtypes || []).filter(s => s === 'Song')];
  const card = {
    id: String(e.id),
    set_code: e.setCode,
    collector_number: String(e.number),
    card_type: e.type,
    types,
    ink: inks.length === 1 ? inks[0] : null,
    inks,
    cost: e.cost ?? null,
    inkwell: e.inkwell ? 1 : 0,
    strength: e.strength ?? null,
    willpower: e.willpower ?? null,
    lore: e.lore ?? null,
    move_cost: e.moveCost ?? null,
    rarity: RARITY[e.rarity] || e.rarity,
    keywords: e.keywordAbilities || [],
    classifications: e.subtypes || [],
    artists: e.artistsText || '',
    // anglais (moteur + affichage optionnel)
    name_en: e.name, version_en: e.version || null, full_name_en: e.fullName, text_en: textOf(e),
    flavor_en: flavorOf(e), img_en: e.images?.full || null, thumb_en: e.images?.thumbnail || null,
  };
  if (f) Object.assign(card, {
    name_fr: f.name, version_fr: f.version || null, full_name_fr: f.fullName, text_fr: textOf(f),
    flavor_fr: flavorOf(f), img_fr: f.images?.full || null, thumb_fr: f.images?.thumbnail || null,
    classifications_fr: f.subtypes || [],
  });
  return card;
});
const setOrder = c => (/^\d+$/.test(c.set_code) ? c.set_code.padStart(4, '0') : `z${c.set_code}`);
cards.sort((a, b) => setOrder(a).localeCompare(setOrder(b)) || Number(a.collector_number) - Number(b.collector_number));

const sets = Object.entries(en.sets).filter(([code]) => cards.some(c => c.set_code === code)).map(([code, s]) => ({
  code, name_en: s.name, name_fr: fr.sets[code]?.name || s.name, released_at: s.releaseDate || null,
  card_count: cards.filter(c => c.set_code === code).length,
}));

const out = { generatedOn: en.metadata.generatedOn, source: 'LorcanaJSON (lorcanajson.org)', sets, cards };
writeFileSync(join(ROOT, 'jeu', 'data', 'cards.json'), JSON.stringify(out));
console.log(`${cards.length} cartes (${cards.filter(c => c.name_fr).length} en français), ${sets.length} sets -> jeu/data/cards.json`);

// ---------- Base SQLite : colonnes en français ----------
const dbPath = join(ROOT, 'data', 'lorcana.db');
if (existsSync(dbPath)) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath);
  const cols = db.prepare('PRAGMA table_info(cards)').all().map(c => c.name);
  for (const c of ['name_fr', 'version_fr', 'full_name_fr', 'text_fr', 'flavor_text_fr', 'image_url_fr', 'thumb_url_fr', 'lorcanajson_id'])
    if (!cols.includes(c)) db.exec(`ALTER TABLE cards ADD COLUMN ${c} ${c === 'lorcanajson_id' ? 'INTEGER' : 'TEXT'}`);
  const upd = db.prepare(`UPDATE cards SET name_fr = ?, version_fr = ?, full_name_fr = ?, text_fr = ?, flavor_text_fr = ?, image_url_fr = ?, thumb_url_fr = ?, lorcanajson_id = ?
    WHERE set_code = ? AND collector_number = ?`);
  let n = 0;
  db.exec('BEGIN');
  for (const c of cards) if (c.name_fr)
    n += Number(upd.run(c.name_fr, c.version_fr, c.full_name_fr, c.text_fr, c.flavor_fr, c.img_fr, c.thumb_fr, Number(c.id), c.set_code, c.collector_number).changes);
  db.exec('COMMIT');
  console.log(`Base SQLite : ${n} cartes complétées en français`);
}
