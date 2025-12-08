document.addEventListener("DOMContentLoaded", () => {
    const sendBtn = document.getElementById("send");
    const promptInput = document.getElementById("prompt");
    const statusDiv = document.getElementById("status");
    const autoSendCheckbox = document.getElementById("autoSend");
    const llmListDiv = document.getElementById("llm-list");
    const saveFavoriteBtn = document.getElementById("saveFavorite");
    const clearPromptBtn = document.getElementById("clearPrompt");
    const favoritesListDiv = document.getElementById("favorites-list");
    const favoritesCountSpan = document.getElementById("favorites-count");
    const toggleFavoritesBtn = document.getElementById("toggleFavorites");
    const sendSelectedFavoritesBtn = document.getElementById(
        "sendSelectedFavorites"
    );

    if (
        !sendBtn ||
        !promptInput ||
        !statusDiv ||
        !autoSendCheckbox ||
        !llmListDiv ||
        !saveFavoriteBtn ||
        !clearPromptBtn ||
        !favoritesListDiv ||
        !favoritesCountSpan ||
        !toggleFavoritesBtn ||
        !sendSelectedFavoritesBtn
    ) {
        console.error(
            "[MultiLLM][popup] 必要的 DOM 元素缺失，请检查 popup.html 的 id。"
        );
        return;
    }

    const PROMPT_STORAGE_KEY = "multiLLM_cachedPrompt";
    const LLM_PREFS_KEY = "multiLLM_llmPreferences";
    const FAVORITES_STORAGE_KEY = "multiLLM_favorites";

    // 存储当前检测到的目标 tab
    let detectedTabs = [];
    // 存储每个 LLM tab 的启用状态（按 tabId 记忆，避免同一 LLM 的不同窗口互相影响）
    let llmPreferences = {};
    // 收藏的提示词
    let favorites = [];
    // 收藏列表被勾选的 id
    let selectedFavoriteIds = new Set();
    // 收藏列表是否折叠
    let favoritesCollapsed = false;
    // 当前正在编辑的收藏 id
    let editingFavoriteId = null;

    const setStatus = (text) => {
        statusDiv.textContent = text || "";
    };

    const cachePrompt = (value) => {
        chrome.storage.local.set({ [PROMPT_STORAGE_KEY]: value });
    };

    const makeFavoriteId = () =>
        `${Date.now()}_${Math.random().toString(16).slice(2)}`;

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

    const persistFavorites = () => {
        // 只保留有内容的收藏
        favorites = favorites.filter((f) =>
            Boolean(f && typeof f.text === "string" && f.text.trim())
        );
        // 去掉已经删除的勾选
        selectedFavoriteIds.forEach((id) => {
            if (!favorites.find((f) => f.id === id)) {
                selectedFavoriteIds.delete(id);
            }
        });
        chrome.storage.local.set({ [FAVORITES_STORAGE_KEY]: favorites });
        renderFavorites();
    };

    const renderFavorites = () => {
        favoritesCountSpan.textContent = `(${favorites.length})`;

        if (favoritesCollapsed) {
            favoritesListDiv.classList.add("collapsed");
            toggleFavoritesBtn.textContent = "展开";
            return;
        }

        favoritesListDiv.classList.remove("collapsed");
        toggleFavoritesBtn.textContent = "收起";
        favoritesListDiv.innerHTML = "";

        if (!favorites.length) {
            favoritesListDiv.textContent = "暂无收藏";
            return;
        }

        favorites.forEach((fav) => {
            const item = document.createElement("div");
            item.className = "favorite-item";
            item.dataset.id = fav.id;
            const isEditing = editingFavoriteId === fav.id;

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = selectedFavoriteIds.has(fav.id);
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    selectedFavoriteIds.add(fav.id);
                } else {
                    selectedFavoriteIds.delete(fav.id);
                }
            });
            item.appendChild(checkbox);

            if (isEditing) {
                const editBox = document.createElement("div");
                editBox.className = "favorite-edit";

                const textarea = document.createElement("textarea");
                textarea.value = fav.text;
                textarea.className = "favorite-edit-input";
                editBox.appendChild(textarea);

                const actions = document.createElement("div");
                actions.className = "favorite-edit-actions";

                const saveBtn = document.createElement("button");
                saveBtn.className = "mini-button";
                saveBtn.textContent = "保存";
                saveBtn.addEventListener("click", () => {
                    const newText = textarea.value.trim();
                    if (!newText) {
                        setStatus("收藏内容不能为空");
                        return;
                    }
                    favorites = favorites.map((f) =>
                        f.id === fav.id ? { ...f, text: newText } : f
                    );
                    editingFavoriteId = null;
                    setStatus("已更新收藏");
                    persistFavorites();
                });

                const cancelBtn = document.createElement("button");
                cancelBtn.className = "mini-button";
                cancelBtn.textContent = "取消";
                cancelBtn.addEventListener("click", () => {
                    editingFavoriteId = null;
                    renderFavorites();
                });

                actions.appendChild(saveBtn);
                actions.appendChild(cancelBtn);
                editBox.appendChild(actions);

                item.appendChild(editBox);
            } else {
                const textEl = document.createElement("div");
                textEl.className = "favorite-text";
                textEl.textContent = fav.text;
                textEl.title = fav.text;
                textEl.addEventListener("click", () => {
                    promptInput.value = fav.text;
                    cachePrompt(fav.text);
                    setStatus("已填入收藏");
                });
                item.appendChild(textEl);

                const actions = document.createElement("div");
                actions.className = "favorite-actions";

                const fillBtn = document.createElement("button");
                fillBtn.className = "mini-button";
                fillBtn.textContent = "填入";
                fillBtn.addEventListener("click", () => {
                    promptInput.value = fav.text;
                    cachePrompt(fav.text);
                    setStatus("已填入收藏");
                });

                const editBtn = document.createElement("button");
                editBtn.className = "mini-button";
                editBtn.textContent = "编辑";
                editBtn.addEventListener("click", () => {
                    editingFavoriteId = fav.id;
                    renderFavorites();
                });

                const deleteBtn = document.createElement("button");
                deleteBtn.className = "mini-button danger";
                deleteBtn.textContent = "删除";
                deleteBtn.addEventListener("click", () => {
                    favorites = favorites.filter((f) => f.id !== fav.id);
                    selectedFavoriteIds.delete(fav.id);
                    editingFavoriteId = null;
                    setStatus("已删除收藏");
                    persistFavorites();
                });

                actions.appendChild(fillBtn);
                actions.appendChild(editBtn);
                actions.appendChild(deleteBtn);
                item.appendChild(actions);
            }

            favoritesListDiv.appendChild(item);
        });
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

    const getSelectedTabIds = () => {
        const checkboxes = llmListDiv.querySelectorAll('input[type="checkbox"]');
        return Array.from(checkboxes)
            .filter((cb) => cb.checked)
            .map((cb) => Number(cb.dataset.tabId));
    };

    const getTargetTabs = () => {
        const selectedTabIds = getSelectedTabIds();
        if (selectedTabIds.length === 0) {
            setStatus("请至少选择一个 LLM 页面。");
            return null;
        }
        const targetTabs = detectedTabs.filter((tab) =>
            selectedTabIds.includes(tab.id)
        );
        if (targetTabs.length === 0) {
            setStatus("选中的标签页已关闭或不存在。");
            return null;
        }
        return targetTabs;
    };

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
        chrome.storage.local.get(
            [LLM_PREFS_KEY, FAVORITES_STORAGE_KEY],
            (res) => {
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

                const storedFavorites = res?.[FAVORITES_STORAGE_KEY];
                if (Array.isArray(storedFavorites)) {
                    favorites = storedFavorites
                        .map((f) => ({
                            id: String(f.id || makeFavoriteId()),
                            text: typeof f.text === "string" ? f.text : "",
                        }))
                        .filter((f) => f.text.trim());
                }
                renderFavorites();

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
            }
        );
    }

    const broadcastPrompts = (prompts, { clearInput } = {}) => {
        const trimmedPrompts = prompts
            .map((p) => (typeof p === "string" ? p.trim() : ""))
            .filter(Boolean);

        if (!trimmedPrompts.length) {
            setStatus("没有可发送的内容。");
            return;
        }

        const targetTabs = getTargetTabs();
        if (!targetTabs) return;

        if (clearInput) {
            promptInput.value = "";
            cachePrompt("");
        }

        const autoSend = autoSendCheckbox.checked;
        const totalAttempts = trimmedPrompts.length * targetTabs.length;
        let successCount = 0;
        let finished = 0;

        trimmedPrompts.forEach((promptText) => {
            targetTabs.forEach((tab) => {
                chrome.tabs.sendMessage(
                    tab.id,
                    { type: "BROADCAST_PROMPT", prompt: promptText, autoSend },
                    (response) => {
                        finished += 1;
                        if (chrome.runtime.lastError) {
                            const msg = chrome.runtime.lastError.message || "";
                            if (!msg.includes("Receiving end does not exist")) {
                                console.warn(
                                    "[MultiLLM][popup] Error sending to tab",
                                    tab.id,
                                    msg
                                );
                            }
                        } else if (response && response.ok) {
                            successCount += 1;
                        }

                        setStatus(
                            `已尝试发送 ${trimmedPrompts.length} 条到 ${targetTabs.length} 个 LLM 页面，成功 ${successCount}/${totalAttempts}。`
                        );
                    }
                );
            });
        });
    };

    // 发送逻辑抽出来，回车和按钮共用
    const sendPrompt = () => {
        const prompt = promptInput.value.trim();
        if (!prompt) {
            setStatus("请输入内容再发送。");
            return;
        }
        broadcastPrompts([prompt], { clearInput: true });
    };

    const addFavorite = () => {
        const prompt = promptInput.value.trim();
        if (!prompt) {
            setStatus("请先输入内容再收藏。");
            return;
        }
        const newFavorite = {
            id: makeFavoriteId(),
            text: prompt,
        };
        favorites = [newFavorite, ...favorites];
        setStatus("已收藏当前提示词。");
        persistFavorites();
    };

    const clearPrompt = () => {
        promptInput.value = "";
        cachePrompt("");
        setStatus("已清空输入框。");
    };

    const sendSelectedFavorites = () => {
        if (!selectedFavoriteIds.size) {
            setStatus("请先勾选要发送的收藏。");
            return;
        }
        const prompts = favorites
            .filter((f) => selectedFavoriteIds.has(f.id))
            .map((f) => f.text);
        broadcastPrompts(prompts, { clearInput: false });
    };

    // 点击按钮发送
    sendBtn.addEventListener("click", sendPrompt);

    saveFavoriteBtn.addEventListener("click", addFavorite);
    clearPromptBtn.addEventListener("click", clearPrompt);
    sendSelectedFavoritesBtn.addEventListener("click", sendSelectedFavorites);
    toggleFavoritesBtn.addEventListener("click", () => {
        favoritesCollapsed = !favoritesCollapsed;
        renderFavorites();
    });

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
        cachePrompt(promptInput.value);
    });

    // 启动初始化
    init();
});
