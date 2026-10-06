<p align="center">
  <img src="assets/brand/logo.svg" width="112" alt="ccOverhead 标志">
</p>

<h1 align="center">ccOverhead</h1>

<p align="center">
  Claude Code 的开销，就悬在你头顶。<br>
  上下文、每轮增长、额度和缓存冷热，一条横条显示在输入框上方；<br>
  背后的细节，放在 <code>/ccoverhead</code> 面板里。
</p>

<p align="center">
  <a href="README.md">English</a> | <strong>简体中文</strong>
</p>

<p align="center">
  <a href="https://github.com/shengyy/ccoverhead/actions/workflows/ci.yml"><img src="https://github.com/shengyy/ccoverhead/actions/workflows/ci.yml/badge.svg?event=pull_request" alt="CI"></a>
  <a href="https://github.com/shengyy/ccoverhead/releases"><img src="https://img.shields.io/github/v/release/shengyy/ccoverhead?sort=semver" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
</p>

<p align="center"><a href="https://shengyy.github.io/ccoverhead/"><strong>小站与功能预览</strong></a></p>

<p align="center">
  <img src="assets/screenshots/desktop.png" width="760" alt="Claude 桌面端里的 ccOverhead 横条：上下文条 27%、七根颜色各异的增长柱、缓存「还热 38 分钟」、5 小时额度 42%、每周额度 63%">
</p>

---

在 Claude Code 里干活时，有几个数字决定你下一步该做什么：上下文窗口满了多少（该 `/compact` 了吗？）、涨得有多快、5 小时和每周额度还剩多少、prompt 缓存还热不热。ccOverhead 是一个 Claude Code mod（由函数钩子组成的插件），把这些数字放进输入框正上方的一条横条里，用同一条从安全到警告的色阶显示用量，费用固定金色；需要细节时，再打开一个面板。

## 功能

- **上下文一眼看清**：进度条、已用百分比和「已用/窗口」token 数。新会话第一个回复之前（以及 `/clear`、compact 之后）显示 Claude Code 自己的 `/context` 估算值，前面带 `~`，不会是空白。
- **每轮增长**：一组七根柱子，显示最近每一轮给上下文加了多少，`↑` 是最后一轮的增量。每根柱子按它占窗口的比例上色，重的一轮会很显眼。上下文读数也会在一轮的请求之间刷新。
- **额度与重置倒计时**：5 小时和每周两个窗口（以及 Claude 网关的花费额度）的已用百分比，以及各自距离重置还有多久。
- **prompt 缓存冷热**：主对话上一次请求有没有命中缓存、还能热多久，颜色随寿命流逝由冷转暖，让你知道停下来多久会导致重写缓存；某一轮真的重写了，横条会告诉你写了多少。
- **subagent 也看得到**：打开某个 subagent 的记录，横条跟着切到它的上下文和增长。
- **`/ccoverhead` 面板**：窗口里按类别都有什么（哪个 MCP server 占了多少）、上次压缩以来的增长和每次压缩、缓存命中率、每个额度窗口及其平均速度下的耗尽估算（淡色延伸为重置前预计用量）、最近活跃的 8 个 subagent。在不画横条的 VS Code 和手机 App 里也能用。
- **一套颜色语言**：冷色是安全，黄色是注意，暖色到红是警告，用量数字都遵循这个规则；费用固定金色。红绿色弱用户也能分清。
- **终端和桌面端**：终端里是一行文字；在 Claude 桌面端，字符图形对不齐，改为清晰的矢量图形。文字跟随深浅主题。
- **原生费用**：`cost ≈$1.84 (+$0.12)` 显示 Claude Code 给出的会话 API 价格参考，以及最新一轮增量。累计金额固定金色，增量用次级文字，缺失隐藏，不维护价格表。订阅用户看到的是用量参考，不是额外账单。
- **运行中的 agent**：只在非零时显示正在运行的数量，结束后隐藏。
- **私密、免费**：只读取 Claude Code 已经上报的数字。不读文件、不联网、不发模型请求、不收集任何数据。

<p align="center">
  <img src="assets/screenshots/terminal.png" width="760" alt="终端里的同一条横条：字符进度条和彩色柱状图在一行文字里">
</p>

## 要求

- Claude Code 2.1.288 或更新版本，支持 mod（函数钩子插件）。已验证的版本见 [docs/status.md](docs/status.md)。
- 横条在终端和 Claude 桌面端的 Code 标签里显示。额度只在会上报用量限制的 Claude 订阅套餐下出现，Claude 网关上报花费额度时显示为 `spend`；其它使用 API key 的会话显示上下文、缓存，以及宿主提供的费用。

## 安装

在 Claude Code 里执行：

```text
/plugin marketplace add shengyy/ccoverhead
/plugin install ccoverhead@ccoverhead
/reload-plugins
```

更新：先 `/plugin marketplace update ccoverhead`，再 `/plugin update ccoverhead@ccoverhead`。卸载：`/plugin uninstall ccoverhead@ccoverhead`。

## 使用

横条从左到右，依次是每轮都在变的、变化慢的：

```text
ctx ■■■□□□□□□□ 27% 271k/1M  ▁▁▃█▁▇▁ ↑3.4k | cache warm 38m | 5h 42% ↻2h34m | 7d 63% ↻2d7h | cost ≈$1.84 (+$0.12)
```

| 组 | 含义 |
|---|---|
| `ctx` | 上下文用量：进度条、百分比、token 数。`~` 表示第一个回复前的估算值。正在看 subagent 的记录时显示为 `agent` |
| 柱子和 `↑` | 最近七轮各自加了多少；`↑` 是最后一轮 |
| `cache` | `warm` 加剩余分钟数，颜色随寿命流逝由冷转暖，或 `cold`；宿主未给出寿命证据时显示 `TTL unknown`；某一轮重新写入缓存而没能读到时，显示 `rewrote` 和写入量 |
| `5h`、`7d` | 各窗口的额度已用比例，`↻` 是距离重置的时间。暗色表示沿用上一个会话的读数。Claude Code 上报了当前主模型自己的周额度时，`7d` 改显示它，例如 `7d fable`（未验证） |
| `cost` | 金色会话累计金额和次级文字的最新一轮增量；原生 API 价格参考，缺失隐藏 |
| `⚙︎ N` | 正在运行的 agent 数量，用黄绿色提示；零个时隐藏 |
| `spend` | Claude 网关上报的花费额度，可能超过 100%（未验证） |

颜色是同一条从冷到暖的 10 档色阶。百分比（上下文和额度）每 10% 升一档：0–29% 天蓝，90% 及以上深红；每根增长柱按它占窗口的比例落档，从 0.1% 起每翻一倍升一档。完整对照表见 [docs/design.md](docs/design.md#color-scale)。窗口变窄时，横条严格从右往左缩，上下文和每轮增长柱状图比右侧各组保留得更久。

输入 `/ccoverhead` 打开面板。它只负责展示，不往对话里写任何东西：

<p align="center">
  <img src="assets/screenshots/pane.png" width="620" alt="终端里的 ccOverhead 面板：上下文与自动压缩阈值、按类别和 MCP server 拆分的窗口占用、上次压缩以来的增长、缓存状态与命中率、额度及窗口平均速度下的额度耗尽估算与原生费用、一个 subagent">
</p>

## 设计理念

四种信号，放进一条安静的横条。同一套从冷到暖的色阶，让上下文压力、重的一轮和额度用量都能一眼看清。窗口变窄时先删次要细节，把上下文留到最后。

下面的设计图用虚构数据说明布局、色阶阈值与状态规则。完整规则与生成方式见[设计说明](docs/design.md)。

<p align="center">
  <img src="assets/screenshots/design-layout-zh-cn.png" width="1000" alt="ccOverhead 布局与色阶设计图：桌面与终端画法、逐级窄屏删减、深浅色调色板与颜色阈值">
</p>

<p align="center">
  <img src="assets/screenshots/design-states-zh-cn.png" width="1000" alt="ccOverhead 状态设计图：实际与估算上下文、额度记忆、缓存冷热、会话重置、事件状态流与验证边界">
</p>

## 原理

ccOverhead 是一个函数钩子插件。它绘制输入框上方的 `AbovePrompt` 区域，在 `/ccoverhead` 时打开一个 `Pane`；读取 Claude Code 每轮结束后上报的上下文和用量限制（`session.measure`、`$.session.usage`，压缩阈值和类别拆分来自 `/context` 的本地计数，不发请求），并观察每次请求的 token 用量（`turn.step`）。费用使用原生读数，本轮差额和详情里的耗尽估算由这些读数计算，不从你的文件里计算，也不发往任何地方。它依赖的 Claude Code 行为，以及每条在哪个版本上验证过，见 [docs/claude-code-integration.md](docs/claude-code-integration.md)。

## 隐私

ccOverhead 不发任何网络请求和模型请求，也不读文件和对话内容。会话期间的数字只放在内存里；唯一持久保存的是最近一次额度读数，存在 Claude Code 的插件存储里，新会话在拿到自己的读数之前先显示它。详见 [SECURITY.md](SECURITY.md)。

ccOverhead 是独立项目，与 Anthropic 无关联，也未获其背书。「Claude」和「Claude Code」是 Anthropic, PBC 的商标。

## 参与贡献

欢迎提 issue 和 pull request。请先读 [CONTRIBUTING.md](CONTRIBUTING.md)、[PRODUCT.md](PRODUCT.md) 里的产品规则和[文档目录](docs/README.md)。

## 许可证

[MIT](LICENSE)
