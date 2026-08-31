/**
 * Builds assets/lpc/ATTRIBUTION.md from the credit data LPC ships alongside its
 * spritesheets. CC-BY-SA obliges us to name every artist, and doing it by hand
 * would drift the moment the asset list changes.
 *
 * Run standalone to backfill credits into an existing manifest:
 *   node tools/lpc-attribution.mjs
 *
 * `fetch-lpc.mjs` imports `attribution()` so a full asset refresh writes the
 * same file. Kept separate because it needs only ~35 requests, while a full
 * refresh needs thousands and is the first thing to hit rate limits.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator';
const BRANCH = 'master';
const DEFS = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/sheet_definitions/`;
const OUT = path.resolve(fileURLToPath(new URL('../assets/lpc', import.meta.url)));

const DASH = String.fromCharCode(0x2014);

/** Render the attribution page for a manifest whose items carry `credits`. */
export function attribution(manifest) {
  const authors = new Set();
  const licenses = new Set();
  const urls = new Set();

  const rows = Object.entries(manifest.items).map(([gameId, item]) => {
    const a = new Set();
    const l = new Set();
    for (const c of item.credits || []) {
      (c.authors || []).forEach((x) => { a.add(x); authors.add(x); });
      (c.licenses || []).forEach((x) => { l.add(x); licenses.add(x); });
      (c.urls || []).forEach((x) => urls.add(x));
    }
    return { gameId, name: item.name, a: [...a], l: [...l] };
  });

  const esc = (x) => String(x).replace(/[|]/g, '\\|');

  return [
    '# LPC 에셋 출처 표기',
    '',
    '`tools/lpc-attribution.mjs` 가 LPC 저장소의 `sheet_definitions` 에 기록된',
    '저작권 정보로부터 자동 생성합니다. 직접 편집하지 마세요.',
    '',
    `출처: <${manifest.source}>`,
    '',
    '## 라이선스',
    '',
    '이 디렉터리의 아트는 아래 라이선스로 배포됩니다. 파츠마다 적용 라이선스가',
    '다르므로, 재배포 시에는 각 항목의 조건을 모두 만족해야 합니다.',
    '',
    ...[...licenses].sort().map((x) => `- ${x}`),
    '',
    '## 작가',
    '',
    ...[...authors].sort().map((x) => `- ${x}`),
    '',
    '## 파츠별 내역',
    '',
    '| 게임 내 항목 | LPC 이름 | 작가 | 라이선스 |',
    '| --- | --- | --- | --- |',
    ...rows.map((r) => `| \`${r.gameId}\` | ${esc(r.name)} | ${esc(r.a.join(', ')) || DASH} | ${esc(r.l.join(', ')) || DASH} |`),
    '',
    '## 원본 페이지',
    '',
    ...[...urls].sort().map((u) => `- <${u}>`),
    '',
  ].join('\n');
}

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw new Error(`could not read ${url}`);
}

/**
 * Read one sheet definition. The raw CDN occasionally answers 400 for a file
 * that plainly exists in the tree, so fall back to the contents API.
 */
async function readDefinition(relPath) {
  try {
    return await getJSON(DEFS + relPath, 2);
  } catch {
    const meta = await getJSON(
      `https://api.github.com/repos/${REPO}/contents/sheet_definitions/${relPath}?ref=${BRANCH}`);
    return JSON.parse(Buffer.from(meta.content, meta.encoding || 'base64').toString('utf8'));
  }
}

async function main() {
  const file = path.join(OUT, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'));

  const missing = Object.entries(manifest.items).filter(([, it]) => !it.credits?.length);
  if (missing.length) {
    console.log(`fetching credits for ${missing.length} item(s)...`);
    const tree = await getJSON(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}:sheet_definitions?recursive=1`);
    const defPaths = tree.tree.filter((t) => t.type === 'blob').map((t) => t.path);

    for (const [gameId, item] of missing) {
      const p = defPaths.find((f) => f.endsWith(`/${item.def}.json`) || f === `${item.def}.json`);
      if (!p) { console.warn(`  ! no definition for ${gameId} (${item.def})`); continue; }
      let def;
      try {
        def = await readDefinition(p);
      } catch (e) {
        console.warn(`  ! ${gameId}: ${e.message}`);
        continue;
      }
      item.credits = def.credits || [];
      console.log(`  ${gameId.padEnd(14)} ${(item.credits[0]?.authors || []).join(', ') || '(none listed)'}`);
    }
    await fs.writeFile(file, JSON.stringify(manifest, null, 2));
  }

  const md = attribution(manifest);
  await fs.writeFile(path.join(OUT, 'ATTRIBUTION.md'), md);
  const artists = new Set(Object.values(manifest.items).flatMap((i) => (i.credits || []).flatMap((c) => c.authors || [])));
  console.log(`\nATTRIBUTION.md written - ${Object.keys(manifest.items).length} items, ${artists.size} artists`);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
