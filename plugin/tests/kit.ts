// Shared fixtures for the plugin's tests: fictional figures, the engine's answers, and helpers that read the
// band on each surface. Not a test file itself.
import { expect, mock } from 'claude-code/testing'
import type { MountTarget, Mounted } from 'claude-code/testing'
import type {
  SessionContextBreakdown,
  SessionContextUsage,
  SessionMeasureInput,
  SessionRateLimit,
  SessionStartInput,
  SessionUsage,
  TurnStepInput,
  TurnStepResult,
} from 'claude-code'

export const NOW = Date.parse('2026-10-03T15:00:00Z')
export const iso = (ms: number) => new Date(NOW + ms).toISOString()
export const MIN = 60_000
export const WINDOW = 1_000_000

export const SURFACES = ['terminal', 'desktop'] as const
export type Surface = (typeof SURFACES)[number]

export const session = (surface: Surface): SessionStartInput => ({ surface, isInteractive: true, cwd: '/work' })

// The band as the engine asks for it: rows to spare, so nothing scrolls.
export const band = <P extends Surface>(surface: P, bodyColumns = 160): MountTarget<P, 'AbovePrompt'> => ({
  plugin: 'ccoverhead',
  surface,
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 9 }, view: {} },
})

export const fill = (tokens: number, percent = Math.round(tokens / 10_000)): SessionContextUsage => ({ tokens, window: WINDOW, percent })

export const measured = (context: SessionContextUsage, rateLimits: SessionRateLimit[] = []): SessionMeasureInput => ({
  context,
  rateLimits,
  changed: ['context', 'rateLimits'],
})

// /context's local count on a fresh session in this repo: system prompt, tools, memory files and skills.
export const ESTIMATE = 13_689
export const BREAKDOWN: SessionContextBreakdown = {
  categories: [],
  totalTokens: ESTIMATE,
  maxTokens: WINDOW,
  rawMaxTokens: WINDOW,
  autocompactSource: 'model-default',
  percentage: 1,
  gridRows: [],
  model: 'claude-opus-5-5',
  memoryFiles: [],
  mcpTools: [],
  agents: [],
  isAutoCompactEnabled: true,
  apiUsage: null,
}

// What `$.session.usage()` answers: no fill before a response in the window, and the
// breakdown only when the call asks for one (`breakdown` true for the plain fixture, or the one to answer).
export const usage = (tokens: number | undefined, rateLimits: SessionRateLimit[], breakdown: boolean | SessionContextBreakdown): SessionUsage => ({
  startedAt: 0,
  rateLimits,
  context: {
    ...(tokens === undefined ? { window: WINDOW } : fill(tokens)),
    ...(breakdown && { breakdown: breakdown === true ? BREAKDOWN : breakdown }),
  },
})

export const STEP: TurnStepInput = { turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 3 }
// Claude Code's answer to one main-conversation request that touched the prompt cache.
export const cached = (read: number, created: number): TurnStepResult => ({
  turnId: 't',
  index: 0,
  answer: '',
  toolUses: [],
  stopReason: 'end_turn',
  usage: {
    model: 'claude-opus-5-5',
    input_tokens: 1,
    output_tokens: 1,
    cache_read_input_tokens: read,
    cache_creation_input_tokens: created,
  },
})

// The ctx bar: block glyphs on the terminal; on the desktop an Svg filled in the tier's dark-card colour (or
// the dim grey), and no glyph or space-padded text anywhere in the band.
export const DIM_HEX = '#898781'
export async function graphic(ui: Mounted<Surface, 'AbovePrompt'>, kind: 'bar' | 'spark', surface: Surface, glyphs: RegExp, ink: number | 'dim') {
  if (surface === 'terminal') {
    const el = await ui.find({ type: 'Text', text: glyphs })
    expect(ink === 'dim' ? el?.props.dimColor : el?.props.color).toBe(ink === 'dim' ? true : TIER_HEX[ink])
    return
  }
  const alt = kind === 'bar' ? /^context \d+% used/ : /^context added in each of the last \d+ changes$/
  const svgs = await ui.findAll({ type: 'Svg' })
  const el = svgs.find(one => alt.test(String(one.props.alt)))
  expect(String(el?.props.source)).toContain(ink === 'dim' ? DIM_HEX : TIER_HEX[ink])
  expect(await ui.find({ type: 'Text', text: /[■□▁▂▃▄▅▆▇█]/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^\s|\s$/ })).toBeUndefined()
}

// The sparkline's tiers: one coloured glyph per bar on the terminal, one classed column per bar in the
// desktop's Svg, the class painted in the tier's dark-card colour.
export const TIER_HEX = ['#5965cd', '#4087de', '#37aae3', '#35c5db', '#49d6cc', '#b8e45c', '#f9e149', '#fea92f', '#fd7933', '#ed4b43']
export async function tiers(ui: Mounted<Surface, 'AbovePrompt'>, surface: Surface, want: number[]) {
  if (surface === 'terminal') {
    const bars = await ui.findAll({ type: 'Text', text: /^[▁▂▃▄▅▆▇█]$/ })
    expect(bars.map(b => b.props.color)).toEqual(want.map(t => TIER_HEX[t]))
    return
  }
  const svgs = await ui.findAll({ type: 'Svg' })
  const source = String(svgs.find(one => /^context added/.test(String(one.props.alt)))?.props.source)
  expect([...source.matchAll(/<rect class="t(\d)"/g)].map(m => Number(m[1]))).toEqual(want)
  for (const t of want) expect(source).toContain(`.t${t}{fill:${TIER_HEX[t]}}`)
}

// Explicit dark theme for fixtures; production falls back to native semantic colors if unavailable.
export function mockHost(on: Parameters<typeof mock.store>[0]) {
  mock.store(on)
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => $.ui.resolve(e).Box({ children: [] }))
  on('config.list', () => ({ value: [{ key: 'theme', value: 'dark', label: 'Theme', kind: 'choice', provider: { plugin: 'engine', tier: 'core' }, isLocked: false }] }))
}
