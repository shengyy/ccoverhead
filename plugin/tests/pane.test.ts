import { describe, expect, mock, test } from 'claude-code/testing'
import type { MountTarget } from 'claude-code/testing'
import type { PaneOpenArgs, RenderSurface, SessionStartInput } from 'claude-code'

import { BREAKDOWN, MIN, NOW, STEP, cached, fill, iso, measured, usage } from './kit'

// The pane is raised on every surface, unlike the band.
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

const pane = <P extends RenderSurface>(surface: P): MountTarget<P, 'Pane'> => ({
  plugin: 'ccoverhead',
  surface,
  component: 'Pane',
  requestId: 'ccoverhead',
  props: { title: 'ccOverhead', isFocused: false, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 60 }, view: {} },
})

// A fictional /context breakdown: what occupies the window, a deferred row, and two MCP servers' schemas.
const DETAILED = {
  ...BREAKDOWN,
  totalTokens: 427_200,
  percentage: 43,
  apiUsage: { input_tokens: 2, output_tokens: 300, cache_read_input_tokens: 400_000, cache_creation_input_tokens: 31_000 },
  autoCompactThreshold: 967_000,
  categories: [
    { name: 'System prompt', tokens: 7_100, color: 'promptBorder', isDeferred: false, kind: 'used' as const },
    { name: 'System tools', tokens: 17_500, color: 'inactive', isDeferred: false, kind: 'used' as const },
    { name: 'MCP tools', tokens: 2_600, color: 'cyan_FOR_SUBAGENTS_ONLY', isDeferred: false, kind: 'used' as const },
    { name: 'System tools (deferred)', tokens: 28_200, color: 'inactive', isDeferred: true, kind: 'deferred' as const },
    { name: 'Messages', tokens: 400_000, color: 'purple_FOR_SUBAGENTS_ONLY', isDeferred: false, kind: 'used' as const },
    { name: 'Free space', tokens: 500_000, color: 'promptBorder', isDeferred: false, kind: 'free' as const },
  ],
  mcpTools: [
    { name: 'mcp__tracker__create', serverName: 'tracker', tokens: 1_800, isLoaded: true },
    { name: 'mcp__notes__list', serverName: 'notes', tokens: 800, isLoaded: true },
    { name: 'mcp__notes__search', serverName: 'notes', tokens: 900, isLoaded: false },
  ],
}

describe('the /ccoverhead pane', () => {
  for (const surface of SURFACES) {
    test(`opens on the command and shows the detail the band has no room for (${surface})`, async ($, on) => {
      const opened: PaneOpenArgs[] = []
      // The session starts on the terminal; the pane is drawn wherever it is mounted.
      const start: SessionStartInput = { surface: 'terminal', isInteractive: true, cwd: '/work' }
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      on('command.register', ($, e) => ({ value: { command: e.name } }))
      on('ui.open', ($, e) => {
        opened.push(e)
        return { value: { isPlaced: true } }
      })
      on('session.model', () => ({ value: 'claude-opus-5-5' }))
      mock.store(on)
      const limits = [
        { kind: 'five_hour', percentUsed: 42, resetsAt: iso(150 * MIN) },
        { kind: 'seven_day', percentUsed: 63, resetsAt: iso(3 * 24 * 60 * MIN) },
      ]
      let tokens = 380_000
      on('session.usage', ($, e) => ({ value: usage(tokens, limits, e.breakdown !== undefined && DETAILED) }))
      on('turn.step', async function* () {
        return cached(400_000, 31_000)
      })
      mock.clock(on, { now: NOW })
      await $.session.start(start)
      for (const t of [380_000, 391_000, 431_000, 60_000, 72_000]) {
        tokens = t
        await $.session.measure(measured(fill(t), limits))
      }
      for await (const _ of $.turn.step(STEP)) {
        // drain
      }

      // The command opens the pane and writes nothing the model would read.
      const ran = await $.command.run({ command: 'ccoverhead', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
      expect(ran.text).toBeUndefined()
      expect(opened.map(o => o.id)).toEqual(['ccoverhead'])

      const ui = await $.ui.mount(pane(surface))
      const text = async (re: RegExp) => (await ui.find({ type: 'Text', text: re }))?.text
      for (const head of ['Context', 'In the window, as /context estimates it', 'Growth', 'Cache, main conversation', 'Quota']) {
        expect(await text(new RegExp(`^${head.replace(/[/,]/g, '.')}$`))).toBeDefined()
      }
      // 72k used of a 967k threshold.
      expect(await text(/^ ?at 967k$/)).toBeDefined()
      expect(await text(/^ ?· 895k to go$/)).toBeDefined()
      // The breakdown, largest first, with each MCP server's loaded schemas.
      expect(await text(/^ *400k$/)).toBeDefined()
      expect(await text(/^ *tracker$/)).toBeDefined()
      expect(await text(/^ *notes$/)).toBeDefined()
      expect(await text(/^ *28\.2k$/)).toBeDefined()
      // Growth since the compaction, and the compaction itself.
      expect(await text(/^ ?↑12k$/)).toBeDefined()
      expect(await text(/^ ?431k → 60k$/)).toBeDefined()
      expect(await text(/^ ?warm$/)).toBeDefined()
      expect(await text(/^ ?1h0m left of 1h$/)).toBeDefined()
      // 400k of 431k read from the cache.
      expect(await text(/^ ?92%$/)).toBeDefined()
      // Quota with the share of each window's time gone: 2.5h of 5h left, 3d of 7d left.
      expect(await text(/^ ?· 50% of the window gone$/)).toBeDefined()
      expect(await text(/^ ?· 57% of the window gone$/)).toBeDefined()
      if (surface !== 'terminal') {
        expect(await ui.find({ type: 'Text', text: /[■□▁▂▃▄▅▆▇█]/ })).toBeUndefined()
        expect((await ui.findAll({ type: 'Svg' })).length).toBeGreaterThan(0)
        // A proportional font drops alignment spaces: figures are right-aligned and servers indented by layout.
        const boxes = await ui.findAll({ type: 'Box' })
        expect(boxes.some(b => b.props.justifyContent === 'flex-end')).toBe(true)
        expect(boxes.some(b => b.props.paddingLeft === 2)).toBe(true)
      }
    })

    test(`lists the subagents and the one on screen (${surface})`, async ($, on) => {
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      on('agent.list', () => ({ value: [{ id: 'a1', type: 'Explore', description: 'fictional', status: 'running' }] }))
      mock.store(on)
      on('session.usage', () => ({ value: usage(40_000, [], false) }))
      on('turn.step', async function* () {
        return { ...cached(0, 11_000), usage: { ...cached(0, 11_000).usage!, model: 'claude-haiku-4-5-20251001' } }
      })
      mock.clock(on, { now: NOW })
      await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
      for await (const _ of $.turn.step({ ...STEP, agentId: 'a1' })) {
        // drain
      }
      const target = pane(surface)
      const ui = await $.ui.mount({ ...target, props: { ...target.props, view: { agentId: 'a1' } } })
      expect(await ui.find({ type: 'Text', text: /^Subagents$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?Explore$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?11k$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?haiku$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?· on screen$/ })).toBeDefined()
    })

    test(`a pane the surface cannot place yet still writes nothing to the conversation (${surface})`, async ($, on) => {
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('command.register', ($, e) => ({ value: { command: e.name } }))
      on('ui.open', () => ({ value: { isPlaced: false, reason: 'fictional: no surface places panes' } }))
      mock.store(on)
      on('session.usage', () => ({ value: usage(40_000, [], false) }))
      mock.clock(on, { now: NOW })
      await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
      const ran = await $.command.run({ command: 'ccoverhead', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
      expect(ran.text).toBeUndefined()
    })

    test(`a new conversation whose breakdown is refused shows none of the old one's (${surface})`, async ($, on) => {
      let refuse = false
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      on('classic.SessionStart', () => ({}))
      mock.store(on)
      on('session.usage', ($, e) => (e.breakdown && refuse ? { deny: 'fictional refusal' } : { value: usage(431_000, [], e.breakdown !== undefined && DETAILED) }))
      mock.clock(on, { now: NOW })
      await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
      await $.session.measure(measured(fill(431_000)))
      const ui = await $.ui.mount(pane(surface))
      expect(await ui.find({ type: 'Text', text: /^ *Messages$/ })).toBeDefined()
      refuse = true
      await $.classic.SessionStart({ source: 'clear' })
      expect(await ui.find({ type: 'Text', text: /^ *Messages$/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /967k/ })).toBeUndefined()
    })

    test(`a model switch or a compaction drops the old breakdown even when the next one is refused (${surface})`, async ($, on) => {
      let refuse = false
      let tokens: number | undefined = 431_000
      let current = 'claude-opus-5-5'
      const SUMMARY = [{ role: 'user' as const, text: 'Fictional summary.', toolUses: [] }]
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      on('session.model', () => ({ value: current }))
      on('classic.PostModelSwitch', () => ({}))
      on('session.compact', () => ({ messages: SUMMARY, tokensBefore: 431_000, tokensAfter: 30_000 }))
      mock.store(on)
      on('session.usage', ($, e) => (e.breakdown && refuse ? { deny: 'fictional refusal' } : { value: usage(tokens, [], e.breakdown !== undefined && DETAILED) }))
      mock.clock(on, { now: NOW })
      await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
      await $.session.measure(measured(fill(431_000)))
      const ui = await $.ui.mount(pane(surface))
      expect(await ui.find({ type: 'Text', text: /^ *Messages$/ })).toBeDefined()

      // A compaction, then a reading with no response yet and a refused breakdown.
      refuse = true
      await $.session.compact({ trigger: 'manual', messages: SUMMARY })
      tokens = undefined
      await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], changed: ['context'] })
      expect(await ui.find({ type: 'Text', text: /^ *Messages$/ })).toBeUndefined()
      // The threshold is the model's, not the conversation's: it stays.
      expect(await ui.find({ type: 'Text', text: /^ ?at 967k$/ })).toBeDefined()

      // A switch to another model: its threshold is not the old one's.
      current = 'claude-haiku-4-5-20251001'
      await $.classic.PostModelSwitch({
        from_model: 'claude-opus-5-5',
        to_model: current,
        requested_model: 'haiku',
        source: 'command',
        context_tokens: 30_000,
        prompt_cache_warm: true,
        cache_ttl: '1h',
        estimated_cache_write_usd: 0,
        pricing: 'catalog',
      })
      await $.session.measure({ context: { window: 200_000, tokens: 100_000, percent: 50 }, rateLimits: [], changed: ['context'] })
      expect(await ui.find({ type: 'Text', text: /967k/ })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^ ?100k of 200k$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?claude-haiku-4-5-20251001$/ })).toBeDefined()
    })

    test(`a compaction seen only as a drop drops the old breakdown when the next one is refused (${surface})`, async ($, on) => {
      let refuse = false
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      mock.store(on)
      on('session.usage', ($, e) => (e.breakdown && refuse ? { deny: 'fictional refusal' } : { value: usage(80_000, [], e.breakdown !== undefined && DETAILED) }))
      mock.clock(on, { now: NOW })
      await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
      await $.session.measure(measured(fill(80_000)))
      const ui = await $.ui.mount(pane(surface))
      expect(await ui.find({ type: 'Text', text: /^ *Messages$/ })).toBeDefined()
      refuse = true
      await $.session.measure(measured(fill(30_000)))
      expect(await ui.find({ type: 'Text', text: /^ ?80k → 30k$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ *Messages$/ })).toBeUndefined()
    })
  }
})
