document.addEventListener("DOMContentLoaded", () => {
    const sendBtn = document.getElementById("send");
    const promptInput = document.getElementById("prompt");
    const statusDiv = document.getElementById("status");
    const mainPanel = document.querySelector(".panel");
    const autoSendCheckbox = document.getElementById("autoSend");
    const llmListDiv = document.getElementById("llm-list");
    const llmHeader = document.getElementById("llm-header");
    const llmBody = document.getElementById("llm-body");
    const saveFavoriteBtn = document.getElementById("saveFavorite");
    const clearPromptBtn = document.getElementById("clearPrompt");
    const favoritesListDiv = document.getElementById("favorites-list");
    const favoritesCountSpan = document.getElementById("favorites-count");
    const favoritesHeader = document.getElementById("favorites-header");
    const favoritesBody = document.getElementById("favorites-body");
    const favoriteModal = document.getElementById("favorite-modal");
    const favoriteTitleInput = document.getElementById("favorite-title-input");
    const favoritePromptInput = document.getElementById("favorite-prompt-input");
    const favoriteSaveBtn = document.getElementById("favorite-save");
    const favoriteCancelBtn = document.getElementById("favorite-cancel");
    const themeRadios = document.querySelectorAll('input[name="theme"]');
    const showStatusToggle = document.getElementById("showStatusToggle");
    const settingsDialog = document.querySelector("#settings-modal .modal");

    const openSettingsBtn = document.getElementById("openSettings");
    const settingsModal = document.getElementById("settings-modal");
    const settingsCloseBtn = document.getElementById("settings-close");
    const injectionModeRadios = document.querySelectorAll('input[name="injectionMode"]');

    if (
        !sendBtn ||
        !promptInput ||
        !statusDiv ||
        !autoSendCheckbox ||
        !llmListDiv ||
        !llmHeader ||
        !llmBody ||
        !saveFavoriteBtn ||
        !clearPromptBtn ||
        !favoritesListDiv ||
        !favoritesCountSpan ||
        !favoritesHeader ||
        !favoritesBody ||
        !favoriteModal ||
        !favoriteTitleInput ||
        !favoritePromptInput ||
        !favoriteSaveBtn ||
        !favoriteCancelBtn ||
        !showStatusToggle ||
        !settingsDialog ||
        !mainPanel
    ) {
        console.error(
            "[MultiLLM][popup] 必要的 DOM 元素缺失，请检查 popup.html 的 id。"
        );
        return;
    }

    const PROMPT_STORAGE_KEY = "multiLLM_cachedPrompt";
    const LLM_PREFS_KEY = "multiLLM_llmPreferences";
    const FAVORITES_STORAGE_KEY = "multiLLM_favorites";
    const AUTO_SEND_PREF_KEY = "multiLLM_autoSendPref";
    const INJECTION_MODE_KEY = "multiLLM_injectionMode";
    const THEME_PREF_KEY = "multiLLM_theme";
    const STATUS_PREF_KEY = "multiLLM_showStatus";

    // 存储当前检测到的目标 tab
    let detectedTabs = [];
    // 存储每个 LLM tab 的启用状态（按 tabId 记忆，避免同一 LLM 的不同窗口互相影响）
    let llmPreferences = {};
    // 收藏的提示词
    let favorites = [];
    // 收藏列表是否折叠
    let favoritesCollapsed = true;
    // LLM 列表折叠状态
    let llmCollapsed = true;
    // 当前正在编辑的收藏 id
    let editingFavoriteId = null;
    // 注入模式: 'replace' | 'append'
    let injectionMode = 'replace';
    // 主题
    let themeName = 'noir';
    // 状态栏显示
    let showStatus = true;

    const applyAccordionStates = () => {
        const favIcon = favoritesHeader.querySelector(".accordion-icon");
        const llmIcon = llmHeader.querySelector(".accordion-icon");
        favoritesBody.classList.toggle("collapsed", favoritesCollapsed);
        llmBody.classList.toggle("collapsed", llmCollapsed);
        favoritesHeader.setAttribute("aria-expanded", String(!favoritesCollapsed));
        llmHeader.setAttribute("aria-expanded", String(!llmCollapsed));
        if (favIcon) favIcon.classList.toggle("open", !favoritesCollapsed);
        if (llmIcon) llmIcon.classList.toggle("open", !llmCollapsed);
    };
    applyAccordionStates();

    const updateStatusVisibility = () => {
        if (showStatus) {
            statusDiv.style.display = "";
        } else {
            statusDiv.style.display = "none";
            statusDiv.textContent = "";
        }
    };

    const setStatus = (text) => {
        if (!showStatus) return;
        statusDiv.textContent = text || "";
    };

    const cachePrompt = (value) => {
        chrome.storage.local.set({ [PROMPT_STORAGE_KEY]: value });
    };

    const makeFavoriteId = () =>
        `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const computeTitle = (text, customTitle) => {
        if (typeof customTitle === "string" && customTitle.trim()) {
            return customTitle.trim();
        }
        const trimmed = (text || "").trim().replace(/\s+/g, " ");
        if (!trimmed) return "未命名";
        const maxLen = 10;
        const minLen = 6;
        const candidate = trimmed.slice(0, maxLen);
        if (candidate.length >= minLen && trimmed.length <= maxLen) {
            return candidate;
        }
        return `${candidate}${trimmed.length > candidate.length ? "…" : ""}`;
    };

    const openFavoriteModal = (initialText = "", initialTitle = "") => {
        favoritePromptInput.value = initialText;
        favoriteTitleInput.value = initialTitle;
        favoriteModal.classList.add("show");
        setTimeout(() => {
            favoriteTitleInput.focus();
        }, 0);
    };

    const closeFavoriteModal = () => {
        favoriteModal.classList.remove("show");
    };

    const applyTheme = (name) => {
        const theme = ["noir", "cyber", "glass", "zen"].includes(name)
            ? name
            : "noir";
        document.body.setAttribute("data-theme", theme);
        themeRadios.forEach((r) => {
            r.checked = r.value === theme;
        });
        themeName = theme;
    };
    applyTheme(themeName);

    const syncSettingsSize = () => {
        if (!settingsDialog || !mainPanel) return;
        const h = mainPanel.offsetHeight;
        const w = mainPanel.offsetWidth;
        const heightPx = h && Number.isFinite(h) ? Math.max(200, h - 8) : null;
        const widthPx = w && Number.isFinite(w) ? Math.max(240, w - 8) : null;

        settingsDialog.style.height = heightPx ? `${heightPx}px` : "";
        settingsDialog.style.maxHeight = heightPx ? `${heightPx}px` : "";
        settingsDialog.style.width = widthPx ? `${widthPx}px` : "";
        settingsDialog.style.maxWidth = widthPx ? `${widthPx}px` : "";
    };

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
        // 只保留有内容的收藏，并生成标题
        favorites = favorites
            .filter((f) => Boolean(f && typeof f.text === "string" && f.text.trim()))
            .map((f) => ({
                id: String(f.id || makeFavoriteId()),
                text: f.text.trim(),
                title: computeTitle(f.text, f.title),
            }));
        chrome.storage.local.set({ [FAVORITES_STORAGE_KEY]: favorites });
        renderFavorites();
    };

    const renderFavorites = () => {
        favoritesCountSpan.textContent = `(${favorites.length})`;

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

            if (isEditing) {
                const editBox = document.createElement("div");
                editBox.className = "favorite-edit";

                const titleInput = document.createElement("input");
                titleInput.type = "text";
                titleInput.className = "favorite-title-input text-field";
                titleInput.placeholder = "可选标题";
                titleInput.value = fav.title || "";
                editBox.appendChild(titleInput);

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
                        f.id === fav.id
                            ? {
                                  ...f,
                                  text: newText,
                                  title: computeTitle(newText, titleInput.value),
                              }
                            : f
                    );
                    editingFavoriteId = null;
                    setStatus("已更新收藏");
                    persistFavorites();
                });

                const deleteBtn = document.createElement("button");
                deleteBtn.className = "mini-button danger";
                deleteBtn.textContent = "删除";
                deleteBtn.addEventListener("click", () => {
                    favorites = favorites.filter((f) => f.id !== fav.id);
                    editingFavoriteId = null;
                    setStatus("已删除收藏");
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
                actions.appendChild(deleteBtn);
                actions.appendChild(cancelBtn);
                editBox.appendChild(actions);

                item.appendChild(editBox);
            } else {
                const textEl = document.createElement("div");
                textEl.className = "favorite-text";
                textEl.textContent = computeTitle(fav.text, fav.title);
                textEl.title = fav.text;
                textEl.addEventListener("click", () => {
                    promptInput.value = fav.text;
                    cachePrompt(fav.text);
                    setStatus("已填入收藏");
                });
                item.appendChild(textEl);

                const actions = document.createElement("div");
                actions.className = "favorite-actions";

                const insertBtn = document.createElement("button");
                insertBtn.className = "mini-button icon-only";
                insertBtn.title = "插入到输入框";
                insertBtn.setAttribute("aria-label", "插入到输入框");
                insertBtn.textContent = "＋";
                insertBtn.addEventListener("click", () => {
                    promptInput.value = fav.text;
                    cachePrompt(fav.text);
                    setStatus("已填入收藏");
                });

                const sendBtn = document.createElement("button");
                sendBtn.className = "mini-button icon-only";
                sendBtn.title = "发送到已选 LLM";
                sendBtn.setAttribute("aria-label", "发送到已选 LLM");
                sendBtn.textContent = "✈";
                sendBtn.addEventListener("click", () => {
                    broadcastPrompts([fav.text], {
                        clearInput: false,
                        forceAutoSend: true,
                    });
                });

                const editBtn = document.createElement("button");
                editBtn.className = "mini-button icon-only";
                editBtn.title = "编辑收藏";
                editBtn.setAttribute("aria-label", "编辑收藏");
                editBtn.textContent = "✎";
                editBtn.addEventListener("click", () => {
                    editingFavoriteId = fav.id;
                    renderFavorites();
                });

                actions.appendChild(insertBtn);
                actions.appendChild(sendBtn);
                actions.appendChild(editBtn);
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
            [LLM_PREFS_KEY, FAVORITES_STORAGE_KEY, AUTO_SEND_PREF_KEY, INJECTION_MODE_KEY, THEME_PREF_KEY, STATUS_PREF_KEY],
            (res) => {
                const stored = res?.[LLM_PREFS_KEY];
                const autoSendPref = res?.[AUTO_SEND_PREF_KEY];
                const modePref = res?.[INJECTION_MODE_KEY];
                const themePref = res?.[THEME_PREF_KEY];
                const statusPref = res?.[STATUS_PREF_KEY];

                if (typeof autoSendPref === "boolean") {
                    autoSendCheckbox.checked = autoSendPref;
                }

                if (modePref === 'replace' || modePref === 'append') {
                    injectionMode = modePref;
                }
                // Update UI
                injectionModeRadios.forEach(r => {
                    r.checked = (r.value === injectionMode);
                });
                if (typeof themePref === "string") {
                    applyTheme(themePref);
                } else {
                    applyTheme(themeName);
                }
                if (typeof statusPref === "boolean") {
                    showStatus = statusPref;
                }
                showStatusToggle.checked = showStatus;
                updateStatusVisibility();
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
                            text:
                                typeof f.text === "string" ? f.text.trim() : "",
                            title: f.title,
                        }))
                        .filter((f) => f.text.trim())
                        .map((f) => ({
                            ...f,
                            title: computeTitle(f.text, f.title),
                        }));
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
                    applyAccordionStates();
                });
            }
        );
    }

    const broadcastPrompts = (prompts, { clearInput, forceAutoSend } = {}) => {
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

        const autoSend =
            typeof forceAutoSend === "boolean"
                ? forceAutoSend
                : autoSendCheckbox.checked;
        const totalAttempts = trimmedPrompts.length * targetTabs.length;
        let successCount = 0;

        trimmedPrompts.forEach((promptText) => {
            targetTabs.forEach((tab) => {
                chrome.tabs.sendMessage(
                    tab.id,
                    { type: "BROADCAST_PROMPT_V5", prompt: promptText, autoSend, injectionMode },
                    (response) => {
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

    const saveFavoriteFromModal = () => {
        const prompt = favoritePromptInput.value.trim();
        const title = favoriteTitleInput.value.trim();
        if (!prompt) {
            setStatus("请先输入内容再收藏。");
            return;
        }
        const newFavorite = {
            id: makeFavoriteId(),
            text: prompt,
            title: computeTitle(prompt, title),
        };
        favorites = [newFavorite, ...favorites];
        setStatus("已收藏当前提示词。");
        persistFavorites();
        closeFavoriteModal();
    };

    const clearPrompt = () => {
        promptInput.value = "";
        cachePrompt("");
        setStatus("已清空输入框。");
    };

    // 点击按钮发送
    sendBtn.addEventListener("click", sendPrompt);

    saveFavoriteBtn.addEventListener("click", () => {
        openFavoriteModal(promptInput.value, "");
    });
    clearPromptBtn.addEventListener("click", clearPrompt);
    favoriteSaveBtn.addEventListener("click", saveFavoriteFromModal);
    favoriteCancelBtn.addEventListener("click", () => {
        closeFavoriteModal();
    });
    favoriteModal.addEventListener("click", (e) => {
        if (e.target === favoriteModal) closeFavoriteModal();
    });
    themeRadios.forEach((radio) => {
        radio.addEventListener("change", () => {
            if (radio.checked) {
                applyTheme(radio.value);
                chrome.storage.local.set({ [THEME_PREF_KEY]: themeName });
            }
        });
    });
    favoritesHeader.addEventListener("click", () => {
        if (favoritesCollapsed) {
            favoritesCollapsed = false;
            llmCollapsed = true;
        } else {
            favoritesCollapsed = true;
        }
        applyAccordionStates();
    });
    llmHeader.addEventListener("click", () => {
        if (llmCollapsed) {
            llmCollapsed = false;
            favoritesCollapsed = true;
        } else {
            llmCollapsed = true;
        }
        applyAccordionStates();
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

    // 缓存自动发送选项
    autoSendCheckbox.addEventListener("change", () => {
        chrome.storage.local.set({ [AUTO_SEND_PREF_KEY]: autoSendCheckbox.checked });
    });

    // Settings UI Logic
    openSettingsBtn.addEventListener("click", () => {
        syncSettingsSize();
        settingsModal.classList.add("show");
    });
    settingsCloseBtn.addEventListener("click", () => {
        settingsModal.classList.remove("show");
    });
    settingsModal.addEventListener("click", (e) => {
        if (e.target === settingsModal) settingsModal.classList.remove("show");
    });
    injectionModeRadios.forEach(radio => {
        radio.addEventListener("change", () => {
            if (radio.checked) {
                injectionMode = radio.value;
                chrome.storage.local.set({ [INJECTION_MODE_KEY]: injectionMode });
            }
        });
    });
    showStatusToggle.addEventListener("change", () => {
        showStatus = showStatusToggle.checked;
        chrome.storage.local.set({ [STATUS_PREF_KEY]: showStatus });
        updateStatusVisibility();
    });
    window.addEventListener("resize", () => {
        if (settingsModal.classList.contains("show")) {
            syncSettingsSize();
        }
    });

    // 启动初始化
    init();
});
