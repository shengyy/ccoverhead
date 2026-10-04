# Design

ccOverhead should read in one glance and stay quiet while things are fine: cool colors for everyday
figures, warm ones only when something deserves attention. What it shows and when is defined in
[PRODUCT.md](../PRODUCT.md); this is how it is presented.

## The band

```text
ctx ■■■□□□□□□□ 27% 271k/1M  ▁▁▃█▁▇▁ ↑3.4k | cache warm 38m | 5h 42% ↻2h34m | 7d 63% ↻2d7h
```

- Groups, left to right: context (bar, percentage, tokens, growth chart,
  `↑` latest growth), cache (`warm` and the minutes left, or `cold`; then `rewrote` and its tokens
  on a turn that rewrote the cache), 5-hour quota, weekly quota, `spend` (a gateway's spend limit, when
  reported). A dim ` | ` separates groups.
- `warm` and its minutes are one span in one color, a state rather than a scale: cyan (tier 3) while more
  than a fifth of the lifetime is left, orange (tier 8) in the last fifth, when the next request should come
  soon; `cold` is dim. The minutes already say how long, so no gauge repeats them.
- The bar carries no auto-compaction mark. On the 1M window most sessions run, the threshold (967k) rounds
  to the bar's end, where a mark read as a separator between the bar and its figures; the pane gives the
  threshold and the tokens to go instead.
- While a subagent's transcript is on screen, the first group reads `agent` instead of `ctx`.
- The weekly label names the model family when the group shows the main model's own window: `7d fable`
  instead of `7d`.
- Labels (`ctx`, `5h`, `7d`, `cache`) are plain text. Figures take their tier's color. Secondary detail
  (tokens, countdowns, `↑`, remembered quota, the estimate) is dim.
- Widths are counted in terminal cells. Narrowing drops the growth chart, the cache rewrite, the cache, the
  context tokens, the weekly and spend countdowns and the 5-hour countdown, in that order, then truncates the
  end.
- The band redraws every 30 s so countdowns keep time.

## Color scale

One scale, one meaning: cool is safe, yellow is caution, warm to red is warning.

| Tier | Color (dark theme) | Light theme | Growth bar: share of the window | On a 1M window | Context and quota: used |
|---|---|---|---|---|---|
| 0 | indigo `#5965cd` | `#4c55bc` | < 0.1% | < 1k | — |
| 1 | blue `#4087de` | `#266ec3` | 0.1–0.2% | 1–2k | — |
| 2 | sky `#37aae3` | `#0481b3` | 0.2–0.4% | 2–4k | 0–29% |
| 3 | cyan `#35c5db` | `#0c8d9e` | 0.4–0.8% | 4–8k | 30–39% |
| 4 | teal `#49d6cc` | `#17938b` | 0.8–1.6% | 8–16k | 40–49% |
| 5 | lime `#b8e45c` | `#74980d` | 1.6–3.2% | 16–32k | 50–59% |
| 6 | yellow `#f9e149` | `#b39b00` | 3.2–6.4% | 32–64k | 60–69% |
| 7 | amber `#fea92f` | `#b77610` | 6.4–12.8% | 64–128k | 70–79% |
| 8 | orange `#fd7933` | `#bd4d00` | 12.8–25.6% | 128–256k | 80–89% |
| 9 | red `#ed4b43` | `#bb0916` | ≥ 25.6% | ≥ 256k | ≥ 90% |

The colors are defined once, in `plugin/hooks/format.ts`; this table follows it.

The percentage column also colors figures that are shares of something else: the pane's tokens to
auto-compaction (the context as a share of the threshold), its hit rate (the share the cache did not serve),
and each category in its breakdown (its share of the window, as the context bar colors the whole). The growth column also colors `rewrote`, a token amount, by its
share of the window: a rewrite is a cost like a turn's growth, while a category's size is not an alarm.

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

## The pane

`/ccoverhead` opens a pane of headed sections. Each line is a 12-cell label column and a run of the band's
own spans, so the bars, sparkline and colors are the band's: block glyphs on the terminal, `Svg` on the
surfaces with a proportional font (desktop, VS Code, mobile), where a line is a `Box` row spaced by `gap`.
Headings are bold; explanations and secondary figures are dim. The breakdown's label column holds each
category's tokens, right-aligned, colored by its share of the window; MCP servers are indented under the
`MCP tools` row and dim. The engine places the pane (docked beside a fullscreen transcript, else above the
prompt) and scrolls it; it opens asking for 24 rows.

## Logo

A gauge of the ten tiers arched overhead a prompt, `>_`: the band above the input, safe to warning. The
source is `assets/brand/logo.svg` (128×128, its own dark tile, so it reads on light and dark pages). It
does not reuse Anthropic's or Claude's marks. The plugin includes a 1024×1024 PNG of this source at
`plugin/.claude-plugin/icon.png` for the directory icon. Regenerate it with:

```bash
rsvg-convert -w 1024 -h 1024 assets/brand/logo.svg -o plugin/.claude-plugin/icon.png
magick plugin/.claude-plugin/icon.png -strip plugin/.claude-plugin/icon.png
```

## Screenshots

README screenshots are rendered from the plugin's own `format.ts` with fictional figures, so they match the
current design and never show a real session:

```bash
bun scripts/screenshot/render.ts   # needs Google Chrome and ImageMagick
```

It stages the band in a terminal frame and in a desktop frame, and the pane in a terminal frame,
screenshots them at 2x with headless Chrome and trims them into
`assets/screenshots/{terminal,desktop,pane}.png`. Never commit screenshots of a real session.

### Design rationale sheets

The [README](../README.md#design-rationale) embeds English layout/color and state/data sheets. The optional
[Simplified Chinese translation](../README.zh-CN.md#设计理念) includes localized versions of the same
diagrams. Both live in `assets/screenshots/`:

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
