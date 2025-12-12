const LLM_PREFS_KEY = "multiLLM_llmPreferences";

const LLM_MATCH = /chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|doubao\.com|chat\.deepseek\.com|kimi\.moonshot\.cn|kimi\.com|kimi\.ai/;

function isTabEnabled(prefs, tabId) {
    const key = String(tabId);
    const pref = prefs?.[key];
    if (!pref) return true; // 默认启用
    if (typeof pref.enabled === "boolean") return pref.enabled;
    if (typeof pref.disabled === "boolean") return !pref.disabled;
    return true;
}

const tabsQuery = (queryInfo) =>
    new Promise((resolve) => chrome.tabs.query(queryInfo, resolve));

const getStorage = (keys) =>
    new Promise((resolve) => chrome.storage.local.get(keys, resolve));

const executeScriptSafe = (tabId, file) =>
    new Promise((resolve) => {
        chrome.scripting.executeScript(
            { target: { tabId }, files: [file] },
            () => resolve() // ignore errors; content_script may already exist
        );
    });

const sendPromptToTab = (tabId, prompt, autoSend, injectionMode) =>
    new Promise((resolve) => {
        chrome.tabs.sendMessage(
            tabId,
            { type: "BROADCAST_PROMPT_V5", prompt, autoSend, injectionMode },
            (response) => {
                if (chrome.runtime.lastError) {
                    resolve(false);
                    return;
                }
                resolve(Boolean(response && response.ok));
            }
        );
    });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type !== "MULTI_BROADCAST_FROM_FLOATING") return;

    (async () => {
        const prompts = Array.isArray(msg.prompts)
            ? msg.prompts
                  .map((p) => (typeof p === "string" ? p.trim() : ""))
                  .filter(Boolean)
            : [];
        if (!prompts.length) {
            sendResponse({ ok: false, reason: "empty_prompts" });
            return;
        }

        const autoSend = msg.autoSend === true;
        const injectionMode = msg.injectionMode === "append" ? "append" : "replace";

        const [tabList, store] = await Promise.all([
            tabsQuery({ currentWindow: true }),
            getStorage([LLM_PREFS_KEY]),
        ]);

        const prefs = store?.[LLM_PREFS_KEY] || {};
        const targetTabs = tabList.filter(
            (t) => t.id && t.url && LLM_MATCH.test(t.url) && isTabEnabled(prefs, t.id)
        );

        if (!targetTabs.length) {
            sendResponse({ ok: false, reason: "no_targets" });
            return;
        }

        // Ensure content scripts and broadcast
        const total = prompts.length * targetTabs.length;
        let success = 0;
        for (const tab of targetTabs) {
            await executeScriptSafe(tab.id, "contentScript.js");
            for (const p of prompts) {
                const ok = await sendPromptToTab(tab.id, p, autoSend, injectionMode);
                if (ok) success += 1;
            }
        }

        sendResponse({
            ok: true,
            targetCount: targetTabs.length,
            totalAttempts: total,
            success,
        });
    })();

    // Keep the message channel open for async sendResponse
    return true;
});
