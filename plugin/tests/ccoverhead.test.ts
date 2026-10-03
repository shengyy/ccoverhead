import { describe, expect, mock, test } from 'claude-code/testing'
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

import { gainTier, modelFamily, pctTier, weeklyWindow } from '../hooks/format'

const NOW = Date.parse('2026-10-03T15:00:00Z')
const iso = (ms: number) => new Date(NOW + ms).toISOString()
const MIN = 60_000
const WINDOW = 1_000_000

const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]

const session = (surface: Surface): SessionStartInput => ({ surface, isInteractive: true, cwd: '/work' })

// The band as the engine asks for it: rows to spare, so nothing scrolls.
const band = <P extends Surface>(surface: P, bodyColumns = 160): MountTarget<P, 'AbovePrompt'> => ({
  plugin: 'ccoverhead',
  surface,
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 9 }, view: {} },
})

const fill = (tokens: number, percent = Math.round(tokens / 10_000)): SessionContextUsage => ({ tokens, window: WINDOW, percent })

const measured = (context: SessionContextUsage, rateLimits: SessionRateLimit[] = []): SessionMeasureInput => ({
  context,
  rateLimits,
  changed: ['context', 'rateLimits'],
})

// /context's local count on a fresh session in this repo: system prompt, tools, memory files and skills.
const ESTIMATE = 13_689
const BREAKDOWN: SessionContextBreakdown = {
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
// breakdown only when the call asks for one.
const usage = (tokens: number | undefined, rateLimits: SessionRateLimit[], breakdown: boolean): SessionUsage => ({
  startedAt: 0,
  rateLimits,
  context: {
    ...(tokens === undefined ? { window: WINDOW } : fill(tokens)),
    ...(breakdown && { breakdown: BREAKDOWN }),
  },
})

const STEP: TurnStepInput = { turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 3 }
// Claude Code's answer to one main-conversation request that touched the prompt cache.
const cached = (read: number, created: number): TurnStepResult => ({
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
const DIM_HEX = '#898781'
async function graphic(ui: Mounted<Surface, 'AbovePrompt'>, kind: 'bar' | 'spark', surface: Surface, glyphs: RegExp, ink: number | 'dim') {
  if (surface === 'terminal') {
    const el = await ui.find({ type: 'Text', text: glyphs })
    expect(ink === 'dim' ? el?.props.dimColor : el?.props.color).toBe(ink === 'dim' ? true : TIER_HEX[ink])
    return
  }
  const alt = kind === 'bar' ? /^context \d+% used$/ : /^context added in each of the last \d+ changes$/
  const svgs = await ui.findAll({ type: 'Svg' })
  const el = svgs.find(one => alt.test(String(one.props.alt)))
  expect(String(el?.props.source)).toContain(ink === 'dim' ? DIM_HEX : TIER_HEX[ink])
  expect(await ui.find({ type: 'Text', text: /[■□▁▂▃▄▅▆▇█]/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^\s|\s$/ })).toBeUndefined()
}

// The sparkline's tiers: one coloured glyph per bar on the terminal, one classed column per bar in the
// desktop's Svg, the class painted in the tier's dark-card colour.
const TIER_HEX = ['#5965cd', '#4087de', '#37aae3', '#35c5db', '#49d6cc', '#b8e45c', '#f9e149', '#fea92f', '#fd7933', '#ed4b43']
async function tiers(ui: Mounted<Surface, 'AbovePrompt'>, surface: Surface, want: number[]) {
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

test('the weekly window follows the main model when one is named after it (not verified against a real window)', () => {
  expect(['claude-fable-5-1', 'claude-opus-5-5', 'claude-haiku-4-5-20251001', 'some-other-model', null].map(modelFamily)).toEqual(['fable', 'opus', 'haiku', undefined, undefined])
  const limits = [
    { kind: 'five_hour', percentUsed: 74 },
    { kind: 'seven_day', percentUsed: 65 },
    { kind: 'seven_day_fable', percentUsed: 12 },
  ]
  expect(weeklyWindow(limits, 'claude-fable-5-1')).toEqual({ limit: limits[2], label: '7d fable' })
  // No window of its own: the all-models one.
  expect(weeklyWindow(limits, 'claude-opus-5-5')).toEqual({ limit: limits[1], label: '7d' })
  expect(weeklyWindow(limits, null)).toEqual({ limit: limits[1], label: '7d' })
  // A scoped window counts for Fable only, never relabelled as another model's.
  const scoped = [
    { kind: 'five_hour', percentUsed: 74 },
    { kind: 'seven_day', percentUsed: 65 },
    { kind: 'weekly_scoped', percentUsed: 30 },
  ]
  expect(weeklyWindow(scoped, 'claude-fable-5-1')).toEqual({ limit: scoped[2], label: '7d fable' })
  expect(weeklyWindow(scoped, 'claude-opus-5-5')).toEqual({ limit: scoped[1], label: '7d' })
})

test('percent tiers step every 10% from tier 2', () => {
  expect([0, 29, 30, 49, 50, 69, 70, 89, 90, 100].map(pctTier)).toEqual([2, 2, 3, 4, 5, 6, 7, 8, 9, 9])
})

test('gain tiers double from 0.1% of the window', () => {
  expect([0, 999, 1_000, 1_999, 2_000, 255_999, 256_000, 900_000].map(g => gainTier(g, 1_000_000))).toEqual([0, 0, 1, 1, 2, 8, 9, 9])
  // The same shares of a 200k window.
  expect([199, 200, 51_200].map(g => gainTier(g, 200_000))).toEqual([0, 1, 9])
})

describe('ccoverhead', () => {
  for (const surface of SURFACES) {
    test(`band shows context, growth, quota and cache (${surface})`, async ($, on) => {
      let tokens: number | undefined
      let rateLimits: SessionRateLimit[] = []
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      // No breakdown either: the placeholder path.
      on('session.usage', () => ({ value: usage(tokens, rateLimits, false) }))
      on('turn.step', async function* () {
        return cached(400_000, 900)
      })
      mock.clock(on, { now: NOW })

      await $.session.start(session(surface))
      const ui = await $.ui.mount(band(surface))
      // Fresh session: no fill reported yet, no estimate, no quota.
      expect(await ui.find({ type: 'Text', text: /^ ?-- \/1M$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^5h$/ })).toBeUndefined()

      rateLimits = [
        { kind: 'five_hour', percentUsed: 14.6, resetsAt: iso(130 * MIN) },
        { kind: 'seven_day', percentUsed: 45, resetsAt: iso((3 * 24 * 60 + 4 * 60) * MIN) },
        { kind: 'spend_limit', percentUsed: 1 },
      ]
      tokens = 40_000
      await $.session.measure(measured(fill(tokens, 4), rateLimits))
      expect(await ui.find({ type: 'Text', text: /^ ?14%$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?↻2h10m$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?↻3d4h$/ })).toBeDefined()
      // One scale throughout: 4% and 14% are tier 2 (sky), the labels plain text.
      await graphic(ui, 'bar', surface, /^□{10}$/, 2)
      expect((await ui.find({ type: 'Text', text: /^ ?14%$/ }))?.props.color).toBe(TIER_HEX[2])
      expect((await ui.find({ type: 'Text', text: /^5h$/ }))?.props.color).toBeUndefined()
      expect((await ui.find({ type: 'Text', text: /^ctx$/ }))?.props.color).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^ ??4%$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?40k\/1M$/ })).toBeDefined()
      // One total: no sparkline yet.
      expect(await ui.find({ type: 'Text', text: /↑/ })).toBeUndefined()

      await $.session.measure(measured(fill(52_300, 5), rateLimits))
      expect(await ui.find({ type: 'Text', text: /^ ?↑12\.3k$/ })).toBeDefined()
      for (const t of [61_000, 98_300, 99_000, 140_000, 210_000, 260_000, 443_000]) {
        await $.session.measure(measured(fill(t), rateLimits))
      }
      // 8 totals kept: 7 bars, coloured like the ctx bar (44% → green).
      // Each bar in its gain's tier of the 1M window: 8.7k, 37.3k, 0.7k, 41k, 70k, 50k, 183k.
      await tiers(ui, surface, [4, 6, 0, 6, 7, 6, 8])
      await graphic(ui, 'bar', surface, /^■{4}□{6}$/, 4)
      expect(await ui.find({ type: 'Text', text: /^ ??44%$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?↑183k$/ })).toBeDefined()

      // A main-conversation request that read the cache: warm, 60m left.
      for await (const _ of $.turn.step(STEP)) {
        // drain
      }
      // A warm cache is safe: the teal tier.
      expect((await ui.find({ type: 'Text', text: /^ ?warm$/ }))?.props.color).toBe(TIER_HEX[4])
      // Context first, then the quota, the cache last.
      const order = (await ui.findAll({ type: 'Text' })).map(t => t.text.trim())
      expect(order.indexOf('ctx') < order.indexOf('5h') && order.indexOf('5h') < order.indexOf('7d') && order.indexOf('7d') < order.indexOf('cache')).toBe(true)
      expect(await ui.find({ type: 'Text', text: /^ ?1h0m$/ })).toBeDefined()

      // Compaction: total drops, history restarts, sparkline hides.
      await $.session.measure(measured(fill(80_000, 8), rateLimits))
      expect(await ui.find({ type: 'Text', text: /↑/ })).toBeUndefined()
      await $.session.measure(measured(fill(95_500, 9), rateLimits))
      expect(await ui.find({ type: 'Text', text: /^ ?↑15\.5k$/ })).toBeDefined()

      // Thresholds: ≥80 red, ≥50 yellow.
      await $.session.measure(
        measured(fill(905_000, 90), [
          { kind: 'five_hour', percentUsed: 55, resetsAt: iso(30 * MIN) },
          { kind: 'seven_day', percentUsed: 81, resetsAt: iso(2 * 24 * 60 * MIN) },
        ]),
      )
      expect((await ui.find({ type: 'Text', text: /^ ?55%$/ }))?.props.color).toBe(TIER_HEX[5])
      expect((await ui.find({ type: 'Text', text: /^ ?81%$/ }))?.props.color).toBe(TIER_HEX[8])
      await graphic(ui, 'bar', surface, /^■{9}□$/, 9)
      expect((await ui.find({ type: 'Text', text: /^ ?90%$/ }))?.props.color).toBe(TIER_HEX[9])
    })

    test(`narrow band drops the sparkline first (${surface})`, async ($, on) => {
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      on('session.usage', () => ({ value: usage(60_000, [], false) }))
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      const limits: SessionRateLimit[] = [
        { kind: 'five_hour', percentUsed: 24, resetsAt: iso(150 * MIN) },
        { kind: 'seven_day', percentUsed: 41, resetsAt: iso(5 * 24 * 60 * MIN) },
      ]
      for (const t of [60_000, 72_000, 90_000]) {
        await $.session.measure(measured(fill(t, 6), limits))
      }
      const wide = await $.ui.mount(band(surface, 160))
      expect(await wide.find({ type: 'Text', text: /↑18k/ })).toBeDefined()
      // "ctx ■□□□□□□□□□ 9% 90k/1M | 5h 24% ↻2h30m | 7d 41% ↻5d0h" is 55 cells; the sparkline would add 10.
      const narrow = await $.ui.mount(band(surface, 60))
      expect(await narrow.find({ type: 'Text', text: /↑/ })).toBeUndefined()
      expect(await narrow.find({ type: 'Text', text: /^ ?90k\/1M$/ })).toBeDefined()
      const tiny = await $.ui.mount(band(surface, 40))
      expect(await tiny.find({ type: 'Text', text: /1M/ })).toBeUndefined()
      expect(await tiny.find({ type: 'Text', text: /^5h$/ })).toBeDefined()
    })

    test(`a new session shows the last saved quota dimmed (${surface})`, async ($, on) => {
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on, {
        limits: [
          { kind: 'five_hour', percentUsed: 30, resetsAt: iso(90 * MIN) },
          // Already reset: dropped.
          { kind: 'seven_day', percentUsed: 50, resetsAt: iso(-MIN) },
        ],
      })
      on('session.usage', () => ({ value: usage(undefined, [], false) }))
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      const ui = await $.ui.mount(band(surface))
      const q = await ui.find({ type: 'Text', text: /^ ?30% ↻1h30m$/ })
      expect(q?.props.dimColor).toBe(true)
      expect(await ui.find({ type: 'Text', text: /^7d$/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^ ?-- \/1M$/ })).toBeDefined()
    })

    test(`before the first response the band shows the /context estimate (${surface})`, async ($, on) => {
      let tokens: number | undefined
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      on('session.usage', ($, e) => ({ value: usage(tokens, [], e.breakdown !== undefined) }))
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      const ui = await $.ui.mount(band(surface))
      await graphic(ui, 'bar', surface, /^□{10}$/, 'dim')
      expect((await ui.find({ type: 'Text', text: /^ ??~1%$/ }))?.props.dimColor).toBe(true)
      expect(await ui.find({ type: 'Text', text: /^ ?~13k\/1M$/ })).toBeDefined()

      // The first response replaces it.
      tokens = 52_000
      await $.session.measure(measured(fill(tokens, 5)))
      expect(await ui.find({ type: 'Text', text: /~/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^ ?52k\/1M$/ })).toBeDefined()
    })

    test(`a breakdown the engine refuses leaves the placeholder, not a stale band (${surface})`, async ($, on) => {
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      on('session.usage', ($, e) => (e.breakdown ? { deny: 'no session bound' } : { value: usage(undefined, [], false) }))
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      const ui = await $.ui.mount(band(surface))
      expect(await ui.find({ type: 'Text', text: /^ ?-- \/1M$/ })).toBeDefined()
    })

    test(`switching to a model with its own weekly window shows that window (${surface})`, async ($, on) => {
      let current = 'claude-fable-5-1'
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      on('session.model', () => ({ value: current }))
      on('classic.PostModelSwitch', () => ({}))
      // A fictional model-specific window: Claude Code has not been seen reporting one.
      const rateLimits: SessionRateLimit[] = [
        { kind: 'five_hour', percentUsed: 74, resetsAt: iso(100 * MIN) },
        { kind: 'seven_day', percentUsed: 65, resetsAt: iso(3 * 24 * 60 * MIN) },
        { kind: 'seven_day_fable', percentUsed: 12, resetsAt: iso(3 * 24 * 60 * MIN) },
      ]
      on('session.usage', () => ({ value: { startedAt: 0, rateLimits, context: fill(40_000) } }))
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      const ui = await $.ui.mount(band(surface))
      expect(await ui.find({ type: 'Text', text: /^7d fable$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?12%$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?65%$/ })).toBeUndefined()

      // /model opus: no window of its own, so the all-models week, at once.
      current = 'claude-opus-5-5'
      await $.classic.PostModelSwitch({
        from_model: 'claude-fable-5-1',
        to_model: current,
        requested_model: 'opus',
        source: 'command',
        context_tokens: 40_000,
        prompt_cache_warm: true,
        cache_ttl: '1h',
        estimated_cache_write_usd: 0,
        pricing: 'catalog',
      })
      expect(await ui.find({ type: 'Text', text: /^7d$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?65%$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /fable/ })).toBeUndefined()
    })

    test(`/clear drops the old conversation's growth and cache (${surface})`, async ($, on) => {
      let tokens: number | undefined
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      on('session.usage', ($, e) => ({ value: usage(tokens, [], e.breakdown !== undefined) }))
      // No settings hook stands beneath in a test: answer the classic event as an empty one.
      on('classic.SessionStart', () => ({}))
      on('turn.step', async function* () {
        return cached(40_000, 0)
      })
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      const ui = await $.ui.mount(band(surface))
      for (const t of [40_000, 52_300]) {
        tokens = t
        await $.session.measure(measured(fill(t, 5)))
      }
      for await (const _ of $.turn.step(STEP)) {
        // drain
      }
      expect(await ui.find({ type: 'Text', text: /^ ?↑12\.3k$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?warm$/ })).toBeDefined()

      tokens = undefined
      await $.classic.SessionStart({ source: 'clear' })
      expect(await ui.find({ type: 'Text', text: /↑/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^ ?warm$/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^ ?~13k\/1M$/ })).toBeDefined()
    })
  }
})
