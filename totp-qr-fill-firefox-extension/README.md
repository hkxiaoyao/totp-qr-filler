# Ephemeral 2FA QR Filler for Firefox

Firefox 专用 WebExtension 版本：点击按钮后识别当前可见页面里的 `otpauth://totp/...` 二维码，计算 TOTP 验证码，并填入页面中的验证码输入框。

## 特性

- 使用 Firefox MV2 持久 background 脚本，在当前浏览器会话内用内存保留 2FA secret
- 关闭弹窗后不丢，重新打开弹窗会继续刷新验证码
- 识别到新的二维码后覆盖旧参数
- 关闭 Firefox 后清除
- 不上传二维码内容
- 不自动提交表单
- 在 manifest 中声明 `data_collection_permissions.required: ["none"]`
- 使用本地 `jsQR` 备用解码器
- 支持单个验证码输入框和常见的多格验证码输入框

## 临时安装

1. 打开 `about:debugging#/runtime/this-firefox`
2. 点击“临时载入附加组件”
3. 选择本目录中的 `manifest.json`

目录：`totp-qr-fill-firefox-extension`

不要在 `about:addons` 里直接安装本地 zip/xpi。Firefox 正式版会拦截未签名扩展，并提示“此附加组件无法安装，因为它未通过验证”。

## 长期安装

Firefox 正式版需要 Mozilla 签名后才能长期安装。可选方式：

- 上传到 addons.mozilla.org，选择 listed 或 unlisted 签名
- 使用 Firefox Developer Edition / Nightly / ESR，并在 `about:config` 中关闭 `xpinstall.signatures.required`

本目录里的 zip 只适合后续签名或分发准备，不适合直接拖到 `about:addons` 安装。

## 使用

1. 打开包含 2FA 二维码和验证码输入框的页面
2. 确保二维码完整显示在当前可见区域
3. 如果页面输入框比较特殊，先点击验证码输入框让光标停在那里
4. 点击 Firefox 工具栏中的插件图标
5. 点击“识别并填充”

如果没有找到可填充的输入框，插件会显示当前验证码，并尽量复制到剪贴板，方便手动粘贴。

## 第三方代码

- `vendor/jsQR.js` 来自 `jsqr@1.4.0`，Apache-2.0 license
