// 防止同一个页面被注入多次时，注册多个监听器
if (window.__multiLLM_cs_installed_v5) {
    console.log("[MultiLLM][cs] duplicate load (v5), skip init on", location.href);
} else {
    window.__multiLLM_cs_installed_v5 = true;
    console.log("[MultiLLM][cs] loaded on", location.href);

    const PROMPT_STORAGE_KEY = "multiLLM_cachedPrompt";
    const FAVORITES_STORAGE_KEY = "multiLLM_favorites";
    const AUTO_SEND_PREF_KEY = "multiLLM_autoSendPref";
    const INJECTION_MODE_KEY = "multiLLM_injectionMode";
    const THEME_PREF_KEY = "multiLLM_theme";
    const STATUS_PREF_KEY = "multiLLM_showStatus";
    const FLOATING_PREF_KEY = "multiLLM_floatingEnabled";

    let floatingHost = null;
    let floatingDockIcon = null;
    let isFloatingMinimized = false;
    let dockIconTop = 24;

    // Inline style support: we avoid external loads to prevent chrome-extension://invalid fetches.
    const loadPopupCssText = () => Promise.resolve("");

    const getDockIconUrl = () => {
        const runtime = typeof chrome !== "undefined" ? chrome?.runtime : null;
        if (!runtime?.getURL) return null;
        const url = runtime.getURL("icons/icon-48.png");
        if (!url || url.includes("chrome-extension://invalid")) return null;
        return url;
    };

    const readFloatingEnabled = () =>
        new Promise((resolve) => {
            if (!chrome?.storage?.local) {
                resolve(true); // fallback to enabled if storage not ready
                return;
            }
            chrome.storage.local.get([FLOATING_PREF_KEY], (res) => {
                const enabled = res?.[FLOATING_PREF_KEY];
                if (enabled === false) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });

    const THEME_VARS = {
        noir: {
            "color-scheme": "dark",
            "--bg-gradient":
                "radial-gradient(circle at 20% 20%, #0b0d14, #070a12 55%)",
            "--panel-bg": "#11141f",
            "--panel-subtle": "#191f2b",
            "--panel-border": "#2a2f3c",
            "--panel-shadow":
                "0 18px 40px rgba(0, 0, 0, 0.35), 0 8px 22px rgba(0, 0, 0, 0.28)",
            "--text": "#f2f3f5",
            "--muted": "#8a92a6",
            "--accent1": "#3be3c4",
            "--accent2": "#53a8ff",
            "--button-bg": "hsla(0, 0%, 100%, 0.04)",
            "--button-border": "#2a2f3c",
            "--button-hover": "hsla(0, 0%, 100%, 0.08)",
            "--card-shadow": "inset 0 1px 0 hsla(0, 0%, 100%, 0.05)",
            "--focus-ring": "0 0 0 2px rgba(83, 168, 255, 0.25)",
        },
        cyber: {
            "color-scheme": "dark",
            "--bg-gradient":
                "radial-gradient(circle at 25% 15%, #0d1538, #030616 60%)",
            "--panel-bg": "#0a1028",
            "--panel-subtle": "rgba(15, 24, 54, 0.7)",
            "--panel-border": "#1f334f",
            "--panel-shadow":
                "0 25px 70px rgba(15, 30, 70, 0.55), 0 10px 30px rgba(0, 0, 0, 0.35)",
            "--text": "#ecfeff",
            "--muted": "#9aa8c1",
            "--accent1": "#5fffe7",
            "--accent2": "#66a4ff",
            "--button-bg": "rgba(102, 164, 255, 0.08)",
            "--button-border": "rgba(102, 164, 255, 0.25)",
            "--button-hover": "rgba(95, 255, 231, 0.12)",
            "--card-shadow": "inset 0 1px 0 rgba(102, 164, 255, 0.18)",
            "--focus-ring": "0 0 0 2px rgba(102, 164, 255, 0.35)",
        },
        glass: {
            "color-scheme": "dark",
            "--bg-gradient":
                "radial-gradient(circle at 20% 20%, rgba(15, 17, 23, 0.6), rgba(15, 17, 23, 0.9))",
            "--panel-bg": "hsla(0, 0%, 100%, 0.1)",
            "--panel-subtle": "hsla(0, 0%, 100%, 0.08)",
            "--panel-border": "hsla(0, 0%, 100%, 0.15)",
            "--panel-shadow":
                "0 20px 60px rgba(0, 0, 0, 0.35), 0 10px 32px rgba(0, 0, 0, 0.3)",
            "--text": "#fff",
            "--muted": "#cdd3e0",
            "--accent1": "#a1ffe8",
            "--accent2": "#7ba7ff",
            "--button-bg": "hsla(0, 0%, 100%, 0.18)",
            "--button-border": "hsla(0, 0%, 100%, 0.22)",
            "--button-hover": "hsla(0, 0%, 100%, 0.26)",
            "--card-shadow": "inset 0 1px 0 hsla(0, 0%, 100%, 0.12)",
            "--focus-ring": "0 0 0 2px rgba(161, 255, 232, 0.35)",
        },
        zen: {
            "color-scheme": "light",
            "--bg-gradient":
                "radial-gradient(circle at 25% 20%, #f6f4ef, #edece8 60%)",
            "--panel-bg": "#fff",
            "--panel-subtle": "#f6f4ef",
            "--panel-border": "#c7c7c7",
            "--panel-shadow":
                "0 12px 32px rgba(58, 58, 58, 0.08), 0 4px 12px rgba(58, 58, 58, 0.06)",
            "--text": "#3a3a3a",
            "--muted": "#888",
            "--accent1": "#7ba88c",
            "--accent2": "#8a9eb5",
            "--button-bg": "rgba(0, 0, 0, 0.04)",
            "--button-border": "rgba(0, 0, 0, 0.08)",
            "--button-hover": "rgba(0, 0, 0, 0.08)",
            "--card-shadow": "inset 0 1px 0 rgba(0, 0, 0, 0.05)",
            "--focus-ring": "0 0 0 2px rgba(123, 168, 140, 0.25)",
        },
    };

    const makeFavoriteId = () => `${Date.now()}_${Math.random().toString(16).slice(2)}`;

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

    // 将多行文本转换为多个 <p>，保留空行
    const buildParagraphHTML = (text) => {
        const lines = String(text).replace(/\r/g, "").split("\n");
        return lines
            .map((line) => {
                if (!line) return "<p><br></p>";
                const escaped = line
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
                return `<p>${escaped}</p>`;
            })
            .join("");
    };

    // 去掉 \r，保留换行等其他字符，用于对比内容是否一致
    const normalizeText = (v) => (v || "").replace(/\r/g, "");

    // 将光标移动到指定可编辑节点末尾，方便用户继续输入
    const placeCaretAtEnd = (el) => {
        try {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
            el.focus();
        } catch (e) {
            /* ignore */
        }
    };

    // 用 execCommand 按行插入，并在行间插入真实的段落（回车）
    const insertLinesWithExecCommand = (lines) => {
        let ok = true;
        lines.forEach((line, idx) => {
            try {
                ok = document.execCommand("insertText", false, line) && ok;
            } catch (e) {
                ok = false;
            }
            if (idx < lines.length - 1) {
                try {
                    const paraOk =
                        document.execCommand("insertParagraph") ||
                        document.execCommand("insertLineBreak");
                    ok = (paraOk || ok) && ok;
                } catch (e) {
                    ok = false;
                }
            }
        });
        return ok;
    };

    function fillForClaude(prompt, autoSend, injectionMode) {
        console.log("[MultiLLM] fillForClaude on", location.href);

        // 1. 精确匹配 Claude 的编辑区域
        let editor =
            document.querySelector(
                'div.tiptap.ProseMirror[contenteditable="true"][data-testid="chat-input"]'
            ) ||
            document.querySelector(
                'div[contenteditable="true"][data-testid="chat-input"]'
            );

        if (!editor) {
            console.log("[MultiLLM] Claude editor not found");
            return false;
        }

        console.log("[MultiLLM] Claude editor found:", editor);

        // 2. 聚焦编辑器
        editor.focus();

        // 3. Handle Injection Mode
        if (injectionMode === 'replace') {
            // Clear content
            editor.innerHTML = "";
        } else {
            // Append mode: Ensure newline if content exists
            const currentText = normalizeText(editor.textContent);
            if (currentText && !currentText.endsWith("\n")) {
                // Insert a newline first
                const br = document.createElement("br");
                // This is tricky in ProseMirror, might need execCommand
            }
            // For now, just let it append at cursor, user usually expects that
        }

        // 4. 像用户打字那样插入文本
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);

        // 先尝试 execCommand 分行插入，让 tiptap/ProseMirror 认为是“真实输入”
        const lines = normalizeText(prompt).split("\n");
        const execOk = insertLinesWithExecCommand(lines);

        // 如果 execCommand 不 work，就直接塞 HTML 兜底（按行拆成多个 <p>，保留换行）
        if (
            !execOk ||
            normalizeText(editor.textContent) !== normalizeText(prompt)
        ) {
            editor.innerHTML = buildParagraphHTML(prompt);
        }

        // 5. 触发 input / change 事件，让 React + tiptap 刷新状态
        try {
            editor.dispatchEvent(
                new InputEvent("input", {
                    bubbles: true,
                    inputType: "insertText",
                    data: prompt,
                })
            );
        } catch (e) {
            editor.dispatchEvent(new Event("input", { bubbles: true }));
        }
        editor.dispatchEvent(new Event("change", { bubbles: true }));

        // tiptap 可能异步规范化 DOM，再次兜底确认换行存在
        setTimeout(() => {
            if (normalizeText(editor.textContent) !== normalizeText(prompt)) {
                console.log("[MultiLLM] Claude enforce final DOM write");
                editor.innerHTML = buildParagraphHTML(prompt);
                editor.dispatchEvent(new Event("input", { bubbles: true }));
                editor.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }, 0);

        console.log("[MultiLLM] Claude prompt filled");

        // 6. 自动发送（可选）
        if (autoSend === true) {
            // Claude 的发送按钮：
            // <button ... aria-label="Send message" ...>  （初始 disabled，输入后会变 enabled）
            const tryClick = () => {
                const sendButton = document.querySelector(
                    'button[aria-label="Send message"]'
                );
                if (!sendButton) {
                    console.log("[MultiLLM] Claude send button not found");
                    return;
                }
                if (sendButton.disabled) {
                    console.log("[MultiLLM] Claude send button still disabled");
                    return;
                }
                console.log("[MultiLLM] Claude send button ready, clicking");
                sendButton.click();
            };

            // tiptap/React 有一点点延迟，给两次机会
            setTimeout(tryClick, 50);
            setTimeout(tryClick, 200);
        }

        return true;
    }

    function fillForGemini(prompt, autoSend, injectionMode) {
        console.log("[MultiLLM] Gemini detected, trying to fill prompt");

        // 1. 尽量精确匹配当前的输入框：
        //   <div class="ql-editor ql-blank textarea new-input-ui"
        //        contenteditable="true"
        //        data-placeholder="Ask Gemini">
        let editor = document.querySelector(
            'div[contenteditable="true"][data-placeholder="Ask Gemini"]'
        );

        // 兜底：任意 ql-editor，可编辑的
        if (!editor) {
            editor = document.querySelector(
                'div.ql-editor[contenteditable="true"]'
            );
        }

        if (!editor) {
            console.log("[MultiLLM] Gemini editor not found");
            return false;
        }

        console.log("[MultiLLM] Gemini editor found:", editor);

        // 2. 聚焦 + 基础数据
        editor.focus();
        const promptText = normalizeText(String(prompt));
        const existingText = normalizeText(editor.textContent || "");
        const targetText =
            injectionMode === "replace"
                ? promptText
                : existingText
                ? `${existingText}${existingText.endsWith("\n") ? "" : "\n"}${promptText}`
                : promptText;

        const dispatchGeminiEvents = () => {
            try {
                editor.dispatchEvent(
                    new InputEvent("input", {
                        bubbles: true,
                        inputType: "insertText",
                        data: targetText,
                    })
                );
            } catch (e) {
                editor.dispatchEvent(new Event("input", { bubbles: true }));
            }
            editor.dispatchEvent(new Event("change", { bubbles: true }));
        };

        const enforceGeminiContent = (reason) => {
            if (reason) {
                console.log("[MultiLLM] Gemini enforce DOM write:", reason);
            }
            editor.innerHTML = buildParagraphHTML(targetText);
            dispatchGeminiEvents();
            placeCaretAtEnd(editor);
        };

        // 3. Handle Injection Mode
        if (injectionMode === "replace") {
            // Async Strategy: Select All -> Delete -> Wait -> Insert
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor);
            selection.removeAllRanges();
            selection.addRange(range);

            document.execCommand("delete", false, null);

            // Wait for Quill to process delete
            setTimeout(() => {
                editor.focus();
                let inserted = false;
                try {
                    inserted = document.execCommand("insertText", false, targetText);
                } catch (e) {
                    inserted = false;
                }
                if (!inserted) {
                    editor.textContent = targetText;
                }

                dispatchGeminiEvents();
                placeCaretAtEnd(editor);

                setTimeout(() => {
                    if (normalizeText(editor.textContent || "") !== targetText) {
                        enforceGeminiContent("replace mismatch");
                    }
                    console.log("[MultiLLM] Gemini prompt filled");
                    if (autoSend === true) {
                        triggerGeminiAutoSend();
                    }
                }, 120);
            }, 10);

            // Return early, auto-send handled in the inner timeout
            return true;
        }

        // Append Mode
        placeCaretAtEnd(editor);

        // Insert newline if needed
        if (existingText && !existingText.endsWith("\n")) {
            try {
                document.execCommand("insertText", false, "\n");
            } catch (e) {
                /* ignore */
            }
        }

        let appended = false;
        try {
            appended = document.execCommand("insertText", false, promptText);
        } catch (e) {
            appended = false;
        }

        if (!appended) {
            enforceGeminiContent("append fallback");
        } else {
            dispatchGeminiEvents();
            placeCaretAtEnd(editor);
        }

        // 让 Quill/Angular 完成同步后再检查、再发送
        setTimeout(() => {
            if (normalizeText(editor.textContent || "") !== targetText) {
                enforceGeminiContent("append mismatch");
            }
            console.log("[MultiLLM] Gemini prompt filled");
            if (autoSend === true) {
                triggerGeminiAutoSend();
            }
        }, 160);

        return true;
    }

    function triggerGeminiAutoSend() {
        const findSendButton = () =>
            document.querySelector('button[aria-label="Send message"]') ||
            document.querySelector("button.send-button");

        const tryClick = () => {
            const sendButton = findSendButton();
            if (!sendButton) {
                console.log("[MultiLLM] Gemini send button not found");
                return false;
            }
            const disabled =
                sendButton.disabled ||
                sendButton.getAttribute("aria-disabled") === "true";
            if (disabled) {
                console.log("[MultiLLM] Gemini send button disabled");
                return false;
            }
            console.log("[MultiLLM] Gemini send button found, clicking");
            sendButton.click();
            return true;
        };

        if (!tryClick()) {
            setTimeout(tryClick, 120);
        }
    }

    function fillForChatGPT(prompt, autoSend, injectionMode) {
        console.log("[MultiLLM] ChatGPT detected, trying to fill prompt");

        // 1. Find the editor (Priority: textarea)
        const findChatGptEditor = () => {
            // New UI uses textarea
            const textarea = document.querySelector('textarea#prompt-textarea') || 
                             document.querySelector('textarea[data-testid="prompt-textarea"]');
            if (textarea) return textarea;

            // Fallback for older UI (ProseMirror div)
            return document.querySelector('div[contenteditable="true"][data-testid="prompt-textarea"]') ||
                   document.querySelector('#prompt-textarea');
        };

        const editor = findChatGptEditor();
        if (!editor) {
            console.log("[MultiLLM] ChatGPT editor not found");
            return false;
        }

        console.log("[MultiLLM] ChatGPT editor found:", editor);

        // --- PHASE 1: INJECTION (Overwrite) ---
        // This is the ONLY place where we modify the input content.
        editor.focus();
        
        if (editor.tagName === "TEXTAREA") {
            // Handle Injection Mode
            if (injectionMode === 'replace') {
                editor.value = prompt;
            } else {
                // Append
                const current = editor.value;
                if (current) {
                    editor.value = current + "\n" + prompt;
                } else {
                    editor.value = prompt;
                }
            }
            editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
            editor.dispatchEvent(new Event("change", { bubbles: true }));
            
            // Auto-resize height
            editor.style.height = "auto";
            editor.style.height = editor.scrollHeight + "px";
        } else {
            // Fallback for contenteditable div
            if (injectionMode === 'replace') {
                editor.innerHTML = ""; 
                if (typeof buildParagraphHTML === 'function') {
                    editor.innerHTML = buildParagraphHTML(prompt);
                } else {
                    editor.innerText = prompt;
                }
            } else {
                // Append
                if (typeof buildParagraphHTML === 'function') {
                    editor.innerHTML += buildParagraphHTML(prompt);
                } else {
                    editor.innerText += "\n" + prompt;
                }
            }
            editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
        }

        console.log("[MultiLLM] ChatGPT prompt filled (overwrite)");

        // --- PHASE 2: AUTO SEND (Click Only) ---
        // Do NOT modify editor content here.
        if (autoSend) {
            const content = editor.value || editor.textContent || "";
            if (!content.trim()) {
                console.log("[MultiLLM] ChatGPT input is empty, skip auto-send");
                return true;
            }

            // Wait for UI state to settle (mic -> send icon)
            setTimeout(() => {
                const findSendButton = () => {
                    // Priority: data-testid="send-button"
                    const testIdBtn = document.querySelector('button[data-testid="send-button"]');
                    if (testIdBtn) return testIdBtn;

                    // Fallback: aria-label="Send" / "发送"
                    const candidates = document.querySelectorAll('button[aria-label]');
                    for (const btn of candidates) {
                        const label = btn.getAttribute("aria-label").trim();
                        if (label === "Send" || label === "Send message" || label === "发送") {
                            return btn;
                        }
                    }
                    return null;
                };

                const sendBtn = findSendButton();
                if (sendBtn) {
                    if (!sendBtn.disabled && sendBtn.getAttribute("aria-disabled") !== "true") {
                        console.log("[MultiLLM] ChatGPT send button found, clicking");
                        sendBtn.click();
                    } else {
                        console.log("[MultiLLM] ChatGPT send button is disabled");
                    }
                } else {
                    console.log("[MultiLLM] ChatGPT send button not found (might be still in mic mode)");
                }
            }, 65);
        }

        return true;
    }

    function fillForDoubao(prompt, autoSend, injectionMode) {
        console.log("[MultiLLM] Doubao detected, trying to fill prompt");

        const textarea = document.querySelector(
            'textarea[data-testid="chat_input_input"]'
        );
        if (!textarea) {
            console.log("[MultiLLM] Doubao textarea not found");
            return false;
        }

        console.log("[MultiLLM] Doubao textarea found");
        textarea.focus();
        
        if (injectionMode === 'replace') {
            textarea.value = prompt;
        } else {
            const current = textarea.value;
            textarea.value = current ? (current + "\n" + prompt) : prompt;
        }
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));

        if (autoSend === true) {
            setTimeout(() => {
                const sendButton = document.querySelector(
                    'button[data-testid="chat_input_send_button"]'
                );
                if (sendButton && !sendButton.disabled) {
                    console.log(
                        "[MultiLLM] Doubao send button found and enabled, clicking"
                    );
                    sendButton.click();
                } else {
                    console.log(
                        "[MultiLLM] Doubao send button not found or disabled"
                    );
                }
            }, 300);
        }
        return true;
    }

    function fillForDeepSeek(prompt, autoSend, injectionMode) {
        console.log("[MultiLLM] DeepSeek detected, trying to fill prompt");

        const textarea = document.querySelector(
            'textarea[placeholder="Message DeepSeek"]'
        );
        if (!textarea) {
            console.log("[MultiLLM] DeepSeek textarea not found");
            return false;
        }

        console.log("[MultiLLM] DeepSeek textarea found");
        textarea.focus();
        
        if (injectionMode === 'replace') {
            textarea.value = prompt;
        } else {
            const current = textarea.value;
            textarea.value = current ? (current + "\n" + prompt) : prompt;
        }
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));

        if (autoSend === true) {
            setTimeout(() => {
                // 查找发送按钮，通常是 div[role="button"] 且包含发送图标
                // 这里尝试查找包含 DeepThink 或 Search 的按钮旁边的发送按钮，或者直接找那个 icon button
                const buttons = Array.from(
                    document.querySelectorAll(
                        'div[role="button"].ds-icon-button'
                    )
                ).filter(
                    (btn) =>
                        btn.getAttribute("aria-disabled") !== "true" &&
                        !btn.classList.contains("ds-icon-button--disabled")
                );

                // DeepSeek 的发送按钮通常是操作区域里最后一个可用的 icon button
                const sendButton = buttons[buttons.length - 1];

                if (sendButton) {
                    console.log(
                        "[MultiLLM] DeepSeek send button found, clicking"
                    );
                    sendButton.click();
                } else {
                    console.log(
                        "[MultiLLM] DeepSeek send button not found or disabled"
                    );
                }
            }, 300);
        }
        return true;
    }

    function fillForKimi(prompt, autoSend, injectionMode) {
        console.log("[MultiLLM] Kimi detected (V5), trying to fill prompt");

        // 1. 锁定当前输入框（底部 chat 输入区域）
        let editor = document.querySelector(
            '.chat-input .chat-input-editor[contenteditable="true"][data-lexical-editor="true"]'
        );
        if (!editor) {
            editor = document.querySelector(
                '.chat-input .chat-input-editor[contenteditable="true"]'
            );
        }
        if (!editor) {
            console.log("[MultiLLM] Kimi editor not found");
            return false;
        }

        console.log("[MultiLLM] Kimi editor found:", editor);

        editor.focus();

        const targetText = String(prompt);

        // 2. Overwrite Strategy: Select All -> Paste
        // This mimics user behavior (Ctrl+A -> Ctrl+V) which is most reliable for Lexical
        const selectAll = () => {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor);
            selection.removeAllRanges();
            selection.addRange(range);
        };

        const tryPaste = () => {
            try {
                const dt = new DataTransfer();
                dt.setData("text/plain", targetText);
                const pasteEvent = new ClipboardEvent("paste", {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: dt,
                });
                editor.dispatchEvent(pasteEvent);
                return true;
            } catch (e) {
                return false;
            }
        };

        // Execute Injection based on Mode
        if (injectionMode === 'replace') {
            // Async Strategy: Select All -> Delete -> Wait -> Paste
            selectAll();
            document.execCommand("delete", false, null);
            
            setTimeout(() => {
                editor.focus();
                const pasted = tryPaste();
                if (!pasted) {
                    editor.innerHTML = buildParagraphHTML(targetText);
                    editor.dispatchEvent(new Event("input", { bubbles: true }));
                }
                editor.dispatchEvent(new Event("change", { bubbles: true }));
                
                if (autoSend === true) {
                    triggerKimiAutoSend();
                }
            }, 10);
            
            return true;
        } else {
            // Append Mode
            // Just move caret to end and paste
            placeCaretAtEnd(editor);
            // Insert newline if needed? Lexical usually handles block level
            // Just paste
            const pasted = tryPaste();
            if (!pasted) {
                editor.innerHTML += buildParagraphHTML(targetText);
                editor.dispatchEvent(new Event("input", { bubbles: true }));
            }
        }
        
        // Always fire change
        editor.dispatchEvent(new Event("change", { bubbles: true }));

        // 3. 自动发送（独立逻辑）
        if (autoSend === true && injectionMode !== 'replace') {
            triggerKimiAutoSend();
        }

        return true;
    }

    function triggerKimiAutoSend() {
        setTimeout(() => {
            const findSendButton = () => {
                // 1. ID
                const btnById = document.getElementById("send-button");
                if (btnById) return btnById;

                // 2. Specific Classes / Attributes
                const selectors = [
                    'button[data-testid="send-button"]',
                    'button[aria-label="发送"]',
                    'button[aria-label="Send"]',
                    'div[role="button"][aria-label="发送"]', // Sometimes it's a div
                    '.send-button',
                    'button[class*="sendButton"]'
                ];

                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el && !el.disabled && el.offsetParent !== null) return el;
                }
                return null;
            };

            const sendButton = findSendButton();
            if (sendButton) {
                console.log("[MultiLLM] Kimi send button found, clicking");
                sendButton.click();
            } else {
                console.log("[MultiLLM] Kimi send button not found");
            }
        }, 600); // Give UI time to react to input
    }

    function fillPrompt(prompt, autoSend, injectionMode) {
        const shouldAutoSend = autoSend === true;
        const mode = injectionMode || 'replace'; // Default to replace
        const url = window.location.href;
        console.log("[MultiLLM] fillPrompt on", url, "mode:", mode);

        if (/chatgpt\.com|chat\.openai\.com/.test(url)) {
            return fillForChatGPT(prompt, shouldAutoSend, mode);
        } else if (/claude\.ai/.test(url)) {
            return fillForClaude(prompt, shouldAutoSend, mode);
        } else if (/gemini\.google\.com/.test(url)) {
            return fillForGemini(prompt, shouldAutoSend, mode);
        } else if (/doubao\.com/.test(url)) {
            return fillForDoubao(prompt, shouldAutoSend, mode);
        } else if (/chat\.deepseek\.com/.test(url)) {
            return fillForDeepSeek(prompt, shouldAutoSend, mode);
        } else if (/kimi\.moonshot\.cn|kimi\.com|kimi\.ai/.test(url)) {
            return fillForKimi(prompt, shouldAutoSend, mode);
        }

        // fallback ...
        const textarea = document.querySelector("textarea");
        if (!textarea) return false;
        textarea.focus();
        
        if (mode === 'replace') {
            textarea.value = prompt;
        } else {
            textarea.value = (textarea.value ? textarea.value + "\n" : "") + prompt;
        }
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    }

    const removeFloatingPanel = () => {
        if (floatingHost && floatingHost.isConnected) {
            floatingHost.remove();
        }
        const existing = document.getElementById("multi-llm-floating-root");
        if (existing && existing !== floatingHost) {
            existing.remove();
        }
        floatingHost = null;
        if (floatingDockIcon && floatingDockIcon.isConnected) {
            floatingDockIcon.remove();
        }
        floatingDockIcon = null;
        isFloatingMinimized = false;
        window.__multiLLM_floatingPanelMounted = false;
    };

    async function initFloatingPanel() {
        if (window.__multiLLM_floatingPanelMounted) return;
        const existing = document.getElementById("multi-llm-floating-root");
        if (existing) {
            floatingHost = existing;
            window.__multiLLM_floatingPanelMounted = true;
            return;
        }

        // We rely on inline CSS for the floating panel to avoid invalid extension URLs.
        const cssText = await loadPopupCssText();

        const host = document.createElement("div");
        host.id = "multi-llm-floating-root";
        Object.assign(host.style, {
            position: "fixed",
            right: "16px",
            top: "16px",
            zIndex: "2147483647",
            width: "540px",
            maxWidth: "94vw",
            boxSizing: "border-box",
            fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
        });

        const shadow = host.attachShadow({ mode: "open" });

        // Apply inline styles (no external requests to avoid chrome-extension://invalid).
        if (cssText) {
            const styleEl = document.createElement("style");
            styleEl.textContent = cssText;
            shadow.appendChild(styleEl);
        }

        const extraStyle = document.createElement("style");
        // Inline component styles so floating panel doesn't depend on popup.css
        extraStyle.textContent = `
            :host {
                /* Fallback colors in case main CSS fails to load */
                --bg-gradient: radial-gradient(circle at 20% 20%, #0b0d14, #070a12 55%);
                --panel-bg: #11141f;
                --panel-subtle: #191f2b;
                --panel-border: #2a2f3c;
                --panel-shadow: 0 18px 40px rgba(0, 0, 0, 0.35), 0 8px 22px rgba(0, 0, 0, 0.28);
                --text: #f2f3f5;
                --muted: #8a92a6;
                --accent1: #3be3c4;
                --accent2: #53a8ff;
                --button-bg: hsla(0, 0%, 100%, 0.04);
                --button-border: #2a2f3c;
                --button-hover: hsla(0, 0%, 100%, 0.08);
            }
            *, *::before, *::after { box-sizing: border-box; }
            .floating-shell {
                position: relative;
                width: 100%;
                color: var(--text);
                background: var(--bg-gradient, var(--panel-bg));
                border: 1px solid var(--panel-border);
                border-radius: 1rem;
                box-shadow: var(--panel-shadow);
                padding: 8px;
                overflow: hidden;
                opacity: 0.88;
                transition: opacity 0.15s ease;
            }
            .floating-shell:hover {
                opacity: 1;
            }
            .floating-panel {
                position: relative;
                width: 100%;
                background: color-mix(in srgb, var(--panel-bg) 92%, transparent);
                border: 1px solid var(--panel-border);
                border-radius: 1rem;
                box-shadow: var(--panel-shadow);
                padding: 12px;
                gap: 10px;
                display: flex;
                flex-direction: column;
            }
            .panel {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin: 0;
                background: var(--panel-bg);
                border: 1px solid var(--panel-border);
                border-radius: 12px;
                box-shadow: var(--panel-shadow);
                padding: 12px;
            }
            .floating-minimize-btn {
                width: 32px;
                height: 32px;
                border-radius: 10px;
                border: 1px solid var(--panel-border);
                background: var(--panel-subtle);
                color: var(--text);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                box-shadow: var(--panel-shadow);
                font-size: 16px;
                line-height: 1;
                transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
            }
            .floating-minimize-btn:hover {
                background: var(--button-hover);
                transform: translateY(-1px);
            }
            .floating-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 6px 0 4px;
            }
            .floating-title { font-size: 0.95rem; font-weight: 600; }
            .floating-header-left { display: inline-flex; align-items: center; gap: 8px; }
            .floating-header-actions { display: inline-flex; align-items: center; gap: 8px; }
            .floating-drag {
                cursor: grab;
                border: 1px dashed var(--panel-border);
                border-radius: 8px;
                padding: 4px 8px;
                font-size: 12px;
                color: var(--muted);
                background: var(--panel-subtle);
            }
            .floating-handle {
                display: none;
                align-items: center;
                justify-content: center;
                width: 46px;
                height: 46px;
                border-radius: 12px 0 0 12px;
                border: 1px solid var(--panel-border);
                background: var(--panel-bg);
                color: var(--text);
                box-shadow: var(--panel-shadow);
                cursor: pointer;
                position: absolute;
                top: 0;
                right: 0;
            }
            .floating-shell.collapsed .floating-panel { display: none; }
            .floating-shell.collapsed .floating-handle { display: inline-flex; }
            textarea {
                width: 100%;
                resize: vertical;
                border: none;
                background: transparent;
                color: var(--text);
                font-size: 14px;
                line-height: 1.5;
                min-height: 140px;
                padding: 12px;
                outline: none;
            }
            textarea::placeholder { color: var(--muted); }
            .input-card {
                border: 1px solid var(--panel-border);
                border-radius: 10px;
                overflow: hidden;
                background: var(--panel-subtle);
            }
            .toolbar {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                padding: 8px 10px;
                border-top: 1px solid var(--panel-border);
                background: var(--panel-subtle);
            }
            .toolbar-left, .toolbar-right { display: inline-flex; align-items: center; gap: 10px; }
            .btn-icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 36px;
                height: 36px;
                border-radius: 10px;
                border: 1px solid var(--button-border);
                background: var(--button-bg);
                color: var(--text);
                transition: all 0.15s ease;
            }
            .btn-icon:hover {
                border-color: color-mix(in srgb, var(--accent2) 35%, var(--panel-border));
                background: var(--button-hover);
                box-shadow: var(--panel-shadow);
            }
            .btn-icon-primary {
                width: 42px;
                height: 36px;
                border: none;
                background: linear-gradient(120deg, var(--accent1), var(--accent2));
                color: #0b1022;
                font-weight: 700;
            }
            .toggle-inline {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                color: var(--muted);
                font-size: 12px;
            }
            .toggle-inline input { width: 14px; height: 14px; accent-color: var(--accent1); }
            .accordion {
                border-radius: 10px;
                border: 1px solid var(--panel-border);
                background: var(--panel-subtle);
            }
            .accordion-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
                padding: 10px;
                color: var(--text);
                background: transparent;
            }
            .accordion-title { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; }
            .accordion-icon { color: var(--muted); transition: transform 0.2s ease; }
            .accordion-icon.open { transform: rotate(90deg); }
            .accordion-body { padding: 8px 10px 12px; }
            .accordion-body.collapsed { display: none; }
            .favorites-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
                max-height: 240px;
                overflow-y: auto;
            }
            .favorite-item {
                display: grid;
                grid-template-columns: 1fr auto;
                align-items: center;
                gap: 8px;
                padding: 10px;
                border-radius: 8px;
                background: var(--panel-bg);
                border: 1px solid var(--panel-border);
            }
            .favorite-text {
                color: var(--text);
                font-size: 13px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                cursor: pointer;
            }
            .favorite-actions { display: inline-flex; align-items: center; gap: 6px; }
            .favorite-edit { display: flex; flex-direction: column; gap: 8px; }
            .favorite-edit textarea {
                min-height: 100px;
                border: 1px solid var(--panel-border);
                border-radius: 8px;
                background: var(--panel-subtle);
                padding: 10px;
                color: var(--text);
            }
            .favorite-edit-actions { display: flex; justify-content: flex-end; gap: 6px; }
            .mini-button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
                padding: 6px 10px;
                border-radius: 8px;
                border: 1px solid var(--panel-border);
                background: var(--button-bg);
                color: var(--text);
                font-size: 12px;
                cursor: pointer;
                transition: all 0.15s ease;
            }
            .mini-button:hover {
                background: var(--button-hover);
                border-color: color-mix(in srgb, var(--accent2) 35%, var(--panel-border));
            }
            .mini-button.danger { border-color: #ef4444; color: #fecaca; }
            .mini-button.icon-only { width: 26px; height: 26px; padding: 0; }
            .text-field, input[type="text"] {
                width: 100%;
                border: 1px solid var(--panel-border);
                border-radius: 8px;
                padding: 8px 10px;
                background: var(--panel-subtle);
                color: var(--text);
                outline: none;
            }
            .status { font-size: 12px; color: var(--muted); min-height: 16px; }
            .modal-backdrop {
                position: absolute;
                inset: 0;
                display: none;
                align-items: center;
                justify-content: center;
                background: rgba(0,0,0,0.45);
                padding: 12px;
                z-index: 20;
            }
            .modal-backdrop.show { display: flex; }
            .modal {
                position: relative;
                width: 100%;
                max-width: 520px;
                background: var(--panel-bg);
                border: 1px solid var(--panel-border);
                border-radius: 12px;
                box-shadow: var(--panel-shadow);
                padding: 14px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-height: 82vh;
                overflow-y: auto;
            }
            .modal h3 {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                margin: 0;
                font-size: 16px;
                color: var(--text);
            }
            .modal textarea {
                min-height: 120px;
                border: 1px solid var(--panel-border);
                border-radius: 10px;
                background: var(--panel-subtle);
                color: var(--text);
                padding: 10px;
            }
            .modal-close { position: absolute; right: 10px; top: 10px; }
            .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
            .title-dot {
                width: 10px;
                height: 10px;
                border-radius: 999px;
                background: linear-gradient(135deg, var(--accent1), var(--accent2));
                box-shadow: 0 0 12px rgba(83,168,255,0.7);
            }
            .title-dot.small { width: 8px; height: 8px; }
            .sr-only {
                position: absolute;
                width: 1px;
                height: 1px;
                padding: 0;
                margin: -1px;
                overflow: hidden;
                clip: rect(0,0,0,0);
                white-space: nowrap;
                border: 0;
            }
            /* Minimal utility classes used in markup */
            .flex { display: flex; }
            .grid { display: grid; }
            .flex-col { flex-direction: column; }
            .items-center { align-items: center; }
            .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
            .gap-2 { gap: 8px; }
            .gap-3 { gap: 12px; }
            .text-sm { font-size: 13px; line-height: 1.4; }
            .font-semibold { font-weight: 600; }
            .cursor-pointer { cursor: pointer; }
        `;
        shadow.appendChild(extraStyle);

        const shell = document.createElement("div");
        shell.className = "floating-shell";
        shell.dataset.theme = "noir";
        shell.innerHTML = `
            <div class="floating-panel">
                <div class="floating-header">
                    <div class="floating-header-left">
                        <span class="title-dot small"></span>
                        <span class="floating-title">Prompt Link</span>
                    </div>
                    <div class="floating-header-actions">
                        <div class="floating-drag" title="按住拖拽面板" aria-label="拖拽悬浮窗">拖拽</div>
                        <button class="floating-minimize-btn" title="收起悬浮窗" aria-label="收起悬浮窗">×</button>
                    </div>
                </div>
                <div class="panel">
                    <div class="input-card">
                        <textarea
                            id="floating-prompt"
                            placeholder="输入要同步给多个 LLM 的问题"
                        ></textarea>
                        <div class="toolbar">
                            <div class="toolbar-left">
                                <button
                                    class="btn-icon"
                                    id="floating-open-settings"
                                    aria-label="设置"
                                    title="设置"
                                >
                                    <span aria-hidden="true">⚙️</span>
                                </button>
                                <button
                                    class="btn-icon"
                                    id="floating-save-favorite"
                                    aria-label="收藏当前提示词"
                                    title="收藏"
                                >
                                    <span aria-hidden="true">★</span>
                                    <span class="sr-only">收藏</span>
                                </button>
                                <button
                                    class="btn-icon"
                                    id="floating-clear-prompt"
                                    aria-label="清空输入框"
                                    title="清空"
                                >
                                    <span aria-hidden="true">⌫</span>
                                    <span class="sr-only">清空</span>
                                </button>
                            </div>
                            <div class="toolbar-right">
                                <label class="toggle-inline" title="填入后自动发送">
                                    <input type="checkbox" id="floating-auto-send" />
                                    <span>提交</span>
                                </label>
                                <button
                                    class="btn-icon btn-icon-primary"
                                    id="floating-send"
                                    aria-label="填入当前页面"
                                    title="填入当前页面"
                                >
                                    <span aria-hidden="true">✈</span>
                                    <span class="sr-only">填入当前页面</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="accordion" id="floating-favorites-accordion">
                        <button
                            class="accordion-header"
                            id="floating-favorites-header"
                            aria-expanded="false"
                        >
                            <div class="accordion-title">
                                <span class="title-dot small"></span>
                                <span>收藏 (Saved)</span>
                                <span id="floating-favorites-count"></span>
                            </div>
                            <span class="accordion-icon" aria-hidden="true">▸</span>
                        </button>
                        <div
                            class="accordion-body collapsed"
                            id="floating-favorites-body"
                        >
                            <div class="favorites-list" id="floating-favorites-list"></div>
                        </div>
                    </div>

                    <div class="status" id="floating-status"></div>
                </div>

                <div class="modal-backdrop" id="floating-settings-modal">
                    <div class="modal">
                        <h3><span class="title-dot small"></span>设置</h3>
                        <button
                            class="btn-icon modal-close"
                            id="floating-settings-close"
                            aria-label="关闭设置"
                            title="关闭"
                        >
                            <span aria-hidden="true">×</span>
                        </button>

                        <div class="flex flex-col gap-3">
                            <div class="text-sm font-semibold">主题</div>
                            <div class="grid grid-cols-1 gap-2">
                                <label
                                    class="flex items-center gap-2 cursor-pointer text-sm"
                                >
                                    <input
                                        type="radio"
                                        name="floating-theme"
                                        value="noir"
                                        checked
                                    />
                                    <span>Noir Minimal</span>
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer text-sm"
                                >
                                    <input type="radio" name="floating-theme" value="cyber" />
                                    <span>Cyber Glow</span>
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer text-sm"
                                >
                                    <input type="radio" name="floating-theme" value="glass" />
                                    <span>Glass Aurora</span>
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer text-sm"
                                >
                                    <input type="radio" name="floating-theme" value="zen" />
                                    <span>Zen Paper</span>
                                </label>
                            </div>
                        </div>

                        <div class="flex flex-col gap-3">
                            <div class="text-sm font-semibold">注入模式</div>
                            <div class="flex flex-col gap-2">
                                <label
                                    class="flex items-center gap-2 cursor-pointer text-sm"
                                >
                                    <input
                                        type="radio"
                                        name="floating-injection"
                                        value="replace"
                                        checked
                                    />
                                    <span>替换模式（清空原有内容）</span>
                                </label>
                                <label
                                    class="flex items-center gap-2 cursor-pointer text-sm"
                                >
                                    <input
                                        type="radio"
                                        name="floating-injection"
                                        value="append"
                                    />
                                    <span>追加模式（保留原有内容）</span>
                                </label>
                            </div>
                        </div>

                        <div class="flex items-center gap-2">
                            <input type="checkbox" id="floating-show-status" checked />
                            <span class="text-sm">显示状态栏</span>
                        </div>
                    </div>
                </div>

                <div class="modal-backdrop" id="floating-favorite-modal">
                    <div class="modal">
                        <h3><span class="title-dot small"></span>收藏提示词</h3>
                        <input
                            type="text"
                            id="floating-favorite-title-input"
                            class="favorite-title-input text-field"
                            placeholder="可选标题（留空则使用内容生成）"
                        />
                        <textarea
                            id="floating-favorite-prompt-input"
                            placeholder="要收藏的提示词"
                        ></textarea>
                        <div class="modal-actions">
                            <button class="mini-button" id="floating-favorite-cancel">
                                取消
                            </button>
                            <button class="mini-button" id="floating-favorite-save">
                                收藏
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <button
                class="floating-handle"
                title="展开悬浮窗"
                aria-label="展开悬浮窗"
            >
                提示
            </button>
        `;
        shadow.appendChild(shell);
        document.documentElement.appendChild(host);
        floatingHost = host;
        isFloatingMinimized = false;
        window.__multiLLM_floatingPanelMounted = true;

        const promptInput = shell.querySelector("#floating-prompt");
        const sendBtn = shell.querySelector("#floating-send");
        const autoSendCheckbox = shell.querySelector("#floating-auto-send");
        const saveFavoriteBtn = shell.querySelector("#floating-save-favorite");
        const clearPromptBtn = shell.querySelector("#floating-clear-prompt");
        const favoritesListDiv = shell.querySelector("#floating-favorites-list");
        const favoritesCountSpan = shell.querySelector("#floating-favorites-count");
        const favoritesHeader = shell.querySelector("#floating-favorites-header");
        const favoritesBody = shell.querySelector("#floating-favorites-body");
        const favoriteModal = shell.querySelector("#floating-favorite-modal");
        const favoriteTitleInput = shell.querySelector("#floating-favorite-title-input");
        const favoritePromptInput = shell.querySelector("#floating-favorite-prompt-input");
        const favoriteSaveBtn = shell.querySelector("#floating-favorite-save");
        const favoriteCancelBtn = shell.querySelector("#floating-favorite-cancel");
        const themeRadios = shell.querySelectorAll('input[name="floating-theme"]');
        const injectionModeRadios = shell.querySelectorAll('input[name="floating-injection"]');
        const openSettingsBtn = shell.querySelector("#floating-open-settings");
        const settingsModal = shell.querySelector("#floating-settings-modal");
        const settingsCloseBtn = shell.querySelector("#floating-settings-close");
        const showStatusToggle = shell.querySelector("#floating-show-status");
        const statusDiv = shell.querySelector("#floating-status");
        const minimizeBtn = shell.querySelector(".floating-minimize-btn");
        const collapsedHandle = shell.querySelector(".floating-handle");
        const dragHandle = shell.querySelector(".floating-drag");

        if (
            !sendBtn ||
            !promptInput ||
            !statusDiv ||
            !autoSendCheckbox ||
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
            !openSettingsBtn ||
            !settingsModal ||
            !settingsCloseBtn ||
            !minimizeBtn ||
            !collapsedHandle ||
            !shell.querySelector(".floating-drag")
        ) {
            console.warn("[MultiLLM][cs] floating panel init skipped: DOM not ready");
            return;
        }

        let favorites = [];
        let favoritesCollapsed = true;
        let editingFavoriteId = null;
        let injectionMode = "replace";
        let themeName = "noir";
        let showStatus = true;
        let isCollapsed = false;

        // Simple drag support for positioning without covering the whole page
        const dragState = { active: false, startX: 0, startY: 0, originLeft: 0, originTop: 0 };
        const stopDrag = () => {
            if (!dragState.active) return;
            dragState.active = false;
            window.removeEventListener("pointermove", handleDragMove);
            window.removeEventListener("pointerup", stopDrag);
        };
        const handleDragMove = (e) => {
            if (!dragState.active) return;
            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            const nextLeft = Math.max(8, dragState.originLeft + dx);
            const nextTop = Math.max(8, dragState.originTop + dy);
            host.style.left = `${nextLeft}px`;
            host.style.top = `${nextTop}px`;
        };
        const handleDragStart = (e) => {
            if (e.button !== 0) return;
            const rect = host.getBoundingClientRect();
            dragState.active = true;
            dragState.startX = e.clientX;
            dragState.startY = e.clientY;
            dragState.originLeft = rect.left;
            dragState.originTop = rect.top;
            host.style.right = "auto";
            host.style.left = `${rect.left}px`;
            window.addEventListener("pointermove", handleDragMove);
            window.addEventListener("pointerup", stopDrag);
            e.preventDefault();
        };

        const applyCollapsedState = () => {
            shell.classList.toggle("collapsed", isCollapsed);
            if (isCollapsed) {
                host.style.width = "52px";
                host.style.maxWidth = "52px";
            } else {
                host.style.width = "540px";
                host.style.maxWidth = "94vw";
            }
        };

        const applyTheme = (name) => {
            const themeKey = THEME_VARS[name] ? name : "noir";
            const vars = THEME_VARS[themeKey];
            Object.entries(vars).forEach(([key, value]) => {
                shell.style.setProperty(key, value);
            });
            shell.dataset.theme = themeKey;
            themeRadios.forEach((r) => {
                r.checked = r.value === themeKey;
            });
            themeName = themeKey;
        };
        applyTheme(themeName);

        const applyAccordionStates = () => {
            const favIcon = favoritesHeader.querySelector(".accordion-icon");
            favoritesBody.classList.toggle("collapsed", favoritesCollapsed);
            favoritesHeader.setAttribute("aria-expanded", String(!favoritesCollapsed));
            if (favIcon) favIcon.classList.toggle("open", !favoritesCollapsed);
        };
        applyAccordionStates();

        // --- Dock icon (minimized mode) helpers ---
        const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

        const ensureDockIconStyle = () => {
            // Inject a small style tag to control hover/active visuals without relying on page CSS.
            if (document.getElementById("promptlink-dock-style")) return;
            const style = document.createElement("style");
            style.id = "promptlink-dock-style";
            style.textContent = `
                #promptlink-dock-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 16px 0 0 16px;
                    background: #0b0d14;
                    box-shadow: 0 10px 24px rgba(0,0,0,0.35);
                    opacity: 0.95;
                    overflow: hidden;
                    transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
                    cursor: pointer;
                }
                #promptlink-dock-icon:hover {
                    transform: scale(1.03);
                    box-shadow: 0 14px 30px rgba(0,0,0,0.45);
                    opacity: 1;
                }
                #promptlink-dock-icon:active {
                    transform: scale(0.97);
                }
                #promptlink-dock-icon img {
                    position: absolute;
                    inset: 15%;
                    width: 70% !important;
                    height: 70% !important;
                    max-width: none !important;
                    max-height: none !important;
                    display: block !important;
                    object-fit: contain;
                    border-radius: 10px;
                    pointer-events: none;
                }
            `;
            document.documentElement.appendChild(style);
        };

        const createPromptLinkDockIcon = () => {
            // Remove duplicated dock icons, keep only one instance.
            const existingIcons = Array.from(document.querySelectorAll("#promptlink-dock-icon"));
            if (existingIcons.length > 1) {
                existingIcons.slice(1).forEach((el) => el.remove());
            }
            if (existingIcons.length === 1 && existingIcons[0].isConnected) {
                floatingDockIcon = existingIcons[0];
                return floatingDockIcon;
            }

            // Use runtime.getURL to avoid hardcoding extension id and ensure resource can be loaded.
            const iconUrl = getDockIconUrl() || chrome.runtime.getURL("icons/icon-48.png");
            const icon = document.createElement("div");
            icon.id = "promptlink-dock-icon";
            const size = 48;
            ensureDockIconStyle();
            Object.assign(icon.style, {
                position: "fixed",
                right: "0px",
                top: `${dockIconTop}px`,
                width: `${size}px`,
                height: `${size}px`,
                zIndex: "2147483647",
                display: "none",
            });
            const img = document.createElement("img");
            img.alt = "Prompt Link";
            img.src = iconUrl;
            // 防御站点全局 CSS：显式设置宽高、display、max-*，避免被覆盖为 0。
            img.style.setProperty("width", "70%", "important");
            img.style.setProperty("height", "70%", "important");
            img.style.setProperty("display", "block", "important");
            img.style.setProperty("max-width", "none", "important");
            img.style.setProperty("max-height", "none", "important");
            Object.assign(img.style, {
                objectFit: "contain",
                position: "absolute",
                inset: "15%",
                pointerEvents: "none",
            });
            icon.appendChild(img);
            document.body.appendChild(icon);
            floatingDockIcon = icon;
            return icon;
        };

        const ensureDockIcon = () => {
            const icon = createPromptLinkDockIcon();
            const size = 48;
            let dragging = false;
            let startY = 0;
            let originTop = dockIconTop;
            let moved = false;
            const moveThreshold = 4;

            const onMove = (e) => {
                if (!dragging) return;
                const dy = e.clientY - startY;
                if (Math.abs(dy) > moveThreshold) moved = true;
                const nextTop = clamp(
                    originTop + dy,
                    8,
                    Math.max(8, window.innerHeight - size - 8)
                );
                dockIconTop = nextTop;
                icon.style.top = `${dockIconTop}px`;
            };
            const onUp = () => {
                if (!dragging) return;
                dragging = false;
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                if (!moved) {
                    restoreFromDock();
                }
            };

            icon.onpointerdown = (e) => {
                if (e.button !== 0) return;
                dragging = true;
                startY = e.clientY;
                originTop = dockIconTop;
                moved = false;
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
                e.preventDefault();
            };

            return icon;
        };

        const showDockIcon = () => {
            const icon = ensureDockIcon();
            const size = icon.offsetHeight || 48;
            dockIconTop = clamp(
                dockIconTop,
                8,
                Math.max(8, window.innerHeight - size - 8)
            );
            icon.style.top = `${dockIconTop}px`;
            icon.style.display = "block";
        };

        function hideDockIcon() {
            if (floatingDockIcon) {
                floatingDockIcon.style.display = "none";
            }
        }

        const minimizeToDock = () => {
            if (!floatingHost) return;
            isFloatingMinimized = true;
            const rect = floatingHost.getBoundingClientRect();
            dockIconTop = clamp(rect.top, 8, Math.max(8, window.innerHeight - 56));
            floatingHost.style.display = "none";
            showDockIcon();
        };

        const restoreFromDock = () => {
            if (!floatingHost) return;
            isFloatingMinimized = false;
            hideDockIcon();
            floatingHost.style.display = "block";
            floatingHost.style.right = "16px";
            floatingHost.style.left = "auto";
            floatingHost.style.top = `${clamp(dockIconTop - 20, 8, Math.max(8, window.innerHeight - 200))}px`;
        };

        hideDockIcon();

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

        const persistFavorites = () => {
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
                    sendBtn.title = "发送到当前页面";
                    sendBtn.setAttribute("aria-label", "发送到当前页面");
                    sendBtn.textContent = "✈";
                    sendBtn.addEventListener("click", () => {
                        sendPromptToCurrent(fav.text, {
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

        const sendPromptToCurrent = (promptText, { clearInput, forceAutoSend } = {}) => {
            const normalized = typeof promptText === "string" ? promptText.trim() : "";
            if (!normalized) {
                setStatus("请输入内容再发送。");
                return;
            }
            const autoSend =
                typeof forceAutoSend === "boolean"
                    ? forceAutoSend
                    : autoSendCheckbox.checked;
            let ok = false;
            try {
                ok = fillPrompt(normalized, autoSend, injectionMode);
            } catch (e) {
                ok = false;
            }
            if (clearInput) {
                promptInput.value = "";
                cachePrompt("");
            }
            if (ok) {
                setStatus(autoSend ? "已填入并尝试提交当前页面。" : "已填入当前页面。");
            } else {
                setStatus("未找到可填写的输入框。");
            }
        };

        const sendPromptHandler = () => {
            const prompt = promptInput.value.trim();
            if (!prompt) {
                setStatus("请输入内容再发送。");
                return;
            }
            sendPromptToCurrent(prompt, { clearInput: true });
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

        // Event bindings
        sendBtn.addEventListener("click", sendPromptHandler);
        saveFavoriteBtn.addEventListener("click", () => {
            openFavoriteModal(promptInput.value, "");
        });
        clearPromptBtn.addEventListener("click", clearPrompt);
        favoriteSaveBtn.addEventListener("click", saveFavoriteFromModal);
        favoriteCancelBtn.addEventListener("click", closeFavoriteModal);
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
            favoritesCollapsed = !favoritesCollapsed;
            applyAccordionStates();
        });

        // Enter to send
        promptInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                sendPromptHandler();
            }
        });

        // Cache prompt
        promptInput.addEventListener("input", () => {
            cachePrompt(promptInput.value);
        });

        // Cache auto send
        autoSendCheckbox.addEventListener("change", () => {
            chrome.storage.local.set({ [AUTO_SEND_PREF_KEY]: autoSendCheckbox.checked });
        });

        // Settings UI Logic
        openSettingsBtn.addEventListener("click", () => {
            settingsModal.classList.add("show");
        });
        settingsCloseBtn.addEventListener("click", () => {
            settingsModal.classList.remove("show");
        });
        settingsModal.addEventListener("click", (e) => {
            if (e.target === settingsModal) settingsModal.classList.remove("show");
        });
        injectionModeRadios.forEach((radio) => {
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
        dragHandle.addEventListener("pointerdown", handleDragStart);
        minimizeBtn.addEventListener("click", () => {
            minimizeToDock();
        });
        collapsedHandle.addEventListener("click", () => {
            restoreFromDock();
        });

        // Restore state from storage
        chrome.storage.local.get(
            [
                PROMPT_STORAGE_KEY,
                FAVORITES_STORAGE_KEY,
                AUTO_SEND_PREF_KEY,
                INJECTION_MODE_KEY,
                THEME_PREF_KEY,
                STATUS_PREF_KEY,
            ],
            (res) => {
                const cached = res?.[PROMPT_STORAGE_KEY];
                if (typeof cached === "string") {
                    promptInput.value = cached;
                }

                const autoSendPref = res?.[AUTO_SEND_PREF_KEY];
                if (typeof autoSendPref === "boolean") {
                    autoSendCheckbox.checked = autoSendPref;
                }

                const modePref = res?.[INJECTION_MODE_KEY];
                if (modePref === "replace" || modePref === "append") {
                    injectionMode = modePref;
                }
                injectionModeRadios.forEach((r) => {
                    r.checked = r.value === injectionMode;
                });

                const themePref = res?.[THEME_PREF_KEY];
                if (typeof themePref === "string") {
                    applyTheme(themePref);
                } else {
                    applyTheme(themeName);
                }

                const statusPref = res?.[STATUS_PREF_KEY];
                if (typeof statusPref === "boolean") {
                    showStatus = statusPref;
                }
                showStatusToggle.checked = showStatus;
                updateStatusVisibility();

                const storedFavorites = res?.[FAVORITES_STORAGE_KEY];
                if (Array.isArray(storedFavorites)) {
                    favorites = storedFavorites
                        .map((f) => ({
                            id: String(f.id || makeFavoriteId()),
                            text: typeof f.text === "string" ? f.text.trim() : "",
                            title: f.title,
                        }))
                        .filter((f) => f.text.trim())
                        .map((f) => ({
                            ...f,
                            title: computeTitle(f.text, f.title),
                        }));
                }
                renderFavorites();
                applyAccordionStates();
            }
        );

        // Make sure collapsed handle state is applied once
        applyCollapsedState();
    }

    const ensureFloatingPanelEnabled = async () => {
        const enabled = await readFloatingEnabled();
        if (enabled === false) {
            removeFloatingPanel();
            return;
        }
        initFloatingPanel();
    };

    ensureFloatingPanelEnabled();

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        if (Object.prototype.hasOwnProperty.call(changes, FLOATING_PREF_KEY)) {
            const next = changes[FLOATING_PREF_KEY].newValue;
            if (next === false) {
                removeFloatingPanel();
            } else {
                ensureFloatingPanelEnabled();
            }
        }
    });

    // Prevent duplicate listeners
    if (!window.hasMultiLLMListener_v5) {
        window.hasMultiLLMListener_v5 = true;
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg.type === "BROADCAST_PROMPT_V5") {
                console.log("[MultiLLM] got BROADCAST_PROMPT_V5", msg);
                const promptValue =
                    typeof msg.prompt === "string" ? msg.prompt : "";
                if (!promptValue.trim()) {
                    sendResponse({ ok: false, reason: "empty_prompt" });
                    return;
                }
                const ok = fillPrompt(promptValue, msg.autoSend, msg.injectionMode);
                sendResponse({ ok });
                return;
            }
            if (msg.type === "MULTILLMSYNCER_TOGGLE_FLOATING") {
                if (msg.enabled === false) {
                    removeFloatingPanel();
                } else {
                    ensureFloatingPanelEnabled();
                }
                return;
            }
            // Do not signal async for unhandled messages to avoid "message channel closed" errors.
        });
    }
}
