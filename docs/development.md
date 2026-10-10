# 开发说明

[中文](development.md) · [English](development.en.md) · [产品说明](../README.md)

## 安装预构建 Release

从 GitHub 最新稳定 Release 下载预构建安装包：

```text
https://github.com/3ChatAI-NCT/3chatai-deepseek-harness-plugin/releases/latest/download/3chat-customer-growth.tgz
```

先在浏览器下载 `.tgz` 并保留文件，再在官方 DSH「插件 → 添加插件」中粘贴下载文件的完整路径，例如 `/Users/你的用户名/Downloads/3chat-customer-growth.tgz`。无需在用户设备编译源码。DSH 当前不自动升级插件，升级时先卸载，再下载并安装新版。

DSH 0.2.0-rc.2 随附的 pnpm 11.7.0 在复用远程 tarball 缓存时可能写出缺少 integrity 的锁条目，后续安装报 `ERR_PNPM_MISSING_TARBALL_INTEGRITY`。固定版本 URL 也会受影响。本地 `.tgz` 安装绕开该路径；无需删除用户锁文件、清空缓存或关闭完整性校验。此安装流程已验证重复安装，宿主 pnpm 的远程缓存缺陷仍需上游修复。

## 从源码构建

需要 Node.js 22 或以上版本。在本仓库根目录运行：

```sh
npm ci
npm run pack
```

构建入口为 `scripts/build.mjs`，打包入口为 `scripts/pack.mjs`。编译文件位于 `dist/`，安装包位于 `dist/3chat-customer-growth-2.1.2.tgz`。安装用户直接使用预构建 `.tgz`。运行入口由 `package.json` 的 `exports` 指向 `dist/`。

当前发布入口只承诺预构建 `.tgz`：Git 不跟踪 `dist/`，仓库也没有 `prepare`，因此不支持直接用 `dsh plugin add github:…` 安装源码。请使用上述 `npm run pack` 先编译再打包，单独运行 `npm pack` 不会触发编译。此选择符合[官方打包说明](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)对源码与预构建产物的区分。

安装包包含运行代码、内置 Skill、双语说明和许可文件，无安装时脚本。Cordis、Schemastery、Typert 与 React 使用宿主提供的模块；运行时 peer 版本范围为 `*`，不限定 DSH 版本。`devDependencies` 仅锁定构建和测试所用版本，打包时移除。安装与加载检查由 DSH 官方执行。更新 Host 模块后重启 DSH。

## 目录职责

```text
src/          插件运行代码：入口、连接、工具、OAuth 和界面
references/   Skill 与配套资源，仅这一份源文件
scripts/      构建、打包及 Skill 完整性检查
docs/         双语使用与开发说明
dist/         编译后的 JS、语言文件、第三方许可及 tgz；不入 Git
```

`src/regions.js` 定义服务地址、凭据键和区域文案；`src/index.js` 注册服务，`src/connection.js` 管理连接与 MCP 调用，`src/tools.js` 向助手提供工具。OAuth 实现在 `src/oauth/`，原生界面和翻译在 `src/ui/`，共享界面协议在 `src/protocol.js`，实时参数校验在 `src/tool-schema.js`。

构建只生成运行文件，不复制 README 或 Skill。打包在系统临时目录组装完整安装包，完成后自动清除临时目录。因此工作区只有一份 Skill，安装包中包含同一份源内容。

## Cordis 服务与消费者

`package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`，由 patch 分别插入服务提供插件、工具消费者和官方 Skill 文件系统提供器。`ThreeChatService` 定义并提供 `threeChat` 服务；工具消费者声明其依赖，面板通过 Typert 远程服务调用同一个连接。服务、工具和 Skill 提供器分别加载，依赖就绪后启用；卸载时各自释放注册、订阅与连接资源。

面板和对话工具共用当前语言对应的连接。中文（`zh`）使用国内服务 `https://app.3chatai.cn/mcp`，官网为 [3Chat 国内站](https://www.3chatai.cn/)；其他语言使用海外服务 `https://app.3chat.ai/mcp`，官网为 [3Chat 海外站](https://3chat.ai)。两条连接分别保存在 DSH credentials 服务的 `threechat-mcp/oauth` 与 `threechat-global/oauth` 中，国内凭据槽沿用原值。语言切换只选择连接与工具，不发起授权；已有授权可恢复连接并发现工具。已经发出的请求继续使用原服务，切换前排队或持有旧工具引用的调用会被拒绝，避免跨服务发送。授权后及恢复已有连接时发现远端工具，成功后注册技能规定的 12 项业务工具。连接发现完成后整体注册这 12 项工具的 schema；每次调用前刷新并验证远端 `inputSchema`，保留 MCP 原始结果。工具 schema 不属于下述 Skill 的逐步加载范围。上传和发送通过官方 `tools/pre-execute` 请求本次执行确认；传输层不自动重放写请求。

## 区域文案与替换位置

技术包名固定为 `3chat-customer-growth`。显示名称、介绍与示例随 DSH 当前生效语言选择对应区域。

| 内容 | 维护位置 | 使用位置 |
|---|---|---|
| 国内／海外名称、介绍、官网与地址 | `src/regions.js`、`src/ui/locale/zh.json`、`en.json` | README、插件详情、面板、授权流程 |
| 插件详情的中英文显示 | `package.json` 的 `meta.title`、`meta.description` 语言映射 | 官方 DSH 插件列表与详情页 |
| 三个对话示例 | 语言文件的 `examplePrompt1`、`examplePrompt2`、`examplePrompt3` | 每条示例各自的复制按钮 |
| 语言监听 | `src/ui/panel.jsx` 的 `locale/change` 订阅 | 将 `ctx.locale.getSnapshot().active` 同步给 Host |
| 连接器选择及隔离 | `src/index.js` | 国内与海外独立授权、状态、工具缓存及请求目标 |

Client 同步当前实际语言；Host 尚未收到 Client 同步时，可以从官方 settings 中读取显式语言偏好。地区切换不会重新授权或删除另一地区的凭据。

## 工具接口

| 能力 | 工具 |
|---|---|
| 查找客户 | `search_3chat_customers` |
| 筛选与分页查询会话 | `search_3chat_conversations` |
| 读取客户记忆与沟通上下文 | `search_3chat_customers_context` |
| 查找群、成员与发送账号 | `search_3chat_groups` |
| 读取群记忆与沟通上下文 | `search_3chat_groups_context` |
| 上传附件 | `upload_3chat_attachment` |
| 向单个客户发送消息 | `send_3chat_customer_message` |
| 向多个客户发送消息 | `send_3chat_customer_messages` |
| 通过 YCloud 发送已审核 WhatsApp 模板 | `send_3chat_customer_whatsapp_template` |
| 向单个群发送消息 | `send_3chat_group_message` |
| 向多个群发送消息 | `send_3chat_group_messages` |
| 查询批次进度与逐项结果 | `get_3chat_batch_send_status` |

参数、筛选字段与限制以远端实时 `inputSchema` 为准。`threechat_connection` 读取本地连接状态，`threechat_check_connection` 执行实时连接检查。

批次返回 `job_id` 后查询原任务；`accepted`、`sent`、`COMPLETED` 描述处理状态，不能据此推断渠道送达、已读或成交。品牌资料与活动素材由用户提供；品牌库检索、订单写入、Agent 配置、定时活动和持续跟进任务控制不属于这些接口。

## Skill 渐进加载与会话上下文

来自 `1.0.4` 的 Skill 与 DSH 所需资源位于 `references/3chat-customer-growth-1.0.4/`，包括图标、Skill 和六份参考，共 8 个文件。原包的 Codex 插件清单、MCP 连接声明和 OpenAI 技能配置已移除。Skill 业务规则、六份参考与图标保持原内容。Skill 中 `3chat-customer-growth` 的逻辑 MCP 名称，由现有 OAuth/Cordis 代理提供的 12 个同名工具满足。

Skill 的声明链为 `dsh.bundle.patch` → `cordis.patch.yml` → `@deepseek-ai/dsh-skill-filesystem`。该行先等待 `inject: [threeChat]`，再计算 `ctx.threeChat.skillRoot`，指向 `references/3chat-customer-growth-1.0.4/skills/`。

宿主提供 `ctx.skills` 和 `dsh-tool-skill`：技能目录向模型展示名称与描述；模型调用 `skill({name})` 后取得 `SKILL.md` 正文和由 `resourceBase` 指明的资源基准目录；六份参考由模型按任务需要使用宿主读取工具读取，不全量注入。目录解析可能读取整个 `SKILL.md`，渐进披露描述的是模型可见上下文，而不是磁盘只读取 frontmatter。见[官方 Skills 说明](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/skills)。

上下文由宿主会话维护：客户查询结果、已选择名单、草稿和后续工具结果沿用同一会话。插件不维护第二套聊天历史。OAuth 回调、令牌交换、凭据保存和界面状态分别处理，取消或卸载时回收监听资源。

## 兼容与验证范围

当前本地依赖验证针对 DSH `0.2.0-rc.2` 系列接口、Cordis `4.0.4`、Schemastery `3.18.4`，运行要求 Node.js `>=22`。原生面板使用 Typert strict descriptor 的 `create`，并在远程服务就绪后注册 `plugins.bundle.config` 插槽；插槽约定见[官方 UI 插件管理说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-plugin-manager/README.md)。

已执行的本地测试覆盖 OAuth、12 项业务工具、执行确认、资源回收和实际 `.tgz` 中的 Cordis 注册。Skill 测试直接调用官方 filesystem provider 和 `ctx.skills.list/get`，验证目录元数据不含正文、正文不内联参考，以及卸载后技能消失。测试使用本地模拟服务。

`skill({name})` 与 `resourceBase` 的宿主加载行为还经过官方契约静态核对。真实模型自动选取 Skill、完整桌面会话、安装、重启、升级及真实渠道发送仍未验收；接口测试通过不代表这些流程已通过。

## 发布范围

本仓库只保存插件源码、构建入口、内置 Skill 和必要文档。最终安装包的运行入口与资源测试在本仓库 `test/` 中执行；静态工具契约样本、测试服务、合成客户、benchmark、抓包、截图和桌面验收证据在独立开发工作区维护。生产代码只使用远端实时工具声明，不包含测试快照、手工回调入口或证据采集接口。

发布前在开发工作区验证代码与最终安装包，再在目标 DSH 桌面版本验收安装、授权、重启和升级。真实渠道发送测试需要使用已授权的测试对象。各区域的 README、插件详情和面板使用对应文案；中文介绍国内渠道，英文介绍海外渠道，两端均以 DeepSeek Harness 插件为入口。


## 社区收录准备

按 [awesome-dsh-plugin 贡献指南](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)，后续提交只需在该仓库新增 `data/plugins/3ChatAI-NCT__3chatai-deepseek-harness-plugin.yml`，不修改它生成的 README。建议条目如下，功能描述限于当前实现：

```yaml
url: https://github.com/3ChatAI-NCT/3chatai-deepseek-harness-plugin
tarball: https://github.com/3ChatAI-NCT/3chatai-deepseek-harness-plugin/releases/latest/download/3chat-customer-growth.tgz
name: 3ChatAI-NCT/3chatai-deepseek-harness-plugin
category: tools
description:
  en: 'Connect DeepSeek Harness to 3Chat for customer and conversation search, context retrieval, confirmed messaging, and batch-send tracking.'
  zh: '将 DeepSeek Harness 接入 3Chat，查询客户与会话、读取上下文、确认后发送消息并跟踪批次结果。'
```

本地已有 `dsh.bundle`、对应 patch、真实运行代码及官方包的 peerDependencies。条目指向固定文件名的最新 Release 附件；每次发布仍需先验证最终 `.tgz`。当前宿主的远程 tarball 缓存问题未修复，社区条目的直接 URL 安装仍有该限制；用户安装按上述本地文件流程执行。

提交前将这次源码与文档同步到目标仓库，添加 `dsh-plugin` topic，并确认仓库创建满一天、仍在维护且未被重复收录。社区 CI 与维护者审核由对方执行。本地测试范围见上文，目标 DSH 桌面安装与真实渠道流程仍需验收。

## CI 与标签发布

PR 和 main 更新运行 CI / check：检查已跟踪文件、扫描 Git 历史与源码中的秘密，执行 npm ci、npm run pack 与 npm test，验证最终安装包入口、界面模块、多语言资源与 Skill 后，保存安装包与 SHA256 校验文件。CI 不执行真实渠道发送；桌面验收范围仍按上文执行。

先将版本变更合入 main 并确认 CI 通过，再推送与 package.json 一致的 v<version> 标签。Release 要求标签提交属于 main，重新完成同样检查后发布 3chat-customer-growth.tgz、SHA256SUMS 和记录源码提交的 source.json。含预发布后缀的版本标记为 prerelease；未推送标签时不会发布。不要移动已发布标签，修订使用新版本。

Actions 固定完整提交 SHA；构建只有读取权限，checkout 不保存凭据。仅发布任务拥有 contents: write，下载已验证构件、核对校验和并发布，不执行项目源码或安装依赖。秘密扫描器固定版本和下载哈希，并先检测合成凭据确认有效。
