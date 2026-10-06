import { expect, mock, test } from 'claude-code/testing'
import type { SessionUsage, TurnCompleteInput } from 'claude-code'
import { colorOf, fit, forecastBar, svgOf } from '../hooks/format'
import { quotaForecast } from '../hooks/track'
import { paneLines } from '../hooks/pane'
import { MIN, NOW, STEP, SURFACES, band, cached, fill, iso, measured, mockHost, session, usage } from './kit'

const DONE: TurnCompleteInput = { turnId: 't', answer: '', durationMs: 1, isAborted: false, reason: 'answer' }

for (const surface of SURFACES) {
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
    expect((await ui.find({ type: 'Text', text: /^ ?\(\+\$0.12\)$/ }))?.props.dimColor).toBe(true)
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
    expect(await ui.find({ type: 'Text', text: '1 agent' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ ?TTL unknown$/ })).toBeDefined()
    id = 'fictional-b'
    ledger = usage(undefined, [], true)
    list = []
    await clock.advance(30_000)
    expect(await ui.find({ type: 'Text', text: /40k|\$|TTL|agent|↑/ })).toBeUndefined()
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
  const detail = paneLines({ ...input, limitsAt: NOW, timeline: [], compactions: [], cacheStats: { input: 0, read: 0, write: 0, last: 0 }, agents: [], breakdown: null })
  expect(JSON.stringify(detail)).toContain('≈125% by reset · limit in ≈2h0m')
  expect(JSON.stringify(fit(input, 160))).not.toContain('pace')
})

test('theme fallback preserves native colors and money has no usage threshold', () => {
  expect(colorOf({ text: '', tier: 6 }, 'light')).toBe('#856d00')
  expect(colorOf({ text: '', tier: 6 }, 'native')).toBe('warning')
  for (const tier of [0, 6, 9]) expect(colorOf({ text: '', tier, money: true }, 'dark')).toBe('#dfbc70')
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
