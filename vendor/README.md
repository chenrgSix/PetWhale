# vendor/

第三方/上游固定版本目录。

## deepseek-harness（Git Submodule）

`vendor/deepseek-harness` 是指向 [deepseek-ai/DeepSeek-Harness](https://github.com/deepseek-ai/DeepSeek-Harness) 的固定 Git Submodule（设计文档 §24）。

- CI 构建 `@petwhale/dsh` 时复用其官方 tsdown preset（React/Cordis/DSH platform modules external、CSS module injection、plugin unload cleanup 等）。
- **发布到 npm 的 `@petwhale/dsh` 不包含此 submodule**——最终用户只需要 `lib/client.js`。

### 为什么必须 vendor

npm 上发布的 `@deepseek-ai/dsh-client-runtime` / `@deepseek-ai/dsh-client-ui-layout` 目前是 `0.0.1-rc.1`，早于 `shell.overlay` 槽位的引入；DeepSeek Harness Web 与 Telos 实际运行的是 **0.1.0-rc.5**（`shell.overlay` 存在，`kind: 'list'`、`scope: 'root'`）。因此 PetWhale 的类型与构建必须锚定到 checkout 内版本，而不是 npm 上滞后的发布。

### 使用

```bash
git submodule update --init --recursive
```

已克隆的 checkout 同时提供：官方客户端插件构建 preset（`packages/client/tsdown.client.ts`，`@petwhale/dsh` 的 tsdown 配置是对其忠实移植）与 0.1.0-rc.5 的真实 API 源码。`@petwhale/dsh` 的类型则以 `src/client/types/dsh.d.ts` 的环境模块声明镜像 0.1.0-rc.5 表面——仓库自包含可编译，接入真实包时 TypeScript 自动使用真实类型。
