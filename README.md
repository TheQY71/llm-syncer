# Multi LLM Broadcaster

A Chrome extension that allows you to broadcast a single prompt to multiple LLM (Large Language Model) chat interfaces simultaneously.

## Features

- **Broadcast Prompts**: Type your prompt once and send it to all open tabs of supported LLMs.
- **Auto Send**: Option to automatically click the "Send" button after filling the prompt.
- **Real-time Status**: Shows how many tabs were successfully targeted.

## Supported LLMs

- ChatGPT (chatgpt.com, chat.openai.com)
- Claude (claude.ai)
- Gemini (gemini.google.com)
- Doubao (doubao.com)

## Installation

1. Clone or download this repository to your local machine.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the directory containing this project.

## Usage

1. Open the chat interfaces of the LLMs you want to use (e.g., open a tab for ChatGPT, one for Claude, etc.) and ensure you are logged in.
2. Click the **Multi LLM Broadcaster** extension icon in the toolbar.
3. Enter your prompt in the text area.
4. (Optional) Check "自动尝试帮你点击“发送”" if you want the extension to submit the prompt automatically.
5. Click **发送到所有 LLM 页面**.
6. The extension will find all matching tabs and fill/send the prompt.

## Note

This extension relies on the DOM structure of the LLM websites. If these websites update their interface, the extension might stop working until it is updated to match the new structure.
