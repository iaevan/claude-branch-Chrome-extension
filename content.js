// Claude Branch Chat - Content Script v1.0.3
(function () {
  const PROCESSED_ATTR = "data-branch-done";
  const BRANCH_BTN_CLASS = "claude-branch-btn";

  // ── Confirmed selectors from actual Claude DOM ─────────────────────────────
  const USER_SEL = '[class*="font-user-message"]';
  const AI_SEL   = 'div.font-claude-response';
  const ALL_SEL  = `${USER_SEL}, ${AI_SEL}`;

  function getMessageEls() {
    return Array.from(document.querySelectorAll(ALL_SEL));
  }

  function getRoleOf(el) {
    const cls = el.className || "";
    if (cls.includes("font-user-message")) return "You";
    if (cls.includes("font-claude-response relative")) return "Claude";
    return "Unknown";
  }

function extractMessagesUpTo(targetEl) {
  const all = getMessageEls();
  const messages = [];
  
  for (const el of all) {
    // 1. Clone the element so we don't mess up the actual UI
    const clone = el.cloneNode(true);
    
    // 2. Find and remove the branch button from the clone
    const btnInClone = clone.querySelector("." + BRANCH_BTN_CLASS);
    if (btnInClone) {
      btnInClone.remove();
    }
    
    // 3. Now get the text—it will be clean of "Branch here"
    const text = (clone.innerText || "").trim();
    
    if (text) messages.push({ role: getRoleOf(el), text });
    
    if (el === targetEl || el.contains(targetEl) || targetEl.contains(el)) break;
  }
  return messages;
}

  function formatAsMarkdown(messages) {
    const lines = [
      "# Branched Conversation Context",
      "",
      "> Context from another Claude conversation. Acknowledge you have it and wait for my next question.",
      "",
      "---",
      "",
    ];
    for (const msg of messages) {
      lines.push(`### ${msg.role}`);
      lines.push(msg.text);
      lines.push("");
    }
    lines.push("---");
    lines.push("_Branched from main conversation._");
    return lines.join("\n");
  }

  async function branchFrom(targetEl) {
    const messages = extractMessagesUpTo(targetEl);
    if (!messages.length) { showToast("⚠️ Couldn't read messages."); return; }
    const markdown = formatAsMarkdown(messages);
    const key = `claude_branch_${Date.now()}`;
    try { localStorage.setItem(key, markdown); } catch (e) {}
    try {
      await navigator.clipboard.writeText(markdown);
      showToast(`✅ Copied ${messages.length} messages! Opening new chat…`);
    } catch (e) {
      showToast(`Opening new chat with ${messages.length} messages…`);
    }
    setTimeout(() => window.open(`https://claude.ai/new#branch=${key}`, "_blank"), 400);
  }

  function tryAutoFill() {
    const hash = window.location.hash || "";
    if (!hash.startsWith("#branch=")) return;
    const key = hash.slice("#branch=".length);
    let context = null;
    try { context = localStorage.getItem(key); if (context) localStorage.removeItem(key); } catch (e) {}
    if (!context) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("claude_branch_")) { context = localStorage.getItem(k); localStorage.removeItem(k); break; }
        }
      } catch (e) {}
    }
    if (!context) { showToast("📋 Context is in your clipboard — paste it!"); return; }
    waitForInput((el) => setTimeout(() => fillInput(el, context), 1000));
  }

  function waitForInput(cb, timeout = 8000) {
    const sel = 'div[contenteditable="true"]';
    const found = document.querySelector(sel);
    if (found) return cb(found);
    const obs = new MutationObserver(() => {
      const el = document.querySelector(sel);
      if (el) { obs.disconnect(); cb(el); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), timeout);
  }

  function fillInput(el, text) {
    try {
      el.focus();
      el.innerHTML = "";
      document.execCommand("insertText", false, text);
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      showToast("✅ Context loaded! Press Send when ready.");
    } catch (e) {
      showToast("📋 Paste the clipboard content into the chat.");
    }
  }

  function injectBranchButton(el) {
    if (el.hasAttribute(PROCESSED_ATTR)) return;
    if (el.querySelector("." + BRANCH_BTN_CLASS)) return;
    if ((el.innerText || "").trim().length < 10) return;
    el.setAttribute(PROCESSED_ATTR, "true");

    const btn = document.createElement("button");
    btn.className = BRANCH_BTN_CLASS;
    btn.title = "Branch conversation from here";
    btn.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="6" y1="3" x2="6" y2="15"/>
        <circle cx="18" cy="6" r="3"/>
        <circle cx="6" cy="18" r="3"/>
        <path d="M18 9a9 9 0 0 1-9 9"/>
      </svg>
      Branch here
    `;
    btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); branchFrom(el); });
    el.appendChild(btn);
  }

  let scanTimer = null;
  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => getMessageEls().forEach(injectBranchButton), 400);
  }

  function showToast(msg) {
    document.querySelector(".claude-branch-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "claude-branch-toast";
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 400); }, 4500);
  }

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; setTimeout(() => { tryAutoFill(); scheduleScan(); }, 700); }
  }).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });

  tryAutoFill();
  scheduleScan();
})();
