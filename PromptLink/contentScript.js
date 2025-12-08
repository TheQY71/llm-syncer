// 防止同一个页面被注入多次时，注册多个监听器
if (window.__multiLLM_cs_installed) {
    console.log("[MultiLLM][cs] duplicate load, skip init on", location.href);
} else {
    window.__multiLLM_cs_installed = true;
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

    function fillForClaude(prompt, autoSend) {
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

        // 3. 清空原有内容（去掉 placeholder）
        editor.innerHTML = "";

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

    function fillForGemini(prompt, autoSend) {
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

        // 2. 聚焦
        editor.focus();

        // 3. 写入内容：按行拆成多个 <p>，匹配 Quill 的结构
        editor.innerHTML = buildParagraphHTML(prompt);

        // 4. 触发 input / change 事件，让框架知道内容变了
        try {
            editor.dispatchEvent(
                new InputEvent("input", {
                    bubbles: true,
                    inputType: "insertText",
                    data: prompt,
                })
            );
        } catch (e) {
            // 有些环境没有 InputEvent 构造器
            editor.dispatchEvent(new Event("input", { bubbles: true }));
        }

        editor.dispatchEvent(new Event("change", { bubbles: true }));

        console.log("[MultiLLM] Gemini prompt filled");

        // 让光标停在文本末尾，便于继续输入或检查
        placeCaretAtEnd(editor);

        // 5. 自动发送（可选）
        if (autoSend === true) {
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

        return true;
    }

    function fillForChatGPT(prompt, autoSend) {
        console.log("[MultiLLM] ChatGPT detected, trying to fill prompt");

        const findChatGptEditor = () => {
            const isVisible = (el) => {
                if (!el) return false;
                const style = window.getComputedStyle(el);
                return style.display !== "none" && style.visibility !== "hidden";
            };
            const selectors = [
                // 优先可见的 ProseMirror
                '.wcDTda_prosemirror-parent .ProseMirror[contenteditable="true"]',
                '#prompt-textarea.ProseMirror[contenteditable="true"]',
                'div.ProseMirror[contenteditable="true"]',
                'div[contenteditable="true"][data-testid="prompt-textarea"]',
                'div[role="textbox"][data-testid="prompt-textarea"]',
                // 再尝试 textarea（新版隐藏 fallback）
                'textarea#prompt-textarea',
                'textarea[name="prompt-textarea"]',
                'textarea[data-testid="prompt-textarea"]',
                'textarea[aria-label^="Message"]',
            ];
            const seen = new Set();
            const candidates = [];
            selectors.forEach((sel) => {
                const el = document.querySelector(sel);
                if (el && !seen.has(el)) {
                    seen.add(el);
                    candidates.push(el);
                }
            });
            const visible = candidates.find(isVisible);
            return visible || candidates[0] || null;
        };

        // 1. 精确匹配 ChatGPT 的输入区域（textarea 或 ProseMirror）
        const editor = findChatGptEditor();

        if (!editor) {
            console.log("[MultiLLM] ChatGPT editor not found");
            return false;
        }

        console.log("[MultiLLM] ChatGPT editor found:", editor);

        const isTextArea = editor.tagName === "TEXTAREA";
        const normalizedTarget = normalizeText(prompt);
        const getCurrentText = () =>
            normalizeText(
                isTextArea
                    ? editor.value || editor.textContent || ""
                    : editor.textContent || ""
            );
        let enforceTextForSend = null;

        if (isTextArea) {
            // textarea 流程（新版 ChatGPT）
            editor.focus();
            editor.value = "";
            editor.value = prompt;
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

            enforceTextForSend = () => {
                editor.value = prompt;
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
            };
        } else {
            // 旧版 ProseMirror 流程
            const clearEditor = () => {
                try {
                    document.execCommand("selectAll", false, null);
                    document.execCommand("delete", false, null);
                } catch (e) {
                    /* ignore */
                }
                editor.innerHTML = "";
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(editor);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            };

            const writeDom = () => {
                editor.innerHTML = buildParagraphHTML(prompt);
            };
            enforceTextForSend = () => {
                writeDom();
                fireInputAndChange();
            };

            const tryPasteText = () => {
                try {
                    const dt = new DataTransfer();
                    dt.setData("text/plain", prompt);
                    const pasteEvent = new ClipboardEvent("paste", {
                        bubbles: true,
                        cancelable: true,
                        clipboardData: dt,
                    });
                    return editor.dispatchEvent(pasteEvent);
                } catch (e) {
                    return false;
                }
            };

            const fireInputAndChange = () => {
                editor.dispatchEvent(new Event("input", { bubbles: true }));
                editor.dispatchEvent(new Event("change", { bubbles: true }));
            };

            const writeByExec = () => {
                clearEditor();
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(editor);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
                let ok = true;
                try {
                    ok = document.execCommand("insertText", false, prompt) && ok;
                } catch (e) {
                    ok = false;
                }
                return ok && normalizeText(editor.textContent) === normalizedTarget;
            };

            const writeByDom = () => {
                clearEditor();
                writeDom();
                return normalizeText(editor.textContent) === normalizedTarget;
            };

            editor.focus();

            // 先清空再写，避免旧内容残留
            clearEditor();

            let wrote = false;
            if (tryPasteText()) {
                wrote = normalizeText(editor.textContent) === normalizedTarget;
            }
            if (!wrote) wrote = writeByExec();
            if (!wrote) wrote = writeByDom();

            fireInputAndChange();

            setTimeout(() => {
                if (normalizeText(editor.textContent) !== normalizedTarget) {
                    console.log("[MultiLLM] ChatGPT enforce final DOM write");
                    writeDom();
                    fireInputAndChange();
                }
            }, 0);
        }

        console.log("[MultiLLM] ChatGPT prompt filled");

        // 6. 自动发送（可选）
        if (autoSend === true) {
            // 发送按钮有几种状态：voice / send，类名一样，但图标不同
            const findSendButton = () => {
                const selectors = [
                    'button[data-testid="send-button"]',
                    "#composer-submit-button",
                    "button.composer-submit-button-color",
                    'button[aria-label="Send prompt"]',
                    'button[aria-label^="Send message"]',
                    'button[aria-label^="Send"]',
                    'button[type="submit"]',
                ];
                const seen = new Set();
                const candidates = [];
                selectors.forEach((sel) => {
                    document.querySelectorAll(sel).forEach((btn) => {
                        if (!btn || seen.has(btn)) return;
                        seen.add(btn);
                        candidates.push(btn);
                    });
                });
                const visible = candidates.find((btn) => {
                    const style = window.getComputedStyle(btn);
                    return (
                        style.display !== "none" &&
                        style.visibility !== "hidden" &&
                        btn.offsetParent !== null
                    );
                });
                return visible || candidates[0] || null;
            };

            const tryClick = () => {
                const sendButton = findSendButton();
                if (!sendButton) {
                    console.log("[MultiLLM] ChatGPT send button not found");
                    return false;
                }
                const disabled =
                    sendButton.disabled ||
                    sendButton.getAttribute("aria-disabled") === "true";
                if (disabled) {
                    console.log("[MultiLLM] ChatGPT send button disabled");
                    return false;
                }
                console.log("[MultiLLM] ChatGPT send button found, clicking");
                sendButton.click();
                return true;
            };

            const ensureReadyThenSend = (attempt = 0) => {
                const current = getCurrentText();
                if (current !== normalizedTarget) {
                    if (enforceTextForSend) enforceTextForSend();
                    if (attempt < 4) {
                        setTimeout(
                            () => ensureReadyThenSend(attempt + 1),
                            60 * (attempt + 1)
                        );
                        return;
                    }
                    console.log(
                        "[MultiLLM] ChatGPT text mismatch before send, force sending",
                        current
                    );
                }
                if (tryClick()) return;
                if (attempt < 3) {
                    setTimeout(
                        () => ensureReadyThenSend(attempt + 1),
                        80 * (attempt + 1)
                    );
                }
            };

            ensureReadyThenSend();
        }

        return true;
    }

    function fillForDoubao(prompt, autoSend) {
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
        textarea.value = prompt;
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

    function fillForDeepSeek(prompt, autoSend) {
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
        textarea.value = prompt;
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

    function fillForKimi(prompt, autoSend) {
        console.log("[MultiLLM] Kimi detected, trying to fill prompt");

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
        const normalizedTarget = normalizeText(targetText);

        // 如果已经是目标内容，避免重复写入
        if (normalizeText(editor.textContent) === normalizedTarget) {
            editor.dispatchEvent(new Event("input", { bubbles: true }));
            editor.dispatchEvent(new Event("change", { bubbles: true }));
            console.log("[MultiLLM] Kimi already has target text");
            return true;
        }

        // 尝试通过粘贴事件写入，Lexical 对 paste 支持较好
        const tryPasteText = (text) => {
            try {
                const dt = new DataTransfer();
                dt.setData("text/plain", text);
                const pasteEvent = new ClipboardEvent("paste", {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: dt,
                });
                return editor.dispatchEvent(pasteEvent);
            } catch (e) {
                return false;
            }
        };

        const clearEditor = () => {
            try {
                document.execCommand("selectAll", false, null);
                document.execCommand("delete", false, null);
            } catch (e) {
                /* ignore */
            }
            editor.innerHTML = "";
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        };
        const writeDom = () => {
            editor.innerHTML = buildParagraphHTML(targetText);
        };

        const fireInputAndChange = () => {
            editor.dispatchEvent(new Event("input", { bubbles: true }));
            editor.dispatchEvent(new Event("change", { bubbles: true }));
        };

        const enforceDom = () => {
            clearEditor();
            writeDom();
            fireInputAndChange();
        };

        const dedupeIfRepeated = (text) => {
            const first = text.indexOf(normalizedTarget);
            if (first === -1) return false;
            const second = text.indexOf(
                normalizedTarget,
                first + normalizedTarget.length
            );
            return second !== -1;
        };

        const stabilize = (attempt = 0, maxAttempts = 4) => {
            const current = normalizeText(editor.textContent);
            if (current === normalizedTarget) {
                console.log("[MultiLLM] Kimi final text =", editor.textContent);
                if (autoSend === true) {
                    const sendButton =
                        document.querySelector('button[aria-label="发送"]') ||
                        document.querySelector('button[class*="send"]') ||
                        document.querySelector('button[type="submit"]') ||
                        document.querySelector(".send-button-container .send-button");

                    if (!sendButton) {
                        console.log("[MultiLLM] Kimi send button not found");
                        return;
                    }
                    if (sendButton.disabled) {
                        console.log("[MultiLLM] Kimi send button disabled");
                        return;
                    }

                    console.log("[MultiLLM] Kimi send button found, clicking");
                    sendButton.click();
                }
                return;
            }

            if (dedupeIfRepeated(current)) {
                console.log("[MultiLLM] Kimi dedupe repeated content");
                enforceDom();
                setTimeout(
                    () => stabilize(attempt + 1, maxAttempts),
                    40 * (attempt + 1)
                );
                return;
            }

            if (attempt >= maxAttempts) {
                console.log(
                    "[MultiLLM] Kimi stabilize failed, text =",
                    editor.textContent
                );
                return;
            }

            enforceDom();
            const delay = 40 * (attempt + 1);
            setTimeout(() => stabilize(attempt + 1, maxAttempts), delay);
        };

        const pasted = tryPasteText(targetText);
        if (!pasted) {
            enforceDom();
        }
        setTimeout(() => stabilize(0, 4), 30);

        return true;
    }

    function fillPrompt(prompt, autoSend) {
        const shouldAutoSend = autoSend === true;
        const url = window.location.href;
        console.log("[MultiLLM] fillPrompt on", url);

        if (/chatgpt\.com|chat\.openai\.com/.test(url)) {
            return fillForChatGPT(prompt, shouldAutoSend);
        } else if (/claude\.ai/.test(url)) {
            return fillForClaude(prompt, shouldAutoSend);
        } else if (/gemini\.google\.com/.test(url)) {
            return fillForGemini(prompt, shouldAutoSend);
        } else if (/doubao\.com/.test(url)) {
            return fillForDoubao(prompt, shouldAutoSend);
        } else if (/chat\.deepseek\.com/.test(url)) {
            return fillForDeepSeek(prompt, shouldAutoSend);
        } else if (/kimi\.moonshot\.cn|kimi\.com|kimi\.ai/.test(url)) {
            return fillForKimi(prompt, shouldAutoSend);
        }

        // fallback ...
        const textarea = document.querySelector("textarea");
        if (!textarea) return false;
        textarea.focus();
        textarea.value = prompt;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
    }

    // Prevent duplicate listeners
    if (!window.hasMultiLLMListener) {
        window.hasMultiLLMListener = true;
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg.type === "BROADCAST_PROMPT") {
                console.log("[MultiLLM] got BROADCAST_PROMPT", msg);
                const promptValue =
                    typeof msg.prompt === "string" ? msg.prompt : "";
                if (!promptValue.trim()) {
                    sendResponse({ ok: false, reason: "empty_prompt" });
                    return true;
                }
                const ok = fillPrompt(promptValue, msg.autoSend);
                sendResponse({ ok });
            }
            return true;
        });
    }
}
