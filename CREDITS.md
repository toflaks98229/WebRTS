# 크레딧 및 라이선스

## 캐릭터 아트 — Liberated Pixel Cup (LPC)

`assets/lpc/` 아래의 모든 스프라이트시트는
[Universal-LPC-Spritesheet-Character-Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)
저장소에서 가져왔습니다. `tools/fetch-lpc.mjs` 가 저장소의 `sheet_definitions/*.json` 을
읽어 이 게임이 실제로 그리는 파츠만 내려받습니다.

```bash
node tools/fetch-lpc.mjs
```

각 파츠의 정확한 작가·라이선스 목록은 [assets/lpc/ATTRIBUTION.md](assets/lpc/ATTRIBUTION.md)
에 있습니다. `tools/lpc-attribution.mjs` 가 LPC 저장소의 저작권 메타데이터에서
자동 생성하므로, 에셋 구성이 바뀌면 다시 돌리면 됩니다.

```bash
node tools/lpc-attribution.mjs
```

### 라이선스가 파츠마다 다릅니다

현재 사용 중인 35개 파츠에 걸린 라이선스는 다음과 같습니다:

`CC0`, `CC-BY 3.0`, `CC-BY 4.0`, `CC-BY-SA 3.0`, `CC-BY-SA 3.0+`,
`OGA-BY 3.0`, `OGA-BY-3.0`, `OGA-BY 3.0+`, `GPL 2.0`, `GPL 2.0+`, `GPL 3.0`

**35개 중 12개는 GPL-3.0 선택지가 없습니다.** 특히 창 · 파이크 · 전투용 활 ·
투창 · 히터 실드 · 숏소드/아밍소드는 `CC-BY-SA 3.0` 또는 `OGA-BY 3.0` 단독입니다.
CC-BY-SA 3.0 은 GPL-3.0 과 호환되지 않으므로(4.0 과 달리 GPLv3 로의 단방향
호환 조항이 없습니다), **프로젝트 전체를 GPL-3.0 하나로 덮을 수 없습니다.**

### 그래서 이 저장소는 이렇게 나눕니다

| 대상 | 라이선스 |
| --- | --- |
| 코드 (`src/`, `tools/`, `serve.js`, `index.html`, `css/`) | GPL-3.0-or-later — [LICENSE](LICENSE) |
| 아트 (`assets/`) | 각 파일의 원래 라이선스 유지 — [ATTRIBUTION.md](assets/lpc/ATTRIBUTION.md) |

번들된 아트는 코드와 별개의 저작물로 함께 배포되는 형태(aggregate)이며,
각자의 조건을 그대로 따릅니다. 지켜야 할 것은:

1. **출처 표기** — 모든 라이선스가 요구합니다. `ATTRIBUTION.md` 를 배포물에 포함하세요.
2. **동일 조건 변경 허락** — `CC-BY-SA` 파츠를 **수정**해 배포하면 수정본도 같은
   CC-BY-SA 로 공개해야 합니다. 수정 없이 그대로 쓰면 표기만 하면 됩니다.
3. `CC0` 파츠(석궁)는 아무 제약이 없습니다.

상용 · 폐쇄 배포가 목표라면 `assets/lpc/` 를 통째로 빼고 CC0 에셋으로 교체하는
편이 깔끔합니다 — 에셋이 없으면 렌더러가 자체 도형 렌더링으로 폴백하므로
게임은 그대로 동작합니다.

## UI 아이콘 — Dungeon Crawl Stone Soup

특성·단장 특성·전투 기술·장비 아이콘은 [Dungeon Crawl Stone Soup](https://github.com/crawl/crawl)
의 rltiles 에서 가져왔습니다. `tools/fetch-dcss.mjs` 가 필요한 77개만 내려받습니다.

```bash
node tools/fetch-dcss.mjs
```

- **라이선스**: CC0 1.0 (퍼블릭 도메인). 표기 의무는 없지만 예의로 남깁니다.
- **원작자**: DCSS 타일 아티스트 다수. 재사용을 허락한 작가 목록은
  [crawl/tiles ARTISTS.md](https://github.com/crawl/tiles/blob/master/ARTISTS.md) 에 있습니다.

### 라이선스가 불분명한 타일은 자동으로 걸러냅니다

DCSS 의 공식 `LICENSE` 는 "타일 대부분은 CC0 이지만 오래된 것은 상황이 복잡할 수
있다"고 밝히고 있고, 소유권을 확인하지 못한 타일 목록을 따로 관리합니다 —
[TILES_UNDER_UNKNOWN_LICENSE.md](https://github.com/crawl/tiles/blob/master/TILES_UNDER_UNKNOWN_LICENSE.md).

`tools/fetch-dcss.mjs` 는 **받을 때마다 그 목록을 내려받아 대조하고, 하나라도
걸리면 매니페스트를 쓰지 않고 비정상 종료합니다.** 작성 시점에 한 번 확인하고
마는 대신 매번 검사하므로, 목록이 갱신되어도 자동으로 반영됩니다.

실제로 이 검사에 두 개가 걸려 대체했습니다:

| 원래 쓰려던 타일 | 결과 | 대체 |
| --- | --- | --- |
| `javelin1.png` (투창) | 제외 목록 | `trident1.png` |
| `stealth.png` (협공) | 제외 목록 | `camouflage_1.png` |

아이콘이 없어도 UI 는 그대로 동작합니다 — 이모지로 폴백합니다.

## 헥스 타일 / 지형

지형도 DCSS 타일을 씁니다. 다만 **DCSS 타일은 32×32 정사각형**이라 육각형에
그대로 얹을 수 없어서, 두 단계를 거칩니다:

1. **변형 타일을 이어 붙여 큰 시트를 만든다.** 32px 하나를 그대로 반복하면
   벽지처럼 보이므로, 같은 지형의 변형 4종을 4×4로 엮어 128px 시트를 만들고
   그것을 반복 패턴으로 씁니다.
2. **헥스 경로로 클리핑한다.** 패턴을 육각형 path 에 채워 넣습니다. 모양은
   육각형이 정하고 무늬는 **월드 좌표에 고정**되므로, 같은 지형끼리 붙어 있으면
   경계 없이 하나의 들판으로 이어집니다. 칸마다 정사각형이 찍히지 않습니다.

절벽(고저차 측벽)은 위에 무엇이 자라든 바위 패턴으로 채웁니다. 나무는 텍스처가
아니라 실제 오브젝트라 `dngn/trees` 스프라이트를 바닥 위에 따로 그립니다.
산악은 지도 축척에서 실루엣이 필요해 삼각형 매시프를 텍스처 위에 유지합니다.

구현은 [src/render/terrainAtlas.js](src/render/terrainAtlas.js) 에 있고,
에셋이 없으면 기존의 단색 렌더링으로 폴백합니다.

## 폰트

- [Cinzel](https://fonts.google.com/specimen/Cinzel), [Noto Serif KR](https://fonts.google.com/noto)
  — SIL Open Font License 1.1, Google Fonts CDN 경유.
