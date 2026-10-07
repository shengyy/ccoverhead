// The band and the pane as element trees. The terminal draws text in a monospace font: block glyphs, each
// multi-coloured span piece by piece. The other surfaces draw in a proportional font: rows spaced by `gap`,
// trimmed text, and the graphic spans as Svg.
import type { Elements } from 'claude-code'
import type { OverheadTheme } from '../types'

import type { Span } from './format'
import { SEP, cells, colorOf, items } from './format'
import { activityCount, activityOverflow } from './activity'
import type { PaneLine } from './pane'
import { LABEL } from './pane'

type Term = Pick<Elements['terminal'], 'Box' | 'Text'>
type AnimatedTerm = Term & Pick<Elements['terminal'], 'Client'>
type Rich = Pick<Elements['desktop'], 'Box' | 'Text' | 'Svg'>

// Spans as nested Text; one with no text draws nothing.
function textRun({ Text }: Term, spans: Span[], key: string, theme: OverheadTheme) {
  return spans
    .filter(s => s.text)
    .map((s, j) => {
      const parts = cells(s, theme)
      return parts ? (
        <Text key={`${key}-${j}`}>
          {parts.map((c, k) => (
            <Text key={String(k)} color={c.color} dimColor={c.dimColor}>
              {c.text}
            </Text>
          ))}
        </Text>
      ) : (
        <Text key={`${key}-${j}`} color={colorOf(s, theme)} dimColor={s.dimColor}>
          {s.text}
        </Text>
      )
    })
}

// Spans as a row's items: text trimmed, graphics as Svg.
function itemRun({ Box, Text, Svg }: Rich, spans: Span[], key: string, theme: OverheadTheme) {
  return items(spans).map((it, j) =>
    it.kind === 'graphic' ? (
      it.suffix ? <Box key={`${key}-${j}`} flexDirection="row" alignItems="center" gap={0}>
        <Svg {...it.graphic} />
        <Text color={colorOf(it.suffix, theme)}>{it.suffix.text}</Text>
      </Box> : <Svg key={`${key}-${j}`} {...it.graphic} />
    ) : (
      <Text key={`${key}-${j}`} color={colorOf(it.span, theme)} dimColor={it.span.dimColor}>
        {it.span.text}
      </Text>
    ),
  )
}

// The terminal's band: one line of text, cut at its end if it still does not fit.
export function bandTerminal(els: AnimatedTerm, gs: Span[][], theme: OverheadTheme = 'dark') {
  const { Box, Text } = els
  return (
    <Box flexDirection="row" paddingX={1}>
      {gs.map((g, i) => {
        const activity = g.find(s => s.agentCount !== undefined)
        const label = <Text key={`text-${i}`} wrap="truncate-end">
          {i > 0 && <Text dimColor>{SEP}</Text>}
          {textRun(els, g.filter(s => s !== activity), String(i), theme)}
        </Text>
        if (!activity) return label
        // Keep the Client outside Text, as the host requires. One clock drives every spinner.
        const count = activity.agentCount!
        return <Box key="activity" flexDirection="row">
          {label}
          <els.Client key="agent-activity" module="./activity-client.ts" width={activityCount(count)} height={1}
            props={{ color: colorOf(activity, theme), count }} />
          {activityOverflow(count) && <Text color={colorOf(activity, theme)}>{activityOverflow(count)}</Text>}
        </Box>
      })}
    </Box>
  )
}

// The band elsewhere: each group a row, a dim bar leading every group but the first so a wrapped line keeps
// it with its group. A group never shrinks; a narrow window wraps whole groups onto the next line.
export function bandRich(els: Rich, gs: Span[][], theme: OverheadTheme = 'dark') {
  const { Box, Text } = els
  return (
    <Box flexDirection="row" flexWrap="wrap" alignItems="center" paddingX={1} columnGap={1}>
      {gs.map((g, i) => (
        <Box key={`group-${i}`} flexDirection="row" alignItems="center" flexShrink={0} gap={1}>
          {i > 0 && <Text dimColor>|</Text>}
          {itemRun(els, g, String(i), theme)}
        </Box>
      ))}
    </Box>
  )
}

// The pane on the terminal: a bold heading per section, then lines of a fixed-width label and its spans.
export function paneTerminal(els: Term, lines: PaneLine[], theme: OverheadTheme = 'dark') {
  const { Box, Text } = els
  return (
    <Box flexDirection="column" paddingX={1}>
      {lines.map((l, i) =>
        'head' in l ? (
          <Box key={`h-${i}`} marginTop={i > 0 ? 1 : 0}>
            <Text bold>{l.head}</Text>
          </Box>
        ) : (
          <Box key={`l-${i}`} flexDirection="row" marginTop={l.gapBefore ? 1 : 0}>
            <Box width={LABEL} flexShrink={0}>
              <Text color={colorOf(l.label, theme)} dimColor={l.label.dimColor}>
                {l.label.text}
              </Text>
            </Box>
            <Text wrap={l.wrap ? 'wrap' : 'truncate-end'}>{textRun(els, l.spans, String(i), theme)}</Text>
          </Box>
        ),
      )}
    </Box>
  )
}

// The pane elsewhere: the same sections, each line a row of items beside its label.
export function paneRich(els: Rich, lines: PaneLine[], theme: OverheadTheme = 'dark') {
  const { Box, Text } = els
  return (
    <Box flexDirection="column" paddingX={1}>
      {lines.map((l, i) =>
        'head' in l ? (
          <Box key={`h-${i}`} marginTop={i > 0 ? 1 : 0}>
            <Text bold>{l.head}</Text>
          </Box>
        ) : (
          // Spaces do not align in a proportional font: a figure label is right-aligned by its Box, and a line
          // that belongs to the one above is indented by padding.
          <Box key={`l-${i}`} flexDirection="row" alignItems="flex-start" gap={1} marginTop={l.gapBefore ? 1 : 0}>
            <Box width={LABEL} flexShrink={0} justifyContent={l.end ? 'flex-end' : 'flex-start'}>
              <Text color={colorOf(l.label, theme)} dimColor={l.label.dimColor}>
                {l.label.text.trim()}
              </Text>
            </Box>
            <Box flexDirection="row" alignItems="center" flexWrap="wrap" gap={1} paddingLeft={l.nested ? 2 : 0} flexShrink={1} minWidth={0}>
              {itemRun(els, l.spans, String(i), theme)}
            </Box>
          </Box>
        ),
      )}
    </Box>
  )
}
