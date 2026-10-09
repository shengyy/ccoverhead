// ccOverhead: the band above the Claude Code prompt and the /ccoverhead pane. The context window with where
// auto-compaction runs, each turn's growth, the 5h/7d quota and prompt-cache warmth, on one safe-to-warning
// colour scale. Reads only what the engine reports: no files, no processes, no network, no model requests.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextBreakdown, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

import type { OverheadAgent, OverheadBreakdown, OverheadCache, OverheadCacheStats, OverheadCompaction, OverheadCtx, OverheadEffort, OverheadLimit, OverheadTheme } from '../types'
import { bandRich, bandTerminal, paneRich, paneTerminal } from './draw'
import { CACHE_TTL_MS, SHORT_TTL_MS, fit, groups, validCost } from './format'
import type { AgentView, BandInput } from './format'
import { paneLines } from './pane'
import { NO_CACHE_STATS, TIMELINE, addAgentStep, addCompaction, addSample, addStep, baseModel, clearRewrite, compacted, learnedTtl } from './track'

// Session-long values the host keeps across a reload of this module.
const ctx = atom({ plugin: 'ccoverhead', key: 'ctx' } as const, null as OverheadCtx | null)
const history = atom({ plugin: 'ccoverhead', key: 'history' } as const, [] as number[])
const timeline = atom({ plugin: 'ccoverhead', key: 'timeline' } as const, [] as number[])
const compactions = atom({ plugin: 'ccoverhead', key: 'compactions' } as const, [] as OverheadCompaction[])
const limits = atom({ plugin: 'ccoverhead', key: 'limits' } as const, [] as OverheadLimit[])
const limitsLive = atom({ plugin: 'ccoverhead', key: 'limitsLive' } as const, false)
const cache = atom({ plugin: 'ccoverhead', key: 'cache' } as const, null as OverheadCache | null)
const cacheStats = atom({ plugin: 'ccoverhead', key: 'cacheStats' } as const, NO_CACHE_STATS as OverheadCacheStats)
const cacheTtl = atom({ plugin: 'ccoverhead', key: 'cacheTtl' } as const, null as number | null)
const cost = atom({ plugin: 'ccoverhead', key: 'cost' } as const, null as number | null)
const turnCostBase = atom({ plugin: 'ccoverhead', key: 'turnCostBase' } as const, null as number | null)
const turnCost = atom({ plugin: 'ccoverhead', key: 'turnCost' } as const, null as number | null)
// null until the host's theme has been read; the band draws native colors meanwhile.
const theme = atom({ plugin: 'ccoverhead', key: 'theme' } as const, null as OverheadTheme | null)
const sessionId = atom({ plugin: 'ccoverhead', key: 'sessionId' } as const, null as string | null)
const limitsAt = atom({ plugin: 'ccoverhead', key: 'limitsAt' } as const, null as number | null)
const activeAgents = atom({ plugin: 'ccoverhead', key: 'activeAgents' } as const, 0)
const model = atom({ plugin: 'ccoverhead', key: 'model' } as const, null as string | null)
const effort = atom({ plugin: 'ccoverhead', key: 'effort' } as const, null as OverheadEffort | null)
const agents = atom({ plugin: 'ccoverhead', key: 'agents' } as const, [] as OverheadAgent[])
const breakdown = atom({ plugin: 'ccoverhead', key: 'breakdown' } as const, null as OverheadBreakdown | null)

// Countdowns are whole minutes; redraw often enough that they never lag by more than half of one.
const TICK_MS = 30_000
// The last live quota windows, shared with new sessions until they get their own reading.
const STORE_LIMITS = 'limits'
// The pane's id and the command that opens it; named after the plugin, since a command has no plugin prefix.
const PANE = 'ccoverhead'
// Invalidates in-flight native reads on a conversation reset. This is cancellation bookkeeping;
// all displayed values remain in the host's atoms.
let conversationRevision = 0

export const register: Register = on => {
  let tick: Timer | undefined
  let settling: Timer | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    tick?.cancel()
    tick = $.clock.every(TICK_MS, async () => {
      await ensureTheme($)
      await poll($).catch(() => undefined)
      $.ui.invalidate('ui.render')
    })
    await readTheme($)
    await readActiveAgents($)
    await load($).catch(() => undefined)
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
      await resetConversation($)
      await ensureTheme($)
      await load($)
      if (e.source !== 'clear') await resumed($, e)
    }
  })

  // After each turn, and whenever a quota window moves a point. A reading that says the windows changed is
  // taken even when it is empty: a window withdrawn (a spend limit has no reset to expire it) goes too.
  on('session.measure', async ($, e, next) => {
    let revision = conversationRevision
    const result = await next(e)
    if (revision !== conversationRevision) return result
    const changed = await syncSession($)
    if (!changed && revision !== conversationRevision) return result
    revision = conversationRevision
    await readModel($)
    if (revision !== conversationRevision) return result
    await takeCost($, e.cost?.usd)
    if (e.changed.includes('rateLimits')) {
      const at = await $.clock.now()
      await update($, limitsAt, () => at)
    }
    await take($, e.context, e.rateLimits, e.changed.includes('rateLimits'), true, revision)
    return result
  })

  // A compaction of the main conversation, observed and passed on unchanged: growth starts over from it, the
  // old window's figures and breakdown no longer describe the conversation, and its next request writes a
  // new conversation, which is no rewrite of a lapsed cache.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && e.trigger !== 'precompute' && result.skip === undefined) {
      const before = result.tokensBefore ?? (await read($, timeline)).at(-1)
      await update($, compactions, list => addCompaction(list ?? [], { before, after: result.tokensAfter }))
      await update($, history, () => [])
      await update($, timeline, () => [])
      await update($, cacheStats, s => compacted(s ?? NO_CACHE_STATS))
      await update($, cache, () => null)
      await update($, breakdown, () => null)
      await update($, ctx, c => (c ? withoutReading(c) : c))
      settling = refreshSoon($, settling)
    }
    return result
  })

  // /model, the picker, a fallback: the weekly group follows the new model at once, and the new model starts
  // with a cold cache (each model has its own); the switch also says how long the cache lives. The old
  // model's threshold and breakdown no longer apply.
  on('classic.PostModelSwitch', async ($, e, next) => {
    const result = await next(e)
    await setModel($, e.to_model)
    await update($, cacheTtl, () => (e.cache_ttl === '5m' ? SHORT_TTL_MS : CACHE_TTL_MS))
    settling = refreshSoon($, settling)
    return result
  })

  // Observe the host's spawn, never initiate one. Its list can settle just after the hook returns.
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    await readActiveAgents($)
    settling = refreshSoon($, settling)
    return result
  })

  on('turn.start', async ($, e, next) => {
    await syncSession($)
    const revision = conversationRevision
    const reading = await $.session.usage().catch(() => undefined)
    if (revision !== conversationRevision) return next(e)
    await update($, turnCostBase, () => (validCost(reading?.cost?.usd) ? reading.cost.usd : null))
    await update($, turnCost, () => null)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const revision = conversationRevision
    const result = await next(e)
    if (revision !== conversationRevision) return result
    await readActiveAgents($)
    settling = refreshSoon($, settling)
    if (e.agentId === undefined) {
      const ledger = await $.session.usage().catch(() => undefined)
      if (revision !== conversationRevision) return result
      await takeCost($, ledger?.cost?.usd)
      // Keep the baseline until the next turn/reset: the host can post the ledger after this hook.
    }
    return result
  })

  // Each request: on the main conversation, when it started, whether it touched the cache and the running
  // counts; on a subagent, its input history, cumulative usage and observed requested effort.
  on('turn.step', async function* ($, e, next) {
    const revision = conversationRevision
    // Cache age starts with the request, not after a potentially long streamed response.
    const started = await $.clock.now()
    const result = yield* next(e)
    if (revision !== conversationRevision) return result
    const u = result.usage
    if (!u) return result
    // A downstream model rewrite/fallback cannot establish the effort of the model that answered.
    const requestedEffort = baseModel(e.model) === baseModel(u.model) ? e.effort : undefined
    if (e.agentId === undefined) {
      const touched = (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
      const changed = await syncSession($)
      if (!changed && revision !== conversationRevision) return result
      await setModel($, u.model)
      await update($, effort, () => requestedEffort ?? null)
      const before = await read($, cache)
      const counts = (await read($, cacheStats)) ?? NO_CACHE_STATS
      const learned = learnedTtl(before, started, counts, u)
      if (learned !== undefined) await update($, cacheTtl, () => learned)
      await update($, cache, () => ({ at: started, warm: touched > 0 }))
      await update($, cacheStats, s => addStep(s ?? NO_CACHE_STATS, u, e.turnId))
      // Read the host's last context; step usage may sum several server-side responses.
      settling = refreshSoon($, settling)
    } else {
      const id = e.agentId
      await update($, agents, list => addAgentStep(list ?? [], id, u.model, u, requestedEffort))
    }
    await readActiveAgents($)
    return result
  })

  // Native events remain useful where the organization's guard skips classic.*.
  on('command.run', { command: ['clear', 'resume', 'branch', 'model', 'autocompact', 'theme'] }, async ($, e, next) => {
    const result = await next(e)
    if (e.command === 'theme') await readTheme($)
    settling = refreshSoon($, settling)
    return result
  })

  on('config.set', { key: ['theme', 'autoCompact'] }, async ($, e, next) => {
    const result = await next(e)
    // Read the host's effective settings after the decision, including a refusal or a rewritten value.
    await readTheme($)
    settling = refreshSoon($, settling)
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
    // `bodyColumns` counts cells of a monospace font; a proportional surface draws the band narrower than that, so
    // it keeps every group and wraps when the window really is narrow, rather than dropping the rightmost.
    const gs = e.surface === 'terminal' ? fit(band, e.props.bodyColumns - 2) : groups(band)
    if (gs.length === 0) return next(e)
    const els = $.ui.resolve(e)
    const palette = (await read($, theme)) ?? 'native'
    const below = await next(e)
    // Branch on the surface, not on the table: the terminal's table answers `'Svg' in` with a placeholder.
    const own = e.surface === 'terminal' ? bandTerminal($.ui.resolve(e), gs, palette) : bandRich($.ui.resolve(e), gs, palette)
    return <els.Box flexDirection="column">{own}{below}</els.Box>
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const band = await bandInput($, e.props.view.agentId)
    const lines = paneLines({
      ...band,
      timeline: await read($, timeline),
      compactions: await read($, compactions),
      cacheStats: await read($, cacheStats),
      sessionId: await read($, sessionId),
      effort: await read($, effort),
      agents: await read($, agents),
      breakdown: await read($, breakdown),
      viewing: e.props.view.agentId,
      limitsAt: await read($, limitsAt),
      turnCost: await read($, turnCost),
    })
    const palette = (await read($, theme)) ?? 'native'
    if (e.surface === 'terminal') return paneTerminal($.ui.resolve(e), lines, palette)
    return paneRich($.ui.resolve(e), lines, palette)
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
    cost: await read($, cost),
    turnCost: await read($, turnCost),
    activeAgents: await read($, activeAgents),
    rewrite: stats.rewrite?.tokens,
    model: m,
    view,
  }
}

// Start of session, a reload or the pane: the engine's figures, else the last live quota from the store.
async function load($: EngineInterface) {
  await syncSession($)
  const revision = conversationRevision
  const { context, rateLimits, cost: ledger } = await $.session.usage()
  if (revision !== conversationRevision) return
  await readModel($)
  if (revision !== conversationRevision) return
  await takeCost($, ledger?.usd)
  if (revision !== conversationRevision) return
  await take($, context, rateLimits, false, false, revision)
  if (revision !== conversationRevision) return
  if (pick(rateLimits).length === 0) {
    const saved = await $.store.get(STORE_LIMITS)
    if (revision !== conversationRevision) return
    if (Array.isArray(saved) && !(await read($, limitsLive))) {
      await update($, limits, () => saved as OverheadLimit[])
    }
  }
}

// `withdrawn`: an empty reading means the windows went away, not that there is no reading yet.
async function take($: EngineInterface, context: SessionContextUsage | undefined, rateLimits: SessionRateLimit[] | undefined, withdrawn: boolean, recordGrowth = true, revision = conversationRevision) {
  // Each reading's own breakdown, or none: one the engine refused this time is unknown, never the last one,
  // which may describe a conversation since compacted or another model.
  const b = await localBreakdown($)
  if (revision !== conversationRevision) return
  await update($, breakdown, () => (b ? slim(b) : null))
  if (context?.window) {
    const m = await read($, model)
    const nextContext: OverheadCtx = { tokens: context.tokens, window: context.window, percent: context.percent, ...(m && { model: m }) }
    // Where auto-compaction runs; without a breakdown this time, where it ran last time for the same model.
    const last = await read($, ctx)
    const kept = last?.model !== undefined && baseModel(last.model) === baseModel(m) ? last.compactAt : undefined
    const compactAt = b ? (b.isAutoCompactEnabled ? (b.autoCompactThreshold ?? undefined) : undefined) : kept
    if (compactAt) nextContext.compactAt = compactAt
    if (context.tokens !== undefined && context.tokens > 0 && recordGrowth) {
      const t = context.tokens
      const before = (await read($, timeline)).at(-1)
      await update($, history, samples => addSample(samples, t))
      await update($, timeline, samples => addSample(samples, t, TIMELINE))
      // A drop no compaction event announced (one this plugin did not see): treated as one. Its first request
      // has already run, so it stays the base the next one is compared with; only a rewrite mark goes.
      if (before !== undefined && t < before) {
        await update($, compactions, list => addCompaction(list ?? [], { before, after: t }))
        await update($, cacheStats, s => clearRewrite(s ?? NO_CACHE_STATS))
      }
    } else if (context.tokens === undefined || context.tokens <= 0) {
      // No response in this window yet (new, cleared or just compacted): /context's local estimate.
      nextContext.estimate = b?.totalTokens
    }
    await update($, ctx, () => nextContext)
  }
  if (revision !== conversationRevision) return
  await takeLimits($, rateLimits, withdrawn)
}

// Plain local refreshes also adopt quota changes, even when main context did not move.
async function takeLimits($: EngineInterface, rateLimits: SessionRateLimit[] | undefined, withdrawn: boolean) {
  const live = pick(rateLimits)
  if (live.length > 0 || withdrawn) {
    const before = JSON.stringify(await read($, limits))
    await update($, limits, () => live)
    await update($, limitsLive, () => true)
    // Only this session's own new reading is shared, so an idle session never overwrites a newer one.
    if (JSON.stringify(live) !== before) {
      const at = await $.clock.now()
      await update($, limitsAt, () => at)
      await $.store.set(STORE_LIMITS, live)
    }
  }
}

// The main loop's model; a host that cannot say leaves the weekly group on the all-models window.
async function readModel($: EngineInterface) {
  const revision = conversationRevision
  let id: string | null = null
  try {
    id = await $.session.model()
  } catch {
    // keep the all-models window
  }
  if (revision === conversationRevision && id !== null) await setModel($, id)
}

async function setModel($: EngineInterface, id: string) {
  const previous = await read($, model)
  if (previous && baseModel(previous) !== baseModel(id)) {
    await update($, effort, () => null)
    const at = await $.clock.now()
    await update($, cache, c => (c ? { at, warm: false } : c))
    await update($, cacheTtl, () => null)
    await update($, breakdown, () => null)
    await update($, ctx, () => null)
  }
  await update($, model, () => id)
}

async function takeCost($: EngineInterface, value: number | undefined) {
  const previous = await read($, cost)
  await update($, cost, () => (validCost(value) ? value : null))
  if (!validCost(value) || (previous !== null && value < previous)) {
    await update($, turnCost, () => null)
    if (validCost(value) && previous !== null && value < previous) await update($, turnCostBase, () => null)
    return
  }
  const base = await read($, turnCostBase)
  if (base !== null) await update($, turnCost, () => (value >= base ? value - base : null))
}

function themeOf(value: unknown): OverheadTheme {
  // The host reports the setting, not auto's resolved appearance; use the dark palette for auto.
  if (value === 'auto') return 'dark'
  return value === 'light' || value === 'dark' ? value : 'native'
}

// Settles the theme only from the host's own `theme` row. A failed list or a list without the row (the host not
// ready yet) leaves it unread, so `ensureTheme` tries again, rather than fixing the band on native colors.
async function readTheme($: EngineInterface) {
  const rows = await $.config.list().catch(() => undefined)
  const row = rows?.find(r => r.key === 'theme')
  if (row !== undefined) await update($, theme, () => themeOf(row.value))
}

// Reads the theme only while it is unread.
async function ensureTheme($: EngineInterface) {
  if ((await read($, theme)) === null) await readTheme($)
}

async function resetConversation($: EngineInterface) {
  conversationRevision++
  await update($, effort, () => null)
  await update($, ctx, () => null)
  await update($, breakdown, () => null)
  await update($, history, () => [])
  await update($, timeline, () => [])
  await update($, compactions, () => [])
  await update($, cache, () => null)
  await update($, cacheTtl, () => null)
  await update($, cacheStats, () => NO_CACHE_STATS)
  await update($, agents, () => [])
  await update($, cost, () => null)
  await update($, turnCostBase, () => null)
  await update($, turnCost, () => null)
  await update($, limitsAt, () => null)
  await update($, activeAgents, () => 0)
  await update($, limitsLive, () => false)
}

async function syncSession($: EngineInterface): Promise<boolean> {
  const revision = conversationRevision
  const id = await $.session.id().catch(() => null)
  if (revision !== conversationRevision || id === null) return false
  const previous = await read($, sessionId)
  await update($, sessionId, () => id)
  const changed = previous !== null && previous !== id
  if (changed) await resetConversation($)
  return changed
}

// A cheap local read on the existing countdown tick catches changes no event delivered.
async function poll($: EngineInterface) {
  const changed = await syncSession($)
  const revision = conversationRevision
  await readActiveAgents($)
  const beforeModel = await read($, model)
  await readModel($)
  const reading = await $.session.usage()
  if (revision !== conversationRevision) return
  await takeCost($, reading.cost?.usd)
  await takeLimits($, reading.rateLimits, await read($, limitsLive))
  if (revision !== conversationRevision) return
  const last = await read($, ctx)
  const nextContext = reading.context
  if (changed || beforeModel !== (await read($, model)) || !last || last.window !== nextContext.window || last.tokens !== nextContext.tokens || last.percent !== nextContext.percent) await load($)
}

async function readActiveAgents($: EngineInterface) {
  const revision = conversationRevision
  const list = await $.agent.list().catch(() => [])
  if (revision !== conversationRevision) return
  const count = list.filter(agent => agent.status === 'running').length
  if (count !== await read($, activeAgents)) await update($, activeAgents, () => count)
  // Reuse this one list read for the pane's identity labels, including delayed or updated descriptions.
  const before = await read($, agents)
  const changed = before.some(agent => {
    const info = list.find(a => a.id === agent.id)
    return info && (agent.label !== info.type || agent.description !== info.description)
  })
  if (changed) {
    // The update runs on the latest state so another agent's response is never lost while this read waits.
    await update($, agents, current => current.map(agent => {
      const info = list.find(a => a.id === agent.id)
      return info ? { ...agent, label: info.type, description: info.description } : agent
    }))
  }
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

// The context with no reading of its own yet, as after a compaction, until the next response reports one.
function withoutReading({ window, compactAt, model }: OverheadCtx): OverheadCtx {
  return { window, ...(compactAt !== undefined && { compactAt }), ...(model !== undefined && { model }) }
}

// A resumed or forked conversation, before its first request. That request re-sends what the transcript last
// sent, so a lapsed cache makes it a rewrite (`last`). The engine's age of the cache shows it warm or cold
// already, and an age between the two lifetimes tells which one the account gets.
async function resumed($: EngineInterface, e: { context_tokens?: number; seconds_since_last_response?: number; prompt_cache_likely_expired?: boolean }) {
  const { context_tokens: tokens, seconds_since_last_response: age, prompt_cache_likely_expired: expired } = e
  if (tokens !== undefined && tokens > 0) await update($, cacheStats, s => ({ ...s, last: tokens }))
  if (age === undefined || expired === undefined) return
  const at = (await $.clock.now()) - age * 1000
  await update($, cache, () => ({ at, warm: !expired }))
  if (age * 1000 > SHORT_TTL_MS && age * 1000 < CACHE_TTL_MS) await update($, cacheTtl, () => (expired ? SHORT_TTL_MS : CACHE_TTL_MS))
}

// Every window reported, so a model's own weekly window is at hand when the model switches. A reset time that
// does not parse is treated as none.
function pick(rateLimits: SessionRateLimit[] | undefined): OverheadLimit[] {
  return (rateLimits ?? []).map(({ kind, percentUsed, resetsAt }) => ({
    kind,
    percentUsed,
    ...(resetsAt !== undefined && !Number.isNaN(Date.parse(resetsAt)) && { resetsAt }),
  }))
}

// The host installs readings after the hook returns; one coalesced refresh reads its figures.
function refreshSoon($: EngineInterface, previous: Timer | undefined): Timer {
  previous?.cancel()
  return $.clock.after(100, async () => {
    await readActiveAgents($)
    await load($).catch(() => undefined)
  })
}
