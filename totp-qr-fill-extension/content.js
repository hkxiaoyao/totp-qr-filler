(() => {
  if (globalThis.__ephemeral2faQrFillerLoaded && typeof globalThis.ephemeral2faFillCode === "function") {
    return;
  }

  globalThis.__ephemeral2faQrFillerLoaded = true;
  globalThis.ephemeral2faFillCode = fillOtpCode;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "EPHEMERAL_2FA_FILL_CODE") {
      return false;
    }

    const code = String(message.code ?? "").trim();
    if (!/^\d{4,10}$/.test(code)) {
      sendResponse({ ok: false, reason: "验证码格式异常。" });
      return false;
    }

    const result = fillOtpCode(code);
    sendResponse(result);
    return false;
  });

  function fillOtpCode(code) {
    const activeField = getDeepActiveElement();
    if (isUsableInput(activeField) && activeField.maxLength !== 1) {
      setInputValue(activeField, code);
      return { ok: true, mode: "active" };
    }

    const oneField = findSingleOtpInput();
    if (oneField) {
      setInputValue(oneField, code);
      return { ok: true, mode: "single" };
    }

    const fields = findSplitOtpInputs(code.length);
    if (fields.length >= code.length) {
      fields.slice(0, code.length).forEach((field, index) => {
        setInputValue(field, code[index]);
      });
      return { ok: true, mode: "split" };
    }

    return { ok: false, reason: "没有找到可填充的验证码输入框。" };
  }

  function findSingleOtpInput() {
    const selectors = [
      'input[autocomplete="one-time-code"]',
      'input[inputmode="numeric"][maxlength="6"]',
      'input[inputmode="numeric"][maxlength="8"]',
      'input[aria-label*="verification" i]',
      'input[aria-label*="authenticator" i]',
      'input[aria-label*="验证码" i]',
      'input[placeholder*="verification" i]',
      'input[placeholder*="authenticator" i]',
      'input[placeholder*="验证码" i]',
      'input[class*="otp" i]',
      'input[class*="code" i]',
      'input[name*="otp" i]',
      'input[id*="otp" i]',
      'input[name*="totp" i]',
      'input[id*="totp" i]',
      'input[name*="auth" i]',
      'input[id*="auth" i]',
      'input[name*="code" i]',
      'input[id*="code" i]'
    ];

    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (isUsableInput(input) && input.maxLength !== 1) {
        return input;
      }
    }

    return findLikelySingleOtpInput();
  }

  function findSplitOtpInputs(codeLength) {
    const candidates = Array.from(
      document.querySelectorAll('input:not([type]), input[type="text"], input[type="tel"], input[type="number"]')
    ).filter((input) => {
      if (!isUsableInput(input)) {
        return false;
      }

      const maxLength = Number(input.getAttribute("maxlength") || "0");
      const size = Number(input.getAttribute("size") || "0");
      return isVisible(input) && (maxLength === 1 || size === 1 || input.inputMode === "numeric");
    });

    return candidates.slice(0, Math.max(codeLength, 0));
  }

  function findLikelySingleOtpInput() {
    const inputs = Array.from(
      document.querySelectorAll('input:not([type]), input[type="text"], input[type="tel"], input[type="number"], input[type="password"]')
    ).filter((input) => isUsableInput(input) && isVisible(input) && input.maxLength !== 1);

    const scored = inputs
      .map((input) => ({ input, score: scoreOtpInput(input) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0]?.input ?? null;
  }

  function scoreOtpInput(input) {
    const text = [
      input.name,
      input.id,
      input.className,
      input.placeholder,
      input.autocomplete,
      input.ariaLabel,
      input.getAttribute("data-testid"),
      input.getAttribute("data-test")
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    let score = 0;
    if (/\b(otp|totp|mfa|2fa)\b/.test(text)) score += 6;
    if (/(verification|verify|authenticator|security|code|passcode|one-time|onetime|验证码|动态码|安全码)/.test(text)) score += 4;
    if (input.inputMode === "numeric") score += 2;
    if ([6, 7, 8].includes(input.maxLength)) score += 2;
    return score;
  }

  function isUsableInput(input) {
    if (!(input instanceof HTMLInputElement)) {
      return false;
    }

    const type = (input.getAttribute("type") || "text").toLowerCase();
    return !input.disabled && !input.readOnly && ["text", "tel", "number", "password", "search"].includes(type);
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function getDeepActiveElement(root = document) {
    let activeElement = root.activeElement;

    while (activeElement?.shadowRoot?.activeElement) {
      activeElement = activeElement.shadowRoot.activeElement;
    }

    return activeElement;
  }

  function setInputValue(input, value) {
    input.focus();

    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor?.set?.call(input, value);

    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
})();
