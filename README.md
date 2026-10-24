# Token Atlas 1.4.0

Windows 10 / 11（64 位）本地 AI Token 统计应用。包括活动热力图、每日趋势、模型占比、输入/输出/缓存构成、厂商筛选、模型明细、CSV 导出和真实用量采集。

## 使用

双击 `release/Token-Atlas-1.4.0-Windows-x64.exe`，无需安装 Node.js。保留旧版设置，新增的 DeepSeek 数据源默认启用。

### DeepSeek 桌面端：自动统计

自动读取 `%USERPROFILE%/.dsh/sessions/**/session.v*.jsonl.zstd` 或明文 JSONL（支持 `DSH_HOME`）。这是 DeepSeek Harness 的数据目录，不代表所有名为 DeepSeek 的客户端都使用相同格式。

解析服务端结算事件 `assistant/message`、`assistant/attempt` 中的 `usage` 或最后的流式 usage。输入、输出、缓存读写分开统计；同一尝试的重复结算替换旧值，重试产生的新尝试独立计入。不会把上下文长度或界面估算值当成真实用量。解压和解析在工作线程中流式进行，文件未变化时复用内存缓存。

已使用真实 DeepSeek Harness 日志验证，支持读取其中的 DeepSeek、豆包等模型调用。日志只代表已保存在本机的调用，不代表官网或全部账号的完整账单。真实用量、测试快照与聊天记录不会上传到本仓库。

### 国内 AI 网页：采集真实响应

1. 打开应用的“数据来源”，点击“启动网页采集”。
2. 点击“打开扩展文件夹”。在 Edge / Chrome 的扩展管理页开启开发人员模式，选择“加载解压缩的扩展”，加载该文件夹。
3. 打开扩展，填写桌面端显示的本机地址，粘贴“复制配对码”获得的配对码，勾选启用并保存。
4. 刷新聊天网页后正常使用。

扩展列出 DeepSeek、豆包、Kimi、通义、智谱、文心、元宝、星火的官方聊天域名。**只有网页 Fetch / XHR 的 JSON 或 SSE 响应实际提供标准 usage，才会计数。** 扩展会显示已观察响应数、含真实 usage 的响应数和待同步记录数。域名适配不等于平台保证返回 Token，更不等于已经实测所有已登录官网。

网页没有返回 usage、采用私有加密格式或 WebSocket 时，无法准确还原其 Token 数；不会伪造或按字数估算。扩展不能回溯安装前的网页请求。每次桌面应用重启后需重新配对。采集服务只有点击启动后才监听 `127.0.0.1`，使用随机配对码认证；其他网站来源的请求被拒绝。配对码不是平台 API Key。

### 已有记录：导入 JSON / JSONL / HAR

“数据来源”中点击“导入 JSON / JSONL / HAR”。API 原始响应需要包含请求标识、时间（`created` 秒级时间戳，或外层 `timestamp`）与标准 usage。HAR 使用网络记录中的响应正文与请求开始时间；支持 JSON 和 SSE 正文。缺少时间、用量不一致、明显标注 estimated 的数据不会生成记录。最大单文件 64 MB，重复响应按来源域名和响应 ID 去重。

导出 HAR 时请保存带响应内容的文件。原始 HAR 可能包含敏感请求头或正文，只需保存在本机导入，切勿对外发送。应用仅持久保存用量元数据，丢弃正文和请求头。

## 其他自动数据源

| 工具 | 默认位置 | 说明 |
| --- | --- | --- |
| Codex | `~/.codex/sessions`、`archived_sessions` | 对累计 token_count 求差，去除重复快照；支持 CODEX_HOME。 |
| Claude Code | `~/.claude/projects` | 助手消息 usage，含子代理，重复请求消息保留最大有效用量；支持 CLAUDE_CONFIG_DIR。 |
| Cline | 编辑器 `globalStorage/saoudrizwan.claude-dev/tasks` | api_req_started 中的 Token 元数据。 |
| Roo Code | 编辑器 `globalStorage/rooveterinaryinc.roo-cline/tasks` | 兼容 Cline 的任务日志。 |
| Kilo Code | 编辑器 `globalStorage/kilocode.kilo-code/tasks` | 兼容 Cline 的任务日志，其他存储格式未接入。 |

扩展目录自动搜索 VS Code、Insiders、Cursor、Windsurf。自定义目录可以在来源面板选择。Cursor / Windsurf 内置聊天、其他客户端、其他设备和清理掉的日志并非自动可读；需要真实记录或平台接口，不能凭空补全。

## 统计口径

- 总 Token = 非缓存输入 + 输出 + 缓存读取 + 缓存写入。Codex / Chat Completions 输入中的缓存拆出后只计一次。推理 Token 属于输出，不再额外累加。
- 支持 DeepSeek、通义、智谱、Kimi、豆包、文心、MiniMax、混元、星火、阶跃、百川、零一万物等模型分类。厂商优先根据模型名识别，模型缺失时可依据采集的官方网页域名归类。这不等于实际账单服务商。模型名缺失时仍显示“未知模型”。
- 顶部汇总与热力图按全部历史统计；厂商和工具筛选作用于概览。近 7 / 30 / 90 日控制趋势、占比、构成和概览页 CSV。模型明细与其导出使用全部历史。
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

20 项 Node 测试验证累计差分、缓存、重试去重、压缩日志解析、损坏文件处理、SSE、HAR 导入、缺失数据排除、持久化、接口鉴权和来源隔离。`scripts/ui-check.cjs` 检查桌面界面交互；`scripts/network-check.cjs` 用隔离响应检查浏览器采集逻辑，未向真实官网发起聊天。这两个开发脚本需要 Playwright，可通过 PLAYWRIGHT_MODULE 提供安装路径。

已实测本机 DeepSeek Harness 日志、桌面启动和 CSV 导出；其他国内官网是否返回 usage 仍取决于其实际协议，不能宣称全部官网都已验证或必定可统计。

## 应用内更新（1.4.0）

启动应用后会检查 GitHub，也可以点击右上角“检查更新”。发现新版后，点击下载，完成 SHA-256 与大小校验后点击“更新并重启”。免安装版会关闭当前应用、备份原 EXE、覆盖更新并重新打开，设置和采集记录保留在原用户目录。备份保存在原程序旁的 `.previous` 文件。运行目录需要允许当前用户写入；源码 / 解压目录运行只支持检查与下载，覆盖更新需从免安装 EXE 启动。

更新源为独立仓库 MMQQ-Crypto/token-atlas，只读取 v 前缀的正式版本标签和 token-atlas-update.json 清单，不依赖旧的 app 仓库。GitHub 发布版本和更新包均在独立仓库管理。

发布新版本：修改本目录的 package.json 版本号和 RELEASE_NOTES.md，提交到 main。根目录 `.github/workflows/token-atlas-release.yml` 会在 Windows 上运行测试、打包、生成带哈希的更新清单并发布专用 Release。已存在的版本不会覆盖，需要递增版本号。GitHub Actions 需要仓库允许 workflow 使用 contents: write 发布 Release。
