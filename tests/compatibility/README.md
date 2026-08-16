# tests/compatibility/

宿主兼容性测试套件（设计文档 §39  Integration 部分、§41–§42）。

计划内容：

- **DSH + PetWhale**：插件 ACTIVE → `shell.overlay` → PetWhale 挂载 → Agent 工作时进入 `working`。
- **Telos + 同一个 `@petwhale/dsh`**：不修改 PetWhale 代码，显示同一个 Orb。
- **CI 兼容策略**：
  - Pinned DSH（0.1.0-rc.5）失败 → **BLOCK RELEASE**
  - DSH master 失败 → Warning + 自动创建 compatibility issue

M2/M3 接入真实 DSH checkout 后落地。
