const sendBtn = document.getElementById('send');
const promptInput = document.getElementById('prompt');
const statusDiv = document.getElementById('status');
const autoSendCheckbox = document.getElementById('autoSend');

sendBtn.addEventListener('click', () => {
  const prompt = promptInput.value.trim();
  const autoSend = autoSendCheckbox.checked;

  if (!prompt) {
    statusDiv.textContent = '请输入内容再发送。';
    return;
  }

  // 找到当前窗口中所有相关 LLM tab
  chrome.tabs.query({}, (tabs) => {
    let targetTabs = tabs.filter(tab => {
      if (!tab.url) return false;
      return /chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|doubao\.com/.test(tab.url);
    });

    if (targetTabs.length === 0) {
      statusDiv.textContent = '当前没有打开匹配的 LLM 页面。';
      return;
    }

    let successCount = 0;

    targetTabs.forEach((tab) => {
      function sendMessage() {
        chrome.tabs.sendMessage(
          tab.id,
          { type: 'BROADCAST_PROMPT', prompt, autoSend },
          (response) => {
            if (chrome.runtime.lastError) {
              // content_script 可能未注入（例如 tab 在扩展加载前就打开了）
              console.warn('Error sending to tab', tab.id, chrome.runtime.lastError.message);

              // 尝试动态注入
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['contentScript.js']
              }, () => {
                if (chrome.runtime.lastError) {
                  console.error("Injection failed:", chrome.runtime.lastError.message);
                  return;
                }
                // 注入成功后重试发送
                chrome.tabs.sendMessage(
                  tab.id,
                  { type: 'BROADCAST_PROMPT', prompt, autoSend },
                  (res) => {
                    if (res && res.ok) {
                      successCount += 1;
                    }
                    statusDiv.textContent = `已尝试发送到 ${targetTabs.length} 个 LLM 页面，成功填入 ${successCount} 个。`;
                  }
                );
              });
              return;
            }

            if (response && response.ok) {
              successCount += 1;
            }
            statusDiv.textContent = `已尝试发送到 ${targetTabs.length} 个 LLM 页面，成功填入 ${successCount} 个。`;
          }
        );
      }
      sendMessage();
    });
  });
});
