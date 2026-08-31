# 크레딧 및 라이선스

## 캐릭터 아트 — Liberated Pixel Cup (LPC)

`assets/lpc/` 아래의 모든 스프라이트시트는
[Universal-LPC-Spritesheet-Character-Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)
저장소에서 가져왔습니다. `tools/fetch-lpc.mjs` 가 저장소의 `sheet_definitions/*.json` 을
읽어 이 게임이 실제로 그리는 파츠만 내려받습니다.

```bash
node tools/fetch-lpc.mjs
```

- **라이선스**: GNU GPL 3.0 **및/또는** CC-BY-SA 3.0 (개별 파츠마다 상이)
- **원작자**: LPC 기여자 다수. 파츠별 정확한 작가 목록은 위 저장소의
  `sheet_definitions/` 각 JSON 파일의 `credits` 필드에 들어 있습니다.

### 지켜야 할 의무

LPC 아트는 **카피레프트**입니다. 이 아트를 포함한 채로 게임을 배포하려면:

1. 출처와 원작자를 표기해야 합니다 (이 파일이 그 역할을 합니다).
2. 파생물 전체를 **GPL-3.0 또는 CC-BY-SA 3.0 호환 라이선스**로 배포해야 합니다.

즉, 이 저장소를 공개 배포할 계획이라면 프로젝트 라이선스를 **GPL-3.0** 으로 두는 것이
가장 마찰이 적습니다. 폐쇄형/상용 배포가 목표라면 `assets/lpc/` 를 빼고
CC0 에셋(예: [Kenney](https://kenney.nl/assets), CC0)으로 교체하면 됩니다 —
에셋이 없으면 렌더러가 자동으로 자체 도형 렌더링으로 되돌아가므로 게임은 그대로 동작합니다.

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
