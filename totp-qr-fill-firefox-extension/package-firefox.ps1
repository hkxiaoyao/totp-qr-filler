Compress-Archive -Path @(
  "manifest.json",
  "background.js",
  "content.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "vendor"
) -DestinationPath "..\totp-qr-fill-firefox-extension.zip" -Force
