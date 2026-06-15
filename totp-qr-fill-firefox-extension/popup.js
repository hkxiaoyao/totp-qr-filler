const scanButton = document.querySelector("#scanButton");
const copyButton = document.querySelector("#copyButton");
const codePanel = document.querySelector("#codePanel");
const codeValue = document.querySelector("#codeValue");
const timeValue = document.querySelector("#timeValue");
const statusNode = document.querySelector("#status");
let activeOtp = null;
let activeTabId = null;
let refreshTimerId = 0;
let lastCode = "";
let lastCounter = -1;

scanButton.addEventListener("click", () => {
  scanAndFill().catch((error) => {
    setStatus(error.message || "处理失败。");
  });
});

copyButton.addEventListener("click", async () => {
  const code = codeValue.textContent.trim();
  if (!code) {
    return;
  }

  const copied = await copyCodeToClipboard(code);
  setStatus(copied ? "验证码已复制。" : "复制失败，请手动选择验证码复制。");
});

restoreStoredOtp().catch((error) => {
  setStatus(error.message || "恢复验证码失败。");
});

async function scanAndFill() {
  scanButton.disabled = true;
  stopRefreshing();
  showCode("", "");

  try {
    setStatus("正在读取当前页面截图...");

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:\/\//i.test(tab.url)) {
      throw new Error("请在普通 http/https 页面上使用。");
    }

    await injectContentScript(tab.id);

    const screenshotUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    setStatus("正在识别二维码...");

    const qrText = await detectQrFromDataUrl(screenshotUrl);
    const otp = parseOtpAuthUrl(qrText);

    setStatus("正在生成验证码...");
    activeOtp = otp;
    activeTabId = tab.id;
    await saveActiveOtp(otp);
    const code = await refreshCode({ fillPage: true });

    setStatus("正在填入页面...");
    const response = await fillCodeInPage(activeTabId, code);

    if (!response?.ok) {
      const copied = await copyCodeToClipboard(code);
      const suffix = copied ? "已复制到剪贴板，可以手动粘贴。" : "请手动复制后粘贴。";
      setStatus(`没有找到可填充的验证码输入框。${suffix}`);
      startRefreshing({ fillPage: false });
      return;
    }

    setStatus(`已填入 ${code.length} 位验证码，将按二维码周期自动刷新。`);
    startRefreshing({ fillPage: true });
  } finally {
    scanButton.disabled = false;
  }
}

window.addEventListener("pagehide", () => {
  stopRefreshing();
  activeTabId = null;
  lastCode = "";
});

async function restoreStoredOtp() {
  const response = await browser.runtime.sendMessage({ type: "GET_ACTIVE_OTP" });
  const otp = response?.otp;

  if (!isStoredOtp(otp)) {
    setStatus("尚未识别 2FA 二维码。");
    return;
  }

  activeOtp = otp;
  activeTabId = null;
  await refreshCode({ fillPage: false });
  startRefreshing({ fillPage: false });
  setStatus("已恢复上次识别的验证码，弹窗打开期间会继续刷新。");
}

async function saveActiveOtp(otp) {
  await browser.runtime.sendMessage({ type: "SAVE_ACTIVE_OTP", otp });
}

function isStoredOtp(value) {
  return (
    value &&
    typeof value.secret === "string" &&
    Number.isInteger(value.digits) &&
    Number.isInteger(value.period) &&
    typeof value.algorithm === "string"
  );
}

function startRefreshing({ fillPage }) {
  stopRefreshing();
  refreshTimerId = window.setInterval(() => {
    refreshCode({ fillPage }).catch((error) => {
      setStatus(error.message || "刷新验证码失败。");
      stopRefreshing();
    });
  }, 500);
}

function stopRefreshing() {
  if (refreshTimerId) {
    window.clearInterval(refreshTimerId);
    refreshTimerId = 0;
  }

  lastCounter = -1;
}

async function refreshCode({ fillPage }) {
  if (!activeOtp) {
    throw new Error("还没有识别到 2FA 二维码。");
  }

  const now = Date.now();
  const counter = Math.floor(now / 1000 / activeOtp.period);
  const secondsLeft = activeOtp.period - (Math.floor(now / 1000) % activeOtp.period);

  if (counter !== lastCounter) {
    lastCode = await generateTotp(activeOtp, counter);
    lastCounter = counter;
    showCode(lastCode, `${secondsLeft}s 后刷新`);

    if (fillPage && activeTabId) {
      await fillCodeInPage(activeTabId, lastCode).catch(() => null);
    }
  } else {
    showCode(lastCode, `${secondsLeft}s 后刷新`);
  }

  return lastCode;
}

async function injectContentScript(tabId) {
  try {
    await browser.tabs.executeScript(tabId, {
      allFrames: true,
      file: "/content.js"
    });
  } catch (_error) {
    await browser.tabs.executeScript(tabId, {
      file: "/content.js"
    });
  }
}

async function fillCodeInPage(tabId, code) {
  if (!/^\d{4,10}$/.test(code)) {
    return { ok: false, reason: "验证码格式异常。" };
  }

  const escapedCode = JSON.stringify(code);
  const script = `
    typeof globalThis.ephemeral2faFillCode === "function"
      ? globalThis.ephemeral2faFillCode(${escapedCode})
      : { ok: false, reason: "填充脚本未加载。" };
  `;

  try {
    const results = await browser.tabs.executeScript(tabId, {
      allFrames: true,
      code: script
    });
    return results.find((result) => result?.ok) ?? { ok: false };
  } catch (_error) {
    const results = await browser.tabs.executeScript(tabId, { code: script });
    return results.find((result) => result?.ok) ?? { ok: false };
  }
}

async function copyCodeToClipboard(code) {
  try {
    await navigator.clipboard.writeText(code);
    return true;
  } catch (_error) {
    const input = document.createElement("input");
    input.value = code;
    document.body.append(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    return copied;
  }
}

async function detectQrFromDataUrl(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  if ("BarcodeDetector" in globalThis) {
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    const results = await detector.detect(image);
    const qr = results.find((item) => typeof item.rawValue === "string" && item.rawValue.trim());

    if (qr) {
      return qr.rawValue.trim();
    }
  }

  if (typeof jsQR !== "function") {
    throw new Error("备用二维码解码器未加载。");
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  context.drawImage(image, 0, 0);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const qr = jsQR(imageData.data, imageData.width, imageData.height);

  if (!qr?.data) {
    throw new Error("当前可见区域没有识别到二维码，请确认二维码完整显示在屏幕内。");
  }

  return qr.data.trim();
}

function parseOtpAuthUrl(rawValue) {
  if (!rawValue.startsWith("otpauth://")) {
    throw new Error("识别到的二维码不是 otpauth 2FA 二维码。");
  }

  const url = new URL(rawValue);
  if (url.protocol !== "otpauth:" || url.hostname.toLowerCase() !== "totp") {
    throw new Error("当前只支持 TOTP 类型的 2FA 二维码。");
  }

  const secret = url.searchParams.get("secret")?.replace(/\s+/g, "");
  if (!secret) {
    throw new Error("二维码中没有找到 secret 参数。");
  }

  const digits = parseIntegerParam(url.searchParams.get("digits"), 6);
  const period = parseIntegerParam(url.searchParams.get("period"), 30);
  const algorithm = (url.searchParams.get("algorithm") || "SHA1").toUpperCase();

  if (![6, 7, 8].includes(digits)) {
    throw new Error("不支持的验证码位数。");
  }

  if (period < 10 || period > 120) {
    throw new Error("不支持的 TOTP 周期。");
  }

  if (!["SHA1", "SHA256", "SHA512"].includes(algorithm)) {
    throw new Error("不支持的 TOTP 算法。");
  }

  return { secret, digits, period, algorithm };
}

function parseIntegerParam(value, fallback) {
  if (value == null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function generateTotp({ secret, digits, period, algorithm }, counter = Math.floor(Date.now() / 1000 / period)) {
  const keyBytes = decodeBase32(secret);
  const counterBytes = counterToBytes(counter);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: { name: normalizeHashName(algorithm) } },
    false,
    ["sign"]
  );

  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, counterBytes));
  const offset = signature[signature.length - 1] & 0x0f;
  const binary =
    ((signature[offset] & 0x7f) << 24) |
    ((signature[offset + 1] & 0xff) << 16) |
    ((signature[offset + 2] & 0xff) << 8) |
    (signature[offset + 3] & 0xff);

  const modulus = 10 ** digits;
  return String(binary % modulus).padStart(digits, "0");
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/=+$/g, "");
  const bytes = [];
  let bits = 0;
  let bitCount = 0;

  for (const char of normalized) {
    const index = alphabet.indexOf(char);
    if (index === -1) {
      throw new Error("secret 不是有效的 Base32 格式。");
    }

    bits = (bits << 5) | index;
    bitCount += 5;

    if (bitCount >= 8) {
      bytes.push((bits >>> (bitCount - 8)) & 0xff);
      bitCount -= 8;
    }
  }

  if (bytes.length === 0) {
    throw new Error("secret 为空。");
  }

  return new Uint8Array(bytes);
}

function counterToBytes(counter) {
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;

  view.setUint32(0, high, false);
  view.setUint32(4, low, false);
  return bytes;
}

function normalizeHashName(algorithm) {
  return algorithm.replace(/^SHA(\d+)$/, "SHA-$1");
}

function setStatus(message) {
  statusNode.textContent = message;
}

function showCode(code, timeText) {
  codeValue.textContent = code;
  timeValue.textContent = timeText;
  codePanel.hidden = !code;
}
