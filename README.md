# Multi LLM Broadcaster
[中文版本](README.zh-CN.md)

A Chrome extension that lets you write a prompt once and fill or send it to multiple LLM chat tabs in one click.

## Features

- Broadcast prompts to supported LLM tabs detected in the current window.
- Per-tab toggles with remembered selections; defaults to targeting every detected tab.
- Auto-send toggle plus Enter-to-send / Shift+Enter for newline; status bar can be hidden.
- Injection modes: replace existing input or append to it.
- Favorites drawer to save, edit, reuse, and one-click send prompts.
- Prompt cache, theme switcher (Noir, Cyber, Glass, Zen), and a quick settings panel.

## Supported LLMs

- ChatGPT (chatgpt.com, chat.openai.com)
- Claude (claude.ai)
- Gemini (gemini.google.com)
- Doubao (doubao.com)
- DeepSeek (chat.deepseek.com)
- Kimi (kimi.moonshot.cn, kimi.com, kimi.ai)

## Installation

1. Clone or download this repository.
2. In Chrome, open `chrome://extensions/` and enable **Developer mode**.
3. Click **Load unpacked** and select the `PromptLink` folder.

## Usage

1. Open the LLM chat pages you want to target and make sure you are signed in.
2. Click the Multi LLM Broadcaster extension icon.
3. Type or paste your prompt (Shift+Enter for newline); the text is cached automatically.
4. (Optional) Toggle auto-send, and use Settings to pick injection mode (replace/append), theme, and whether to show the status bar.
5. Choose which detected LLM tabs to target, then click **填入到已选 LLM** or send directly from a saved favorite.
6. Watch the status text to see how many sends succeeded.

## Notes

- The extension depends on each site’s DOM; interface changes on those sites may require an update here.
- Preferences (prompt cache, favorites, tab toggles, injection mode, theme, auto-send, status visibility) are stored locally via `chrome.storage`.
