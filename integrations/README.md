# integrations/

宿主集成。

| 宿主 | 集成包 | 里程碑 | 说明 |
| --- | --- | --- | --- |
| DeepSeek Harness | `@petwhale/dsh` | M2 / M3 | 官方 `shell.overlay` 槽位 + `ctx.sessions` 快照（无需修改 DSH） |
| Telos | `@petwhale/dsh`（同一个包） | M4 | Telos 保留 DSH 的 sidebar/conversation/details/shell.overlay 与完整 runtime/slots，因此直接复用 DSH 插件，只需要薄 PR：dependency + 插件安装 + roster |

Telos 集成边界（设计文档 §22）：Telos 侧只改「插件安装 + DSH roster」，不改 `TelosAppFrame`、不改 DeepSeek Harness submodule、不改 PetWhale 业务代码。
