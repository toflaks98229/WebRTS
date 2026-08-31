/**
 * Downloads the handful of LPC spritesheets this game actually renders.
 *
 * The upstream repository is ~1.5 GB, so cloning is out of the question. Instead
 * we read its `sheet_definitions/*.json`, resolve each layer's real file path by
 * probing the candidate URL shapes it uses, and pull only those PNGs (~1 MB).
 *
 * Usage:  node tools/fetch-lpc.mjs
 * Output: assets/lpc/**.png  +  assets/lpc/manifest.json
 *
 * Art is CC-BY-SA 3.0 / GPL-3.0 - see CREDITS.md.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator';
const BRANCH = 'master';
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
const DEFS = `${RAW}sheet_definitions/`;
// Layer paths in the definitions are relative to this directory.
const SHEETS = 'spritesheets/';
const OUT = path.resolve(fileURLToPath(new URL('../assets/lpc', import.meta.url)));

/** Animations we render. Everything else in LPC is skipped. */
const ANIMS = ['idle', 'walk', 'slash', 'thrust', 'shoot'];

/** Body type used for every sprite - keeps the layer set small and consistent. */
const BODY = 'male';

/** Preferred colour variants, first hit wins. */
const VARIANTS = ['steel', 'iron', 'silver', 'brown', 'wood', 'gray', 'grey', 'tan', 'black', 'white', 'blue', 'red'];

/**
 * gameId -> LPC sheet-definition name. gameIds line up with src/data/items.js
 * so the renderer can look a unit's equipment straight up.
 */
const WANT = {
  // --- base ---
  'body':            'body',
  'head':            'heads_human_male',
  'legs':            'legs_pants',
  'legsArmor':       'legs_armour',
  'feet':            'feet_boots_basic',

  // --- body armour ---
  'rags':            'torso_clothes_tunic',
  'gambeson':        'torso_clothes_longsleeve',
  'leatherArmor':    'torso_armour_leather',
  'mailShirt':       'torso_chainmail',
  'scaleArmor':      'torso_armour_legion',
  'plateArmor':      'torso_armour_plate',

  // --- helmets ---
  'hood':            'hat_hood_cloth',
  'leatherCap':      'hat_cap_leather',
  'mailCoif':        'hat_helmet_mail',
  'kettleHat':       'hat_helmet_kettle',
  'nasalHelm':       'hat_helmet_nasal',
  'greatHelm':       'hat_helmet_greathelm',

  // --- weapons ---
  'shortSword':      'weapon_sword_arming',
  'armingSword':     'weapon_sword_arming',
  'greatsword':      'weapon_sword_longsword',
  'handAxe':         'tool_axe',
  'battleAxe':       'weapon_blunt_waraxe',
  'woodenClub':      'weapon_blunt_club',
  'mace':            'weapon_blunt_mace',
  'warhammer':       'weapon_blunt_mace',
  'spear':           'weapon_polearm_spear',
  'pike':            'weapon_polearm_longspear',
  'dagger':          'weapon_sword_dagger',
  'shortBow':        'weapon_ranged_bow_normal',
  'warBow':          'weapon_ranged_bow_great',
  'crossbow':        'weapon_ranged_crossbow',
  'javelin':         'weapon_polearm_spear',

  // --- shields ---
  'woodenShield':    'shield_round',
  'heaterShield':    'shield_heater_wood',
  'kiteShield':      'shield_kite',
};

// ---------------------------------------------------------------- helpers
const cache = new Map();
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

async function head(url) {
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url, { method: 'HEAD' });
  cache.set(url, r.ok);
  return r.ok;
}

/** Not every item ships a male sheet; fall back through the other body types. */
function layerBase(L) {
  for (const k of [BODY, 'muscular', 'adult', 'male', 'female', 'thin', 'teen']) {
    if (L[k]) return L[k];
  }
  return null;
}

/**
 * Which animations a layer applies to. Weapon layers are often pose-specific
 * (".../attack_slash/fg/"), and reusing those sheets for idle would draw the
 * character mid-swing while standing still.
 */
function animsFor(base) {
  const p = base.toLowerCase();
  // Alternate swing poses we never play - keeping them would stack two weapons.
  for (const skip of ['attack_backslash', 'attack_halfslash', 'attack_slash_reverse']) {
    if (p.includes(skip)) return [];
  }
  for (const a of ['slash', 'thrust', 'shoot', 'walk', 'idle']) {
    if (p.includes(`attack_${a}`) || new RegExp(`/${a}/?$`).test(p)) return [a];
  }
  return ANIMS;
}

/** LPC stores layer files under several shapes; try each in turn. */
function candidates(base, anim, variant) {
  const b = base.endsWith('/') ? base : base + '/';
  const out = [`${b}${anim}.png`];
  if (variant) {
    out.push(`${b}${anim}/${variant}.png`);
    // Paths that already name the animation (".../foreground/walk/") take the
    // variant directly as the filename.
    out.push(`${b}${variant}.png`);
  }
  out.push(`${base}.png`);                 // e.g. "tools/axe/bg" -> "tools/axe/bg.png"
  return out;
}

async function resolveFile(base, anim, variants) {
  // Definition variants are display names ("kite blue blue"); files use underscores.
  const names = variants.flatMap((v) => (v.includes(' ') ? [v.replace(/ /g, '_'), v] : [v]));
  for (const v of [null, ...names]) {
    for (const url of candidates(base, anim, v)) {
      if (await head(RAW + SHEETS + enc(url))) return url;
    }
  }
  return null;
}

async function download(rel) {
  const dest = path.join(OUT, rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try {
    const st = await fs.stat(dest);
    if (st.size > 0) return st.size;        // already have it
  } catch { /* not downloaded yet */ }
  const r = await fetch(RAW + SHEETS + enc(rel));
  if (!r.ok) return 0;
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(dest, buf);
  return buf.length;
}

// ---------------------------------------------------------------- main
async function main() {
  console.log('resolving sheet definitions...');
  const tree = await (await fetch(
    `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`)).json();
  if (!tree.tree) throw new Error('could not read repo tree (rate limited?)');
  const defPaths = tree.tree
    .filter((t) => t.type === 'blob' && t.path.startsWith('sheet_definitions/') && t.path.endsWith('.json'))
    .map((t) => t.path.replace('sheet_definitions/', ''));

  const manifest = { source: `https://github.com/${REPO}`, license: 'CC-BY-SA 3.0 / GPL-3.0', items: {} };
  let bytes = 0;
  let files = 0;

  for (const [gameId, defName] of Object.entries(WANT)) {
    const defPath = defPaths.find((p) => p.endsWith(`/${defName}.json`) || p === `${defName}.json`);
    if (!defPath) { console.warn(`  ! no definition for ${gameId} (${defName})`); continue; }

    const def = await (await fetch(DEFS + defPath)).json();
    const variants = (def.variants || []).length
      ? [...VARIANTS.filter((v) => def.variants.includes(v)), ...def.variants]
      : [];

    const layers = [];
    for (const key of Object.keys(def).filter((k) => k.startsWith('layer_'))) {
      const L = def[key];
      const base = layerBase(L);
      if (!base) continue;

      const frames = {};
      const allowed = animsFor(base);
      // A custom animation only counts for layers we actually render a pose for.
      const anims = (L.custom_animation && allowed.length) ? [...allowed, L.custom_animation] : allowed;
      for (const anim of anims) {
        const rel = await resolveFile(base, anim, variants);
        if (!rel) continue;
        const n = await download(rel);
        if (!n) continue;
        bytes += n; files++;
        frames[anim === L.custom_animation ? 'slash' : anim] = rel;
      }
      if (Object.keys(frames).length) layers.push({ z: L.zPos ?? 50, frames });
    }

    if (!layers.length) { console.warn(`  ! no files resolved for ${gameId}`); continue; }
    layers.sort((a, b) => a.z - b.z);
    manifest.items[gameId] = { name: def.name, def: defName, layers };
    console.log(`  ${gameId.padEnd(14)} ${def.name} - ${layers.length} layer(s), ${layers.reduce((s, l) => s + Object.keys(l.frames).length, 0)} sheets`);
  }

  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n${files} files, ${(bytes / 1024).toFixed(0)} KB -> ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
