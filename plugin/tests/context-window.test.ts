import { expect, mock, test } from 'claude-code/testing'
import { BREAKDOWN, NOW, STEP, SURFACES, TIER_HEX, band, cached, fill, graphic, measured, mockHost, session, tiers, usage } from './kit'

for (const surface of SURFACES) {
  test(`the effective window drives percentages, graphics, growth and pane details (${surface})`, async ($, on) => {
    let window = 1_000_000
    let tokens = 320_000
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.measure', ($, e) => ({ changed: e.changed }))
    on('command.run', ($, e) => {
      window = e.args === 'auto' ? 1_000_000 : 400_000
      return { text: 'fictional native result' }
    })
    on('session.usage', ($, e) => ({ value: usage(tokens, [], e.breakdown !== undefined && {
      ...BREAKDOWN, rawMaxTokens: window, maxTokens: window, autoCompactThreshold: window - 33_000,
    }) }))
    mockHost(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(session(surface))
    const ui = await $.ui.mount(band(surface))
    expect(await ui.find({ type: 'Text', text: /^ ?320k\/1M$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^ ?32%$/ }))?.props.color).toBe(TIER_HEX[3])
    const command = { command: 'autocompact', args: '400k', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 160 } } as const
    expect(await $.command.run(command)).toEqual({ text: 'fictional native result' })
    await clock.advance(100)
    expect(await ui.find({ type: 'Text', text: /^ ?320k\/400k$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^ ?80%$/ }))?.props.color).toBe(TIER_HEX[8])
    await graphic(ui, 'bar', surface, /^■■■■■■■■□□$/, 8)
    const detail = await $.ui.mount({ plugin: 'ccoverhead', surface, component: 'Pane', requestId: 'ccoverhead',
      props: { title: 'ccOverhead', isFocused: false, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 60 }, view: {} } })
    expect(await detail.find({ type: 'Text', text: /^ ?320k of 400k$/ })).toBeDefined()
    expect(await detail.find({ type: 'Text', text: /^ ?1M tokens$/ })).toBeDefined()
    expect(await detail.find({ type: 'Text', text: /^ ?at 367k$/ })).toBeDefined()
    // Changing the denominator does not fabricate a growth sample. Actual growth uses the same window.
    expect(await ui.find({ type: 'Text', text: /↑/ })).toBeUndefined()
    await $.session.measure(measured(fill(tokens)))
    tokens = 400_000
    await $.session.measure(measured(fill(tokens)))
    expect(await ui.find({ type: 'Text', text: /^ ?100%$/ })).toBeDefined()
    // 80k / 400k = 20%, not 8% of the model's 1M capacity. Ignore the terminal's uncolored wrapper.
    if (surface === 'terminal') {
      const bars = await ui.findAll({ type: 'Text', text: /^█$/ })
      expect(bars.filter(b => b.props.color !== undefined).map(b => b.props.color)).toEqual([TIER_HEX[8]])
    } else await tiers(ui, surface, [8])
    tokens = 440_000
    await $.session.measure(measured(fill(tokens)))
    expect(await ui.find({ type: 'Text', text: /^ ?110%$/ })).toBeDefined()
    await graphic(ui, 'bar', surface, /^■■■■■■■■■■$/, 9)
    await $.command.run({ ...command, args: 'auto' })
    await clock.advance(100)
    expect(await ui.find({ type: 'Text', text: /^ ?440k\/1M$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ ?44%$/ })).toBeDefined()
    expect(await detail.find({ type: 'Text', text: /^model limit$/ })).toBeUndefined()
  })

  test(`the existing clock reads window changes with unchanged usage and model (${surface})`, async ($, on) => {
    let window = 1_000_000
    let enabled = true
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.usage', ($, e) => ({ value: usage(320_000, [], e.breakdown !== undefined && {
      ...BREAKDOWN, rawMaxTokens: window, isAutoCompactEnabled: enabled,
    }) }))
    mockHost(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(session(surface))
    const ui = await $.ui.mount(band(surface))
    window = 400_000
    await clock.advance(30_000)
    expect(await ui.find({ type: 'Text', text: /^ ?80%$/ })).toBeDefined()
    // The denominator is the reported window, independently of whether compaction is enabled.
    enabled = false
    window = 800_000
    await clock.advance(30_000)
    expect(await ui.find({ type: 'Text', text: /^ ?320k\/800k$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ ?40%$/ })).toBeDefined()
  })

  test(`missing or invalid windows fall back to model capacity and recover (${surface})`, async ($, on) => {
    let raw: number | undefined = 400_000
    let refused = false
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.usage', ($, e) => {
      if (e.breakdown && refused) throw new Error('fictional unavailable breakdown')
      return { value: usage(320_000, [], e.breakdown !== undefined && { ...BREAKDOWN, rawMaxTokens: raw as number }) }
    })
    mockHost(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(session(surface))
    const ui = await $.ui.mount(band(surface))
    for (const invalid of [undefined, 0, -1, NaN, Infinity, 2_000_000]) {
      raw = invalid
      await clock.advance(30_000)
      expect(await ui.find({ type: 'Text', text: /^ ?320k\/1M$/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^ ?32%$/ })).toBeDefined()
    }
    raw = 400_000
    await clock.advance(30_000)
    expect(await ui.find({ type: 'Text', text: /^ ?80%$/ })).toBeDefined()
    refused = true
    await clock.advance(30_000)
    expect(await ui.find({ type: 'Text', text: /^ ?32%$/ })).toBeDefined()
    refused = false
    await clock.advance(30_000)
    expect(await ui.find({ type: 'Text', text: /^ ?80%$/ })).toBeDefined()
  })

  test(`fresh estimates use the effective window and model switches replace both capacities (${surface})`, async ($, on) => {
    let model = STEP.model
    let capacity = 1_000_000
    let window = 400_000
    let total = 320_000
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.model', () => ({ value: model }))
    on('session.usage', ($, e) => ({ value: {
      startedAt: 0, rateLimits: [], context: { window: capacity, ...(e.breakdown && { breakdown: {
        ...BREAKDOWN, model, rawMaxTokens: window, totalTokens: total,
      } }) },
    } }))
    mockHost(on)
    const clock = mock.clock(on, { now: NOW })
    await $.session.start(session(surface))
    const ui = await $.ui.mount(band(surface))
    expect(await ui.find({ type: 'Text', text: /^ ?~320k\/400k$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ ?~80%$/ })).toBeDefined()
    await graphic(ui, 'bar', surface, /^■■■■■■■■□□$/, 'dim')
    model = 'claude-haiku-4-5'
    capacity = 200_000
    window = 100_000
    total = 80_000
    await clock.advance(30_000)
    expect(await ui.find({ type: 'Text', text: /^ ?~80k\/100k$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ ?~80%$/ })).toBeDefined()
    window = 1_000_000 // Even a stale or oversized reading cannot exceed the new model's capacity.
    await clock.advance(30_000)
    expect(await ui.find({ type: 'Text', text: /^ ?~80k\/200k$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ ?~40%$/ })).toBeDefined()
  })

  test(`subagents keep the model capacity when the main window is smaller (${surface})`, async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('session.model', () => ({ value: STEP.model }))
    on('session.usage', ($, e) => ({ value: usage(320_000, [], e.breakdown !== undefined && { ...BREAKDOWN, rawMaxTokens: 400_000 }) }))
    on('turn.step', async function* () { return cached(319_999, 0) })
    mockHost(on)
    mock.clock(on, { now: NOW })
    await $.session.start(session(surface))
    for await (const _ of $.turn.step({ ...STEP, agentId: 'fictional-agent' })) { /* drain */ }
    const ui = await $.ui.mount({ ...band(surface), props: { ...band(surface).props, view: { agentId: 'fictional-agent' } } })
    expect(await ui.find({ type: 'Text', text: /^agent$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ ?320k\/1M$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ ?32%$/ })).toBeDefined()
  })
}
