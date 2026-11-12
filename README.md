# dsh-session-folders

在 DSH 工作区中，为每个会话的首次对话自动创建一个独立子文件夹，并让该会话产生的文件默认保存到该文件夹中；支持按工作区开启或关闭，也支持新会话继承旧会话已有的文件夹。

A DeepSeek Harness plugin that creates a summary-named subfolder for each session in a workspace on the session's first conversation and lets a new session inherit an existing session folder. Can be toggled per workspace.

## 功能 / Features

- **按工作区开启 / Per-workspace toggle**：每个工作区单独开关，已有工作区默认关闭。
- **新建工作区询问 / Ask on new workspace**：新建工作区后弹出询问框，可选择立即启用或暂不启用。
- **会话目录 / Session folder**：开启后，会话的首次对话会在工作区下创建一个以首条消息摘要命名的文件夹（中文最多 10 个字，英文按单词边界截短），该会话后续的文件操作默认以该目录为工作目录。
- **继承文件夹 / Inherit folder**：在已有会话的标题栏点击「继承文件夹」，会在同一工作区新建一个会话并让它复用当前会话的文件夹；不复制文件、不迁移对话内容。
- **同名处理 / Collision handling**：同一工作区中摘要名相同时自动使用 `_1`、`_2` 等后缀；创建目录采用原子操作，避免并发重名。
- **随时修改 / Change anytime**：在「设置 → 会话文件夹」中查看所有工作区并切换开关，也可在插件配置页操作。

## 安装 / Install

从 GitHub 安装：

```sh
dsh plugin --profile <profile> add github:DieJob/dsh-session-folders
```

或在本机 DSH 插件管理（Settings → Plugins）里从 GitHub 源安装；也可以在插件市场的「发现 / Discover」中搜索 **dsh-session-folders** 一键安装。

安装后重启或刷新 DSH。本插件为纯 JavaScript，无需构建步骤。

## 状态文件 / State

插件将按工作区开关、文件夹实体、会话到文件夹的映射以及待继承记录保存在当前 profile 目录下的 `dsh-session-folders.state.json`。

状态结构为 `folders[folderId]` + `sessionFolders[sessionId]` + `pendingInheritance[newSessionId]`。旧版 `session → path` 记录会在启动时自动迁移为“单会话文件夹”，已有目录不重命名。

## 说明 / Notes

- 插件只对工作区会话生效；子代理会话、种子会话以及已经产生过用户消息的旧会话不会自动创建目录。
- 文件夹名称取自首条用户消息的简短标题；首条消息为空、只有附件或无法提取主题时回退为 `新会话`。
- 继承文件夹时共用同一物理目录，不复制文件、不迁移对话内容；新会话的 `working-directory` 指向原文件夹。
- 只修改会话的工作目录（`working-directory/change`），不改变会话所属工作区及沙箱边界。
- 同一个文件夹可被多个会话共享；旧会话仍可继续使用同一目录，插件不会阻止并发写入，用户需要自行避免同时修改同一文件。

## 许可证 / License

[MIT](LICENSE)
