# PetWhale Architecture

PetWhale 解决的问题不是「怎么在页面里显示一个 Live2D」，而是**如何建立 Agent Runtime 和视觉角色之间稳定、通用、可扩展的语义层**：

```
Agent Runtime（DeepSeek Harness / Telos / future Codex / Claude …）
      │  assistant/chunk · tool/call · tool/result · turn/start · turn/end …
      ▼
Host Adapter（DshCompanionSource）
      │  统一转换成：idle / thinking / answering / working / waiting / success / error / sleeping
      ▼
@petwhale/core —— State Resolver → Behavior Scheduler → Companion Engine
      │  CompanionSnapshot { state, emotion, since, activity?, context? }
      ▼
Renderers —— Orb（MVP）· Sprite · Live2D · Rive / VRM / 3D …
      ▼
Visual Surface（DSH shell.overlay / Telos）
```

## 数据流

```text
DSH
  ↓ ctx.sessions / ConversationSnapshot
DshCompanionSource（Host Adapter）
  ↓ CompanionSnapshot
@petwhale/core
  ├── State Resolver：优先级 + transient 语义
  ├── Behavior Scheduler：debounce / 最短展示 / success·error 保持 / idle→sleeping
  └── Companion Engine：Source → Scheduler → Renderer 生命周期
  ↓ effective CompanionSnapshot
OrbRenderer / SpriteRenderer / Live2DRenderer
  ↓
shell.overlay 中的 Visual Pet
```

## 六条架构规则

### Rule 1 — Core does not know Hosts

`@petwhale/core` 不允许 `import '@deepseek-ai/...'`，不允许任何宿主类型。DSH 适配逻辑全部在 `@petwhale/dsh`。

### Rule 2 — Core does not know Renderers

Core 不能出现 `if (renderer === 'live2d')`。渲染器通过 `CompanionRenderer` 接口接入，替换渲染器不触碰 Core。

### Rule 3 — Hosts emit semantics, not visuals

DSH Adapter 输出 `working`，绝不输出 `playMotion("Typing01")`。

### Rule 4 — Renderers consume semantics, not Agent events

Live2D 不知道 `tool/call`、`assistant/chunk`；它只读 `CompanionSnapshot`。

### Rule 5 — PetWhale never owns Agent business state

Session 的真实状态永远属于 Agent Runtime；PetWhale 只是 Projection。CompanionSource 只读快照，不写回。

### Rule 6 — One host package should work across compatible hosts

目标始终是：同一个 `@petwhale/dsh`，DeepSeek Harness ✅ Telos ✅。除非未来 Telos 出现真正独立的 Companion API，否则不拆 `@petwhale/telos`。

## 成功标准（MVP）

同一个 `@petwhale/dsh` 装到 DeepSeek Harness 显示 Orb、Agent 工作时进入 `working`；再装到 Telos，不修改 PetWhale 代码，显示同一个 Orb、同样进入 `working`。做到这一点，PetWhale 就是一个真正的 Agent Companion Plugin Framework。

## 边界

Core 只负责 `Agent State → Visual Behavior`。以下全部**不属于** PetWhale V1：Agent 推理、LLM 调用、Prompt 管理、Tool 执行、Session 存储、TTS/ASR、模型商城、Live2D 模型编辑、VTuber 面捕。
