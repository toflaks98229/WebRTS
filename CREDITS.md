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

## 헥스 타일 / 지형

지형은 코드로 그립니다(`src/render/renderer.js`). 외부 타일셋을 쓰지 않습니다.

높이(고저차)를 지원하는 무료 2D 헥스 타일셋은 사실상 존재하지 않아,
**평면 타일 + 엔진 측 높이 렌더링** 방식을 택했습니다. 각 타일은 0~3 단계의
높이값을 갖고, 렌더러가 타일을 그만큼 위로 올린 뒤 아래에 측벽(스커트)을
그려 절벽을 만듭니다. 이 방식은 어떤 평면 타일셋에도 그대로 적용되므로,
나중에 CC0 타일 이미지를 얹어도 높이 표현은 유지됩니다.

교체를 고려할 만한 CC0 후보:

| 에셋 | 라이선스 | 비고 |
| --- | --- | --- |
| [Kenney — Hexagon Pack](https://kenney.nl/assets/hexagon-pack) | CC0 | 310종, 평면 |
| [Kenney — Hexagon Tiles](https://kenney.nl/assets/hexagon-tiles) | CC0 | 93종 PNG + SVG |
| [180+ Seamless Hex Tiles](https://opengameart.org/content/180-seamless-hex-tiles) | CC0 | 사실적 텍스처, Tiled `.tsx` 포함 |
| [Battle for Wesnoth](https://github.com/wesnoth/wesnoth) 지형 | CC-BY-SA 4.0 / GPL-2.0 | 절벽·능선 아트가 실제로 그려져 있음 (카피레프트) |

## 폰트

- [Cinzel](https://fonts.google.com/specimen/Cinzel), [Noto Serif KR](https://fonts.google.com/noto)
  — SIL Open Font License 1.1, Google Fonts CDN 경유.
