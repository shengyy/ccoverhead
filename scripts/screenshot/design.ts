// Render bilingual design sheets from the plugin's formatter and the shared fictional screenshot data.
//   bun scripts/screenshot/design.ts
// Needs Google Chrome and ImageMagick, like render.ts. Staged HTML stays in a temporary folder.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { CACHE_TTL_MS, DEGRADE, HISTORY, cells, colorOf, fit, gainTier, groups, items, pctTier, svgOf, width, SEP } from '../../plugin/hooks/format'
import type { BandInput, Span } from '../../plugin/hooks/format'
import { band, rewriting } from './fixture'

const REPO = resolve(import.meta.dir, '../..')
const OUT = join(REPO, 'assets/screenshots')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const version = JSON.parse(readFileSync(join(REPO, 'plugin/.claude-plugin/plugin.json'), 'utf8')).version
const logo = 'data:image/svg+xml;base64,' + Buffer.from(readFileSync(join(REPO, 'assets/brand/logo.svg'), 'utf8')).toString('base64')
const inks = Array.from({ length: 10 }, (_, tier) => colorOf({ text: '', tier })!)
const lightInks = inks.map((_, tier) => [...svgOf({ text: '', tier, bar: 1 })!.source.matchAll(/\.k\{fill:(#[a-f0-9]{6})\}/g)][1]![1]!)
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
const plain = (value: Span[][]) => value.map(g => g.map(s => s.text).join('')).join(SEP)
const textSpan = (s: Span) => `<span style="color:${s.dimColor ? '#898781' : colorOf(s) ?? '#e8e6dc'}">${escape(s.text)}</span>`
function terminal(value: Span[][]) {
  return value.map(g => g.map(s => {
    const parts = cells(s)
    return parts ? parts.map(c => `<span style="color:${c.dimColor ? '#898781' : c.color}">${escape(c.text)}</span>`).join('') : textSpan(s)
  }).join('')).join('<span class="dim"> | </span>')
}
function desktop(value: Span[][]) {
  return value.map(g => `<span class="band-group">${items(g).map(it => it.kind === 'graphic'
    ? `<img src="data:image/svg+xml;base64,${Buffer.from(it.graphic.source).toString('base64')}" width="${it.graphic.width}" height="${it.graphic.height}" alt="${escape(it.graphic.alt)}">`
    : textSpan(it.span)).join('')}</span>`).join('<span class="dim separator">|</span>')
}
function groupByLabel(input: BandInput, label: string) {
  return groups(input, DEGRADE[0]!).filter(g => g[0]?.text === label)
}
const full = fit(band, 110)
const featureDescriptions = [
  ['上下文容量', '进度条 / 已用比例 / token 数', '容量来自最后一次回复的实际读数。', 'ctx'],
  ['每轮增长', '最近 7 次变化 / 最新增量', '柱高相对比较，颜色按窗口占比。', 'growth'],
  ['缓存冷热', 'warm / cold / 剩余分钟', '仅跟踪主对话请求的缓存读写。', 'cache'],
  ['使用额度', '5 小时 / 每周 / 重置倒计时', '显示已用比例，额度读数来自宿主。', 'quota'],
]
const steps = ['完整信息', '隐藏增长图与 ↑', '再隐藏缓存改写', '再隐藏缓存', '再隐藏 token 数', '再隐藏每周倒计时', '再隐藏 5 小时倒计时']
// A turn that rewrote the cache, so the narrowing table shows that step too.
const responsive = DEGRADE.map((detail, i) => {
  const gs = groups(rewriting, detail)
  return `<div class="responsive-row"><span class="step-no">${String(i + 1).padStart(2, '0')}</span><span class="step-label">${steps[i]}</span><code class="demo-band">${terminal(gs)}</code><span class="cell-count">${width(gs)} cells</span></div>`
}).join('')
const estimate: BandInput = { ...band, ctx: { window: band.ctx!.window, estimate: band.ctx!.tokens }, history: [] }
const placeholder: BandInput = { ...band, ctx: { window: band.ctx!.window }, history: [] }
const remembered: BandInput = { ...band, limitsLive: false }
const expiredCache: BandInput = { ...band, now: band.cache!.at + CACHE_TTL_MS }
const percentageLabels = inks.map((_, tier) => {
  const values = Array.from({ length: 101 }, (_, i) => i).filter(p => pctTier(p) === tier)
  if (values.length === 0) return '—'
  return values.at(-1) === 100 ? `≥ ${values[0]}%` : `${values[0]}–${values.at(-1)}%`
})
// Find tier boundaries through gainTier rather than keeping another copy of its thresholds.
const growthThresholds = inks.map((_, tier) => {
  let lo = 0, hi = band.ctx!.window
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (gainTier(mid, band.ctx!.window) >= tier) hi = mid
    else lo = mid + 1
  }
  return (lo * 100) / band.ctx!.window
})
const growthLabels = growthThresholds.map((p, i) => i === 0 ? `< ${growthThresholds[1]}%` : i === inks.length - 1 ? `≥ ${p}%` : `${p}–${growthThresholds[i + 1]}%`)
const scale = inks.map((ink, i) => `<div class="scale-step"><span class="swatch" style="background:${ink}"></span><span class="tier-label">Tier ${i}</span><code>${ink}</code><span class="threshold">${percentageLabels[i]}</span><span class="threshold growth-threshold">${growthLabels[i]}</span></div>`).join('')
const lightScale = lightInks.map((ink, i) => `<div class="scale-step"><span class="light-swatch"><i style="background:${ink}"></i></span><code>${ink}</code></div>`).join('')
const stamp = `<span>ccOverhead · Design reference</span><span>v${escape(version)} · Fictional demo · Dark theme</span>`

const css = `
  :root { color-scheme: dark; --paper:#141413; --ink:#e8e6dc; --sub:#aaa79e; --dim:#898781; --line:#393936; --well:#1b1b19; --sky:${inks[2]}; --teal:${inks[4]}; --yellow:${inks[6]}; }
  * { box-sizing:border-box; }
  body { margin:0; background:#090a09; color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif; }
  .toolbar { position:sticky; top:0; z-index:10; display:flex; align-items:center; justify-content:center; gap:10px; padding:18px; background:#141413; border-bottom:1px solid var(--line); }
  .toolbar a { color:var(--ink); text-decoration:none; padding:10px 18px; border:1px solid #45453f; border-radius:8px; font-size:14px; }
  .viewport { width:1600px; margin:26px auto; }
  .sheet { position:relative; width:1600px; min-height:1300px; background:var(--paper); padding:52px 68px 28px; overflow:hidden; }
  .sheet+.sheet { margin-top:30px; }
  header { display:flex; justify-content:space-between; align-items:center; padding-bottom:27px; border-bottom:1px solid var(--line); }
  .brand { display:flex; align-items:center; gap:20px; }
  .brand img { width:64px; height:64px; }
  .brand-name { font-size:34px; font-weight:600; letter-spacing:-1px; }
  .brand-note { color:var(--sub); font-size:14px; margin-top:6px; letter-spacing:.2px; }
  .folio { text-align:right; }
  .folio span { display:block; font-family:Menlo,monospace; font-size:12px; color:var(--sub); letter-spacing:2px; margin-bottom:9px; }
  .folio strong { font-size:29px; font-weight:500; }
  .section-heading { display:flex; align-items:center; gap:14px; margin:30px 0 16px; }
  .section-heading .index { color:var(--sky); font-family:Menlo,monospace; font-size:13px; }
  .section-heading h2 { margin:0; font-size:22px; font-weight:500; letter-spacing:.2px; }
  .section-heading .aside { margin-left:auto; color:var(--sub); font-size:13px; }
  .desktop-demo { padding:27px 36px 23px; border:1px solid #333330; border-radius:18px; background:#191918; }
  .surface-label { display:flex; justify-content:space-between; color:var(--sub); font-size:12px; font-family:Menlo,monospace; letter-spacing:1.1px; margin-bottom:20px; }
  .desktop-band { padding:22px 28px; background:#212121; border-radius:18px; }
  .desktop-band .band-row { display:flex; align-items:center; justify-content:flex-start; gap:9px; font-size:15px; white-space:nowrap; width:max-content; zoom:1.58; }
  .band-group { display:flex; align-items:center; gap:7px; }
  .band-group img { display:block; }
  .dim { color:var(--dim); }
  .input-line { margin-top:13px; border:1px solid #41413b; border-radius:16px; padding:19px 26px; color:#8b8a85; font-size:20px; display:flex; justify-content:space-between; }
  .surface-caption { display:flex; align-items:center; gap:20px; margin-top:14px; font-size:13px; color:var(--sub); }
  .surface-caption b { color:var(--teal); font-weight:500; }
  .feature-grid { display:grid; grid-template-columns:repeat(4,1fr); margin:26px 0 0; }
  .feature { padding:0 22px; border-left:1px solid var(--line); }
  .feature:first-child { padding-left:0; border-left:0; }
  .feature .feature-top { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
  .feature .dot { width:5px; height:5px; background:var(--sky); border-radius:50%; }
  .feature h3 { font-size:18px; font-weight:500; margin:0; }
  .feature .detail { font-size:14px; line-height:1.7; color:var(--sub); }
  .feature .rule { font-size:13px; line-height:1.65; color:var(--sub); margin-top:5px; }
  .terminal-demo { margin-top:24px; padding:21px 30px 17px; background:#262624; border-radius:12px; }
  .terminal-demo .surface-label { margin-bottom:13px; }
  .terminal-line { font-family:Menlo,"SF Mono",monospace; font-size:19px; white-space:pre; }
  .terminal-prompt { margin-top:17px; padding:11px 18px; border:1px solid #4a4640; border-radius:6px; }
  .terminal-prompt .cursor { display:inline-block; width:10px; height:20px; margin-left:15px; vertical-align:-3px; background:#d97757; }
  .responsive-table { border-top:1px solid var(--line); }
  .responsive-row { display:grid; grid-template-columns:32px 185px 1fr 80px; gap:13px; align-items:center; min-height:43px; border-bottom:1px solid #2c2c29; }
  .step-no { color:var(--dim); font:12px Menlo,monospace; }
  .step-label { font-size:14px; color:var(--sub); }
  .demo-band { font:14px Menlo,monospace; white-space:pre; }
  .cell-count { color:var(--dim); text-align:right; font:12px Menlo,monospace; }
  .small-note { color:var(--sub); font-size:13px; line-height:1.65; margin:12px 0 0; }
  .scale { display:grid; grid-template-columns:repeat(10,1fr); gap:9px; }
  .scale-step { text-align:center; }
  .swatch { display:block; height:24px; border-radius:5px; margin-bottom:9px; }
  .tier-label { font:12px Menlo,monospace; color:var(--sub); display:block; margin-bottom:4px; }
  .scale-step code { font:12px Menlo,monospace; color:var(--sub); }
  .scale-meanings { display:grid; grid-template-columns:5fr 2fr 3fr; gap:9px; margin-top:16px; }
  .scale-meanings span { text-align:center; border-top:1px solid #45453f; padding-top:8px; color:var(--sub); font-size:13px; }
  .mapping { display:grid; grid-template-columns:1fr 1fr; gap:28px; margin-top:17px; }
  .mapping p { font-size:13px; color:var(--sub); margin:0; line-height:1.7; }
  .mapping b { font-weight:500; color:var(--ink); }
  footer { display:flex; justify-content:space-between; border-top:1px solid var(--line); padding-top:17px; margin-top:25px; color:var(--dim); font-size:11px; letter-spacing:.4px; }
  .state-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
  .state { padding:21px 22px; background:var(--well); border-radius:12px; }
  .state h3 { font-size:17px; font-weight:500; margin:0 0 14px; }
  .state code { display:block; font:17px Menlo,monospace; line-height:1.7; }
  .state .context-code { font-size:15px; white-space:nowrap; }
  .state .state-pair { display:flex; align-items:center; gap:15px; margin-bottom:12px; }
  .state .state-tag { color:var(--sub); font-size:12px; min-width:52px; }
  .state p { margin:9px 0 0; font-size:13px; color:var(--sub); line-height:1.6; }
  .quota-state { grid-column:1 / 3; }
  .lifecycle { width:100%; border-collapse:collapse; }
  .lifecycle th { padding:11px 16px; color:var(--sub); font-size:13px; font-weight:400; text-align:left; border-bottom:1px solid var(--line); }
  .lifecycle td { padding:15px 16px; font-size:14px; line-height:1.6; border-bottom:1px solid #2c2c29; vertical-align:top; }
  .lifecycle td:first-child { width:265px; }
  .lifecycle td:nth-child(2) { width:290px; color:var(--sub); }
  code { font-family:Menlo,monospace; }
  .lifecycle code { font-size:12px; color:var(--sub); }
  .flow { padding:24px 26px; background:var(--well); border-radius:13px; }
  .flow-main { display:grid; grid-template-columns:1fr 65px 1fr 65px 1fr; align-items:center; }
  .flow-node h3 { font-size:17px; font-weight:500; margin:0 0 10px; }
  .flow-node p { color:var(--sub); font-size:13px; line-height:1.7; margin:0; }
  .flow-arrow { color:#706f68; font-size:29px; text-align:center; }
  .flow-node .mono { color:var(--sky); font:13px Menlo,monospace; }
  .flow-detail { margin-top:20px; padding-top:18px; border-top:1px solid #3a3a34; display:flex; gap:28px; font-size:13px; color:var(--sub); }
  .flow-detail code { color:var(--teal); font-size:12px; }
  .boundary { display:grid; grid-template-columns:1.15fr 1fr; gap:30px; padding-top:4px; }
  .boundary p { font-size:14px; line-height:1.75; margin:0; color:var(--sub); }
  .boundary strong { color:var(--ink); font-weight:500; }
  .source-links { display:flex; gap:20px; margin-top:14px; }
  .source-links a { color:var(--sub); font:11px Menlo,monospace; text-decoration:none; }
  .review-only { color:#c2b689; }
  .palette-label { display:flex; justify-content:space-between; color:var(--sub); font-size:12px; margin:0 0 11px; }
  .threshold { display:block; color:var(--ink); font:12px Menlo,monospace; margin-top:12px; }
  .growth-threshold { color:var(--sub); margin-top:8px; }
  .light-palette { margin-top:20px; }
  .light-swatch { display:flex; align-items:center; justify-content:center; background:#eeece5; height:25px; border-radius:5px; margin-bottom:8px; }
  .light-swatch i { display:block; height:6px; width:65%; border-radius:3px; }
  body.export .toolbar { display:none; }
  body.export .viewport { margin:0; }
  body.export .sheet { margin:0; }
  body.export[data-sheet="layout"] #states { display:none; }
  body.export[data-sheet="states"] #layout { display:none; }
  @media(max-width:1599px) { body:not(.export) .viewport { transform-origin:top left; margin-left:0; } }
`

const layout = `
<section id="layout" class="sheet">
  <header><div class="brand"><img src="${logo}" alt="ccOverhead logo"><div><div class="brand-name">ccOverhead</div><div class="brand-note">Context · Growth · Quota · Cache</div></div></div><div class="folio"><span>01 / LAYOUT & COLOR</span><strong>横条布局与视觉规则</strong></div></header>
  <div class="section-heading"><span class="index">01</span><h2>信息放在输入框上方，从变化快的读到变化慢的</h2><span class="aside">所有百分比均为已用比例</span></div>
  <div class="desktop-demo">
    <div class="surface-label"><span>CLAUDE DESKTOP · CODE TAB</span><span>比例字体 · Svg 图形 · gap 间距</span></div>
    <div class="desktop-band"><div class="band-row">${desktop(full)}</div></div>
    <div class="input-line"><span>Type / for commands</span><span>↵</span></div>
    <div class="surface-caption"><b>↑ AbovePrompt</b><span>主上下文与增长 → 缓存 → 5 小时额度 → 每周额度</span><span>有调查问卷时，让出横条。</span></div>
  </div>
  <div class="feature-grid">${featureDescriptions.map((d, i) => `<div class="feature"><div class="feature-top"><span class="dot" style="background:${i < 2 ? inks[2] : i === 2 ? inks[4] : inks[6]}"></span><h3>${d[0]}</h3></div><div class="detail">${d[1]}</div><div class="rule">${d[2]}</div></div>`).join('')}</div>
  <div class="terminal-demo"><div class="surface-label"><span>TERMINAL</span><span>等宽字体 · 字符进度条 · 字符增长图</span></div><div class="terminal-line">${terminal(full)}</div><div class="terminal-prompt"><span>&gt;</span><span class="cursor"></span></div></div>
  <div class="section-heading"><span class="index">02</span><h2>空间不足时，按顺序删细节</h2><span class="aside">cell 数为横条内容宽度，不是窗口断点</span></div>
  <div class="responsive-table">${responsive}</div>
  <p class="small-note">宽度预算取 bodyColumns − 2，左右各留 1 cell。最后一档仍放不下时，终端截断尾部。优先留下上下文；桌面端每组用 Box 的 gap 分隔。</p>
  <div class="section-heading"><span class="index">03</span><h2>一套十档色阶，始终从安全走向警告</h2><span class="aside">标签保持普通文字，数值承担状态</span></div>
  <div class="palette-label"><span>深色主题 · Text 与 Svg</span><span>每列依次：颜色 / 上下文与额度已用比例 / 单次增长占窗口比例</span></div>
  <div class="scale">${scale}</div><div class="scale-meanings"><span>安全 · 冷色</span><span>注意 · 黄绿到黄</span><span>警告 · 暖色到红</span></div>
  <div class="light-palette"><div class="palette-label"><span>浅色主题 · 仅 Svg 自动切换</span><span>Text 仍用深色列；浅色主题尚未实测</span></div><div class="scale">${lightScale}</div></div>
  <div class="mapping"><p><b>图形尺寸</b>　桌面进度条 60 × 6 px；增长柱宽 4 px，柱间距 2 px，柱高 3–14 px。终端进度条为 10 格，按最接近的 10% 绘制。</p><p><b>增长与缓存</b>　保留 ${HISTORY} 个不同总量，形成最多 ${HISTORY - 1} 根柱。柱高相对比较，颜色按绝对占比；warm 与剩余分钟同色，按缓存寿命已过的比例取色，cold 为暗色。</p></div>
  <footer>${stamp}</footer>
</section>`

const states = `
<section id="states" class="sheet">
  <header><div class="brand"><img src="${logo}" alt="ccOverhead logo"><div><div class="brand-name">ccOverhead</div><div class="brand-note">Observe → State → Render</div></div></div><div class="folio"><span>02 / STATES & DATA</span><strong>状态规则与数据边界</strong></div></header>
  <div class="section-heading"><span class="index">01</span><h2>读数的可信程度，直接体现在画面里</h2><span class="aside">以下示例沿用同一份虚构数据</span></div>
  <div class="state-grid">
    <div class="state"><h3>回复后的实际读数</h3><code class="context-code">${terminal(groupByLabel(band, 'ctx'))}</code><p>容量、已用比例、token 数有实际读数；增长历史只在总量变化时增加。</p></div>
    <div class="state"><h3>首个回复前的本地估算</h3><code class="context-code">${terminal(groupByLabel(estimate, 'ctx'))}</code><p>使用宿主 /context 估算，带 ~；进度条和数值变暗，不发送模型请求。</p></div>
    <div class="state"><h3>没有估算值</h3><code class="context-code">${terminal(groupByLabel(placeholder, 'ctx'))}</code><p>保留窗口大小，用 -- 占位；不沿用上个窗口的数字。</p></div>
    <div class="state quota-state"><h3>额度：本会话读数 / 跨会话记忆</h3><div class="state-pair"><span class="state-tag">当前</span><code>${terminal(groups(band, DEGRADE[0]!).filter(g => ['5h', '7d'].includes(g[0]!.text)))}</code></div><div class="state-pair"><span class="state-tag">记忆</span><code>${terminal(groups(remembered, DEGRADE[0]!).filter(g => ['5h', '7d'].includes(g[0]!.text)))}</code></div><p>新会话拿到自己的读数前，显示最近一次额度，数值与倒计时变暗。重置时间已过的窗口直接隐藏。</p></div>
    <div class="state"><h3>缓存：warm → cold</h3><div class="state-pair"><code>${terminal(groupByLabel(band, 'cache'))}</code><span class="state-tag">→</span><code>${terminal(groupByLabel(expiredCache, 'cache'))}</code></div><p>主对话读 / 写缓存后变热，颜色随寿命流逝由冷转暖；未触及、到期或切换模型变冷，没有读数时隐藏。寿命默认 ${CACHE_TTL_MS / 3_600_000} 小时（Claude Pro 实测），切换模型或恢复会话时取宿主给出的寿命。</p></div>
  </div>
  <div class="section-heading"><span class="index">02</span><h2>会话变化时，重置该重置的状态</h2></div>
  <table class="lifecycle"><thead><tr><th>触发</th><th>状态变化</th><th>画面规则</th></tr></thead><tbody>
    <tr><td>新会话 / 模块重载<br><code>session.start</code></td><td>加载宿主读数、主模型与额度记忆</td><td>有数字才绘制；首个回复前显示本地估算或窗口占位。</td></tr>
    <tr><td>新对话<br><code>/clear · /resume · /branch</code></td><td>清空增长历史与缓存时间，再加载读数</td><td>新的对话不带入旧增长或旧缓存状态；账户额度仍可沿用。</td></tr>
    <tr><td>压缩<br><code>session.compact</code>（漏见时按总量下降补认）</td><td>增长历史重新开始，旧分类作废</td><td>不足两条总量时不显示增长图；缺回复读数时重新取本地估算。</td></tr>
    <tr><td>主模型切换<br><code>classic.PostModelSwitch</code></td><td>更新主模型，用它选择周窗口；缓存变冷</td><td>宿主提供该模型周额度才显示；否则使用全模型周额度。此分支尚未实测。</td></tr>
  </tbody></table>
  <div class="section-heading"><span class="index">03</span><h2>事件写状态，绘制只读取</h2><span class="aside">每个事实只有一个来源</span></div>
  <div class="flow"><div class="flow-main">
    <div class="flow-node"><h3>Claude Code 已上报</h3><p><span class="mono">$.session.usage() · $.session.model()</span><br>上下文、额度与主模型<br><span class="mono">session.measure · turn.step</span> 事件读数</p></div>
    <div class="flow-arrow">→</div><div class="flow-node"><h3>每会话 $.state</h3><p>ctx · history · timeline · limits · limitsLive<br>cache · cacheStats · cacheTtl · model · agents · breakdown<br>事件更新状态，触发横条与面板重绘</p></div>
    <div class="flow-arrow">→</div><div class="flow-node"><h3>ui.render · AbovePrompt</h3><p>只读状态 → fit → 分组与颜色<br>terminal：Text / 字符图形<br>desktop：Box / Text / Svg</p></div>
  </div><div class="flow-detail"><span><code>$.store · limits</code>　跨会话只保存最近一次额度，且只在本会话读数变化时写入。</span><span><code>$.clock · 30 s</code>　定时刷新倒计时，绘制过程不写状态。</span></div></div>
  <div class="section-heading"><span class="index">04</span><h2>展示与验证边界</h2></div>
  <div class="boundary"><p><strong>只显示数字，决策留给用户。</strong><br>不读写用户文件、不起进程、不联网、不发模型请求、不收集遥测。<br>额度只在宿主上报时显示；API key 会话可能只有上下文与缓存。</p><p><strong>能力描述与实测分开。</strong><br>横条用于 terminal 与 desktop Code；/ccoverhead 面板在各界面都可打开。<br><span class="review-only">浅色主题、其他套餐、按模型周额度、网关花费额度、VS Code 与 mobile 上的面板未实测；当前色阶与顺序仅经测试及渲染核对。</span></p></div>
  <div class="source-links"><a href="https://github.com/shengyy/ccoverhead/blob/main/PRODUCT.md">PRODUCT.md</a><a href="https://github.com/shengyy/ccoverhead/blob/main/docs/design.md">docs/design.md</a><a href="https://github.com/shengyy/ccoverhead/blob/main/docs/status.md">docs/status.md</a><a href="https://github.com/shengyy/ccoverhead/blob/main/docs/architecture.md">docs/architecture.md</a></div>
  <footer>${stamp}</footer>
</section>`

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ccOverhead · 详细设计图</title><style>${css}</style></head><body><nav class="toolbar"><a href="#layout">布局与色阶</a><a href="#states">状态与数据边界</a></nav><main class="viewport">${layout}${states}</main><script>
  const sheet = new URLSearchParams(location.search).get('sheet');
  if (sheet) { document.body.classList.add('export'); document.body.dataset.sheet = sheet; }
  function size() { if (sheet) return; const root = document.querySelector('.viewport'); const ratio = Math.min(innerWidth / 1600, 1); root.style.zoom = ratio; root.style.margin = ratio < 1 ? '26px 0' : '26px auto'; }
  size(); addEventListener('resize', size);
</script></body></html>`
if (/\/Users\/|file:\/\/|CLAUDE_API_KEY/.test(html)) throw new Error('Private path or credential marker in exported diagram')

// One layout, localized copy. A missing English translation stops the render below.
const english: Record<string, string> = {
  '详细设计图': 'Design rationale',
  '布局与色阶': 'Layout and color',
  '状态与数据边界': 'States and data boundaries',
  '横条布局与视觉规则': 'Band layout and visual rules',
  '信息放在输入框上方，从变化快的读到变化慢的': 'Above the prompt. Fast signals first.',
  '所有百分比均为已用比例': 'All percentages show usage',
  '比例字体 · Svg 图形 · gap 间距': 'Proportional font · Svg graphics · gap spacing',
  '主上下文与增长 → 缓存 → 5 小时额度 → 每周额度': 'Context & growth → cache → 5-hour quota → weekly quota',
  '有调查问卷时，让出横条。': 'Yield the band to a survey.',
  '上下文容量': 'Context window',
  '进度条 / 已用比例 / token 数': 'Bar / used percentage / tokens',
  '容量来自最后一次回复的实际读数。': 'Figures from the last response.',
  '每轮增长': 'Per-turn growth',
  '最近 7 次变化 / 最新增量': 'Last 7 changes / latest delta',
  '柱高相对比较，颜色按窗口占比。': 'Height is relative; color uses window share.',
  '使用额度': 'Usage quota',
  '5 小时 / 每周 / 重置倒计时': '5-hour / weekly / reset countdowns',
  '显示已用比例，额度读数来自宿主。': 'Used percentages reported by the host.',
  '缓存冷热': 'Cache warmth',
  'warm / cold / 剩余分钟': 'warm / cold / minutes left',
  '仅跟踪主对话请求的缓存读写。': 'Main-conversation cache reads and writes.',
  '等宽字体 · 字符进度条 · 字符增长图': 'Monospace · glyph bar · glyph growth chart',
  '空间不足时，按顺序删细节': 'When space runs out, shed details in order',
  'cell 数为横条内容宽度，不是窗口断点': 'Cells measure content, not viewport breakpoints',
  '完整信息': 'Full detail',
  '隐藏增长图与 ↑': 'Hide growth and ↑',
  '再隐藏缓存改写': 'Then hide cache rewrite',
  '再隐藏缓存': 'Then hide cache',
  '再隐藏 token 数': 'Then hide tokens',
  '再隐藏每周倒计时': 'Then weekly reset',
  '再隐藏 5 小时倒计时': 'Then 5-hour reset',
  '宽度预算取 bodyColumns − 2，左右各留 1 cell。最后一档仍放不下时，终端截断尾部。优先留下上下文；桌面端每组用 Box 的 gap 分隔。': 'Width budget: bodyColumns − 2, with 1 cell on each side. If the last stage still does not fit, the terminal truncates the end. Context stays longest; desktop groups use Box gap spacing.',
  '一套十档色阶，始终从安全走向警告': 'One ten-tier scale, from safe to warning',
  '标签保持普通文字，数值承担状态': 'Plain labels; figures carry the state',
  '深色主题 · Text 与 Svg': 'Dark theme · Text and Svg',
  '每列依次：颜色 / 上下文与额度已用比例 / 单次增长占窗口比例': 'Each column: color / context and quota used / growth as a share of the window',
  '安全 · 冷色': 'Safe · cool',
  '注意 · 黄绿到黄': 'Caution · lime to yellow',
  '警告 · 暖色到红': 'Warning · warm to red',
  '浅色主题 · 仅 Svg 自动切换': 'Light theme · Svg switches automatically',
  'Text 仍用深色列；浅色主题尚未实测': 'Text keeps dark colors; light themes are not verified',
  '图形尺寸': 'Graphic dimensions',
  '桌面进度条 60 × 6 px；增长柱宽 4 px，柱间距 2 px，柱高 3–14 px。终端进度条为 10 格，按最接近的 10% 绘制。': 'Desktop bar: 60 × 6 px. Growth columns: 4 px wide, 2 px apart, 3–14 px tall. The terminal bar has 10 cells, rounded to the nearest 10%.',
  '增长与缓存': 'Growth and cache',
  [`保留 ${HISTORY} 个不同总量，形成最多 ${HISTORY - 1} 根柱。柱高相对比较，颜色按绝对占比；warm 与剩余分钟同色，按缓存寿命已过的比例取色，cold 为暗色。`]: `Keep ${HISTORY} changed totals for up to ${HISTORY - 1} bars. Heights compare recent gains; colors use absolute window share. Warm and its minutes share one colour, the tier of the lifetime gone; cold is dim.`,
  '状态规则与数据边界': 'State rules and data boundaries',
  '读数的可信程度，直接体现在画面里': 'Reading confidence is visible in the band',
  '以下示例沿用同一份虚构数据': 'Examples share the same fictional figures',
  '回复后的实际读数': 'After a response',
  '容量、已用比例、token 数有实际读数；增长历史只在总量变化时增加。': 'Actual window size, used percentage and tokens. Add a history sample only when the total changes.',
  '首个回复前的本地估算': 'Before the first response',
  '使用宿主 /context 估算，带 ~；进度条和数值变暗，不发送模型请求。': 'Local /context estimate, marked ~. The bar and figures are dim; no model request.',
  '没有估算值': 'No estimate available',
  '保留窗口大小，用 -- 占位；不沿用上个窗口的数字。': 'Keep the window size with -- as a placeholder. Never reuse the previous window’s figure.',
  '额度：本会话读数 / 跨会话记忆': 'Quota: current reading / saved reading',
  '当前': 'Current',
  '记忆': 'Saved',
  '新会话拿到自己的读数前，显示最近一次额度，数值与倒计时变暗。重置时间已过的窗口直接隐藏。': 'Show the last quota reading until this session gets its own; figures and countdowns are dim. Hide any window whose reset time has passed.',
  '缓存：warm → cold': 'Cache: warm → cold',
  [`主对话读 / 写缓存后变热，颜色随寿命流逝由冷转暖；未触及、到期或切换模型变冷，没有读数时隐藏。寿命默认 ${CACHE_TTL_MS / 3_600_000} 小时（Claude Pro 实测），切换模型或恢复会话时取宿主给出的寿命。`]: `A main-conversation cache read/write makes it warm, its color warming as the lifetime drains. No touch, expiry or a model switch makes it cold; no reading hides it. Lifetime: ${CACHE_TTL_MS / 3_600_000} hour by default (verified on Claude Pro), or what a model switch or a resume reports.`,
  '会话变化时，重置该重置的状态': 'Conversation changes reset the relevant state',
  '触发': 'Trigger',
  '状态变化': 'State change',
  '画面规则': 'Display rule',
  '新会话 / 模块重载': 'New session / module reload',
  '加载宿主读数、主模型与额度记忆': 'Load host figures, main model and saved quota',
  '有数字才绘制；首个回复前显示本地估算或窗口占位。': 'Draw only when a figure exists. Before the first response, show a local estimate or window placeholder.',
  '新对话': 'New conversation',
  '清空增长历史与缓存时间，再加载读数': 'Clear growth history and cache time, then reload',
  '新的对话不带入旧增长或旧缓存状态；账户额度仍可沿用。': 'Do not carry over old growth or cache state. Account quota may still be reused.',
  '压缩': 'Compaction',
  '（漏见时按总量下降补认）': '(or a drop in the total, if unseen)',
  '增长历史重新开始，旧分类作废': 'Restart growth history; the old breakdown goes',
  '不足两条总量时不显示增长图；缺回复读数时重新取本地估算。': 'Hide growth with fewer than two totals. Without a response reading, get a fresh local estimate.',
  '主模型切换': 'Main model switches',
  '更新主模型，用它选择周窗口；缓存变冷': 'Update the main model and select its weekly window; the cache turns cold',
  '宿主提供该模型周额度才显示；否则使用全模型周额度。此分支尚未实测。': 'Use a model’s own weekly quota only if the host reports it; otherwise use the all-models week. Not verified live.',
  '事件写状态，绘制只读取': 'Events write state; rendering only reads',
  '每个事实只有一个来源': 'One source for each fact',
  'Claude Code 已上报': 'Reported by Claude Code',
  '上下文、额度与主模型': 'Context, quota and main model',
  '事件读数': 'event figures',
  '每会话 $.state': 'Per-session $.state',
  '事件更新状态，触发横条与面板重绘': 'Events update state and redraw the band and pane',
  '只读状态 → fit → 分组与颜色': 'Read state → fit → groups and colors',
  'terminal：Text / 字符图形': 'terminal: Text / glyph graphics',
  'desktop：Box / Text / Svg': 'desktop: Box / Text / Svg',
  '跨会话只保存最近一次额度，且只在本会话读数变化时写入。': 'Save only the last quota across sessions, when this session’s own reading changes.',
  '定时刷新倒计时，绘制过程不写状态。': 'Refresh countdowns; rendering writes no state.',
  '展示与验证边界': 'Display and verification boundaries',
  '只显示数字，决策留给用户。': 'Figures inform; actions stay with you.',
  '不读写用户文件、不起进程、不联网、不发模型请求、不收集遥测。': 'No user files, processes, network, model requests or telemetry.',
  '额度只在宿主上报时显示；API key 会话可能只有上下文与缓存。': 'Quota appears only when reported; API-key sessions may show just context and cache.',
  '能力描述与实测分开。': 'Separate behavior from live verification.',
  '横条用于 terminal 与 desktop Code；/ccoverhead 面板在各界面都可打开。': 'The band is drawn in terminal and desktop Code; the /ccoverhead pane opens on every surface.',
  '浅色主题、其他套餐、按模型周额度、网关花费额度、VS Code 与 mobile 上的面板未实测；当前色阶与顺序仅经测试及渲染核对。': 'Light themes, other plans, model-specific weekly quota, gateway spend limits and the pane on VS Code and mobile are unverified. Current colors and order have test/render coverage only.',
}
let englishHtml = html.replace('lang="zh-CN"', 'lang="en"')
for (const [from, to] of Object.entries(english).sort((a, b) => b[0].length - a[0].length)) {
  englishHtml = englishHtml.replaceAll(from, escape(to))
}
const untranslated = englishHtml.match(/[\p{Script=Han}]+/gu)
if (untranslated) throw new Error(`Missing English copy: ${untranslated.join(', ')}`)

const dir = mkdtempSync(join(tmpdir(), 'ccoverhead-design-'))
const pages = { en: englishHtml, 'zh-cn': html }
const auditScript = `<script>
  addEventListener('load', async () => {
    await document.fonts.ready;
    const sheet = [...document.querySelectorAll('.sheet')].find(el => getComputedStyle(el).display !== 'none');
    const overflow = [];
    for (const parent of sheet.querySelectorAll('.state, .desktop-band, .responsive-row, .flow-node, .section-heading, .surface-caption, .mapping')) {
      const p = parent.getBoundingClientRect();
      for (const child of parent.children) {
        const c = child.getBoundingClientRect();
        if (c.right > p.right + 1 || c.left < p.left - 1) overflow.push({ parent: parent.className, text: child.innerText.slice(0, 90) });
      }
    }
    const result = { height: Math.ceil(sheet.getBoundingClientRect().height), width: document.documentElement.scrollWidth, overflow };
    const pre = document.createElement('pre'); pre.id = 'render-audit'; pre.textContent = JSON.stringify(result); document.body.appendChild(pre);
  });
</script>`
function chrome(args: string[]) {
  const result = Bun.spawnSync([CHROME, '--headless=new', '--hide-scrollbars', '--virtual-time-budget=1000', ...args])
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return result.stdout.toString()
}
const heights: number[] = []
for (const [language, page] of Object.entries(pages)) {
  const file = join(dir, `${language}.html`)
  writeFileSync(file, page.replace('</body>', auditScript + '</body>'))
  for (const sheet of ['layout', 'states']) {
    const dom = chrome(['--window-size=1600,2000', '--dump-dom', `file://${file}?sheet=${sheet}`])
    const json = dom.match(/<pre id="render-audit">(.*?)<\/pre>/)?.[1]
    if (!json) throw new Error(`No layout audit for ${language}/${sheet}`)
    const audit = JSON.parse(json.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'))
    if (audit.overflow.length || audit.width !== 1600) throw new Error(`${language}/${sheet} overflow: ${JSON.stringify(audit)}`)
    heights.push(audit.height)
  }
}
const height = Math.max(...heights)
for (const [language, page] of Object.entries(pages)) {
  const file = join(dir, `${language}.html`)
  writeFileSync(file, page.replace('.sheet { position:relative;', `.sheet { height:${height}px; position:relative;`).replace('</style>', '.sheet footer { position:absolute; bottom:28px; left:68px; right:68px; margin-top:0; }</style>'))
  for (const sheet of ['layout', 'states']) {
    const name = `design-${sheet}-${language}.png`
    const png = join(OUT, name)
    chrome(['--force-device-scale-factor=2', `--window-size=1600,${height}`, `--screenshot=${png}`, `file://${file}?sheet=${sheet}`])
    const compressed = Bun.spawnSync(['magick', png, '-strip', '-define', 'png:compression-level=9', png])
    if (compressed.exitCode !== 0) throw new Error(compressed.stderr.toString())
    console.log(`assets/screenshots/${name} (${3200} × ${height * 2})`)
  }
}
console.log(`Fictional band: ${plain(full)}`)
