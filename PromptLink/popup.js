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

    const PROMPT_STORAGE_KEY = "multiLLM_cachedPrompt";
    const LLM_PREFS_KEY = "multiLLM_llmPreferences";

    // 存储当前检测到的目标 tab
    let detectedTabs = [];
    // 存储每个 LLM tab 的启用状态（按 tabId 记忆，避免同一 LLM 的不同窗口互相影响）
    let llmPreferences = {};

    function getLLMName(url) {
        if (/chatgpt\.com|chat\.openai\.com/.test(url)) return "ChatGPT";
        if (/claude\.ai/.test(url)) return "Claude";
        if (/gemini\.google\.com/.test(url)) return "Gemini";
        if (/doubao\.com/.test(url)) return "Doubao";
        if (/chat\.deepseek\.com/.test(url)) return "DeepSeek";
        if (/kimi\.moonshot\.cn|kimi\.com|kimi\.ai/.test(url)) return "Kimi";
        return "Unknown LLM";
    }

    const isTabEnabled = (tab) => {
        const key = String(tab.id);
        const pref = llmPreferences?.[key];
        if (!pref) return true; // 默认启用
        if (typeof pref.enabled === "boolean") return pref.enabled;
        if (typeof pref.disabled === "boolean") return !pref.disabled;
        return true;
    };

    const setTabEnabled = (tab, enabled) => {
        const key = String(tab.id);
        llmPreferences = {
            ...llmPreferences,
            [key]: { enabled },
        };
        chrome.storage.local.set({ [LLM_PREFS_KEY]: llmPreferences });
    };

    function renderLLMList() {
        llmListDiv.innerHTML = "";

        if (detectedTabs.length === 0) {
            llmListDiv.textContent = "未检测到支持的 LLM 页面";
            return;
        }

        const items = detectedTabs.map((tab, idx) => {
            const name = getLLMName(tab.url);
            return {
                tab,
                name,
                enabled: isTabEnabled(tab),
                order: idx, // 保留原顺序用于稳定排序
            };
        });

        // 启用的排前面，未启用的排后面，保持稳定顺序
        items.sort((a, b) => {
            if (a.enabled === b.enabled) return a.order - b.order;
            return a.enabled ? -1 : 1;
        });

        items.forEach(({ tab, name, enabled }) => {
            const div = document.createElement("div");
            div.className = "llm-item";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = enabled; // 默认全选，记忆用户选择
            checkbox.dataset.tabId = String(tab.id);
            checkbox.className = "pill-toggle";
            checkbox.addEventListener("change", () => {
                setTabEnabled(tab, checkbox.checked);
                renderLLMList();
            });

            const label = document.createElement("span");
            label.className = "llm-name";
            label.textContent = `${name} (${tab.title || "Tab"})`;

            div.appendChild(label);
            div.appendChild(checkbox);
            llmListDiv.appendChild(div);
        });
    }

    // 确保已在当前页面注入 content_script（扩展更新后旧页面不会自动刷新）
    function ensureContentScripts(tabs) {
        tabs.forEach((tab) => {
            if (!tab.id) return;
            chrome.scripting.executeScript(
                {
                    target: { tabId: tab.id },
                    files: ["contentScript.js"],
                },
                () => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        console.warn(
                            "[MultiLLM][popup] inject contentScript failed",
                            tab.id,
                            err.message
                        );
                    }
                }
            );
        });
    }

    // 初始化：查找所有匹配的 tab 并渲染列表
    function init() {
        chrome.storage.local.get(LLM_PREFS_KEY, (res) => {
            const stored = res?.[LLM_PREFS_KEY];
            // 仅保留 tabId 形式的记录，避免同名 LLM 的多标签互相影响
            llmPreferences = {};
            if (stored && typeof stored === "object") {
                Object.keys(stored).forEach((key) => {
                    if (/^\d+$/.test(key)) {
                        llmPreferences[key] = stored[key];
                    }
                });
            }

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
                ensureContentScripts(detectedTabs);
                renderLLMList();
            });
        });
    }

    // 发送逻辑抽出来，回车和按钮共用
    const sendPrompt = () => {
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

        // 发送后清空输入框与缓存
        promptInput.value = "";
        chrome.storage.local.set({ [PROMPT_STORAGE_KEY]: "" });

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
    };

    // 点击按钮发送
    sendBtn.addEventListener("click", sendPrompt);

    // 回车发送，Shift+Enter 换行
    promptInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            sendPrompt();
        }
    });

    // 恢复缓存的输入，防止关闭弹窗后内容丢失
    chrome.storage.local.get(PROMPT_STORAGE_KEY, (res) => {
        const cached = res?.[PROMPT_STORAGE_KEY];
        if (typeof cached === "string") {
            promptInput.value = cached;
        }
    });

    // 实时缓存输入内容
    promptInput.addEventListener("input", () => {
        chrome.storage.local.set({ [PROMPT_STORAGE_KEY]: promptInput.value });
    });

    // 启动初始化
    init();
});
