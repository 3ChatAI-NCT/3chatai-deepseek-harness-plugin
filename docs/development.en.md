# Development guide

[中文](development.md) · [English](development.en.md) · [Product guide](../README.en.md)

## Install the prebuilt Release

Download the prebuilt package from the latest stable GitHub Release:

```text
https://github.com/3ChatAI-NCT/3chatai-deepseek-harness-plugin/releases/latest/download/3chat-customer-growth.tgz
```

Download and keep the `.tgz` file in your browser, then paste its full path into the official DSH **Plugins → Add plugin** dialog, for example `/Users/your-name/Downloads/3chat-customer-growth.tgz`. No source compilation is needed. DSH does not currently auto-update plugins; to upgrade, uninstall, download the new package, and install it.

The pnpm 11.7.0 bundled with DSH 0.2.0-rc.2 can write a lock entry without integrity when reusing a remote tarball cache, causing a later installation to fail with `ERR_PNPM_MISSING_TARBALL_INTEGRITY`. Pinned release URLs are also affected. Installing a local `.tgz` avoids this path without deleting user lockfiles, clearing caches, or disabling integrity checks. Repeated local installation has been verified; remote installation and cached reinstallation passed on the official source build of DSH 0.2.1-alpha.2 with pnpm 11.28.5. Older hosts can keep using local archives.

## Build from source

Use Node.js 22 or later. Run from this repository's root:

```sh
npm ci
npm run pack
```

The build entry point is `scripts/build.mjs`; packaging uses `scripts/pack.mjs`. Compiled files go into `dist/`, and the archive is `dist/3chat-customer-growth-2.1.2.tgz`. End users install the prebuilt `.tgz`. Runtime `exports` in `package.json` point to `dist/`.

Only prebuilt `.tgz` installation is currently supported. Git excludes `dist/`, and the repository has no `prepare` script, so direct source installation with `dsh plugin add github:…` is unsupported. Use `npm run pack` above to compile before packaging; `npm pack` alone does not compile the source. This follows the [official packaging guide](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish) distinction between source and prebuilt distributions.

The archive contains runtime code, the bundled skill, bilingual documentation, and license files, with no install-time scripts. Cordis, Schemastery, Typert, and React use host-provided modules. Runtime peer ranges are `*`, with no DSH version restriction. `devDependencies` pin only the build and test environment and are removed during packaging. Official DSH owns installation and loading checks. Restart DSH after updating Host modules.

## Directory responsibilities

```text
src/          Runtime code: entry point, connection, tools, OAuth, and UI
references/   Skill and supporting resources, with a single source copy
scripts/      Build, packaging, and Skill integrity checks
docs/         Bilingual usage and development documentation
dist/         Compiled JS, locales, third-party notices, and tgz; ignored by Git
```

`src/regions.js` defines regional endpoints, credential keys, and copy; `src/index.js` registers the service, `src/connection.js` manages the connection and MCP calls, and `src/tools.js` exposes tools to the assistant. OAuth lives in `src/oauth/`; the native panel and translations live in `src/ui/`. The shared UI protocol is in `src/protocol.js`, and live input validation is in `src/tool-schema.js`.

Building generates runtime files without copying the README or Skill. Packaging assembles the installation archive in a system temporary directory and removes that directory afterwards. The workspace therefore has one Skill source, and the archive includes the same source content.

## Cordis service and consumers

The `dsh.bundle.patch` entry in `package.json` points to `cordis.patch.yml`, whose rows insert the service provider plugin, tool consumer, and official filesystem Skill provider separately. `ThreeChatService` defines and provides `threeChat`; the tool consumer declares its dependencies, while the panel accesses that same connection through Typert. The service, tools, and Skill provider load separately as their dependencies become available. Disposal releases their registrations, subscriptions, and connection resources.

The panel and conversation tools share the connection selected by the active DSH language. Chinese (`zh`) selects `https://app.3chatai.cn/mcp`, with [3Chat China](https://www.3chatai.cn/) as its website; other languages select `https://app.3chat.ai/mcp`, with [3Chat Global](https://3chat.ai) as its website. DSH credentials stores separate grants under `threechat-mcp/oauth` and `threechat-global/oauth`, preserving the existing domestic slot. Language changes select a connection and its tools without starting authorization; existing grants can restore connections and discover tools. Requests already issued finish against their original service. Queued calls and stale tool references from before a switch are refused to prevent cross-service sends. Discovery runs after authorization and when restoring an existing connection; successful discovery registers only supported business tools currently available with valid schemas. Missing capabilities do not prevent the remaining tools from working. Every call refreshes and validates the remote `inputSchema` and preserves the original MCP result. Tool schemas are separate from the progressive Skill loading described below. Uploads and sends request approval through the official `tools/pre-execute` hook. The transport does not automatically replay writes.

## Regional copy and replacement locations

The technical package name stays `3chat-customer-growth`. Display names, descriptions, and examples follow the active DSH language and its selected region.

| Content | Maintained in | Used by |
|---|---|---|
| Regional names, descriptions, websites, and endpoints | `src/regions.js`, `src/ui/locale/zh.json`, `en.json` | READMEs, plugin details, panel, and authorization |
| Localized package presentation | `meta.title` and `meta.description` maps in `package.json` | Official DSH plugin list and detail page |
| Three conversation examples | `examplePrompt1`, `examplePrompt2`, and `examplePrompt3` in locale files | A separate copy button for each example |
| Locale monitoring | `locale/change` subscription in `src/ui/panel.jsx` | Synchronizes `ctx.locale.getSnapshot().active` with the Host |
| Connector selection and isolation | `src/index.js` | Separate grants, state, tool caches, and request targets |

The Client synchronizes its resolved active language. Before receiving Client synchronization, the Host can read an explicit language preference from official settings. Switching regions neither reauthorizes nor deletes the other region’s credentials.

## Tool interfaces

| Capability | Tool |
|---|---|
| Find customers | `search_3chat_customers` |
| Filter and paginate conversations | `search_3chat_conversations` |
| Read customer memory and conversation context | `search_3chat_customers_context` |
| Find groups, members, and sender accounts | `search_3chat_groups` |
| Read group memory and conversation context | `search_3chat_groups_context` |
| Upload attachments | `upload_3chat_attachment` |
| Send to one customer | `send_3chat_customer_message` |
| Send to multiple customers | `send_3chat_customer_messages` |
| Send approved WhatsApp templates through YCloud | `send_3chat_customer_whatsapp_template` |
| Send to one group | `send_3chat_group_message` |
| Send to multiple groups | `send_3chat_group_messages` |
| Track batch progress and item results | `get_3chat_batch_send_status` |

Parameters, filters, and limits follow the remote tool's live `inputSchema`. `threechat_connection` reads local connection state; `threechat_check_connection` checks live availability.

Once a batch returns a `job_id`, query that original job. `accepted`, `sent`, and `COMPLETED` describe processing status, not channel delivery, read receipts, or purchases. Users supply brand and campaign materials; these interfaces do not manage brand-library retrieval, order writes, Agent configuration, scheduled campaigns, or ongoing follow-up tasks.

## Progressive Skill loading and session context

The skill and DSH resources from `1.0.4` live under `references/3chat-customer-growth-1.0.4/`: the icon, skill, and six references (8 files). The original Codex plugin manifest, MCP connection declaration, and OpenAI skill configuration have been removed. The business rules, references, and icon retain their contents. The logical MCP name `3chat-customer-growth` is served by the 12 identically named tools exposed through the OAuth/Cordis proxy.

The declaration chain is `dsh.bundle.patch` → `cordis.patch.yml` → `@deepseek-ai/dsh-skill-filesystem`. That row waits for `inject: [threeChat]` before evaluating `ctx.threeChat.skillRoot`, which points to `references/3chat-customer-growth-1.0.4/skills/`.

The host supplies `ctx.skills` and `dsh-tool-skill`. The catalog exposes names and descriptions to the model. Calling `skill({name})` returns the `SKILL.md` body and the resource base directory described by `resourceBase`; the model then reads any of the six references it needs through host file-reading tools, rather than receiving all references at once. Catalog parsing may read the entire `SKILL.md`; progressive disclosure describes model-visible context, not frontmatter-only disk access. See the [official Skills reference](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/skills).

The host session maintains continuity across customer results, selected recipients, drafts, and subsequent tool results. The plugin does not maintain a second chat history. OAuth callback receipt, token exchange, credential storage, and UI state are handled separately; cancellation and disposal reclaim listener resources.

## Compatibility and verification scope

Development dependencies pin the build and test baseline without restricting the user’s DSH version. The runtime requires Node.js `>=22`. The native panel uses `create` in Typert strict descriptors and registers the `plugins.bundle.config` slot after the remote service becomes available. See the [official UI plugin manager guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-plugin-manager/README.md) for the slot contract.

Executed local tests cover OAuth, the 12 business tools, execution approval, resource cleanup, and Cordis registration from the actual `.tgz`. Skill tests call the official filesystem provider and `ctx.skills.list/get` directly, checking that catalog metadata excludes the body, the body does not inline references, and disposal removes the skill. These tests use a local mock server.

The host loading contract for `skill({name})` and `resourceBase` has also been checked statically against official documentation. On 2026-10-10, plugin 2.1.2 passed installation, same-URL cached reinstallation, activation, and one real read-only model query after Skill loading in each language on the official source build of DSH 0.2.1-alpha.2. Both services returned code 200 and total 0. These desktop results refer to the prior CI artifact; subsequent source changes receive separate local regression checks. Real-channel sending and a separate restart regression remain unverified.

## Release scope

This repository contains only plugin source, build entry points, the bundled skill, and essential documentation. Final-package entry and resource tests run from this repository’s `test/` directory. Static tool fixtures, mock services, synthetic customers, benchmarks, captures, screenshots, and desktop acceptance evidence live in a separate development workspace. Production code uses only live remote tool definitions and contains no test snapshots, manual callback entry points, or evidence collection hooks.

Before release, verify source and the final package in that workspace, then check installation, authorization, restart, and upgrade on the target DSH desktop version. Use authorized test recipients for real-channel send tests. Keep each regional README, plugin description, and panel copy aligned. Chinese material describes domestic channels and English material describes global channels; both use DeepSeek Harness as the plugin entry point.


## Community listing preparation

The [awesome-dsh-plugin contribution guide](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md) asks for a single entry file, `data/plugins/3ChatAI-NCT__3chatai-deepseek-harness-plugin.yml`, in that repository. Leave its generated READMEs alone. Use a description limited to current functionality:

```yaml
url: https://github.com/3ChatAI-NCT/3chatai-deepseek-harness-plugin
tarball: https://github.com/3ChatAI-NCT/3chatai-deepseek-harness-plugin/releases/latest/download/3chat-customer-growth.tgz
name: 3ChatAI-NCT/3chatai-deepseek-harness-plugin
category: tools
description:
  en: 'Connect DeepSeek Harness to 3Chat for customer and conversation search, context retrieval, confirmed messaging, and batch-send tracking.'
  zh: '将 DeepSeek Harness 接入 3Chat，查询客户与会话、读取上下文、确认后发送消息并跟踪批次结果。'
```

The local project has `dsh.bundle`, its patch, working code, and official packages declared as peer dependencies. The entry points to the latest Release asset with its stable filename; verify the final `.tgz` before every release. Older hosts have the remote cache limitation described above. Remote installation passed on the upgraded host; downloading and importing a local archive also remains available.

Before submitting, publish the updated source and documentation to the target repository, add the `dsh-plugin` topic, and check that the repository is at least a day old, actively maintained, and not already listed. Community CI and maintainer review happen on their side. Local verification scope is described above; future versions need target-host checks; real-channel sending remains unverified.

## CI and tag releases

Pull requests and main updates run CI / check: validate tracked paths, scan Git history and source for secrets, run npm ci, npm run pack, and npm test to verify the final package entries, client module, locales, and Skill resources, then upload the package with SHA256 checksums. CI does not send real messages; desktop acceptance remains as described above.

Merge the version update into main and confirm CI passes before pushing a v<version> tag matching package.json. Release requires the tagged commit to belong to main, repeats the checks, and publishes 3chat-customer-growth.tgz, SHA256SUMS, and source.json identifying the source commit. Versions with a prerelease suffix are marked as prereleases. No tag means no release. Use a new version instead of moving a published tag.

Actions are pinned to full commit SHAs. Build jobs have read-only permissions and checkout does not persist credentials. Only publication has contents: write; it downloads verified assets, checks hashes, and publishes without executing project code or installing dependencies. The scanner is pinned by version and download hash and tests a synthetic credential first.

Register only supported business tools currently available from the server with valid parameter schemas. A missing or invalid tool affects only that capability; an empty catalog keeps connection controls available. A stale call returns TOOL_UNAVAILABLE without dispatching a business request, retrying automatically, or exiting the plugin.

Standard `npm pack` builds runtime entries through `prepack`. `npm run pack` uses the same build hook and stages a Release archive without development metadata. Both must include every declared runtime entry.
