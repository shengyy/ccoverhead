# Design

ccOverhead should read in one glance and stay quiet while things are fine: cool colors for everyday
figures, warm ones only when something deserves attention. What it shows and when is defined in
[PRODUCT.md](../PRODUCT.md); this is how it is presented.

## The band

```text
ctx ■■■□□□□□□□ 27% 271k/1M  ▁▁▃█▁▇▁ ↑3.4k | cache warm 38m | 5h 42% ↻2h34m | 7d 63% ↻2d7h | cost ≈$1.84 (+$0.12)
```

- Groups, left to right: context (bar, percentage, tokens, growth chart,
  `↑` latest growth), cache (`warm` and the minutes left, or `cold`; then `rewrote` and its tokens
  on a turn that rewrote the cache), 5-hour quota, weekly quota, `spend` (a gateway's spend limit, when
  reported), then nonzero running agents and cost last. A dim ` | ` separates groups.
- The `cost` label uses normal text like `ctx`, `cache` and `agent`. Its total stays gold
  (`#dfbc70` dark, `#8a6215` light), and its increment uses native secondary text. Both
  surfaces use the same spacing and separators as other groups, without a separate background, border
  or padding. No amount changes its color, and no progress bar is added.
- Running agents use a plain-text `agent` label, then one spinner per agent in fixed lime (tier 5:
  `#b8e45c` dark, `#567a00` light). At most three spinners appear; `+N` adds the rest, so seven is
  three spinners immediately followed by `+4`, without a separating space. The group has no frame or
  background and is hidden at zero. Each terminal
  spinner uses one cell of eight-dot braille (two columns, four rows), with five lit dots moving clockwise
  every 140 ms; no emoji or image protocol. All spinners rotate in sync. The desktop uses
  8 × 14 px vector dot grids with 2 px between them, sharing the same masks, phases and timing
  (1.12 s per cycle). Its SVG respects reduced motion. One local terminal Client clock drives the whole
  row. Narrowing removes the whole group, never an individual spinner that would change the count.
  Animation does not refresh usage. Native playback has not yet been observed in a live Claude Code session.
- `warm` and its minutes are one span in one color, the share of the lifetime gone on the percentage
  scale: sky while fresh, up through the tiers to red in the last tenth; `cold` and `TTL unknown` are dim. The minutes already
  say how long, so no gauge repeats them.
- The bar carries no auto-compaction mark. On the 1M window most sessions run, the threshold (967k) rounds
  to the bar's end, where a mark read as a separator between the bar and its figures; the pane gives the
  threshold and the tokens to go instead.
- While a subagent's transcript is on screen, the first group reads `agent` instead of `ctx`.
- The weekly label names the model family when the group shows the main model's own window: `7d fable`
  instead of `7d`.
- Labels (`ctx`, `5h`, `7d`, `cache`) are plain text. Figures take their tier's color. Secondary detail
  (tokens, countdowns, `↑`, remembered quota, the estimate) is dim.
- Widths are counted in terminal cells. Narrowing follows the visible order from right to left: cost,
  agents, spend (if reported), weekly quota, 5-hour quota, cache, then context. The last-turn cost yields
  first, followed by the whole cost group, then all agents. Within each remaining rightmost
  group, its trailing detail yields before the whole group. Context keeps its growth chart until every
  group to its right is gone; then growth yields before token counts, keeping the bar and percentage last.
- The band redraws every 30 s so countdowns keep time.

## Color scale

One scale, one meaning: cool is safe, yellow is caution, warm to red is warning.

| Tier | Color (dark theme) | Light theme | Growth bar: share of the window | On a 1M window | Context and quota: used |
|---|---|---|---|---|---|
| 0 | indigo `#5965cd` | `#4c55bc` | < 0.1% | < 1k | — |
| 1 | blue `#4087de` | `#266ec3` | 0.1–0.2% | 1–2k | — |
| 2 | sky `#37aae3` | `#0076a8` | 0.2–0.4% | 2–4k | 0–29% |
| 3 | cyan `#35c5db` | `#007a8b` | 0.4–0.8% | 4–8k | 30–39% |
| 4 | teal `#49d6cc` | `#007c74` | 0.8–1.6% | 8–16k | 40–49% |
| 5 | lime `#b8e45c` | `#567a00` | 1.6–3.2% | 16–32k | 50–59% |
| 6 | yellow `#f9e149` | `#856d00` | 3.2–6.4% | 32–64k | 60–69% |
| 7 | amber `#fea92f` | `#a05f00` | 6.4–12.8% | 64–128k | 70–79% |
| 8 | orange `#fd7933` | `#bc4c00` | 12.8–25.6% | 128–256k | 80–89% |
| 9 | red `#ed4b43` | `#bb0916` | ≥ 25.6% | ≥ 256k | ≥ 90% |

The colors are defined once, in `plugin/hooks/format.ts`; this table follows it.

The percentage column also colors figures that are shares of something else: `warm` and its minutes (the
share of the cache lifetime gone), the pane's tokens to auto-compaction (the context as a share of the threshold), its hit rate (the share the cache did not serve),
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
- **Theme-aware text.** `config.list` supplies the native theme. Dark/light themes use the matching
  palette; other themes retain native semantic colors. Every light-palette tier clears 4.5:1 against
  `#f5f5f5`. Desktop Svg switches palettes with `prefers-color-scheme`. Live light-theme rendering is not
  verified; the fictional previews and test kit cover the implementation.

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
The quota bar uses solid fill for actual use and a muted extension for projected use by reset. The
projection and estimated exhaustion use the same window-average rate. The percentage can exceed 100%;
the bar stops at 100%. Only the pane has this overlay, with an explicit legend and `≈` label.
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
screenshots them at 4x with headless Chrome for wide and high-density displays, and trims them into
`assets/screenshots/{terminal,desktop,pane}.png`. It also writes `cache-rewrite.png` and `agent.png`
as close-ups of those groups, plus `cost.png`, `cost-light.png` and `terminal-light.png` from the shared state fixtures for the website. Never commit screenshots of a
real session.

The website uses a warm charcoal background, off-white text, a sand-colored action and serif headings,
with the dark product previews as the main visual material. Its centered shell scales from 1152px to
1584px as the viewport grows, with a scaled gutter on smaller screens. Paragraphs keep a readable line
length, and the pane, installation and FAQ use two columns before stacking on narrow screens. Install
commands stay in a vertical sequence so each command has enough room. It introduces the band before
the pane and the state examples, then the shared scale, design sheets, installation and verification
notes. Version and palette are read from their code owners by `scripts/site/build.ts`; the website does
not fetch release metadata at runtime.

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
