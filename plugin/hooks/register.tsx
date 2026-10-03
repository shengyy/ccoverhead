// ccOverhead: the band above the Claude Code prompt. The context window and each turn's growth, the
// 5h/7d quota and prompt-cache warmth, on one safe-to-warning colour scale. Reads only what the engine
// reports: no files, no processes, no network, no model requests.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit, Timer } from 'claude-code'

import type { OverheadCache, OverheadCtx, OverheadLimit } from '../types'
import { SEP, addSample, colorOf, fit, items, sparkCells } from './format'

// Session-long values the host keeps across a reload of this module.
const ctx = atom({ plugin: 'ccoverhead', key: 'ctx' } as const, null as OverheadCtx | null)
const history = atom({ plugin: 'ccoverhead', key: 'history' } as const, [] as number[])
const limits = atom({ plugin: 'ccoverhead', key: 'limits' } as const, [] as OverheadLimit[])
const limitsLive = atom({ plugin: 'ccoverhead', key: 'limitsLive' } as const, false)
const cache = atom({ plugin: 'ccoverhead', key: 'cache' } as const, null as OverheadCache | null)

// Countdowns are whole minutes; redraw often enough that they never lag by more than half of one.
const TICK_MS = 30_000
// The last live quota windows, shared with new sessions until they get their own reading.
const STORE_LIMITS = 'limits'

export const register: Register = on => {
  let tick: Timer | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await load($)
    tick?.cancel()
    tick = $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
    return result
  })

  // /clear, /resume and /branch start another conversation with no new session.start: the old
  // one's growth history and cache timestamp no longer apply, the account's quota still does.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    const result = await next(e)
    await update($, history, () => [])
    await update($, cache, () => null)
    await load($)
    return result
  })

  // After each turn, and whenever a quota window moves a point.
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await take($, e.context, e.rateLimits)
    return result
  })

  // Each main-conversation request: when it finished and whether it read or wrote the cache.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId === undefined && result.usage) {
      const touched = (result.usage.cache_read_input_tokens ?? 0) + (result.usage.cache_creation_input_tokens ?? 0)
      const at = await $.clock.now()
      await update($, cache, () => ({ at, warm: touched > 0 }))
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const band = {
      now: await $.clock.now(),
      ctx: await read($, ctx),
      history: await read($, history),
      limits: await read($, limits),
      limitsLive: await read($, limitsLive),
      cache: await read($, cache),
    }
    const gs = fit(band, e.props.bodyColumns - 2)
    if (gs.length === 0) return next(e)

    // The surfaces with Svg draw in a proportional font: each group a row spaced by gap, the bar and the
    // sparkline as Svg. The terminal draws one line of text, the graphics as block glyphs, the sparkline's
    // one per bar in its tier's colour.
    if (e.surface !== 'terminal') {
      const { Box, Text, Svg } = $.ui.resolve(e)
      return (
        <Box flexDirection="row" alignItems="center" paddingX={1} gap={1}>
          {gs.flatMap((g, i) => [
            ...(i > 0 ? [<Text key={`sep-${i}`} dimColor>|</Text>] : []),
            <Box key={`group-${i}`} flexDirection="row" alignItems="center" gap={1}>
              {items(g).map((it, j) =>
                it.kind === 'graphic' ? (
                  <Svg key={`${i}-${j}`} {...it.graphic} />
                ) : (
                  <Text key={`${i}-${j}`} color={colorOf(it.span)} dimColor={it.span.dimColor}>
                    {it.span.text}
                  </Text>
                ),
              )}
            </Box>,
          ])}
        </Box>
      )
    }

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" paddingX={1}>
        <Text wrap="truncate-end">
          {gs.flatMap((g, i) => [
            ...(i > 0 ? [<Text key={`sep-${i}`} dimColor>{SEP}</Text>] : []),
            ...g.map((s, j) =>
              s.spark ? (
                <Text key={`${i}-${j}`}>
                  {sparkCells(s).map((c, k) => (
                    <Text key={String(k)} color={c.color}>
                      {c.text}
                    </Text>
                  ))}
                </Text>
              ) : (
                <Text key={`${i}-${j}`} color={colorOf(s)} dimColor={s.dimColor}>
                  {s.text}
                </Text>
              ),
            ),
          ])}
        </Text>
      </Box>
    )
  })
}

// Start of session or a reload: the engine's figures, else the last live quota from the store.
async function load($: EngineInterface) {
  const { context, rateLimits } = await $.session.usage()
  await take($, context, rateLimits)
  if (pick(rateLimits).length === 0) {
    const saved = await $.store.get(STORE_LIMITS)
    if (Array.isArray(saved) && !(await read($, limitsLive))) {
      await update($, limits, () => saved as OverheadLimit[])
    }
  }
}

async function take($: EngineInterface, context: SessionContextUsage | undefined, rateLimits: SessionRateLimit[] | undefined) {
  if (context?.window) {
    const next: OverheadCtx = { tokens: context.tokens, window: context.window, percent: context.percent }
    if (context.tokens !== undefined && context.tokens > 0) {
      const t = context.tokens
      await update($, history, h => addSample(h, t))
    } else {
      // No response in this window yet (new, cleared or just compacted): /context's local
      // estimate, which sends no request.
      next.estimate = await estimate($)
    }
    await update($, ctx, () => next)
  }
  const live = pick(rateLimits)
  if (live.length > 0) {
    const before = JSON.stringify(await read($, limits))
    await update($, limits, () => live)
    await update($, limitsLive, () => true)
    // Only this session's own new reading is shared, so an idle session never overwrites a newer one.
    if (JSON.stringify(live) !== before) await $.store.set(STORE_LIMITS, live)
  }
}

// A breakdown the engine cannot give (no session bound, a thin client) is no estimate, never a failed
// measure that would leave the band on the old figures.
async function estimate($: EngineInterface): Promise<number | undefined> {
  try {
    return (await $.session.usage({ breakdown: 'summary' })).context.breakdown?.totalTokens
  } catch {
    return undefined
  }
}

function pick(rateLimits: SessionRateLimit[] | undefined): OverheadLimit[] {
  return (rateLimits ?? [])
    .filter(l => l.kind === 'five_hour' || l.kind === 'seven_day')
    .map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
}
