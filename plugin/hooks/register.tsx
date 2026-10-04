// ccOverhead: the band above the Claude Code prompt and the /ccoverhead pane. The context window with where
// auto-compaction runs, each turn's growth, the 5h/7d quota and prompt-cache warmth, on one safe-to-warning
// colour scale. Reads only what the engine reports: no files, no processes, no network, no model requests.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

import type { OverheadAgent, OverheadBreakdown, OverheadCache, OverheadCacheStats, OverheadCompaction, OverheadCtx, OverheadLimit } from '../types'
import { bandRich, bandTerminal, paneRich, paneTerminal } from './draw'
import { CACHE_TTL_MS, fit } from './format'
import type { AgentView, BandInput } from './format'
import { paneLines } from './pane'
import { NO_CACHE_STATS, addAgentStep, addCompaction, addSample, addStep, addTimeline, baseModel, compacted } from './track'

// Session-long values the host keeps across a reload of this module.
const ctx = atom({ plugin: 'ccoverhead', key: 'ctx' } as const, null as OverheadCtx | null)
const history = atom({ plugin: 'ccoverhead', key: 'history' } as const, [] as number[])
const timeline = atom({ plugin: 'ccoverhead', key: 'timeline' } as const, [] as number[])
const compactions = atom({ plugin: 'ccoverhead', key: 'compactions' } as const, [] as OverheadCompaction[])
const limits = atom({ plugin: 'ccoverhead', key: 'limits' } as const, [] as OverheadLimit[])
const limitsLive = atom({ plugin: 'ccoverhead', key: 'limitsLive' } as const, false)
const cache = atom({ plugin: 'ccoverhead', key: 'cache' } as const, null as OverheadCache | null)
const cacheStats = atom({ plugin: 'ccoverhead', key: 'cacheStats' } as const, NO_CACHE_STATS as OverheadCacheStats)
const cacheTtl = atom({ plugin: 'ccoverhead', key: 'cacheTtl' } as const, CACHE_TTL_MS)
const model = atom({ plugin: 'ccoverhead', key: 'model' } as const, null as string | null)
const agents = atom({ plugin: 'ccoverhead', key: 'agents' } as const, [] as OverheadAgent[])
const breakdown = atom({ plugin: 'ccoverhead', key: 'breakdown' } as const, null as OverheadBreakdown | null)

// Countdowns are whole minutes; redraw often enough that they never lag by more than half of one.
const TICK_MS = 30_000
// The last live quota windows, shared with new sessions until they get their own reading.
const STORE_LIMITS = 'limits'
// The pane's id and the command that opens it; named after the plugin, since a command has no plugin prefix.
const PANE = 'ccoverhead'

export const register: Register = on => {
  let tick: Timer | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await load($)
    tick?.cancel()
    tick = $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
    // A host that registers no commands still draws the band.
    try {
      await $.command.register({ name: PANE, description: 'Show the context, growth, cache and quota in detail' })
    } catch {
      // no pane command
    }
    return result
  })

  // /clear, /resume and /branch start another conversation with no new session.start: the old
  // one's context, breakdown, growth, cache and subagents no longer apply, the account's quota still does.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    // Return the chain's answer directly; refreshing our figures cannot change its first message.
    try {
      return await next(e)
    } finally {
      await update($, ctx, () => null)
      await update($, breakdown, () => null)
      await update($, history, () => [])
      await update($, timeline, () => [])
      await update($, compactions, () => [])
      await update($, cache, () => null)
      await update($, cacheStats, () => NO_CACHE_STATS)
      await update($, agents, () => [])
      await load($)
    }
  })

  // After each turn, and whenever a quota window moves a point. A reading that says the windows changed is
  // taken even when it is empty: a window withdrawn (a spend limit has no reset to expire it) goes too.
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await readModel($)
    await take($, e.context, e.rateLimits, e.changed.includes('rateLimits'))
    return result
  })

  // A compaction of the main conversation, observed and passed on unchanged: growth starts over from it,
  // and its next request writes a new conversation, which is no rewrite of a lapsed cache.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && e.trigger !== 'precompute' && result.skip === undefined) {
      const before = result.tokensBefore ?? (await read($, timeline)).at(-1)
      await update($, compactions, list => addCompaction(list ?? [], { before, after: result.tokensAfter }))
      await update($, history, () => [])
      await update($, timeline, () => [])
      await update($, cacheStats, s => compacted(s ?? NO_CACHE_STATS))
    }
    return result
  })

  // /model, the picker, a fallback: the weekly group follows the new model at once, and the new model starts
  // with a cold cache (each model has its own); the switch also says how long the cache lives.
  on('classic.PostModelSwitch', async ($, e, next) => {
    const result = await next(e)
    await update($, model, () => e.to_model)
    await update($, cacheTtl, () => (e.cache_ttl === '5m' ? 5 * 60_000 : 60 * 60_000))
    if (baseModel(e.from_model) !== baseModel(e.to_model)) {
      const at = await $.clock.now()
      await update($, cache, c => (c ? { at, warm: false } : c))
    }
    return result
  })

  // Each request: on the main conversation, when it finished, whether it touched the cache and the running
  // counts; on a subagent, its context total.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const u = result.usage
    if (!u) return result
    if (e.agentId === undefined) {
      const touched = (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
      const at = await $.clock.now()
      await update($, cache, () => ({ at, warm: touched > 0 }))
      await update($, cacheStats, s => addStep(s ?? NO_CACHE_STATS, u, e.turnId))
    } else {
      const id = e.agentId
      const known = (await read($, agents)).some(a => a.id === id)
      const label = known ? undefined : await agentType($, id)
      await update($, agents, list => addAgentStep(list ?? [], id, u.model, u, label))
    }
    return result
  })

  on('command.run', { command: PANE }, async $ => {
    await load($)
    // A pane the surface cannot place yet waits and is seated when one can. No text either way: a command's
    // text is a transcript row the model reads too.
    await $.ui.open({ id: PANE, title: 'ccOverhead', rows: 24 })
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const band = await bandInput($, e.props.view.agentId)
    const gs = fit(band, e.props.bodyColumns - 2)
    if (gs.length === 0) return next(e)
    // Branch on the surface, not on the table: the terminal's table answers `'Svg' in` with a placeholder.
    if (e.surface === 'terminal') return bandTerminal($.ui.resolve(e), gs)
    return bandRich($.ui.resolve(e), gs)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const band = await bandInput($, e.props.view.agentId)
    const lines = paneLines({
      ...band,
      timeline: await read($, timeline),
      compactions: await read($, compactions),
      cacheStats: await read($, cacheStats),
      agents: await read($, agents),
      breakdown: await read($, breakdown),
      viewing: e.props.view.agentId,
    })
    if (e.surface === 'terminal') return paneTerminal($.ui.resolve(e), lines)
    return paneRich($.ui.resolve(e), lines)
  })
}

// What the band draws from, read (and so subscribed to) by a render hook.
async function bandInput($: EngineInterface, viewing: string | undefined): Promise<BandInput> {
  const c = await read($, ctx)
  const m = await read($, model)
  const stats = await read($, cacheStats)
  let view: AgentView | undefined
  if (viewing !== undefined) {
    const agent = (await read($, agents)).find(a => a.id === viewing)
    // An agent on the model the window was read for has that window; on another model (or before the first
    // reading after a switch) the window is not reported.
    const window = agent && c?.model && baseModel(agent.model) === baseModel(c.model) ? c.window : undefined
    view = { agent, window }
  }
  return {
    now: await $.clock.now(),
    ctx: c,
    history: await read($, history),
    limits: await read($, limits),
    limitsLive: await read($, limitsLive),
    cache: await read($, cache),
    cacheTtl: await read($, cacheTtl),
    rewrite: stats.rewrite?.tokens,
    model: m,
    view,
  }
}

// Start of session, a reload or the pane: the engine's figures, else the last live quota from the store.
async function load($: EngineInterface) {
  const { context, rateLimits } = await $.session.usage()
  await readModel($)
  await take($, context, rateLimits, false)
  if (pick(rateLimits).length === 0) {
    const saved = await $.store.get(STORE_LIMITS)
    if (Array.isArray(saved) && !(await read($, limitsLive))) {
      await update($, limits, () => saved as OverheadLimit[])
    }
  }
}

// `withdrawn`: an empty reading means the windows went away, not that there is no reading yet.
async function take($: EngineInterface, context: SessionContextUsage | undefined, rateLimits: SessionRateLimit[] | undefined, withdrawn: boolean) {
  const b = await localBreakdown($)
  if (b) await update($, breakdown, () => slim(b))
  if (context?.window) {
    const m = await read($, model)
    const next: OverheadCtx = { tokens: context.tokens, window: context.window, percent: context.percent, ...(m && { model: m }) }
    // Where auto-compaction runs; without a breakdown this time, where it ran last time.
    const compactAt = b ? (b.isAutoCompactEnabled ? (b.autoCompactThreshold ?? undefined) : undefined) : (await read($, ctx))?.compactAt
    if (compactAt) next.compactAt = compactAt
    if (context.tokens !== undefined && context.tokens > 0) {
      const t = context.tokens
      const before = (await read($, timeline)).at(-1)
      await update($, history, samples => addSample(samples, t))
      await update($, timeline, samples => addTimeline(samples, t))
      // A drop no compaction event announced (one this plugin did not see): treated as one.
      if (before !== undefined && t < before) {
        await update($, compactions, list => addCompaction(list ?? [], { before, after: t }))
        await update($, cacheStats, s => compacted(s ?? NO_CACHE_STATS))
      }
    } else {
      // No response in this window yet (new, cleared or just compacted): /context's local estimate.
      next.estimate = b?.totalTokens
    }
    await update($, ctx, () => next)
  }
  const live = pick(rateLimits)
  if (live.length > 0 || withdrawn) {
    const before = JSON.stringify(await read($, limits))
    await update($, limits, () => live)
    await update($, limitsLive, () => true)
    // Only this session's own new reading is shared, so an idle session never overwrites a newer one.
    if (JSON.stringify(live) !== before) await $.store.set(STORE_LIMITS, live)
  }
}

// The main loop's model; a host that cannot say leaves the weekly group on the all-models window.
async function readModel($: EngineInterface) {
  let id: string | null = null
  try {
    id = await $.session.model()
  } catch {
    // keep the all-models window
  }
  await update($, model, () => id)
}

// /context's breakdown counted locally (`summary`, which sends no request; `full` would send one per tool).
// One the engine cannot give (no session bound, a thin client) is none, never a failed measure that would
// leave the band on the old figures.
async function localBreakdown($: EngineInterface): Promise<SessionContextBreakdown | undefined> {
  try {
    return (await $.session.usage({ breakdown: 'summary' })).context.breakdown
  } catch {
    return undefined
  }
}

// What the pane keeps of a breakdown: tokens by row and by MCP server, never a file's path or name.
function slim(b: SessionContextBreakdown): OverheadBreakdown {
  const servers = new Map<string, number>()
  for (const t of b.mcpTools ?? []) if (t.isLoaded) servers.set(t.serverName, (servers.get(t.serverName) ?? 0) + t.tokens)
  return {
    autoCompact: b.isAutoCompactEnabled,
    rows: (b.categories ?? []).filter(c => c.kind === 'used' && c.tokens > 0).map(c => ({ name: c.name, tokens: c.tokens })),
    deferred: (b.categories ?? []).filter(c => c.kind === 'deferred').reduce((n, c) => n + c.tokens, 0),
    mcp: [...servers].map(([server, tokens]) => ({ server, tokens })),
  }
}

// A subagent's type (`Explore`, `general-purpose`), not its task's description, which the model wrote.
async function agentType($: EngineInterface, id: string): Promise<string | undefined> {
  try {
    return (await $.agent.list()).find(a => a.id === id)?.type
  } catch {
    return undefined
  }
}

// Every window reported, so a model's own weekly window is at hand when the model switches.
function pick(rateLimits: SessionRateLimit[] | undefined): OverheadLimit[] {
  return (rateLimits ?? []).map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
}
