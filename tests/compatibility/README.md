# tests/compatibility/

宿主兼容性测试套件（设计文档 §39 Integration 部分、§41–§42）。

## 已落地

- **`dsh-bundle.test.ts`**（✅ 通过）：加载**真实构建产物** `packages/dsh/lib/client.js`（DSH ModuleLoader bundle）到模拟浏览器沙箱，端到端验证：
  - `window.__ModuleLoader__.load({ id: "@petwhale/dsh", factory })` handoff 与导出面（`inject` / `apply`）；
  - `apply(mockCtx)` → `slots.register` 注册 `shell.overlay` / `petwhale` 条目；
  - mock sessions 推入会话快照 → source → engine 状态：idle → thinking → working → success；
  - 插件 teardown 正确释放。
  - 前置条件：先 `pnpm build`（bundle 是构建产物；缺失时测试自动跳过）。

## 计划（接入真实宿主后）

- **DSH + PetWhale**：插件 ACTIVE → `shell.overlay` → PetWhale 挂载 → Agent 工作时进入 `working`。
- **Telos + 同一个 `@petwhale/dsh`**：不修改 PetWhale 代码，显示同一个 Orb。
- **CI 兼容策略**：
  - Pinned DSH（0.1.0-rc.5）失败 → **BLOCK RELEASE**
  - DSH master 失败 → Warning + 自动创建 compatibility issue
