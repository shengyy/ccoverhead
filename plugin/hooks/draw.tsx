// The band and the pane as element trees. The terminal draws text in a monospace font: block glyphs, each
// multi-coloured span piece by piece. The other surfaces draw in a proportional font: rows spaced by `gap`,
// trimmed text, and the graphic spans as Svg.
import type { Elements } from 'claude-code'

import type { Span } from './format'
import { SEP, cells, colorOf, items } from './format'
import type { PaneLine } from './pane'
import { LABEL } from './pane'

type Term = Pick<Elements['terminal'], 'Box' | 'Text'>
type Rich = Pick<Elements['desktop'], 'Box' | 'Text' | 'Svg'>

// Spans as nested Text; one with no text draws nothing.
function textRun({ Text }: Term, spans: Span[], key: string) {
  return spans
    .filter(s => s.text)
    .map((s, j) => {
      const parts = cells(s)
      return parts ? (
        <Text key={`${key}-${j}`}>
          {parts.map((c, k) => (
            <Text key={String(k)} color={c.color} dimColor={c.dimColor}>
              {c.text}
            </Text>
          ))}
        </Text>
      ) : (
        <Text key={`${key}-${j}`} color={colorOf(s)} dimColor={s.dimColor}>
          {s.text}
        </Text>
      )
    })
}

// Spans as a row's items: text trimmed, graphics as Svg.
function itemRun({ Text, Svg }: Rich, spans: Span[], key: string) {
  return items(spans).map((it, j) =>
    it.kind === 'graphic' ? (
      <Svg key={`${key}-${j}`} {...it.graphic} />
    ) : (
      <Text key={`${key}-${j}`} color={colorOf(it.span)} dimColor={it.span.dimColor}>
        {it.span.text}
      </Text>
    ),
  )
}

// The terminal's band: one line of text, cut at its end if it still does not fit.
export function bandTerminal(els: Term, gs: Span[][]) {
  const { Box, Text } = els
  return (
    <Box flexDirection="row" paddingX={1}>
      <Text wrap="truncate-end">
        {gs.flatMap((g, i) => [
          ...(i > 0 ? [<Text key={`sep-${i}`} dimColor>{SEP}</Text>] : []),
          ...textRun(els, g, String(i)),
        ])}
      </Text>
    </Box>
  )
}

// The band elsewhere: each group a row, a dim bar between groups.
export function bandRich(els: Rich, gs: Span[][]) {
  const { Box, Text } = els
  return (
    <Box flexDirection="row" alignItems="center" paddingX={1} gap={1}>
      {gs.flatMap((g, i) => [
        ...(i > 0 ? [<Text key={`sep-${i}`} dimColor>|</Text>] : []),
        <Box key={`group-${i}`} flexDirection="row" alignItems="center" gap={1}>
          {itemRun(els, g, String(i))}
        </Box>,
      ])}
    </Box>
  )
}

// The pane on the terminal: a bold heading per section, then lines of a fixed-width label and its spans.
export function paneTerminal(els: Term, lines: PaneLine[]) {
  const { Box, Text } = els
  return (
    <Box flexDirection="column" paddingX={1}>
      {lines.map((l, i) =>
        'head' in l ? (
          <Box key={`h-${i}`} marginTop={i > 0 ? 1 : 0}>
            <Text bold>{l.head}</Text>
          </Box>
        ) : (
          <Box key={`l-${i}`} flexDirection="row">
            <Box width={LABEL} flexShrink={0}>
              <Text color={colorOf(l.label)} dimColor={l.label.dimColor}>
                {l.label.text}
              </Text>
            </Box>
            <Text wrap="truncate-end">{textRun(els, l.spans, String(i))}</Text>
          </Box>
        ),
      )}
    </Box>
  )
}

// The pane elsewhere: the same sections, each line a row of items beside its label.
export function paneRich(els: Rich, lines: PaneLine[]) {
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
          <Box key={`l-${i}`} flexDirection="row" alignItems="center" gap={1}>
            <Box width={LABEL} flexShrink={0} justifyContent={l.end ? 'flex-end' : 'flex-start'}>
              <Text color={colorOf(l.label)} dimColor={l.label.dimColor}>
                {l.label.text.trim()}
              </Text>
            </Box>
            <Box flexDirection="row" alignItems="center" gap={1} paddingLeft={l.nested ? 2 : 0}>
              {itemRun(els, l.spans, String(i))}
            </Box>
          </Box>
        ),
      )}
    </Box>
  )
}
