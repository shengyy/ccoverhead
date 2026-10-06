import { expect, mock, test } from 'claude-code/testing'
import type { AgentInfo, AgentSpawnInput, SessionUsage, TurnCompleteInput } from 'claude-code'
import { ACTIVITY_FRAME_MS, ACTIVITY_FRAMES } from '../hooks/activity'
import { colorOf, fit, forecastBar, svgOf, width } from '../hooks/format'
import { quotaForecast } from '../hooks/track'
import { paneLines } from '../hooks/pane'
import { MIN, NOW, STEP, SURFACES, band, cached, fill, iso, measured, mockHost, session, usage } from './kit'

const DONE: TurnCompleteInput = { turnId: 't', answer: '', durationMs: 1, isAborted: false, reason: 'answer' }
const SPAWN: AgentSpawnInput = {
  prompt: 'fictional fixture', description: 'fictional', tool_use_id: 'fixture', subagentType: 'Explore',
  provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-haiku-4-5', background: true, fork: false,
}

for (const surface of SURFACES) {
  test(`native events retain the first reading when they discover a new conversation (${surface})`, async ($, on) => {
    let id = 'fictional-old'
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.id', () => ({ value: id }))
    on('session.usage', () => ({ value: usage(9_000, [], false) }))
    on('session.measure', ($, e) => ({ changed: e.changed }))
    on('turn.step', async function* () { return cached(30_000, 1_000) })
    mockHost(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(session(surface))
    const ui = await $.ui.mount(band(surface))
    for await (const _ of $.turn.step(STEP)) { /* drain */ }
    id = 'fictional-measure'
    await $.session.measure({ ...measured(fill(9_000)), cost: { usd: 0.5 } })
    expect(await ui.find({ type: 'Text', text: /^ ?9k\/1M$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ ?≈\$0.50$/ })).toBeDefined()
    const detail = await $.ui.mount({ plugin: 'ccoverhead', surface, component: 'Pane', requestId: 'ccoverhead',
      props: { title: 'ccOverhead', isFocused: false, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 60 }, view: {} } })
    expect(await detail.find({ type: 'Text', text: /31k in/ })).toBeUndefined()
    id = 'fictional-step'
    for await (const _ of $.turn.step(STEP)) { /* drain */ }
    expect(await detail.find({ type: 'Text', text: /^ ?31k in · 1 out$/ })).toBeDefined()
    await clock.advance(100)
    expect(await detail.find({ type: 'Text', text: /^ ?fictional-step$/ })).toBeDefined()
  })

  test(`late cost and quota readings settle without a context change (${surface})`, async ($, on) => {
    let dollars = 1
    let percentUsed = 20
    let hasLimits = true
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    on('session.usage', () => ({ value: {
      ...usage(40_000, hasLimits ? [{ kind: 'five_hour', percentUsed, resetsAt: iso(180 * MIN) }] : [], false),
      cost: { usd: dollars },
    } }))
    mockHost(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(session(surface))
    const ui = await $.ui.mount(band(surface))
    await $.turn.start({ turnId: 't', text: '' })
    await $.turn.complete(DONE)
    // The host posts the final ledger only after turn.complete returns; no measure event follows.
    dollars = 1.2
    await clock.advance(100)
    expect(await ui.find({ type: 'Text', text: /^ ?\(\+\$0.20\)$/ })).toBeDefined()
    // Even later background accounting changes neither context nor the model.
    dollars = 1.3
    percentUsed = 25
    await clock.advance(30_000)
    expect(await ui.find({ type: 'Text', text: /^ ?≈\$1.30$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ ?\(\+\$0.30\)$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ ?25%$/ })).toBeDefined()
    // The next turn replaces the baseline rather than accumulating the previous turn again.
    await $.turn.start({ turnId: 'next', text: '' })
    dollars = 1.35
    hasLimits = false
    await $.turn.complete({ ...DONE, turnId: 'next' })
    await clock.advance(100)
    expect(await ui.find({ type: 'Text', text: /^ ?\(\+\$0.05\)$/ })).toBeDefined()
    await clock.advance(30_000)
    expect(await ui.find({ type: 'Text', text: /^5h$/ })).toBeUndefined()
  })

  for (const [source, delayed] of [
    ['load', 'identity'], ['load', 'usage'], ['load', 'breakdown'], ['load', 'model'],
    ['measure', 'identity'], ['measure', 'model'], ['step', 'identity'],
  ] as const) {
    test(`a ${source} ${delayed} read crossing clear cannot restore old session figures (${surface})`, async ($, on) => {
      let id = 'fictional-old'
      let tokens = 40_000
      let dollars = 2
      let model = 'claude-opus-5-5'
      let delayNext = false
      let entered!: () => void
      let release!: () => void
      const enteredRead = new Promise<void>(resolve => { entered = resolve })
      const delayedRead = new Promise<void>(resolve => { release = resolve })
      const pause = async () => {
        if (!delayNext) return
        delayNext = false
        entered()
        await delayedRead
      }
      on('session.start', ($, e) => ({ cwd: e.cwd }))
      on('session.measure', ($, e) => ({ changed: e.changed }))
      on('turn.step', async function* () { return cached(30_000, 1_000) })
      on('session.id', async () => {
        const value = id
        if (delayed === 'identity') await pause()
        return { value }
      })
      on('session.model', async () => {
        const value = model
        if (delayed === 'model') await pause()
        return { value }
      })
      on('session.usage', async ($, e) => {
        const value = { ...usage(tokens, [], Boolean(e.breakdown)), cost: { usd: dollars } }
        if (delayed === (e.breakdown ? 'breakdown' : 'usage')) await pause()
        return { value }
      })
      on('classic.SessionStart', () => ({}))
      on('ui.open', () => ({ value: { isPlaced: true } }))
      mockHost(on)
      mock.clock(on, { now: NOW })
      await $.session.start(session(surface))
      const ui = await $.ui.mount(band(surface))
      delayNext = true
      const opening = source === 'load'
        ? $.command.run({ command: 'ccoverhead', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 160 } })
        : source === 'measure'
          ? $.session.measure({ ...measured(fill(tokens)), cost: { usd: dollars } })
          : (async () => { for await (const _ of $.turn.step(STEP)) { /* drain */ } })()
      await enteredRead
      id = 'fictional-new'
      tokens = 9_000
      dollars = 0
      model = 'claude-haiku-4-5'
      await $.classic.SessionStart({ source: 'clear' })
      release()
      await opening
      expect(await ui.find({ type: 'Text', text: /^ ?9k\/1M$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?≈\$0.00$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /40k|\$2.00/ })).toBeUndefined()
      const detail = await $.ui.mount({ plugin: 'ccoverhead', surface, component: 'Pane', requestId: 'ccoverhead',
        props: { title: 'ccOverhead', isFocused: false, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 60 }, view: {} } })
      expect(await detail.find({ type: 'Text', text: /^ ?claude-haiku-4-5$/ })).toBeDefined()
    })
  }

  test(`agent animation follows native spawn and settled status without a model call (${surface})`, async ($, on) => {
    let status: AgentInfo['status'] = 'pending'
    let denied = false
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('turn.complete', () => ({ text: '' }))
    on('agent.list', () => ({ value: [{ id: 'a1', type: 'Explore', description: 'fictional', status }] }))
    on('agent.spawn', () => {
      if (denied) return { deny: 'fictional denial' }
      status = 'running'
      return { model: 'claude-haiku-4-5', agentId: 'a1' }
    })
    mockHost(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(session(surface))
    const ui = await $.ui.mount(band(surface))
    expect(await ui.find({ type: 'Text', text: /^agent$/ })).toBeUndefined()
    for (const stopped of ['waiting', 'idle', 'completed', 'failed', 'killed'] as const) {
      expect(await $.agent.spawn(SPAWN)).toEqual({ model: 'claude-haiku-4-5', agentId: 'a1' })
      expect(await ui.find({ type: 'Text', text: /^agent$/ })).toBeDefined()
      await $.turn.complete({ ...DONE, agentId: 'a1' })
      // Model the host installing final status after the completion hook returns.
      status = stopped
      await clock.advance(100)
      expect(await ui.find({ type: 'Text', text: /^agent$/ })).toBeUndefined()
      expect(await ui.find({ type: 'Client' })).toBeUndefined()
      expect((await ui.findAll({ type: 'Svg' })).some(n => String(n.props.alt).endsWith('running agents'))).toBe(false)
    }
    denied = true
    expect(await $.agent.spawn(SPAWN)).toEqual({ deny: 'fictional denial' })
    await clock.advance(100)
    expect(await ui.find({ type: 'Text', text: /^agent$/ })).toBeUndefined()
  })

  test(`native cost total, turn delta and downstream band survive together (${surface})`, async ($, on) => {
    let dollars: number | undefined = 1.72
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.measure', ($, e) => ({ changed: e.changed }))
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    mockHost(on, undefined, 'light', 'Other band')
    on('session.usage', () => ({ value: { ...usage(40_000, [], false), ...(dollars !== undefined && { cost: { usd: dollars } }) } }))
    mock.clock(on, { now: NOW })
    await $.session.start(session(surface))
    const ui = await $.ui.mount(band(surface))
    expect(await ui.find({ type: 'Text', text: 'Other band' })).toBeDefined()
    await $.turn.start({ turnId: 't', text: '' })
    dollars = 1.84
    await $.session.measure({ ...measured(fill(40_000)), cost: { usd: dollars } })
    await $.turn.complete({ ...DONE, agentId: 'a1' })
    await $.turn.complete(DONE)
    expect((await ui.find({ type: 'Text', text: /^ ?≈\$1.84$/ }))?.props.color).toBe('#8a6215')
    const costLabel = await ui.find({ type: 'Text', text: /^cost$/ })
    expect(costLabel).toBeDefined()
    expect(costLabel?.props.color).toBeUndefined()
    expect(costLabel?.props.dimColor).not.toBe(true)
    expect((await ui.find({ type: 'Text', text: /^ ?\(\+\$0.12\)$/ }))?.props.dimColor).toBe(true)
    // A narrow band keeps the total and drops the turn increment only when it cannot fit.
    const narrow = await $.ui.mount(band(surface, 40))
    expect(await narrow.find({ type: 'Text', text: /^ ?≈\$1.84$/ })).toBeDefined()
    expect(await narrow.find({ type: 'Text', text: /\+\$/ })).toBeUndefined()
    // Ledger restarts must never leave an increment belonging to the old total.
    dollars = 0
    await $.session.measure({ ...measured(fill(40_000)), cost: { usd: dollars } })
    expect(await ui.find({ type: 'Text', text: /^ ?≈\$0.00$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\+\$/ })).toBeUndefined()
    dollars = undefined
    await $.session.measure(measured(fill(40_000)))
    expect(await ui.find({ type: 'Text', text: /\$/ })).toBeUndefined()
  })

  test(`mid-turn refresh reads native context without adding a growth sample (${surface})`, async ($, on) => {
    let tokens = 40_000
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.measure', ($, e) => ({ changed: e.changed }))
    on('session.usage', () => ({ value: usage(tokens, [], false) }))
    on('turn.step', async function* () { return cached(800_000, 100_000) })
    mockHost(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(session(surface))
    await $.session.measure(measured(fill(tokens)))
    const ui = await $.ui.mount(band(surface))
    tokens = 60_000
    for await (const _ of $.turn.step(STEP)) { /* drain */ }
    await clock.advance(100)
    expect(await ui.find({ type: 'Text', text: /^ ?60k\/1M$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /↑|900k/ })).toBeUndefined()
    tokens = 70_000
    await $.session.measure(measured(fill(tokens)))
    expect(await ui.find({ type: 'Text', text: /^ ?↑30k$/ })).toBeDefined()
  })

  test(`native polling resets a changed conversation and counts only running agents (${surface})`, async ($, on) => {
    let id = 'fictional-a'
    let ledger: SessionUsage = { ...usage(40_000, [], false), cost: { usd: 2 } }
    let list: { id: string; type: string; description: string; status: 'running' | 'completed' }[] = [
      { id: 'a1', type: 'Explore', description: 'fictional', status: 'running' },
      { id: 'a2', type: 'Explore', description: 'fictional', status: 'completed' },
    ]
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.measure', ($, e) => ({ changed: e.changed }))
    on('session.id', () => ({ value: id }))
    on('session.usage', () => ({ value: ledger }))
    on('agent.list', () => ({ value: list }))
    on('turn.step', async function* () { return cached(30_000, 1_000) })
    mockHost(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(session(surface))
    await $.session.measure({ ...measured(fill(40_000)), cost: { usd: 2 } })
    for await (const _ of $.turn.step(STEP)) { /* drain */ }
    const ui = await $.ui.mount(band(surface))
    if (surface === 'terminal') {
      expect(await ui.find({ type: 'Client', key: 'agent-activity' })).toBeDefined()
      expect((await ui.find({ type: 'Text', in: 'agent-activity' }))?.props.color).toBe('#b8e45c')
      const bandBeforeAnimation = await ui.drawn()
      expect(await ui.find({ type: 'Text', text: ACTIVITY_FRAMES[0], in: 'agent-activity' })).toBeDefined()
      await ui.advance(ACTIVITY_FRAME_MS)
      expect(await ui.find({ type: 'Text', text: ACTIVITY_FRAMES[1], in: 'agent-activity' })).toBeDefined()
      expect(await ui.drawn()).toEqual(bandBeforeAnimation)
      await ui.redraw()
      await ui.advance(ACTIVITY_FRAME_MS)
      const afterRedraw = await ui.find({ type: 'Text', in: 'agent-activity' })
      expect(afterRedraw?.text).toBe(ACTIVITY_FRAMES[2])
      await ui.redraw(band(surface, 40).props)
      await ui.advance(10 * ACTIVITY_FRAME_MS)
      expect(await ui.find({ type: 'Client' })).toBeUndefined()
      await ui.redraw(band(surface).props)
      expect(await ui.find({ type: 'Client', key: 'agent-activity' })).toBeDefined()
    } else {
      expect((await ui.findAll({ type: 'Svg' })).some(n => n.props.alt === '1 running agents' && n.props.isInteractive === true)).toBe(true)
    }
    expect((await ui.find({ type: 'Text', text: /^agent$/ }))?.props.color).toBeUndefined()
    for (const count of [2, 3, 4, 7]) {
      list = Array.from({ length: count }, (_, i) => ({ id: `a${i}`, type: 'Explore', description: 'fictional', status: 'running' }))
      await clock.advance(30_000)
      const visible = Math.min(count, 3)
      if (surface === 'terminal') {
        const clients = await ui.findAll({ type: 'Client' })
        expect(clients.length).toBe(1)
        expect(clients[0]?.props.width).toBe(visible)
        const before = [...(await ui.find({ type: 'Text', in: 'agent-activity' }))!.text!]
        expect(before.length).toBe(visible)
        const phase = ACTIVITY_FRAMES.indexOf(before[0]!)
        expect(before.join('')).toBe(ACTIVITY_FRAMES[phase]!.repeat(visible))
        await ui.advance(ACTIVITY_FRAME_MS)
        const after = [...(await ui.find({ type: 'Text', in: 'agent-activity' }))!.text!]
        expect(after.join('')).toBe(ACTIVITY_FRAMES[(phase + 1) % 8]!.repeat(visible))
      } else {
        const icon = (await ui.findAll({ type: 'Svg' })).find(n => n.props.alt === `${count} running agents`)!
        expect(icon.props.width).toBe(visible * 10 - 2)
        expect(icon.props.height).toBe(14)
        // All four rows exist in each vector grid, including the bottom braille dots.
        const source = String(icon.props.source)
        expect(source.match(/cy="12.5"/g)?.length).toBe(visible * 4)
        const phases = [...source.matchAll(/<animate[^>]*values="([^"]+)"/g)]
        expect(new Set(Array.from({ length: visible }, (_, i) => phases[i * 8]![1])).size).toBe(1)
      }
      if (count > 3) expect((await ui.find({ type: 'Text', text: `+${count - 3}` }))?.props.color).toBe('#b8e45c')
      else expect(await ui.find({ type: 'Text', text: /^\+\d+$/ })).toBeUndefined()
    }
    const narrow = await $.ui.mount(band(surface, 40))
    expect(await narrow.find({ type: 'Client' })).toBeUndefined()
    expect((await narrow.findAll({ type: 'Svg' })).some(n => String(n.props.alt).endsWith('running agents'))).toBe(false)
    expect(await ui.find({ type: 'Text', text: /^ ?TTL unknown$/ })).toBeDefined()
    id = 'fictional-b'
    ledger = usage(undefined, [], true)
    list = []
    await clock.advance(30_000)
    expect(await ui.find({ type: 'Text', text: /40k|\$|TTL|↑/ })).toBeUndefined()
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
    expect((await ui.findAll({ type: 'Svg' })).some(n => String(n.props.alt).endsWith('running agents'))).toBe(false)
    expect(await ui.find({ type: 'Text', text: /^agent$/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^ ?~13k\/1M$/ })).toBeDefined()
  })
}

test('forecast uses the window-average formula, hides unusable readings, and stays out of the band', () => {
  const limit = { kind: 'five_hour', percentUsed: 50, resetsAt: iso(180 * MIN) }
  expect(quotaForecast(limit, NOW, NOW)).toEqual({ exhaustsAt: NOW + 120 * MIN, percentAtReset: 125 })
  expect(forecastBar(50, 125)).toBe('■■■■■▧▧▧▧▧')
  expect(forecastBar(20, 60)).toBe('■■▧▧▧▧□□□□')
  expect(svgOf({ text: '', bar: 50, barLabel: 'quota', forecast: 125 })?.alt).toContain('125% by reset')
  for (const percentUsed of [0, 100, -1, Number.NaN]) expect(quotaForecast({ ...limit, percentUsed }, NOW, NOW)).toBeUndefined()
  for (const resetsAt of [iso(299 * MIN), iso(0), 'invalid']) expect(quotaForecast({ ...limit, resetsAt }, NOW, NOW)).toBeUndefined()
  expect(quotaForecast(limit, NOW - 16 * MIN, NOW)).toBeUndefined()
  expect(quotaForecast({ ...limit, kind: 'spend_limit' }, NOW, NOW)).toBeUndefined()
  const input = { now: NOW, ctx: null, history: [], limits: [limit], limitsLive: true, cache: null, cacheTtl: null, model: null }
  const detail = paneLines({ ...input, limitsAt: NOW, timeline: [], compactions: [], cacheStats: { input: 0, output: 0, read: 0, write: 0, last: 0 }, agents: [], breakdown: null })
  expect(JSON.stringify(detail)).toContain('≈125% by reset · limit in ≈2h0m')
  expect(JSON.stringify(fit(input, 160))).not.toContain('pace')
})

test('theme fallback preserves native colors and money has no usage threshold', () => {
  expect(colorOf({ text: '', tier: 6 }, 'light')).toBe('#856d00')
  expect(colorOf({ text: '', tier: 6 }, 'native')).toBe('warning')
  for (const tier of [0, 6, 9]) expect(colorOf({ text: '', tier, money: true }, 'dark')).toBe('#dfbc70')
})

test('growth survives cost, agents and countdowns at constrained widths', () => {
  const input = {
    now: NOW, ctx: { tokens: 271_400, window: 1_000_000 },
    history: [180_000, 181_200, 186_000, 198_000, 232_000, 236_500, 268_000, 271_400],
    limits: [
      { kind: 'five_hour', percentUsed: 42, resetsAt: iso(154 * MIN) },
      { kind: 'seven_day', percentUsed: 63, resetsAt: iso(3300 * MIN) },
    ],
    limitsLive: true, cache: null, cacheTtl: null, model: null,
    cost: 1.84, turnCost: 0.12, activeAgents: 7,
  }
  for (const columns of [100, 80, 60, 50]) {
    const gs = fit(input, columns)
    expect(width(gs)).toBeLessThanOrEqual(columns)
    expect(gs.flat().some(s => s.spark?.length === 7)).toBe(true)
    expect(gs.flat().some(s => s.text.includes('↑3.4k'))).toBe(true)
  }
  const narrowText = fit(input, 60).flat().map(s => s.text).join('')
  expect(narrowText).not.toContain(ACTIVITY_FRAMES[0])
  expect(narrowText).not.toContain('$')
  const fullWidth = width(fit(input, 160))
  const withoutDelta = fit(input, fullWidth - 1).flat().map(s => s.text).join('')
  expect(withoutDelta).toContain('agent ⢹⢹⢹+4')
  expect(withoutDelta).toContain('≈$1.84')
  expect(withoutDelta).not.toContain('+$0.12')
  const withoutCost = fit(input, width(fit(input, fullWidth - 1)) - 1)
  expect(withoutCost.flat().map(s => s.text).join('')).not.toContain('$')
  expect(withoutCost.at(-1)?.some(s => s.agentCount === 7)).toBe(true)
  expect(fit(input, width(withoutCost) - 1).flat().some(s => s.agentCount !== undefined)).toBe(false)
  // A gateway window between weekly quota and agents follows the same right-to-left rule.
  const withSpend = { ...input, limits: [...input.limits, { kind: 'spend_limit', percentUsed: 12, resetsAt: iso(60 * MIN) }] }
  let prior = fit(withSpend, 300)
  for (let columns = width(prior) - 1; columns >= 18; columns--) {
    const gs = fit(withSpend, columns)
    expect(gs.map(g => g[0]!.text)).toEqual(prior.slice(0, gs.length).map(g => g[0]!.text))
    expect(gs.slice(0, -1)).toEqual(prior.slice(0, gs.length - 1))
    prior = gs
  }
  const agent = fit(input, 160).flat().find(s => s.agentCount === 7)!
  expect(colorOf(agent, 'light')).toBe('#567a00')
  expect(fit({ ...input, activeAgents: 0 }, 160).flat().some(s => s.agentCount !== undefined)).toBe(false)
})

for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
  test(`detail projection renders and expires without changing the band (${surface})`, async ($, on) => {
    const limits = [{ kind: 'five_hour', percentUsed: 50, resetsAt: iso(180 * MIN) }]
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.measure', ($, e) => ({ changed: e.changed }))
    on('session.usage', () => ({ value: usage(40_000, limits, false) }))
    mockHost(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(session('terminal'))
    await $.session.measure(measured(fill(40_000), limits))
    const ui = await $.ui.mount({
      plugin: 'ccoverhead', surface, component: 'Pane', requestId: 'ccoverhead',
      props: { title: 'ccOverhead', isFocused: false, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 60 }, view: {} },
    })
    expect(await ui.find({ type: 'Text', text: /≈125% by reset · limit in ≈2h0m/ })).toBeDefined()
    if (surface === 'terminal') expect((await ui.findAll({ type: 'Text', text: /^▧$/ })).length).toBe(5)
    else expect((await ui.findAll({ type: 'Svg' })).some(s => String(s.props.alt).includes('quota 50% used; approximately 125%'))).toBe(true)
    await clock.advance(16 * MIN)
    expect(await ui.find({ type: 'Text', text: /by reset/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^ ?50%$/ })).toBeDefined()
  })
}
