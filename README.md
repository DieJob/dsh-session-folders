# dsh-session-folders

在 DSH 工作区中，为每个会话的首次对话自动创建一个独立子文件夹，并让该会话产生的文件默认保存到该文件夹中。支持按工作区开启或关闭。

A DeepSeek Harness plugin that creates a dedicated subfolder for each session in a workspace on the session's first conversation, so every file that session produces lands in its own folder. Can be toggled per workspace.

## 功能 / Features

- **按工作区开启 / Per-workspace toggle**：每个工作区单独开关，已有工作区默认关闭。
- **新建工作区询问 / Ask on new workspace**：新建工作区后弹出询问框，可选择立即启用或暂不启用。
- **会话目录 / Session folder**：开启后，会话的首次对话会在工作区下创建 `session-YYYYMMDD-HHmmss-<会话ID前8位>/`，该会话后续的文件操作默认以该目录为工作目录。
- **随时修改 / Change anytime**：在「设置 → 会话文件夹」中查看所有工作区并切换开关，也可在插件配置页操作。

## 安装 / Install

从 GitHub 安装：

```sh
dsh plugin --profile <profile> add github:DieJob/dsh-session-folders
```

或在本机 DSH 插件管理（Settings → Plugins）里从 GitHub 源安装；也可以在插件市场的「发现 / Discover」中搜索 **dsh-session-folders** 一键安装。

安装后重启或刷新 DSH。本插件为纯 JavaScript，无需构建步骤。

## 状态文件 / State

插件将按工作区开关和已创建的会话文件夹记录保存在当前 profile 目录下的 `dsh-session-folders.state.json`。

## 说明 / Notes

- 插件只对工作区会话生效；子代理会话、种子会话以及已经产生过用户消息的旧会话不会自动创建目录。
- 只修改会话的工作目录（`working-directory/change`），不改变会话所属工作区及沙箱边界。

## 许可证 / License

[MIT](LICENSE)
