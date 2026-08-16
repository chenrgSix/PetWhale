# PetWhale

> **Visual companions for AI agents.**

PetWhale 是一个面向 AI Agent 的可插拔视觉伴侣框架：把 Agent Runtime 的运行状态转换成可视化角色行为，并支持 DeepSeek Harness、Telos 以及未来其他 Agent Runtime。它不是一个 Live2D 封装库，也不是某个宿主专属插件。

```
Agent Runtime (DeepSeek Harness / Telos)
      │  状态 / 事件
      ▼
┌────────────────────┐
│  Host Adapter      │   DshCompanionSource
└─────────┬──────────┘
          │  semantic state  (idle / thinking / answering / working / waiting / success / error / sleeping)
          ▼
┌────────────────────┐
│   @petwhale/core   │   State Resolver → Behavior Scheduler → Companion Engine
└─────────┬──────────┘
          │  CompanionSnapshot
          ▼
┌────────────────────┐
│     Renderers      │   Orb ✅  Sprite · Live2D (planned)
└─────────┬──────────┘
          ▼
     Visual Pet  (shell.overlay)
```

## 当前状态

**M0 — Foundation（0.0.1）** ✅ · **M2 — DSH Plugin** ✅ · **M3 — Agent State Mapping** ✅ · **M5 — Settings** ✅ · **M6 — Sprite** ✅

| 包 | 状态 |
| --- | --- |
| `@petwhale/core` | ✅ TypeScript-only，零依赖，无 DOM |
| `@petwhale/renderer-orb` | ✅ Canvas Orb MVP（8 种状态动画） |
| `@petwhale/renderer-sprite` | ✅ PNG/WebP/APNG 图片宠物渲染器；内置蓝色小鲸与橘色小猫 |
| `@petwhale/dsh` | ✅ shell.overlay 插件（真实 DSH ModuleLoader bundle）+ ctx.sessions 状态映射 + settings.section 设置页（启用/宠物/位置/缩放/动画/入睡，localStorage 持久化、实时生效）+ 拖动（M9） |
| `@petwhale/pet-window` | ✅ 桌面桌宠窗口（Electron）：透明、无边框、置顶、可拖动；托盘即时更换宠物；主进程自动发现 DSH 端口（动态）并订阅 host 事件流 |
| `@petwhale/playground` | ✅ Vite 演示 |

里程碑：M0 Foundation ✅ → M1 Orb ✅ → M2 DSH Plugin ✅ → M3 Agent State Mapping ✅ → M4 Telos（roster 集成）→ M5 Settings ✅ → M6 Sprite ✅ → M7 Live2D Experimental → M8 Live2D Host → M9 Interaction → M10 Voice（详见 `项目设计说明.md` §47）。

## Monorepo

- **pnpm** + **TypeScript** + **Vitest** + **tsdown** + **Changesets** + **GitHub Actions**

```
packages/
├── core/          @petwhale/core          语义层（无宿主、无渲染器、无 DOM）
├── renderer-orb/  @petwhale/renderer-orb  Canvas Orb 渲染器
├── renderer-sprite/ @petwhale/renderer-sprite PNG/WebP/APNG 宠物渲染器
└── dsh/           @petwhale/dsh           DeepSeek Harness / Telos 客户端插件
apps/
└── playground/    Vite 演示（MockSource 驱动）
vendor/deepseek-harness/   固定的 DSH Git Submodule（构建 @petwhale/dsh 时使用）
integrations/              未来宿主集成说明
tests/compatibility/       DSH / Telos 兼容性测试
```

## 快速开始

需要 Node ≥ 20 与 pnpm（`corepack enable` 或 `npm i -g pnpm`）。

```bash
pnpm install        # 依赖已装好
pnpm test           # 单测 + bundle 兼容门（兼容门需要先 pnpm build）
pnpm typecheck && pnpm build
pnpm playground     # http://localhost:5173 预览 Orb
pnpm pet            # 桌面桌宠窗口（macOS / Windows，透明、置顶、可拖动）
pnpm pet:package:mac # 构建 macOS Universal .app（Intel + Apple Silicon）
```

macOS 本地打包产物位于 `apps/pet-window/release/PetWhale-darwin-universal/`，使用 ad-hoc 签名，适合本地运行与开发验证；对外分发仍需配置 Apple Developer ID 签名与 notarization。

Playground 里可以手动切换 8 种状态 / 6 种情绪 / 触发动作，也可以运行一段脚本化的「agent 故事」（思考 → 工具 → 回答 → 成功 → 空闲），直接观察 Scheduler 的抖动过滤与 transient 保持。

## @petwhale/pet-window（桌面桌宠）

独立 Electron 小窗（**透明、无边框、置顶、可拖动**），软件最小化/切到后台时宠物仍显示在前台——经典桌宠形态：

- **平台支持**：macOS（Intel + Apple Silicon）与 Windows；macOS 以菜单栏应用运行，不显示多余的 Dock 图标。
- **状态来源**：主进程自动发现 DSH Web 端口（macOS 使用 `lsof`、Windows 使用 `netstat`，再做 `__DSH_BOOT__` 签名探测），用 Node WebSocket 订阅 `ws://127.0.0.1:<port>/api/events.host`（DSH 拒绝浏览器 `file://` Origin，所以连接放主进程、通过 IPC 转发到渲染器）。
- **状态映射**：`PetStateTracker`（共享模块）——`host/session-status` running → thinking / working、`host/agent-error` → error、运行结束 → success transient；agent 干活时 Orb 会动起来。
- **交互**：整窗可拖动，位置持久化（`userData/pet-position.json`）；右键 → 退出菜单。
- **更换宠物**：托盘菜单 →「更换宠物」可在能量球、蓝色小鲸、橘色小猫之间即时切换并持久化。
- **自检**：`PETWINDOW_SELF_TEST=1 pnpm pet` 会打开窗口、采样 Orb 像素与连接状态、把结果写到 `userData/petwhale-self-test.json` 后自动退出。

## @petwhale/dsh（M2 + M3 + M5 + M9）

- **插件入口**：`inject: ['slots', 'sessions']` + `apply(ctx)`，通过 `ctx.slots.inject('shell.overlay', ...)` 注册 `id: 'petwhale'` 的浮层条目（设计文档 §17 的官方规则）。
- **类型**：按 DeepSeek Harness **0.1.0-rc.5** 的真实 API 以环境模块声明（`src/client/types/dsh.d.ts`）镜像；源码按真实插件风格从 `@deepseek-ai/dsh-client-runtime/client` 导入类型。仓库自包含可编译；接入真实包时 TypeScript 自动使用真实类型。
- **状态映射**：`DshCompanionSource` 订阅 `ctx.sessions.list` → 当前会话 `binding.session`（`ObservableSnapshot<ConversationSnapshot>`）→ `composeSnapshot`（推理→thinking、工具→working、等待→waiting、错误→error、完成→success transient）。
- **bundle**：`pnpm --filter @petwhale/dsh build` 产出 DSH ModuleLoader 格式的 `lib/client.js`（`window.__ModuleLoader__.load({ id: "@petwhale/dsh", factory })`，react 等平台模块 external，core/orb 内联），可直接作为 `/plugins/@petwhale/dsh/client.js` 供给运行时。
- **设置（M5）**：`settings.section` 页面（启用 / 渲染器 / 位置 / 缩放 / 动画 / 空闲入睡），localStorage 持久化；共享 `PreferencesStore` 让设置实时作用于运行中的 Orb（缩放/动画重新挂载渲染器、入睡时长热更新调度器策略、位置移动浮层、禁用则隐藏宠物）。
- **兼容门**：`tests/compatibility/dsh-bundle.test.ts` 在模拟浏览器沙箱中加载真实 bundle，端到端验证注册与状态管线（先 `pnpm build` 再 `pnpm test` 生效）。
- **安装到宿主（M4 准备）**：`node scripts/install-dsh-local.mjs` 把构建产物复制进 web profile 的 node_modules、向 `cordis.patch.yml` 追加插件行、声明依赖 —— 默认 dry-run，`--apply` 才写入（自动备份）。

## Compatibility

| 宿主 | 版本 | 状态 |
| --- | --- | --- |
| DeepSeek Harness | 0.1.0-rc.5 | ✅ 目标版本（M2/M3 接线验证） |
| Telos | 3a159a8 | ✅ 目标版本（M4） |

> 注意：npm 上发布的 `@deepseek-ai/dsh-client-*@0.0.1-rc.1` 早于 `shell.overlay`；`@petwhale/dsh` 面向 0.1.0-rc.5 的真实 API 编写（见 `vendor/` 与 `packages/dsh/src/client/types/dsh.d.ts`）。

## 架构规则

`ARCHITECTURE.md` 收录了项目最重要的六条规则（Core 不知道 Hosts、Core 不知道 Renderers、Host 只发语义、Renderer 只收语义、PetWhale 不拥有 Agent 业务状态、一个 Host 包服务于所有兼容宿主）。**任何新代码都必须遵守。**

## License

[MIT](./LICENSE)
