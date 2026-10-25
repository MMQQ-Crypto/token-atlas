# Token Atlas 1.7.3

Windows 10 / 11（64 位）本地 AI Token 统计应用。包括活动热力图、每日趋势、模型占比、输入/输出/缓存构成、厂商筛选、模型明细、CSV 导出和真实用量采集。

## 使用

从 [GitHub 最新发布](https://github.com/MMQQ-Crypto/token-atlas/releases/latest) 下载并双击 `Token-Atlas-1.7.3-Windows-x64.exe`，无需安装 Node.js。升级保留原有设置和用量记录。

首页自动显示检测到的 Agent 应用，不列出不存在的应用。应用列表按列对齐展示今日、近 7 天、近 30 天和累计 Token；点击应用，进入该应用的供应商用量，再点击供应商查看模型明细。全局汇总 Token、模型数、应用数、供应商数和用量记录数。总览、模型明细与 CSV 共享同一应用、供应商和时间范围。活动热力图单独展示当前应用及供应商过去一年的历史。

1.5.9 整理界面层级：总量与应用列表优先呈现，每日趋势在全局总览中提前；进入单个应用后，供应商列表优先展示。导出、核对和示例位于右上角“更多”，详细统计说明和年度活动可展开查看。数据解析、去重与统计口径未改动。

Windows 标题栏跟随应用深色背景，最小化、最大化和关闭使用白色系统图标，保留窗口拖动与系统窗口控件。

默认打开窗口为 960 × 680，宽、高均为之前 1440 × 1020 的三分之二。可拖动调整大小或最大化，较长内容支持滚动。

每日趋势图采用平滑曲线，经过每天的真实数据点，转折处自然弯曲。曲线不会超出相邻两天的数值范围，零用量保持为零；悬停仍显示对应日期的真实数值。

全局总览隐藏返回箭头。其他页面中，Token Atlas 左侧的箭头用于返回上一级：模型明细返回应用用量，应用用量返回全部应用，保留所选时间范围。点击名称可直接回到全局总览。圆环图各颜色连续衔接；鼠标移到颜色上，即时显示对应模型、供应商、应用、精确 Token 数、占比及输入/输出/缓存明细；也可用 Tab 聚焦颜色查看。

点击右上角“更多 → 核对用量”，可查看同一应用和供应商的今日、7 天、30 天、累计精确数字，以及输入/输出/缓存构成、首末记录日期和来源读取提示。可导出 JSON 核对报告，只有汇总用量元数据，不包含聊天、请求标识、路径或凭据。来源的跳过计数为整个来源，不受供应商或日期筛选。

模型分类覆盖 12 个国内厂商和 10 个国外厂商，包括 OpenAI、Anthropic / Claude、Google / Gemini、xAI / Grok、Meta / Llama、Mistral、Cohere、Perplexity、Amazon 和 Microsoft。只显示当前范围实际有用量的供应商，提供国内、国外筛选。厂商分类不等于平台账号完整账单。

1.7.2 的厂商下拉框仅列出本机已读取记录（含导入）中出现过的厂商；选中应用后，仅列出该应用记录中的厂商。没有对应记录的国内/国外分组和“未识别厂商”会隐藏。选项依据可读取的全部历史生成，不因今日没有调用而消失；切换应用或刷新后，已不可用的厂商选择自动恢复为“全部厂商”。没有记录时仅保留“全部厂商”。

OpenAI 供应商条目是模型供应商汇总，可能包含 Codex 等应用，并不等于 ChatGPT 网页或客户端单独的用量。条目显示实际来源应用；需要核对某个应用时先按应用筛选，再打开“核对用量”。本机没有收到 ChatGPT 真实 usage 时，不会把 Codex 数字当作 ChatGPT 会话用量。

1.5.8 明确区分来源应用与模型，例如 Codex 应用使用 GPT‑6.1 Sol。`codex-auto-review` 是系统审核标识，不代表用户选择的模型，日志没有披露其实际模型；在明细中单列，不计入已识别模型数，Token 保留在总量中。总量下方的“用量构成与统计说明”显示缓存读取的精确数值和占比，核对报告及 CSV 同步区分系统记录与模型调用。

1.5.6 修复 Codex 子代理日志内嵌父会话元数据时错误合并记录的问题。始终保留日志首个会话头的所属 ID，以稳定事件标识去重；不同子代理独立计数，同一日志的复制或归档仍去重。升级后重新读取原始日志即可生效，无需修改日志或手动补数。

### WorkBuddy 与混元 Hy3

自动读取 `~/.workbuddy/projects` 和 `~/.workbuddy-ai/projects` 下的 JSONL（可用 Token Atlas 的 `WORKBUDDY_HOME` 指定根目录）。覆盖助手、工具调用与 `model-usage` 的真实 `providerData.usage/rawUsage`，按响应标识去重，优先结算记录；工具输出、估算、上下文水位与积分记录不会当作 Token。支持原始及标准化缓存字段，已包含的推理不重复累加。`hy3`、`Hy3`、`hunyuan-*` 归入腾讯混元，WorkBuddy 是独立应用来源。

另一台电脑的数据不会自动出现：可在那台运行本应用，或将 `.workbuddy/projects`（国际版为 `.workbuddy-ai/projects`）复制到本机，在“数据来源 → 添加已有记录”选择 WorkBuddy 和记录目录。只需会话目录，无需认证文件。自定义目录会替换该应用的默认路径。

本版只统计真实 Token，不读取账号登录态，不查询积分余额或套餐剩余额度，也不把积分换算成 Token。格式依据腾讯官方发布的 `@tencent-ai/codebuddy-code@2.175.0` 的 WorkBuddy 内核进行静态核对，并用样例验证；本机未发现 WorkBuddy 记录，尚未对用户另一台电脑的实际用量进行验证。日志目录结构参见 [官方目录说明](https://www.workbuddy.cn/docs/cli/codebuddy-dir)，Hy3 名称参见 [腾讯官方模型配置](https://cloud.tencent.com/document/product/1831/134445)。

### ZCode 与其他电脑的数据

自动读取 `~/.zcode/cli/db/db.sqlite`（支持 `ZCODE_HOME`）。只以只读方式查询 `model_usage` 的用量字段，不查询聊天表或认证配置；读取 SQLite WAL 中的最新提交。缓存根据记录中的真实总数拆分，推理不重复累加。表结构不兼容或计数不一致的记录会提示并跳过。

从 1.5.3 起修正总数字段优先级：优先使用 ZCode 自身用量界面汇总的 `computed_total_tokens`，缺失时才采用 `provider_total_tokens`。两者可能因历史缓存口径不同而有差异，旧逻辑会少计部分缓存。核对报告显示两类总数不同的记录数，以及因无效构成被跳过的记录数和数据库计算总数，跳过部分不自动加入用量。修复已使用 SQLite 样例验证；不能据此断言某个账号的历史差额已全部找回。

ZCode 适配依据 [官方开源用量实现](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/usage.ts)。官方当前实现会清理较早的逐请求记录，因此“累计”指当前仍可读取的数据，不能恢复已被删除的历史。

本机应用用量与账号跨设备用量范围不同。另一台电脑使用智谱产生的 Token，不能从本机不存在的日志中还原。可在那台电脑运行本应用，或关闭对应 Agent 后，将其记录目录完整拷贝到本机，在“数据来源 → 添加已有记录”选择应用及目录（ZCode 目录含 db.sqlite，WAL 模式需保留同一快照的附属文件）。现有自定义目录会替换该应用的默认目录，避免直接叠加重复记录。账号远端总量未合并进本机应用统计，避免把无法归属具体 Agent 的账号消耗分配给某个应用。

### DeepSeek 桌面端：自动统计

自动读取 `%USERPROFILE%/.dsh/sessions/**/session.v*.jsonl.zstd` 或明文 JSONL（支持 `DSH_HOME`）。这是 DeepSeek Harness 的数据目录，不代表所有名为 DeepSeek 的客户端都使用相同格式。

解析服务端结算事件 `assistant/message`、`assistant/attempt` 中的 `usage` 或最后的流式 usage。输入、输出、缓存读写分开统计；同一尝试的重复结算替换旧值，重试产生的新尝试独立计入。不会把上下文长度或界面估算值当成真实用量。解压和解析在工作线程中流式进行，文件未变化时复用内存缓存。

已使用真实 DeepSeek Harness 日志验证，支持读取其中的 DeepSeek、豆包等模型调用。日志只代表已保存在本机的调用，不代表官网或全部账号的完整账单。真实用量、测试快照与聊天记录不会上传到本仓库。

### 国内外 AI 网页：采集真实响应

1. 打开应用的“数据来源”，点击“启动网页采集”。
2. 点击“打开扩展文件夹”。在 Edge / Chrome 的扩展管理页开启开发人员模式，选择“加载解压缩的扩展”，加载该文件夹。
3. 打开扩展，填写桌面端显示的本机地址，粘贴“复制配对码”获得的配对码，勾选启用并保存。
4. 刷新聊天网页后正常使用。

扩展列出 DeepSeek、豆包、Kimi、通义、智谱、文心、元宝、星火，以及 ChatGPT、Claude、Gemini、Google AI Studio、Grok、Meta AI、Mistral Le Chat、Perplexity、Copilot 的官方域名。**只有网页 Fetch / XHR 的 JSON 或 SSE 响应实际提供标准 usage 或完整 Gemini usageMetadata，才会计数。** 扩展会显示已观察响应数、含真实用量的响应数和待同步记录数。域名适配不等于平台保证返回 Token，也不表示所有已登录官网均已实测。升级扩展后需在浏览器扩展管理页重新加载并刷新聊天网页。

网页没有返回 usage、采用私有加密格式或 WebSocket 时，无法准确还原其 Token 数；不会伪造或按字数估算。扩展不能回溯安装前的网页请求。每次桌面应用重启后需重新配对。采集服务只有点击启动后才监听 `127.0.0.1`，使用随机配对码认证；其他网站来源的请求被拒绝。配对码不是平台 API Key。

### 已有记录：导入 JSON / JSONL / HAR

“数据来源”中点击“导入 JSON / JSONL / HAR”。API 原始响应需要包含请求标识、时间（`created` 秒级时间戳，或外层 `timestamp`）与标准 usage。HAR 使用网络记录中的响应正文与请求开始时间；支持 JSON 和 SSE 正文。缺少时间、用量不一致、明显标注 estimated 的数据不会生成记录。最大单文件 64 MB，重复响应按来源域名和响应 ID 去重。

导出 HAR 时请保存带响应内容的文件。原始 HAR 可能包含敏感请求头或正文，只需保存在本机导入，切勿对外发送。应用仅持久保存用量元数据，丢弃正文和请求头。

## 其他自动数据源

| 工具 | 默认位置 | 说明 |
| --- | --- | --- |
| WorkBuddy | `~/.workbuddy/projects`、`~/.workbuddy-ai/projects` | 逐响应 Token、工具调用、模型结算；支持复制来的会话目录。 |
| Codex | `~/.codex/sessions`、`archived_sessions` | 对累计 token_count 求差，去除重复快照；支持 CODEX_HOME。 |
| ZCode | `~/.zcode/cli/db/db.sqlite` | 只读逐请求用量与 WAL；支持 ZCODE_HOME。 |
| Claude Code | `~/.claude/projects` | 助手消息 usage，含子代理，重复请求消息保留最大有效用量；支持 CLAUDE_CONFIG_DIR。 |
| Cline | 编辑器 `globalStorage/saoudrizwan.claude-dev/tasks` | api_req_started 中的 Token 元数据。 |
| Roo Code | 编辑器 `globalStorage/rooveterinaryinc.roo-cline/tasks` | 兼容 Cline 的任务日志。 |
| Kilo Code | 编辑器 `globalStorage/kilocode.kilo-code/tasks` | 兼容 Cline 的任务日志，其他存储格式未接入。 |

扩展目录自动搜索 VS Code、Insiders、Cursor、Windsurf。自定义目录可以在来源面板选择。Cursor / Windsurf 内置聊天、其他客户端、其他设备和清理掉的日志并非自动可读；需要真实记录或平台接口，不能凭空补全。

## 统计口径

- 总 Token = 非缓存输入 + 输出 + 缓存读取 + 缓存写入。Codex / Chat Completions 输入中的缓存拆出后只计一次。推理 Token 属于输出，不再额外累加。
- 支持 DeepSeek、通义、智谱、Kimi、豆包、文心、MiniMax、混元、星火、阶跃、百川、零一万物等模型分类。厂商优先根据模型名识别，模型缺失时可依据采集的官方网页域名归类。这不等于实际账单服务商。模型名缺失时仍显示“未知模型”。
- 今日、近 7 天、近 30 天和累计同时控制顶部汇总、趋势、占比、供应商、模型明细与 CSV；应用卡片始终显示四个时间范围。热力图独立展示过去一年。
- 时间按本机时区。会话数按来源日志会话 ID 计数；网页和导入记录缺少对话 ID 时按响应分组，并不等于官网聊天会话数。无用量数据时显示“—”或“暂无真实用量”，不把未获取数据当作零使用。
- 示例模式有明确横幅，禁用导出；数据来源页面始终使用真实记录。
- 来自不同通道的同一次调用可能重复，无法可靠跨所有工具去重。分析时按工具筛选，或只启用一份本地日志。网页采集和 HAR 导入在域名、响应 ID 一致时可去重。
- Token 用量不等于费用、套餐剩余额度或平台完整账单。本版本没有自动调用付费接口，也不读取平台登录凭据。

## 本地存储

设置和浏览器/导入用量保存在 Electron 用户目录（通常为 `%APPDATA%/token-atlas`）。`captured-usage.jsonl` 只保存响应 ID 哈希、来源、模型、时间和 Token 数。原始本地会话日志不修改，解析缓存只在内存中。网页扩展只向本机应用传递元数据，断线时最多暂存 1000 条，连接恢复后重试。

## 开发与验证

开发环境使用支持 Zstandard 的 Node.js 22.15 以上（建议 Node 24）及 npm / pnpm：

```powershell
npm install
npm start
npm test
npm run dist
```

46 项 Node 测试验证四种日期范围、应用下钻、ZCode SQLite/WAL、WorkBuddy 结算与混元识别、累计差分、缓存、重试去重、压缩日志、SSE、HAR、Gemini usageMetadata、国内外分类、接口鉴权、更新分段下载、无数据回退、跨重启续传、缓存复用，以及 API 受限时的更新检查和哈希校验。`scripts/ui-check.cjs` 检查界面下钻、筛选、导出和更新交互；`scripts/network-check.cjs` 用隔离响应检查浏览器采集，未发起真实聊天。这两个开发脚本需要 Playwright，可通过 PLAYWRIGHT_MODULE 提供安装路径。

已实测本机 DeepSeek Harness 日志、桌面启动和 CSV 导出；其他国内官网是否返回 usage 仍取决于其实际协议，不能宣称全部官网都已验证或必定可统计。

## 应用内更新（1.7.3）

启动应用后会检查 GitHub，也可以点击右上角“检查更新”。30 秒内重新打开窗口复用检查结果，“重新检查”可强制刷新。发现新版后，点击下载，完成 SHA-256 与大小校验后点击“更新并重启”。大于 8 MB 的更新包在服务器支持 Range 时使用四路分段下载；不支持时改为单次完整下载。中断进度会保存在本机，重试或重启后可续传。已有完整文件只有通过清单大小与 SHA-256 校验才会复用；校验失败的分段会清理重下。下载窗口显示大小、速率和预计剩余时间。升级到 1.6.0 后，后续更新开始使用这些优化，首次下载速度仍取决于网络。免安装版会关闭当前应用、备份原 EXE、覆盖更新并重新打开，设置和采集记录保留在原用户目录。备份保存在原程序旁的 `.previous` 文件。运行目录需要允许当前用户写入；源码 / 解压目录运行只支持检查与下载，覆盖更新需从免安装 EXE 启动。

1.7.1 补充分段下载的无数据回退：所有分段连续 20 秒均未收到新数据时，取消分段请求并改用普通完整下载，避免服务器接受 Range 后进度长时间卡在 0%。切换时进度从完整下载重新计算，仍须通过相同的大小与 SHA-256 校验。

更新源为独立仓库 MMQQ-Crypto/token-atlas，直接读取公开的 `/releases/latest/download/token-atlas-update.json`，不调用受共享 IP 额度限制的 REST API。清单必须是本项目的 Windows x64 正式版本，下载地址须精确匹配同一仓库的 v 版本标签，大小和 SHA-256 均校验通过后才能安装。网络异常时可用“打开发布页”手动下载。1.4.0 的检查若已受限，请手动下载并运行 1.7.3 一次，之后使用新逻辑。

公开下载地址遵循 [GitHub 发布链接说明](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)。Gemini 用量拆分遵循 [Google UsageMetadata 文档](https://ai.google.dev/api/generate-content#UsageMetadata)，缺少字段或总数不一致时不生成记录。

发布新版本：修改本目录的 package.json 版本号和 RELEASE_NOTES.md，提交到 main。根目录 `.github/workflows/token-atlas-release.yml` 会在 Windows 上运行测试、打包、生成带哈希的更新清单并发布专用 Release。已存在的版本不会覆盖，需要递增版本号。GitHub Actions 需要仓库允许 workflow 使用 contents: write 发布 Release。
