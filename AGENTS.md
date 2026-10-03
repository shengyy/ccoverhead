# ccOverhead · Agent 指引

公开仓库（MIT）：Claude Code mod，在输入框上方用一条横条显示上下文、每轮增长、5 小时与每周额度和 prompt 缓存冷热，统一用一条从安全到警告的色阶。仓库根目录是 marketplace（`.claude-plugin/marketplace.json`），插件本体在 `plugin/`。本文件每次会话都会加载，只放读代码推断不出、且每次任务都成立的边界；细则在下表的文档里，用到时再读。`CLAUDE.md` 导入本文件，人类流程见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

## 按需加载

| 范围 | 先读 |
|---|---|
| 产品规则与非目标 | [`PRODUCT.md`](PRODUCT.md) |
| 当前已验证的 Claude Code 版本与界面 | [`docs/status.md`](docs/status.md) |
| 代码结构、数据流、`$.state` | [`docs/architecture.md`](docs/architecture.md) |
| Claude Code 的 mod API 行为与限制 | [`docs/claude-code-integration.md`](docs/claude-code-integration.md) |
| 横条布局、色阶、桌面端画法、logo、截图 | [`docs/design.md`](docs/design.md) |
| 版本与发版 | [`docs/release.md`](docs/release.md) |
| 文档与目录的职责、写入规则 | [`docs/README.md`](docs/README.md) |
| 待办、挂账、待确认 | GitHub Issues：挂账标 `deferred`，待确认标 `needs-decision` |

检查：文档 → `git diff --check`；`plugin/` → `claude plugin validate plugin`、`bunx --package typescript tsc -p plugin`、`claude plugin test plugin`；marketplace → `claude plugin validate .`；横条外观 → `bun scripts/screenshot/render.ts`。`tsc` 依赖已登录会话用 `claude --plugin-dir ./plugin` 写出的 `plugin/.claude-plugin/types/`，CI 只跑 validate 与 test。

## 约定

- 每个事实只有一个 owner，其它地方链接它：版本号只在 `plugin/.claude-plugin/plugin.json`，`$.state` 的形状只在 `plugin/types/index.d.ts`，色阶的十个颜色只在 `plugin/hooks/format.ts`（`docs/design.md` 的表格跟随），两份 README 同步。
- 替代方案落地时，同一变更里删掉旧路径及其测试和文档，仓库里只留一套做法。
- 单文件 ≤800 行正常，800–1200 行按职责考虑拆分，超过 1200 行在触碰时拆分或在文件头写明原因；一个目录一个职责，新目录登记到 `docs/README.md`。

## 本仓不变量

- mod 只通过 `$` 读取 Claude Code 已上报的数字：不读写文件、不起进程、不联网、不发模型请求；插件拿不到的数字（如按模型的周额度）也不去读 Claude Code 的缓存或凭据、不调未公开接口。新增引擎调用要能在 `claude plugin validate plugin` 的列表里解释清楚，并同步 `SECURITY.md`。
- 画界面的 hook 只读不写；状态写在事件里，值放 `$.state`，跨会话只存最近一次额度读数（`$.store` 的 `limits`）。
- 终端和桌面端都要过：测试对 `terminal` 与 `desktop` 各跑一遍；桌面端是比例字体，图形用 `Svg`，元素靠 `Box` 的 `gap` 隔开，不靠空格。按 `e.surface` 分支，不按元素表里有没有 `Svg` 判断。
- Claude Code 行为先在真实会话里验证，再写进 `docs/claude-code-integration.md` 与 `docs/status.md`，写明版本；没验证的标 not verified。
- 仓库公开：不出现真实会话内容、提示词、个人路径或账号信息；截图只用 `scripts/screenshot/` 的虚构数据。

## 协作与发版

- 中文回复，标识符、命令、路径保持英文。
- 改动仓库保护规则前先征得用户同意。
- `main` 受 "Protect main" ruleset 保护：主题分支先开 draft PR（CI 跳过），本机检查通过后转 ready，`gate` 通过且分支含最新 `main` 后 squash 合入。
- 用户可见的变化记入 `CHANGELOG.md` 的 `[Unreleased]`；已验证事实变化时同步 `docs/status.md`。
- 发版由你端到端执行：用户说发版后，按 [`docs/release.md`](docs/release.md) 用 `gh` 完成，用户不需要打开浏览器。
