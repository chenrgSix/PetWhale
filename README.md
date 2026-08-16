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

**M0 — Foundation（0.0.1）**：Monorepo、Core 契约、Engine、Scheduler、测试、Playground。

| 包 | 状态 |
| --- | --- |
| `@petwhale/core` | ✅ TypeScript-only，零依赖，无 DOM |
| `@petwhale/renderer-orb` | ✅ Canvas Orb MVP（8 种状态动画） |
| `@petwhale/dsh` | 🚧 骨架：插件入口 + 状态映射逻辑（真实 DSH 接线在 M2/M3） |
| `@petwhale/playground` | ✅ Vite 演示 |

里程碑：M0 Foundation → M1 Orb → M2 DSH Plugin → M3 Agent State Mapping → M4 Telos → M5 Settings → M6 Sprite → M7 Live2D Experimental → M8 Live2D Host → M9 Interaction → M10 Voice（详见 `项目设计说明.md` §47）。

## Monorepo

- **pnpm** + **TypeScript** + **Vitest** + **tsdown** + **Changesets** + **GitHub Actions**

```
packages/
├── core/          @petwhale/core          语义层（无宿主、无渲染器、无 DOM）
├── renderer-orb/  @petwhale/renderer-orb  Canvas Orb 渲染器
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
pnpm install
pnpm test          # vitest 单测
pnpm typecheck     # 全包 tsc --noEmit
pnpm build         # tsdown 构建三个 package 到 lib/
pnpm playground    # 启动 Vite 演示（http://localhost:5173）
```

Playground 里可以手动切换 8 种状态 / 6 种情绪 / 触发动作，也可以运行一段脚本化的「agent 故事」（思考 → 工具 → 回答 → 成功 → 空闲），直接观察 Scheduler 的抖动过滤与 transient 保持。

## Compatibility

| 宿主 | 版本 | 状态 |
| --- | --- | --- |
| DeepSeek Harness | 0.1.0-rc.5 | ✅ 目标版本（M2/M3 接线验证） |
| Telos | 3a159a8 | ✅ 目标版本（M4） |

> 注意：npm 上发布的 `@deepseek-ai/dsh-client-*@0.0.1-rc.1` 早于 `shell.overlay`；`@petwhale/dsh` 面向 0.1.0-rc.5 的真实 API 编写（见 `vendor/` 与 `packages/dsh/src/client/types/dsh-compat.ts`）。

## 架构规则

`ARCHITECTURE.md` 收录了项目最重要的六条规则（Core 不知道 Hosts、Core 不知道 Renderers、Host 只发语义、Renderer 只收语义、PetWhale 不拥有 Agent 业务状态、一个 Host 包服务于所有兼容宿主）。**任何新代码都必须遵守。**

## License

[MIT](./LICENSE)
