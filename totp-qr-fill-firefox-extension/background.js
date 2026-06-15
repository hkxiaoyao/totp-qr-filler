let activeOtp = null;

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "SAVE_ACTIVE_OTP") {
    activeOtp = message.otp;
    return Promise.resolve({ ok: true });
  }

  if (message?.type === "GET_ACTIVE_OTP") {
    return Promise.resolve({ ok: true, otp: activeOtp });
  }

  if (message?.type === "CLEAR_ACTIVE_OTP") {
    activeOtp = null;
    return Promise.resolve({ ok: true });
  }

  return false;
});
