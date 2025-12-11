// 防止同一个页面被注入多次时，注册多个监听器
if (window.__multiLLM_cs_installed_v5) {
    console.log("[MultiLLM][cs] duplicate load (v5), skip init on", location.href);
} else {
    window.__multiLLM_cs_installed_v5 = true;
    console.log("[MultiLLM][cs] loaded on", location.href);

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
                    return true;
                }
                const ok = fillPrompt(promptValue, msg.autoSend, msg.injectionMode);
                sendResponse({ ok });
            }
            return true;
        });
    }
}
