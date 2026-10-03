# Design

ccOverhead should read in one glance and stay quiet while things are fine: cool colors for everyday
figures, warm ones only when something deserves attention. What it shows and when is defined in
[PRODUCT.md](../PRODUCT.md); this is how it is presented.

## The band

```text
ctx ■■■□□□□□□□ 27% 271k/1M  ▁▂▄█▂▇▁ ↑3.4k | 5h 42% ↻2h34m | 7d 63% ↻2d7h | cache warm 38m
```

- Groups, left to right: context (bar, percentage, tokens, growth chart, `↑` latest growth), 5-hour quota,
  weekly quota, cache. A dim ` | ` separates groups.
- The weekly label names the model family when the group shows the main model's own window: `7d fable`
  instead of `7d`.
- Labels (`ctx`, `5h`, `7d`, `cache`) are plain text. Figures take their tier's color. Secondary detail
  (tokens, countdowns, `↑`, remembered quota, the estimate) is dim.
- Widths are counted in terminal cells. Narrowing drops the growth chart, the cache, the context tokens,
  the weekly countdown and the 5-hour countdown, in that order, then truncates the end.
- The band redraws every 30 s so countdowns keep time.

## Color scale

One scale, one meaning: cool is safe, yellow is caution, warm to red is warning.

| Tier | Color (dark theme) | Light theme | Growth bar: share of the window | On a 1M window | Context and quota: used |
|---|---|---|---|---|---|
| 0 | indigo `#5965cd` | `#4c55bc` | < 0.1% | < 1k | — |
| 1 | blue `#4087de` | `#266ec3` | 0.1–0.2% | 1–2k | — |
| 2 | sky `#37aae3` | `#0481b3` | 0.2–0.4% | 2–4k | 0–29% |
| 3 | cyan `#35c5db` | `#0c8d9e` | 0.4–0.8% | 4–8k | 30–39% |
| 4 | teal `#49d6cc` | `#17938b` | 0.8–1.6% | 8–16k | 40–49%; `cache warm` |
| 5 | lime `#b8e45c` | `#74980d` | 1.6–3.2% | 16–32k | 50–59% |
| 6 | yellow `#f9e149` | `#b39b00` | 3.2–6.4% | 32–64k | 60–69% |
| 7 | amber `#fea92f` | `#b77610` | 6.4–12.8% | 64–128k | 70–79% |
| 8 | orange `#fd7933` | `#bd4d00` | 12.8–25.6% | 128–256k | 80–89% |
| 9 | red `#ed4b43` | `#bb0916` | ≥ 25.6% | ≥ 256k | ≥ 90% |

The colors are defined once, in `plugin/hooks/format.ts`; this table follows it.

- **Why cool to warm.** Safe is cool rather than green: red-green color-blind readers cannot tell green from
  red, but they keep cool against warm. Under a protan/deutan simulation the safe tiers (0–4) and warning
  tiers (7–9) stay at least ΔE 17 apart (OKLab ×100; 8 is the usual floor); neighbouring tiers differ by
  ΔE 6–17 in normal vision.
- **How it was built.** In OKLCH, hue walking from 275° through 188° and 100° to 27°; lightness rising
  toward the yellow tier on dark backgrounds and falling on light ones. The darkest tier is 3.2:1 against
  the desktop card (`#212121`) and 3.0:1 against a dark terminal (`#262624`).
- **Why percentages start at tier 2.** Tiers 0 and 1 (3.2:1 and 4.4:1) are dimmer than the band's dim text
  (4.5:1), too faint for a figure; they only color small growth bars.
- **Why growth tiers double.** One turn adds anywhere from a few hundred tokens to a quarter of the window.
  In the maintainer's last 30 days (328 turns) the median turn added about 8k; the first seven tiers each
  held 10–18% of turns, 64k and more about 7%, 256k and more under 1%. Everyday turns spread across the
  cool tiers; warm bars mark the heavy ones.
- **Text in the dark palette.** `Text` takes a theme key, a color name or a hex color, and the theme keys
  cannot express this scale, so figures use the dark-theme hex. On a light theme bright figures such as
  yellow read faint; the desktop's Svg switches to the light column itself.

## Desktop drawing

The desktop app draws the band in a proportional font, where block glyphs (`■□`, `▁▂▃`) do not line up.
There, and only there:

- Each group is a `Box` row; items are spaced by `gap`, not by spaces, and text is trimmed.
- The context bar is a 60×6 rounded `Svg`, filled to the exact percentage over a translucent track.
- The growth chart is an `Svg` of 4 px columns, 14 px at the tallest and 3 px at the least, so even a
  small bar shows its color.
- Each `Svg` carries both palettes and picks the light one under `prefers-color-scheme: light`.

## Logo

A gauge of the ten tiers arched overhead a prompt, `>_`: the band above the input, safe to warning. The
source is `assets/brand/logo.svg` (128×128, its own dark tile, so it reads on light and dark pages). It
does not reuse Anthropic's or Claude's marks. Render a PNG when one is needed:

```bash
rsvg-convert -w 512 -h 512 assets/brand/logo.svg -o <out.png>
```

## Screenshots

README screenshots are rendered from the plugin's own `format.ts` with fictional figures, so they match the
current design and never show a real session:

```bash
bun scripts/screenshot/render.ts   # needs Google Chrome and ImageMagick
```

It stages the band in a terminal frame and in a desktop frame, screenshots both at 2x with headless Chrome
and trims them into `assets/screenshots/{terminal,desktop}.png`. Never commit screenshots of a real session.

### Design rationale sheets

The [English README](../README.md#design-rationale) and
[Simplified Chinese README](../README.zh-CN.md#设计理念) embed matching layout/color and state/data sheets.
English is the submission version; both languages live in `assets/screenshots/`:

| Language | Layout and color | States and data |
|---|---|---|
| English | [design-layout-en.png](../assets/screenshots/design-layout-en.png) | [design-states-en.png](../assets/screenshots/design-states-en.png) |
| Simplified Chinese | [design-layout-zh-cn.png](../assets/screenshots/design-layout-zh-cn.png) | [design-states-zh-cn.png](../assets/screenshots/design-states-zh-cn.png) |

```bash
bun scripts/screenshot/design.ts
```

The sheets use the plugin's formatter for the band, graphics, narrowing, palettes and thresholds. Both
renderers share the fictional figures in `scripts/screenshot/fixture.ts`. One localized layout produces
four 2x PNGs, with checks for horizontal overflow and untranslated English copy. The source rules remain
here, in [PRODUCT.md](../PRODUCT.md) and in [status.md](status.md); the diagrams illustrate them.
