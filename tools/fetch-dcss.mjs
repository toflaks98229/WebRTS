/**
 * Pulls the UI icons this game uses from Dungeon Crawl Stone Soup's rltiles.
 *
 * DCSS states that *most* of its tiles are CC0 but that "the licensing
 * situation may be complex, especially for older pieces", and maintains an
 * exclusion list of art whose ownership could not be established:
 *   https://github.com/crawl/tiles  ->  TILES_UNDER_UNKNOWN_LICENSE.md
 *
 * So this tool refuses to download anything on that list, and fails loudly
 * rather than quietly shipping a tile we cannot licence. The check runs on
 * every fetch, not once at authoring time, so the list staying authoritative
 * is not something we have to remember.
 *
 * Usage:  node tools/fetch-dcss.mjs
 * Output: assets/dcss/<id>.png  +  assets/dcss/manifest.json
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CRAWL = 'crawl/crawl';
const RAW = `https://raw.githubusercontent.com/${CRAWL}/master/crawl-ref/source/rltiles/`;
const EXCLUDE_URL = 'https://raw.githubusercontent.com/crawl/tiles/master/TILES_UNDER_UNKNOWN_LICENSE.md';
const OUT = path.resolve(fileURLToPath(new URL('../assets/dcss', import.meta.url)));

/**
 * iconId -> tile path under rltiles.
 * Ids are what the UI asks for; see src/ui/icons.js.
 */
const ICONS = {
  // ---- weapon / equipment, shown in the shop, stash and roster ----
  'item.shortSword':   'item/weapon/short_sword1.png',
  'item.armingSword':  'item/weapon/long_sword1.png',
  'item.greatsword':   'item/weapon/greatsword1.png',
  'item.handAxe':      'item/weapon/hand_axe1.png',
  'item.battleAxe':    'item/weapon/battle_axe1.png',
  'item.woodenClub':   'item/weapon/club.png',
  'item.mace':         'item/weapon/mace1.png',
  'item.warhammer':    'item/weapon/hammer1.png',
  'item.spear':        'item/weapon/spear1.png',
  'item.pike':         'item/weapon/partisan1.png',
  'item.dagger':       'item/weapon/dagger.png',
  'item.shortBow':     'item/weapon/ranged/shortbow1.png',
  'item.warBow':       'item/weapon/ranged/longbow1.png',
  'item.crossbow':     'item/weapon/ranged/arbalest1.png',
  // Every javelin tile is on the exclusion list; a trident reads the same at 32px.
  'item.javelin':      'item/weapon/trident1.png',

  'item.woodenShield': 'item/armour/shields/buckler1.png',
  'item.heaterShield': 'item/armour/shields/kite_shield1.png',
  'item.kiteShield':   'item/armour/shields/tower_shield1.png',

  'item.rags':         'item/armour/animal_skin1.png',
  'item.gambeson':     'item/armour/robe1.png',
  'item.leatherArmor': 'item/armour/leather_armour1.png',
  'item.mailShirt':    'item/armour/chain_mail1.png',
  'item.scaleArmor':   'item/armour/scale_mail1.png',
  'item.plateArmor':   'item/armour/plate1.png',

  'item.hood':         'item/armour/headgear/hat1.png',
  'item.leatherCap':   'item/armour/headgear/elven_leather_helm.png',
  'item.mailCoif':     'item/armour/headgear/helmet1.png',
  'item.kettleHat':    'item/armour/headgear/helmet2.png',
  'item.nasalHelm':    'item/armour/headgear/helmet3.png',
  'item.greatHelm':    'item/armour/headgear/helmet4.png',

  // ---- battle skills, shown on the action bar ----
  'skill.blade':   'gui/skills/long_blades.png',
  'skill.axe':     'gui/skills/axes.png',
  'skill.blunt':   'gui/skills/maces_flails.png',
  'skill.polearm': 'gui/skills/polearms.png',
  'skill.knife':   'gui/skills/short_blades.png',
  'skill.bow':     'gui/skills/bows.png',
  'skill.crossbow':'item/weapon/ranged/arbalest1.png',
  'skill.throw':   'gui/skills/throwing.png',
  'skill.shield':  'gui/skills/shields.png',
  'skill.brawl':   'gui/skills/fighting.png',
  'skill.breathe': 'gui/mutations/regeneration_1.png',

  // ---- perks ----
  'perk.brawny':        'gui/mutations/strong_1.png',
  'perk.colossus':      'gui/mutations/robust_2.png',
  'perk.steelBrow':     'gui/mutations/large_bone_plates_1.png',
  'perk.pathfinder':    'gui/mutations/hooves_1.png',
  'perk.bagsAndBelts':  'gui/mutations/thin_skeletal_structure_1.png',
  'perk.fortifiedMind': 'gui/mutations/strong_willed_2.png',
  'perk.student':       'gui/mutations/big_brain_1.png',
  'perk.crippling':     'gui/mutations/stinger_1.png',
  'perk.shieldExpert':  'gui/skills/shields.png',
  'perk.underdog':      'gui/mutations/black_mark.png',
  'perk.backstabber':   'gui/mutations/camouflage_1.png',
  'perk.anticipation':  'gui/mutations/acute_vision.png',
  'perk.duelist':       'gui/skills/short_blades.png',
  'perk.bruteForce':    'gui/mutations/strong_2.png',
  'perk.battleForged':  'gui/skills/armour.png',
  'perk.nimble':        'gui/skills/dodging.png',
  'perk.berserk':       'gui/mutations/stampede_1.png',
  'perk.overwhelm':     'gui/mutations/booming_voice.png',
  'perk.lastStand':     'gui/mutations/sanguine_armour_1.png',
  'perk.killerInstinct':'gui/mutations/claws_2.png',
  'perk.nineLives':     'gui/mutations/multilived.png',
  'perk.indomitable':   'gui/mutations/clarity.png',
  'perk.executioner':   'gui/mutations/mark_of_execution.png',
  'perk.relentless':    'gui/mutations/efficient_metabolism.png',

  // ---- captain tree ----
  'captain.rally':         'gui/mutations/scream_1.png',
  'captain.discipline':    'gui/mutations/large_bone_plates_2.png',
  'captain.banner':        'gui/mutations/mark_of_the_fanatic.png',
  'captain.veterans':      'gui/skills/long_blades.png',
  'captain.quartermaster': 'gui/mutations/lucky_1.png',
  'captain.haggler':       'gui/mutations/lucky_2.png',
  'captain.negotiator':    'gui/mutations/initially_attractive_1.png',
  'captain.surgeon':       'gui/abilities/heal_wounds.png',
  'captain.champion':      'gui/mutations/mark_of_the_celebrant.png',
  'captain.inspiring':     'gui/mutations/divine_attributes.png',
  'captain.unbreakable':   'gui/mutations/strong_willed_3.png',
  'captain.warlord':       'gui/mutations/mark_of_the_tyrant.png',
};

async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  throw new Error(`could not fetch ${url}`);
}

async function main() {
  console.log('reading DCSS exclusion list...');
  const res = await get(EXCLUDE_URL);
  if (!res) throw new Error('exclusion list unavailable - refusing to download tiles blind');
  const excluded = new Set(
    (await res.text()).split('\n')
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim().toLowerCase()),
  );
  console.log(`  ${excluded.size} tiles are off limits\n`);

  const manifest = {
    source: `https://github.com/${CRAWL}`,
    licence: 'CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)',
    licenceNote: 'Verified against https://github.com/crawl/tiles TILES_UNDER_UNKNOWN_LICENSE.md',
    icons: {},
  };
  const blocked = [];
  const failed = [];
  let bytes = 0;

  for (const [id, rel] of Object.entries(ICONS)) {
    const base = rel.split('/').pop().toLowerCase();
    if (excluded.has(base)) { blocked.push(`${id} -> ${rel}`); continue; }

    const dest = path.join(OUT, `${id}.png`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const r = await get(RAW + rel);
    if (!r) { failed.push(`${id} -> ${rel} (404)`); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    await fs.writeFile(dest, buf);
    bytes += buf.length;
    manifest.icons[id] = rel;
  }

  if (blocked.length || failed.length) {
    console.error('manifest NOT written:');
    blocked.forEach((b) => console.error(`  BLOCKED (unclear licence)  ${b}`));
    failed.forEach((f) => console.error(`  MISSING                    ${f}`));
    process.exitCode = 1;
    return;
  }

  await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`${Object.keys(manifest.icons).length} icons, ${(bytes / 1024).toFixed(0)} KB -> ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
