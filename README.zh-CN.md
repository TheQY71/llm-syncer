# Multi LLM Broadcaster

[English](README.md)

一款 Chrome 扩展，让你一键把同一条提示同步到多个 LLM 对话页。

## 功能

-   自动检测当前窗口内支持的 LLM 标签页，一次填入或发送。
-   每个标签页都有开关，默认全选并记住选择。
-   支持“自动发送”、回车发送 / Shift+Enter 换行，可在设置里隐藏状态栏。
-   提示词注入模式：覆盖原内容或在末尾追加。
-   收藏夹抽屉：保存、编辑、快速发送常用提示。
-   弹窗会缓存输入，并提供 Noir/Cyber/Glass/Zen 多套主题与设置面板。

## 支持的站点

-   ChatGPT (chatgpt.com, chat.openai.com)
-   Claude (claude.ai)
-   Gemini (gemini.google.com)
-   豆包 (doubao.com)
-   DeepSeek (chat.deepseek.com)
-   Kimi (kimi.moonshot.cn, kimi.com, kimi.ai)

## 安装

1. 克隆或下载本仓库。
2. 在 Chrome 打开 `chrome://extensions/`，开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择 `PromptLink` 目录。

## 使用

1. 打开想要同步的各个 LLM 对话页并确保已登录。
2. 点击 Multi LLM Broadcaster 图标。
3. 输入/粘贴提示词（Shift+Enter 换行）；内容会自动缓存。
4. 视需要勾选“自动发送”，并在设置里选择注入模式（覆盖/追加）、主题、是否显示状态栏。
5. 在检测到的 LLM 列表中勾选目标标签页，点击“填入到已选 LLM”，或在收藏里直接发送。
6. 根据状态栏提示确认成功的发送数量。

## 备注

-   功能依赖各站点的 DOM 结构，若站点改版可能需要更新扩展。
-   个人偏好（缓存的输入、收藏、标签页开关、注入模式、主题、自动发送、状态栏显示）均存储在本地 `chrome.storage` 中。

## TODO

-   [ ] 实现窗口浮动
-   [ ] 设置页面关闭按钮固定
