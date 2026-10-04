import { describe, expect, mock, test } from 'claude-code/testing'
import type { ClassicResultOf, SessionRateLimit } from 'claude-code'

import { gainTier, modelFamily, pctTier, weeklyWindow } from '../hooks/format'
import { addAgentStep } from '../hooks/track'
import { BREAKDOWN, MIN, NOW, STEP, SURFACES, TIER_HEX, band, cached, fill, graphic, iso, measured, session, tiers, usage } from './kit'

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

test('a subagent keeps its totals as the main context does: changed ones only, restarting on a drop', () => {
  const u = (t: number) => ({ input_tokens: 0, cache_read_input_tokens: t, cache_creation_input_tokens: 0 })
  let list = addAgentStep([], 'a1', 'm', u(10_000), 'Explore')
  for (const t of [10_000, 10_000, 12_000]) list = addAgentStep(list, 'a1', 'm', u(t))
  expect(list[0]?.totals).toEqual([10_000, 12_000])
  expect(list[0]?.label).toBe('Explore')
  list = addAgentStep(list, 'a1', 'm', u(4_000))
  expect(list[0]?.totals).toEqual([4_000])
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
      // A freshly warm cache, its minutes in the same colour: the warm state's cyan.
      expect((await ui.find({ type: 'Text', text: /^ ?warm 1h0m$/ }))?.props.color).toBe(TIER_HEX[3])
      // The conversation's state first (context, then cache), then the account's quota.
      const order = (await ui.findAll({ type: 'Text' })).map(t => t.text.trim())
      expect(order.indexOf('ctx') < order.indexOf('cache') && order.indexOf('cache') < order.indexOf('5h') && order.indexOf('5h') < order.indexOf('7d')).toBe(true)

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
      // The lifecycle observer must preserve the settings hook's first-message and stop decisions.
      const downstream: ClassicResultOf['classic.SessionStart'] = {
        additionalContext: ['Synthetic session instructions.'],
        initialUserMessage: 'Synthetic initial message.',
        preventContinuation: true,
        stopReason: 'Synthetic stop.',
      }
      on('classic.SessionStart', () => {
        tokens = undefined
        return downstream
      })
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
      expect(await ui.find({ type: 'Text', text: /^ ?warm 1h0m$/ })).toBeDefined()

      expect(await $.classic.SessionStart({ source: 'clear' })).toEqual(downstream)
      expect(await ui.find({ type: 'Text', text: /↑/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /warm/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^ ?~13k\/1M$/ })).toBeDefined()
    })

    test(`the context bar marks where auto-compaction runs (${surface})`, async ($, on) => {
      let threshold: number | undefined = 335_000
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      // A compaction window of 368k on the 1M model: the threshold sits a third of the way along the bar.
      on('session.usage', ($, e) => ({
        value: usage(300_000, [], e.breakdown !== undefined && { ...BREAKDOWN, autoCompactThreshold: threshold, isAutoCompactEnabled: threshold !== undefined }),
      }))
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      await $.session.measure(measured(fill(300_000, 30)))
      const ui = await $.ui.mount(band(surface))
      // 30% used, the mark at 33.5%: three cells, the mark, seven. 300k of 335k is 89%: the mark is orange.
      if (surface === 'terminal') {
        expect((await ui.find({ type: 'Text', text: /^■■■$/ }))?.props.color).toBe(TIER_HEX[3])
        expect((await ui.find({ type: 'Text', text: /^│$/ }))?.props.color).toBe(TIER_HEX[8])
        expect((await ui.find({ type: 'Text', text: /^□{7}$/ }))?.props.color).toBe(TIER_HEX[3])
      } else {
        const bar = (await ui.findAll({ type: 'Svg' })).find(one => /^context/.test(String(one.props.alt)))
        expect(bar?.props.alt).toBe('context 30% used, auto-compacts at 34%')
        expect(String(bar?.props.source)).toContain(`.m{fill:${TIER_HEX[8]}}`)
        expect(String(bar?.props.source)).toContain('<rect class="m" x="19"')
      }

      // Auto-compaction off: no mark.
      threshold = undefined
      await $.session.measure(measured(fill(310_000, 31)))
      await graphic(ui, 'bar', surface, /^■■■□{7}$/, 3)
      expect(await ui.find({ type: 'Text', text: /│/ })).toBeUndefined()
    })

    test(`a resumed conversation shows its cache's age at once and its first rewrite (${surface})`, async ($, on) => {
      let read = 0
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      on('session.usage', () => ({ value: usage(undefined, [], false) }))
      on('classic.SessionStart', () => ({}))
      on('turn.step', async function* () {
        return cached(read, 300_000 - read)
      })
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      const ui = await $.ui.mount(band(surface))
      const step = async () => {
        for await (const _ of $.turn.step(STEP)) {
          // drain
        }
      }

      // Resumed 20 minutes after its last response, the cache still warm by the engine's count: 40 minutes left
      // of the hour, an age past five minutes that shows the account's lifetime is the hour.
      await $.classic.SessionStart({ source: 'resume', context_tokens: 300_000, seconds_since_last_response: 20 * 60, prompt_cache_likely_expired: false })
      expect(await ui.find({ type: 'Text', text: /^ ?warm 40m$/ })).toBeDefined()
      read = 290_000
      await step()
      expect(await ui.find({ type: 'Text', text: /rewrote/ })).toBeUndefined()

      // Forked 10 minutes after, the cache already gone: cold, and the account's lifetime is five minutes. Its
      // first request writes the transcript again, a rewrite.
      await $.classic.SessionStart({ source: 'fork', context_tokens: 300_000, seconds_since_last_response: 10 * 60, prompt_cache_likely_expired: true })
      expect(await ui.find({ type: 'Text', text: /^ ?cold$/ })).toBeDefined()
      read = 20_000
      await step()
      expect(await ui.find({ type: 'Text', text: /^ ?rewrote 280k$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?warm 5m$/ })).toBeDefined()
    })

    test(`a request that reads back little of the cache shows the rewrite until a later turn reads again (${surface})`, async ($, on) => {
      const steps: [turnId: string, read: number, write: number][] = [
        ['t1', 0, 20_000], // the first request writes everything: no rewrite
        ['t2', 20_000, 1_000],
        ['t3', 0, 120_000], // the cache had lapsed
        ['t3', 121_000, 500], // the same turn reads again: still shown
        ['t4', 0, 0], // a later request that reads nothing (no cache at all): still shown
        ['t5', 121_500, 300], // a later turn reads the cache again: gone
      ]
      let at = 0
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      on('session.usage', () => ({ value: usage(40_000, [], false) }))
      on('turn.step', async function* () {
        const [turnId, read, write] = steps[at++]!
        return { ...cached(read, write), turnId }
      })
      const clock = mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      await $.session.measure(measured(fill(40_000, 4)))
      const ui = await $.ui.mount(band(surface))
      const step = async (turnId: string) => {
        for await (const _ of $.turn.step({ ...STEP, turnId })) {
          // drain
        }
      }
      await step('t1')
      await step('t2')
      expect(await ui.find({ type: 'Text', text: /rewrote/ })).toBeUndefined()
      await step('t3')
      // 120k of the 1M window is a tier-7 growth: amber.
      expect((await ui.find({ type: 'Text', text: /^ ?rewrote 120k$/ }))?.props.color).toBe(TIER_HEX[7])
      await step('t3')
      expect(await ui.find({ type: 'Text', text: /^ ?rewrote 120k$/ })).toBeDefined()
      await step('t4')
      expect(await ui.find({ type: 'Text', text: /^ ?rewrote 120k$/ })).toBeDefined()
      await step('t5')
      expect(await ui.find({ type: 'Text', text: /rewrote/ })).toBeUndefined()

      // Two states, not a scale: cyan with 13 of 60 minutes left, orange in the last fifth (12 minutes), and no
      // gauge of the lifetime beside the minutes.
      await clock.advance(47 * MIN)
      expect((await ui.find({ type: 'Text', text: /^ ?warm 13m$/ }))?.props.color).toBe(TIER_HEX[3])
      await clock.advance(3 * MIN)
      expect((await ui.find({ type: 'Text', text: /^ ?warm 10m$/ }))?.props.color).toBe(TIER_HEX[8])
      expect(await ui.find({ type: 'Text', text: /^ [▁▂▃▄▅▆▇█]$/ })).toBeUndefined()
      if (surface === 'desktop') expect((await ui.findAll({ type: 'Svg' })).some(one => /cache/.test(String(one.props.alt)))).toBe(false)
    })

    test(`a model switch leaves the cache cold and sets its lifetime (${surface})`, async ($, on) => {
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      on('session.usage', () => ({ value: usage(40_000, [], false) }))
      on('classic.PostModelSwitch', () => ({}))
      on('turn.step', async function* () {
        return cached(30_000, 1_000)
      })
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      await $.session.measure(measured(fill(40_000, 4)))
      const ui = await $.ui.mount(band(surface))
      for await (const _ of $.turn.step(STEP)) {
        // drain
      }
      expect(await ui.find({ type: 'Text', text: /^ ?warm 1h0m$/ })).toBeDefined()
      await $.classic.PostModelSwitch({
        from_model: 'claude-opus-5-5',
        to_model: 'claude-haiku-4-5-20251001',
        requested_model: 'haiku',
        source: 'command',
        context_tokens: 40_000,
        prompt_cache_warm: true,
        cache_ttl: '5m',
        estimated_cache_write_usd: 0,
        pricing: 'catalog',
      })
      expect(await ui.find({ type: 'Text', text: /^ ?cold$/ })).toBeDefined()
      for await (const _ of $.turn.step(STEP)) {
        // drain
      }
      expect(await ui.find({ type: 'Text', text: /^ ?warm 5m$/ })).toBeDefined()
    })

    test(`a gateway's spend limit shows past 100% with no reset (${surface})`, async ($, on) => {
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      on('session.usage', () => ({ value: usage(40_000, [], false) }))
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      // A fictional gateway reading: Claude Code's declarations name the kind; none has been seen live.
      await $.session.measure(measured(fill(40_000, 4), [{ kind: 'spend_limit', percentUsed: 112.5 }]))
      const ui = await $.ui.mount(band(surface))
      expect(await ui.find({ type: 'Text', text: /^spend$/ })).toBeDefined()
      expect((await ui.find({ type: 'Text', text: /^ ?112%$/ }))?.props.color).toBe(TIER_HEX[9])
      expect(await ui.find({ type: 'Text', text: /↻/ })).toBeUndefined()
    })

    test(`a reset time that does not parse is no reset (${surface})`, async ($, on) => {
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      on('session.usage', () => ({ value: usage(40_000, [], false) }))
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      // Fictional: a 5h window, which needs a reset to be shown, and a spend limit, which does not.
      await $.session.measure(
        measured(fill(40_000, 4), [
          { kind: 'five_hour', percentUsed: 20, resetsAt: 'soon' },
          { kind: 'spend_limit', percentUsed: 30, resetsAt: 'soon' },
        ]),
      )
      const ui = await $.ui.mount(band(surface))
      expect(await ui.find({ type: 'Text', text: /^5h$/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^spend$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /NaN|↻/ })).toBeUndefined()
    })

    test(`the band follows the subagent whose transcript is on screen (${surface})`, async ($, on) => {
      const steps: [agentId: string, model: string, read: number, write: number][] = [
        ['a1', 'claude-opus-5-5', 0, 11_739],
        ['a1', 'claude-opus-5-5', 11_739, 1_263],
        ['a2', 'claude-haiku-4-5-20251001', 0, 9_000],
      ]
      let at = 0
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      on('session.usage', () => ({ value: usage(40_000, [], false) }))
      on('session.model', () => ({ value: 'claude-opus-5-5' }))
      on('agent.list', () => ({
        value: [
          { id: 'a1', type: 'Explore', description: 'fictional', status: 'running' },
          { id: 'a2', type: 'general-purpose', description: 'fictional', status: 'running' },
        ],
      }))
      on('turn.step', async function* () {
        const [, model, read, write] = steps[at++]!
        const r = cached(read, write)
        return { ...r, usage: { ...r.usage!, model } }
      })
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      await $.session.measure(measured(fill(40_000, 4)))
      for (const [agentId, model] of steps) {
        for await (const _ of $.turn.step({ ...STEP, agentId, model })) {
          // drain
        }
      }
      const viewing = (agentId: string) => ({ ...band(surface), props: { ...band(surface).props, view: { agentId } } })
      // Same model as the main loop: its window, so a bar; 13k of 1M is 1%.
      const a1 = await $.ui.mount(viewing('a1'))
      expect(await a1.find({ type: 'Text', text: /^agent$/ })).toBeDefined()
      expect(await a1.find({ type: 'Text', text: /^ctx$/ })).toBeUndefined()
      expect(await a1.find({ type: 'Text', text: /^ ?13k\/1M$/ })).toBeDefined()
      expect(await a1.find({ type: 'Text', text: /^ ?↑1\.3k$/ })).toBeDefined()
      // Another model: its window is not reported, so the tokens alone.
      const a2 = await $.ui.mount(viewing('a2'))
      expect(await a2.find({ type: 'Text', text: /^ ?9k$/ })).toBeDefined()
      expect(await a2.find({ type: 'Text', text: /%/ })).toBeUndefined()
      // An agent with no request yet.
      const a3 = await $.ui.mount(viewing('a3'))
      expect(await a3.find({ type: 'Text', text: /^ ?--$/ })).toBeDefined()
    })

    test(`a compaction starts growth over and its next request is no rewrite (${surface})`, async ($, on) => {
      // 80k compacted to 30k; the next turn writes the new prefix and adds a 100k tool result: 130k, above
      // the total before, so only the compaction event tells this from growth.
      const steps: [turnId: string, read: number, write: number][] = [
        ['t1', 0, 80_000],
        ['t2', 0, 30_000],
        ['t2', 30_000, 100_000],
      ]
      let at = 0
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      // A fictional summary: the compaction's content does not matter here, only that it ran.
      const SUMMARY = [{ role: 'user' as const, text: 'Fictional summary.', toolUses: [] }]
      on('session.compact', () => ({ messages: SUMMARY, tokensBefore: 80_000, tokensAfter: 30_000 }))
      mock.store(on)
      on('session.usage', () => ({ value: usage(80_000, [], false) }))
      on('turn.step', async function* () {
        const [turnId, read, write] = steps[at++]!
        return { ...cached(read, write), turnId }
      })
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      const ui = await $.ui.mount(band(surface))
      const step = async (turnId: string) => {
        for await (const _ of $.turn.step({ ...STEP, turnId })) {
          // drain
        }
      }
      await $.session.measure(measured(fill(50_000, 5)))
      await step('t1')
      await $.session.measure(measured(fill(80_000, 8)))
      expect(await ui.find({ type: 'Text', text: /^ ?↑30k$/ })).toBeDefined()
      await $.session.compact({ trigger: 'manual', messages: SUMMARY })
      await step('t2')
      await step('t2')
      await $.session.measure(measured(fill(130_000, 13)))
      expect(await ui.find({ type: 'Text', text: /rewrote/ })).toBeUndefined()
      // One total since the compaction: no growth chart, no ↑50k.
      expect(await ui.find({ type: 'Text', text: /↑/ })).toBeUndefined()
    })

    test(`after a model switch a subagent does not borrow the old model's window (${surface})`, async ($, on) => {
      let current = 'claude-opus-5-5'
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      on('session.model', () => ({ value: current }))
      on('classic.PostModelSwitch', () => ({}))
      on('agent.list', () => ({ value: [{ id: 'a1', type: 'Explore', description: 'fictional', status: 'running' }] }))
      mock.store(on)
      on('session.usage', () => ({ value: usage(40_000, [], false) }))
      on('turn.step', async function* () {
        const r = cached(0, 100_000)
        return { ...r, usage: { ...r.usage!, model: 'claude-haiku-4-5-20251001' } }
      })
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      await $.session.measure(measured(fill(40_000, 4)))
      current = 'claude-haiku-4-5-20251001'
      await $.classic.PostModelSwitch({
        from_model: 'claude-opus-5-5',
        to_model: current,
        requested_model: 'haiku',
        source: 'command',
        context_tokens: 40_000,
        prompt_cache_warm: true,
        cache_ttl: '1h',
        estimated_cache_write_usd: 0,
        pricing: 'catalog',
      })
      for await (const _ of $.turn.step({ ...STEP, agentId: 'a1', model: current })) {
        // drain
      }
      // The 1M window was read for Opus; until a reading for Haiku arrives, the agent shows its tokens alone.
      const ui = await $.ui.mount({ ...band(surface), props: { ...band(surface).props, view: { agentId: 'a1' } } })
      expect(await ui.find({ type: 'Text', text: /^ ?100k$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /\/1M/ })).toBeUndefined()
    })

    test(`a spend limit withdrawn by a later reading goes (${surface})`, async ($, on) => {
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      on('session.usage', () => ({ value: usage(40_000, [], false) }))
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      await $.session.measure(measured(fill(40_000, 4), [{ kind: 'spend_limit', percentUsed: 112.5 }]))
      const ui = await $.ui.mount(band(surface))
      expect(await ui.find({ type: 'Text', text: /^spend$/ })).toBeDefined()
      await $.session.measure({ context: fill(40_000, 4), rateLimits: [], changed: ['rateLimits'] })
      expect(await ui.find({ type: 'Text', text: /^spend$/ })).toBeUndefined()
    })

    test(`a compaction seen only as a drop keeps its first request as the base for the next (${surface})`, async ($, on) => {
      const steps: [turnId: string, read: number, write: number][] = [
        ['t1', 0, 80_000],
        ['t2', 0, 30_000], // the compaction's first request, the compaction itself unseen
        ['t3', 0, 31_000], // an hour later: the cache lapsed, a real rewrite
      ]
      let at = 0
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      on('session.usage', () => ({ value: usage(80_000, [], false) }))
      on('turn.step', async function* () {
        const [turnId, read, write] = steps[at++]!
        return { ...cached(read, write), turnId }
      })
      const clock = mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      const ui = await $.ui.mount(band(surface))
      const step = async (turnId: string) => {
        for await (const _ of $.turn.step({ ...STEP, turnId })) {
          // drain
        }
      }
      await step('t1')
      await $.session.measure(measured(fill(80_000, 8)))
      await step('t2')
      await $.session.measure(measured(fill(30_000, 3)))
      // The drop marks the compaction: its request is no rewrite.
      expect(await ui.find({ type: 'Text', text: /rewrote/ })).toBeUndefined()
      await clock.advance(61 * MIN)
      await step('t3')
      expect(await ui.find({ type: 'Text', text: /^ ?rewrote 31k$/ })).toBeDefined()
    })
  }
})
