# Live2D 模型包

PetWhale 桌面端支持导入 Cubism 3/4/5 的 ZIP 运行时模型包。它不接受 Cubism Editor 的 `.cmo3` 源文件，也不会执行模型包中的 JavaScript。

## 必要文件

ZIP 中必须有且只能自动识别一个 `*.model3.json`；如果包含多个入口，需要在根目录 `petwhale.json` 中明确指定 `entry`。模型入口必须引用：

- 一个 `.moc3` 模型；
- 至少一张 PNG 纹理；
- `.model3.json` 中声明的所有 motion、expression、physics、pose、display info、user data、motion sync 和音频资源。

导入器按 ZIP 内容签名校验文件，不依赖 ZIP 扩展名。模型包最大 100 MB，解压后最大 250 MB，单文件最大 64 MB，最多 2048 个文件。加密、分卷、ZIP64、符号链接、目录穿越、绝对路径、外部 URL 和 Windows 非法路径会被拒绝。

## Agent 状态动作映射

在 ZIP 根目录加入可选的 `petwhale.json`：

```json
{
  "name": "My Assistant",
  "entry": "model/MyAssistant.model3.json",
  "motions": {
    "idle": { "group": "Idle", "index": 0, "loop": true },
    "thinking": { "group": "Thinking", "loop": true },
    "answering": { "group": "Talking", "loop": true },
    "working": { "group": "Working", "loop": true },
    "waiting": { "group": "Waiting", "loop": true },
    "success": { "group": "Happy", "index": 0 },
    "error": { "group": "Sad", "index": 0 },
    "sleeping": { "group": "Sleep", "loop": true }
  }
}
```

动作组必须真实存在于 `.model3.json` 的 `FileReferences.Motions` 中，`index` 从 0 开始且不能越界。省略 `index` 时由 Live2D Renderer 从动作组中选择动作。省略映射时，导入器会尝试识别常见的 `Idle`、`Thinking`、`Talking`、`Working`、`Waiting`、`Happy`、`Sad` 和 `Sleep` 组；某个状态仍未匹配时会回退到 `idle`。

## 导入与删除

在桌面托盘菜单选择：

```text
更换宠物 → 导入 Live2D 宠物…
```

模型会被安全解压到应用的 `userData/custom-pets/`，原始 ZIP 不会被修改。删除自定义宠物只删除 PetWhale 保存的副本。

## 运行时与许可

PetWhale 仓库和安装包不包含 Live2D Cubism Core。首次导入 Live2D 宠物时，应用要求用户确认 Live2D Proprietary Software License Agreement 与 Live2D Open Software License Agreement；之后从 Live2D 官方固定的 Cubism 5.3 hosting URL 加载 Core。

允许最终用户导入任意 Live2D 模型的产品可能属于 Live2D 所定义的 Expandable Application。对外发布前，产品发布者必须自行确认并完成适用的 SDK Release License、专项审核以及模型素材授权。PetWhale 的确认界面不能替代发布者的许可义务。
