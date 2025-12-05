document.addEventListener("DOMContentLoaded", () => {
    const sendBtn = document.getElementById("send");
    const promptInput = document.getElementById("prompt");
    const statusDiv = document.getElementById("status");
    const autoSendCheckbox = document.getElementById("autoSend");
    const llmListDiv = document.getElementById("llm-list");

    if (
        !sendBtn ||
        !promptInput ||
        !statusDiv ||
        !autoSendCheckbox ||
        !llmListDiv
    ) {
        console.error(
            "[MultiLLM][popup] 必要的 DOM 元素缺失，请检查 popup.html 的 id。"
        );
        return;
    }

    // 存储当前检测到的目标 tab
    let detectedTabs = [];

    function getLLMName(url) {
        if (/chatgpt\.com|chat\.openai\.com/.test(url)) return "ChatGPT";
        if (/claude\.ai/.test(url)) return "Claude";
        if (/gemini\.google\.com/.test(url)) return "Gemini";
        if (/doubao\.com/.test(url)) return "Doubao";
        if (/chat\.deepseek\.com/.test(url)) return "DeepSeek";
        if (/kimi\.moonshot\.cn|kimi\.com|kimi\.ai/.test(url)) return "Kimi";
        return "Unknown LLM";
    }

    function renderLLMList() {
        llmListDiv.innerHTML = "";

        if (detectedTabs.length === 0) {
            llmListDiv.textContent = "未检测到支持的 LLM 页面";
            return;
        }

        detectedTabs.forEach((tab) => {
            const name = getLLMName(tab.url);
            const div = document.createElement("div");
            div.className = "llm-item";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = true; // 默认全选
            checkbox.dataset.tabId = String(tab.id);

            const label = document.createElement("span");
            label.textContent = `${name} (${tab.title || "Tab"})`;

            div.appendChild(checkbox);
            div.appendChild(label);
            llmListDiv.appendChild(div);
        });
    }

    // 初始化：查找所有匹配的 tab 并渲染列表
    function init() {
        chrome.tabs.query({ currentWindow: true }, (tabs) => {
            detectedTabs = tabs.filter((tab) => {
                if (!tab.url) return false;
                return /chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|doubao\.com|chat\.deepseek\.com|kimi\.moonshot\.cn|kimi\.com|kimi\.ai/.test(
                    tab.url
                );
            });

            console.log(
                "[MultiLLM][popup] detected tabs:",
                detectedTabs.map((t) => t.url)
            );
            renderLLMList();
        });
    }

    sendBtn.addEventListener("click", () => {
        const prompt = promptInput.value.trim();
        const autoSend = autoSendCheckbox.checked;

        if (!prompt) {
            statusDiv.textContent = "请输入内容再发送。";
            return;
        }

        const checkboxes = llmListDiv.querySelectorAll(
            'input[type="checkbox"]'
        );
        const selectedTabIds = Array.from(checkboxes)
            .filter((cb) => cb.checked)
            .map((cb) => Number(cb.dataset.tabId));

        if (selectedTabIds.length === 0) {
            statusDiv.textContent = "请至少选择一个 LLM 页面。";
            return;
        }

        const targetTabs = detectedTabs.filter((tab) =>
            selectedTabIds.includes(tab.id)
        );
        if (targetTabs.length === 0) {
            statusDiv.textContent = "选中的标签页已关闭或不存在。";
            return;
        }

        let successCount = 0;

        targetTabs.forEach((tab) => {
            chrome.tabs.sendMessage(
                tab.id,
                { type: "BROADCAST_PROMPT", prompt, autoSend },
                (response) => {
                    if (chrome.runtime.lastError) {
                        const msg = chrome.runtime.lastError.message || "";
                        // 对于没有 content_script 的 tab 直接忽略
                        if (!msg.includes("Receiving end does not exist")) {
                            console.warn(
                                "[MultiLLM][popup] Error sending to tab",
                                tab.id,
                                msg
                            );
                        }
                        statusDiv.textContent = `已尝试发送到 ${targetTabs.length} 个 LLM 页面，成功填入 ${successCount} 个。`;
                        return;
                    }

                    if (response && response.ok) {
                        successCount += 1;
                    }
                    statusDiv.textContent = `已尝试发送到 ${targetTabs.length} 个 LLM 页面，成功填入 ${successCount} 个。`;
                }
            );
        });
    });

    // 启动初始化
    init();
});
